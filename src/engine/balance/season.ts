// Season-scope tuning constants. Used by the game engine
// (src/game/) for calendar/league-points logic. The seasonLabel and
// per-round dates now live in the SeasonSchedule data (default:
// src/data/fixtures-2025-26.ts); startDate is retained for pre-game
// UI (TeamInfoScreen) that needs a sensible "as-of" date when no
// season has been initialised, and as a fallback for emptyState().

export const SEASON_VALUES = {
  startDate: '2025-09-25',   // PREMIERSHIP_2025_26 opening day (Sale v Gloucester)
  weekLengthDays: 7,
} as const;

export const LEAGUE_POINTS = {
  win: 4,
  draw: 2,
  loss: 0,
  losingBonusThreshold: 7,  // margin ≤ 7 → losing bonus
  losingBonusPoints: 1,
} as const;
