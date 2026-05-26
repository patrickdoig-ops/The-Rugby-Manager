import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationDescriptor, PhaseOutcomeKey } from '../../types/narration';
import type { BackfieldDefence, Team } from '../../types/team';
import type { MatchState } from '../../types/match';
import type { Player } from '../../types/player';
import { MatchPhase, type AttackingKickSubType } from '../../types/engine';
import { resolveTacticalKick, resolveFiftyTwentyTwo, resolveAttackingKick } from '../resolvers/KickingResolver';
import { attackDir, inOwn22, inOwnHalf, inOpposition22At, onFieldPlayers, pickKicker, pickFullback } from '../FieldPosition';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { TACTIC_MODIFIERS, COMMENTARY_CHANCES } from '../balance';
import { SLOT } from '../Slot';

export function handleTacticalKick({ state, attackTeam, defendTeam, randomPlayer }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const defendSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';
  const kicker   = pickKicker(attackTeam, state, attackSide);
  const defender = pickFullback(defendTeam, state, defendSide);

  const startedInOwn22 = inOwn22(state);
  const startedInOwnHalf = inOwnHalf(state);
  const originalBallX = state.ball.x;
  const intent = state.pendingKick;

  const plan = attackTeam.tactics.attackingGamePlan;

  // Deliberate 50/22 attempt — branches out of the regular tactical-kick
  // path because success math is gated by the defending team's backfield
  // posture, not the standard touch-finder probability table.
  if (intent?.family === 'fifty_22' && startedInOwnHalf) {
    return handleFiftyTwentyTwoAttempt(state, kicker, defender, defendTeam.tactics.backfieldDefence, originalBallX, plan);
  }

  // Attacking kick — cross-field or grubber from #10 in / near the
  // opposition half. Routes to a separate resolver because the outcome
  // is regather/contest/dead rather than touch/caught.
  if (intent?.family === 'attacking' && intent.attackingSubType) {
    return handleAttackingKick(state, kicker, defender, defendTeam, intent.attackingSubType, randomPlayer);
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

  // Gameplan distance bonus — a team on the `kicking` plan kicks longer
  // from #10 (territory + clearance routed through TacticalKick); other
  // plans see no bonus. Applied AFTER the touch / out-on-the-full rolls
  // so it only affects how far the ball travels, not whether it finds
  // touch (the resolver's touch probability already handled that).
  const kickDistance = res.distance + TACTIC_MODIFIERS.gamePlanKickDistanceBonus[plan];
  const kickDir = attackDir(state);
  const newBallX = clamp(state.ball.x + kickDir * kickDistance, 5, 95);

  const events: MatchEvent[] = [
    { type: 'KICK_FROM_HAND', kicker, metres: kickDistance },
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
  plan: 'possession' | 'balanced' | 'kicking',
): PhaseResult {
  const successBonus = TACTIC_MODIFIERS.gamePlanFiftyTwentyTwoBonus[plan];
  const res = resolveFiftyTwentyTwo(kicker, defenderBackfield, successBonus);
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

// Attacking kick — cross-field (high aerial contest to far wing) or
// grubber (low rolling kick through the defensive line). The chaser is a
// random outside back from the attacking team for cross-field; a centre
// or back-row for grubber. Outcome from resolveAttackingKick:
//   attacker_wins:  chaser gathers — KickReturn with attacker carrying
//   defender_wins:  defender catches/collects — KickReturn (turnover)
//   dead:           knock-on / out — Scrum to the defending side
function handleAttackingKick(
  state: MatchState,
  kicker: Player,
  defender: Player,
  defendTeam: Team,
  subType: AttackingKickSubType,
  randomPlayer: (team: Team) => Player,
): PhaseResult {
  const res = resolveAttackingKick(subType, kicker);
  const kickDir = attackDir(state);
  const newBallX = clamp(state.ball.x + kickDir * res.distance, 5, 95);
  const events: MatchEvent[] = [
    { type: 'KICK_FROM_HAND', kicker, metres: res.distance },
    { type: 'BALL_REPOSITIONED', x: newBallX },
  ];
  const narrKey: PhaseOutcomeKey =
    subType === 'cross_field'
      ? (res.outcome === 'attacker_wins' ? 'cross_field_caught'
         : res.outcome === 'defender_wins' ? 'cross_field_contested'
         : 'cross_field_dead')
      : (res.outcome === 'attacker_wins' ? 'grubber_regathered'
         : res.outcome === 'defender_wins' ? 'grubber_collected'
         : 'grubber_dead');

  if (res.outcome === 'attacker_wins') {
    // Attacker regathers. Possession stays; chaser carries via KickReturn.
    const attackTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
    const chaserPool = onFieldPlayers(attackTeam, state, state.possession).filter(p =>
      p.id === SLOT.WING_11 || p.id === SLOT.CENTRE_13 || p.id === SLOT.WING_14);
    const chaser = chaserPool.length > 0 ? chaserPool[rng(0, chaserPool.length - 1)] : kicker;
    events.push({ type: 'KICK_RETURN_CARRIER_SET', player: chaser });
    return {
      nextPhase: MatchPhase.KickReturn,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: narrKey, primary: kicker, secondary: chaser }] },
      primaryPlayer: kicker,
      secondaryPlayer: chaser,
      events,
    };
  }

  if (res.outcome === 'defender_wins') {
    events.push({ type: 'POSSESSION_SWAPPED' });
    events.push({ type: 'KICK_RETURN_CARRIER_SET', player: defender });
    return {
      nextPhase: MatchPhase.KickReturn,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: narrKey, primary: kicker, secondary: defender }] },
      primaryPlayer: kicker,
      secondaryPlayer: defender,
      events,
    };
  }

  // dead — knock-on / out of play. Scrum to the defending side.
  events.push({ type: 'POSSESSION_SWAPPED' });
  return {
    nextPhase: MatchPhase.Scrum,
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.TacticalKick, key: narrKey, primary: kicker, secondary: defender }] },
    primaryPlayer: kicker,
    secondaryPlayer: defender,
    events,
  };
}
