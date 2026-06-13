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
narrower subset. The most visible coupling: **AI European fixtures only progress when
a league round is recorded** (pass 5 lives on the league tick). Season-scope
progression is therefore not competition-agnostic — it depends on league rounds being
played, which is exactly what the migration set out to remove.

---

## 5. The `calendar.week` overloading audit (prerequisite for commit 5)

`calendar.week` doubles as **(i)** the league-round index and **(ii)** the weekly
tick. Stage B wants a monotonic week counter — but only some reads mean "weeks
elapsed". Splitting them is the single biggest correctness risk. Every current read,
categorised:

### Category A — genuine "league round N" reads (must stay round-based, i.e. re-derive a `leagueRound` from the next/just-played league fixture, NOT the monotonic week)

| Site | Use |
|---|---|
| `applySeasonEvent.ts:74–75` | `WEEK_ADVANCED` increment + `earliestDateForRound(week)` |
| `LeagueMenuScreen.ts:78` | season progress bar `week / totalRounds` |
| `LeagueTableScreen.ts:195,199,210,211,273` | round eyebrow, "run-in" label, rounds-left, just-completed round |
| `trainingCalendar.ts:27,65` | `nextRound` |
| `inbox.ts:208,212,666,751,835,893` | intl-rest rounds-ahead, week-1 owner message, round-6/11 block reports |

If `week` became a monotonic tick (incremented on cup/European/break weeks too),
every Category-A read silently breaks — the displayed "round" would drift past 18.
**These need a distinct `leagueRound` source derived from fixtures.**

### Category B — "deadline / weeks-elapsed" reads (safe to re-base onto the monotonic week)

| Site | Use |
|---|---|
| `GameCoordinator.ts:1254`, `inbox.ts:316,945` | suspension `forRound = week + 1` |
| `GameCoordinator.ts:468`, `inbox.ts:313`, `rosterTeamBuilder.ts:155` | discipline advice `expiresAfterRound = week + 3` |
| `TransferCoordinator.ts:1130`, `inbox.ts:290` | playing-time promise `toRound` |
| `TransferCoordinator.ts:1170,1188` | loan `fromRound` |
| `TransferCoordinator.ts:585,838,1036`, `midseasonSigningResolver.ts:141` | midseason-rejection cooldown `weekUntilClear` |
| `GameCoordinator.ts:1301` | AI early-renewal cadence `week % N` |
| `applySeasonEvent.ts:252,722`, `playerForm.ts:55` | `formReturn.round` + form lookup |
| `internationalDutyEngine.ts:65,67,296,339,361` | call-up / return round |
| `trainingWeek.ts:124`, `SquadManagementScreen.ts:191`, `inbox.ts:147` | `lionsReturnRound` comparisons |

These all mean "N weeks from now / since then". They keep working under a monotonic
week **provided the offsets are re-expressed in weeks-elapsed**, not league rounds —
audit each `+ 1` / `+ N` to confirm the unit is a week, not a round. (Today a cup or
European week doesn't bump `week`, so a promise made before a break currently counts
break weeks as zero elapsed — re-basing onto a true weekly tick **changes** these
deadlines. That's a behaviour change to accept deliberately, not a bug to preserve.)

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

**Commit 0 — Doc reconciliation (docs-only).** Apply §2. Stops the three docs lying.

**Commit 4 — Block driver plays the block as one unit (plan §5.3).**
- Rewrite `playBlock` (`main.ts:1418`) to iterate `block.fixtures` in date order:
  for each *player* fixture run the existing per-comp play/headless flow (keying the
  cup live/assistant toggle off `state.player.cupManageLive` per decision 3 — league
  + European always live); then call **`simRestOfBlock(block)`** once for the AI
  remainder (retiring the per-branch sims from the driver path).
- Add a thin **stacked-results sequencer**: for each comp in `block.competitions`
  (canonical order), chain its existing results screen (`RoundResults`+`LeagueTable`
  / `CupResults` / `EuropeanRound`·`EuropeanFinal` / `PlayoffBracket`) back-to-back,
  each "Continue" advancing to the next, before one training step. No new mega-screen.
- **Defer the weekly passes** out of the per-fixture record where they currently ride
  (see commit 5) — or, for a behaviour-preserving Stage A landing, keep the league
  record path firing them and accept that a block with a league fixture still drives
  the week. Decide explicitly; don't leave it implicit.
- Docs: `DESIGN.md` §15 (block loop + stacked results), `league-cup.md`,
  `european-cups-2025-26.md`, `helpContent.ts` Hub topic.

**Commit 5 — Decouple weekly passes; split `calendar.week` (plan §5.4 Stage B).** The delicate one. Do it isolated.
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
- **Mixed player fixtures.** If a block ever holds two player fixtures (league +
  European overlap), commit 4's loop plays them sequentially before results — confirm
  with real 2025-26 data whether this occurs at all; if not, it's untested-but-handled.
</content>
</invoke>
