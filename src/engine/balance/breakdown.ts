// Tuning for the post-tackle breakdown contest: clean/slow/turnover/penalty
// margins, body-position weights, and jackal-specific overrides.

export const BREAKDOWN_VALUES = {
  leadWeight:       0.6,
  supportWeight:    0.4,
  disciplineWeight: 0.15,
  // Pivot used as `(p.discipline - disciplinePivot) * disciplineWeight` so a
  // discipline of 50 is neutral and values above/below add or subtract score.
  disciplinePivot:  50,
  bodyWeights:      [1.0, 0.5, 0.25, 0.2],
  bodyWeightFallback: 0.3,
  cleanBallMargin:  10,
  slowBallMargin:   -8,
  turnoverMargin:   -14,
  counterRuckTop:   4,
  // Flat dampener subtracted from the counter-ruck turnover score (dts) in
  // BreakdownResolver. The controlled mirror experiment
  // (scripts/tacticsExperiment.ts) showed counter_ruck at +11.5 margin —
  // by far the most dominant tactic — because stacking the top-4 forwards'
  // strength into dts wins turnovers + forces penalties with no offsetting
  // cost. Dropping a whole body (counterRuckTop 4 → 3) overshot to −4.3,
  // so this continuous −7 dampener tunes it back toward a small positive
  // reward (~+1 margin) befitting a high-commitment defensive choice.
  counterRuckDtsMod: -7,
  jackalLeadWeight: 0.7,
  jackalSupportWeight: 0.3,
  // First-to-the-breakdown arrival edge. The fastest loose forward (back row)
  // on EACH side races to the ball; each side adds (fastestBackRowPace −
  // paceArrivalPivot) × paceArrivalWeight to its score (attack → ARS, the
  // contesting defender → DTS). Measured symmetrically (same pool: back row,
  // same aggregation: max) so the NET margin effect is the pure pack-pace
  // differential — a faster pack reaches the ball first and secures it (or
  // jackals it) — rather than an artefact of which random supporters were
  // committed. Shadow defenders retreat into the line and don't contest, so
  // they get no arrival term. A 15-pt pace edge ≈ 4.5 margin points against
  // the +10 / −14 outcome thresholds.
  paceArrivalWeight: 0.3,
  paceArrivalPivot:  50,
  // Flat edge added to ARS — the ball-carrying team's inherent advantage
  // securing its OWN ruck (it arrives organised, the defence is recovering).
  // Also the calibration knob for the league penalty rate against the current
  // ruck-score scale: it shifts the whole margin distribution up, pulling BOTH
  // holding-on penalties and breakdown turnovers down together (vs lowering the
  // turnover margin, which would just convert penalties into an unrealistic
  // turnover glut). Tuned to land holding-on ≈ 10% of attacking breakdowns.
  // Raised 9→11 with the WP6 FirstPhase spatialisation: first-phase strikes now feed
  // the spatial breakdown too (the World persists FirstPhase → Breakdown), adding
  // more set-defence breakdowns where the just-tackled strike carrier is isolated,
  // which pushed holding-on penalties up. The higher retention bonus pulls both those
  // penalties AND the paired turnovers back down together, restoring the § 13 bands.
  ruckRetentionBonus: 11,
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
  // Trimmed 4→2.6 with the WP6 FirstPhase spatialisation. Spatial first-phase
  // strikes added more set-defence breakdowns (and so more holding-on penalties);
  // ruckRetentionBonus above pulls those down but is capped by the turnover floor.
  // not_rolling_away is a flat defender penalty (least coupled to possession / points
  // — usually played as advantage with the ball retained), so trimming it absorbs the
  // rest of the penalty increase without disturbing the turnover / points / tries
  // floors the breakdown-contest knob would.
  notRollingAwayBasePct:    2.6,
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
//     front foot. The current breakdown ALSO receives the dominantCarry
//     bonus (+6) so the carrier isn't left too exposed, preventing too
//     many penalties or turnovers immediately after a line break.
// These are OUTCOME-driven, not tactic-driven — kept out of
// TACTIC_MODIFIERS so the file there stays a pure tactic lookup. Tuned
// so a midfield line break that doesn't directly score on the first
// carry still very often turns into a try over the next 1-2 phases.
export const CARRY_HANDOFF_BONUSES = {
  dominantCarry:    6,    // applied to the breakdown attackScore only
  lineBreak:       15,    // applied to the next-phase attackMod only
} as const;
