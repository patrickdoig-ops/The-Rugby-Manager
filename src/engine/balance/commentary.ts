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
  occasionErrorPressure:        25,
  occasionRisingToOccasion:     25,
  occasionClockInRed:           40,
  // Lateral-play flavour (per-phase sweep) — modest so the feed stays outcome-led.
  switchToOpenSide:             18,
  workedBackBlind:              25,
  pinnedOnTouchline:            20,
} as const;

// Context thresholds for the try_aftermath crowd reaction. Used by
// TryScoredEvent to classify a try into the blowout / late-drama buckets that
// getAnnouncementTemplate picks its pool from. Render-time only — they shape
// flavour text, never an in-play outcome.
export const TRY_AFTERMATH_CONTEXT = {
  // Absolute post-try scoreline margin at or beyond which the result is
  // beyond doubt: the crowd reaction is muted regardless of which side scored.
  blowoutMargin: 22,
  // Game minute at or beyond which a swing try in a close game counts as
  // "late drama" — the peak-noise crowd reaction.
  lateGameMinute: 70,
  // Absolute post-try margin at or within which a late try is still in the
  // balance (a close game). Beyond it a late try isn't drama.
  lateDramaMargin: 8,
} as const;

// Soft cap on the in-state commentary buffer (state.events). Older entries
// are spliced off the front when the buffer overflows.
export const COMMENTARY_BUFFER_CAP = 300;

// Headless in-app AI fixtures (simulateFixture) never read state.events — the
// season-stats snapshot pulls from state.stats, not the commentary log. Only
// the carry→try / carry→breakdown handlers read events[length-1], so any cap
// ≥ 1 is behaviour-identical. 16 keeps a small scrollback for crash diagnostics
// (reportTickCrash slices the last 5) while reducing the per-event splice from
// a 300-ref shift to a 16-ref shift across ~6,500 events/match.
export const HEADLESS_COMMENTARY_BUFFER_CAP = 16;

// Presenter pacing — how the commentary beat buffer (CommentaryStreamer) and
// the multi-step feed reveal drain. Expressed as fractions of the live
// tickDelayMs so the whole feed scales coherently with the speed slider.
export const COMMENTARY_PACING = {
  // Wall-clock gap between two narration LINES, as a fraction of tickDelayMs —
  // the single dial that sets the visible cadence. The presenter drains a beat
  // then waits lineGap × (steps in that beat) before the next, and the feed's
  // multi-step reveal staggers at the same lineGap, so a quiet single-line beat
  // and the five lines of a try sequence read out at ONE steady line rhythm
  // rather than the old trickle-then-burst (where beats were paced but a beat
  // was sometimes 1 line and sometimes 5). Calibrated so a beat still spans
  // ≈ the old 0.6-tick window on average: 0.46 ≈ 0.6 / 1.30 (measured
  // ~1.30 steps/beat), keeping total match wall-time ≈ the pre-decoupling
  // duration. Lower = snappier feed (and shorter match), higher = slower.
  lineGapFraction: 0.46,
  // How many beats the producer may run ahead of the presenter. A small
  // cushion that lets the presenter drain at the steady cadence even though
  // production is bursty; the producer tops it up between human-decision
  // boundaries (where the buffer is drained to present before the prompt).
  // A beat drains in ≈ lineGap × avg-steps ≈ beatGap, so the presentation lag
  // is ≈ lookaheadBeats × beatGap. MUST be > 0 — at 0 the producer would never
  // produce.
  lookaheadBeats: 4,
  // Reference "typical beat drain time" as a fraction of tickDelayMs, used as
  // the producer's run-ahead poll interval and the look-ahead lag unit. NOT
  // the line cadence (that's lineGapFraction) — it's the coarse buffering
  // heuristic: ≈ lineGapFraction × the measured ~1.30 steps/beat.
  beatGapFraction: 0.6,
} as const;

// The visible per-line cadence in ms for a given tick delay — the single dial the
// commentary feed, the presenter, and the pitch ball-walk all pace off, so they
// stay in lockstep. Rounded for the UI consumers (CommentaryFeed, PitchView);
// CommentaryStreamer uses the raw fraction directly for sub-ms beat precision.
export function lineGapMs(delayMs: number): number {
  return Math.round(delayMs * COMMENTARY_PACING.lineGapFraction);
}
