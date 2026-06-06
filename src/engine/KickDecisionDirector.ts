import type { Player } from '../types/player';
import type { Team } from '../types/team';
import type { MatchState } from '../types/match';
import type { MatchPhase } from '../types/engine';
import type { PhaseResult } from './events/types';
import { MatchPhase as MatchPhaseEnum } from '../types/engine';
import { rng } from '../utils/rng';
import { inOpposition22, inOwn22, inOwnHalf, availableBacks } from './FieldPosition';
import { SLOT } from './Slot';
import {
  KICK_PROBABILITIES,
  SLOW_BALL_KICK_BONUS,
  FAMILY_WEIGHTS,
  SCRUM_HALF_KICKER_PCT,
  LONG_AND_OFF_PCT,
  CROSS_FIELD_VS_GRUBBER_PCT,
  RED_CLOCK_CLOSEOUT,
  type Plan,
  type Zone,
  type Family,
} from './balance';

// Unified kick-or-carry decision for every carry-phase entry (PhasePlay,
// FirstPhase, KickReturn). Replaces the three inline kick gates that used
// to sit at the top of each carry handler AND the Breakdown slow_ball →
// BoxKick gate that lived in BreakdownEvent.
//
// Decision flow:
//   1. Compute base kick probability from KICK_PROBABILITIES[plan][zone].
//   2. Add SLOW_BALL_KICK_BONUS when state.lastBallQuality === 'slow'.
//   3. Roll vs kickProb. Miss → return { kick: false } (carry path).
//   4. Pick the kick FAMILY from FAMILY_WEIGHTS[zone][plan].
//   5. Pick the KICKER (#9 box-kicker vs #10 fly-half) per family.
//   6. Clearance only — pick longAndOn vs longAndOff per zone.
//   7. Attacking only — pick cross_field vs grubber sub-type.
//
// Stages C/D/E add the dedicated resolver branches for fifty_22 +
// cross_field + grubber + clearance long-and-off. Stage B routes all
// kicks to existing BoxKick / TacticalKick phases based on kicker id.

export type AttackingSubType = 'cross_field' | 'grubber';
export type ClearanceStyle   = 'long_and_on' | 'long_and_off';

export interface KickDecision {
  kick: true;
  family: Family;
  kicker: Player;
  // Only set for family='clearance'.
  clearanceStyle?: ClearanceStyle;
  // Only set for family='attacking'.
  attackingSubType?: AttackingSubType;
}

export interface CarryDecision {
  kick: false;
}

export type KickOrCarry = KickDecision | CarryDecision;

export interface KickDecisionContext {
  state: MatchState;
  attackTeam: Team;
  attackOnField: Player[];
}

function fieldZone(state: MatchState): Zone {
  if (inOwn22(state)) return 'own22';
  if (inOwnHalf(state)) return 'ownHalf';
  if (inOpposition22(state)) return 'opp22';
  return 'oppHalf';
}

function pickFamily(zone: Zone, plan: Plan): Family {
  const weights = FAMILY_WEIGHTS[zone][plan];
  const roll = rng(1, 100);
  let cum = 0;
  for (const family of ['clearance', 'territory', 'fifty_22', 'attacking'] as const) {
    cum += weights[family];
    if (roll <= cum) return family;
  }
  return 'territory';
}

// Rolls #9-vs-#10 by family-weighted probability and returns whichever
// halfback is actually on the field. If the rolled choice is sin-binned,
// the other halfback steps in; if both are off, any on-field back kicks;
// finally falls through to any on-field player so we never return a
// player who can't legally take the kick.
function pickKicker(family: Family, ctx: KickDecisionContext): Player {
  const { state, attackTeam, attackOnField } = ctx;
  const scrumHalfOnField = attackOnField.find(p => p.id === SLOT.SCRUM_HALF);
  const flyHalfOnField   = attackOnField.find(p => p.id === SLOT.FLY_HALF);

  const scrumHalfPct = SCRUM_HALF_KICKER_PCT[family];
  const preferScrumHalf = rng(1, 100) <= scrumHalfPct;
  const primary = preferScrumHalf ? scrumHalfOnField : flyHalfOnField;
  const backup  = preferScrumHalf ? flyHalfOnField   : scrumHalfOnField;

  return primary
      ?? backup
      ?? availableBacks(attackTeam, state, state.possession)[0]
      ?? attackOnField[0]
      ?? attackTeam.players[0];
}

