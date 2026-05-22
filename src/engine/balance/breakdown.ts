// Tuning for the post-tackle breakdown contest: clean/slow/turnover/penalty
// margins, body-position weights, and jackal-specific overrides.

export const BREAKDOWN_VALUES = {
  leadWeight:       0.6,
  supportWeight:    0.4,
  disciplineWeight: 0.15,
  // Pivot used as `(p.discipline - disciplinePivot) * disciplineWeight` so a
  // discipline of 50 is neutral and values above/below add or subtract score.
  disciplinePivot:  50,
  bodyWeights:      [1.0, 0.6, 0.4, 0.3],
  bodyWeightFallback: 0.3,
  cleanBallMargin:  10,
  slowBallMargin:   -8,
  turnoverMargin:   -14,
  counterRuckTop:   4,
  jackalLeadWeight: 0.7,
  jackalSupportWeight: 0.3,
} as const;

// Base trigger rates for the breakdown-fired penalty offences added alongside
// the original 4-way result. Pct per breakdown event, consumed via rng(1,100)
// in a fixed order inside handleBreakdown:
//   1. dangerous_cleanout (attacker, TMO-eligible)
//   2. not_rolling_away   (defender)
//   3. resolveBreakdown   (existing clean / slow / turnover / penalty_defending)
//   4. offside_at_ruck    (defender, fires only on clean_ball or slow_ball)
// Calibrated for ~38 breakdowns/match → ~4.1 combined new pens/match, aiming
// for a league total around 14/match (vs ~9.4 pre-additions). Each rate is
// then shifted by the matching TACTIC_MODIFIERS row (see balance/tactics.ts).
export const BREAKDOWN_PENALTIES = {
  dangerousCleanoutBasePct: 1.5,
  notRollingAwayBasePct:    4,
  offsideAtRuckBasePct:     8,
} as const;
