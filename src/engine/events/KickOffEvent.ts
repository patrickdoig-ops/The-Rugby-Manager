import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveKickOff } from '../resolvers/KickOffResolver';
import { getCommentary } from '../CommentaryEngine';
import { clamp } from '../../utils/math';
import { rng } from '../../utils/rng';

export function handleKickOff({ state, attackTeam, defendTeam, attackDir, adjustRating, randomPlayer, draftEvent, kickOffStrategy }: PhaseContext): PhaseResult {
  const kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];

  let receiver;
  let chaser;

  if (kickOffStrategy === 'high_ball') {
    const pool = defendTeam.players.filter(p => [9, 11, 14, 15].includes(p.id));
    receiver = pool.length > 0 ? pool[rng(0, pool.length - 1)] : randomPlayer(defendTeam);
    chaser   = randomPlayer(attackTeam);
  } else {
    const fwdPool = defendTeam.players.filter(p => p.id <= 8);
    receiver = fwdPool.length > 0 ? fwdPool[rng(0, fwdPool.length - 1)] : randomPlayer(defendTeam);
    if (kickOffStrategy === 'short_kick') {
      const chaserPool = attackTeam.players.filter(p => [7, 11, 14].includes(p.id));
      chaser = chaserPool.length > 0 ? chaserPool[rng(0, chaserPool.length - 1)] : randomPlayer(attackTeam);
    } else {
      chaser = randomPlayer(attackTeam);
    }
  }

  const res = resolveKickOff(kicker, receiver, chaser, kickOffStrategy);
  state.ballX = clamp(50 + attackDir() * res.distance, 5, 95);

  if (res.result === 'poor_kick') {
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
    adjustRating(receiver, -0.375);
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, 'knock_on'),
      primaryPlayer: receiver,
      secondaryPlayer: chaser,
    };
  }

  if (res.result === 'short_kick_retain') {
    return {
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: chaser, secondaryPlayer: receiver }, 'short_kick_retain'),
      primaryPlayer: chaser,
      secondaryPlayer: receiver,
    };
  }

  // clean_receive — receiving team takes possession
  state.possession = state.possession === 'home' ? 'away' : 'home';
  return {
    nextPhase: MatchPhase.KickReturn,
    commentary: getCommentary({ ...draftEvent(MatchPhase.KickOff), primaryPlayer: receiver, secondaryPlayer: chaser }, 'clean_receive'),
    primaryPlayer: receiver,
    secondaryPlayer: chaser,
  };
}
