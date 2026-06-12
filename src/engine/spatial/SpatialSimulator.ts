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
// cost). `setIntent` is the WP 1 stand-in for the decision layer — the caller
// (scenario harness, determinism hash, probe) supplies per-tick targets via the
// stub; WP 2 replaces it with the real ShapeSolver + DecisionSystem.
export function run(
  world: World,
  ticks: number,
  silent: boolean,
  setIntent?: (world: World, t: number) => void,
): SpatialRunResult {
  const frames: Frame[] = [];
  for (let t = 0; t < ticks; t++) {
    // Layer 1 (ShapeSolver) + Layers 2–3 (decision) — stubbed in WP 1: the
    // supplied callback assigns each agent's intent.target. No-op if absent.
    if (setIntent) setIntent(world, t);

    // Steering + movement: arrive() is applied per agent inside movementStep,
    // in the frozen slot order, followed by clamp + soft separation.
    movementStep(world);

    // Contact (stub) — WP 3. No detection, no events in WP 1.

    if (!silent) {
      const frame = captureFrame(world, t);
      if (world.recordAnnotations) frame.annotations = recordAnnotations(world);
      frames.push(frame);
    }
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
    const target = agents[i].intent.target;
    if (!target) continue;
    out[i] = {
      layer: 1,
      topScores: [{ option: `arrive(${target.x.toFixed(1)},${target.y.toFixed(1)})`, score: 1 }],
    };
  }
  return out;
}
