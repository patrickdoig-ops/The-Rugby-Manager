import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationDescriptor } from '../../types/narration';
import type { BackfieldDefence } from '../../types/team';
import type { MatchState } from '../../types/match';
import type { Player } from '../../types/player';
import { MatchPhase } from '../../types/engine';
import { resolveTacticalKick, resolveFiftyTwentyTwo } from '../resolvers/KickingResolver';
import { attackDir, inOwn22, inOwnHalf, inOpposition22At } from '../FieldPosition';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { TACTIC_MODIFIERS, COMMENTARY_CHANCES } from '../balance';

export function handleTacticalKick({ state, attackTeam, defendTeam, randomPlayer }: PhaseContext): PhaseResult {
  const kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players.find(p => p.id === 9) ?? attackTeam.players[0];
  const defender = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam);

  const startedInOwn22 = inOwn22(state);
  const startedInOwnHalf = inOwnHalf(state);
  const originalBallX = state.ball.x;
  const intent = state.pendingKick;

  // Deliberate 50/22 attempt — branches out of the regular tactical-kick
  // path because success math is gated by the defending team's backfield
  // posture, not the standard touch-finder probability table.
  if (intent?.family === 'fifty_22' && startedInOwnHalf) {
    return handleFiftyTwentyTwoAttempt(state, kicker, defender, defendTeam.tactics.backfieldDefence, originalBallX);
  }

  const res = resolveTacticalKick(kicker);
  const backfield = defendTeam.tactics.backfieldDefence;
  const touchReduction = TACTIC_MODIFIERS.tacticalKickTouchReduction[backfield];
  // Defensive line gives the kicker more (blitz) or less (drift) grass to
  // hit behind the front-line cover. Added on top of the backfield
  // reduction; clamped so the touch prob can't go negative.
  const defensiveLineKickMod = TACTIC_MODIFIERS.defensiveLineKickProbMod[defendTeam.tactics.defensiveLine];
  const goesOutOnTheFull = rng(1, 100) <= res.outOnTheFullProbability;
  const goesToTouch      = !goesOutOnTheFull && rng(1, 100) <= Math.max(0, res.touchProbability - touchReduction + defensiveLineKickMod);

  const kickDir = attackDir(state);
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
        narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: 'out_on_the_full', primary: kicker }] },
        primaryPlayer: kicker,
        events,
      };
    }
    // Kicked directly to touch from inside own 22 - gains ground, standard touch
    events.push({ type: 'POSSESSION_SWAPPED' });
    return {
      nextPhase: MatchPhase.Lineout,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: 'good_kick', primary: kicker, secondary: defender }] },
      primaryPlayer: kicker,
      secondaryPlayer: defender,
      events,
    };
  }

  if (goesToTouch) {
    const projectedInOppositionAfterKick = inOpposition22At(newBallX, state.possession, state.clock.halfTimeDone);

    if (startedInOwnHalf && projectedInOppositionAfterKick) {
      // 50:22 rule - kicking team retains possession!
      const steps: NarrationDescriptor['steps'] = [
        { kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: 'fifty_twenty_two', primary: kicker },
      ];
      if (backfield === 'one_back') {
        steps.push({ kind: 'tactic_note', cause: 'fifty_twenty_two_one_back', chancePct: COMMENTARY_CHANCES.tacticalKickFiftyTwentyTwo });
      }
      return {
        nextPhase: MatchPhase.Lineout,
        narration: { steps },
        primaryPlayer: kicker,
        events,
      };
    }

    // Standard touch
    events.push({ type: 'POSSESSION_SWAPPED' });
    return {
      nextPhase: MatchPhase.Lineout,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: 'good_kick', primary: kicker, secondary: defender }] },
      primaryPlayer: kicker,
      secondaryPlayer: defender,
      events,
    };
  }

  // Kept in field — receiver attacks with backfield support
  const returnBonus = TACTIC_MODIFIERS.tacticalKickReturnBonus[backfield];
  if (returnBonus > 0) events.push({ type: 'BREAKDOWN_MOD_SET', attack: returnBonus, defend: 0 });
  events.push({ type: 'POSSESSION_SWAPPED' });
  events.push({ type: 'KICK_RETURN_CARRIER_SET', player: defender });
  const kickCaughtSteps: NarrationDescriptor['steps'] = [
    { kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: 'kick_caught', primary: kicker, secondary: defender },
  ];
  if (returnBonus > 0) {
    kickCaughtSteps.push({
      kind: 'tactic_note',
      cause: 'kick_caught_return_bonus',
      chancePct: COMMENTARY_CHANCES.tacticalKickCaughtReturn,
      params: { backfieldDefence: backfield },
    });
  }
  return {
    nextPhase: MatchPhase.KickReturn,
    narration: { steps: kickCaughtSteps },
    primaryPlayer: kicker,
    secondaryPlayer: defender,
    events,
  };
}

// Deliberate 50/22 — the kicker is aiming for the corner from own half.
// Success math is gated by the defending team's backfield count + the
// kicker's `kicking` stat (see resolveFiftyTwentyTwo). Three outcomes:
//   success:         Lineout in opp 22 with attacking throw
//   touch_elsewhere: Lineout outside opp 22 with opposition throw
//   caught_in_field: KickReturn with opposition catching
function handleFiftyTwentyTwoAttempt(
  state: MatchState,
  kicker: Player,
  defender: Player,
  defenderBackfield: BackfieldDefence,
  originalBallX: number,
): PhaseResult {
  const res = resolveFiftyTwentyTwo(kicker, defenderBackfield);
  const kickDir = attackDir(state);
  const newBallX = clamp(state.ball.x + kickDir * res.distance, 5, 95);

  const events: MatchEvent[] = [
    { type: 'KICK_FROM_HAND', kicker, metres: res.distance },
    { type: 'FIFTY_22_ATTEMPTED', kicker, success: res.outcome === 'success', defenderBackfield },
    { type: 'BALL_REPOSITIONED', x: newBallX },
  ];

  if (res.outcome === 'success') {
    // 50/22 retained — attacking team throws into opp 22 lineout.
    return {
      nextPhase: MatchPhase.Lineout,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: 'fifty_twenty_two', primary: kicker }] },
      primaryPlayer: kicker,
      events,
    };
  }

  if (res.outcome === 'touch_elsewhere') {
    // Aimed for touch and got it, just not where they wanted. Lineout
    // forms where the ball went out; opposition throw.
    events.push({ type: 'POSSESSION_SWAPPED' });
    return {
      nextPhase: MatchPhase.Lineout,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: 'fifty_twenty_two_attempt_failed_touch', primary: kicker, secondary: defender }] },
      primaryPlayer: kicker,
      secondaryPlayer: defender,
      events,
    };
  }

  // caught_in_field — opposition fullback collects and runs.
  events.push({ type: 'POSSESSION_SWAPPED' });
  events.push({ type: 'KICK_RETURN_CARRIER_SET', player: defender });
  return {
    nextPhase: MatchPhase.KickReturn,
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: 'fifty_twenty_two_attempt_failed_caught', primary: kicker, secondary: defender }] },
    primaryPlayer: kicker,
    secondaryPlayer: defender,
    events,
  };
}
