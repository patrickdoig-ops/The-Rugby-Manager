// The spatial World — engine-internal, never part of MatchState, never saved,
// never range-checked by assertInvariants (Upgrade.md § 3). It holds a
// pre-allocated 30-agent array in the FROZEN iteration order — home slots 1–15
// then away slots 1–15 — plus the ball and reusable scratch vectors for the
// zero-allocation micro-tick loop (CLAUDE.md § 3 GC-churn rules).
//
// The array is allocated ONCE (buildWorld) and re-initialised in place
// (resetWorld) whenever spatial play resumes — no per-rebuild allocation. The
// World is always reconstructable from MatchState, so mid-match state is
// unchanged: no save-schema change anywhere in the spatial plan (Upgrade.md § 3).

import type { MatchState } from '../../types/match';
import type { Team } from '../../types/team';
import type { PossessionSide } from '../../types/engine';
import { onFieldPlayers } from '../FieldPosition';
import { STARTING_XV_MAX } from '../Slot';
import { EMPTY_SLOT_PARK, FORMATION_STAGGER, CARRY_CORRIDOR } from '../balance/spatialShape';
import { CONTACT_RADIUS, SEEDING_CLEAR_MARGIN } from '../balance/spatialTackle';
import type { Agent, SpatialBall, Vec2, Frame } from './types';

export const AGENTS_PER_SIDE = STARTING_XV_MAX; // 15
export const AGENT_COUNT = AGENTS_PER_SIDE * 2; // 30

export interface World {
  // Fixed length 30. Index 0–14 = home slots 1–15, 15–29 = away slots 1–15.
  // This order IS the determinism contract inherited by WPs 2–8 (Upgrade.md
  // § 11) — mirrors the home-then-away convention in FatigueAccumulator.
  agents: Agent[];
  ball: SpatialBall;
  // Reused scratch vectors — the steering/movement systems write into these
  // in place every tick so nothing is allocated inside the loop.
  scratchA: Vec2;
  scratchB: Vec2;
  // Dev-only flag. When true the SpatialSimulator records per-tick decision
  // annotations into each captured Frame for the frame debugger. NEVER set in
  // production or silent paths (Upgrade.md § 9).
  recordAnnotations: boolean;
}

function makeAgent(side: PossessionSide): Agent {
  return {
    slot: 0,
    side,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    role: 'idle',
    intent: { target: null },
    fatigueSnapshot: 0,
    pace: 10,
    agility: 10,
    stamina: 10,
    positioning: 10,
    tackling: 10,
    discipline: 10,
    strength: 10,
    handling: 10,
    speedScale: 1,
    recoveryLockout: false,
  };
}

// Allocate the World once. Agent identity (side) is fixed by index; the rest is
// filled by resetWorld from MatchState. The 30 agents and their pos/vel/intent
// vectors are the only allocations — done here, never in the micro-tick loop.
export function buildWorld(state: MatchState): World {
  const agents: Agent[] = new Array(AGENT_COUNT);
  for (let i = 0; i < AGENTS_PER_SIDE; i++) agents[i] = makeAgent('home');
  for (let i = 0; i < AGENTS_PER_SIDE; i++) agents[AGENTS_PER_SIDE + i] = makeAgent('away');
  const world: World = {
    agents,
    ball: { pos: { x: 50, y: 50 }, vel: { x: 0, y: 0 }, height: 0 },
    scratchA: { x: 0, y: 0 },
    scratchB: { x: 0, y: 0 },
    recordAnnotations: false,
  };
  resetWorld(world, state);
  return world;
}

// Re-initialise the World in place from MatchState — no reallocation. On-field
// players are resolved through onFieldPlayers (so sin-binned / injured / subbed
// players are excluded, matching every other engine consumer) and mapped onto
// the fixed slot array. An empty slot (a side reduced below 15) is parked at the
// ball with zeroed velocity — a stub-safe default until WP 2 owns positioning.
export function resetWorld(world: World, state: MatchState): void {
  initSide(world, state, state.homeTeam, 'home', 0);
  initSide(world, state, state.awayTeam, 'away', AGENTS_PER_SIDE);

  const ball = world.ball;
  ball.pos.x = state.ball.x;
  ball.pos.y = state.ball.y;
  ball.vel.x = 0;
  ball.vel.y = 0;
  ball.height = 0;
  ball.carrierSlot = undefined;
  ball.carrierSide = undefined;
}

