// Tuning for the post-tackle breakdown contest: clean/slow/turnover/penalty
// margins, body-position weights, and jackal-specific overrides.

export const BREAKDOWN_VALUES = {
  leadWeight:       0.6,
  supportWeight:    0.4,
  disciplineWeight: 0.15,
  bodyWeights:      [1.0, 0.6, 0.4, 0.3],
  bodyWeightFallback: 0.3,
  cleanBallMargin:  10,
  slowBallMargin:   -8,
  turnoverMargin:   -14,
  counterRuckTop:   4,
  jackalLeadWeight: 0.7,
  jackalSupportWeight: 0.3,
} as const;
