// Tuning for a ball-in-hand carry: collision/evasion outcomes, line-break and
// dominant-carry margins, hard-carry probability by attacking style, and the
// knock-on threshold gate (which only matters during a carry).

export const HARD_CARRY_THRESHOLDS = {
  keep_it_tight: 90,
  balanced:      70,
  wide_wide:     50,
} as const;

export const HANDLING_GATE = {
  baseThreshold:   85,
  clockInRedScale: 0.4,
  maxThreshold:    99,
} as const;

export function knockOnThreshold(handling: number, clockInTheRed: boolean): number {
  const g = HANDLING_GATE;
  return clockInTheRed
    ? Math.min(g.maxThreshold, g.baseThreshold + Math.round(Math.max(0, g.baseThreshold - handling) * g.clockInRedScale))
    : g.baseThreshold;
}

// Tactics-weighted lateral spread when a carry crosses the try line.
// Half-spread is symmetric around the midline (y=50); larger values mean
// tries scatter further toward the corner flags. Wider-playing teams put
// runners into wider channels, so their tries are more often out wide.
export const TRY_LANDING_HALF_SPREAD = {
  keep_it_tight: 12,
  balanced:      25,
  wide_wide:     45,
} as const;

// Lateral bands (|y - 50|) used for the post-try commentary line. Drives
// only the narration; conversion difficulty reads ball.y directly through
// CONVERSION_VALUES.distanceFromPostsWeight in ConversionKickEvent.
export const TRY_LOCATION_BANDS = {
  central: 7,
  close:   17,
  wide:    32,
  // else → corner
} as const;

export const OPEN_PLAY_VALUES = {
  agilityWeight:     0.5,
  positioningWeight: 0.5,
  paceWeight:        0.5,
  lineBreakMargin: 15,
  lineBreakMetres: [10, 25],
  dominantCarryMargin:  5,
  dominantCarryMetres:  [3, 8],
  dominantTackleMargin: -5,
  dominantTackleMetres: [-2, 1],
  playOnMetres: [1, 4],
  attackerStrengthWeight: 0.5,
  attackerPaceWeight:     0.5,
  defenderTacklingWeight: 0.5,
  defenderStrengthWeight: 0.5,
} as const;
