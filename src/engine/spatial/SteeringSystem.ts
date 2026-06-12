// Steering behaviours — seek, arrive, soft separation (Upgrade.md § 5.1).
//
// Pure functions over the World: each WRITES a desired velocity into a caller-
// supplied scratch vector (no allocation). All tuning lives in
// balance/spatialSteering.ts — no magic literals here (CLAUDE.md balance rule).
//
// Coordinates are the existing 0–100 pitch space (Upgrade.md § 2.6).

import {
  ARRIVE_SLOW_RADIUS,
  ARRIVE_STOP_RADIUS,
  SEPARATION_RADIUS,
  SEPARATION_STRENGTH,
  deriveTopSpeed,
} from '../balance/spatialSteering';
import type { Agent, Vec2 } from './types';
import type { World } from './World';

// Desired velocity toward `target` at full top speed (no arrival slowing).
// Writes into `out` and returns it. If already on the target, out is zeroed.
export function seek(agent: Agent, target: Vec2, out: Vec2): Vec2 {
  const dx = target.x - agent.pos.x;
  const dy = target.y - agent.pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < ARRIVE_STOP_RADIUS) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const speed = deriveTopSpeed(agent.pace, agent.fatigueSnapshot);
  const inv = speed / dist;
  out.x = dx * inv;
  out.y = dy * inv;
  return out;
}

// Like seek but ramps the desired speed down linearly inside the slowing radius
// so the agent settles on the target rather than overshooting (Upgrade.md § 5.1).
export function arrive(agent: Agent, target: Vec2, out: Vec2): Vec2 {
  const dx = target.x - agent.pos.x;
  const dy = target.y - agent.pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < ARRIVE_STOP_RADIUS) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const top = deriveTopSpeed(agent.pace, agent.fatigueSnapshot);
  const speed = dist < ARRIVE_SLOW_RADIUS ? top * (dist / ARRIVE_SLOW_RADIUS) : top;
  const inv = speed / dist;
  out.x = dx * inv;
  out.y = dy * inv;
  return out;
}

// Soft separation: sum a push away from every neighbour inside SEPARATION_RADIUS,
// strength ramping linearly from SEPARATION_STRENGTH at zero distance to 0 at the
// radius edge. Writes the accumulated push velocity into `out`. Iterates the
// fixed agent array in slot order (home then away) — part of the frozen order.
export function separation(self: Agent, world: World, out: Vec2): Vec2 {
  out.x = 0;
  out.y = 0;
  const agents = world.agents;
  for (let i = 0; i < agents.length; i++) {
    const other = agents[i];
    if (other === self) continue;
    const dx = self.pos.x - other.pos.x;
    const dy = self.pos.y - other.pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= SEPARATION_RADIUS * SEPARATION_RADIUS) continue;
    const dist = Math.sqrt(distSq);
    if (dist < 1e-6) continue; // exactly stacked — leave to RNG jitter / next tick
    const push = SEPARATION_STRENGTH * (1 - dist / SEPARATION_RADIUS) / dist;
    out.x += dx * push;
    out.y += dy * push;
  }
  return out;
}
