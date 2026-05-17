import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveTacticalKick } from '../resolvers/KickingResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

export function handleTacticalKick({ state, attackTeam, defendTeam, attackDir, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const kicker   = attackTeam.players.find(p => p.id === 10 || p.id === 9) ?? attackTeam.players[0];
  const defender = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam);
  const res = resolveTacticalKick(kicker);

  const goodKick    = res.kickScore >= 25;
  const goesToTouch = rng(1, 100) <= res.touchProbability;

  // Ball travels forward; capture direction before possession flips
  const kickDir = attackDir();
  state.ballX = clamp(state.ballX + kickDir * res.distance, 5, 95);

  // Possession always transfers to the defending team
  state.possession = state.possession === 'home' ? 'away' : 'home';

  adjustRating(kicker, goodKick ? +0.1 : -0.15);

  if (goesToTouch) {
    return {
      nextPhase: MatchPhase.Lineout,
      commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'good_kick'),
      primaryPlayer: kicker,
      secondaryPlayer: defender,
    };
  }

  return {
    nextPhase: MatchPhase.OpenPlay,
    commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'kick_caught'),
    primaryPlayer: kicker,
    secondaryPlayer: defender,
  };
}
