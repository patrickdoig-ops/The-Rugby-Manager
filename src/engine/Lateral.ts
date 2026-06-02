// Lateral (Y-axis) ball movement. Pure helpers, mirroring FieldPosition.ts:
// each takes `state` (and sometimes the attacking style), reads ball.x/y/
// lateralDir, and returns a new Y (or a { y, lateralDir } sweep step). Every
// returned Y is clamped to [0, 100] so assertInvariants never trips.
//
// All randomness here draws from rngPosition — the isolated positioning stream
// — so adding lateral movement cannot perturb any in-play outcome roll.
//
// Y is 0-100 across the 70m pitch width; metresToY converts a real-world
// lateral distance (metres) into Y-units. This is pitch geometry, exempt from
// the balance-constant rule like the rest of FieldPosition.

import type { MatchState } from '../types/match';
import type { AttackingStyle } from '../types/team';
import { clamp } from '../utils/math';
import { rngPosition } from '../utils/rng';
import { attackDir } from './FieldPosition';
import {
  EDGE_Y_LOW,
  EDGE_Y_HIGH,
  PASS_DISTANCE_M,
  SWEEP_STYLE_MULT,
  LINEOUT_TOUCHLINE_INSET,
  KICKOFF_TARGET_INSET,
  KICKOFF_LEFT_BIAS_PCT,
  KICKOFF_JITTER,
  KICKOFF_STRAIGHT_JITTER,
  CROSS_KICK_INSET,
  CROSS_KICK_JITTER,
  GRUBBER_ANGLE_DEG,
  DROPOUT_ANGLE_DEG,
  CLEARING_ANGLE_DEG,
} from './balance';
import type { KickOffStrategy } from '../types/engine';

const PITCH_WIDTH_M = 70;
function metresToY(m: number): number {
  return (m * 100) / PITCH_WIDTH_M;
}

// Direction toward the open side — the touchline with more space, i.e. away
// from the nearer one. Deterministic (no RNG): the midline defaults to +1 so
// the POSSESSION_SWAPPED reducer can call the same rule inline.
export function openSideDir(y: number): -1 | 1 {
  return y <= 50 ? 1 : -1;
}

// One open-play pass: lateral distance drawn from the pass-length distribution,
// scaled by attacking style, applied in the current sweep direction. Reaching
// the 15m edge band clamps to the edge and flips the direction for next phase.
export function sweepStep(state: MatchState, style: AttackingStyle): { y: number; lateralDir: -1 | 1 } {
  const band = rngPosition(1, 100);
  const range = band <= PASS_DISTANCE_M.shortPct ? PASS_DISTANCE_M.short
              : band <= PASS_DISTANCE_M.midPct   ? PASS_DISTANCE_M.mid
              :                                     PASS_DISTANCE_M.long;
  const distM = rngPosition(range[0], range[1]);
  const stepY = metresToY(distM) * SWEEP_STYLE_MULT[style];

  let dir = state.ball.lateralDir;
  let y = state.ball.y + dir * stepY;
  if (y <= EDGE_Y_LOW)  { y = EDGE_Y_LOW;  dir = 1; }
  else if (y >= EDGE_Y_HIGH) { y = EDGE_Y_HIGH; dir = -1; }
  return { y: clamp(y, 0, 100), lateralDir: dir };
}

// Set-piece / kick-receive exit: orient to the open side, then take one pass.
export function openSweepStep(state: MatchState, style: AttackingStyle): { y: number; lateralDir: -1 | 1 } {
  const dir = openSideDir(state.ball.y);
  return sweepStep({ ...state, ball: { ...state.ball, lateralDir: dir } }, style);
}

// A lineout forms on the touchline the ball was kicked out over, a few metres in.
export function lineoutFormationY(state: MatchState): number {
  const nearTouch = state.ball.y <= 50 ? 0 : 100;
  const inset = nearTouch === 0 ? LINEOUT_TOUCHLINE_INSET : -LINEOUT_TOUCHLINE_INSET;
  return clamp(nearTouch + inset + rngPosition(-2, 2), 0, 100);
}

// In-field kick: lateral landing from launch angle × kick distance (metres).
function kickAngleY(state: MatchState, distanceM: number, minDeg: number, maxDeg: number, dir: -1 | 1): number {
  const ang = rngPosition(minDeg, maxDeg);
  const lateralM = distanceM * Math.tan((ang * Math.PI) / 180);
  return clamp(state.ball.y + dir * metresToY(lateralM), 0, 100);
}

// Box kick: nearly straight (±5°) so the chaser can compete under it.
export function boxKickLandingY(state: MatchState, distanceM: number): number {
  const dir = rngPosition(0, 1) === 0 ? -1 : 1;
  return kickAngleY(state, distanceM, 0, 5, dir);
}

// Grubber: diagonal kick into space toward the open side.
export function grubberLandingY(state: MatchState, distanceM: number): number {
  return kickAngleY(state, distanceM, GRUBBER_ANGLE_DEG[0], GRUBBER_ANGLE_DEG[1], openSideDir(state.ball.y));
}

// Drop-out (22 / goal-line): cleared on a diagonal toward the open side.
export function dropOutLandingY(state: MatchState, distanceM: number): number {
  return kickAngleY(state, distanceM, DROPOUT_ANGLE_DEG[0], DROPOUT_ANGLE_DEG[1], openSideDir(state.ball.y));
}

// Territorial clearing kick kept in field: diagonal downfield toward the open side.
export function clearingKickLandingY(state: MatchState, distanceM: number): number {
  return kickAngleY(state, distanceM, CLEARING_ANGLE_DEG[0], CLEARING_ANGLE_DEG[1], openSideDir(state.ball.y));
}

// Cross-field kick: flat to the far touchline, into the corner for the wing.
export function crossKickCornerY(state: MatchState): number {
  const farTouch = openSideDir(state.ball.y) === 1 ? 100 : 0;
  const inset = farTouch === 0 ? CROSS_KICK_INSET : -CROSS_KICK_INSET;
  return clamp(farTouch + inset + rngPosition(-CROSS_KICK_JITTER, CROSS_KICK_JITTER), 0, 100);
}

// Kick-off landing. High/grubber kick-offs aim the 15m line on the kicker's
// left (right-foot bias); short kick-offs go nearly straight down the middle.
export function kickOffLandingY(state: MatchState, strategy: KickOffStrategy): number {
  if (strategy === 'short_kick') {
    return clamp(50 + rngPosition(-KICKOFF_STRAIGHT_JITTER, KICKOFF_STRAIGHT_JITTER), 0, 100);
  }
  // Convention: a team attacking toward x=100 has its left touchline at y=0.
  const leftTouch = attackDir(state) === 1 ? 0 : 100;
  const aimLeft = rngPosition(1, 100) <= KICKOFF_LEFT_BIAS_PCT;
  const touch = aimLeft ? leftTouch : 100 - leftTouch;
  const target = touch === 0 ? KICKOFF_TARGET_INSET : 100 - KICKOFF_TARGET_INSET;
  return clamp(target + rngPosition(-KICKOFF_JITTER, KICKOFF_JITTER), 0, 100);
}
