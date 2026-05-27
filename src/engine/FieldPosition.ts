import type { MatchState } from '../types/match';
import type { PossessionSide } from '../types/engine';
import type { Player } from '../types/player';
import type { Team } from '../types/team';
import { SLOT, isForwardSlot, isBackSlot } from './Slot';
import { rng } from '../utils/rng';
import {
  HARD_CARRY_DEFENDER_WEIGHTS,
  MIDFIELD_CARRY_DEFENDER_WEIGHTS,
  WIDE_CARRY_DEFENDER_WEIGHTS,
  KICK_RETURN_DEFENDER_WEIGHTS,
  ASSIST_TACKLER_WEIGHTS,
} from './balance/tackling';
import {
  HARD_CARRIER_WEIGHTS,
  POD_PICKUP_WEIGHTS,
} from './balance/carrying';

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

// Specialist-slot lookups. Each picks the named slot first when on-field,
// then degrades gracefully through positionally-sensible alternatives,
// guaranteeing a Player return so callers don't need their own fallback.
// A sin-binned / sent-off / injured player is never selected — the chain
// rolls past them to the next-best on-field option.

export function pickKicker(team: Team, state: MatchState, side: PossessionSide): Player {
  const onField = onFieldPlayers(team, state, side);
  return onField.find(p => p.id === SLOT.FLY_HALF)
      ?? onField.find(p => p.id === SLOT.SCRUM_HALF)
      ?? onField.find(p => isBackSlot(p.id))
      ?? onField[0]
      ?? team.players[0];
}

export function pickScrumHalf(team: Team, state: MatchState, side: PossessionSide): Player {
  const onField = onFieldPlayers(team, state, side);
  return onField.find(p => p.id === SLOT.SCRUM_HALF)
      ?? onField.find(p => isBackSlot(p.id))
      ?? onField[0]
      ?? team.players[0];
}

export function pickFullback(team: Team, state: MatchState, side: PossessionSide): Player {
  const onField = onFieldPlayers(team, state, side);
  return onField.find(p => p.id === SLOT.FULL_BACK)
      ?? onField.find(p => isBackSlot(p.id))
      ?? onField[0]
      ?? team.players[0];
}

// Shared weighted-pick over an on-field pool. Walks the pool, sums each
// player's weight from the table (slots missing from the table contribute
// 0 and are never picked), and rolls once on the outcome stream. Returns
// undefined when the weighted pool is empty so callers can decide their
// own fallback.
function pickWeighted(
  pool: Player[],
  weights: Readonly<Partial<Record<number, number>>>,
  exclude?: Player,
): Player | undefined {
  const cands: Array<{ p: Player; w: number }> = [];
  for (const p of pool) {
    if (p === exclude) continue;
    const w = weights[p.id];
    if (w && w > 0) cands.push({ p, w });
  }
  if (cands.length === 0) return undefined;
  const total = cands.reduce((s, c) => s + c.w, 0);
  let roll = rng(1, total);
  for (const c of cands) {
    if (roll <= c.w) return c.p;
    roll -= c.w;
  }
  return cands[cands.length - 1].p;
}

// Map carrier slot to the channel weights for the primary defender pick.
// Forwards (1-8) and scrum-half (9) → hard channel; fly-half (10) and
// inside centre (12) → midfield; outside centre (13), wings (11/14),
// fullback (15) → wide.
function carrierChannelWeights(carrierSlot: number): Readonly<Partial<Record<number, number>>> {
  if (carrierSlot <= SLOT.SCRUM_HALF) return HARD_CARRY_DEFENDER_WEIGHTS;
  if (carrierSlot === SLOT.FLY_HALF || carrierSlot === SLOT.CENTRE_12) return MIDFIELD_CARRY_DEFENDER_WEIGHTS;
  return WIDE_CARRY_DEFENDER_WEIGHTS;
}

