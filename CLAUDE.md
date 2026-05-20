# CLAUDE.md

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

**Resolve constant arithmetic at write-time, not runtime.**

If a formula applies a fixed multiplier or offset to a literal or random range, collapse the algebra into the value directly:
- `rng(0.5, 1.5) * 8` → `rng(4, 12)`
- `delta * 1.5` applied uniformly → multiply each literal by 1.5 and remove the multiplier
- `(a + rng(...) / n) * k` → fold `k` into the range and the constant

The result should express the actual value used, not the derivation of it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

**Restructuring a live type doesn't restructure its snapshots.** A frozen log row, an event-bus payload, or a replay event has schema lifetime independent of the live state it was copied from. Don't restructure a snapshot just because the source restructured. Examples from this codebase:
- `GameEvent.ballX/ballY` stayed scalar when `MatchState.ball` became `{x, y}` — `GameEvent` entries in `state.events[]` are frozen log rows.
- `PenaltyContext.ballX/ballY/clockInTheRed/halfTimeDone` stayed scalar even when their source fields moved into `state.clock` — it's a DTO crossing the event-bus boundary to `ModalManager`.
- `MatchEvent` payloads (`{ x, y, delta, value }`) stayed scalar — only the *write targets* inside `applyMatchEvent` moved to nested paths.
- `isTryScoredAt(ballX, possession, halfTimeDone)` keeps a scalar signature — it's called on projected (not-yet-applied) values, not the live state.

The test: would renaming this break replay, an existing log entry, or a downstream consumer that already serialised the old shape? If yes, leave it alone.

**When refactoring "for less coupling", verify the prescription actually eliminates the coupling, not just relocates it.** `state.phase.breakdownMod` has identical coupling properties to `state.breakdownMod` — namespacing isn't decoupling. Before drafting a sweeping change, name the specific coupling smell and check that the proposed shape removes it.

## 4. Module Boundaries

**Split before god objects form. Don't wrap clean primitives.**

- When one file accumulates multiple unrelated responsibilities, split — name each piece by what it does (Coordinator, Controller, Router, Handler). Don't wait for thousands of lines.
- Push back on proposed abstractions that wrap already-clean primitives. Don't wrap a typed state object in a "store". Don't wrap a typed pub/sub singleton in a "dispatcher". Both add ceremony without isolation benefit.
- Prefer pure functions over methods when state can be passed directly. `FieldPosition` helpers take `state: MatchState` as an argument; they are not closures threaded through a deps interface.
- Use constructor dependency injection for classes whose methods share the same deps (`PenaltyHandler`, `ClockController`). Use module-level functions for pure helpers (`FieldPosition`, `PhaseRouter`).
- Extract a shared utility the moment a second module needs it, not before. `eventId.ts` was extracted only when both `PenaltyHandler` and `ClockController` needed `makeId()`.
- Refactor incrementally. One cohesive split per commit; each commit must build clean and preserve behaviour. Big-bang refactors are unreviewable.
- A module-boundary change is an engine change — update `engine.md` in the same commit.
- **Navigation goes through `screenRouter.show(id)`** (`src/ui/ScreenRouter.ts`). Screen modules never poke `document.getElementById('…').style.display` directly; they accept `onForward` / `onBack` callbacks from `main.ts` and `main.ts` decides the next route. Adding a screen means: (1) add the id to the `SCREENS` map in `ScreenRouter.ts`, (2) add a `<div id="…">` element to `index.html`, (3) add a flat navigation handler in `main.ts`.
- **`MatchCoordinator` owns its event-bus subscriptions and must be destroyed.** The constructor captures unsubs in `busUnsubs[]`; `destroy()` runs them, cancels the tick timer, and clears the run flag. `main.ts` calls `engine.destroy()` after the user dismisses the match-result overlay so the previous match's `MatchState` can be GC'd before the next round starts.

## 5. Mutation Boundaries

**State mutation flows through one function. Don't sneak in a direct write.**

