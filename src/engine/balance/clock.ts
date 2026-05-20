// Match clock advance formula and the half/full-time minute markers.
//
// The advance formula is `baseAdvance + rng(rngMin, rngMax) / rngDivisor` →
// 0.2 + 0..0.8 = 0.2 to 1.0 in 0.1 steps. Kept split out (not collapsed to
// `rng(2, 10) / 10`) because IEEE-754 makes `0.2 + 0.1 !== 0.3`, and changing
// the formula shape would alter accumulated game-minute trajectories.

export const CLOCK_VALUES = {
  baseAdvance: 0.2,
  rngMin: 0,
  rngMax: 8,
  rngDivisor: 10,
  halfTimeMinute: 40,
  fullTimeMinute: 80,
} as const;
