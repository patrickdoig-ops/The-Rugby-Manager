import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { PhaseOutcomeKey } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { SCORE_VALUES } from '../balance';

// The try line is keyed off the lead it produces. The handler is read-only —
// TRY_SCORED is applied by PhaseRouter after this returns — so `state.score`
// is still the pre-try score; project the try forward to classify the result
// (the conversion hasn't happened yet, so only the 5 try points count).
function tryLeadKey(scoringScore: number, oppScore: number): PhaseOutcomeKey {
  const after = scoringScore + SCORE_VALUES.try;
  if (after > oppScore) return scoringScore > oppScore ? 'try_extend_lead' : 'try_lead';
  if (after === oppScore) return 'try_level';
  return 'try_trail';
}

export function handleTryScored({ state, attackTeam, randomPlayer }: PhaseContext): PhaseResult {
  const lastEvent = state.events[state.events.length - 1];
  const scorer = lastEvent?.primaryPlayer ?? randomPlayer(attackTeam);

  const events: MatchEvent[] = [
    { type: 'TRY_SCORED', scorer, side: state.possession },
  ];

  const oppSide = state.possession === 'home' ? 'away' : 'home';
  const leadKey = tryLeadKey(state.score[state.possession], state.score[oppSide]);

  return {
    nextPhase: MatchPhase.ConversionKick,
    narration: {
      steps: [
        { kind: 'phase_outcome', phase: MatchPhase.TryScored, key: leadKey, primary: scorer },
        { kind: 'announcement', key: 'try_aftermath' },
      ],
    },
    primaryPlayer: scorer,
    events,
  };
}
