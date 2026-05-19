import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveTacticalKick } from '../resolvers/KickingResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng, pickRandom, commentaryChance } from '../../utils/rng';
import { clamp } from '../../utils/math';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return commentaryChance(chancePct) ? ' ' + pickRandom(lines) : '';
}

export function handleTacticalKick({ state, attackTeam, defendTeam, attackDir, inOwn22, inOwnHalf, inOpposition22, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players.find(p => p.id === 9) ?? attackTeam.players[0];
  const defender = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam);

  const startedInOwn22 = inOwn22();
  const startedInOwnHalf = inOwnHalf();
  const originalBallX = state.ball.x;

  const res = resolveTacticalKick(kicker);
  const backfield = defendTeam.tactics.backfieldDefence;
  const touchReduction = backfield === 'three_back' ? 25 : backfield === 'two_back' ? 15 : 0;
  const goesOutOnTheFull = rng(1, 100) <= res.outOnTheFullProbability;
  const goesToTouch      = !goesOutOnTheFull && rng(1, 100) <= Math.max(0, res.touchProbability - touchReduction);

  const kickDir = attackDir();
  const newBallX = clamp(state.ball.x + kickDir * res.distance, 5, 95);

  const events: MatchEvent[] = [
    { type: 'KICK_FROM_HAND', kicker, metres: res.distance },
    { type: 'BALL_REPOSITIONED', x: newBallX },
  ];

  if (goesOutOnTheFull) {
    if (!startedInOwn22) {
      // Out on the full — ball reverts to where it was kicked from
      events.push({ type: 'BALL_REPOSITIONED', x: originalBallX });
      events.push({ type: 'POSSESSION_SWAPPED' });
      return {
        nextPhase: MatchPhase.Lineout,
        commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker }, 'out_on_the_full'),
        primaryPlayer: kicker,
        events,
      };
    }
    // Kicked directly to touch from inside own 22 - gains ground, standard touch
    events.push({ type: 'POSSESSION_SWAPPED' });
    return {
      nextPhase: MatchPhase.Lineout,
      commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'good_kick'),
      primaryPlayer: kicker,
      secondaryPlayer: defender,
      events,
    };
  }

  if (goesToTouch) {
    // Check inOpposition22 at the *projected* ballX without mutating state.
    const homeAttacksRight = !state.clock.halfTimeDone;
    const projectedInOppositionAfterKick = state.possession === 'home'
      ? (homeAttacksRight ? newBallX >= 78 : newBallX <= 22)
      : (homeAttacksRight ? newBallX <= 22 : newBallX >= 78);
    void inOpposition22;  // ctx helper unused — we project ballX ourselves

    if (startedInOwnHalf && projectedInOppositionAfterKick) {
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
        events,
      };
    }

    // Standard touch
    events.push({ type: 'POSSESSION_SWAPPED' });
    return {
      nextPhase: MatchPhase.Lineout,
      commentary: getCommentary({ ...draftEvent(MatchPhase.TacticalKick), primaryPlayer: kicker, secondaryPlayer: defender }, 'good_kick'),
      primaryPlayer: kicker,
      secondaryPlayer: defender,
      events,
    };
  }

  // Kept in field — receiver attacks with backfield support
  const returnBonus = backfield === 'three_back' ? 10 : backfield === 'two_back' ? 5 : 0;
  if (returnBonus > 0) events.push({ type: 'BREAKDOWN_MOD_SET', attack: returnBonus, defend: 0 });
  events.push({ type: 'POSSESSION_SWAPPED' });
  events.push({ type: 'KICK_RETURN_CARRIER_SET', player: defender });
  // After possession flip, home is now attacking if they caught the kick.
  // Compute that here using attackSide (before the swap is applied).
  const newAttackerSide: 'home' | 'away' = state.possession === 'home' ? 'away' : 'home';
  const kickCaughtNote = (returnBonus > 0 && newAttackerSide === 'home')
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
    events,
  };
}
