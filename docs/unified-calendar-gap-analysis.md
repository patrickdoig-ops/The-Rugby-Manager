# Unified Calendar — Gap Analysis & Remaining-Work Plan

> **Companion to** `docs/unified-calendar-plan.md` (the original 7-commit design).
> **Purpose:** establish the *true* current state of the unified-calendar migration
> (commits 1–3 landed, 4–6 did not), reconcile three docs that currently disagree
> about that state, and scope the remaining work against the code as it stands today.
> **Authored:** 2026-06 from a full code read. Docs-only — no build/verify/version impact.

---

## 1. The one-line truth

The Hub *presents* a single unified "Continue" cycle, but underneath the engine is
still **league-spine-with-cup-and-Europe-bolted-on**. The four competitions never
share a persisted fixture list, a single calendar cursor, or one set of weekly
season passes. A `CalendarBlock` abstraction exists and is wired into the Hub CTA,
but the driver **dispatches by competition priority** rather than playing a block as
one unit, and the weekly season logic is still welded to the league record path.

---

## 2. Reconciling the three docs (do this first — it's the cheapest fix)

Three docs describe the same half-finished migration from three different moments,
and a reader can't tell what's true. Correct these in one docs-only commit:

| Doc | Current claim | Reality | Fix |
|---|---|---|---|
| `docs/unified-calendar-plan.md:3` | "Status: **design plan, not yet implemented**" | Commits 1–3 landed | Change to "Commits 1–3 landed; 4–6 outstanding — see `unified-calendar-gap-analysis.md`." |
| `docs/game-engine.md:19` | Calendar-block surface "**not yet wired to UI** (Stage 2)" | `getNextBlock` drives `onContinue`/`playBlock`; `simRestOfBlock` is built but **unused** | Reword: block surface is wired into the Hub CTA preview + `playBlock` dispatch; `simRestOfBlock` exists but is not yet on the driver path. |
| `docs/league-cup.md:124` | "**Since the unified calendar landed**, the cup is driven one date-clustered block per Continue" | True for the cup *branch*, but it implies the whole migration is done | Qualify: the cup is reached through the unified `onContinue`→`playBlock` dispatch, but blocks are still played one-competition-at-a-time. |

No code or behaviour changes; just stop the docs lying about completeness.

---

## 3. What actually landed (commits 1–3)

