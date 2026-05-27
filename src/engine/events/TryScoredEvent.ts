import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { PhaseOutcomeKey } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { SCORE_VALUES } from '../balance';

export function handleTryScored({ state, attackTeam, randomPlayer }: PhaseContext): PhaseResult {
  const lastEvent = state.events[state.events.length - 1];
  const scorer = lastEvent?.primaryPlayer ?? randomPlayer(attackTeam);

  const events: MatchEvent[] = [
    { type: 'TRY_SCORED', scorer, side: state.possession },
  ];

  const opponentSide = state.possession === 'home' ? 'away' : 'home';
  const preLead = state.score[state.possession] - state.score[opponentSide];
  const postLead = preLead + SCORE_VALUES.try;

  let key: PhaseOutcomeKey;
  if (preLead > 0) key = 'try_extend_lead';
  else if (postLead > 0) key = 'try_lead';
  else if (postLead === 0) key = 'try_level';
  else key = 'try_trail';

  return {
    nextPhase: MatchPhase.ConversionKick,
    narration: {
      steps: [
        { kind: 'phase_outcome', phase: MatchPhase.TryScored, key, primary: scorer },
      ],
    },
    primaryPlayer: scorer,
    events,
  };
}
