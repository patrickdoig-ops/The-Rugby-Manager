import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveTacticalKick } from '../resolvers/KickingResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

export function handleTacticalKick({ state, attackTeam, defendTeam, attackDir, inOwn22, inOwnHalf, inOpposition22, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const kicker   = attackTeam.players.find(p => p.id === 10 || p.id === 9) ?? attackTeam.players[0];
  const defender = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam);
  
  const startedInOwn22 = inOwn22();
  const startedInOwnHalf = inOwnHalf();
  const originalBallX = state.ballX;

  const res = resolveTacticalKick(kicker);
  const goodKick         = res.kickScore >= 25;
  const goesOutOnTheFull = rng(1, 100) <= res.outOnTheFullProbability;
  const goesToTouch      = !goesOutOnTheFull && rng(1, 100) <= res.touchProbability;

  const kickDir = attackDir();
  
  // Update ballX tentatively
  state.ballX = clamp(state.ballX + kickDir * res.distance, 5, 95);

  adjustRating(kicker, goodKick ? +0.1 : -0.15);

  if (goesOutOnTheFull) {
    if (!startedInOwn22) {
      // Out on the full
      state.ballX = originalBallX;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      return {
        nextPhase: MatchPhase.Lineout,
        commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker }, 'out_on_the_full'),
        primaryPlayer: kicker,
      };
    }
    // Kicked directly to touch from inside own 22 - gains ground, standard touch
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.Lineout,
      commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'good_kick'),
      primaryPlayer: kicker,
      secondaryPlayer: defender,
    };
  }

  if (goesToTouch) {
    const landedInOpposition22 = inOpposition22();
    if (startedInOwnHalf && landedInOpposition22) {
      // 50:22 rule - kicking team retains possession!
      return {
        nextPhase: MatchPhase.Lineout,
        commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker }, 'fifty_twenty_two'),
        primaryPlayer: kicker,
      };
    }

    // Standard touch
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.Lineout,
      commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'good_kick'),
      primaryPlayer: kicker,
      secondaryPlayer: defender,
    };
  }

  // Kept in field
  state.possession = state.possession === 'home' ? 'away' : 'home';
  return {
    nextPhase: MatchPhase.OpenPlay,
    commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'kick_caught'),
    primaryPlayer: kicker,
    secondaryPlayer: defender,
  };
}
