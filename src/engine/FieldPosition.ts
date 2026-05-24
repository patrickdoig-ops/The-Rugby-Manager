import type { MatchState } from '../types/match';
import type { PossessionSide } from '../types/engine';
import type { Player } from '../types/player';
import type { Team } from '../types/team';
import { isForwardSlot, isBackSlot } from './Slot';

// Home attacks toward x=100 in the first half, toward x=0 in the second.
// Teams only swap ends at half-time, never on turnovers.
export function attackDir(state: MatchState): 1 | -1 {
  const homeAttacksRight = !state.clock.halfTimeDone;
  if (state.possession === 'home') return homeAttacksRight ? 1 : -1;
  return homeAttacksRight ? -1 : 1;
}

export function isTryScored(state: MatchState): boolean {
  return isTryScoredAt(state.ball.x, state.possession, state.clock.halfTimeDone);
}

// Same logic as isTryScored but takes the raw ballX — useful when a handler needs
// to check whether a projected (not-yet-applied) ball position crosses the try line.
export function isTryScoredAt(ballX: number, possession: 'home' | 'away', halfTimeDone: boolean): boolean {
  const homeAttacksRight = !halfTimeDone;
  if (possession === 'home') return homeAttacksRight ? ballX >= 95 : ballX <= 5;
  return homeAttacksRight ? ballX <= 5 : ballX >= 95;
}

export function inOpposition22(state: MatchState): boolean {
  return inOpposition22At(state.ball.x, state.possession, state.clock.halfTimeDone);
}

// Distance from the ball to the opposition try line, in pitch metres.
// Try lines sit at x=5 (home goal) and x=95 (away goal). Positive going
// forward — once past the try line the value clamps to 0.
export function metresFromOppositionTryLine(state: MatchState): number {
  const homeAttacksRight = !state.clock.halfTimeDone;
  const oppTryLineX = (state.possession === 'home') === homeAttacksRight ? 95 : 5;
  return Math.max(0, Math.abs(oppTryLineX - state.ball.x));
}

// Same logic as inOpposition22 but takes the raw ballX — useful when a handler
// needs to check whether a projected (not-yet-applied) ball position is inside
// the opposition 22.
export function inOpposition22At(ballX: number, possession: 'home' | 'away', halfTimeDone: boolean): boolean {
  const homeAttacksRight = !halfTimeDone;
  if (possession === 'home') return homeAttacksRight ? ballX >= 78 : ballX <= 22;
  return homeAttacksRight ? ballX <= 22 : ballX >= 78;
}

export function inOppositionHalf(state: MatchState): boolean {
  const { x: ballX } = state.ball;
  const { possession } = state;
  const homeAttacksRight = !state.clock.halfTimeDone;
  if (possession === 'home') return homeAttacksRight ? ballX > 50 : ballX < 50;
  return homeAttacksRight ? ballX < 50 : ballX > 50;
}

export function inOwn22(state: MatchState): boolean {
  const { x: ballX } = state.ball;
  const { possession } = state;
  const homeAttacksRight = !state.clock.halfTimeDone;
  if (possession === 'home') return homeAttacksRight ? ballX <= 22 : ballX >= 78;
  return homeAttacksRight ? ballX >= 78 : ballX <= 22;
}

export function inOwnHalf(state: MatchState): boolean {
  const { x: ballX } = state.ball;
  const { possession } = state;
  const homeAttacksRight = !state.clock.halfTimeDone;
  if (possession === 'home') return homeAttacksRight ? ballX <= 50 : ballX >= 50;
  return homeAttacksRight ? ballX >= 50 : ballX <= 50;
}

// Possession-agnostic variant of inOwn22 — checks whether the ball is in the
// specified side's own 22, regardless of who currently has the ball. Used by
// CardHandler to detect "team conceded a penalty while defending in own 22".
export function inOwn22For(state: MatchState, side: PossessionSide): boolean {
  const { x: ballX } = state.ball;
  const homeAttacksRight = !state.clock.halfTimeDone;
  if (side === 'home') return homeAttacksRight ? ballX <= 22 : ballX >= 78;
  return homeAttacksRight ? ballX >= 78 : ballX <= 22;
}

// Set of player IDs currently off the field for `side` — sin-bin (yellow or
// red_20 serving time) plus sentOff (red_full, or red_20 after expiry with no
// sub available) plus injured (in-match injury, no return). Used by
// onFieldPlayers / availableForwards / availableBacks.
export function offFieldIds(state: MatchState, side: PossessionSide): Set<number> {
  const ids = new Set<number>();
  for (const entry of state.cards.sinBin[side])   ids.add(entry.player.id);
  for (const player of state.cards.sentOff[side]) ids.add(player.id);
  for (const player of state.cards.injured[side]) ids.add(player.id);
  return ids;
}

// Pure on-field filter. Resolvers and selectors call this instead of
// `team.players` directly, so sin-binned / sent-off players are naturally
// excluded from all contests. Pack/backline strength weakens automatically.
export function onFieldPlayers(team: Team, state: MatchState, side: PossessionSide): Player[] {
  const off = offFieldIds(state, side);
  return team.players.filter(p => !off.has(p.id));
}

export function availableForwards(team: Team, state: MatchState, side: PossessionSide): Player[] {
  return onFieldPlayers(team, state, side).filter(p => isForwardSlot(p.id));
}

export function availableBacks(team: Team, state: MatchState, side: PossessionSide): Player[] {
  return onFieldPlayers(team, state, side).filter(p => isBackSlot(p.id));
}