- All writes to `MatchState`, `player.matchStats`, `player.fatiguePct`, `player.currentStats`, and `player.rating` go through `applyMatchEvent(state, event)` in `src/engine/applyMatchEvent.ts`. No exceptions, including `state.events.push(...)`.
- Phase handlers in `src/engine/events/` are read-only over state: they read fields, compute, build a `MatchEvent[]`, and return it on `PhaseResult.events`. `PhaseRouter.resolvePhase()` applies the queue, then composes the outgoing `GameEvent`.
- Orchestrators (`MatchCoordinator`, `ClockController`, `PenaltyHandler`) call `applyMatchEvent` directly for non-phase mutations (clock, half-time, penalty choices, substitutions, tactics, fatigue, commentary log).
- Use **domain-meaningful** event names (`TRY_SCORED`, `KNOCK_ON`, `CARRY_RESOLVED`, `LINEOUT_RESOLVED`) — not primitive setters (`SET_BALL_X`, `INC_STAT`). The event log should read like commentary, not assembly. One narrow exception: structural setters (`BALL_REPOSITIONED`, `PHASE_CHANGED`, `BREAKDOWN_MOD_SET`, `POSSESSION_SWAPPED`, `POSSESSION_SET`) exist where the domain has no single name for the change.
- Adding a new mutation kind: add one variant to the `MatchEvent` union in `src/types/matchEvent.ts`, one branch in `applyMatchEvent`. The exhaustive `default: const _: never = event;` in the switch catches missing branches at compile time.
- Adding a new player stat: extend `PlayerMatchStats` + `zeroMatchStats()` + the relevant domain event's apply branch — never push a raw `player.matchStats.X++` into a handler.
- `eventBus.emit` calls (`engine:event`, `engine:stateChange`, `engine:paused`, `engine:resumed`, `engine:finished`) are **pure UI side effects** and are NOT part of the mutation boundary. They live in orchestrators alongside `applyMatchEvent` calls, not inside `applyMatchEvent` itself.
- Computations derived from state (`computeRating`, `computeFatigue`) live in pure helpers; their writes still flow through dedicated `MatchEvent` variants (`RATINGS_RECALCULATED`, `FATIGUE_APPLIED`).
- Events may hold `Player` references for now (object identity is fine for in-memory use). If serialisable replay is ever needed, swap to `{ side, playerId }` lookups at that point — the boundary already exists.
- **Pre-match jersey assignment vs in-game substitution are different operations.** Pre-match (`PreMatchScreen.assignStartingJersey`) reassigns `squadNumber` AND `id` by slot — the starting XV always wears 1–15, the bench always wears 16–23. In-game substitution (`SUBSTITUTION_APPLIED` in `applyMatchEvent`) reassigns ONLY `id`/`position`/`x`/`y`; the substituting player keeps their bench `squadNumber` and runs on wearing that number. Both flows assume `squadNumber` is unique across `team.players ∪ team.bench`.

## 6. Randomness Boundary

**All randomness flows through `src/utils/rng.ts`. Never call `Math.random()` directly in engine code.**

Three isolated mulberry32 streams, each seeded from `state.engine.seed`:
- `rng(min, max)` — outcome stream; every in-play roll (resolvers, phase handlers, clock advance, coin toss, any array sampling that affects the match)
- `rngForm()` — form stream; player form modifier at `initPlayer()`
- `pickRandom(arr)` / `commentaryChance(pct)` — commentary stream; array sampling and chance gates for flavour text (commentary templates, tactic notes)

Streams are independent, so adding a new commentary line cannot shift outcome rolls. When adding a randomness consumer, pick the matching stream — don't reuse `rng()` for flavour text or `pickRandom()` for outcomes.

The master seed is set once in the `MatchCoordinator` constructor via `setMatchSeed(seed)` **before** `initMatchState()` runs, so player form is deterministic. The only `Math.random()` call in the engine is the seed-generator line itself when `opts.seed` is absent. A match with a given seed is fully reproducible. See `engine.md` "Determinism (Seeded RNG)" for the full breakdown.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Where to look

| Topic | Source of truth |
|---|---|
| Engine internals — phases, resolvers, formulas, RNG, tactics effects, commentary | **`engine.md`** |
| Visual design — colours, fonts, spacing, components, live-match shell HTML | **`DESIGN.md`** |
| Architectural invariants & how to work in this repo | this file |

When the code changes, update the corresponding doc in the same commit.

## Commands

```bash
npm run dev      # start Vite dev server (hot reload)
npm run build    # tsc type-check then Vite production build → dist/
npm run preview  # serve the dist/ folder locally
```

There are no tests or linters configured. TypeScript strict mode is the primary correctness check — `npm run build` must pass cleanly before every commit.

**Deploy:** Push to `main`. GitHub Actions builds and deploys to GitHub Pages automatically. The Vite base path is `/Rugby-Simulator-/` — do not change it or asset URLs break in production.

## Versioning

**After every committed update, bump the version in `src/version.ts` and push to `main`.**

