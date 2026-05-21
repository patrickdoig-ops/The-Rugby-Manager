// Home advantage. A flat per-match tilt toward whichever side has the
// `homeTeam` slot in `MatchState`. Today the engine consumes it through
// two channels — open-play carries and the breakdown — picked because
// they sit on the hot path of every tick and have natural attackMod /
// defendMod plumbing. The same `spreadPts` headline is read by the
// pre-match SPREAD tile so the prediction and the simulation agree.
//
// Calibration target: ~57% home win-rate across the full double round-
// robin (`npm run telemetry`), matching real-rugby Premiership history.

export const HOME_ADVANTAGE = {
  // Headline figure surfaced by the pre-match SPREAD tile. Also the
  // calibration target validated via telemetry.
  spreadPts: 3,

  // Per-channel modifiers. Same units as attackMod / defendMod elsewhere
  // (~1 unit ≈ 1 point of effective rating in resolver-margin terms).
  carryMod:     2,  // FirstPhase / PhasePlay / KickReturn → resolveOpenPlay
  breakdownMod: 1,  // BreakdownEvent → resolveBreakdown
} as const;
