import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { PhaseOutcomeKey } from '../../types/narration';
import type { TryAftermathContext } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { SCORE_VALUES, TRY_AFTERMATH_CONTEXT } from '../balance';

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
  // The carrier who crossed the line is threaded through state by PhaseRouter
  // (see pendingTryScorer in match.ts). Reading it back off the event log is
  // unsafe: an AI sub can land between that tick and this one, leaving an
  // opponent's substitution at the tail of the log.
  const scorer = state.pendingTryScorer ?? randomPlayer(attackTeam);

  const events: MatchEvent[] = [
    { type: 'TRY_SCORED', scorer, side: state.possession },
    { type: 'PENDING_TRY_SCORER_SET', scorer: undefined },
  ];

  const oppSide = state.possession === 'home' ? 'away' : 'home';
  const leadKey = tryLeadKey(state.score[state.possession], state.score[oppSide]);

  // Crowd-reaction context. state.score is still pre-try here, so project the
  // 5 points forward (mirrors tryLeadKey) to get the post-try margin.
  const margin = Math.abs(state.score[state.possession] + SCORE_VALUES.try - state.score[oppSide]);
  const isBlowout = margin >= TRY_AFTERMATH_CONTEXT.blowoutMargin;
  const aftermath: TryAftermathContext = {
    scoringSideIsHome: state.possession === 'home',
    neutralVenue: state.engine.neutralVenue,
    isSwing: leadKey !== 'try_extend_lead',
    isBlowout,
    isLateDrama:
      !isBlowout &&
      state.clock.gameMinute >= TRY_AFTERMATH_CONTEXT.lateGameMinute &&
      margin <= TRY_AFTERMATH_CONTEXT.lateDramaMargin,
  };

  return {
    nextPhase: MatchPhase.ConversionKick,
    narration: {
      steps: [
        { kind: 'phase_outcome', phase: MatchPhase.TryScored, key: leadKey, primary: scorer },
        { kind: 'announcement', key: 'try_aftermath', params: { tryAftermath: aftermath } },
      ],
    },
    primaryPlayer: scorer,
    events,
  };
}
