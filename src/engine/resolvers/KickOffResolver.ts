import type { Player } from '../../types/player';
import type { KickOffResult, KickOffStrategy } from '../../types/engine';
import { rng } from '../../utils/rng';

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
  const kickScore = kicker.currentStats.kicking + rng(1, 20);
  const goodKick  = kickScore >= 35;

  if (strategy === 'high_ball') {
    const distance   = goodKick ? rng(25, 40) : rng(15, 25);
    const catchScore = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20);
    return { result: catchScore < 30 ? 'knock_on' : 'clean_receive', distance };
  }

  if (strategy === 'short_kick') {
    const distance = goodKick ? rng(10, 20) : rng(4, 9);
    if (distance < 10) return { result: 'poor_kick', distance };
    const catchScore = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20);
    const chaseScore = (chaser.currentStats.pace + chaser.currentStats.agility) / 2 + rng(1, 20);
    const margin     = catchScore - chaseScore;
    if (margin > 10) return { result: 'clean_receive', distance };
    if (margin > -5) return { result: rng(1, 100) <= 30 ? 'short_kick_retain' : 'clean_receive', distance };
    return { result: 'knock_on', distance };
  }

  // grubber
  const distance   = goodKick ? rng(15, 25) : rng(4, 9);
  if (distance < 10) return { result: 'poor_kick', distance };
  const catchScore = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20);
  return { result: catchScore < 30 ? 'knock_on' : 'clean_receive', distance };
}
