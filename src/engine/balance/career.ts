// Multi-season career tuning constants. Drives `developStats` (per-stat
// age curve applied at each rollover) and `shouldRetire` (probabilistic
// retirement curve indexed by age + position class). All numbers are
// v1 baselines — tune via career-determinism telemetry once we have it.

import type { PlayerStats } from '../../types/player';

// Per-stat age trajectory. Stat increases each year up to `peakAge`,
// declines thereafter. `growthPerYear` and `declinePerYear` are pre-noise
// expected deltas; `STAT_NOISE` adds per-player jitter.
//
// Calibration:
//   Physical stats (pace, agility) peak early (~25) and fall faster.
//   Composite/cerebral stats (composure, positioning, discipline) hold
//   longer (peak 32–33) and decline slowly. Set-piece and kicking sit in
//   the middle — they need physical baseline but reward experience.
export const AGE_CURVES: Record<keyof PlayerStats,
  { peakAge: number; growthPerYear: number; declinePerYear: number }> = {
  pace:        { peakAge: 25, growthPerYear: 1.5, declinePerYear: 1.2 },
  agility:     { peakAge: 26, growthPerYear: 1.4, declinePerYear: 1.0 },
  stamina:     { peakAge: 27, growthPerYear: 1.2, declinePerYear: 0.8 },
  strength:    { peakAge: 28, growthPerYear: 1.0, declinePerYear: 0.7 },
  tackling:    { peakAge: 29, growthPerYear: 0.8, declinePerYear: 0.5 },
  breakdown:   { peakAge: 29, growthPerYear: 0.8, declinePerYear: 0.5 },
  handling:    { peakAge: 30, growthPerYear: 0.7, declinePerYear: 0.4 },
  setPiece:    { peakAge: 30, growthPerYear: 0.7, declinePerYear: 0.4 },
  discipline:  { peakAge: 32, growthPerYear: 0.5, declinePerYear: 0.3 },
  positioning: { peakAge: 32, growthPerYear: 0.5, declinePerYear: 0.3 },
  kicking:     { peakAge: 31, growthPerYear: 0.6, declinePerYear: 0.3 },
  composure:   { peakAge: 33, growthPerYear: 0.4, declinePerYear: 0.2 },
};

// Standard deviation + clamp for the Gaussian noise added to each
// per-stat delta. Drives some players developing better/worse than the
// pure curve would predict.
export const STAT_NOISE = { stddev: 0.5, clamp: 1.5 };

// Probability of retiring at the END of the season the player is
// currently playing (i.e. evaluated against the age the player will be
// when the new season begins). Cumulative probabilities — the last
// matching age applies. Below the lowest age in the table, retirement
// probability is 0.
//
// Position-class split: forwards last about a year longer than backs at
// peak, but tail-off accelerates similarly. Loose v1 baseline; refine
// once a multi-season telemetry pass exists.
export const RETIREMENT_CURVE = {
  forwards: [
    { age: 32, prob: 0.05 }, { age: 33, prob: 0.10 }, { age: 34, prob: 0.20 },
    { age: 35, prob: 0.35 }, { age: 36, prob: 0.55 }, { age: 37, prob: 0.80 },
    { age: 38, prob: 1.00 },
  ],
  backs: [
    { age: 31, prob: 0.05 }, { age: 32, prob: 0.12 }, { age: 33, prob: 0.25 },
    { age: 34, prob: 0.40 }, { age: 35, prob: 0.60 }, { age: 36, prob: 0.85 },
    { age: 37, prob: 1.00 },
  ],
};

// Minimum appearances for season MVP eligibility — guards against an
// occasional 10-minute sub posting a 9.0 rating from a single play.
export const SEASON_AWARDS = { mvpMinAppearances: 5 };
