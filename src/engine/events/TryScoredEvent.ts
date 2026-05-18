import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { getCommentary } from '../CommentaryEngine';

export function handleTryScored({ state, attackTeam, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const lastEvent = state.events[state.events.length - 1];
  const scorer = lastEvent?.primaryPlayer ?? randomPlayer(attackTeam);
  adjustRating(scorer, +1.0);

  const otherSide = state.possession === 'home' ? 'away' : 'home';
  const scoreBefore = state.score[state.possession];
  const theirScore  = state.score[otherSide];

  state.score[state.possession] += 5;
  state.stats.tries[state.possession]++;

  const myScore = state.score[state.possession];
  let commentaryKey: string;
  if (myScore > theirScore) {
    commentaryKey = scoreBefore > theirScore ? 'try_extend_lead' : 'try_lead';
  } else if (myScore === theirScore) {
    commentaryKey = 'try_level';
  } else {
    commentaryKey = 'try_trail';
  }

  return {
    nextPhase: MatchPhase.ConversionKick,
    commentary: '',  // carry phase already emitted the try commentary; suppress this duplicate
    primaryPlayer: scorer,
  };
}
