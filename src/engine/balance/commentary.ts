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
} as const;

// Soft cap on the in-state commentary buffer (state.events). Older entries
// are spliced off the front when the buffer overflows.
export const COMMENTARY_BUFFER_CAP = 300;
