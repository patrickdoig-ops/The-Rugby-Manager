# CLAUDE.md

Architectural invariants and ways of working for this repo. Lean by design. Read in full at session start. For engine internals see **`docs/engine.md`**; for visual design see **`docs/DESIGN.md`**.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
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

**Resolve constant arithmetic at write-time, not runtime.** If a formula applies a fixed multiplier or offset to a literal or random range, collapse it. `rng(0.5, 1.5) * 8` → `rng(4, 12)`. The result should express the actual value used, not the derivation of it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.

The test: every changed line traces directly to the user's request.

**Restructuring a live type doesn't restructure its snapshots.** A frozen log row, an event-bus payload, or a replay event has schema lifetime independent of the live state it was copied from. `GameEvent.ballX/ballY`, `PenaltyContext.*`, and `MatchEvent` payload fields stay scalar even when their source moved into `state.ball`/`state.clock`. The test: would renaming break replay, an existing log entry, or a downstream consumer that already serialised the old shape? If yes, leave it alone.

**Namespacing is not decoupling.** `state.phase.breakdownMod` has identical coupling properties to `state.breakdownMod`. Before drafting a "decouple" refactor, name the specific coupling smell and verify the proposed shape actually removes it.

## 4. Module Boundaries

**Split before god objects form. Don't wrap clean primitives.**

- Split a file when it accumulates multiple unrelated responsibilities. Name each piece by what it does (Coordinator, Controller, Router, Handler). Don't wait for thousands of lines.
- Push back on abstractions that wrap already-clean primitives. Don't wrap a typed state object in a "store"; don't wrap a typed pub/sub singleton in a "dispatcher".
- Prefer pure functions over methods when state can be passed directly. `FieldPosition` helpers take `state: MatchState` as an argument; they are not closures threaded through a deps interface.
- Use constructor DI for classes whose methods share the same deps (`PenaltyHandler`, `ClockController`). Use module-level functions for pure helpers (`FieldPosition`, `PhaseRouter`).
- Extract a shared utility the moment a second module needs it, not before.
- Refactor incrementally. One cohesive split per commit; each commit must build clean and preserve behaviour.
- A module-boundary change is an engine change — update `docs/engine.md` in the same commit.
- **Navigation goes through `screenRouter.show(id)`** (`src/ui/ScreenRouter.ts`). Screen modules never poke `document.getElementById('…').style.display` directly; they accept `onForward`/`onBack` callbacks from `main.ts`. Adding a screen: (1) add the id to the `SCREENS` map in `ScreenRouter.ts`, (2) add a `<div id="…">` to `index.html`, (3) add a flat navigation handler in `main.ts`.
- **`MatchCoordinator` owns its event-bus subscriptions and must be destroyed.** Constructor captures unsubs in `busUnsubs[]`; `destroy()` runs them, cancels the tick timer, and clears the run flag. `main.ts` calls `engine.destroy()` after the match-result overlay is dismissed.

## 5. Mutation Boundaries

**State mutation flows through one function. Don't sneak in a direct write.**

- All writes to `MatchState`, `player.matchStats`, `player.fatiguePct`, `player.currentStats`, and `player.rating` go through `applyMatchEvent(state, event)` in `src/engine/applyMatchEvent.ts`. No exceptions, including `state.events.push(...)`.
- Phase handlers in `src/engine/events/` are read-only over state: they read, compute, build a `MatchEvent[]`, and return it on `PhaseResult.events`. `PhaseRouter.resolvePhase()` applies the queue then composes the outgoing `GameEvent`.
- Orchestrators (`MatchCoordinator`, `ClockController`, `PenaltyHandler`) call `applyMatchEvent` directly for non-phase mutations (clock, half-time, penalty choices, substitutions, tactics, fatigue, commentary log).
- Use **domain-meaningful** event names (`TRY_SCORED`, `KNOCK_ON`, `CARRY_RESOLVED`, `LINEOUT_RESOLVED`) — not primitive setters. Narrow exception: structural setters (`BALL_REPOSITIONED`, `PHASE_CHANGED`, `BREAKDOWN_MOD_SET`, `POSSESSION_SWAPPED`, `POSSESSION_SET`) where the domain has no single name.
- Adding a new mutation kind: one variant in the `MatchEvent` union (`src/types/matchEvent.ts`), one branch in `applyMatchEvent`. The exhaustive `default: const _: never = event;` catches missing branches at compile time.
- Adding a new player stat: extend `PlayerMatchStats` + `zeroMatchStats()` + the relevant domain event's apply branch — never push a raw `player.matchStats.X++` into a handler.
- `eventBus.emit` calls are **pure UI side effects** and are NOT part of the mutation boundary. They live in orchestrators alongside `applyMatchEvent` calls, not inside `applyMatchEvent` itself.
- Derived state (`computeRating`, `computeFatigue`) lives in pure helpers; writes still flow through dedicated `MatchEvent` variants (`RATINGS_RECALCULATED`, `FATIGUE_APPLIED`).
- **Pre-match jersey assignment vs in-game substitution are different operations.** Pre-match (`PreMatchScreen.assignStartingJersey`) reassigns `squadNumber` AND `id` by slot — starting XV wears 1–15, bench wears 16–23. In-game substitution (`SUBSTITUTION_APPLIED`) reassigns ONLY `id`/`position`/`x`/`y`; the substituting player keeps their bench `squadNumber`. Both flows assume `squadNumber` is unique across `team.players ∪ team.bench`.