// Channel-aware primary defender pick. Used by OpenPlay, FirstPhase, and
// the offload chain. Carrier slot picks the channel weight table; the
// on-field defenders are then weighted-picked from that table. The optional
// `exclude` skips a specific player (offload chain uses this to avoid the
// previous defender on consecutive chain links). Degrades through any other
// on-field defender if the weighted pool is empty.
export function pickPrimaryDefender(team: Team, state: MatchState, side: PossessionSide, carrier: Player, exclude?: Player): Player {
  const onField = onFieldPlayers(team, state, side);
  return pickWeighted(onField, carrierChannelWeights(carrier.id), exclude)
      ?? onField.find(p => p !== exclude)
      ?? onField[0]
      ?? team.players[0];
}

// Assist tackler — forward-weighted (back-row + locks heavy, hooker
// occasional). Excludes the primary defender. Degrades to any other
// on-field forward, then any other on-field player.
export function pickAssistTackler(team: Team, state: MatchState, side: PossessionSide, primary: Player): Player {
  const onField = onFieldPlayers(team, state, side);
  return pickWeighted(onField, ASSIST_TACKLER_WEIGHTS, primary)
      ?? onField.find(p => isForwardSlot(p.id) && p !== primary)
      ?? onField.find(p => p !== primary)
      ?? team.players[0];
}

// Flat forward-weighted defender for kick returns — chase pack mostly
// forwards regardless of where the returner is on the field.
export function pickKickReturnDefender(team: Team, state: MatchState, side: PossessionSide): Player {
  const onField = onFieldPlayers(team, state, side);
  return pickWeighted(onField, KICK_RETURN_DEFENDER_WEIGHTS)
      ?? onField[0]
      ?? team.players[0];
}

// PhasePlay hard-carry forward pick. Weighted so back row + props dominate,
// locks second, hooker rare. Degrades through any available forward → any
// on-field player → team[0] if every weighted slot is binned / sent off.
export function pickHardCarrier(team: Team, state: MatchState, side: PossessionSide): Player {
  const fwds = availableForwards(team, state, side);
  return pickWeighted(fwds, HARD_CARRIER_WEIGHTS)
      ?? fwds[0]
      ?? onFieldPlayers(team, state, side)[0]
      ?? team.players[0];
}

// KickReturn pod-pickup carrier — weighted pick from back row + locks. The
// optional `exclude` lets the caller skip the catcher (defensive against
// future kick resolvers that set a forward as the kickReturnCarrier; today
// the catcher is always a back). Returns undefined when no eligible pod
// runner is on the field — caller falls back to "catcher keeps the ball"
// so we never silently substitute a prop / hooker.
export function pickPodCarrier(
  team: Team,
  state: MatchState,
  side: PossessionSide,
  exclude?: Player,
): Player | undefined {
  const fwds = availableForwards(team, state, side);
  return pickWeighted(fwds, POD_PICKUP_WEIGHTS, exclude);
}

// Weighted pick over the on-field back three (fullback + wings). Used by the
// carry handlers to credit a cover tackler on non-try line breaks. Fullback
// 60%, each wing 20%, re-normalised over whichever of the three are on field.
// Degrades through any on-field back / any on-field player. Consumes one
// outcome-stream rng() call when at least one back-three player is available.
export function pickCoverDefender(team: Team, state: MatchState, side: PossessionSide): Player {
  const onField = onFieldPlayers(team, state, side);
  const fb = onField.find(p => p.id === SLOT.FULL_BACK);
  const w11 = onField.find(p => p.id === SLOT.WING_11);
  const w14 = onField.find(p => p.id === SLOT.WING_14);

  const candidates: Array<{ p: Player; w: number }> = [];
  if (fb)  candidates.push({ p: fb,  w: 60 });
  if (w11) candidates.push({ p: w11, w: 20 });
  if (w14) candidates.push({ p: w14, w: 20 });

  if (candidates.length > 0) {
    const total = candidates.reduce((s, c) => s + c.w, 0);
    let roll = rng(1, total);
    for (const c of candidates) {
      if (roll <= c.w) return c.p;
      roll -= c.w;
    }
    return candidates[candidates.length - 1].p;
  }
  return onField.find(p => isBackSlot(p.id)) ?? onField[0] ?? team.players[0];
}