function initSide(world: World, state: MatchState, team: Team, side: PossessionSide, base: number): void {
  const onField = onFieldPlayers(team, state, side);
  // Index by matchday slot (player.id 1–15) so agent[base + slot-1] is always
  // the same jersey — positional identity, the frame-stream contract (§ 8.1).
  for (let slot = 1; slot <= AGENTS_PER_SIDE; slot++) {
    const agent = world.agents[base + slot - 1];
    agent.slot = slot;
    agent.side = side;
    const player = onField.find(p => p.id === slot);
    if (player) {
      agent.pos.x = state.ball.x;
      agent.pos.y = state.ball.y;
      agent.fatigueSnapshot = player.fatiguePct;
      // baseStats are the authored play-ready values (CLAUDE.md). The fatigue
      // curve is applied separately in the speed derivation via fatigueSnapshot,
      // so we read the un-fatigued attribute here, not currentStats.
      agent.pace = player.baseStats.pace;
      agent.agility = player.baseStats.agility;
      agent.stamina = player.baseStats.stamina;
      agent.positioning = player.baseStats.positioning;
      agent.tackling = player.baseStats.tackling;
      agent.discipline = player.baseStats.discipline;
      agent.strength = player.baseStats.strength;
      agent.handling = player.baseStats.handling;
      agent.role = 'idle';
    } else {
      // No on-field player in this slot (a side reduced below 15 by a card).
      // Mark it 'empty' so the ShapeSolver skips it entirely — it never joins
      // the formation, the line, or the gap/offside contest. seedFormation
      // parks it off the ball; defaults here keep it harmless if not seeded.
      agent.pos.x = state.ball.x;
      agent.pos.y = state.ball.y;
      agent.fatigueSnapshot = 0;
      agent.pace = 10;
      agent.agility = 10;
      agent.stamina = 10;
      agent.positioning = 10;
      agent.tackling = 10;
      agent.discipline = 10;
      agent.strength = 10;
      agent.handling = 10;
      agent.role = 'empty';
    }
    agent.vel.x = 0;
    agent.vel.y = 0;
    agent.intent.target = null;
    agent.speedScale = 1;
    agent.recoveryLockout = false;
  }
}

// Inputs seedFormation needs to place the carrier + support pod at their OPENING
// start (the mark / just behind it) — a subset of ShapeParams, kept narrow so
// World.ts does not import the solver's full param type.
export interface SeedParams {
  attackDir: 1 | -1;
  mark: { x: number; y: number };
  carrierSlot: number;
}

