# WP 5 — Shape & Distribution

> Spatial Engine Upgrade, work package 5 of 9. Master plan: [`Upgrade.md`](../../Upgrade.md) § 5.3 (attacking shape), § 5.4 (carrier decision layer), § 6 (three-layer control stack + backline mechanics), § 9 (shape editor).

| | |
|---|---|
| **Recommended model** | **Opus** — the largest and most judgment-heavy WP in the plan: the full three-layer stack, attack shape, pass timing, and the replacement of the remaining `OpenPlayResolver` + `Lateral.ts` sweep model. This is where "looks like rugby" is won or lost, and the tuning loop is open-ended. Budget the most wall-clock here. |
| **Depends on** | WP 4 |
| **Unlocks** | WP 6 (plays overlay the shape built here) |
| **Size** | 6–8 commits (ShapeSolver attack half / three-layer stack / pass mechanics / carrier utility AI / Lateral replacement / shape editor / scenarios / tuning) |

## Objective

The complete open-play attacking game: pods and width from the ShapeSolver, the three-layer control stack giving every agent legible independence, backline depth/run-timing/pass-window mechanics, and a carrier utility AI — fully replacing the remaining probabilistic `OpenPlayResolver` outcomes and the `Lateral.ts` sweep model. Plus the Phase Animator **shape editor**, so all formation data is visually authored.

## Pre-read

`CLAUDE.md` (full), `Upgrade.md` §§ 5.3–5.4, 6, 9, 10, WP 2–4 landed code, `src/engine/resolvers/OpenPlayResolver.ts` + `src/engine/Lateral.ts` (being replaced — inventory every event they emit and every `rngPosition` draw, since lateral movement now comes from real agent positions), `src/engine/AITacticalDirector.ts` + `KickDecisionDirector.ts` (strategic intent stays with them), `docs/phase-animator.md`, `docs/match-engine.md` § "Lateral / Y-axis model".

## Deliverables

### 1. ShapeSolver — attack half (`ShapeSolver.ts`)

- **Pod assignment** on secured possession: forwards self-assign per `attackingGamePlan`/`attackingStyle` (`keep_it_tight` → 1-3-3-1; `wide_wide` → 2-4-2 edge pods). Tight five → mid pods; back-row eligible for backline link/edge roles by derived mobility. Assignment is deterministic given the World (proximity + role weights, ties by slot order).
- **Backline lanes**: depth-and-width targets off first receiver (`pickScrumHalf`/`pickKicker` chains unchanged). **Depth is the § 6 first-class variable**: diagonal alignment 5–8 m behind the gain line, deeper when wider, scaled by tactic (flat ↔ deep).
- All anchors/lanes/depths as **data in `balance/spatialShape.ts`**, authored via the shape editor (below).

### 2. Three-layer control stack (formalised in `SpatialSimulator`)

Per `Upgrade.md` § 6 — Layer 1 role targets from ShapeSolver; Layer 2 per-agent utility veto (winger holds width; openside's § 5.6 ruck score can beat shape score — unify with WP 4's commitment scoring rather than duplicating it); Layer 3 hard interrupts (ball in air near me, line break in radius, loose ball). One channel drives each agent each tick; record which layer won in the dev-flag annotations (the debugger's "why is he there?" answer).

### 3. Pass mechanics (the backline-quality trio, § 6)

1. **Run onto the ball**: receiver's max-acceleration window timed to pass arrival — run starts `flightTime + windup` before release.
2. **Pass window**: pass target = receiver's *projected* position at flight time.
3. **Pass flight**: speed/accuracy from passer `handling` (+ pressure proximity); a pressured/poor pass degrades the receiver's catch (existing knock-on vocabulary) via `rngSpatial`. Constants in `balance/spatialDecision.ts`.

### 4. Carrier utility AI (`Upgrade.md` § 5.4)

Score **carry / pass-to-pod / sweep wide / offload / kick-handoff** from: corridor gap (real geometry), support proximity, field position, tactics, `composure`/`positioning`. Strategic intent stays with `AITacticalDirector`/`KickDecisionDirector` — a "kick" decision *hands off* to the kick phases (spatial execution arrives in WP 7; until then the legacy kick path runs). Decision noise from `rngSpatial`, scaled inversely by composure.

### 5. Retire the replaced systems

`OpenPlayResolver`'s remaining probabilistic outcomes and `Lateral.ts`'s sweep-distance model are superseded — lateral ball movement is now real pass chains between real positions. Remove what YOUR change makes dead (CLAUDE.md § 4); `rngPosition` keeps its remaining consumers (kick launch angles etc. until WP 7 — inventory first, remove only what's actually unused). `ball.lateralDir` semantics: confirm downstream consumers (display) and either feed it from real movement or retire it with its consumers — snapshot DTOs (`GameEvent.movements` etc.) stay scalar and intact per CLAUDE.md § 4.

### 6. Shape editor — Phase Animator mode (`Upgrade.md` § 9)

Author pod anchors, lanes, depths, defensive slots on the pitch visually; export to the `balance/spatialShape.ts` data shape. Per `docs/phase-animator.md` conventions; document round-tripping (load current shapes → edit → export).

### 7. Scenarios

- **Overlap conversion**: 3-v-2 wide with correct depth → try/break majority; same overlap with flat/shallow alignment → higher intercept/contact-behind-gainline rate.
- **Pod recycle**: 1-3-3-1 same-way 6-phase sequence → pods re-form within N ticks each phase (shape integrity metric).
- **Width discipline**: ball tight for 4 phases → winger's mean distance from touchline stays within lane tolerance (Layer 2 veto working).
- **Composure noise**: low-composure 10 under pressure picks sub-optimal options at materially higher rate than composed 10.

## Out of scope

Set plays / playbook overlays (WP 6). Spatial kick execution (WP 7 — the utility AI may *choose* kick, execution stays legacy this WP). Maul/scrum/lineout shape staging (WP 8).

## Gate (definition of done)

- [ ] `npm run build` + `npm run verify` green
- [ ] **All** WP 0 bands pass — this WP touches every attacking metric; expect the longest calibration loop of the project
- [ ] All four scenarios pass; try-channel distribution (tight/mid/wide) is rugby-plausible (record it as a new telemetry metric)
- [ ] Frame-debugger review: pods form, backline aligns deep-to-wide, receivers arrive at pace, the winger stays home — sign-off from project owner
- [ ] Shape editor round-trips current shape data
- [ ] Silent-fixture timing within budget
- [ ] Version bump

## Doc-sync (per CLAUDE.md)

- `docs/match-engine.md`: open-play section fully rewritten (shape solver, three layers, pass mechanics, utility AI — final constants); "Lateral / Y-axis model" section updated/retired to match reality.
- `docs/phase-animator.md`: shape-editor mode.
- `Upgrade.md` § 14: mark WP 5 landed.
