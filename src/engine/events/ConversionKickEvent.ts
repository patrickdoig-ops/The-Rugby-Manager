import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveGoalKick } from '../resolvers/KickingResolver';
import { CONVERSION_VALUES } from '../balance';
import { pickKicker } from '../FieldPosition';

export function handleConversionKick({ state, attackTeam }: PhaseContext): PhaseResult {
  const kicker = pickKicker(attackTeam, state, state.possession);
  const distFromPosts = Math.abs(state.ball.y - 50) * CONVERSION_VALUES.distanceFromPostsWeight;
  const res = resolveGoalKick(kicker, distFromPosts);

  const side = state.possession;
  const key = res.success ? 'success' : 'miss';

  const events: MatchEvent[] = [
    { type: 'CONVERSION_KICKED', kicker, side, success: res.success },
    { type: 'POSSESSION_SWAPPED' },
    { type: 'BALL_REPOSITIONED', x: 50, y: 50 },
  ];

  return {
    nextPhase: MatchPhase.KickOff,
    narration: {
      steps: [
        { kind: 'announcement', key: 'kicker_steps_up', primary: kicker },
        { kind: 'phase_outcome', phase: MatchPhase.ConversionKick, key, primary: kicker },
      ],
    },
    primaryPlayer: kicker,
    events,
  };
}
