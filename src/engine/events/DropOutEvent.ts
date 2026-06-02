import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveDropOut } from '../resolvers/DropOutResolver';
import { clamp } from '../../utils/math';
import { rng } from '../../utils/rng';
import { attackDir, onFieldPlayers, pickKicker } from '../FieldPosition';
import { dropOutLandingY } from '../Lateral';
import { SLOT } from '../Slot';

// 22m drop-out: defending team restarts after a missed penalty kick at goal.
// Mirrors `handleKickOff` shape exactly — same outcome family (KickOffResult)
// and the same downstream phase routing. Differences:
//   - No strategy choice (drop-kicks are a single fixed model).
//   - Kicker stands at their own 22 (state.ball.x set by KickAtGoalHandler
//     before the phase transition).
//   - Receiver pool is the back three + scrum-half (aerial drop-kick is
//     contested by the deep defenders, same as a high-ball kick-off).
//   - poor_kick = drop-kick failed to clear the 22m line → scrum to the
//     receiving team at the spot of the kick (the kicker's own 22).
export function handleDropOut({ state, attackTeam, defendTeam, randomPlayer }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const defendSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';
  const kicker = pickKicker(attackTeam, state, attackSide);

  const pool = onFieldPlayers(defendTeam, state, defendSide).filter(p =>
    p.id === SLOT.SCRUM_HALF || p.id === SLOT.WING_11 || p.id === SLOT.WING_14 || p.id === SLOT.FULL_BACK);
  const receiver = pool.length > 0 ? pool[rng(0, pool.length - 1)] : randomPlayer(defendTeam);
  const chaser   = randomPlayer(attackTeam);

  const res = resolveDropOut(kicker, receiver);

  // Kick stats always count, regardless of outcome.
  const events: MatchEvent[] = [
    { type: 'KICK_FROM_HAND', kicker, metres: 0 },
  ];

  if (res.result === 'poor_kick') {
    // Failed to clear the 22 — scrum to the receiving team at the spot of the kick.
    events.push({ type: 'POSSESSION_SWAPPED' });
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.DropOut22, key: 'poor_kick', primary: kicker }] },
      primaryPlayer: kicker,
      events,
    };
  }

  // Ball lands where the drop-kick reaches — angled diagonally toward the open side.
  events.unshift({
    type: 'BALL_REPOSITIONED',
    x: clamp(state.ball.x + attackDir(state) * res.distance, 5, 95),
    y: dropOutLandingY(state, res.distance),
  });

  if (res.result === 'knock_on') {
    // Scrum where the ball was dropped; kicking team puts in (possession unchanged).
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.DropOut22, key: 'knock_on', primary: receiver, secondary: chaser }] },
      primaryPlayer: receiver,
      secondaryPlayer: chaser,
      events,
    };
  }

  // clean_receive — receiving team takes possession and runs it back.
  events.push({ type: 'POSSESSION_SWAPPED' });
  events.push({ type: 'KICK_RETURN_CARRIER_SET', player: receiver });
  return {
    nextPhase: MatchPhase.KickReturn,
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.DropOut22, key: 'clean_receive', primary: receiver, secondary: chaser }] },
    primaryPlayer: receiver,
    secondaryPlayer: chaser,
    events,
  };
}
