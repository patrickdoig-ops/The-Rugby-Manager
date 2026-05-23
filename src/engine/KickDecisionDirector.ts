import type { Player } from '../types/player';
import type { Team } from '../types/team';
import type { MatchState } from '../types/match';
import type { MatchPhase } from '../types/engine';
import type { PhaseResult } from './events/types';
import { MatchPhase as MatchPhaseEnum } from '../types/engine';
import { rng } from '../utils/rng';
import { inOwn22, inOwnHalf } from './FieldPosition';
import { KICK_PROBABILITIES } from './balance';

// Unified kick-or-carry decision for every carry-phase entry (PhasePlay,
// FirstPhase, KickReturn). Replaces the three inline kick gates that used
// to sit at the top of each carry handler.
//
// Stage A (skeleton, no behaviour change): single roll against
// KICK_PROBABILITIES[plan][zone], identical to the original inline gate.
// Always returns family='territory' with #10 as kicker — same as today.
//
// Subsequent stages add the four kick families (clearance / territory /
// fifty_22 / attacking), the ballQuality slow-ball bonus, and the
// #9-or-#10 kicker selection.

export type KickFamily = 'clearance' | 'territory' | 'fifty_22' | 'attacking';

export interface KickDecision {
  kick: true;
  family: KickFamily;
  kicker: Player;
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

export function decideKick(ctx: KickDecisionContext): KickOrCarry {
  const { state, attackTeam, attackOnField } = ctx;
  const plan = attackTeam.tactics.attackingGamePlan;
  const probs = KICK_PROBABILITIES[plan];
  const kickProb = inOwn22(state) ? probs.own22 : (inOwnHalf(state) ? probs.ownHalf : probs.opposition);

  if (rng(1, 100) > kickProb) return { kick: false };

  const kicker = attackOnField.find(p => p.id === 10)
    ?? attackTeam.players.find(p => p.id === 10)
    ?? attackTeam.players[0];

  return { kick: true, family: 'territory', kicker };
}

// Builds the PhaseResult that transitions to a kick phase. Today every kick
// routes to TacticalKick with #10 as kicker; later stages will branch to
// BoxKick when family=clearance/territory and the kicker is #9.
export function buildKickTransition(decision: KickDecision, sourcePhase: MatchPhase): PhaseResult {
  return {
    nextPhase: MatchPhaseEnum.TacticalKick,
    narration: { steps: [{ kind: 'phase_outcome', phase: sourcePhase, key: 'kick_decision' }] },
    primaryPlayer: decision.kicker,
    events: [
      { type: 'KICK_RETURN_CARRIER_SET', player: undefined },
      { type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 },
    ],
  };
}
