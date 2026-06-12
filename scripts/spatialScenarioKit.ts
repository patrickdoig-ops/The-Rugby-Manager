// Shared kit for the spatial harnesses (checkSpatialScenarios.ts,
// checkDeterminism.ts trajectory hash). Builds a stub World directly from
// authored agent setups — without a full MatchState — so the substrate can be
// exercised in isolation while it runs dark (Upgrade.md § 11).
//
// The World shape and iteration order here are exactly those of
// src/engine/spatial/World.ts (home 1–15 then away 1–15); this kit only fills
// the agents from a compact data setup instead of from onFieldPlayers.

import { createHash } from 'node:crypto';
import { AGENT_COUNT, AGENTS_PER_SIDE } from '../src/engine/spatial/World.js';
import type { World } from '../src/engine/spatial/World.js';
import { run } from '../src/engine/spatial/SpatialSimulator.js';
import type { Agent, Vec2 } from '../src/engine/spatial/types.js';
import type { PossessionSide } from '../src/types/engine.js';

export interface AgentSetup {
  x: number;
  y: number;
  pace?: number;
  agility?: number;
  stamina?: number;
  positioning?: number;
  tackling?: number;
  discipline?: number;
  fatigue?: number;
  target?: { x: number; y: number } | null;
}

export interface ScenarioSetup {
  home: AgentSetup[]; // index i → home slot i+1
  away: AgentSetup[]; // index i → away slot i+1
  ball?: { x: number; y: number };
}

function makeAgent(side: PossessionSide, slot: number, s: AgentSetup): Agent {
  return {
    slot,
    side,
    pos: { x: s.x, y: s.y },
    vel: { x: 0, y: 0 },
    role: 'idle',
    intent: { target: s.target ? { x: s.target.x, y: s.target.y } : null },
    fatigueSnapshot: s.fatigue ?? 0,
    pace: s.pace ?? 10,
    agility: s.agility ?? 10,
    stamina: s.stamina ?? 10,
    positioning: s.positioning ?? 10,
    tackling: s.tackling ?? 10,
    discipline: s.discipline ?? 10,
    speedScale: 1,
  };
}

// Pad a side's setup to a full 15 agents, parking unfilled slots off in the
// corner with no target so they sit still and never interfere.
function fillSide(side: PossessionSide, setups: AgentSetup[]): Agent[] {
  const out: Agent[] = new Array(AGENTS_PER_SIDE);
  for (let i = 0; i < AGENTS_PER_SIDE; i++) {
    const s = setups[i] ?? { x: 2, y: 3, target: null };
    out[i] = makeAgent(side, i + 1, s);
  }
  return out;
}

export function buildScenarioWorld(setup: ScenarioSetup): World {
  const home = fillSide('home', setup.home);
  const away = fillSide('away', setup.away);
  const agents: Agent[] = new Array(AGENT_COUNT);
  for (let i = 0; i < AGENTS_PER_SIDE; i++) agents[i] = home[i];
  for (let i = 0; i < AGENTS_PER_SIDE; i++) agents[AGENTS_PER_SIDE + i] = away[i];
  return {
    agents,
    ball: { pos: { x: setup.ball?.x ?? 50, y: setup.ball?.y ?? 50 }, vel: { x: 0, y: 0 }, height: 0 },
    scratchA: { x: 0, y: 0 },
    scratchB: { x: 0, y: 0 },
    recordAnnotations: false,
  };
}

// Run N micro-ticks over a scenario world. Targets are fixed in the setup, so no
// per-tick intent callback is needed (the WP 1 stub holds each agent's authored
// target). Returns the world for predicate assertions.
export function runScenario(world: World, ticks: number): World {
  run(world, ticks, true);
  return world;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── WP2 carry scenario driver ─────────────────────────────────────────────
// Builds a defensive shape + carry corridor from an authored World, runs the
// micro-ticks, and returns the spatial line-break + offside verdict. Lets the
// scenario suite assert fold-overlap / 2-on-1 / rush / offside behaviour against
// the real ShapeSolver. The World here is authored directly (not from
// MatchState), so the caller seeds agent positions/attrs to stage the picture.

import { solveDefence, solveCarryCorridor, detectGap, detectOffside } from '../src/engine/spatial/ShapeSolver.js';
import { CARRY_CORRIDOR_TICKS } from '../src/engine/balance/spatialShape.js';
import type { ShapeParams } from '../src/engine/spatial/ShapeSolver.js';

export interface CarryScenarioResult {
  lineBreak: boolean;
  offsidePenalty: boolean;
}

// Resolve one authored carry: solve the defence + corridor, run the ticks, and
// return the verdict. `params` overrides default mark/direction/tactics;
// `modShift` is the net carry modifier the gap threshold reads (0 = neutral).
export function runCarryScenario(
  world: World,
  params: Partial<ShapeParams> = {},
  modShift = 0,
): CarryScenarioResult {
  const p: ShapeParams = {
    attackSide: 'home',
    defendSide: 'away',
    attackDir: 1,
    mark: { x: world.ball.pos.x, y: world.ball.pos.y },
    defensiveLine: 'hybrid',
    backfield: 2,
    defendDiscipline: 'balanced',
    carrierSlot: 1,
    ...params,
  };
  const roles = solveDefence(world, p);
  const carrier = solveCarryCorridor(world, p);
  run(world, CARRY_CORRIDOR_TICKS, true);
  const gap = detectGap(carrier, roles, modShift, p.attackDir);
  const offside = detectOffside(roles, p, gap.nearestDefender);
  return { lineBreak: gap.lineBreak, offsidePenalty: offside !== null };
}

// Hash every agent position at every tick of a dark-mode run — the trajectory
// fingerprint that checkDeterminism.ts asserts is seed-stable.
export function hashTrajectory(world: World, ticks: number): string {
  const h = createHash('sha256');
  const buf: number[] = [];
  for (let t = 0; t < ticks; t++) {
    run(world, 1, true);
    for (let i = 0; i < world.agents.length; i++) {
      buf.push(world.agents[i].pos.x, world.agents[i].pos.y);
    }
  }
  // Quantise to 6 dp so float-print noise can't desync an otherwise-identical run.
  h.update(buf.map(v => v.toFixed(6)).join(','));
  return h.digest('hex');
}
