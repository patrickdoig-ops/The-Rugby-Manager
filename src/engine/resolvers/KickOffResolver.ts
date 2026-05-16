import type { Player } from '../../types/player';
import type { KickOffResult } from '../../types/engine';
import { rng } from '../../utils/rng';

export interface KickOffResolution {
  result: KickOffResult;
  kickScore: number;
  catchScore: number;
  chaseScore: number;
}

export function resolveKickOff(
  kicker: Player,
  receiver: Player,
  chaser: Player,
): KickOffResolution {
  const kickScore = kicker.currentStats.kicking + rng(1, 20);

  if (kickScore < 35) {
    return { result: 'knock_on', kickScore, catchScore: 0, chaseScore: 0 };
  }

  const catchScore  = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20);
  const chaseScore  = (chaser.currentStats.pace + chaser.currentStats.agility) / 2 + rng(1, 20);
  const margin = catchScore - chaseScore;

  let result: KickOffResult;
  if (margin > 10)  result = 'clean_receive';
  else if (margin > -5) result = 'contested';
  else result = 'knock_on';

  return { result, kickScore, catchScore, chaseScore };
}
