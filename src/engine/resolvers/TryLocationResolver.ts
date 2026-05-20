// Where on the try line a try lands (laterally). Driven by the attacker's
// authored attackingStyle: tighter teams score nearer the posts, wide-wide
// teams scatter their tries further out toward the corner flags. Returned
// y is what ConversionKickEvent reads through state.ball.y when it grades
// the conversion's difficulty, so the same number drives both the
// commentary band and the kicker's degree of difficulty.

import type { AttackingStyle } from '../../types/team';
import { rng } from '../../utils/rng';
import { TRY_LANDING_HALF_SPREAD, TRY_LOCATION_BANDS } from '../balance';

export type TryLocationBand = 'central' | 'close' | 'wide' | 'corner';

export function tryLandingY(style: AttackingStyle): number {
  const spread = TRY_LANDING_HALF_SPREAD[style];
  return rng(50 - spread, 50 + spread);
}

export function tryLocationBand(y: number): TryLocationBand {
  const dx = Math.abs(y - 50);
  if (dx <= TRY_LOCATION_BANDS.central) return 'central';
  if (dx <= TRY_LOCATION_BANDS.close)   return 'close';
  if (dx <= TRY_LOCATION_BANDS.wide)    return 'wide';
  return 'corner';
}