The version string follows the pattern `0.XXa` (e.g. `0.01a`, `0.02a`). Increment the two-digit numeric part by 1 for each update. The version is displayed on the Home Screen; `src/version.ts` is the single source of truth.

## Maintaining engine.md

**After any change to engine code, update `engine.md` to match. This is not optional — engine.md must be updated in the same commit as the engine change.**

`engine.md` is a plain-English reference for the entire game engine. Engine code is everything under `src/engine/`, plus the engine-facing types in `src/types/engine.ts` and `src/types/matchEvent.ts`. The commentary renderer (`src/commentary/`) is also covered there.

When updating `engine.md`, document:
1. Which players are selected (exact `find`/`filter` conditions from `PhaseRouter.resolvePhase()` and the relevant event handler)
2. The resolver formula with actual numbers from the resolver file
3. All outcome thresholds
4. Ball position changes and possession swaps
5. Stat increments per phase (which player, which `matchStats` field)
6. Any known gaps or approximations

Do not paraphrase — if the code changes, the doc must reflect the new code exactly.

## Balance constants

**Every gameplay tuning number — probability, threshold, modifier, weight, fatigue multiplier, rating point value — lives in `src/engine/balance.ts`.** Do not introduce new tuning literals in resolvers, events, or systems. Exempt by design: rugby pitch geometry (`FieldPosition.ts`), jersey-number position checks, and RNG shape values inside resolver formulas (e.g. `rng(1, 20)`).

---

## Architecture

### Engine ↔ UI contract

The single most important architectural rule: **the engine never imports from UI; UI modules never call engine methods directly** (except `SimController`, which wires the Play/Pause/Speed controls). All communication goes through the typed pub/sub singleton at `src/utils/eventBus.ts`.

Engine emits → UI subscribes:

| Event | Payload | Subscribers |
|---|---|---|
| `engine:stateChange` | `{ state: MatchState }` | Scoreboard, StatsPanel, PitchStrip, CommentaryFeed (one-shot) |
| `engine:event` | `{ event: GameEvent }` | CommentaryFeed |
| `engine:paused` | `{ payload: ModalPayload }` | ModalManager, SimController |
| `engine:resumed` | `{}` | ModalManager, SimController |
| `engine:finished` | `{ state: MatchState }` | (available for end-screen) |

`eventBus.on()` returns an unsubscribe function. All UI init subscriptions are intentionally permanent — the app is a single session per page load and no module is ever torn down. The unsubscribe function should be called when you need a **one-shot** listener that fires once and then removes itself (e.g. `CommentaryFeed.ts` caches team colours on the first `engine:stateChange` then unsubscribes).

Within a single tick, `engine:event` is emitted **before** `engine:stateChange`. UI modules that depend on state cached from a previous `stateChange` will always have a valid cache from the prior tick by the time an event arrives.

The engine never produces text. Commentary is structured `NarrationDescriptor` data on every `GameEvent`; `CommentaryFeed.ts` calls `renderNarration(event)` from `src/commentary/CommentaryRenderer.ts` to produce the feed string. Silent simulation = don't initialise `CommentaryFeed`.

For full simulation loop, phase flow, resolver formulas, player selection, tactics effects, rating system, fatigue tables, and commentary engine details: see **`engine.md`**.

### Attack direction

Home attacks toward x=100 in the first half, toward x=0 in the second half. **Teams only swap ends at half-time, never on turnovers.** All `ball.x` reasoning must go through the pure helpers in `src/engine/FieldPosition.ts` (`attackDir(state)`, `isTryScored(state)`, `inOpposition22(state)`, `inOppositionHalf(state)`, `inOwn22(state)`, `inOwnHalf(state)`) — these are the authoritative helpers that factor in `state.clock.halfTimeDone`. The live ball lives at `state.ball.{x,y}`; clock fields under `state.clock`; engine-lifecycle flags under `state.engine`. Snapshot DTOs (`GameEvent`, `PenaltyContext`, `MatchEvent` payloads) intentionally keep flat `ballX`/`ballY` scalars — see Section 3.

### Tactics system

Five tactic dimensions are defined in `TeamTactics` (`src/types/team.ts`): `attackingGamePlan`, `attackingStyle`, `attackingBreakdown`, `defendingBreakdown`, `backfieldDefence`. The UI (`TacticsMenu.ts`) lets the **managed team** change all five mid-match — `SimController` opens the modal with `teamId = engine.getHumanSide()`, and the `ui:tacticsChange` handler in `MatchCoordinator` routes the update through a `TACTICS_UPDATED` `MatchEvent`. The AI-controlled team uses engine defaults and cannot be changed through the UI.