- **Block primitives (pure).** `src/game/blockFixture.ts` (`BlockFixtureRef` union) +
  `src/game/calendarBlocks.ts` (`collectUnplayed` at `:28`, `nextBlock` at `:115`) +
  `BLOCK_GAP_DAYS` in `balance/season.ts`. `collectUnplayed` scans all four state
  slices and returns one date-sorted list — the integrated view is **derived, not
  persisted** (the design's preferred outcome; no new save field needed).
- **GameCoordinator surface.** `getNextBlock()` (`GameCoordinator.ts:1514`) and
  `simRestOfBlock()` (`:1524`). `getNextBlock` is live; **`simRestOfBlock` is dead
  code** — `grep` finds only its definition + comments, nothing calls it.
- **Single Hub CTA.** `HubScreen.ts:288` is one "Continue" button → `onContinue`.
  The four per-competition CTAs are gone from the UI surface.
- **`onContinue` dispatcher.** `main.ts:1378` uses `getNextBlock()` to preview the
  next block and to detect season end, then calls `playBlock`.

---

## 4. The gap — three concrete shortfalls

### 4.1 The driver dispatches by priority; it does not play a block

`playBlock` (`main.ts:1418`) does **first-competition-wins** dispatch:

```
if (block has any cup)      → runCupBlock              (return)
if (block has any european) → maybePlayEuropeanFixture (return)
if (block has any playoff)  → runPlayoffWeek           (return)
else                        → league fixture
```

Each branch then runs that competition's **legacy** results→training→Hub tail. So a
genuinely mixed block (e.g. a midweek European fixture clustered with a weekend
league round inside `BLOCK_GAP_DAYS`) plays only the highest-priority competition;
the remaining fixtures in that block are left unplayed and re-surface as a *separate*
block on the next Continue. **The cross-competition clustering is decorative for the
driver.** Plan §5.3 (mixed-block stacked-results sequencer, commit 4) was never built.

### 4.2 `simRestOfBlock` is built but bypassed

The driver sims AI fixtures via the per-competition methods inside each legacy branch
(`simCupBlock`, `advanceEuropeanCompetitions`, `simulatePendingPlayoffMatches`, and
the league's own `simLeagueRound`). The unified `simRestOfBlock` (which already
sequences all four in a stable order) sits unused. Either it becomes the driver's
sim entry point (commit 4) or it should be deleted as misleading dead code.

### 4.3 Weekly season passes are welded to the league record path

This is the deep one (plan §5.4, Stage B — not done). The full weekly-pass set lives
inside the league's `recordPlayerMatchResult` (`GameCoordinator.ts:1240–1313`), keyed
to `WEEK_ADVANCED`:

1. `simLeagueRound` (rest of round)
2. `PLAYER_SUSPENDED` yellow-card-ban check (`:1250`)
3. `reconcileRestObligations` (`:1264`)
4. `WEEK_ADVANCED` (`:1268`)
5. **`advanceEuropeanCompetitions`** (`:1271`) — AI European progression
6. morale decay × `moraleWeeks` (`:1282`)
7. `checkTransferRequestsAndPromises` (`:1287`)
8. `advanceScoutingAccuracy` × `recoveryWeeks` (`:1288`)
9. `updatePoachThreats` (`:1295`)
10. `runAIEarlyRenewals` cadence (`:1301`)
11. playoff bracket seeding (`:1311`)

The cup record path bumps the calendar with `MATCHDAY_ADVANCED` (date-only, **none**
of the above) and deliberately skips `collectSeasonEvents`; the European path runs a
narrower subset. Season-scope progression is therefore *structured* around the league
round rather than the calendar week.

> **Investigation correction (2026-06).** An earlier draft of this section claimed
> "AI European fixtures only progress when a league round is recorded." That is
> **wrong** — `recordPlayerEuropeanPoolResult` (`GameCoordinator.ts:1078`) and
> `recordPlayerEuropeanKnockoutResult` (`:1115`) each call
> `advanceEuropeanCompetitions()` themselves, so AI European progression advances on
> the European-record path too; the league-tick call at `:1271` is a redundant
> catch-up. More broadly, the weekly passes that *could* starve across a break are
> already **gap-scaled**: `recoveryWeeks = upcomingGap(state).weeks` (`:1174`) spans
> the full gap from the player's previous league match to this one (including the
> break + cup weeks), and injury ticks, morale decay, and scouting accuracy each loop
> `× recoveryWeeks`. So the elapsed break weeks are accounted for — retroactively
> batched at the next league round. **The league-spine coupling is benign in
> practice**; the migration is an architectural-cleanliness change, not a bug fix.
> See §6 for what this means for commits 4–5.

---

## 5. The `calendar.week` overloading audit (prerequisite for commit 5)

`calendar.week` doubles as **(i)** the league-round index and **(ii)** the weekly
tick. Stage B wants a monotonic week counter — but only some reads mean "weeks
elapsed". Splitting them is the single biggest correctness risk. Every current read,
categorised:

> **CORRECTION (F-2 step 3, 2026-06).** The original split below mislabelled most
> deadlines as Category B ("re-base onto the monotonic week"). That was **wrong**:
> almost every deadline in this codebase is a **LEAGUE-ROUND** concept (it gates match
> selection / availability / per-round cadence), so it migrates to `leagueRound(state)`
> (Category A), NOT the monotonic week. Only genuinely week-or-time-based reads and
> RNG-seed/id reads stay on `calendar.week`. The tables below reflect the reclassification
> as implemented in step 3.

### Category A — "league round N" reads → `leagueRound(state)` (`src/game/leagueRound.ts` = player's completed league rounds + 1)

