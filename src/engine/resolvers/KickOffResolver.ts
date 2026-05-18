import type { Player } from '../../types/player';
import type { KickOffResult } from '../../types/engine';
import type { KickOffStrategy } from '../../types/engine';
import type { BackfieldDefence } from '../../types/team';
import { rng } from '../../utils/rng';

export interface KickOffResolution {
  result: KickOffResult;
  distance: number;
}

export function resolveKickOff(
  kicker: Player,
  receiver: Player,
  chaser: Player,
  strategy: KickOffStrategy = 'high_ball',
  backfieldDefence: BackfieldDefence = 'one_back',
): KickOffResolution {
  const kickScore = kicker.currentStats.kicking + rng(1, 20);
  const goodKick  = kickScore >= 35;

  let distance: number;
  let catchMod: number;

  if (strategy === 'short_kick') {
    distance = goodKick ? rng(10, 18) : rng(8, 12);
    catchMod = goodKick ? -5 : 10;
  } else if (strategy === 'grubber') {
    distance = rng(15, 30);
    catchMod = -10;
  } else {
    // high_ball
    distance = goodKick ? rng(25, 40) : rng(10, 20);
    catchMod = goodKick ? 0 : 15;
  }

  // Backfield defenders positioned deep improve catch reliability
  catchMod += backfieldDefence === 'three_back' ? 15 : backfieldDefence === 'two_back' ? 8 : 0;

  // Poor short kick fails to reach the 10m line — referee calls it back
  if (strategy === 'short_kick' && !goodKick && distance < 10) {
    return { result: 'poor_kick', distance };
  }

  const catchScore = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20) + catchMod;
  const chaseScore = (chaser.currentStats.pace + chaser.currentStats.agility) / 2 + rng(1, 20);
  const margin = catchScore - chaseScore;

  let result: KickOffResult;
  if (margin > 10)       result = 'clean_receive';
  else if (margin > -5)  result = 'contested';
  else                   result = 'knock_on';

  // Short kick contested — 15% chance kicking team regathers
  if (result === 'contested' && strategy === 'short_kick' && rng(1, 100) <= 15) {
    result = 'short_kick_retain';
  }

  return { result, distance };
}
