import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveKickOff } from '../resolvers/KickOffResolver';
import { getCommentary } from '../CommentaryEngine';
import { clamp } from '../../utils/math';

export function handleKickOff({ state, attackTeam, defendTeam, attackDir, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
  const receiver = randomPlayer(defendTeam);
  const chaser   = randomPlayer(attackTeam);
  const res = resolveKickOff(kicker, receiver, chaser);

  // Ball lands at the kick distance from halfway
  state.ballX = clamp(50 + attackDir() * res.distance, 5, 95);

  if (res.result === 'knock_on') {
    // Receiver drops it — scrum at landing position, kicking team puts in (no possession flip)
    adjustRating(receiver, -0.25);
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, 'knock_on'),
      primaryPlayer: receiver,
      secondaryPlayer: chaser,
    };
  }

  if (res.result === 'clean_receive') {
    // Receiving team secures the ball — possession flips to them
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, 'clean_receive'),
      primaryPlayer: receiver,
      secondaryPlayer: chaser,
    };
  }

  // contested — neither side secures cleanly, play on
  return {
    nextPhase: MatchPhase.OpenPlay,
    commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, 'contested'),
    primaryPlayer: receiver,
    secondaryPlayer: chaser,
  };
}
