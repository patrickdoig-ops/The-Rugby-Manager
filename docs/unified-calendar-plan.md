# Unified Calendar / Game Cycle — Implementation Plan

> **Status:** commits 1–3 landed (block primitives, GameCoordinator surface, single Hub CTA + `onContinue`/`playBlock` dispatch); commits 4–6 outstanding. See `docs/unified-calendar-gap-analysis.md` for the true current state and the scoped remaining work. Authored for a Sonnet implementation pass.
> **Branch:** `claude/unified-calendar-game-cycle-dkmodc`.
> **Goal:** Make the game advance like Football Manager — a single calendar-driven
> "Continue" cycle that treats every game weekend the same regardless of competition,
> instead of the league being the spine with the cup and Europe bolted on as separate flows.

---

## 1. Decisions taken (from the product owner)

These four answers are fixed and shape everything below:

1. **Block grouping = date-proximity clustering.** No new fixture authoring. A "block"
   is derived at runtime by clustering unplayed fixtures (across all competitions) that
   fall in a contiguous date window.
2. **Mixed-competition blocks are allowed.** A single block may contain fixtures from
   more than one competition. The post-block results screen must show **every relevant
   table/bracket** for the competitions present in that block (stacked).
3. **The League Cup stays special-cased.** The existing cup "manage live vs. assistant"
   toggle and the "best XV vs. rest-first-15" direction toggle survive **for cup fixtures
   only**. League and European fixtures are always played live.
4. **Require a new career.** Bump `SAVE_VERSION` and reject older in-progress saves. Do
   not attempt mid-season migration of the old per-competition cursors.

---

## 2. The target model in one paragraph

The Hub shows **one CTA: "Continue."** Pressing it asks the game engine for the **next
block** — the nearest contiguous cluster of unplayed fixtures across all competitions.
The player sees the block's **fixture list** (all games in the block, their own
highlighted). For each of the player's own fixtures in the block (in date order) they go
through the existing **pre-match → team talk → live match → match-result** flow (or, for
cup fixtures with the assistant toggle off, a headless sim). The engine then sims the rest
of the block's fixtures. A **block-results screen** shows every result in the block plus
the relevant standings/brackets for each competition present. Then **one training step**
for the coming week(s), then back to the Hub — which immediately re-surfaces "Continue"
for the next block. This single loop runs unchanged from the season opener, through
international windows, European weekends and the playoffs, into the end-of-season chain and
rollover, and out the other side into next season. A block with **no player fixture** runs
the identical loop minus the match screens (fixture list → results → training → Hub).

---

## 3. What we are replacing

The current architecture (confirmed by code read):

| Concern | Today | Problem |
|---|---|---|
| Calendar cursor | `calendar.week` (1–18) drives the league via `WEEK_ADVANCED` (`applySeasonEvent.ts:73`). | League is the spine; cup/Europe can't be first-class. |
| League next-fixture | `GameCoordinator.getCurrentFixture()` finds lowest round with no player result. | Round-coupled, not date-coupled. |
| League Cup | Separate Hub CTA → `onPlayCupStep`/`runCupStep` (`main.ts:1454–1518`), runs *inside* international breaks, advances via `MATCHDAY_ADVANCED` (date-only, runs none of the weekly passes). | Bespoke flow, different CTA, no weekly passes. |
| European Cup | Recursive **tail** `maybePlayEuropeanFixture` (`main.ts:1756–1789`) after the league post-match chain; date-gated. Hub CTA is a secondary branch. | Not a first-class step; bolted onto the league tail. |
| Hub CTA | Four different branches: playoffs / cup / European / league (`HubScreen.ts:157–165, 212, 223–236`). | Different call-to-action per competition. |
| Post-match weekly passes | Live only inside `recordPlayerMatchResult` (league path): sim-rest-of-round, `WEEK_ADVANCED`, `advanceEuropeanCompetitions`, morale decay, poach threats, transfer-request/promise checks, board, suspensions, media. Cup/European record paths run a narrower subset. | Weekly season logic is league-round-coupled and inconsistent across competitions. |
| Training | A separate training week per competition matchday (`afterMatchdayTraining`, `runCupMatchdayTraining`, `runEuropeanMatchdayTraining`). | Fragmented; multiple training-week code paths. |

