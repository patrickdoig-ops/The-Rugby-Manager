import type { Player } from '../../types/player';
import type { KickOffResult, KickOffStrategy } from '../../types/engine';
import { rng } from '../../utils/rng';
import { KICK_OFF_VALUES } from '../balance';

export interface KickOffResolution {
  result: KickOffResult;
  distance: number;
}

export function resolveKickOff(
  kicker: Player,
  receiver: Player,
  chaser: Player,
  strategy: KickOffStrategy,
): KickOffResolution {
  const V = KICK_OFF_VALUES;
  const kickScore = kicker.currentStats.kicking + rng(1, 20);
  const goodKick  = kickScore >= V.goodKickThreshold;

  if (strategy === 'high_ball') {
    const distance   = goodKick ? rng(V.highBall.good[0], V.highBall.good[1]) : rng(V.highBall.poor[0], V.highBall.poor[1]);
    const catchScore = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20);
    return { result: catchScore < V.catchKnockOnThreshold ? 'knock_on' : 'clean_receive', distance };
  }

  if (strategy === 'short_kick') {
    const distance = goodKick ? rng(V.short.good[0], V.short.good[1]) : rng(V.short.poor[0], V.short.poor[1]);
    if (distance < V.short.autoPoorIfUnder) return { result: 'poor_kick', distance };
    const catchScore = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20);
    const chaseScore = (chaser.currentStats.pace + chaser.currentStats.agility) / 2 + rng(1, 20);
    const margin     = catchScore - chaseScore;
    if (margin > V.shortKickClearMargin) return { result: 'clean_receive', distance };
    if (margin > V.shortKickRetainMargin) return { result: rng(1, 100) <= V.shortKickRetainProb ? 'short_kick_retain' : 'clean_receive', distance };
    return { result: 'knock_on', distance };
  }

  // grubber
  const distance   = goodKick ? rng(V.grubber.good[0], V.grubber.good[1]) : rng(V.grubber.poor[0], V.grubber.poor[1]);
  if (distance < V.short.autoPoorIfUnder) return { result: 'poor_kick', distance };
  const catchScore = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20);
  return { result: catchScore < V.catchKnockOnThreshold ? 'knock_on' : 'clean_receive', distance };
}
