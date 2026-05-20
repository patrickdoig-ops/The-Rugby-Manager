import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationDescriptor } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveTacticalKick } from '../resolvers/KickingResolver';
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

  const res = resolveTacticalKick(kicker);
  const backfield = defendTeam.tactics.backfieldDefence;
  const touchReduction = TACTIC_MODIFIERS.tacticalKickTouchReduction[backfield];
  const goesOutOnTheFull = rng(1, 100) <= res.outOnTheFullProbability;
  const goesToTouch      = !goesOutOnTheFull && rng(1, 100) <= Math.max(0, res.touchProbability - touchReduction);

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
