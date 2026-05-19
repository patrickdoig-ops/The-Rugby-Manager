import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveGoalKick } from '../resolvers/KickingResolver';
import { getCommentary } from '../CommentaryEngine';

export function handleConversionKick({ state, attackTeam, draftEvent }: PhaseContext): PhaseResult {
  const kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
  const distFromPosts = Math.abs(state.ballY - 50) * 0.4;
  const res = resolveGoalKick(kicker, distFromPosts);

  const side = state.possession;
  const commentary = getCommentary(
    { ...draftEvent(MatchPhase.ConversionKick), primaryPlayer: kicker },
    res.success ? 'success' : 'miss',
  );

  const events: MatchEvent[] = [
    { type: 'CONVERSION_KICKED', kicker, side, success: res.success },
    { type: 'POSSESSION_SWAPPED' },
    { type: 'BALL_REPOSITIONED', x: 50, y: 50 },
  ];

  return { nextPhase: MatchPhase.KickOff, commentary, primaryPlayer: kicker, events };
}
