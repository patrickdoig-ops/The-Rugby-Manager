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
  // Knockout extra time: two further 10-minute periods after a drawn 80
  // minutes. The clock-in-red target for each — ET1 runs 80→90, ET2 90→100.
  extraFirstMinute: 90,
  extraSecondMinute: 100,
} as const;

// Knockout extra time + the kicking-competition fallback. Only consumed when a
// match is built with allowExtraTime (the three knockout orchestrators); league
// fixtures never reach it.
export const EXTRA_TIME = {
  // Golden point (sudden death — the first score in extra time wins, ending it
  // immediately). Off by default: both 10-minute periods are played in full.
  goldenPoint: false,
  // Kicking competition, used only when the score is still level after both
  // extra-time periods. Each side takes `rounds` alternating place-kicks; a
  // `makePct`% success roll per kick on the outcome stream. Sudden-death rounds
  // continue past `rounds` until one side leads after an equal number of kicks.
  kickComp: {
    rounds: 5,
    makePct: 70,
  },
} as const;
