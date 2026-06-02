// Where on the try line a try lands (laterally). The runner grounds the ball
// at the position open play had swept to (state.ball.y), plus a style-scaled
// jitter for the angle in to the line — wider styles scatter further toward
// the corner. Returned y is what ConversionKickEvent reads through state.ball.y
// when it grades the conversion's difficulty, so the same number drives both
// the commentary band and the kicker's degree of difficulty. One outcome-stream
// rng() draw, preserving the stream offset across this change.

import type { MatchState } from '../../types/match';
import type { AttackingStyle } from '../../types/team';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { TRY_LANDING_JITTER, TRY_LOCATION_BANDS } from '../balance';

export type TryLocationBand = 'central' | 'close' | 'wide' | 'corner';

export function tryLandingY(state: MatchState, style: AttackingStyle): number {
  const j = TRY_LANDING_JITTER[style];
  return clamp(state.ball.y + rng(-j, j), 0, 100);
}

export function tryLocationBand(y: number): TryLocationBand {
  const dx = Math.abs(y - 50);
  if (dx <= TRY_LOCATION_BANDS.central) return 'central';
  if (dx <= TRY_LOCATION_BANDS.close)   return 'close';
  if (dx <= TRY_LOCATION_BANDS.wide)    return 'wide';
  return 'corner';
}
