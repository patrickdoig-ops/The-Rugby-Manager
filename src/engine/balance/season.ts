// Season-scope tuning constants. Used by the game engine
// (src/game/) for fixture/calendar/league-points logic.

export const SEASON_VALUES = {
  startDate: '2025-09-13',   // typical Premiership opening weekend
  seasonLabel: '2025/26 Season',
  weekLengthDays: 7,
} as const;

export const LEAGUE_POINTS = {
  win: 4,
  draw: 2,
  loss: 0,
  losingBonusThreshold: 7,  // margin ≤ 7 → losing bonus
  losingBonusPoints: 1,
} as const;
