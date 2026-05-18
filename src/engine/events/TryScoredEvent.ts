import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';

export function handleTryScored({ state, attackTeam, adjustRating, randomPlayer }: PhaseContext): PhaseResult {
  const lastEvent = state.events[state.events.length - 1];
  const scorer = lastEvent?.primaryPlayer ?? randomPlayer(attackTeam);
  adjustRating(scorer, +1.0);

  state.score[state.possession] += 5;
  state.stats.tries[state.possession]++;

  return {
    nextPhase: MatchPhase.ConversionKick,
    commentary: '',  // carry phase already emitted the try commentary; suppress this duplicate
    primaryPlayer: scorer,
  };
}