| Site | Use | Migrated in |
|---|---|---|
| `LeagueMenuScreen.ts`, `LeagueTableScreen.ts`, `trainingCalendar.ts`, several `inbox.ts` | progress bar, run-in, rounds-left, owner/block reports | step 2 |
| `GameCoordinator.recordPlayerMatchResult` suspension set (`round + 1`); `inbox.ts` + `selectionUnavailableIds`/`isSuspended` reads | yellow-card ban — next **league round** | step 3 |
| `GameCoordinator.counselPlayer` (`leagueRound + DISCIPLINE_COUNSEL.durationRounds`); `inbox.ts`, `rosterTeamBuilder.ts` reads | discipline advice `expiresAfterRound` — N **rounds** | step 3 |
| `TransferCoordinator.makePlayingTimePromise` (`leagueRound + windowRounds`); `TransferCoordinator.checkTransferRequestsAndPromises` + `inbox.ts` reads | playing-time promise `toRound` — N **rounds** | step 3 |
| `TransferCoordinator` loan set-sites | loan `fromRound` — a round stamp (never read as a deadline, migrated for consistency) | step 3 |
| `applySeasonEvent` `formReturn.round` set (`PLAYER_RECOVERED`/`PLAYER_RETURNED_FROM_DUTY`); `playerForm.computeFormInputs` read | injury/intl-return rustiness fades over **league rounds** | step 3 |
| `internationalDutyEngine` `isInternationalBreak`, `mustRestThisRound`, `selectionUnavailableIds`, `reconcileRestObligations` (now takes an explicit `round` param); `lionsReturnRound` + rest-obligation reads in `trainingWeek.ts`, `SquadManagementScreen.ts`, `PreMatchScreen.ts`, `inbox.ts`; `InternationalBreakCoordinator.upcomingLeagueDate` | "available from round X" — **league rounds** | step 3 |
| `GameCoordinator.runWeeklyTick` AI early-renewal cadence (`leagueRound % N === 1`) | cadence is a **round** count | step 3 |

`reconcileRestObligations` reads at the just-played round (= `leagueRound - 1` after the
result is recorded), so it takes the explicit `round` param rather than `leagueRound(state)`.

### Category B — genuinely week/time-based reads → stay on the monotonic `calendar.week`

| Site | Use |
|---|---|
| `TransferCoordinator.ts:586,839,1037`, `midseasonSigningResolver.ts:141` (set); `:364,550,730,809,982`, `ContractsScreen.ts`, `TransferMarketScreen.ts` (read); `applySeasonEvent` `WEEK_ADVANCED` prune | midseason-rejection cooldown `weekUntilClear` (named in **weeks**, pruned in `WEEK_ADVANCED`) |
| `applySeasonEvent` `moraleNote.week` | a "when noted" timestamp — never compared as a deadline |

### Category D (unchanged) — RNG-seed / id-construction reads stay on `calendar.week`

| Site | Use |
|---|---|
| `aiTrainingDirector.ts:123–135` | `hashSeed(\`${seasonLabel}:${week}:N\`)` |
| `TransferCoordinator.ts:813,878`; `inbox.ts` `fatigue`/`intlrest` ids | offer / inbox ids — only need stable uniqueness |

### Category C — save/restore + invariant (mechanical follow-on)

| Site | Use |
|---|---|
| `GameCoordinator.ts:374` | `fromSave` replay loop `while (week < save.currentWeek)` |
| `GameCoordinator.ts:1630` | `save.currentWeek` |
| `seasonInvariants.ts:190` | `week >= 1` integer invariant |

### Category D — determinism-sensitive RNG seed inputs (must not shift)

| Site | Use |
|---|---|
| `aiTrainingDirector.ts:123–135` | `hashSeed(\`${seasonLabel}:${week}:N\`)` |
| `TransferCoordinator.ts:812` | midseason offer id `…_w${week}_…` |

If the meaning/value of `week` changes, both the AI training draws and the season
determinism baseline shift. `npm run verify` will catch this — expect to re-baseline
deliberately, and keep the weekly-pass RNG call order identical.

---

## 6. Scoped remaining commits (against today's code)

Each `src/` commit must pass `npm run build` + `npm run verify` and bump
`src/version.ts`. The doc reconciliation (commit 0) is docs-only.

**Commit 0 — Doc reconciliation (docs-only). ✅ DONE** (`83d3521`). Applied §2.

