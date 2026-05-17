import type { Player } from '../../types/player';
import type { KickOffResult } from '../../types/engine';
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
): KickOffResolution {
  const kickScore = kicker.currentStats.kicking + rng(1, 20);
  const goodKick  = kickScore >= 35;

  // Good kick: long (25–40m), hard to catch. Poor kick: short (10–20m), easy to catch.
  const distance  = goodKick ? rng(25, 40) : rng(10, 20);
  const catchMod  = goodKick ? 0 : 15;

  const catchScore = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20) + catchMod;
  const chaseScore = (chaser.currentStats.pace + chaser.currentStats.agility) / 2 + rng(1, 20);
  const margin = catchScore - chaseScore;

  let result: KickOffResult;
  if (margin > 10)  result = 'clean_receive';
  else if (margin > -5) result = 'contested';
  else result = 'knock_on';

  return { result, kickScore, catchScore, chaseScore, distance };
}
