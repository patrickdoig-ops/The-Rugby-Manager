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
import { setMatchSeed } from '../src/utils/rng.js';

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

import { solveDefence, solveCarryCorridor, solveAttackSpread, detectGap, detectOffside, reanchorDefence } from '../src/engine/spatial/ShapeSolver.js';
import { coupleBallToCarrier, seedFormation } from '../src/engine/spatial/World.js';
import { CARRY_CORRIDOR_TICKS } from '../src/engine/balance/spatialShape.js';
import { CONTACT_RADIUS, SEEDING_CLEAR_MARGIN, LAUNCH_GRACE_TICKS, LAUNCH_GRACE_DIST } from '../src/engine/balance/spatialTackle.js';
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
// Resolves a SINGLE contact check directly (no movement loop) — the carrier
// and defenders are already at their authored positions with authored velocities.
// This lets scenarios precisely control the geometry (who is chasing vs head-on)
// by seeding agent velocities directly.
//
// The ContactResult is computed exactly once from the authored positions/velocities.
// This is simpler than running a full movement loop and avoids the ShapeSolver
// repositioning agents away from where they were authored.

import { detectContact } from '../src/engine/spatial/ContactSystem.js';
import type { ContactResult, ContactOutcome } from '../src/engine/spatial/ContactSystem.js';
import { MAX_TICKS_AFTER_BREAK } from '../src/engine/balance/spatialShape.js';
import type { LineRole } from '../src/engine/spatial/ShapeSolver.js';

export interface ContactScenarioResult {
  // null when the carrier was not within contact radius of any defender.
  outcome: ContactOutcome | null;
  offloadAttempted: boolean;
  offloadCompleted: boolean;
  catcherSlot: number | null;
  tacklerSlot: number;
}

// Build a minimal LineRole array from the away agents (agents with side='away')
// so ContactSystem can iterate them without requiring a full ShapeSolver run.
function buildRolesFromWorld(world: World): LineRole[] {
  const roles: LineRole[] = [];
  for (let i = AGENTS_PER_SIDE; i < world.agents.length; i++) {
    const a = world.agents[i];
    if (a.role === 'empty') continue;
    roles.push({ agent: a, slotY: a.pos.y, isBackfield: false });
  }
  return roles;
}

// Resolve a single contact check with explicitly set carrier + defender
// positions and velocities. No movement step — pure contact evaluation.
// The carrier is the first home agent (index 0).
export function runContactScenario(world: World): ContactScenarioResult {
  const carrier = world.agents[0]; // home slot 1 = index 0
  const roles = buildRolesFromWorld(world);
  const result: ContactResult | null = detectContact(world, carrier, roles);
  if (!result) {
    return { outcome: null, offloadAttempted: false, offloadCompleted: false, catcherSlot: null, tacklerSlot: 0 };
  }
  return {
    outcome: result.outcome,
    offloadAttempted: result.offloadAttempted,
    offloadCompleted: result.offloadCompleted,
    catcherSlot: result.catcherSlot,
    tacklerSlot: result.tacklerSlot,
  };
}

// Helper: build a scenario world where the carrier and defender have explicit
// authored velocities so the geometry modifier fires correctly. Positions should
// be within CONTACT_RADIUS so detectContact fires immediately.
export interface ContactAgentSetup extends AgentSetup {
  vx?: number;  // authored velocity x (default 0)
  vy?: number;  // authored velocity y (default 0)
}

export function buildContactWorld(
  carrier: ContactAgentSetup,
  defenders: ContactAgentSetup[],
  supporters: ContactAgentSetup[] = [],
): World {
  // Build the world with carrier as home slot 1, defenders as away slots.
  const homePad: AgentSetup[] = [carrier, ...supporters.map(s => s as AgentSetup)];
  const awayPad: AgentSetup[] = defenders.map(d => d as AgentSetup);
  const world = buildScenarioWorld({
    home: homePad,
    away: awayPad,
    ball: { x: carrier.x, y: carrier.y },
  });
  // Stamp authored velocities.
  if (carrier.vx !== undefined || carrier.vy !== undefined) {
    world.agents[0].vel.x = carrier.vx ?? 0;
    world.agents[0].vel.y = carrier.vy ?? 0;
  }
  for (let i = 0; i < defenders.length; i++) {
    const d = defenders[i];
    if (d.vx !== undefined || d.vy !== undefined) {
      world.agents[AGENTS_PER_SIDE + i].vel.x = d.vx ?? 0;
      world.agents[AGENTS_PER_SIDE + i].vel.y = d.vy ?? 0;
    }
  }
  // Support runners: home agents beyond the carrier (indices 1, 2, ...).
  for (let i = 0; i < supporters.length; i++) {
    const s = supporters[i];
    if (s.vx !== undefined || s.vy !== undefined) {
      world.agents[1 + i].vel.x = s.vx ?? 0;
      world.agents[1 + i].vel.y = s.vy ?? 0;
    }
  }
  return world;
}

// Run N contact trials from a world-builder function and return the rate of
// a given outcome. Reseeds for each of SEEDS × trials.
export function contactRate(
  build: () => World,
  outcomeFilter: (r: ContactScenarioResult) => boolean,
  trials: number,
  seeds: number[],
): number {
  let hits = 0;
  let n = 0;
  for (const seed of seeds) {
    setMatchSeed(seed);
    for (let i = 0; i < trials; i++) {
      const world = build();
      const r = runContactScenario(world);
      if (r.outcome !== null) {
        n++;
        if (outcomeFilter(r)) hits++;
      }
    }
  }
  return n > 0 ? hits / n : 0;
}

