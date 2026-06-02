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
import type { MatchEvent } from '../types/matchEvent';
import type { AttackingStyle } from '../types/team';
import type { NarrationStep } from '../types/narration';
import { clamp } from '../utils/math';
import { rngPosition } from '../utils/rng';
import { attackDir } from './FieldPosition';
import {
  EDGE_Y_LOW,
  EDGE_Y_HIGH,
  PASS_DISTANCE_M,
  SCRUM_HALF_PASS_M,
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
  COMMENTARY_CHANCES,
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

// One open-play pass from an explicit position: lateral distance drawn from the
// pass-length distribution, scaled by attacking style, applied in `dir`. Reaching
// the 15m edge band clamps to the edge and flips the direction. Takes y/dir
// explicitly (not state) so a chain of hops can be computed against a running
// local position — phase handlers are read-only over state, so the events they
// queue aren't applied to state.ball until PhaseRouter drains the queue.
function sweepFrom(y: number, dir: -1 | 1, style: AttackingStyle): { y: number; lateralDir: -1 | 1 } {
  const band = rngPosition(1, 100);
  const range = band <= PASS_DISTANCE_M.shortPct ? PASS_DISTANCE_M.short
              : band <= PASS_DISTANCE_M.midPct   ? PASS_DISTANCE_M.mid
              :                                     PASS_DISTANCE_M.long;
  const distM = rngPosition(range[0], range[1]);
  const stepY = metresToY(distM) * SWEEP_STYLE_MULT[style];

  let d = dir;
  let ny = y + d * stepY;
  if (ny <= EDGE_Y_LOW)  { ny = EDGE_Y_LOW;  d = 1; }
  else if (ny >= EDGE_Y_HIGH) { ny = EDGE_Y_HIGH; d = -1; }
  return { y: clamp(ny, 0, 100), lateralDir: d };
}

// One open-play pass in the current sweep direction.
export function sweepStep(state: MatchState, style: AttackingStyle): { y: number; lateralDir: -1 | 1 } {
  return sweepFrom(state.ball.y, state.ball.lateralDir, style);
}

// Scrum-half to fly-half pass off a set piece: longer flat spin (10-20m lateral).
// Uses the same rngPosition stream as sweepFrom to stay in the positioning RNG.
export function scrumHalfSweepStep(y: number, dir: -1 | 1): { y: number; lateralDir: -1 | 1 } {
  const distM = rngPosition(SCRUM_HALF_PASS_M[0], SCRUM_HALF_PASS_M[1]);
  const stepY = metresToY(distM);
  let d = dir;
  let ny = y + d * stepY;
  if (ny <= EDGE_Y_LOW)  { ny = EDGE_Y_LOW;  d = 1; }
  else if (ny >= EDGE_Y_HIGH) { ny = EDGE_Y_HIGH; d = -1; }
  return { y: clamp(ny, 0, 100), lateralDir: d };
}

// Set-piece / kick-receive exit: orient to the open side, then take one pass.
export function openSweepStep(state: MatchState, style: AttackingStyle): { y: number; lateralDir: -1 | 1 } {
  return sweepFrom(state.ball.y, openSideDir(state.ball.y), style);
}

// A chain of `hopCount` lateral pass-hops from the current ball position — one
// per pass in a backline chain, so the ball steps across the field pass-by-pass.
// The first hop orients to the open side when `orient` (set-piece / kick-return
// exit); each subsequent hop continues in the running direction, reversing at the
// edge band. Returns one { y, lateralDir } per hop (each → a BALL_REPOSITIONED).
// When `scrumHalfFirst` is true the first hop uses the SH-specific wider distribution.
export function sweepPath(
  state: MatchState,
  style: AttackingStyle,
  hopCount: number,
  orient: boolean,
  scrumHalfFirst = false,
): Array<{ y: number; lateralDir: -1 | 1 }> {
  const out: Array<{ y: number; lateralDir: -1 | 1 }> = [];
  let y = state.ball.y;
  let dir: -1 | 1 = orient ? openSideDir(state.ball.y) : state.ball.lateralDir;
  for (let i = 0; i < hopCount; i++) {
    const step = i === 0 && scrumHalfFirst
      ? scrumHalfSweepStep(y, dir)
      : sweepFrom(y, dir, style);
    y = step.y;
    dir = step.lateralDir;
    out.push(step);
  }
  return out;
}

// Optional lateral-flavour commentary note for a completed sweep — pure
// geometry over the sweep result (the renderer rolls the chancePct on the
// commentary stream). `orienting` = the sweep re-oriented to the open side
// (set-piece / kick-return exit, via openSweepStep); otherwise it continued the
// current sweep and `preDir` is the lateral direction before it. Returns null
// when nothing noteworthy happened laterally.
function lateralNote(
  sweep: { y: number; lateralDir: -1 | 1 },
  attackTeamName: string,
  orienting: boolean,
  preDir: -1 | 1,
): NarrationStep | null {
  const inEdge = sweep.y <= EDGE_Y_LOW || sweep.y >= EDGE_Y_HIGH;
  // Continued a sweep that hit the 15m band and reversed — brought back blind.
  if (!orienting && sweep.lateralDir !== preDir) {
    return { kind: 'tactic_note', cause: 'worked_back_blind', chancePct: COMMENTARY_CHANCES.workedBackBlind, params: { attackTeamName } };
  }
  // Sitting in the edge band after the sweep — pinned near the touchline.
  if (inEdge) {
    return { kind: 'tactic_note', cause: 'pinned_on_touchline', chancePct: COMMENTARY_CHANCES.pinnedOnTouchline, params: { attackTeamName } };
  }
  // Deliberately swung to the open side off a set piece / kick return.
  if (orienting) {
    return { kind: 'tactic_note', cause: 'switch_to_open_side', chancePct: COMMENTARY_CHANCES.switchToOpenSide, params: { attackTeamName } };
  }
  return null;
}

// Emit a ball-in-hand phase's lateral movement and return the optional flavour
// note — the single seam the three carry handlers share. The ball steps across
// one hop per backline pass (sweepPath, floored at 1), each hop a
// BALL_REPOSITIONED emitted BEFORE the carry so the keyframe path reads "across
// the line, then upfield". `perPass` is a presentation switch: live UI emits
// every hop (so PitchView walks them); headless/silent sims collapse to a single
// BALL_REPOSITIONED at the final position — identical final ball.y/lateralDir and
// identical rngPosition draws (sweepPath runs the same either way), only the
// intermediate presentation-only events are skipped, so outcomes are unchanged.
export function emitSweepHops(
  events: MatchEvent[],
  state: MatchState,
  style: AttackingStyle,
  hopCount: number,
  orient: boolean,
  attackTeamName: string,
  perPass: boolean,
  scrumHalfFirst = false,
): NarrationStep | null {
  const hops = sweepPath(state, style, Math.max(1, hopCount), orient, scrumHalfFirst);
  const last = hops[hops.length - 1];
  if (perPass) {
    for (const h of hops) events.push({ type: 'BALL_REPOSITIONED', y: h.y, lateralDir: h.lateralDir });
  } else {
    events.push({ type: 'BALL_REPOSITIONED', y: last.y, lateralDir: last.lateralDir });
  }
  return lateralNote(last, attackTeamName, orient, state.ball.lateralDir);
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

// Kick aimed for touch that is caught in-field: lands near the near touchline
// (~5m short of touch) rather than diagonally across the pitch.
export function kickForTouchMissY(state: MatchState): number {
  const nearTouch = state.ball.y <= 50 ? 0 : 100;
  const inward = nearTouch === 0 ? 1 : -1;
  return clamp(nearTouch + inward * (LINEOUT_TOUCHLINE_INSET + rngPosition(3, 7)), 0, 100);
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
