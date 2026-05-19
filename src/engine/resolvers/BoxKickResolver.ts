import type { Player } from '../../types/player';
import { rng } from '../../utils/rng';
import { BOX_KICK_VALUES } from '../balance';

export type BoxKickResolution =
  | {
      quality: 'very_good';
      kickScore: number;
      wingerScore: number;
      fullbackScore: number;
      contestMargin: number;
      distance: number;
      outcome: 'attack_retain' | 'defend_knock_on' | 'defend_catch_contested';
    }
  | {
      quality: 'poor';
      kickScore: number;
      catchScore: number;
      distance: number;
      outcome: 'defend_catch' | 'knock_on';
    };

export function resolveBoxKick(
  scrumHalf: Player,
  winger: Player,
  fullback: Player,
  fullbackMod = 0,
): BoxKickResolution {
  const V = BOX_KICK_VALUES;
  const kickScore = scrumHalf.currentStats.kicking + rng(1, 20);

  if (kickScore < V.veryGoodKickThreshold) {
    const catchScore = (fullback.currentStats.handling + fullback.currentStats.positioning) / 2 + rng(1, 20) + fullbackMod;
    const outcome = catchScore >= V.uncontestedCatchThreshold ? 'defend_catch' : 'knock_on';
    const distance = rng(1, 2) === 1 ? V.poorKickFarDistance : V.poorKickShortDistance;
    return { quality: 'poor', kickScore, catchScore, distance, outcome };
  }

  const wingerScore   = (winger.currentStats.handling + winger.currentStats.pace) / 2 + rng(1, 20);
  const fullbackScore = (fullback.currentStats.handling + fullback.currentStats.positioning) / 2 + rng(1, 20) + fullbackMod;
  const contestMargin = wingerScore - fullbackScore;

  let outcome: 'attack_retain' | 'defend_knock_on' | 'defend_catch_contested';
  if (contestMargin >= V.contestClearMargin) outcome = 'attack_retain';
  else if (contestMargin >= 0)               outcome = 'defend_knock_on';
  else                                        outcome = 'defend_catch_contested';

  return { quality: 'very_good', kickScore, wingerScore, fullbackScore, contestMargin, distance: V.veryGoodKickDistance, outcome };
}