// Full-time red clock: the next stoppage ends the match, so kick-or-carry is
// a game-management call. Returns a forced decision (kick to touch / carry) or
// null to defer to the normal territory logic. Applies to both sides — the
// human's open-play kicks are already auto-decided here (the manager sets the
// game plan, not individual kicks).
function redClockCloseout(ctx: KickDecisionContext, zone: Zone): KickOrCarry | null {
  const { state } = ctx;
  if (!state.clock.clockInTheRed || !state.clock.halfTimeDone) return null;

  const opp = state.possession === 'home' ? 'away' : 'home';
  const margin = state.score[state.possession] - state.score[opp];

  // Trailing or level → keep the ball alive, never kick it to the opposition.
  if (margin <= 0) return { kick: false };

  // Slender lead camped in the opp 22 → keep attacking for the try / bonus /
  // bigger margin rather than closing out.
  const C = RED_CLOCK_CLOSEOUT;
  if (zone === 'opp22' && margin <= C.keepAttackingMaxMargin) return null;

  // Leading → roll to kick to touch and end the game. A miss falls through to
  // the normal logic (keeps some variety).
  const ownHalfBonus = (zone === 'own22' || zone === 'ownHalf') ? C.ownHalfBonusPct : 0;
  const closeOutPct = Math.min(C.closeOutMaxPct, C.closeOutBasePct + margin * C.marginStepPct + ownHalfBonus);
  if (rng(1, 100) <= closeOutPct) {
    const kicker = pickKicker('clearance', ctx);
    return { kick: true, family: 'clearance', kicker, clearanceStyle: 'long_and_off' };
  }
  return null;
}

export function decideKick(ctx: KickDecisionContext): KickOrCarry {
  const { state, attackTeam, attackOnField } = ctx;
  const plan = attackTeam.tactics.attackingGamePlan;
  const probs = KICK_PROBABILITIES[plan];
  const zone = fieldZone(state);

  const closeout = redClockCloseout(ctx, zone);
  if (closeout) return closeout;

  // Base kick probability — same KICK_PROBABILITIES[plan][zone] table as
  // pre-v2.83a. (The zone enum is more granular than the table — own22 +
  // opp22 use the explicit table value; ownHalf and oppHalf collapse to
  // the table's "ownHalf" and "opposition" rows respectively.)
  const baseProb = zone === 'own22' ? probs.own22
                 : zone === 'opp22' ? probs.opposition
                 : zone === 'oppHalf' ? probs.opposition
                 : probs.ownHalf;

  const slowBallBonus = state.lastBallQuality === 'slow' ? SLOW_BALL_KICK_BONUS : 0;
  const kickProb = baseProb + slowBallBonus;

  if (rng(1, 100) > kickProb) return { kick: false };

  const family = pickFamily(zone, plan);
  const kicker = pickKicker(family, ctx);

  const decision: KickDecision = { kick: true, family, kicker };

  if (family === 'clearance') {
    decision.clearanceStyle = rng(1, 100) <= LONG_AND_OFF_PCT[zone] ? 'long_and_off' : 'long_and_on';
  }
  if (family === 'attacking') {
    decision.attackingSubType = rng(1, 100) <= CROSS_FIELD_VS_GRUBBER_PCT ? 'cross_field' : 'grubber';
  }

  return decision;
}

// Builds the PhaseResult that transitions to a kick phase. Routing:
// kicker.id === SCRUM_HALF → BoxKick phase; otherwise → TacticalKick phase.
// Emits KICK_INTENT_SET so the kick handler reads the family + sub-choice
// from state.pendingKick. The handler is responsible for emitting
// KICK_INTENT_CLEARED before it returns.
export function buildKickTransition(decision: KickDecision, sourcePhase: MatchPhase): PhaseResult {
  const nextPhase = (decision.kicker.id === SLOT.SCRUM_HALF && sourcePhase !== MatchPhaseEnum.KickReturn) 
    ? MatchPhaseEnum.BoxKick 
    : MatchPhaseEnum.TacticalKick;
  return {
    nextPhase,
    narration: { steps: [{ kind: 'phase_outcome', phase: sourcePhase, key: 'kick_decision' }] },
    primaryPlayer: decision.kicker,
    events: [
      { type: 'KICK_INTENT_SET', intent: {
          family: decision.family,
          clearanceStyle: decision.clearanceStyle,
          attackingSubType: decision.attackingSubType,
        } },
      { type: 'KICK_RETURN_CARRIER_SET', player: undefined },
      { type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 },
    ],
  };
}
