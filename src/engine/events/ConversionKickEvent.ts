import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveGoalKick } from '../resolvers/KickingResolver';
import { getCommentary } from '../CommentaryEngine';

export function handleConversionKick({ state, attackTeam, draftEvent }: PhaseContext): PhaseResult {
  const kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
  const distFromPosts = Math.abs(state.ballY - 50) * 0.4;
  const res = resolveGoalKick(kicker, distFromPosts);

  kicker.matchStats.kicksAtGoal++;
  let commentary: string;
  if (res.success) {
    kicker.matchStats.kicksMade++;
    state.score[state.possession] += 2;
    commentary = getCommentary({ ...draftEvent(MatchPhase.ConversionKick), primaryPlayer: kicker }, 'success');
  } else {
    kicker.matchStats.kicksMissed++;
    commentary = getCommentary({ ...draftEvent(MatchPhase.ConversionKick), primaryPlayer: kicker }, 'miss');
  }

  state.possession = state.possession === 'home' ? 'away' : 'home';
  state.ballX = 50;
  state.ballY = 50;

  return { nextPhase: MatchPhase.KickOff, commentary, primaryPlayer: kicker };
}