Kick-off strategy is **not** a standing tactic. It is chosen per kick-off via an interactive modal (managed team only). The AI side always defaults to `high_ball`. `KickOffStrategy` is defined in `src/types/engine.ts`.

Per-tactic engine effects, kick-or-carry probability tables, box-kick propensity conditions, and tactical-commentary trigger table: see `engine.md` "Carry Phases" and "Tactical Commentary" sections.

### UI module responsibilities

| Module | Sole responsibility |
|---|---|
| `HomeScreen.ts` | Landing screen; entry point to the team selector |
| `TeamSelectorScreen.ts` | 4-team picker; chooses the player's managed team and propagates `humanSide` to the match |
| `FixtureListScreen.ts` | 6-round fixture list against the other three teams; sticky Play button; post-match result overlay; persists per-round scores |
| `Scoreboard.ts` | Team names, scores, clock, phase badge |
| `StatsPanel.ts` | Stats table (cached by stat-value key, re-renders on change) + player stats panel (DOM-patched once per game minute) |
| `PitchStrip.ts` | Ball marker position + attack direction label + end-label swap at half-time |
| `CommentaryFeed.ts` | Renders feed entries via `renderNarration(event)` (max 30, prepend-scrolls); one-shot `stateChange` subscription caches team colours, names, and full squad rosters; colorises all player name mentions and team name mentions in their team colour |
| `ModalManager.ts` | Penalty choice / kick-off choice / tactics / substitution modal hosting (bottom sheet / centred dialog) |
| `TacticsMenu.ts` | Five-dimension tactics picker; rendered inside the tactics modal; emits `ui:tacticsChange` |
| `SubstitutionModal.ts` | Bench-vs-on-pitch substitution UI; emits `ui:substitution` |
| `PreMatchScreen.ts` | Pre-match player attribute table; calls `onStart()` callback to trigger `engine.initialize()` |
| `SimController.ts` | Play / Pause / Speed controls (the only UI module that calls engine methods) + view toggle button handlers that switch `#panel-bottom` between `view-dashboard`, `view-commentary`, `view-stats`, `view-players` |

`AppShell.ts` injects the static HTML skeleton (described in `DESIGN.md` → "Live match shell"). All UI modules are initialised before `engine.initialize()` fires — they are purely reactive and have no internal state beyond DOM references, render caches, and one-shot initialisation values. Player objects are created once in `MatchCoordinator` and mutated in-place throughout the match via `applyMatchEvent`; their identity (name, id, team membership) never changes (substitutions reassign the on-pitch slot via `SUBSTITUTION_APPLIED`, but the substituted-off player object is preserved on `team.substitutedOff`). Player names are unique across both squads — `CommentaryFeed`'s colourisation pass relies on this.

### Design system

**`DESIGN.md` is the single source of truth for all visual decisions.** Read it before touching any UI code. Every colour, font, spacing, and component pattern is documented there. When in doubt, consult `DESIGN.md` first — do not invent visual decisions.

CSS custom properties are defined in `style/main.css` `:root` and must be used for every colour — no hardcoded hex except: primary CTA green (`#007a2a` / `#009434` active / `#006622` pressed) and team identity colours injected inline from team JSON data.

### Team data

`src/data/team-*.json` — currently Gloucester, Bristol, Leicester, Saracens. Each has 15 players with 12 base stats on a 1–100 integer scale. `initPlayer()` in `MatchCoordinator` copies `baseStats` to `currentStats` at match start. `StaminaSystem.computeFatigue()` then computes new `currentStats` over the course of the match; the writes are applied via `FATIGUE_APPLIED` `MatchEvent`s through `applyMatchEvent`. `baseStats` is never modified.

## Placeholder Data in Pre-Match Screen

The pre-match header still contains hardcoded placeholder values for elements whose underlying data systems do not exist yet. Round number is now real (driven by `FixtureListScreen`'s 6-round fixture list); the rest are still stubs:

- **Form pins** (e.g. `WWLWD` / `WWWLW` in `PreMatchScreen.ts`) — needs a match result history store per team (only the player team's per-round scores are persisted today).
- **Stake row** (`LEAGUE 2nd · 4 pts`, `H2H 1W · 2L last 3`, `ODDS +3.5`) — needs season table data and a fixture/odds system.
- **Match kick-off time** (`20:00`) — needs scheduled match times.
