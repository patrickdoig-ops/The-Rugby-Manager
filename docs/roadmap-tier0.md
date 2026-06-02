# Tier 0 — Detailed Roadmap: "The 1.0 of the Manager Fantasy"

Detailed implementation plan for the four Tier 0 features from `docs/roadmap.md`.
Together they form one coherent, shippable release that fixes the game's two
biggest gaps — **stakes** and **presentation** — and lay the foundations every
later tier builds on (morale unlocks transfer requests and press; the 2D pitch
unlocks highlights).

This is grounded in the existing code seams (file:line references throughout) so
it can go straight to design/build. It is a plan, not a spec — exact balance
numbers are starting points to be tuned against the telemetry harness.

## Contents

- [Dependency graph & sequencing](#dependency-graph--sequencing)
- [0.1 Board expectations + job security](#01-board-expectations--job-security)
- [0.2 Player morale](#02-player-morale)
- [0.3 Pre-match + half-time team talks](#03-pre-match--half-time-team-talks)
- [0.4 2D pitch view](#04-2d-pitch-view)
- [Cross-cutting: save, determinism, docs](#cross-cutting-save-determinism-docs)

---

## Dependency graph & sequencing

```
0.2 Player morale ──┬─► 0.3 Team talks (morale is the resource talks spend/build)
                    └─► 0.1 Board confidence (player unrest feeds owner mood)

0.1 Board expectations ──► (standalone; builds on existing boardAmbition)

0.4 2D pitch view ──► (standalone; pure UI over displaySnapshot)
```

**Recommended build order:**

1. **0.4 (2D pitch)** first — it is the only item with **zero engine/season-state
   risk** (pure UI over the existing `displaySnapshot`), so it can ship
   independently and immediately improves first impressions while the stateful
   systems are designed.
2. **0.2 (morale)** next — it is the foundational state that 0.3 and part of 0.1
   read.
3. **0.3 (team talks)** — small, sits on top of 0.2.
4. **0.1 (board + job security)** — largest behavioural change; lands last so it
   can read morale and so its sacking fail-state is tuned against a stable base.

Each is independently shippable; the order minimises rework.

---

## 0.1 Board expectations + job security

**Effort: M.** The missing career fail-state. Turns the board from flavour text
into a system with a confidence meter and a real risk of the sack.

### What already exists (build on, don't reinvent)

- A per-team **`boardAmbition: 'title' | 'playoffs' | 'topHalf'`** field is already
  authored and read for messaging.
- The inbox already generates **week-1 season objectives** (`inbox.ts:460-530`,
  priority 90) and a **mid-season "block report"** at rounds 6 & 11
  (`inbox.ts:532-621`, priority 120), both keyed off `boardAmbition`, league
  position, recent form, and attendance.
- Owner budgets already adjust by final league position + playoff/title bonuses in
  `budgetPlanner.ts` (`computeBudgetEvents`), and the season archive
  (`state.career.archive`) stores final standings + champion per season.

**The gap:** all of the above is *derived flavour* — there is no persistent
confidence value, no threshold, and finishing 9th has no consequence. 0.1 adds the
**stateful spine** the messaging already implies.

### Design

**Board confidence (0–100), per player-club, persistent in the save.**

- Seeded at season start from `boardAmbition` and prior finish (e.g. champion
  defending → starts ~70; a club that finished below ambition → starts ~45).
- Moves on discrete triggers, not every tick:
  - **Per result:** win vs expectation-adjusted opponent +Δ, loss −Δ, scaled by
    whether you were favourite (use existing standings/budget gap as a proxy).
  - **Streaks:** a 3+ losing run (already detected for the inbox "form collapse"
    message, `inbox.ts:226-241`) applies an extra penalty.
  - **Milestones:** reaching/missing the ambition target (top-2/top-4/top-half),
    winning silverware (playoff final, Prem Cup), a derby result.
  - **Off-pitch:** poor home attendance (already computed, `inbox.ts:547-562`);
    losing a key player to a poach; (later) squad morale collapse from 0.2.
- **Season-objective contract:** at season start the board sets a *minimum*
  objective from `boardAmbition`. Finishing below it at season end is the primary
  end-of-season judgement.

**Job security / the fail-state.**

- A confidence **sacking threshold** (e.g. <15 sustained for N rounds, or finishing
  far below objective). Below it, the board issues a **final warning** inbox item
  (CTA-bearing), then sacks.
- On sacking: surface an end screen; offer **continue as another club** (if a
  vacancy exists) or end the save — design decision flagged below.
- A "vote of confidence" / "board backing" message at recovery thresholds for the
  positive direction.

### Data model

In `gameState.ts`, add a per-club board state. Two viable homes (decide at design):

- On `CareerState` (per-club, mirrors `clubs[].salaryBudget`): a
  `boardConfidenceByClub: Record<string, number>` plus the active
  `seasonObjective`. Preferred — confidence is a club property and survives if
  managing multiple clubs over a career.
- Minimal alternative: a single `board: { confidence: number; objective: ... }` on
  the `player` slice since only the managed club has a board you answer to.

```ts
interface BoardState {
  confidence: number;          // 0–100
  objective: BoardAmbition;    // reuse the existing union
  warningIssued: boolean;      // final-warning latch for this season
}
```

### Events (`SeasonEvent` union, `gameState.ts` + `applySeasonEvent.ts`)

Add variants (exhaustive `default: never` will flag missing branches):

- `BOARD_STATE_SEEDED` — set objective + initial confidence at season start /
  rollover.
- `BOARD_CONFIDENCE_ADJUSTED` — `{ delta: number; reason: string }`, clamp 0–100.
- `MANAGER_SACKED` / `MANAGER_WARNED` — flip latch / terminal state.

Emit points:
- **Season start / rollover:** `careerRollover.ts` `computeRollover` already runs
  at the season boundary — seed `BOARD_STATE_SEEDED` there.
- **Per result:** `GameCoordinator` already records fixtures via
  `FIXTURE_RESULT_RECORDED`; compute the confidence delta in the same flow and emit
  `BOARD_CONFIDENCE_ADJUSTED`.
- **Mid-season / end-of-season judgement:** evaluate against objective at the block
  rounds and at `game:seasonComplete`.

### Invariants (`seasonInvariants.ts`)

Add a bounded check mirroring the `condition` 0–100 pattern (`seasonInvariants.ts:58-60`):

```ts
if (!(board.confidence >= 0) || !(board.confidence <= 100))
  fail('board.confidence', `${board.confidence}`);
```

### UI

- **Hub:** a board-confidence pill/indicator (reuse the cap-pill visual language).
- **Inbox:** upgrade the existing owner messages (`inbox.ts:460-621`) to read the
  new confidence value and add the **final-warning** and **sacking** items with
  CTAs. These slot in via `items.push({...})` before the sort
  (`inbox.ts:697`).
- **End of season:** `EndOfSeasonScreen` shows objective met/missed and the board's
  verdict; sacking branch on failure.

### Balance (`src/engine/balance/`)

New file `board.ts` (barrel-exported): seed values per ambition, per-result deltas,
streak penalty, sacking threshold + grace rounds, recovery thresholds. No tuning
literals in the inbox/coordinator.

### Determinism

If any roll is involved (e.g. a sacking "patience" jitter), use the **career RNG
stream** (`rngTransfer`, reset by `setCareerSeed`) so it can't perturb match
outcomes. Prefer making confidence fully deterministic from results where possible.

### Build milestones

1. State + events + invariants + seeding at rollover (no behaviour yet; confidence
   visible on Hub).
2. Per-result confidence deltas + balance file; tune against telemetry.
3. End-of-season objective judgement.
4. Final-warning + sacking fail-state + end screen.

### Open questions (need a product decision)

- **After a sacking:** for this tier, surface an end screen and end the save (or
  offer a restart). The full manager carousel — applying for vacancies, track-record
  reputation, job availability — is a Tier 4 feature (roadmap §4.1) that needs
  the broader world-depth foundation.
- **Multi-club careers:** does confidence reset fully on changing clubs?
- Difficulty: should there be a "no sacking" / chairman-patience setting for casual
  players (ties into the Tier 3 difficulty item)?

### Acceptance criteria

- A losing season visibly drains confidence and can end in a sack with clear
  warning beforehand.
- A title-defence club and a relegation-equivalent club start at different
  confidence and have different objectives.
- `npm run build` + `npm run verify` green; determinism harness unaffected.

---

## 0.2 Player morale

**Effort: M.** Foundational dressing-room state. Drives match form, unlocks team
talks (0.3), and later transfer requests (Tier 1.5) and press reactions (1.4).

### What already exists

- Players have **`condition` (0–100)** but no morale/happiness.
- The per-match **form modifier** is built deterministically from recent ratings,
  condition, return-rustiness, age, and marquee status in
  `playerForm.ts` (`computeFormInputs → { bias, volatility }`), threaded onto the
  raw player in `rosterTeamBuilder.ts:145-167` (`formBias`/`formVolatility`), then
  turned into a single integer form offset in `MatchCoordinator.initPlayer`
  (`MatchCoordinator.ts:101-133`) using one `rngFormRaw()` draw and applied to the
  baseStats clone.

**The gap:** there is no persistent happiness that responds to playing time,
results, contract status, or squad role — and nothing for the manager to manage.

### Design

**Morale (0–100) per roster player, persistent in the save.** Moves on discrete
season events, decays gently toward a baseline:

- **Playing time vs expectation** — a star who isn't starting drops; a youngster
  getting games rises. Use squad role / rating rank vs appearances.
- **Results** — team wins/losses nudge the whole squad; individual standout
  performances (high match rating) lift the player.
- **Contract** — entering the final year unhappy, being poached, a renewal, or
  being made marquee.
- **(Later)** team-talk outcomes (0.3) and transfer-request resolution (1.5).

**Feeds match form.** Add a morale term to `computeFormInputs` (`playerForm.ts`):
morale above/below baseline shifts `bias` by a clamped amount (e.g. ±3), so an
unhappy player measurably underperforms and a flying one overperforms — without
touching the engine's form-application code.

### Data model

Per-player morale lives next to `condition` on the roster player
(`state.career.roster[rosterId]`). Add `morale: number` (0–100).

### Events

- `PLAYER_MORALE_ADJUSTED` — `{ rosterId, delta, reason }`, clamp 0–100.
- Seed at roster creation / signing (`ROSTER_SEEDED`, `CONTRACT_SIGNED`,
  `ACADEMY_GRADUATED`, `FOREIGN_IMPORT_ARRIVED` already exist — add morale defaults
  there).

Emit points: weekly in `trainingWeek`/`WEEK_ADVANCED` flow (playing-time +
decay-to-baseline), on fixture results, and on contract events.

### Invariants

Bounded 0–100 check per roster player, identical pattern to `condition`
(`seasonInvariants.ts:58-60`).

### UI

- **Squad screens** (`SquadManagementScreen`, `PlayerProfileScreen`): a morale
  indicator (icon/colour, not a raw number, to match the game's tone).
- **Inbox:** "unhappy player" items (reuse the `counselAction` CTA already used for
  discipline, `inbox.ts:24-25, 206, 220`).

### Balance (`src/engine/balance/`)

New `morale.ts`: baseline, decay rate, per-event deltas, the form-bias mapping
(morale → ±form), thresholds for "happy/unhappy/unsettled" bands.

### Determinism

Morale should be **deterministic** from season events (no RNG) where possible; if
any jitter is wanted, use the career stream. The form-bias contribution must remain
in the deterministic `computeFormInputs` half — the engine's single `rngFormRaw()`
draw stays untouched, preserving match determinism.

### Build milestones

1. State + `PLAYER_MORALE_ADJUSTED` + invariants + seeding defaults (visible on
   squad screen, no effects yet).
2. Weekly/result/contract adjusters + decay + balance file.
3. Wire morale → `computeFormInputs` bias term.
4. Inbox "unhappy player" surfacing.

### Acceptance criteria

- Benching a star for several rounds drops their morale and measurably their form;
  it recovers with game time.
- Morale stays within 0–100 across a multi-season career (invariant never throws).
- Match determinism unchanged (verify harness green) — morale only shifts the
  deterministic form bias.

---

## 0.3 Pre-match + half-time team talks

**Effort: S.** The cheapest "I'm the manager" moment in the genre. Reuses the modal
and in-match transient-modifier infrastructure.

### What already exists

- Pre-match flow with modals (`PreMatchScreen`); the match engine already has the
  modal-pause infrastructure used for penalties/subs.
- A clean **in-match transient team modifier pattern** to mirror:
  `state.breakdownMod: { attack: number; defend: number }` set via the
  `BREAKDOWN_MOD_SET` event (`applyMatchEvent.ts:307-309`), read by resolvers
  (`OpenPlayEvent.ts:106-107`), and reset on possession change. `homeEdge()` in
  `HomeAdvantage.ts:21-31` shows the `{attack, defend}` shape and the
  gated-by-engine-field pattern (`neutralVenue`).
- Half-time is already a recognised moment (`displaySnapshot.halfTimeDone`).

### Design

**Two decision points: pre-match and half-time.** Each presents a few tone options
(e.g. *Calm / Encourage / Demand more / Single out a player*) whose effect depends
on context and **player morale (0.2)** — e.g. "demand more" lifts a confident squad
but rattles a fragile one.

**Effect:** a small, decaying team-level performance modifier for the opening
period of each half, plus a small morale nudge that persists post-match (feeding
0.2). Modelled as a new transient match-state field, e.g.
`state.teamTalkMod: { home: {attack,defend}, away: {attack,defend} }`, set via a new
`TEAM_TALK_APPLIED` `MatchEvent`, read in the same resolver spots as `breakdownMod`,
and **decaying over the first ~10–15 minutes** of the half so it's an opening surge,
not a permanent buff.

### Events & mutation

- New `MatchEvent` variant `TEAM_TALK_APPLIED` (`src/types/matchEvent.ts` + one
  branch in `applyMatchEvent.ts`; the `default: never` enforces coverage). It sets
  the transient field — a structural setter, mirroring `BREAKDOWN_MOD_SET`.
- The AI side picks a talk deterministically (mirror the `AITacticalDirector`
  RNG-free approach). For the human, the choice comes from the modal.
- A post-match morale delta flows back through `PLAYER_MORALE_ADJUSTED` (0.2).

### Invariants

Extend `assertInvariants` (`src/engine/invariants.ts`) to bound the new modifier to
its legal range (mirroring how breakdownMod-style values stay in range).

### UI

- A team-talk modal at pre-match and half-time (reuse `ModalManager` /
  `SubstitutionModal` patterns). Under `silent: true` (headless AI sims) it
  short-circuits to a default, like the existing penalty/sub prompts.
- A one-line commentary note when a talk visibly fires ("the response off the
  half-time whistle has been emphatic") — reuse the `tactic_note` narration step.

### Balance

`teamTalk.ts`: per-tone modifier magnitudes, decay duration, the morale-conditioned
sign (when "demand more" helps vs backfires), post-match morale deltas.

### Determinism

No new RNG ideally; talk effects are deterministic given choice + morale. If a
small outcome jitter is wanted it must use the **outcome stream** (`rng`) so replays
stay reproducible — but prefer none.

### Build milestones

1. `TEAM_TALK_APPLIED` event + transient field + decay + invariant (no UI; AI uses
   default).
2. Wire the modifier into the same resolver reads as `breakdownMod`.
3. Human modal at pre-match + half-time.
4. Morale feedback loop (requires 0.2) + commentary note.

### Acceptance criteria

- A pre-match talk produces a measurable, decaying opening-period edge.
- Tone interacts with morale (the same talk helps a happy squad and can backfire on
  a fragile one).
- Headless AI sims and live matches both resolve a talk; verify harness green.

---

## 0.4 2D pitch view

**Effort: L (but lowest risk).** Make the rich match the engine already computes
*legible*. Pure UI — no engine or season-state change.

### What already exists (better than the summary roadmap implied)

- The display snapshot exposes **both `ballX` and `ballY`** (0–100), not just X
  (`displaySnapshot.ts:59-60`), plus `phase`, `possession`, `score`, `cards`,
  `gameMinute`, `clockInTheRed`, `halfTimeDone`, team `stats` and `aggregates`.
  `MatchState.ball` carries `{ x, y }` (`match.ts:161-164`).
- `engine:stateChange` is the redraw event every live panel already subscribes to
  (`Scoreboard`, `PitchStrip`, `StatsPanel`), carrying `{ state, display }`.
- The shell already renders a **`#pitch-field` with line markers (try/5/22/halfway)
  and a `#ball-marker`** (`AppShell.ts:33-49`); `PitchStrip.ts` currently drives it
  **1D** (sets `left: ballX%`, ignores `ballY`).
- There is a **`#view-toggle-bar`** (Dashboard/Commentary/Stats/Players,
  `AppShell.ts:51-68`) — a richer pitch can be the Dashboard's hero element or a new
  view.

**The gap:** the existing pitch strip throws away `ballY` and shows no territory,
phase build-up, or momentum.

### Design (achievable without engine changes)

A top-down pitch that, redrawing on `engine:stateChange`, shows:

- **Ball in 2D** — use both `ballX` and `ballY` (the data is already there).
- **Territory / momentum** — shade the half the play is in; a territory tug-of-war
  bar driven by `display.stats.territory`; pulse on phase changes.
- **Possession & phase** — colour the ball/zone by `possession`; label the current
  `phase`.
- **Card state** — show sin-bin/sent-off counts per side from `display.cards`.
- **Event flashes** — on `engine:event`, flash the relevant zone for tries, kicks,
  turnovers, cards (the `GameEvent` carries `ballX/ballY`).

**Explicitly out of scope (needs engine work):** per-player dots / defensive
structure — `MatchState` has no per-player coordinates (`FieldPosition.ts` is
zone-math only). A future engine task could add coarse positions; the 2D view
should be built to degrade gracefully without them.

### Implementation shape

- A new `PitchView` UI module (or an evolution of `PitchStrip`) that owns a
  `<canvas>` or SVG over the pitch area, subscribes to `engine:initialized`
  (reset), `engine:stateChange` (redraw), and `engine:event` (flashes), and reads
  team colours from `teamColors.ts` like the existing panels.
- No engine, balance, save, or determinism impact. Respect the base-relative asset
  rule (`import.meta.env.BASE_URL`) if any sprites/sounds are added.

### Build milestones — ✅ shipped

Implemented as a dedicated **5th "Pitch" view** (`src/ui/PitchView.ts`) between
Dashboard and Commentary, rendered with **SVG + CSS** (the canvas option above was
not needed). The view-toggle bar moved above the scoreboard and became icon-only so
the controls stay put while the scoreboard sheds the 1D strip in the Pitch view.

1. ✅ 2D ball plot — `ballX` drives the vertical (long) axis, `ballY` the horizontal,
   over a portrait pitch with try/22/halfway lines and end labels; ball coloured by
   possession. The 1D strip is kept for the other four views, hidden only in Pitch view
   (`body.pitch-view-active #pitch-wrapper`).
2. ✅ Territory tug-of-war bar (`display.stats.territory`) + controlling-half shading +
   phase/attacking-team/direction label tinted by `phaseClass`.
3. ✅ Per-side card pips (reusing `renderCardStack`) + event-flash highlights on
   `engine:event` for tries/penalties/cards, plus a subtler turnover flash on possession
   change. Flashes are curated (not every box-kick/lineout) to avoid strobing.
4. ✅ Wired into the view-toggle (vertical/portrait orientation, not the Dashboard hero);
   mobile + desktop layouts verified.

### Risks

- **Mobile performance** — throttle redraws to the beat (the snapshot is already
  beat-paced, so this is mostly free); avoid per-frame canvas thrash.
- **Determinism display drift** — read from `display` (the beat-synced snapshot),
  **not** live `state`, exactly as the existing panels do, so the pitch matches the
  narrated line.

### Acceptance criteria

- Ball moves in 2D and matches the commentary beat; territory/possession read at a
  glance.
- Tries/cards/kicks flash on the pitch.
- No regression to determinism or match pacing; clean on mobile + iOS shell.

---

## Cross-cutting: save, determinism, docs

- **Save schema (`SaveManager.ts`, `SAVE_VERSION = 1`):** the new season-scope
  fields (board state, player morale) are **additive optional** — older saves load
  with sensible defaults (seed confidence/morale at first read), so **no
  `SAVE_VERSION` bump** is required. If any field is made non-optional, bump the
  version and update `ACCEPTED_VERSIONS` + the four save-doc locations listed in
  `CLAUDE.md`. The 2D pitch (0.4) and team talks (0.3, match-scope transient) add
  nothing to the save.
- **RNG streams:** season-scope rolls (board, morale) use the **career stream**
  (`rngTransfer`, `setCareerSeed`); any match-scope jitter uses the **outcome
  stream** (`rng`, `setMatchSeed`). Keep morale's form contribution in the
  deterministic half of `computeFormInputs` so match determinism is preserved —
  `npm run verify` must stay green.
- **Docs to update in the same commits (per `CLAUDE.md`):**
  - New `SeasonEvent` variants → `docs/game-engine.md` § "Mutation seam".
  - New `MatchEvent` variant (`TEAM_TALK_APPLIED`) → `docs/match-engine.md`
    § "Mutation boundary".
  - New balance files → the formula/table in the relevant engine doc (with real
    numbers, not "see balance/X.ts").
  - New Hub indicator / screen behaviour → `docs/DESIGN.md` § 15.
- **Telemetry:** after morale/board land, run `npm run telemetry` to confirm the new
  form contribution hasn't skewed match balance (score lines, win rates).
