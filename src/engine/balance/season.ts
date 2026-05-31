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

// Permanent geographical rivalry pairs used by generateFixtures to concentrate
// all derbies into two dedicated rounds per season.
// Order within each pair is the canonical direction for even-numbered seasons;
// generateFixtures randomises per-pair per season via rngTransfer.
export const RIVALRY_PAIRS: [string, string][] = [
  ['bath',        'gloucester'  ], // West Country
  ['bristol',     'exeter'      ], // West Country
  ['leicester',   'northampton' ], // East Midlands
  ['harlequins',  'saracens'    ], // London
  ['sale',        'newcastle'   ], // Northern
];

// Round positions for the two derby rounds.
// FIRST  = Derby Weekend (early season).
// SECOND = Big Match Weekend — strict home/away rematch of FIRST.
export const DERBY_ROUND_POSITIONS = { first: 3, second: 12 } as const;

// Named round labels for the 2025-26 Gallagher Premiership season.
// Displayed in the fixture list and Hub next-match header.
// Rounds 15-18 all carry "The Run In" — the post-Six Nations playoff sprint.
export const ROUND_LABELS: Record<number, string> = {
  3:  'Derby Weekend',
  8:  'Christmas Fixtures',
  12: 'Big Match Weekend',
  15: 'The Run In',
  16: 'The Run In',
  17: 'The Run In',
  18: 'The Run In',
};

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
