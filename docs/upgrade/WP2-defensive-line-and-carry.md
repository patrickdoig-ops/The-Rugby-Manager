# WP 2 — Defensive Line + Carry Corridor

> Spatial Engine Upgrade, work package 2 of 9. Master plan: [`Upgrade.md`](../../Upgrade.md) § 4.1 (spatial family seam contract), § 5.2 (defensive system), § 6 Layer 1 (ShapeSolver), § 13 (calibration).

| | |
|---|---|
| **Recommended model** | **Opus** — this is where match quality is decided (`Upgrade.md` § 5.2). The fold model must *produce* overlaps emergently while telemetry stays in band; that's a judgment-heavy tuning loop, plus the first live wiring of spatial resolution into `PhaseRouter`. |
| **Depends on** | WP 1 |
| **Unlocks** | WP 3 (contact needs a line to attack) |
| **Size** | 4–6 commits (defensive ShapeSolver / carry corridor / router wiring / scenarios / tuning) |

## Objective

First live spatial resolution: a drilled defensive line (slots, fold, backfield, offside) and a carry corridor against it. Spatial **line breaks** replace the probabilistic line-break/metres portion of `OpenPlayResolver` for `PhasePlay` carries — emitting the *same* `MatchEvent`s, keeping telemetry in band.

## Pre-read

`CLAUDE.md` (full), `Upgrade.md` §§ 3, 4.1, 5.1–5.2, 6, 13, WP 1 plan + its landed code, `src/engine/resolvers/OpenPlayResolver.ts` (what is being partially replaced — understand its event output exactly), `src/engine/events/` (PhasePlay handler), `docs/match-engine.md` § open play, `src/engine/balance/openPlay.ts`, `src/engine/balance/tackling.ts`.

## Deliverables

### 1. Defensive ShapeSolver — `src/engine/spatial/ShapeSolver.ts` (defence half only)

Per `Upgrade.md` § 5.2, computing the Layer-1 target map for the defending side:

- **Line slots** anchored at the breakdown/origin mark, lateral spacing + line speed + drift bias from `defendingTeam.tactics.defensiveLine` (rush/drift/shadow). Each defender steers to *his slot*, never to the ball.
- **Backfield**: `backfieldDefence` posts 1–2 deep (selection via `pickFullback` chain), exempt from the line.
- **Fold**: after a tackle/breakdown, re-slot around the new mark at a speed from derived work rate (`stamina` + `positioning`) × fatigue. Fold speed constants in **`balance/spatialShape.ts`** (slot spacings, depths) and **`balance/spatialSteering.ts`** (fold-speed derivation weights).
- **Offside plane**: the line holds behind the mark until ball-out; creep from `discipline`/`positioning` + team `discipline` tactic. A creep beyond threshold rolls (via `rngSpatial`) into the existing penalty pipeline — emit `PENALTY_AWARDED` with an offside offence; cards/TMO flow untouched downstream.

### 2. Carry corridor (attack side, minimal)

The attacking shape is deliberately primitive in this WP (full attack shape is WP 5): carrier + 2–3 support runners at authored offsets get targets up the corridor; remaining attackers hold station at shape-sheet placeholder positions. The carrier advances; **gap detection** (nearest-defender spacing in the corridor vs carrier evasion potential) produces:

- **Line break** → `CARRY_RESOLVED` with real metres (distance actually covered) + the existing line-break stat increments via the established event variants — *check `OpenPlayResolver` for the exact events/payloads it emits today and reproduce that vocabulary*; do not invent new `MatchEvent` variants unless an existing one cannot carry the outcome (if one is needed: one union variant + one `applyMatchEvent` branch + doc-sync, per CLAUDE.md § 6).
- **Carry into contact** → for this WP, hand off to the *legacy* tackle/collision outcome path (WP 3 replaces it). The seam: spatial determines *where* contact happens and *who* tackles (nearest line defender); legacy formula determines the contact *outcome*.

### 3. Router wiring

`PhaseRouter.PHASE_HANDLERS[PhasePlay]` routes carry resolution through `SpatialSimulator.run()` behind a single switch (e.g. a module-level `SPATIAL_PHASES` set) so reverting is a one-line change (`Upgrade.md` § 3 hybrid contract). `resolvePhase` applies the returned events exactly as it applies legacy handler events. Frames ride out on the `GameEvent` (consumed in WP 8; harmless extra payload until then — confirm `silent` skips capture).

### 4. World lifecycle (minimal)

`buildWorld(state)` on spatial-phase entry; discard on exit. Persistence across contiguous phases is **WP 4** — do not build it here.

### 5. Scenarios (`checkSpatialScenarios.ts`)

- **Fold overlap**: tired/slow defence folding from a far-side ruck leaves a 2-defender short side → attack with 3 wide attackers must produce a break with high probability across seeds; fresh fast fold must mostly prevent it.
- **2-on-1**: corridor with one defender vs two attackers → break probability band.
- **Rush kills width**: rush `defensiveLine` vs deep attack → carries mostly die at/behind gain line.
- **Offside discipline**: low-discipline team accrues offside penalties at a materially higher rate than high-discipline.

## Out of scope

Contact/tackle resolution formulas (WP 3). Breakdown commitment (WP 4). Attacking pods/depth/pass chains (WP 5). Kicking (WP 7). Rendering (WP 8) — watchability review happens **in the frame debugger**, not `PitchView`.

## Gate (definition of done)

- [ ] `npm run build` + `npm run verify` green (trajectory hash now covers live PhasePlay beats)
- [ ] WP 0 telemetry bands all pass (tries, points, carries, penalties especially)
- [ ] All four scenarios pass across seeds
- [ ] Silent-fixture timing within WP 0 budget
- [ ] **Watchability review in the frame debugger**: a captured 10-phase sequence shows a line that holds, folds, and gets beaten for legible reasons (human sign-off — flag for the project owner)
- [ ] Version bump

## Doc-sync (per CLAUDE.md)

- `docs/match-engine.md`: open-play section updated — which portion of `OpenPlayResolver` is replaced, the spatial line-break logic with real constants from `balance/spatialShape.ts`/`spatialSteering.ts`, the router switch, the seam contract.
- `Upgrade.md` § 14: mark WP 2 landed; note any deviations.
