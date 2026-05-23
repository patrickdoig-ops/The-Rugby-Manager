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

// Carry → breakdown handoff bonuses. Applied in BreakdownEvent by reading
// the previous CARRY_RESOLVED's outcome. Two parallel channels (NOT
// applied together — a line break uses the next-phase channel only, a
// dominant carry uses the current-breakdown channel only):
//   * dominant_carry → shift the current breakdown's attackScore upward
//     (cleaner immediate ball);
//   * line_break → shift the post-breakdown attackMod
//     (state.breakdownMod.attack) so the very next carry runs on the
//     front foot. The current breakdown is left to resolve on its own
//     merits — the line break has already produced its successful
//     carry, and applying the bonus here too was a double-dip that
//     converted slow_ball → clean_ball and quietly killed box kicks
//     (v2.62a → v2.80a fix).
// These are OUTCOME-driven, not tactic-driven — kept out of
// TACTIC_MODIFIERS so the file there stays a pure tactic lookup. Tuned
// so a midfield line break that doesn't directly score on the first
// carry still very often turns into a try over the next 1-2 phases.
export const CARRY_HANDOFF_BONUSES = {
  dominantCarry:    6,    // applied to the breakdown attackScore only
  lineBreak:       15,    // applied to the next-phase attackMod only
} as const;