The win is collapsing `onPlayCupStep` + `runCupStep` + `maybePlayEuropeanFixture` + the
league post-match chain into **one block loop**, and decoupling the weekly season passes
from the league round counter.

---

## 4. Key files (anchors for the implementer)

- **Types:** `src/types/gameState.ts` — `Calendar` (~120), `Fixture` (~39), `CupFixture`
  (~327), `EuropeanFixture` (~260), `PremCupState`, `EuropeanCompState`, `PlayoffState`,
  knockout match types.
- **Mutation seam:** `src/game/applySeasonEvent.ts` — `WEEK_ADVANCED` (~73),
  `MATCHDAY_ADVANCED` (~89).
- **Engine API:** `src/game/GameCoordinator.ts` — `recordPlayerMatchResult` (~1138),
  `getCurrentFixture` (~850), `getCurrentCupFixture`, `getCurrentEuropeanFixture` (~862),
  `advanceEuropeanCompetitions` (~1395), the cup/European record + sim methods, `rollSeason`.
- **Cup/Europe coordinators:** `src/game/InternationalBreakCoordinator.ts`,
  `src/game/EuropeanCoordinator.ts`, `src/game/cupScheduler.ts`,
  `src/game/europeanScheduler.ts`.
- **Orchestration:** `src/main.ts` — `onPlayRound` (~1354), `onMatchStart` (~1414),
  `onPlayCupStep`/`runCupStep` (~1454), `afterMatchdayTraining` (~1523), `showMatchResult`
  (~1659), `maybePlayEuropeanFixture` (~1756), `onPlayEuropeanMatch` (~1791).
- **Hub:** `src/ui/HubScreen.ts` — render + CTA branching (~111–236).
- **Screens reused as-is:** `PreMatchScreen`, `TeamTalkScreen`, `MatchResultScreen`,
  `RoundResultsScreen`, `LeagueTableScreen`, `CupResultsScreen`, `EuropeanCup/Shield/Round/Final`
  screens, `TrainingScreen`.
- **Save:** `src/ui/SaveManager.ts` — `SAVE_VERSION`, `ACCEPTED_VERSIONS`, `MIGRATIONS`;
  `scripts/checkSaveSchema.ts` pinned snapshot.

---

## 5. New / changed building blocks

### 5.1 A unified fixture reference

Introduce one discriminated union so the block loop can treat any fixture uniformly.
This generalises the existing `CupFixtureRef` / `EuropeanFixtureRef`.

```ts
// src/game/blockFixture.ts (new)
export type BlockFixtureRef =
  | { comp: 'league';   date: string; homeId: string; awayId: string; round: number }
  | { comp: 'cup';      date: string; homeId: string; awayId: string; ref: CupFixtureRef }
  | { comp: 'european'; date: string; homeId: string; awayId: string; ref: EuropeanFixtureRef }
  | { comp: 'playoff';  date: string; homeId: string; awayId: string; ref: PlayoffMatchRef };
```

Each variant carries the resolved `date`, `homeId`, `awayId` (for clustering, the fixture
list, and player-side detection) plus the competition-specific ref needed to **record the
result** via the existing per-competition `GameCoordinator` method. Knockout fixtures whose
participants aren't yet known are excluded from a block until both sides are seeded.

### 5.2 The block builder (pure)

```ts
// src/game/calendarBlocks.ts (new, pure, no RNG)
export interface CalendarBlock {
  startDate: string;
  endDate: string;
  fixtures: BlockFixtureRef[];          // all fixtures in the block, all competitions
  competitions: Array<'league'|'cup'|'european'|'playoff'>; // distinct, in display order
}

export function nextBlock(state: GameState, allTeamIds: string[]): CalendarBlock | null;
```

Algorithm:
1. Collect **all unplayed fixtures** from `league.fixtures`, `league.premCup`,
   `league.europeanCup`, `league.europeanShield`, and `league.playoffs` as `BlockFixtureRef[]`,
   each with its resolved date. Skip fixtures already having a `result`. Skip knockout
   matches with a null side.
2. Drop any fixture whose date is strictly before `calendar.date` is **not** required —
   instead, find the earliest unplayed date `D0 >= ` the season's current position. (Use
   `>= calendar.date` once the calendar is block-driven; see §5.4. On a fresh season
   `calendar.date` is the season opener so the first block is round 1 / leg 0.)
