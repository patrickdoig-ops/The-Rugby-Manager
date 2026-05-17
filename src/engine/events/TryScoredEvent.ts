import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { getCommentary } from '../CommentaryEngine';

export function handleTryScored({ state, attackTeam, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const scorer = randomPlayer(attackTeam);
  adjustRating(scorer, +0.5);
  state.score[state.possession] += 5;
  state.stats.tries[state.possession]++;
  return {
    nextPhase: MatchPhase.ConversionKick,
    commentary: getCommentary({ ...draftEvent(MatchPhase.TryScored), primaryPlayer: scorer }, 'try'),
    primaryPlayer: scorer,
  };
}
