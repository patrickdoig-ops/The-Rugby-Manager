import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveKickOff } from '../resolvers/KickOffResolver';
import { clamp } from '../../utils/math';
import { rng } from '../../utils/rng';
import { attackDir } from '../FieldPosition';
import { SLOT, isForwardSlot } from '../Slot';

export function handleKickOff({ state, attackTeam, defendTeam, randomPlayer, kickOffStrategy }: PhaseContext): PhaseResult {
  const kicker = attackTeam.players.find(p => p.id === SLOT.FLY_HALF) ?? attackTeam.players[0];

  let receiver;
  let chaser;

  if (kickOffStrategy === 'high_ball') {
    const pool = defendTeam.players.filter(p =>
      p.id === SLOT.SCRUM_HALF || p.id === SLOT.WING_11 || p.id === SLOT.WING_14 || p.id === SLOT.FULL_BACK);
    receiver = pool.length > 0 ? pool[rng(0, pool.length - 1)] : randomPlayer(defendTeam);
    chaser   = randomPlayer(attackTeam);
  } else {
    const fwdPool = defendTeam.players.filter(p => isForwardSlot(p.id));
    receiver = fwdPool.length > 0 ? fwdPool[rng(0, fwdPool.length - 1)] : randomPlayer(defendTeam);
    if (kickOffStrategy === 'short_kick') {
      const chaserPool = attackTeam.players.filter(p =>
        p.id === SLOT.FLANKER_7 || p.id === SLOT.WING_11 || p.id === SLOT.WING_14);
      chaser = chaserPool.length > 0 ? chaserPool[rng(0, chaserPool.length - 1)] : randomPlayer(attackTeam);
    } else {
      chaser = randomPlayer(attackTeam);
    }
  }

  const res = resolveKickOff(kicker, receiver, chaser, kickOffStrategy);

  // Kick stats always count, regardless of outcome.
  const events: MatchEvent[] = [
    { type: 'KICK_FROM_HAND', kicker, metres: 0 },  // kicksFromHand++ (distance not tracked for kick-offs)
  ];

  if (res.result === 'poor_kick') {
    // Scrum awarded at halfway to the receiving team
    events.push({ type: 'BALL_REPOSITIONED', x: 50 });
    events.push({ type: 'POSSESSION_SWAPPED' });
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.KickOff, key: 'poor_kick', primary: kicker }] },
      primaryPlayer: kicker,
      events,
    };
  }

  // Ball lands where the kick reaches
  events.unshift({ type: 'BALL_REPOSITIONED', x: clamp(50 + attackDir(state) * res.distance, 5, 95) });

  if (res.result === 'knock_on') {
    // Scrum where the ball was dropped; kicking team puts in (possession unchanged)
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.KickOff, key: 'knock_on', primary: receiver, secondary: chaser }] },
      primaryPlayer: receiver,
      secondaryPlayer: chaser,
      events,
    };
  }

  if (res.result === 'short_kick_retain') {
    events.push({ type: 'KICK_RETURN_CARRIER_SET', player: chaser });
    return {
      nextPhase: MatchPhase.KickReturn,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.KickOff, key: 'short_kick_retain', primary: chaser, secondary: receiver }] },
      primaryPlayer: chaser,
      secondaryPlayer: receiver,
      events,
    };
  }

  // clean_receive — receiving team takes possession
  events.push({ type: 'POSSESSION_SWAPPED' });
  events.push({ type: 'KICK_RETURN_CARRIER_SET', player: receiver });
  return {
    nextPhase: MatchPhase.KickReturn,
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.KickOff, key: 'clean_receive', primary: receiver, secondary: chaser }] },
    primaryPlayer: receiver,
    secondaryPlayer: chaser,
    events,
  };
}