// Snap every agent to the formation the ShapeSolver assigned (its intent.target)
// at beat start, replacing the on-ball stub that resetWorld leaves. Called by
// CarrySim AFTER solveDefence + solveCarryCorridor + solveAttackSpread have set
// every active agent's target — so the beat OPENS in a believable rugby shape
// (defensive line + backfield, carrier + support pod, forward cluster + backline
// spread) instead of 30 dots piled on the ball blooming outward. Engine-internal
// position writes, exactly like resetWorld (never via applyMatchEvent — only
// spatial OUTCOMES cross that boundary). Run once per beat, never in the tick
// loop. Empty slots (role 'empty') carry no target — park them off the ball in a
// deep corner so they never form a phantom on-ball pile.
export function seedFormation(world: World, p: SeedParams): void {
  for (const agent of world.agents) {
    if (agent.role === 'corridor') {
      // Carrier + support pod: their intent.target is a RUN destination up the
      // corridor, NOT a formation slot. Seed the carrier AT the mark and each
      // support runner just behind the mark at the lateral channel its target
      // encodes — so they open near the ball and run forward, never teleport
      // downfield onto the target.
      if (agent.slot === p.carrierSlot) {
        agent.pos.x = clampX(p.mark.x);
        agent.pos.y = clampY(p.mark.y);
      } else {
        agent.pos.x = clampX(p.mark.x - p.attackDir * CARRY_CORRIDOR.supportDepth);
        agent.pos.y = agent.intent.target ? agent.intent.target.y : clampY(p.mark.y);
      }
      agent.vel.x = 0;
      agent.vel.y = 0;
      continue;
    }
    if (agent.role === 'empty') {
      // Deep corner near the agent's own try line, oriented by attackDir. The
      // attack runs toward +attackDir, so "own line" for an attacker is the
      // -attackDir end; defenders mirror but a deep-corner park is fine for
      // either side as a non-interfering hold.
      agent.pos.x = p.attackDir === 1 ? EMPTY_SLOT_PARK.backDepth : 100 - EMPTY_SLOT_PARK.backDepth;
      agent.pos.y = EMPTY_SLOT_PARK.sideY;
      agent.vel.x = 0;
      agent.vel.y = 0;
      agent.intent.target = null;
      continue;
    }
    const target = agent.intent.target;
    if (!target) continue; // an active agent the solver chose to hold (rare)
    // Snap onto the formation slot with a small DETERMINISTIC slot-keyed stagger
    // so the line/spread is not a ruler-straight wall. No rngSpatial here — a
    // random draw would shift the beat's downstream gap/offside stream. The
    // pattern alternates depth + lateral by slot so adjacent dots stagger.
    const s = agent.slot;
    const depthSign = s % 2 === 0 ? 1 : -1;
    const latSign = (s % 4 < 2) ? 1 : -1;
    agent.pos.x = target.x + depthSign * (FORMATION_STAGGER / 2);
    agent.pos.y = target.y + latSign * (FORMATION_STAGGER / 2);
    agent.vel.x = 0;
    agent.vel.y = 0;
  }

  // ── Seeding clear-space guard (WP3 contact-timing fix) ──────────────────
  // After all agents are snapped onto their formation slots, ensure no defender
  // is within CONTACT_RADIUS + SEEDING_CLEAR_MARGIN of the carrier at t=0.
  // The carrier was seeded at the mark; defenders folding to a shallow standOff
  // (blitz tactic: 2.0u) can land inside contact range before the carry starts.
  // Nudge any such defender away along attackDir so every carry opens in space.
  const clearDist = CONTACT_RADIUS + SEEDING_CLEAR_MARGIN;
  // Find the carrier agent to get its seeded position.
  let carrierX = clampX(p.mark.x);
  let carrierY = clampY(p.mark.y);
  for (const agent of world.agents) {
    if (agent.role === 'corridor' && agent.slot === p.carrierSlot) {
      carrierX = agent.pos.x;
      carrierY = agent.pos.y;
      break;
    }
  }
  for (const agent of world.agents) {
    if (agent.role === 'corridor' || agent.role === 'empty') continue;
    const dx = agent.pos.x - carrierX;
    const dy = agent.pos.y - carrierY;
    const d = Math.hypot(dx, dy);
    if (d < clearDist) {
      // Nudge the defender away along attackDir until outside the clear zone.
      // Move along x (the axis the defender should be ahead of the carrier on).
      agent.pos.x = clampX(carrierX + p.attackDir * clearDist);
    }
  }
}

function clampX(v: number): number {
  return v < 2 ? 2 : v > 98 ? 98 : v;
}
function clampY(v: number): number {
  return v < 3 ? 3 : v > 97 ? 97 : v;
}

// Glue the ball to the carrier (Bug ②, Upgrade.md § 5.3). Called each micro-tick
// (SpatialSimulator's postMove hook) AFTER the movement step so the captured
// frame records the ball travelling with the carrier instead of frozen at the
// mark. ALLOCATION-FREE: mutates ball.pos in place and stamps carrierSlot/
// carrierSide so captureFrame records WHO holds it. Engine-internal position
// write, exactly like resetWorld/seedFormation — the spatial ball is never part
// of MatchState (only spatial OUTCOMES cross applyMatchEvent).
export function coupleBallToCarrier(world: World, carrier: Agent): void {
  const ball = world.ball;
  ball.pos.x = carrier.pos.x;
  ball.pos.y = carrier.pos.y;
  ball.carrierSlot = carrier.slot;
  ball.carrierSide = carrier.side;
}

// Capture the World's current positions into a fresh Frame (Upgrade.md § 8.1).
// The ONLY per-tick allocation, and only on the live (non-silent) path. Dot
// order matches world.agents exactly: home 1–15 then away 1–15.
export function captureFrame(world: World, t: number): Frame {
  const dots = new Array(AGENT_COUNT);
  for (let i = 0; i < AGENT_COUNT; i++) {
    dots[i] = { x: world.agents[i].pos.x, y: world.agents[i].pos.y };
  }
  const ball = world.ball;
  return {
    t,
    ball: { x: ball.pos.x, y: ball.pos.y, h: ball.height, carrierSlot: ball.carrierSlot },
    dots,
  };
}
