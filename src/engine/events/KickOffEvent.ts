import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveKickOff } from '../resolvers/KickOffResolver';
import { getCommentary } from '../CommentaryEngine';
import { clamp } from '../../utils/math';

export function handleKickOff({ state, attackTeam, defendTeam, attackDir, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
  const receiver = randomPlayer(defendTeam);
  const chaser   = randomPlayer(attackTeam);
  const res = resolveKickOff(kicker, receiver, chaser, attackTeam.tactics.kickOffStrategy, defendTeam.tactics.backfieldDefence);

  state.ballX = clamp(50 + attackDir() * res.distance, 5, 95);

  if (res.result === 'poor_kick') {
    // Kick fails to reach 10m — scrum at halfway to receiving team
    adjustRating(kicker, -0.225);
    state.ballX = 50;
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: kicker }, 'poor_kick'),
      primaryPlayer: kicker,
    };
  }

  if (res.result === 'knock_on') {
    // Receiver drops it — scrum at landing position, kicking team puts in
    adjustRating(receiver, -0.375);
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, 'knock_on'),
      primaryPlayer: receiver,
      secondaryPlayer: chaser,
    };
  }

  if (res.result === 'short_kick_retain') {
    // Kicking team regathers — no possession flip
    return {
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: chaser, secondaryPlayer: receiver }, 'short_kick_retain'),
      primaryPlayer: chaser,
      secondaryPlayer: receiver,
    };
  }

  if (res.result === 'clean_receive') {
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, 'clean_receive'),
      primaryPlayer: receiver,
      secondaryPlayer: chaser,
    };
  }

  // contested — receiving team scrambles possession
  state.possession = state.possession === 'home' ? 'away' : 'home';
  return {
    nextPhase: MatchPhase.KickReturn,
    commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, 'contested'),
    primaryPlayer: receiver,
    secondaryPlayer: chaser,
  };
}
