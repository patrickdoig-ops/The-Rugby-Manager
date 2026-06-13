// The spatial micro-tick driver (Upgrade.md §§ 3, 5.1) — runs DARK in WP 1.
//
// It is NOT wired into PhaseRouter; no phase resolves through it yet and it
// produces no MatchEvents, so it has zero gameplay effect. WP 1 ships only the
// substrate + the frozen evaluation order that WPs 2–8 inherit.
//
// FROZEN LOOP ORDER (Upgrade.md § 11) — the determinism contract:
//   ShapeSolver (stub) → decision (stub) → steering → movement → contact (stub)
// agents iterated in slot order, home then away (mirroring FatigueAccumulator).
// SteeringSystem.arrive() is folded into MovementSystem.step() so the steering →
// movement boundary is a single in-order pass; the stub ShapeSolver/decision
// layers assign each agent's intent.target before that pass, and the contact
// stub is a no-op placeholder. WP 2 fills the decision layer; WP 3 the contact
// layer — neither reorders this loop.
//
// Frame capture is per micro-tick and SKIPPED when silent (Upgrade.md § 8.1),
// exactly like GameEvent.movements today — silent fixtures pay zero capture cost.
// Annotations are recorded ONLY when world.recordAnnotations (dev builds).

import type { MatchEvent } from '../../types/matchEvent';
import { step as movementStep } from './MovementSystem';
import { captureFrame } from './World';
import type { World } from './World';
import type { Frame, FrameAnnotation } from './types';

export interface SpatialRunResult {
  events: MatchEvent[];
  frames: Frame[];
}

// Run `ticks` micro-ticks over the World. `silent` mirrors the headless-fixture
// flag: when true, no Frame is captured (the substrate runs at zero observation
// cost).
//
// Two optional per-tick hooks let the caller drive the live Layer-1 logic
// in-loop without `run` importing the solver (WP2):
//   • `preMove`  — runs BEFORE the movement step, in the frozen ShapeSolver slot
//                  of the loop order. CarrySim uses it to RE-ANCHOR the defensive
//                  line onto the moving carrier each tick (Bug ③).
//   • `postMove` — runs AFTER the movement step and BEFORE frame capture, so its
//                  writes are recorded this tick. CarrySim uses it to COUPLE the
//                  ball to the carrier's freshly-moved position (Bug ②).
//   • `contact`  — runs AFTER postMove (WP3). Returns true when contact is
//                  detected, signalling the loop to stop early. The contact result
//                  is captured by the callback's closure; `run` stays contact-free.
// All hooks mutate the World in place — `run` never allocates per tick for them.
export function run(
  world: World,
  ticks: number,
  silent: boolean,
  preMove?: (world: World, t: number) => void,
  postMove?: (world: World, t: number) => void,
  contact?: (world: World, t: number) => boolean,
): SpatialRunResult {
  const frames: Frame[] = [];
  for (let t = 0; t < ticks; t++) {
    // Layer 1 (ShapeSolver) — re-anchor defenders onto the live carrier (Bug ③).
    if (preMove) preMove(world, t);

    // Steering + movement: arrive() is applied per agent inside movementStep,
    // in the frozen slot order, followed by clamp + soft separation.
    movementStep(world);

    // Post-movement bookkeeping: couple the ball to the carrier (Bug ②) so the
    // captured frame records the ball travelling with him. Then contact (WP3).
    if (postMove) postMove(world, t);

    if (!silent) {
      const frame = captureFrame(world, t);
      if (world.recordAnnotations) frame.annotations = recordAnnotations(world);
      frames.push(frame);
    }

    // Contact check (WP3): stop the loop early when a defender reaches the
    // carrier. The contact result is owned by the caller's closure.
    if (contact && contact(world, t)) break;
  }
  return { events: [], frames };
}

// Dev-only annotation capture (Upgrade.md § 9). In WP 1 the decision layer is a
// stub, so the only thing to surface is that Layer 1 (ROLE) drove every agent to
// its stub target. WP 2 replaces this with the real per-agent utility scores.
function recordAnnotations(world: World): Record<number, FrameAnnotation> {
  const out: Record<number, FrameAnnotation> = {};
  const agents = world.agents;
  for (let i = 0; i < agents.length; i++) {
    const intent = agents[i].intent;
    const target = intent.target;
    if (!target) continue;
    // The control layer that set this target this beat (Upgrade.md § 6): 1 ROLE
    // (ShapeSolver shape/fold), 2 DECIDE (ruck commitment — utility veto over the
    // shape), 3 REACT (contact hard interrupt — a beaten defender). The frame
    // debugger's "why is he there?" reads this; it never affects steering.
    out[i] = {
      layer: intent.driveLayer ?? 1,
      topScores: [{ option: `${intent.driveReason ?? 'shape'} → (${target.x.toFixed(1)},${target.y.toFixed(1)})`, score: 1 }],
    };
  }
  return out;
}
