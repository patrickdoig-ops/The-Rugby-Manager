// WP3 two-phase spatial tackle (Upgrade.md § 5.5).
//
// ContactSystem is called per micro-tick from CarrySim. When a defender's
// radius overlaps the carrier, it resolves Phase 1 (evasion) and, if contact
// is made, Phase 2 (collision dominance) + the offload window.
//
// ALLOCATION CONTRACT: detectContact() is called every tick. It returns a
// pre-allocated result object (the same one each call) or null — no allocation
// in the hot path. The caller must copy fields it needs before the next tick.
//
// MUTATION BOUNDARY: ContactSystem writes only to World (defender recovery
// lockout) — a spatial-internal World mutation, exactly like
// seedFormation/coupleBallToCarrier. Outcomes are returned as plain data; the
// caller (CarrySim → OpenPlayEvent) converts them to MatchEvents.
//
// RNG CONTRACT: every draw uses rngSpatial. No rng() (outcome stream) draws
// happen here — that contract is preserved by keeping resolveOpenPlaySpatial
// in the event handler (CLAUDE.md § 7).

import { rngSpatial } from '../../utils/rng';
import {
  CONTACT_RADIUS,
  RECOVERY_LOCKOUT_DIST,
  GEOMETRY,
  EVASION,
  COLLISION,
  OFFLOAD,
} from '../balance/spatialTackle';
import { TOP_SPEED_MAX } from '../balance/spatialSteering';
import { OFFLOAD_VALUES } from '../balance/offload';
import type { Agent } from './types';
import type { World } from './World';
import type { LineRole } from './ShapeSolver';

export type ContactOutcome = 'broken_tackle' | 'dominant_carry' | 'dominant_tackle' | 'play_on';

export interface ContactResult {
  hit: true;
  outcome: ContactOutcome;
  tacklerSlot: number;
  offloadAttempted: boolean;
  offloadCompleted: boolean;
  catcherSlot: number | null;
}

// Pre-allocated result — ContactSystem owns this; caller reads it before the
// next tick (when it may be overwritten by a subsequent call or reset to null).
const _result: ContactResult = {
  hit: true,
  outcome: 'play_on',
  tacklerSlot: 0,
  offloadAttempted: false,
  offloadCompleted: false,
  catcherSlot: null,
};

// Compute the geometry modifier for a defender's approach angle relative to
// the carrier's velocity. Uses dot product of unit vectors.
function geometryMod(carrier: Agent, defender: Agent): number {
  const cvMag = Math.hypot(carrier.vel.x, carrier.vel.y);
  const dvMag = Math.hypot(defender.vel.x, defender.vel.y);
  // Carrier not moving: treat as square-on (full defender advantage).
  if (cvMag < 0.01 || dvMag < 0.01) return GEOMETRY.squareOnMult;
  // Unit dot product: cos of angle between carrier velocity and defender velocity.
  const dot = (carrier.vel.x * defender.vel.x + carrier.vel.y * defender.vel.y) / (cvMag * dvMag);
  if (dot > GEOMETRY.chaseThreshold) return GEOMETRY.chaseMult;    // chasing from behind
  if (dot < GEOMETRY.headOnThreshold) return GEOMETRY.headOnMult;  // direct charge
  return GEOMETRY.squareOnMult;                                      // square-on
}

// Carrier's normalised speed (0–1) relative to TOP_SPEED_MAX.
function normalisedSpeed(carrier: Agent): number {
  const spd = Math.hypot(carrier.vel.x, carrier.vel.y);
  const norm = spd / TOP_SPEED_MAX;
  return norm < 0 ? 0 : norm > 1 ? 1 : norm;
}

function fatigueMult(fatiguePct: number): number {
  const f = fatiguePct < 0 ? 0 : fatiguePct > 100 ? 100 : fatiguePct;
  return 1 - f / 100 * COLLISION.fatigueScale;
}

// Find the closest teammate to the carrier (same side, not carrier itself).
// Returns the distance to the nearest support runner, or Infinity if none.
function nearestSupportDist(world: World, carrier: Agent): { dist: number; agent: Agent | null } {
  let best = Infinity;
  let bestAgent: Agent | null = null;
  for (let i = 0; i < world.agents.length; i++) {
    const a = world.agents[i];
    if (a.side !== carrier.side) continue;
    if (a.slot === carrier.slot) continue;
    if (a.role === 'empty') continue;
    const d = Math.hypot(a.pos.x - carrier.pos.x, a.pos.y - carrier.pos.y);
    if (d < best) { best = d; bestAgent = a; }
  }
  return { dist: best, agent: bestAgent };
}

