import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveKickOff } from '../resolvers/KickOffResolver';
import { getCommentary } from '../CommentaryEngine';
import { clamp } from '../../utils/math';
import { rng } from '../../utils/rng';

export function handleKickOff({ state, attackTeam, defendTeam, attackDir, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
  const receiver = randomPlayer(defendTeam);
  const chaser   = randomPlayer(attackTeam);
  const res = resolveKickOff(kicker, receiver, chaser, attackTeam.tactics.kickOffStrategy);

  // Ball lands at the kick distance from halfway
  state.ballX = clamp(50 + attackDir() * res.distance, 5, 95);

  if (res.result === 'knock_on') {
    // Receiver drops it — scrum at landing position, kicking team puts in (no possession flip)
    adjustRating(receiver, -0.375);
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
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, 'clean_receive'),
      primaryPlayer: receiver,
      secondaryPlayer: chaser,
    };
  }

  // contested — a short kick gives the kicking team a small chance to regather (15%)
  if (attackTeam.tactics.kickOffStrategy === 'short_kick' && rng(1, 100) <= 15) {
    return {
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: chaser, secondaryPlayer: receiver }, 'short_kick_retain'),
      primaryPlayer: chaser,
      secondaryPlayer: receiver,
    };
  }

  // All other contested results — receiving team scrambles possession
  state.possession = state.possession === 'home' ? 'away' : 'home';
  return {
    nextPhase: MatchPhase.KickReturn,
    commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, 'contested'),
    primaryPlayer: receiver,
    secondaryPlayer: chaser,
  };
}