**Commit 4 — Block driver plays the block as one unit (plan §5.3). ❌ NOT NEEDED.**
Empirically dropped after a schedule check (2026-06). In the real 2025-26 calendar
every competition boundary is **≥ 5 days apart** while `BLOCK_GAP_DAYS = 3`, so
**no block is ever mixed-competition** — the cup runs inside international breaks
(no league fixtures), and the December/January/April–May European weekends each sit
5–6 days clear of the nearest league round:

| Transition | Gap |
|---|---|
| League R6 (Nov 30) → Euro R1 (Dec 5) | 5d |
| Euro R2 (Dec 14) → League R7 (Dec 19) | 5d |
| League R9 (Jan 4) → Euro R3 (Jan 9) | 5d |
| Euro R4 (Jan 18) → League R10 (Jan 23) | 5d |
| Euro QF (Apr 12) → League R13 (Apr 17) | 5d |
| League R16 (May 17) → Euro Final (May 23) | 6d |

Because every block is single-competition, `playBlock`'s priority-dispatch
(`main.ts:1418`) is **already functionally correct**, nothing is orphaned, and the
unused `simRestOfBlock` causes no bug. The stacked mixed-block sequencer (plan §5.3)
would be dead code. Building it would violate simplicity-first. (Re-evaluate only if a
year-2+ synthetic schedule is ever observed to cluster two competitions within
`BLOCK_GAP_DAYS`, or `BLOCK_GAP_DAYS` is retuned upward.)

**Commit 5 — Decouple weekly passes; split `calendar.week` (plan §5.4 Stage B). ⚠️ ARCHITECTURAL-PURITY ONLY — HIGH RISK, NO OBSERVABLE BUG.**
Per the §4.3 investigation correction, the league-spine coupling is **benign in
practice** (gap-scaled passes + self-advancing European record path). This commit
therefore buys cleaner internals, not corrected behaviour, while carrying the plan's
single largest correctness risk: splitting `calendar.week` (audit ~40 reads, §5),
extracting `runWeeklyTick`, removing `MATCHDAY_ADVANCED`, a forced determinism
re-baseline, and a `SAVE_VERSION` bump. Recommendation: **do not undertake unless the
FM-style unified internals are wanted for future extensibility** (e.g. adding a
fourth competition, or spreading weekly passes across breaks rather than batching).
If pursued, the original sketch was:
- Extract `GameCoordinator.runWeeklyTick()` containing passes 2–11 from §4.3 (i.e.
  everything after `simLeagueRound`). Call it **once per week elapsed** between blocks
  (N times for an N-week gap, mirroring `splitGapIntoPeriods`). The record methods
  keep only: record result + per-match stats + per-result effects (board, suspension
  seed, media for the human game).
- Introduce a derived `leagueRound` (the round of the next/just-played league
  fixture) for all **Category-A** reads; let `calendar.week` become the monotonic
  tick that `runWeeklyTick` increments; re-base **Category-B** offsets onto it.
- **Remove `MATCHDAY_ADVANCED`** — the cup no longer needs a date-only bump once the
  unified advance lands.
- Pull `advanceEuropeanCompetitions` (§4.3 pass 5) into `runWeeklyTick` so AI European
  progression no longer depends on a league round being recorded.
- Lean hard on `npm run verify`; re-baseline determinism **deliberately** (Category D).
- Docs: `game-engine.md` (`runWeeklyTick`, `MATCHDAY_ADVANCED` removal,
  `WEEK_ADVANCED`/`week` semantics).

**Commit 6 — Save bump.** Likely needed only if commit 5 changes the persisted meaning
of `currentWeek` (Category C) or the determinism replay path. The block itself is
derived, so no fixture-list field is added. Bump `SAVE_VERSION`, `ACCEPTED_VERSIONS`,
`MIGRATIONS[N]`, the `checkSaveSchema.ts` snapshot, and the save-format docs **only
if** the week semantics actually serialise differently.

---

## 7. Risks (unchanged from the original plan, now concrete)

- **Category-A vs B split is the crux.** Mis-classifying one read (treating a league
  round as a weekly deadline or vice-versa) is a silent correctness bug. The §5 table
  is the checklist — walk it read-by-read in commit 5.
- **Determinism baselines will move** (Category D). Plan to re-baseline, and keep the
  weekly-pass RNG call order byte-identical to today's per-round order.
