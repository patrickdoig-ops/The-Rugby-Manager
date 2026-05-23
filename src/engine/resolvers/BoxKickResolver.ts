import type { Player } from '../../types/player';
import type { ClearanceStyle } from '../../types/engine';
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
    }
  | {
      quality: 'touch_finder';
      kickScore: number;
      distance: number;
      outcome: 'goes_to_touch';
    };

// `style` is the KickDecisionDirector's clearance sub-choice when family
// is 'clearance' — otherwise undefined and the regular contestable path
// applies. long_and_off biases toward a touch-finding outcome; long_and_on
// stays contestable (existing behaviour). Touch-finding success scales
// with the scrum-half's kicking stat: a weak kicker can still miss the
// touchline and bring back the contestable path.
export function resolveBoxKick(
  scrumHalf: Player,
  winger: Player,
  fullback: Player,
  fullbackMod = 0,
  style?: ClearanceStyle,
): BoxKickResolution {
  const V = BOX_KICK_VALUES;
  const kickScore = scrumHalf.currentStats.kicking + rng(1, 20);

  if (style === 'long_and_off') {
    // Touch-finder attempt. Success scales with kicker accuracy. A
    // botched touch-finder falls through to the standard contestable
    // path (defending team catches uncontested or contests in air).
    const touchPct = Math.max(20, Math.min(85, scrumHalf.currentStats.kicking - 10));
    if (rng(1, 100) <= touchPct) {
      return { quality: 'touch_finder', kickScore, distance: V.veryGoodKickDistance, outcome: 'goes_to_touch' };
    }
    // Fall through to contestable path below.
  }

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
