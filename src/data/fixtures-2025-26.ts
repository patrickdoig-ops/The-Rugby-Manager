// 2025/26 season fixture list.
//
// Authoritative schedule transcribed from docs/prem-fixtures-2025-26.md (the
// user-supplied final list). Every fixture carries its real date so the
// season calendar in applySeasonEvent skips the Autumn Nations break (Nov)
// and the Six Nations break (Feb–mid-Mar) automatically.
//
// Scores are intentionally not encoded — Fixture is the schedule type;
// match outcomes live separately in FixtureResult once simulated/played.
//
// Team IDs match src/data/team-*.json slugs.

import type { SeasonSchedule } from '../types/gameState';

export const PREMIERSHIP_2025_26: SeasonSchedule = {
  seasonLabel: '2025/26 Season',
  fixtures: [
    // Round 1 — 25–28 September 2025
    { round: 1,  date: '2025-09-25', homeId: 'sale',        awayId: 'gloucester'  },
    { round: 1,  date: '2025-09-26', homeId: 'harlequins',  awayId: 'bath'        },
    { round: 1,  date: '2025-09-26', homeId: 'newcastle',   awayId: 'saracens'    },
    { round: 1,  date: '2025-09-28', homeId: 'northampton', awayId: 'exeter'      },
    { round: 1,  date: '2025-09-28', homeId: 'bristol',     awayId: 'leicester'   },

    // Round 2 — 3–5 October 2025
    { round: 2,  date: '2025-10-03', homeId: 'bath',        awayId: 'sale'        },
    { round: 2,  date: '2025-10-04', homeId: 'exeter',      awayId: 'newcastle'   },
    { round: 2,  date: '2025-10-04', homeId: 'leicester',   awayId: 'harlequins'  },
    { round: 2,  date: '2025-10-04', homeId: 'saracens',    awayId: 'bristol'     },
    { round: 2,  date: '2025-10-05', homeId: 'gloucester',  awayId: 'northampton' },

    // Round 3 — 10–12 October 2025 (Derby Weekend)
    { round: 3,  date: '2025-10-10', homeId: 'sale',        awayId: 'newcastle'   },
    { round: 3,  date: '2025-10-11', homeId: 'bristol',     awayId: 'exeter'      },
    { round: 3,  date: '2025-10-11', homeId: 'northampton', awayId: 'leicester'   },
    { round: 3,  date: '2025-10-11', homeId: 'bath',        awayId: 'gloucester'  },
    { round: 3,  date: '2025-10-12', homeId: 'harlequins',  awayId: 'saracens'    },

    // Round 4 — 17–19 October 2025
    { round: 4,  date: '2025-10-17', homeId: 'gloucester',  awayId: 'bristol'     },
    { round: 4,  date: '2025-10-17', homeId: 'newcastle',   awayId: 'northampton' },
    { round: 4,  date: '2025-10-18', homeId: 'leicester',   awayId: 'bath'        },
    { round: 4,  date: '2025-10-18', homeId: 'saracens',    awayId: 'sale'        },
    { round: 4,  date: '2025-10-19', homeId: 'exeter',      awayId: 'harlequins'  },

    // Round 5 — 24–25 October 2025
    { round: 5,  date: '2025-10-24', homeId: 'northampton', awayId: 'saracens'    },
    { round: 5,  date: '2025-10-25', homeId: 'exeter',      awayId: 'gloucester'  },
    { round: 5,  date: '2025-10-25', homeId: 'harlequins',  awayId: 'newcastle'   },
    { round: 5,  date: '2025-10-25', homeId: 'bath',        awayId: 'bristol'     },
    { round: 5,  date: '2025-10-25', homeId: 'leicester',   awayId: 'sale'        },

    // — Autumn Nations Series break —

    // Round 6 — 28–30 November 2025
    { round: 6,  date: '2025-11-28', homeId: 'newcastle',   awayId: 'leicester'   },
    { round: 6,  date: '2025-11-28', homeId: 'sale',        awayId: 'exeter'      },
    { round: 6,  date: '2025-11-29', homeId: 'gloucester',  awayId: 'harlequins'  },
    { round: 6,  date: '2025-11-29', homeId: 'bristol',     awayId: 'northampton' },
    { round: 6,  date: '2025-11-30', homeId: 'saracens',    awayId: 'bath'        },

    // Round 7 — 19–21 December 2025
    { round: 7,  date: '2025-12-19', homeId: 'leicester',   awayId: 'gloucester'  },
    { round: 7,  date: '2025-12-20', homeId: 'northampton', awayId: 'sale'        },
    { round: 7,  date: '2025-12-20', homeId: 'saracens',    awayId: 'exeter'      },
    { round: 7,  date: '2025-12-20', homeId: 'harlequins',  awayId: 'bristol'     },
    { round: 7,  date: '2025-12-21', homeId: 'newcastle',   awayId: 'bath'        },

    // Round 8 — 26–28 December 2025 (Boxing Day)
    { round: 8,  date: '2025-12-26', homeId: 'sale',        awayId: 'harlequins'  },
    { round: 8,  date: '2025-12-27', homeId: 'bristol',     awayId: 'newcastle'   },
    { round: 8,  date: '2025-12-27', homeId: 'gloucester',  awayId: 'saracens'    },
    { round: 8,  date: '2025-12-27', homeId: 'bath',        awayId: 'northampton' },
    { round: 8,  date: '2025-12-28', homeId: 'exeter',      awayId: 'leicester'   },

    // Round 9 — 2–4 January 2026
    { round: 9,  date: '2026-01-02', homeId: 'bristol',     awayId: 'sale'        },
    { round: 9,  date: '2026-01-02', homeId: 'newcastle',   awayId: 'gloucester'  },
    { round: 9,  date: '2026-01-03', homeId: 'bath',        awayId: 'exeter'      },
    { round: 9,  date: '2026-01-03', homeId: 'northampton', awayId: 'harlequins'  },
    { round: 9,  date: '2026-01-04', homeId: 'leicester',   awayId: 'saracens'    },

    // Round 10 — 23–24 January 2026
    { round: 10, date: '2026-01-23', homeId: 'gloucester',  awayId: 'bath'        },
    { round: 10, date: '2026-01-24', homeId: 'exeter',      awayId: 'bristol'     },
    { round: 10, date: '2026-01-24', homeId: 'saracens',    awayId: 'newcastle'   },
    { round: 10, date: '2026-01-24', homeId: 'harlequins',  awayId: 'leicester'   },
    { round: 10, date: '2026-01-24', homeId: 'sale',        awayId: 'northampton' },

    // — Six Nations break —

    // Round 11 — 20–22 March 2026
    { round: 11, date: '2026-03-20', homeId: 'bath',        awayId: 'saracens'    },
    { round: 11, date: '2026-03-21', homeId: 'harlequins',  awayId: 'gloucester'  },
    { round: 11, date: '2026-03-21', homeId: 'northampton', awayId: 'newcastle'   },
    { round: 11, date: '2026-03-21', homeId: 'exeter',      awayId: 'sale'        },
    { round: 11, date: '2026-03-22', homeId: 'leicester',   awayId: 'bristol'     },

    // Round 12 — 27–29 March 2026
    { round: 12, date: '2026-03-27', homeId: 'newcastle',   awayId: 'exeter'      },
    { round: 12, date: '2026-03-28', homeId: 'gloucester',  awayId: 'leicester'   },
    { round: 12, date: '2026-03-28', homeId: 'bristol',     awayId: 'harlequins'  },
    { round: 12, date: '2026-03-28', homeId: 'saracens',    awayId: 'northampton' },
    { round: 12, date: '2026-03-29', homeId: 'sale',        awayId: 'bath'        },

    // Round 13 — 17–19 April 2026
    { round: 13, date: '2026-04-17', homeId: 'bristol',     awayId: 'gloucester'  },
    { round: 13, date: '2026-04-18', homeId: 'leicester',   awayId: 'newcastle'   },
    { round: 13, date: '2026-04-18', homeId: 'exeter',      awayId: 'northampton' },
    { round: 13, date: '2026-04-18', homeId: 'bath',        awayId: 'harlequins'  },
    { round: 13, date: '2026-04-19', homeId: 'sale',        awayId: 'saracens'    },

    // Round 14 — 24–26 April 2026
    { round: 14, date: '2026-04-24', homeId: 'newcastle',   awayId: 'bristol'     },
    { round: 14, date: '2026-04-25', homeId: 'harlequins',  awayId: 'sale'        },
    { round: 14, date: '2026-04-25', homeId: 'saracens',    awayId: 'leicester'   },
    { round: 14, date: '2026-04-25', homeId: 'northampton', awayId: 'bath'        },
    { round: 14, date: '2026-04-26', homeId: 'gloucester',  awayId: 'exeter'      },

    // Round 15 — 8–10 May 2026
    { round: 15, date: '2026-05-08', homeId: 'gloucester',  awayId: 'sale'        },
    { round: 15, date: '2026-05-09', homeId: 'leicester',   awayId: 'northampton' },
    { round: 15, date: '2026-05-09', homeId: 'bristol',     awayId: 'saracens'    },
    { round: 15, date: '2026-05-10', homeId: 'exeter',      awayId: 'bath'        },
    { round: 15, date: '2026-05-10', homeId: 'newcastle',   awayId: 'harlequins'  },

    // Round 16 — 15–17 May 2026
    { round: 16, date: '2026-05-15', homeId: 'northampton', awayId: 'bristol'     },
    { round: 16, date: '2026-05-16', homeId: 'bath',        awayId: 'newcastle'   },
    { round: 16, date: '2026-05-16', homeId: 'harlequins',  awayId: 'exeter'      },
    { round: 16, date: '2026-05-16', homeId: 'saracens',    awayId: 'gloucester'  },
    { round: 16, date: '2026-05-17', homeId: 'sale',        awayId: 'leicester'   },

    // Round 17 — 29–31 May 2026
    { round: 17, date: '2026-05-29', homeId: 'bristol',     awayId: 'bath'        },
    { round: 17, date: '2026-05-30', homeId: 'saracens',    awayId: 'harlequins'  },
    { round: 17, date: '2026-05-30', homeId: 'northampton', awayId: 'gloucester'  },
    { round: 17, date: '2026-05-30', homeId: 'newcastle',   awayId: 'sale'        },
    { round: 17, date: '2026-05-31', homeId: 'leicester',   awayId: 'exeter'      },

    // Round 18 — 6 June 2026 (all simultaneous)
    { round: 18, date: '2026-06-06', homeId: 'bath',        awayId: 'leicester'   },
    { round: 18, date: '2026-06-06', homeId: 'exeter',      awayId: 'saracens'    },
    { round: 18, date: '2026-06-06', homeId: 'gloucester',  awayId: 'newcastle'   },
    { round: 18, date: '2026-06-06', homeId: 'harlequins',  awayId: 'northampton' },
    { round: 18, date: '2026-06-06', homeId: 'sale',        awayId: 'bristol'     },
  ],
};

