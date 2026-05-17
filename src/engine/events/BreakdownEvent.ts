import type { Player } from '../../types/player';
import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveBreakdown } from '../resolvers/BreakdownResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';

export function handleBreakdown({ state, attackTeam, defendTeam, inOpposition22, inOwn22, inOwnHalf, adjustRating, draftEvent }: PhaseContext): PhaseResult {
  const attPlan = attackTeam.tactics.attackingBreakdown;
  const defPlan = defendTeam.tactics.defendingBreakdown;

  const lastEvent = state.events[state.events.length - 1];
  const carrierId = lastEvent?.primaryPlayer?.id;
  const attackBonus = lastEvent?.outcome === 'dominant_carry' ? 6 : 0;
  const forwardPool = attackTeam.players.filter(p => p.id <= 8 && p.id !== carrierId);
  if (forwardPool.length === 0) forwardPool.push(attackTeam.players[0]);
  const pool = [...forwardPool];

  const count = attPlan === 'pick_and_drive' ? 4 : (attPlan === 'wide_play' ? 2 : 3);
  const supporters: Player[] = [];
  while (supporters.length < count && pool.length > 0) {
    supporters.push(...pool.splice(rng(0, pool.length - 1), 1));
  }

  const backRow = defendTeam.players.filter(p => p.id >= 6 && p.id <= 8);
  const jackal  = backRow.length > 0 ? backRow[rng(0, backRow.length - 1)] : defendTeam.players[0];
  const primary = supporters[0];

  const defendPack = defendTeam.players.filter(p => p.id <= 8);
  const res = resolveBreakdown(supporters, jackal, defPlan, defendPack, attackBonus);

  if (res.result === 'clean_ball') {
    adjustRating(primary, +0.1);
    return {
      nextPhase: MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'clean_ball'),
      primaryPlayer: primary,
      secondaryPlayer: jackal,
    };
  }

  if (res.result === 'slow_ball') {
    const plan = attackTeam.tactics.attackingGamePlan;
    let boxKick = false;

    if (plan === 'possession') {
      boxKick = false;
    } else if (plan === 'kicking') {
      boxKick = !inOpposition22() && !inOwn22();
    } else {
      boxKick = inOwnHalf() && !inOwn22();
    }

    return {
      nextPhase: boxKick ? MatchPhase.BoxKick : MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'slow_ball'),
      primaryPlayer: primary,
      secondaryPlayer: jackal,
    };
  }

  if (res.result === 'turnover') {
    adjustRating(jackal, +0.3);
    adjustRating(primary, -0.1);
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: jackal, secondaryPlayer: primary }, 'turnover'),
      primaryPlayer: jackal,
      secondaryPlayer: primary,
    };
  }

  // penalty_defending — defending team awarded the penalty, so possession flips to them
  adjustRating(primary, -0.25);
  state.possession = state.possession === 'home' ? 'away' : 'home';
  return {
    nextPhase: MatchPhase.Penalty,
    commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'penalty_defending'),
    primaryPlayer: primary,
    secondaryPlayer: jackal,
  };
}
