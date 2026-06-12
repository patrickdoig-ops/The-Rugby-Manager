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
    speedScale: 1,
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
    } else {
      agent.pos.x = state.ball.x;
      agent.pos.y = state.ball.y;
      agent.fatigueSnapshot = 0;
      agent.pace = 10;
      agent.agility = 10;
      agent.stamina = 10;
      agent.positioning = 10;
      agent.tackling = 10;
      agent.discipline = 10;
    }
    agent.vel.x = 0;
    agent.vel.y = 0;
    agent.role = 'idle';
    agent.intent.target = null;
    agent.speedScale = 1;
  }
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
