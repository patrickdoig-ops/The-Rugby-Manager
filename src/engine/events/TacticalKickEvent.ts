import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveTacticalKick } from '../resolvers/KickingResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return rng(1, 100) <= chancePct ? ' ' + lines[rng(0, lines.length - 1)] : '';
}

export function handleTacticalKick({ state, attackTeam, defendTeam, attackDir, inOwn22, inOwnHalf, inOpposition22, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players.find(p => p.id === 9) ?? attackTeam.players[0];
  kicker.matchStats.kicksFromHand++;
  const defender = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam);
  
  const startedInOwn22 = inOwn22();
  const startedInOwnHalf = inOwnHalf();
  const originalBallX = state.ballX;

  const res = resolveTacticalKick(kicker);
  kicker.matchStats.kickMetres += res.distance;
  const goodKick = res.kickScore >= 25;
  const backfield = defendTeam.tactics.backfieldDefence;
  const touchReduction = backfield === 'three_back' ? 25 : backfield === 'two_back' ? 15 : 0;
  const goesOutOnTheFull = rng(1, 100) <= res.outOnTheFullProbability;
  const goesToTouch      = !goesOutOnTheFull && rng(1, 100) <= Math.max(0, res.touchProbability - touchReduction);

  const kickDir = attackDir();
  
  // Update ballX tentatively
  state.ballX = clamp(state.ballX + kickDir * res.distance, 5, 95);

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
      const fiftyTwentyNote = (state.possession !== 'home' && backfield === 'one_back')
        ? tacticNote(25,
            "Only one player in the backfield — they didn't have the numbers to cover that kick to the corner.",
            "The 50:22 exploits the shallow backfield — there was simply nobody to chase it down.",
          )
        : '';
      return {
        nextPhase: MatchPhase.Lineout,
        commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker }, 'fifty_twenty_two') + fiftyTwentyNote,
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

  // Kept in field — receiver attacks with backfield support
  const returnBonus = backfield === 'three_back' ? 10 : backfield === 'two_back' ? 5 : 0;
  if (returnBonus > 0) state.breakdownMod = { attack: returnBonus, defend: 0 };
  state.possession = state.possession === 'home' ? 'away' : 'home';
  state.kickReturnCarrier = defender;
  // After possession flip, home is now attacking if they caught the kick (state.possession === 'home')
  const kickCaughtNote = (returnBonus > 0 && state.possession === 'home')
    ? tacticNote(35,
        "The backfield presence pays dividends — plenty of runners in support and they're coming back at pace.",
        "That's the reward for committing to the backfield — the return is structured and dangerous.",
        backfield === 'three_back'
          ? "Three in the backfield and they've turned defence into attack in an instant — devastating counter."
          : "Two in the backfield and they've got the numbers to make something of this — good return.",
      )
    : '';
  return {
    nextPhase: MatchPhase.KickReturn,
    commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'kick_caught') + kickCaughtNote,
    primaryPlayer: kicker,
    secondaryPlayer: defender,
  };
}
