import type { Player } from '../../types/player';
import type { KickOffResult } from '../../types/engine';
import type { KickOffStrategy } from '../../types/team';
import { rng } from '../../utils/rng';

export interface KickOffResolution {
  result: KickOffResult;
  kickScore: number;
  catchScore: number;
  chaseScore: number;
  distance: number; // metres the kick travels
}

export function resolveKickOff(
  kicker: Player,
  receiver: Player,
  chaser: Player,
  strategy: KickOffStrategy = 'high_ball',
): KickOffResolution {
  const kickScore = kicker.currentStats.kicking + rng(1, 20);
  const goodKick  = kickScore >= 35;

  let distance: number;
  let catchMod: number;

  if (strategy === 'short_kick') {
    distance = goodKick ? rng(10, 18) : rng(8, 12);
    catchMod = goodKick ? -5 : 10; // Chaser gets better contest on good short kick
  } else if (strategy === 'grubber') {
    distance = rng(15, 30);
    catchMod = -10; // Hard low kick along ground makes clean catch difficult
  } else {
    // high_ball
    distance = goodKick ? rng(25, 40) : rng(10, 20);
    catchMod = goodKick ? 0 : 15;
  }

  const catchScore = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20) + catchMod;
  const chaseScore = (chaser.currentStats.pace + chaser.currentStats.agility) / 2 + rng(1, 20);
  const margin = catchScore - chaseScore;

  let result: KickOffResult;
  if (margin > 10)  result = 'clean_receive';
  else if (margin > -5) result = 'contested';
  else result = 'knock_on';

  return { result, kickScore, catchScore, chaseScore, distance };
}

