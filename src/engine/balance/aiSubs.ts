// Thresholds for AISubstitutionDirector. The director is pure (no RNG);
// these are the only tunable knobs.
//
// Fatigue threshold sits just above the 50-tier in `FATIGUE_SCALING.tiers`
// (where most stats drop to ~0.55x) so we sub a man out before his
// effectiveness collapses, not after.

export const AI_SUBS_VALUES = {
  // Earliest in-match minute an AI side will sub. Matches real rugby — most
  // benches stay quiet until after half-time.
  earliestSubMinute: 50,
  // A starter at or below this fatiguePct becomes a sub candidate.
  fatigueThreshold: 60,
} as const;