- **International windows.** Today they're detected via the cup-break step machine and
  `calendar.week`; re-basing onto `calendar.date` window-crossing must not double-fire
  or skip a window (`internationalDutyEngine.ts`).
- **Knockout seeding timing.** A block must not include a knockout before both sides
  are seeded; seeding happens during `simRestOfBlock`/record, so confirm the *next*
  `getNextBlock` sees the freshly seeded match (`calendarBlocks.ts:50–91` already skips
  null-sided knockouts — verify the re-derive timing).
- **Mixed player fixtures.** Moot — §6 commit 4 shows mixed blocks never occur.

---

## 8. Commit 5 — implementation plan (for the authorised Stage B pass)

Grounded in a full code read (2026-06). Two findings reshape the original §5.4 sketch:

- **No golden hash.** `scripts/checkSeasonDeterminism.ts` asserts only run-to-run
  reproducibility + a save/load round-trip — there is **no pinned behaviour baseline**.
  So a reorg that *changes* season outcomes still passes `verify` as long as it stays
  reproducible. The Category-D "baselines will move" risk (§7) is therefore overstated;
  the real constraint is "don't introduce nondeterminism."
- **The harness is a second driver.** `checkSeasonDeterminism.ts` drives the season via
  the **legacy** methods (`getCurrentFixture`/`recordPlayerMatchResult`, `drainCupBreak`,
  `drainEuropean`, `playOutPlayoffs`), *not* the block surface. Any change to those
  methods' contract (e.g. moving weekly passes out of `recordPlayerMatchResult`) must
  update the harness in the **same commit**, or `verify` breaks.

### 8.1 The model fork (decide before coding)

The plan's headline — "make `calendar.week` a monotonic week counter, derive a separate
`leagueRound`" — forces re-basing **~40 reads** (§5), many in UI screens that **no
automated test covers** (`verify` only exercises the headless season sim). That's the
real silent-regression surface. Two ways to land Stage B:

- **Option F-1 — `runWeeklyTick` extraction only (recommended; low risk).** Extract the
  weekly-pass set into `GameCoordinator.runWeeklyTick(weeks)` and have *every*
  competition's record path (and the harness) call it for the weeks it advances —
  making the passes genuinely competition-agnostic. **Leave `calendar.week` meaning
  "the league-round cursor"** (Category-A reads untouched). Deadlines (Category B) stay
  round-based — which the existing code comment says is *intended* for transfer/poach.
  Delivers the architectural goal (one competition-agnostic weekly seam) at a fraction
  of the risk; no ~40-read audit, likely **no `SAVE_VERSION` bump** (no field semantics
  change).
- **Option F-2 — full monotonic-week split (plan §5.4 as written; high risk).** Adds the
  `calendar.week` → monotonic + derived `leagueRound` split on top of F-1, re-basing all
  Category-A/B reads and bumping `SAVE_VERSION`. Only worth it if break weeks *must* tick
  the round-based deadlines (a behaviour the team previously chose **against**).

### 8.2 Ordered sub-steps (each builds + `verify`s green; version-bump each)

1. **Extract `runWeeklyTick(weeks)` (pure relocation).** Move `recordPlayerMatchResult`
   lines ~1268–1303 (WEEK_ADVANCED + `advanceEuropeanCompetitions` + morale×`weeks` +
   transfer/promise check + scouting×`weeks` + `game:weekAdvanced` + poach + AI-renewal
   cadence) into a new `async runWeeklyTick(recoveryWeeks)`. Call it from
   `recordPlayerMatchResult` with the same `recoveryWeeks` — **behaviour-identical**.
2. **Route cup/European/playoff record paths through `runWeeklyTick`.** Replace each
   path's `MATCHDAY_ADVANCED` (date-only) with a `runWeeklyTick(weeksAdvanced)` call so
   the weekly passes fire on those weeks too. **This is the behavioural integration** —
   season outcomes shift (still reproducible → `verify` green). Update
   `checkSeasonDeterminism.ts`'s `drainCupBreak`/`drainEuropean` in the same commit.
3. **Remove `MATCHDAY_ADVANCED`** once no caller remains (the union's `never` check
   enforces completeness). Update `applySeasonEvent` + `docs/game-engine.md`.
