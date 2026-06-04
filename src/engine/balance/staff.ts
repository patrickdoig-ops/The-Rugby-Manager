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

// Fitness staff → multiplier on conditionDelta and developmentChance.
// No staff hired → multiplier = 1.0 (no change).
// multiplier(rating) = 1.0 + rating × FITNESS_MULT_PER_POINT
//   rating 40 → ×1.08   rating 75 → ×1.15   rating 90 → ×1.18
export const FITNESS_MULT_PER_POINT = 0.002;

// Fitness staff → fractional reduction applied to injuryRisk before the
// condition-risk multiplier.
// reduction(rating) = rating × FITNESS_INJURY_REDUCTION_PER_POINT
//   rating 40 → −12 %   rating 75 → −22.5 %   rating 90 → −27 %
export const FITNESS_INJURY_REDUCTION_PER_POINT = 0.003;

// Assistant staff → noise on AI suggestion quality.
// Sub-optimal probability = ASSISTANT_NOISE_MAX × (1 − rating/100).
// e.g. rating 50 → 0.4 × 0.5 = 20 % chance of a weaker suggestion.
export const ASSISTANT_NOISE_MAX = 0.4;

// Scout staff → accuracy gain per week (feeds into scouting.ts, Phase 1.1).
// gain(rating) = SCOUT_ACCURACY_BASE + rating × SCOUT_ACCURACY_PER_POINT  (pp/week)
//   rating 40 → 18 pp/week (~6 weeks to 100%)
//   rating 75 → 28.5 pp/week (~4 weeks to 100%)
//   rating 90 → 33 pp/week (~3 weeks to 100%)
export const SCOUT_ACCURACY_BASE      = 6;
export const SCOUT_ACCURACY_PER_POINT = 0.3;

// Staff budget is separate from the player salary cap.
// Seeded at 4.5% of each club's player salary budget:
//   Newcastle (£4.15m) → £186k  — barely enough for two rating-50 Good hires (£90k each)
//   Bath      (£7.75m) → £349k  — can reach two Excellent or one World-Class entry, but
//                                   cannot fill multiple roles with top-end staff
// No club can assemble a full world-class backroom (5 roles × £273k = £1.37m) in year one.
export const STAFF_BUDGET_FRACTION = 0.045;
