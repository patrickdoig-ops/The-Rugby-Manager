import type { Player } from '../../types/player';
import { rng } from '../../utils/rng';

const VERY_GOOD_KICK_THRESHOLD = 75;
const UNCONTESTED_CATCH_THRESHOLD = 35;
const CONTEST_CLEAR_MARGIN = 10;

export type BoxKickResolution =
  | {
      quality: 'very_good';
      kickScore: number;
      wingerScore: number;
      fullbackScore: number;
      contestMargin: number;
      outcome: 'attack_retain' | 'defend_knock_on' | 'defend_catch_contested';
    }
  | {
      quality: 'poor';
      kickScore: number;
      catchScore: number;
      outcome: 'defend_catch' | 'knock_on';
    };

export function resolveBoxKick(
  scrumHalf: Player,
  winger: Player,
  fullback: Player,
): BoxKickResolution {
  const kickScore = scrumHalf.currentStats.kicking + rng(1, 20);

  if (kickScore < VERY_GOOD_KICK_THRESHOLD) {
    const catchScore = (fullback.currentStats.handling + fullback.currentStats.positioning) / 2 + rng(1, 20);
    const outcome = catchScore >= UNCONTESTED_CATCH_THRESHOLD ? 'defend_catch' : 'knock_on';
    return { quality: 'poor', kickScore, catchScore, outcome };
  }

  const wingerScore   = (winger.currentStats.handling + winger.currentStats.pace) / 2 + rng(1, 20);
  const fullbackScore = (fullback.currentStats.handling + fullback.currentStats.positioning) / 2 + rng(1, 20);
  const contestMargin = wingerScore - fullbackScore;

  let outcome: 'attack_retain' | 'defend_knock_on' | 'defend_catch_contested';
  if (contestMargin >= CONTEST_CLEAR_MARGIN) outcome = 'attack_retain';
  else if (contestMargin >= 0)               outcome = 'defend_knock_on';
  else                                        outcome = 'defend_catch_contested';

  return { quality: 'very_good', kickScore, wingerScore, fullbackScore, contestMargin, outcome };
}