// Main entry point — call once per micro-tick from CarrySim.
// Returns a ContactResult (the shared pre-allocated object) if a defender
// reached the carrier this tick, or null if the carrier is still clear.
//
// `roles` is the LineRole array from solveDefence (the defending line agents
// with their lockout state tracked via agent.recoveryLockout).
// `carrierSide` is the carrier's possession side so we know which agents are
// defenders.
export function detectContact(
  world: World,
  carrier: Agent,
  roles: LineRole[],
): ContactResult | null {
  // Find the nearest defender within CONTACT_RADIUS that has NOT been beaten
  // (recoveryLockout == false) and is from the opposing side.
  let nearestDef: Agent | null = null;
  let nearestDist = CONTACT_RADIUS + 1; // start outside radius

  for (let i = 0; i < roles.length; i++) {
    const def = roles[i].agent;
    if (def.side === carrier.side) continue;
    if (def.recoveryLockout) continue;
    if (def.role === 'empty') continue;
    const d = Math.hypot(def.pos.x - carrier.pos.x, def.pos.y - carrier.pos.y);
    if (d <= CONTACT_RADIUS && d < nearestDist) {
      nearestDist = d;
      nearestDef = def;
    }
  }

  if (!nearestDef) return null;

  const defender = nearestDef;

  // ── Phase 1: Evasion ────────────────────────────────────────────────────
  const E = EVASION;
  const attackerScore =
    carrier.agility  * E.attackerAgilityWeight +
    carrier.pace     * E.attackerPaceWeight +
    rngSpatial(-E.noiseBand, E.noiseBand);

  const gMod = geometryMod(carrier, defender);
  const defenderScore =
    (defender.positioning * E.defenderPositioningWeight +
     defender.tackling    * E.defenderTacklingWeight) * gMod +
    rngSpatial(-E.noiseBand, E.noiseBand);

  if (attackerScore > defenderScore) {
    // Broken tackle: defender is physically beaten. Apply recovery lockout so
    // he steers away from the carrier and cannot re-engage this beat.
    defender.recoveryLockout = true;
    // Steer the beaten defender behind the carrier's current position.
    // attackDir is encoded by carrier.vel.x sign; move defender backward.
    const attackDirSign = carrier.vel.x >= 0 ? 1 : -1;
    if (defender.intent.target === null) {
      defender.intent.target = { x: 0, y: 0 };
    }
    defender.intent.target.x = carrier.pos.x - attackDirSign * RECOVERY_LOCKOUT_DIST;
    defender.intent.target.y = defender.pos.y;
    defender.intent.driveLayer = 3; defender.intent.driveReason = 'beaten — recovering';  // Layer 3 REACT — hard interrupt

    _result.outcome = 'broken_tackle';
    _result.tacklerSlot = defender.slot;
    _result.offloadAttempted = false;
    _result.offloadCompleted = false;
    _result.catcherSlot = null;
    return _result;
  }

  // ── Phase 2: Collision dominance ────────────────────────────────────────
  const C = COLLISION;
  const carrierFatMult = fatigueMult(carrier.fatigueSnapshot);
  const defenderFatMult = fatigueMult(defender.fatigueSnapshot);

  const carrierMomentum =
    (carrier.strength * C.carrierStrengthWeight +
     normalisedSpeed(carrier) * 100 * C.carrierSpeedWeight) * carrierFatMult;

  const defenderPower =
    (defender.tackling * C.defenderTacklingWeight +
     defender.strength * C.defenderStrengthWeight) * defenderFatMult;

  const margin = carrierMomentum - defenderPower;

  let outcome: ContactOutcome;
  if (margin >= C.dominantCarryMargin) {
    outcome = 'dominant_carry';
  } else if (margin <= C.dominantTackleMargin) {
    outcome = 'dominant_tackle';
  } else {
    outcome = 'play_on';
  }

  // ── Offload window ──────────────────────────────────────────────────────
  // Only when carrier doesn't win dominantly (play_on or dominant_tackle).
  let offloadAttempted = false;
  let offloadCompleted = false;
  let catcherSlot: number | null = null;

  if (outcome === 'play_on' || outcome === 'dominant_tackle') {
    const { dist: suppDist, agent: supporter } = nearestSupportDist(world, carrier);

    if (suppDist <= OFFLOAD.maxSupportDist && supporter !== null) {
      // Linear probability: full at dist=0, zero at maxSupportDist.
      const proximity = 1 - suppDist / OFFLOAD.maxSupportDist;
      // The base attempt rate is further tempered by proximity so at max
      // distance attempts fall near-zero.
      const attemptProb = OFFLOAD.attemptBase * proximity;
      // rngSpatial returns integer; use 0–99 range for probability.
      if (rngSpatial(0, 99) < Math.round(attemptProb * 100)) {
        offloadAttempted = true;
        // Catch gate: handling-based.
        const catchProb = OFFLOAD.catchBase + supporter.handling * OFFLOAD.catchHandlingWeight;
        if (rngSpatial(0, 99) < Math.round(catchProb * 100)) {
          offloadCompleted = true;
          catcherSlot = supporter.slot;
        }
      }
    }
    // No support within range → near-zero offload (no attempt roll).
  }

  _result.outcome = outcome;
  _result.tacklerSlot = defender.slot;
  _result.offloadAttempted = offloadAttempted;
  _result.offloadCompleted = offloadCompleted;
  _result.catcherSlot = catcherSlot;
  return _result;
}
