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
