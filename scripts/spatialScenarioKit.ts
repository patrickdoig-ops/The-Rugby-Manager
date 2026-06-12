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
  strength?: number;
  handling?: number;
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
    strength: s.strength ?? 50,
    handling: s.handling ?? 50,
    speedScale: 1,
    recoveryLockout: false,
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

import { solveDefence, solveCarryCorridor, detectGap, detectOffside, reanchorDefence } from '../src/engine/spatial/ShapeSolver.js';
import { coupleBallToCarrier } from '../src/engine/spatial/World.js';
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
  // Same per-tick hooks the live CarrySim uses: re-anchor the line onto the live
  // carrier (Bug ③) and couple the ball to him (Bug ②), so the scenario suite +
  // the determinism trajectory hash exercise the real carry loop.
  run(
    world,
    CARRY_CORRIDOR_TICKS,
    true,
    () => reanchorDefence(roles, carrier, p),
    () => coupleBallToCarrier(world, carrier),
  );
  const gap = detectGap(carrier, roles, modShift, p.attackDir);
  const offside = detectOffside(roles, p, gap.nearestDefender);
  return { lineBreak: gap.lineBreak, offsidePenalty: offside !== null };
}

// Resolve one authored carry and report the ball's total path length over the
// beat (Bug ② regression guard). Drives the carry tick-by-tick with the same
// hooks the live CarrySim uses, summing the per-tick ball displacement. A frozen
// ball (the Bug ② symptom) returns 0; a coupled ball tracks the carrier's run.
export function runCarryBallPath(
  world: World,
  params: Partial<ShapeParams> = {},
): { ballPathLen: number; carrierMoved: number; carrierSlot: number | undefined } {
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
  const carrierStartX = carrier.pos.x;
  const carrierStartY = carrier.pos.y;
  let prevBallX = world.ball.pos.x;
  let prevBallY = world.ball.pos.y;
  let ballPathLen = 0;
  for (let t = 0; t < CARRY_CORRIDOR_TICKS; t++) {
    run(
      world,
      1,
      true,
      () => reanchorDefence(roles, carrier, p),
      () => coupleBallToCarrier(world, carrier),
    );
    ballPathLen += Math.hypot(world.ball.pos.x - prevBallX, world.ball.pos.y - prevBallY);
    prevBallX = world.ball.pos.x;
    prevBallY = world.ball.pos.y;
  }
  const carrierMoved = Math.hypot(carrier.pos.x - carrierStartX, carrier.pos.y - carrierStartY);
  return { ballPathLen, carrierMoved, carrierSlot: world.ball.carrierSlot };
}

// ── WP3 contact scenario driver ───────────────────────────────────────────
// Runs a single carry and returns the ContactResult verdict (or null if no
// contact was detected). Allows scenario assertions on evasion, collision
// dominance, and offload window without going through the full MatchState.

import { detectContact } from '../src/engine/spatial/ContactSystem.js';
import type { ContactResult, ContactOutcome } from '../src/engine/spatial/ContactSystem.js';
import { MAX_TICKS_AFTER_BREAK } from '../src/engine/balance/spatialShape.js';

export interface ContactScenarioResult {
  contactOccurred: boolean;
  contactOutcome: ContactOutcome | null;
  offloadAttempted: boolean;
  offloadCompleted: boolean;
  catcherSlot: number | null;
  tacklerSlot: number;
  ticksRun: number;
}

// Run a single carry beat and return the contact verdict.
// `carrier` is the home agent (slot index in setup.home), `defenderIndex`
// is the away agent index to treat as a line defender for contact checks.
// The World is already built from `setup` and positioned; this runs the micro-
// tick loop with the real ContactSystem (same as CarrySim, but without the
// full ShapeSolver so we can author controlled scenarios).
export function runContactScenario(
  world: World,
  carrierSlotIndex: number,  // 0-based index into home agents
  params: Partial<ShapeParams> = {},
): ContactScenarioResult {
  const p: ShapeParams = {
    attackSide: 'home',
    defendSide: 'away',
    attackDir: 1,
    mark: { x: world.ball.pos.x, y: world.ball.pos.y },
    defensiveLine: 'hybrid',
    backfield: 2,
    defendDiscipline: 'balanced',
    carrierSlot: carrierSlotIndex + 1,
    ...params,
  };

  const roles = solveDefence(world, p);
  const carrier = solveCarryCorridor(world, p);
  coupleBallToCarrier(world, carrier);

  let contactOccurred = false;
  let contactOutcome: ContactOutcome | null = null;
  let offloadAttempted = false;
  let offloadCompleted = false;
  let catcherSlot: number | null = null;
  let tacklerSlot = 0;
  let brokenTackle = false;
  let ticksAfterBreak = 0;
  let ticksRun = 0;
  let stopped = false;

  const contactHook = (_w: World, _t: number): boolean => {
    const result: ContactResult | null = detectContact(world, carrier, roles);
    if (!result) return false;
    if (result.outcome === 'broken_tackle') {
      brokenTackle = true;
      ticksAfterBreak = 0;
      tacklerSlot = result.tacklerSlot;
      return false;
    }
    contactOccurred = true;
    contactOutcome = result.outcome;
    tacklerSlot = result.tacklerSlot;
    offloadAttempted = result.offloadAttempted;
    offloadCompleted = result.offloadCompleted;
    catcherSlot = result.catcherSlot;
    return true;
  };

  for (let t = 0; t < CARRY_CORRIDOR_TICKS && !stopped; t++) {
    ticksRun++;
    run(world, 1, true, () => reanchorDefence(roles, carrier, p), () => coupleBallToCarrier(world, carrier), contactHook);
    if (contactOccurred) {
      stopped = true;
    } else if (brokenTackle) {
      ticksAfterBreak++;
      if (ticksAfterBreak >= MAX_TICKS_AFTER_BREAK) stopped = true;
    }
  }

  return { contactOccurred, contactOutcome, offloadAttempted, offloadCompleted, catcherSlot, tacklerSlot, ticksRun };
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
