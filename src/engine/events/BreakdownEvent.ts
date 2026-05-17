import type { Player } from '../../types/player';
import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveBreakdown } from '../resolvers/BreakdownResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';

export function handleBreakdown({ state, attackTeam, defendTeam, inOpposition22, adjustRating, draftEvent }: PhaseContext): PhaseResult {
  const forwardPool = attackTeam.players.filter(p => p.id <= 8);
  const pool = [...forwardPool];
  const supporters: Player[] = [];
  while (supporters.length < 3 && pool.length > 0) {
    supporters.push(...pool.splice(rng(0, pool.length - 1), 1));
  }

  const backRow = defendTeam.players.filter(p => p.id >= 6 && p.id <= 8);
  const jackal  = backRow.length > 0 ? backRow[rng(0, backRow.length - 1)] : defendTeam.players[0];
  const primary = supporters[0];

  const res = resolveBreakdown(supporters, jackal);

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
    return {
      nextPhase: !inOpposition22() ? MatchPhase.BoxKick : MatchPhase.OpenPlay,
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

  // penalty_defending
  adjustRating(primary, -0.25);
  return {
    nextPhase: MatchPhase.Penalty,
    commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'penalty_defending'),
    primaryPlayer: primary,
    secondaryPlayer: jackal,
  };
}