// Module-load assertion: the static fixture list must be a complete
// double round-robin for 10 clubs (90 fixtures = 18 rounds × 5 fixtures;
// each pair plays each other twice — once at home, once away). A manual
// edit that drops, duplicates, or mis-rounds a fixture trips this at
// import time rather than silently breaking the season.
(function assertScheduleShape(): void {
  const fixtures = PREMIERSHIP_2025_26.fixtures;
  if (fixtures.length !== 90) {
    throw new Error(`PREMIERSHIP_2025_26: expected 90 fixtures, got ${fixtures.length}`);
  }
  const perRound = new Map<number, number>();
  const pairCounts = new Map<string, number>();
  const teams = new Set<string>();
  for (const f of fixtures) {
    perRound.set(f.round, (perRound.get(f.round) ?? 0) + 1);
    if (f.homeId === f.awayId) {
      throw new Error(`PREMIERSHIP_2025_26: self-fixture ${f.homeId} vs ${f.awayId} round=${f.round}`);
    }
    const key = `${f.homeId}|${f.awayId}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    teams.add(f.homeId);
    teams.add(f.awayId);
  }
  if (teams.size !== 10) {
    throw new Error(`PREMIERSHIP_2025_26: expected 10 teams, got ${teams.size}`);
  }
  for (const [round, count] of perRound) {
    if (count !== 5) {
      throw new Error(`PREMIERSHIP_2025_26: round ${round} has ${count} fixtures (expected 5)`);
    }
  }
  // Each ordered (home, away) pair appears exactly once across the season.
  for (const [pair, count] of pairCounts) {
    if (count !== 1) {
      throw new Error(`PREMIERSHIP_2025_26: ordered pair ${pair} appears ${count} times`);
    }
  }
  // And every unordered pair appears twice (home + away leg).
  const unordered = new Map<string, number>();
  for (const pair of pairCounts.keys()) {
    const [a, b] = pair.split('|');
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    unordered.set(k, (unordered.get(k) ?? 0) + 1);
  }
  for (const [pair, count] of unordered) {
    if (count !== 2) {
      throw new Error(`PREMIERSHIP_2025_26: unordered pair ${pair} appears ${count} times (expected 2)`);
    }
  }
})();
