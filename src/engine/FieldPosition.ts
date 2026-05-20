import type { MatchState } from '../types/match';

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