3. Sort ascending by date. Starting at the earliest, **greedily extend** the block while
   the gap between consecutive fixture dates `<= BLOCK_GAP_DAYS` (a new balance constant,
   start at `3` — groups Fri–Sun league rounds and Thu–Sun European spreads; splits a
   7-day gap into separate blocks).
4. Return the cluster. `null` when no unplayed fixtures remain (→ season is over;
   caller triggers end-of-season/rollover).

> **Tuning note:** put `BLOCK_GAP_DAYS` in `src/engine/balance/season.ts` (it's a calendar
> tuning value). Verify against the real 2025-26 data that no two *distinct* league rounds
> accidentally merge and that the December European double-headers (Dec 5–7 then Dec 12–14)
> split into two blocks. Adjust the constant if the authored dates need it.

### 5.3 Mixed blocks → stacked results

The block-results presentation must, for each competition in `block.competitions`, render
its results + its relevant table/bracket using the **existing** screens. Reuse, don't
rebuild:
- `league` → round-results grid + `LeagueTableScreen` (post-match mode).
- `cup` → `CupResultsScreen` (pool standings/leg grid; knockout bracket on the final leg).
- `european` → `EuropeanRoundScreen` / `EuropeanFinalScreen` + the pool/bracket view.
- `playoff` → `PlayoffBracketScreen`.

