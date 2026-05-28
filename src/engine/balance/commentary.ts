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
// the multi-step feed reveal drain. Both expressed as fractions of the live
// tickDelayMs so the whole feed scales coherently with the speed slider.
export const COMMENTARY_PACING = {
  // Floor on the gap between two beats, as a fraction of tickDelayMs. Caps how
  // tightly a burst (multi-event tick) can compress — beyond this floor the
  // overflow carries forward into the next tick's idle window instead of
  // firing several lines in one visual burst. The presenter targets
  // tickDelayMs / bufferDepth per beat, clamped to [floor, tickDelayMs].
  minGapFraction: 1 / 3,
  // Gap between narration steps within a single multi-step event (try
  // build-up, TMO, direct cards), as a fraction of tickDelayMs. Replaces the
  // old fixed 500ms so step reveals track the sim speed like beats do
  // (0.2 × the 2500ms default ≈ the historical 500ms feel at 1×).
  stepGapFraction: 0.2,
} as const;