// Needed for tick-count scenario (full movement loop version):
export function runContactWithMovement(
  world: World,
  tickBudget: number,
): { ticksRun: number; outcome: ContactOutcome | null; contactOccurred: boolean } {
  const carrier = world.agents[0];
  const roles = buildRolesFromWorld(world);
  // Give all agents a basic target so they move toward each other.
  let contactOccurred = false;
  let outcome: ContactOutcome | null = null;
  let brokenTackle = false;
  let ticksAfterBreak = 0;
  let ticksRun = 0;
  let stopped = false;

  const contactHook = (_w: World, _t: number): boolean => {
    const result = detectContact(world, carrier, roles);
    if (!result) return false;
    ticksRun = _t + 1;
    if (result.outcome === 'broken_tackle') {
      brokenTackle = true;
      ticksAfterBreak = 0;
      return false;
    }
    contactOccurred = true;
    outcome = result.outcome;
    return true;
  };

  for (let t = 0; t < tickBudget && !stopped; t++) {
    if (ticksRun === 0) ticksRun = t + 1; // update each tick
    run(world, 1, true, undefined, undefined, contactHook);
    if (contactOccurred) {
      stopped = true;
    } else if (brokenTackle) {
      ticksAfterBreak++;
      if (ticksAfterBreak >= MAX_TICKS_AFTER_BREAK) stopped = true;
    } else {
      ticksRun = t + 1;
    }
  }
  return { ticksRun, outcome, contactOccurred };
}

// ── WP3 contact-timing regression helpers ─────────────────────────────────

// Run the full seeding pipeline (solveDefence + solveCarryCorridor +
// solveAttackSpread + seedFormation) on an authored world and return the
// minimum distance from the carrier to any non-corridor, non-empty defender
// at t=0 (immediately after seeding, before any ticks). The seeding guard
// asserts this is always ≥ CONTACT_RADIUS + SEEDING_CLEAR_MARGIN.
export function minDefenderDistAtSeed(
  world: World,
  params: Partial<ShapeParams> = {},
): number {
  const p: ShapeParams = {
    attackSide: 'home',
    defendSide: 'away',
    attackDir: 1,
    mark: { x: world.ball.pos.x, y: world.ball.pos.y },
    defensiveLine: 'blitz',  // worst case: shallowest standOff (2.0u)
    backfield: 2,
    defendDiscipline: 'balanced',
    carrierSlot: 1,
    ...params,
  };
  solveDefence(world, p);
  const carrier = solveCarryCorridor(world, p);
  solveAttackSpread(world, p);
  seedFormation(world, { attackDir: p.attackDir, mark: p.mark, carrierSlot: p.carrierSlot });
  // Measure minimum distance from carrier to any active defender.
  let minDist = Infinity;
  for (const a of world.agents) {
    if (a.side === p.attackSide) continue;  // skip attackers
    if (a.role === 'corridor' || a.role === 'empty') continue;
    const d = Math.hypot(a.pos.x - carrier.pos.x, a.pos.y - carrier.pos.y);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// Run a carry with the launch-grace gate active (mirroring CarrySim's contact
// hook). Returns the tick index at which contact first fired, or null if the
// carry completed without contact. Used to assert no contact fires before
// LAUNCH_GRACE_TICKS ticks AND LAUNCH_GRACE_DIST units of carrier travel.
export function runCarryWithLaunchGrace(
  world: World,
  params: Partial<ShapeParams> = {},
): { contactTick: number | null; contactDist: number | null } {
  const p: ShapeParams = {
    attackSide: 'home',
    defendSide: 'away',
    attackDir: 1,
    mark: { x: world.ball.pos.x, y: world.ball.pos.y },
    defensiveLine: 'blitz',
    backfield: 2,
    defendDiscipline: 'balanced',
    carrierSlot: 1,
    ...params,
  };
  const roles = solveDefence(world, p);
  const carrier = solveCarryCorridor(world, p);
  solveAttackSpread(world, p);
  seedFormation(world, { attackDir: p.attackDir, mark: p.mark, carrierSlot: p.carrierSlot });
  const startX = carrier.pos.x;
  const startY = carrier.pos.y;
  let contactTick: number | null = null;
  let contactDist: number | null = null;
  let ticksRun = 0;
  let stopped = false;
  for (let t = 0; t < CARRY_CORRIDOR_TICKS && !stopped; t++) {
    ticksRun++;
    run(
      world,
      1,
      true,
      () => reanchorDefence(roles, carrier, p),
      () => coupleBallToCarrier(world, carrier),
    );
    const elapsed = ticksRun;
    const carrierDist = Math.hypot(carrier.pos.x - startX, carrier.pos.y - startY);
    if (elapsed >= LAUNCH_GRACE_TICKS && carrierDist >= LAUNCH_GRACE_DIST) {
      const result = detectContact(world, carrier, roles);
      if (result && result.outcome !== 'broken_tackle') {
        contactTick = elapsed;
        contactDist = carrierDist;
        stopped = true;
      }
    }
  }
  return { contactTick, contactDist };
}

// Re-export the constants so scenarios can reference the same values.
export { CONTACT_RADIUS, SEEDING_CLEAR_MARGIN, LAUNCH_GRACE_TICKS, LAUNCH_GRACE_DIST };

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
