# WP 1 — Substrate + Microscope

> Spatial Engine Upgrade, work package 1 of 9. Master plan: [`Upgrade.md`](../../Upgrade.md) § 3 (architecture), § 5.1 (tick & integration), § 8.1 (frame format), § 9 (frame debugger), § 11 (determinism).

| | |
|---|---|
| **Recommended model** | **Opus** — foundational: every pattern set here (World lifecycle, iteration order, zero-allocation loop, frame capture, RNG stream discipline) is inherited by WPs 2–8. Getting a convention subtly wrong here is the most expensive mistake in the plan. |
| **Depends on** | WP 0 |
| **Unlocks** | WPs 2–8 |
| **Size** | 4–6 commits (substrate / rng + determinism hash / scenario harness / frame debugger / probe extension) |

## Objective

Build the spatial substrate **running dark** — no `PhaseRouter` wiring, zero gameplay effect — plus the observability tooling (frame debugger, scenario harness, trajectory hash) that every later WP's gate depends on.

## Pre-read

`CLAUDE.md` (full), `Upgrade.md` §§ 2–3, 5.1, 8.1, 9, 11–12, `src/utils/rng.ts`, `src/engine/PhaseRouter.ts` (the `PhaseResult` contract), `src/engine/FatigueAccumulator.ts` (the home-then-away determinism convention), `docs/phase-animator.md`, `scripts/checkDeterminism.ts`, `scripts/pitchProbeDriver.mjs`.

## Deliverables

### 1. Spatial substrate — `src/engine/spatial/`

- **`types.ts`** — `Agent { slot, side, pos: {x,y}, vel: {x,y}, role, intent, fatigueSnapshot }`, `SpatialBall { pos, vel, height, carrierSlot? }`, `Frame`, `AgentFrame`, `FrameMarker` exactly per `Upgrade.md` § 8.1. Coordinates are the existing 0–100 space (invariant § 2.6).
- **`World.ts`** — pre-allocated 30-agent array (fixed order: home slots 1–15 then away 1–15) + ball. `buildWorld(state: MatchState): World` constructs deterministically from `MatchState` via `onFieldPlayers` (`FieldPosition.ts`). `resetWorld(world, state)` re-initialises in place (no reallocation). Plain objects, plain arrays — **no ECS, no classes-with-behaviour for agents** (CLAUDE.md § 3; `Upgrade.md` § 1).
- **`SteeringSystem.ts`** — `seek`, `arrive`, soft `separation`; pure functions writing into reused scratch vectors. Tuning in **`src/engine/balance/spatialSteering.ts`** (max speeds, accel caps, separation radius/strength — derive speed/accel from `pace`/`agility`/fatigue per `Upgrade.md` § 10).
- **`MovementSystem.ts`** — integrate `pos += vel·dt` at 10 Hz, clamp to pitch (reuse the existing clamp bands' semantics), apply separation.
- **`SpatialSimulator.ts`** — skeleton: `run(world, state, budget): { events: MatchEvent[], frames: Frame[] }`. For WP 1 the "decision" layer is a stub (agents `arrive` at fixed test targets); the loop order is the **frozen determinism contract**: ShapeSolver-stub → decision → steering → movement → contact-stub, agents in slot order, home then away (`Upgrade.md` § 11). Frame capture per micro-tick, **skipped when `silent`**.
- **Zero allocation in the micro-tick loop.** Frames are the only per-tick allocation and only when capturing (live). No `Object.entries`, no spread, no closures created per tick (CLAUDE.md § 3 GC-churn rules).

### 2. RNG stream — `src/utils/rng.ts`

Add the sixth stream: `rngSpatial(min, max)`, mulberry32, reset by `setMatchSeed` alongside the others, mirroring `rngPosition`'s implementation shape exactly. **Consumed only inside `src/engine/spatial/`** — add a comment stating this contract.

### 3. Determinism — `scripts/checkDeterminism.ts`

Extend to hash agent trajectories: run a fixed dark-mode simulation (N micro-ticks of the stub World) twice with the same seed, hash all positions per tick, assert equal; assert different across different seeds. This becomes the per-beat trajectory hash once WP 2 wires real phases.

### 4. Scenario harness — `scripts/checkSpatialScenarios.ts`

Skeleton runner: load authored World setups (TS data: agent positions, roles, ball), run N micro-ticks, assert predicates. Ship two smoke scenarios against the stub (agent arrives at target within tolerance; separation prevents stacking). Wire into `npm run verify`.

### 5. Frame debugger — Phase Animator mode (**the believability microscope**)

New mode in `public/tools/phase-animator.html` (follow `docs/phase-animator.md` § structure; regen via `npm run export:phases` if the tool is generated): load a frame-stream JSON, render 30 dots + ball on the existing pitch SVG/canvas, scrub micro-ticks with a slider, play at 1×/0.25×. **Decision annotations:** when the JSON carries per-tick `annotations` (agent → { layer: 1|2|3, topScores: [{option, score}] }), clicking a dot shows them. Annotations are recorded by `SpatialSimulator` **only behind a dev flag** (e.g. `world.recordAnnotations`), never in production or silent paths.

### 6. Probe extension

`npm run probe` (`scripts/pitchProbeDriver.mjs`) gains a mode to dump captured frame streams + annotations to `harness/` (gitignored) for the debugger to load.

## Out of scope

No `PhaseRouter` wiring. No `PHASE_HANDLERS` changes. No gameplay change of any kind — `npm run telemetry` output must be **byte-identical** before/after this WP (the band check from WP 0 passing trivially confirms it). No defensive/attacking logic (WP 2+). No contact resolution (WP 3).

## Gate (definition of done)

- [ ] `npm run build` + `npm run verify` green (including new trajectory hash + scenario smoke tests + WP 0 bands)
- [ ] Telemetry unchanged (bands pass; spot-check means identical to WP 0 freeze)
- [ ] Silent-fixture timing unchanged (substrate runs dark — zero cost in fixtures)
- [ ] Frame debugger loads a probe-dumped stream, scrubs, and shows annotations on a dev-flag capture
- [ ] `rngSpatial` exists, is reset by `setMatchSeed`, and has zero consumers outside `src/engine/spatial/`
- [ ] Version bump in `src/version.ts` (src changed)

## Doc-sync (per CLAUDE.md)

- `docs/match-engine.md`: new "Spatial substrate (dark)" subsection — module table rows for `src/engine/spatial/*`, the iteration-order determinism contract, the `rngSpatial` stream (also extend the Determinism § stream list).
- `docs/phase-animator.md`: new frame-debugger mode section.
- `CLAUDE.md` § 7 (Randomness Boundary): add the `rngSpatial` stream line.
