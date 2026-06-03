// Tuning constants for the staff-hiring system (1.2).

// Max hired staff of each singleton role; scouts can stack up to STAFF_CAPS.scouts.
export const STAFF_CAPS = {
  assistant: 1,
  fitness:   1,
  scouts:    3,
} as const;

// Candidates in the hire pool per role generated at each season rollover.
export const STAFF_POOL_SIZES = {
  assistant: 4,
  fitness:   4,
  scout:     8,
} as const;

// Rating band for generated staff (uniform, drawn from rngTransfer).
export const STAFF_RATING_BAND = { min: 40, max: 90 } as const;

// Annual wage: linearly interpolated between anchors (same pattern as WAGE_BY_RATING).
export const STAFF_WAGES_BY_RATING: readonly { rating: number; annualWage: number }[] = [
  { rating: 40, annualWage:  60_000 },
  { rating: 60, annualWage: 120_000 },
  { rating: 75, annualWage: 220_000 },
  { rating: 90, annualWage: 380_000 },
] as const;

// Fitness staff → training multiplier applied to conditionDelta + statDeltas.
// multiplier(rating) = FITNESS_MULT_BASE + rating * FITNESS_MULT_PER_POINT
// e.g. rating 75 → 0.55 + 75*0.006 = 1.00 (neutral at ~75; above lifts, below reduces)
// No fitness staff hired → multiplier = 1.0 (baseline unchanged).
export const FITNESS_MULT_BASE      = 0.55;
export const FITNESS_MULT_PER_POINT = 0.006;

// Injury chance reduction from fitness staff: flat fraction subtracted from
// the per-week injuryChance roll.
// reduction(rating) = rating * FITNESS_INJURY_REDUCTION_PER_POINT
// e.g. rating 75 → 75 * 0.003 = 0.225 pp reduction.
export const FITNESS_INJURY_REDUCTION_PER_POINT = 0.003;

// Assistant staff → noise on AI suggestion quality.
// Sub-optimal probability = ASSISTANT_NOISE_MAX * (1 − rating/100).
// e.g. rating 50 → 0.4 * 0.5 = 20% chance of a weaker suggestion.
export const ASSISTANT_NOISE_MAX = 0.4;

// Scout staff → accuracy gain per week (feeds into scouting.ts, Phase 1.1).
// gain(rating) = SCOUT_ACCURACY_BASE + rating * SCOUT_ACCURACY_PER_POINT  (pp/week)
export const SCOUT_ACCURACY_BASE      = 2;
export const SCOUT_ACCURACY_PER_POINT = 0.1;
