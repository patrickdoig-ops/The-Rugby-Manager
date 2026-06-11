// Board-confidence tuning. The career fail-state spine: a persistent 0–100
// owner-confidence meter that drains on poor results and an end-of-season
// objective miss, and ends in a final warning then a sacking. All numbers
// here are starting points to tune against `npm run telemetry`.
//
// Logic that consumes these lives in src/game/board.ts; the confidence value
// is fully deterministic from results (no RNG), so `npm run verify` is
// unaffected.

import type { BoardAmbition } from '../../types/teamData';

// Confidence the board starts each season with. Year 1 uses the ambition
// baseline; subsequent seasons map the prior finish (via evaluateObjective)
// onto a seed — a defending champion starts trusted, a club that finished
// below its ambition starts on the back foot.
export const BOARD_SEED: {
  year1: Record<BoardAmbition, number>;
  champion: number;
  exceeded: number;
  met: number;
  missed: number;
} = {
  year1:    { title: 58, playoffs: 55, topHalf: 55 },
  champion: 72,
  exceeded: 65,
  met:      60,
  missed:   45,
};

// Per-result confidence delta, keyed on whether the manager's side was the
// pre-match favourite (the existing `expectedToWin` flag). Beating the odds
// is rewarded more than winning as favourite; losing as favourite is punished
// hardest.
export const BOARD_RESULT_DELTA = {
  winFavourite:   3,
  winUnderdog:    6,
  drawFavourite: -2,
  drawUnderdog:   2,
  lossFavourite: -6,
  lossUnderdog:  -3,
  // Extra penalty applied on the third consecutive league loss.
  losingStreakPenalty: -5,
} as const;

// End-of-season objective swing, applied once at season end before rollover.
export const BOARD_EOS_SWING: { exceeded: number; met: number; missed: number } = {
  exceeded:  25,
  met:       10,
  missed:   -25,
};

// Fail-state thresholds. A mid-season sack requires a prior warning, so the
// final warning always precedes the sacking.
export const BOARD_THRESHOLDS = {
  warning:  25,  // at/below → issue the final warning (once per season)
  sack:     10,  // at/below, with warning already issued → mid-season sack
  eosSack:  20,  // at/below after the end-of-season swing → sack at season end
} as const;

// Confidence bands for the Hub pill. Each entry is the lower bound (inclusive)
// of the band; checked high → low.
export const BOARD_BANDS: { min: number; key: 'secure' | 'stable' | 'shaky' | 'critical'; label: string }[] = [
  { min: 66, key: 'secure',   label: 'Secure' },
  { min: 41, key: 'stable',   label: 'Stable' },
  { min: 26, key: 'shaky',    label: 'Under pressure' },
  { min: 0,  key: 'critical', label: 'At risk' },
];

// Immediate board-confidence delta on European elimination, keyed by how
// the achieved stage compares to the board's europeanObjective
// (BoardCoordinator.applyEuropeanElimination).
export const BOARD_EURO_ELIMINATION_DELTA = {
  metOrExceeded: 3,    // achieved >= objective
  oneStageShort: -5,   // achieved == objective - 1
  furtherShort:  -10,  // achieved <= objective - 2
};
