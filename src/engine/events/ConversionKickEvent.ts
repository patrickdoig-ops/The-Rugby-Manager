import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { CONVERSION_VALUES } from '../balance';
import { pickKicker } from '../FieldPosition';

// Entry tick of the KickAtGoal micro-phase for a try conversion. Emits the
// kicker_steps_up beat and parks the engine in KickAtGoal; KickAtGoalHandler
// resolves the kick on the next (frozen-clock) tick. The shorter inter-tick
// delay is set by MatchCoordinator.nextTickDelay() when phase === KickAtGoal.
export function handleConversionKick({ state, attackTeam }: PhaseContext): PhaseResult {
  const kicker = pickKicker(attackTeam, state, state.possession);
  const distFromPosts = Math.abs(state.ball.y - 50) * CONVERSION_VALUES.distanceFromPostsWeight;

  const events: MatchEvent[] = [
    { type: 'KICK_AT_GOAL_STARTED', kicker, kind: 'conversion', distFromPosts },
  ];

  return {
    nextPhase: MatchPhase.KickAtGoal,
    narration: {
      steps: [
        { kind: 'announcement', key: 'kicker_steps_up', primary: kicker },
      ],
    },
    primaryPlayer: kicker,
    events,
  };
}
