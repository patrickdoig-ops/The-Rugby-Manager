import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';

export function handleTryScored({ state, attackTeam, randomPlayer }: PhaseContext): PhaseResult {
  const lastEvent = state.events[state.events.length - 1];
  const scorer = lastEvent?.primaryPlayer ?? randomPlayer(attackTeam);

  const events: MatchEvent[] = [
    { type: 'TRY_SCORED', scorer, side: state.possession },
  ];

  return {
    nextPhase: MatchPhase.ConversionKick,
    // Carry phase already rendered the try commentary; suppress duplicate.
    narration: { steps: [] },
    primaryPlayer: scorer,
    events,
  };
}
