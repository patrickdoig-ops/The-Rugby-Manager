// Trigger probabilities for tactic-coloured commentary notes. Each entry is a
// percentage chance that a phase outcome will produce the associated tactic
// note in the commentary feed. Lives in the commentary RNG stream, so adjusting
// these values cannot shift in-play outcomes.

export const COMMENTARY_CHANCES = {
  breakdownPickAndDriveClean:   30,
  breakdownShadowClean:         30,
  breakdownJackalClean:         25,
  breakdownWidePlaySlow:        30,
  breakdownCounterRuckSlow:     30,
  breakdownJackalTurnover:      35,
  breakdownCounterRuckTurnover: 30,
  breakdownWidePlayTurnover:    25,
  breakdownPickAndDrivePenalty: 25,
  breakdownWidePlayPenalty:     25,
  breakdownJackalPenalty:       25,
  lineBreakBackfieldThin:       30,
  boxKickBackfieldCaught:       30,
  tacticalKickFiftyTwentyTwo:   25,
  tacticalKickCaughtReturn:     35,
  blitzDominantTackle:          25,
  driftShepherdToTouch:         20,
  blitzLineBreakPunished:       35,
  blitzPressureKnockOn:         40,
  blitzInterception:            45,
} as const;

// Soft cap on the in-state commentary buffer (state.events). Older entries
// are spliced off the front when the buffer overflows.
export const COMMENTARY_BUFFER_CAP = 300;

// Presenter pacing — how the commentary beat buffer (CommentaryStreamer) and
// the multi-step feed reveal drain. Expressed as fractions of the live
// tickDelayMs so the whole feed scales coherently with the speed slider.
export const COMMENTARY_PACING = {
  // Wall-clock gap between two beats, as a fraction of tickDelayMs. With the
  // producer running ahead (step 4), the presenter drains at this steady rate
  // independent of how bursty production was. Calibrated against the measured
  // ~1.63 beats/tick so total match wall-time stays ≈ the pre-step-4 duration
  // (tickDelayMs × beats/tick per tick ≈ tickDelayMs × beatGapFraction per
  // beat): 0.6 ≈ 1 / 1.63. Lower = snappier feed (and shorter match), higher
  // = slower.
  beatGapFraction: 0.6,
  // How many beats the producer may run ahead of the presenter. A small
  // cushion that lets the presenter drain at the steady beatGap even though
  // production is bursty; the producer tops it up between human-decision
  // boundaries (where the buffer is drained to present before the prompt).
  // The presentation lag is lookaheadBeats × beatGap. MUST be > 0 — at 0 the
  // producer would never produce.
  lookaheadBeats: 4,
  // Gap between narration steps within a single multi-step event (try
  // build-up, TMO, direct cards), as a fraction of tickDelayMs. Replaces the
  // old fixed 500ms so step reveals track the sim speed like beats do
  // (0.2 × the 2500ms default ≈ the historical 500ms feel at 1×).
  stepGapFraction: 0.2,
} as const;