For a **single-competition block** (the common case) this is one screen, exactly as today.
For a mixed block, chain the per-competition results screens back-to-back (each "Continue"
advancing to the next competition's view) before reaching training. Keep this a thin
sequencer over existing screens — do **not** build a new combined mega-screen in v1.

### 5.4 Calendar advance + weekly passes (the high-risk refactor)

Today the weekly season passes are welded to `recordPlayerMatchResult` (league only) and
fire once per league round. In the unified model they must fire **once per week elapsed**,
independent of which competition (or none) was played.

Recommended approach, staged to limit risk:
- **Stage A (driver only, behaviour-preserving as far as possible):** Build the block loop
  but keep calling the existing `recordPlayerMatchResult` / cup / European record methods
  unchanged for each fixture. Drive `calendar.date` forward to the block end, then to the
  next block's start. Accept that, initially, the weekly passes still ride on the league
  `recordPlayerMatchResult` path. Get the loop working and green first.
- **Stage B (decouple weekly passes):** Extract the weekly-pass set out of
  `recordPlayerMatchResult` into a `GameCoordinator.runWeeklyTick()` that runs: morale
  decay, poach-threat assessment, transfer-request/promise checks, status-pace penalty,
  rest-obligation reconciliation, injury ticks, `advanceEuropeanCompetitions` (AI sims),
  and the `WEEK_ADVANCED` calendar bump. Call it **once per week** between blocks (N times
  for an N-week gap, mirroring how training already splits the gap via
  `splitGapIntoPeriods`). The record methods then only record the result + per-match stats
  + per-result effects (board confidence, suspensions, media for the human game).
  Keep the exact pass set — this is a relocation, not a redesign.

> `calendar.week` becomes a **monotonic week counter incremented by `runWeeklyTick`**, no
> longer the league-round index. Audit every read of `calendar.week` (contract 6-month
> expiry window, international-break detection, promise `toRound`, suspension `forRound`,
> poach windows). Anything that meant "league round N" must be re-based on `calendar.date`
> or on the new monotonic week — verify each. `MATCHDAY_ADVANCED` can be **removed** once
> the unified advance lands (the cup no longer needs a date-only bump).

### 5.5 GameCoordinator surface

Add:
- `getNextBlock(): CalendarBlock | null` — thin wrapper over `calendarBlocks.nextBlock`.
- `simRestOfBlock(block): Promise<void>` — sims all non-player, non-recorded fixtures in
  the block across every competition (reusing `simRestOfTheFixtures`, `simDueCupFixtures`,
  `advanceEuropeanCompetitions`, `simulatePendingPlayoffMatches`).
- `runWeeklyTick()` — see Stage B.

The existing per-competition **record** methods stay (the block loop calls the right one
per fixture via the `BlockFixtureRef` variant). The existing per-competition **get-current**
methods can be retired from the Hub/main flow once the block loop is authoritative (keep
them if other screens still read them; otherwise remove).

---

## 6. Orchestration rewrite (`main.ts`)

Replace `onPlayRound` entry + `onPlayCupStep` + `maybePlayEuropeanFixture` with one driver:

```
onContinue():
  block = engine.getNextBlock()
  if (!block) -> runEndOfSeasonChain()/rollover (existing)    // season exhausted
  showFixtureList(block) -> onFixtureListContinue:
     humanFixtures = block.fixtures where player team is home/away, sorted by date
     playNextHumanFixture(i=0):
        if i >= humanFixtures.length -> afterHumanFixtures()
        f = humanFixtures[i]
        if f.comp === 'cup' && !state.player.cupManageLive:
            headlessSimPlayerCupFixture(f) ; playNextHumanFixture(i+1)
        else:
            preMatch(f) -> teamTalk(f) -> liveMatch(f) -> matchResult(f, record) -> playNextHumanFixture(i+1)
     afterHumanFixtures():
        engine.simRestOfBlock(block)                 // AI fixtures, all comps
        showBlockResults(block.competitions)         // stacked per §5.3
          -> advanceCalendarToNextBlock(): runWeeklyTick() per week elapsed
          -> training(comingWeek) -> postTrainingResults
          -> goHub()
```

International call-ups / returns: fold into `runWeeklyTick` (or the training step) using the
existing `beginInternationalBreak` / `resolveInternationalWindow` detection, now keyed off
`calendar.date` crossing the window rather than the cup-break step machine. Show the
call-ups screen at the start of the first block that falls in the window, resolve returns at
the block where the window ends.

**Cup special-case (decision 3):** the once-per-window cup decision screen (`showCupDecision`
→ manage-live + direction) surfaces when the **upcoming block contains cup fixtures** and
the decision hasn't been made for this window yet. `cupManageLive` / `cupDirection` continue
to live on `state.player` exactly as now; only league + European are forced live.

---

## 7. Hub changes (`HubScreen.ts`)

- Collapse the four CTA branches (playoffs / cup / European / league at ~157–165, ~212,
  ~223–236) into **one "Continue" button** wired to `opts.onContinue()`.
- The hero/next-match panel becomes a **block preview**: derive the next block via
  `getNextBlock()` and show its date range + the competitions involved + the player's own
  fixture (if any) in the block. Keep it informational; the button label is always
  "Continue."
- Remove `onPlayCup` / `onPlayEuropean` / `onPlayoffs` / `onPlayMatch` Hub opts in favour
  of a single `onContinue`. (Leave the six Hub tiles untouched — CLAUDE.md fixes the tile
  count at six.)
- Update `docs/DESIGN.md` §15.4 Hub tile list / CTA description.

---

## 8. Training

One training step per Continue cycle, after the block-results screen, for the coming
week(s) up to the next block. Reuse `TrainingScreen` post-match mode and the existing
gap-splitting (`splitGapIntoPeriods`) so a multi-week gap still renders one card per week.
Delete the per-competition training-week variants (`runCupMatchdayTraining`,
`runEuropeanMatchdayTraining`) once the unified `applyTrainingBlock` covers the gap-to-next-block
case — or keep one method and have it compute the gap from `calendar.date` to
`nextBlock().startDate`.

---

## 9. Season boundaries

- **Start of season:** `getNextBlock()` on a fresh season returns the opener (League Cup
  leg 0 pre-season block, then league round 1, etc., purely by date). No special-casing.
- **End of season:** when `getNextBlock()` returns `null` (all fixtures, incl. playoff
  final and European/cup finals, are resolved), `onContinue` enters the existing
  end-of-season chain → budgets → renewals → signings → `rollSeason()`.
- **Rollover:** `SEASON_ROLLED_OVER` already regenerates league fixtures, redraws cup pools
  (`PREM_CUP_SEEDED`), and reseeds European competitions with fresh dates. After rollover,
  `getNextBlock()` naturally yields next season's opener. **Verify** the regenerated
  synthetic dates (Sept–May, skipping Nov + Feb international windows) cluster sensibly under
  `BLOCK_GAP_DAYS` and that European/cup reseed dates are populated before the first
  post-rollover `getNextBlock()` call.

---

## 10. Save schema

Decision 4: **require a new career.**
- Bump `SAVE_VERSION` in `src/ui/SaveManager.ts`; add the new value to `ACCEPTED_VERSIONS`;
  add a `MIGRATIONS[N]` entry that **rejects** (or no-ops to a clean state) the prior
  version rather than reconstructing block state.
- If any new persisted field is introduced (e.g. a cached "current block" or the monotonic
  week meaning change), update the pinned snapshot in `scripts/checkSaveSchema.ts`.
- Update `docs/game-engine.md` § "Save format" and `docs/transfer-system.md` §7.
- Prefer **deriving** the block at runtime over persisting it — `getNextBlock()` is pure
  over existing state (`calendar.date` + fixtures + results), so ideally **no new save
  field** is needed beyond the `calendar.week` semantics change. Confirm this holds; if so
  the bump is purely to invalidate old cursors.

---

## 11. Documentation to update (same commits)

Per CLAUDE.md doc-sync rules:
- `docs/game-engine.md` — new calendar-block model, `runWeeklyTick`, removal of
  `MATCHDAY_ADVANCED`, the `WEEK_ADVANCED`/`calendar.week` semantics change, save bump.
- `docs/DESIGN.md` §15 — single "Continue" CTA + block preview, navigation flow for the
  block loop, the stacked mixed-block results sequencer.
- `docs/league-cup.md` — cup now runs as ordinary blocks (special-cased manage-live only).
- `docs/european-cups-2025-26.md` — European now first-class blocks, not a post-league tail.
- `src/ui/help/helpContent.ts` — Hub help topic (CTA now "Continue"); any
  fixtures/results/training topics whose flow changed.

---

## 12. Suggested commit sequence (each builds clean: `npm run build` + `npm run verify`)

1. **Block primitives (pure, no wiring).** `blockFixture.ts` + `calendarBlocks.ts` +
   `BLOCK_GAP_DAYS` in `balance/season.ts` + unit-level sanity (a tiny script or a check in
   `checkSeasonDeterminism`) that the 2025-26 data clusters as expected. No behaviour change
   yet. Update `docs/game-engine.md`.
2. **GameCoordinator surface.** `getNextBlock`, `simRestOfBlock`. Still unused by UI. Doc.
3. **Block driver (Stage A).** New `onContinue` flow in `main.ts` calling existing record
   methods; Hub switched to the single "Continue" CTA. Old `onPlayCupStep` /
   `maybePlayEuropeanFixture` paths deleted. Single-competition blocks working end-to-end.
   Docs: DESIGN, league-cup, european, help.
4. **Mixed-block results sequencer (§5.3).** Stack per-competition results screens.
5. **Weekly-pass decouple (Stage B).** Extract `runWeeklyTick`; remove `MATCHDAY_ADVANCED`;
   re-base `calendar.week` reads. This is the delicate one — do it isolated, lean on
   `npm run verify` (match + season determinism) hard.
6. **Save bump + schema snapshot + season-rollover verification.**
7. **Version bump** (`src/version.ts`, pattern `1.XXb`) — once, on the final code commit
   (or per CLAUDE.md, after each committed code update).

> Note: most commits here touch `src/`, so each needs the build + verify gates and a
> `src/version.ts` bump. The doc-only exception does not apply to them.

---

## 13. Open risks / things to watch

- **`calendar.week` overloading.** It currently doubles as the league round index *and* the
  weekly tick. Splitting these cleanly (round = fixture property; week = monotonic tick) is
  the single biggest correctness risk. Audit every `calendar.week` read before Stage B.
- **Determinism.** `npm run verify` runs match + season determinism baselines. The order in
  which AI fixtures are simmed within a block, and the order/count of `runWeeklyTick` RNG
  consumers (morale, poach, persona), must stay stable or the baselines shift. Sim block
  fixtures in a **stable order** (e.g. competition order, then date, then home id) and keep
  the weekly-pass call order identical to today's per-round order.
- **International windows.** Re-basing call-up/return detection from the cup-break step
  machine to `calendar.date` window-crossing must not double-fire or skip a window.
- **Knockout seeding timing.** A block must not include a knockout fixture before both
  sides are seeded; conversely seeding (cup SF→final, European cascade, playoff cascade)
  happens during `simRestOfBlock` / record — ensure the *next* `getNextBlock` sees the
  freshly seeded match.
- **Mixed-block player fixtures.** If a block ever contains two player fixtures (e.g. a
  league + European overlap), they play sequentially before results. Confirm with real data
  whether this actually occurs; if it never does in practice, the loop still handles it but
  it won't be exercised — note it for QA.
```
