// Movement integration — advances every agent one micro-tick at 10 Hz
// (Upgrade.md § 5.1). Reads the desired velocity the steering layer wrote into
// each agent's intent-derived target, ramps the current velocity toward it
// under the agent's acceleration cap, integrates pos += vel·dt, applies soft
// separation, and clamps to the on-field bands.
//
// Zero allocation: reuses the World's scratch vectors, mutates agents in place,
// iterates the fixed array in slot order home-then-away (the frozen contract,
// Upgrade.md § 11). No magic literals — all tuning in balance/spatialSteering.ts.

import {
  SPATIAL_DT,
  SPATIAL_CLAMP_X_MIN,
  SPATIAL_CLAMP_X_MAX,
  SPATIAL_CLAMP_Y_MIN,
  SPATIAL_CLAMP_Y_MAX,
  deriveAccel,
} from '../balance/spatialSteering';
import { arrive, separation } from './SteeringSystem';
import type { World } from './World';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// One movement step for the whole World. For each agent in the frozen order:
// 1. desired velocity = arrive(target) (zero if no target),
// 2. velocity ramps toward desired under the accel cap (·dt),
// 3. soft separation push is added to the velocity,
// 4. pos += vel·dt, then clamp to the pitch bands.
export function step(world: World): void {
  const agents = world.agents;
  const desired = world.scratchA;
  const sep = world.scratchB;
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];

    if (agent.intent.target) {
      arrive(agent, agent.intent.target, desired);
      // Per-beat top-speed multiplier (ShapeSolver fold speed). 1 for every
      // agent unless a slow fold scaled it down — applied to the desired
      // velocity so a gassed defender folds in slower (Upgrade.md § 5.2).
      if (agent.speedScale !== 1) {
        desired.x *= agent.speedScale;
        desired.y *= agent.speedScale;
      }
    } else {
      desired.x = 0;
      desired.y = 0;
    }

    // Ramp current velocity toward desired, capped by the per-tick accel budget.
    const accelStep = deriveAccel(agent.agility, agent.pace) * SPATIAL_DT;
    let dvx = desired.x - agent.vel.x;
    let dvy = desired.y - agent.vel.y;
    const dvMag = Math.sqrt(dvx * dvx + dvy * dvy);
    if (dvMag > accelStep && dvMag > 1e-6) {
      const scale = accelStep / dvMag;
      dvx *= scale;
      dvy *= scale;
    }
    agent.vel.x += dvx;
    agent.vel.y += dvy;

    // Soft separation — added directly to velocity so stacked dots drift apart.
    separation(agent, world, sep);
    agent.vel.x += sep.x;
    agent.vel.y += sep.y;

    // Integrate and clamp.
    agent.pos.x = clamp(agent.pos.x + agent.vel.x * SPATIAL_DT, SPATIAL_CLAMP_X_MIN, SPATIAL_CLAMP_X_MAX);
    agent.pos.y = clamp(agent.pos.y + agent.vel.y * SPATIAL_DT, SPATIAL_CLAMP_Y_MIN, SPATIAL_CLAMP_Y_MAX);
  }
}