4. **(F-2 only) Split `calendar.week`.** Introduce derived `leagueRound`; re-base
   Category-A reads (§5) to it; make `week` monotonic; re-base Category-B offsets;
   `SAVE_VERSION` bump + `checkSaveSchema` snapshot + migration. Walk §5 read-by-read.

> **STATUS (F-2):** step 1 (`runWeeklyTick` extraction) ✅ · step 2 (`leagueRound`
> helper + display/scheduling reads) ✅ · step 3 (monotonic `calendar.week` +
> deadline reads migrated to `leagueRound`) ✅ · **step 4 (elapsed-week passes made
> competition-agnostic) ✅** — the weekly passes are split into two seams:
> **`tickElapsedWeeks(toDate)`** (the *elapsed-week* set — `WEEK_ADVANCED { weeks }`
> where `weeks = round(daysBetween(currentDate, toDate)/7)`, min 1; `advanceEuropeanCompetitions`;
> morale decay × weeks; scouting × weeks; `game:weekAdvanced`) is now called from EVERY
> competition's advance — `runWeeklyTick` (league) and `advanceMatchdayCalendar` (cup /
> European / playoff matchdays) — so each elapsed week ticks exactly once as it passes,
> no longer batched at the next league round. The **round-based passes**
> (transfer-request/promise checks, poach threats, AI early-renewal cadence, playoff
> seeding) stay in `runWeeklyTick` / `recordPlayerMatchResult`, keyed to league rounds,
> because their streak edges / cadence counters are per-league-round and would misfire if
> looped per calendar week or re-run on every cup matchday during a break. The
> **injury-recovery tick stays league-only** (full prev→this gap) + playoff-only (1 week);
> the elapsed-week seam does NOT touch injuries, so there is no double-heal.
>
> **H1 fix (post-audit).** Step 4's first cut had `runWeeklyTick` re-home the cursor
> straight to the next *league* round (`earliestDateForRound(leagueRound)`), which during
> an international break jumped the cursor PAST the whole break before its cup/European
> matchdays were played. Each break matchday then called `advanceMatchdayCalendar` with the
> cursor already parked ahead of it, moving it backward and (via the `days <= 0 → weeks:1`
> floor) ticking a phantom extra week of `WEEK_ADVANCED` + morale + scouting. An audit over
> a real 2025-26 season measured `calendar.week = 61` vs a true calendar span of ≈38, plus
> 6 backward cursor jumps. Two changes make the cursor **forward-only** and stop it jumping
> the break: (1) `tickElapsedWeeks(toDate)` ticks 0 weeks AND leaves `calendar.date`
> untouched when `toDate <= calendar.date` (only a strictly-later `toDate` advances and
> ticks); (2) `runWeeklyTick` advances only to `getNextBlock()?.startDate` (the next
> unplayed block across ALL competitions — the first break matchday during a break, the
> next league round otherwise; the block date exists even on a player bye), falling back to
> `earliestDateForRound(leagueRound)` then `+1 week`. Re-instrumented over the same season:
> `calendar.week = 37` (= `round(daysBetween(firstLeagueFixture, lastLeagueFixture)/7)+1`),
> 0 backward jumps — the per-season increments now sum to the true calendar span with no
> week double-counted and none skipped, including across breaks and on byes.
>
> Save shape unchanged (**no `SAVE_VERSION`
> bump**); career determinism re-baselined (reproducible + round-trip), silent-scores
> golden + save-schema green. The harness (`checkSeasonDeterminism.ts`) drives European +
> playoff matchdays through `advanceMatchdayCalendar` in lockstep. Step 5 removes
> `MATCHDAY_ADVANCED`.
5. **Docs + version bump.** `game-engine.md` (`runWeeklyTick`, `MATCHDAY_ADVANCED`
   removal), `league-cup.md`, `european-cups-2025-26.md`, `helpContent.ts` if any
   surfaced control changed.

> Sub-steps 1–3 (F-1) achieve the "competition-agnostic weekly seam" the whole migration
> was about. Sub-step 4 (F-2) is the high-risk tail that buys only round-deadline-during-
> breaks — recommended to defer unless explicitly wanted.
