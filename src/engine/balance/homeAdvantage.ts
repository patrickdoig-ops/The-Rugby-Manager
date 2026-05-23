// Home advantage. A flat per-match tilt toward whichever side has the
// `homeTeam` slot in `MatchState`. The engine consumes it through two
// channels — open-play carries and the breakdown — picked because they
// sit on the hot path of every tick and have natural attackMod /
// defendMod plumbing. The same `spreadPts` headline is read by the
// pre-match SPREAD tile so the prediction and the simulation agree.
//
// Calibration target: ~57% home win-rate across the full double round-
// robin (`npm run telemetry`), matching real-rugby Premiership history.
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
} as const;
