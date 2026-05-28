// Season-scope tuning constants. Used by the game engine
// (src/game/) for calendar/league-points logic. The seasonLabel and
// per-round dates now live in the SeasonSchedule data (default:
// src/data/fixtures-2025-26.ts); startDate is retained for pre-game
// UI (TeamInfoScreen) that needs a sensible "as-of" date when no
// season has been initialised, and as a fallback for emptyState().

export const SEASON_VALUES = {
  startDate: '2025-09-25',   // PREMIERSHIP_2025_26 opening day (Sale v Gloucester)
  weekLengthDays: 7,
  // Season "open" anchor — used as the "now" date for age, contract, and
  // career-rollover calculations so a 25-year-old at 2025 season open is
  // still 25 throughout the 2025/26 season. Month is 0-indexed (8 = Sept)
  // to match JavaScript Date.
  seasonOpenMonth: 8,
  seasonOpenDay:   1,
  // Months synthetic year-2+ schedule generation should skip when laying
  // out 18 rounds — November (10) is the Autumn Nations window, February
  // (1) is the Six Nations window. 0-indexed.
  internationalWindowMonths: [10, 1] as const,
  internationalSkipDays:     28,
} as const;

export const LEAGUE_POINTS = {
  win: 4,
  draw: 2,
  loss: 0,
  // Gallagher league bonus points:
  //   tryBonus    — scored ≥ 4 tries in the match (regardless of result)
  //   losingBonus — lost by 7 match-points or fewer
  // Both stack: a team that loses by 7 but scores 4 tries gets 2 BP.
  tryBonusThreshold: 4,
  tryBonusPoints: 1,
  losingBonusThreshold: 7,
  losingBonusPoints: 1,
} as const;