## 6. Randomness Boundary

**All randomness flows through `src/utils/rng.ts`. Never call `Math.random()` directly in engine code.**

Three isolated mulberry32 streams seeded from `state.engine.seed`:
- `rng(min, max)` — outcome stream; every in-play roll.
- `rngForm()` — form stream; player form modifier at `initPlayer()`.
- `pickRandom(arr)` / `commentaryChance(pct)` — commentary stream; flavour-text sampling.

Streams are independent — adding a commentary line cannot shift outcome rolls. Pick the matching stream when adding a randomness consumer. Seed is set once in the `MatchCoordinator` constructor via `setMatchSeed(seed)` **before** `initMatchState()` runs. A match with a given seed is fully reproducible. Full breakdown in `docs/engine.md` "Determinism (Seeded RNG)".

---

## Where to look

| Topic | Source of truth |
|---|---|
| Engine internals — phases, resolvers, formulas, RNG, tactics effects, commentary, UI event-bus contract | **`docs/engine.md`** |
| Visual design — colours, fonts, spacing, components, live-match shell HTML, screen notes | **`docs/DESIGN.md`** |
| Architectural invariants & ways of working | this file |

When code changes, update the corresponding doc in the same commit.

## Commands

```bash
npm run dev      # start Vite dev server (hot reload)
npm run build    # tsc type-check then Vite production build → dist/
npm run preview  # serve the dist/ folder locally
```

No tests or linters. TypeScript strict mode is the primary correctness check — `npm run build` must pass cleanly before every commit.

**Deploy:** push to `main`. GitHub Actions builds and deploys to GitHub Pages. The Vite base path is `/Rugby-Simulator-/` — do not change it or asset URLs break in production.

## Versioning

**After every committed update, bump `src/version.ts` and push to `main`.** Pattern `1.XXa` (e.g. `1.40a`); increment by 1. The version renders on the Home Screen.

## Balance constants

**Every gameplay tuning number — probability, threshold, modifier, weight, fatigue multiplier, rating point value — lives in `src/engine/balance.ts`.** Do not introduce new tuning literals in resolvers, events, or systems. Exempt: rugby pitch geometry (`FieldPosition.ts`), jersey-number position checks, and RNG shape values inside resolver formulas (e.g. `rng(1, 20)`).

## Architecture

**Engine ↔ UI contract.** The engine never imports from UI; UI never calls engine methods directly **except** `SimController` (Play/Pause/Speed). All communication goes through the typed pub/sub singleton at `src/utils/eventBus.ts`. Within a single tick, `engine:event` is emitted **before** `engine:stateChange` — UI state caches from the prior tick are always valid by the time an event arrives. Engine event table and subscribers: `docs/engine.md` § "UI Event Bus Contract". UI subscriptions registered at startup are permanent; one-shots are explicitly unsub'd (e.g. `CommentaryFeed`'s team-colour cache).

**Commentary is data, not text.** The engine populates `NarrationDescriptor` on every `GameEvent`; `CommentaryFeed.ts` calls `renderNarration(event)` to produce strings. Silent simulation = don't initialise `CommentaryFeed`.

**Attack direction.** Home attacks toward x=100 in the first half, toward x=0 in the second. Teams swap ends only at half-time, never on turnovers. All `ball.x` reasoning must go through the pure helpers in `src/engine/FieldPosition.ts` — they factor in `state.clock.halfTimeDone`. Snapshot DTOs (`GameEvent`, `PenaltyContext`, `MatchEvent` payloads) keep flat `ballX`/`ballY` scalars; see Section 3.

**Tactics.** Five dimensions in `TeamTactics` (`src/types/team.ts`). The managed team can change all five mid-match via the tactics modal; AI uses `DEFAULT_TACTICS` and cannot be changed via UI. Kick-off strategy is per-kick (not a standing tactic) — managed team picks via modal, AI defaults to `high_ball`. Effects, probability tables, and tactic-note triggers: `docs/engine.md` "Carry Phases" + "Tactical Commentary".

**Design system.** `docs/DESIGN.md` is the single source of truth for every colour, font, spacing, and component pattern. CSS custom properties in `style/main.css` `:root` — no hardcoded hex except primary CTA green (`#007a2a` / `#009434` active / `#006622` pressed) and team identity colours injected inline from team JSON.

**Team data.** `src/data/team-*.json` — all 10 Gallagher Premiership clubs (Bath, Bristol, Exeter, Gloucester, Harlequins, Leicester, Newcastle, Northampton, Sale, Saracens). Each file has `players` (15 starters, id 1-15), `bench` (8 matchday subs, id 16-23), and `squad` (the rest of the senior roster, id 24+; data-only, engine ignores). Each player carries `firstName`, `lastName`, `dob` (nullable ISO), `nationality`, `position` (detailed engine form), and 12 `baseStats` on a 1–100 scale. `MatchCoordinator.initPlayer` copies `baseStats` to `currentStats` at match start; `StaminaSystem.computeFatigue` drives `currentStats` over the match via `FATIGUE_APPLIED`. `baseStats` is never modified. Player full names are unique league-wide — `CommentaryFeed`'s colourisation pass relies on this. **Source of truth is `docs/team-data.md`** — to regenerate the JSONs deterministically after editing team-data.md, run `node scripts/generateTeamJsons.mjs`.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
