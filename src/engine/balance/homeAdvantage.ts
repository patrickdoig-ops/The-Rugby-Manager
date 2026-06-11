// Home advantage. A flat per-match tilt toward whichever side has the
// `homeTeam` slot in `MatchState`. The engine consumes it through two
// channels — open-play carries and the breakdown — picked because they
// sit on the hot path of every tick and have natural attackMod /
// defendMod plumbing. The same `spreadPts` headline is read by the
// pre-match SPREAD tile so the prediction and the simulation agree.
//
// Calibration target: ~57% home win-rate across the full double round-
// robin (`npm run telemetry`), matching real-rugby league history.
//
// Values are notably bigger than the pre-v2.48a 2/1 because the
// PenaltyHandler silent-mode bug was inflating home wins by ~11 pp on
// its own (humanSide defaults to 'home' in silent fixtures, and only
// the human-side branch auto-kicked at goal); with that fixed, the
// remaining home edge has to come from these constants alone.

export const HOME_ADVANTAGE = {
  // Headline figure surfaced by the pre-match SPREAD tile. Also the
  // calibration target validated via telemetry.
  spreadPts: 6,

  // Per-channel modifiers. Same units as attackMod / defendMod elsewhere
  // (~1 unit ≈ 1 point of effective rating in resolver-margin terms).
  carryMod:     2,  // FirstPhase / PhasePlay / KickReturn → resolveOpenPlay
  breakdownMod: 3,  // BreakdownEvent → resolveBreakdown

  // Crowd-scale: multiplier applied to carryMod / breakdownMod based on the
  // venue's fill rate. Linear from crowdScaleMin (at crowdFillMin) to
  // crowdScaleMax (at 1.0). Calibrated so scale(crowdFillNeutral) ≈ 1.0 —
  // at the league-average fill rate (~0.79) the base mods are unchanged,
  // preserving the ~57% home win-rate. A sold-out ground lifts the edge by
  // ×1.30; a sparse crowd (55% fill) cuts it to ×0.65.
  crowdFillMin:     0.55, // mirrors ATTENDANCE.minFillRate
  crowdFillNeutral: 0.79, // league-average — default when no standings data
  crowdScaleMin:    0.65,
  crowdScaleMax:    1.30,
} as const;
