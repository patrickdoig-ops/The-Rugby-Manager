import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveTacticalKick } from '../resolvers/KickingResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

export function handleTacticalKick({ state, attackTeam, defendTeam, attackDir, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const kicker   = attackTeam.players.find(p => p.id === 10 || p.id === 9) ?? attackTeam.players[0];
  const defender = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam);
  const res = resolveTacticalKick(kicker, defender);

  if (res.result === 'poor_kick') {
    adjustRating(kicker, -0.15);
    return {
      nextPhase: MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'poor_kick'),
      primaryPlayer: kicker,
      secondaryPlayer: defender,
    };
  }

  if (res.result === 'knock_on_catch') {
    adjustRating(defender, -0.2);
    state.stats.handlingErrors[state.possession === 'home' ? 'away' : 'home']++;
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'knock_on_catch'),
      primaryPlayer: kicker,
      secondaryPlayer: defender,
    };
  }

  // good_kick
  adjustRating(kicker, +0.1);
  let nextPhase: MatchPhase;
  if (rng(1, 100) <= 60) {
    const kickDir = attackDir(); // capture before possession swap
    state.possession = state.possession === 'home' ? 'away' : 'home';
    state.ballX = clamp(state.ballX + kickDir * Math.abs(res.ballMovement) * 2, 5, 95);
    nextPhase = MatchPhase.Lineout;
  } else {
    nextPhase = MatchPhase.OpenPlay;
  }

  return {
    nextPhase,
    commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'good_kick'),
    primaryPlayer: kicker,
    secondaryPlayer: defender,
  };
}
