// Pure helpers for Phase 1.1 scouting. Not yet wired to any event flow —
// this is the seam that Phase B imports.
//
// scoutingBand   — converts (trueValue, accuracy) → displayed [lo, hi] band.
//                  Called by render helpers; no RNG, no state mutation.
// scoutWeeklyGain — weekly accuracy-point gain for a single assigned scout.
//                  Called by the SCOUTING_ACCURACY_ADVANCED emitter (Phase B).

import { BAND_CURVE } from '../engine/balance/scouting';
import { SCOUT_ACCURACY_BASE, SCOUT_ACCURACY_PER_POINT } from '../engine/balance/staff';

// Returns the displayed [lo, hi] stat range for a target given the current
// scouting accuracy (0–100). lo === hi === trueValue when accuracy === 100.
// Band edges are clamped to [1, 99] to stay within the attribute invariant.
export function scoutingBand(trueValue: number, accuracy: number): [number, number] {
  const hw = bandHalfWidth(accuracy);
  if (hw === 0) return [trueValue, trueValue];
  return [Math.max(1, trueValue - hw), Math.min(99, trueValue + hw)];
}

// Accuracy points gained per week by a single scout assigned to one target.
// Multiple scouts each advance their own assigned target independently.
//   rating 40 →  6 pp/week
//   rating 75 →  9.5 pp/week
//   rating 90 → 11 pp/week
export function scoutWeeklyGain(rating: number): number {
  return SCOUT_ACCURACY_BASE + rating * SCOUT_ACCURACY_PER_POINT;
}

function bandHalfWidth(accuracy: number): number {
  const k = BAND_CURVE;
  if (accuracy <= k[0].accuracy) return k[0].halfWidth;
  if (accuracy >= k[k.length - 1].accuracy) return 0;
  for (let i = 1; i < k.length; i++) {
    if (accuracy <= k[i].accuracy) {
      const t = (accuracy - k[i - 1].accuracy) / (k[i].accuracy - k[i - 1].accuracy);
      return Math.round(k[i - 1].halfWidth + t * (k[i].halfWidth - k[i - 1].halfWidth));
    }
  }
  return 0;
}
