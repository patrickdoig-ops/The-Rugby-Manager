import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveKickOff } from '../resolvers/KickOffResolver';
import { getCommentary } from '../CommentaryEngine';

export function handleKickOff({ state, attackTeam, defendTeam, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
  const receiver = randomPlayer(defendTeam);
  const chaser   = randomPlayer(attackTeam);
  const res = resolveKickOff(kicker, receiver, chaser);

  if (res.result === 'knock_on') {
    adjustRating(receiver, -0.25);
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Scrum), primaryPlayer: receiver, secondaryPlayer: chaser }, 'knock_on'),
      primaryPlayer: receiver,
      secondaryPlayer: chaser,
    };
  }

  return {
    nextPhase: MatchPhase.OpenPlay,
    commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, res.result),
    primaryPlayer: receiver,
    secondaryPlayer: chaser,
  };
}
