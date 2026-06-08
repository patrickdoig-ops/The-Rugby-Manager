// European competition scheduler — pure fixture + pool data for Year 1 (2025-26).
//
// Champions Cup: 4 pools × 6 teams = 24 teams, 4 rounds × 12 fixtures = 48 pool fixtures.
// Challenge Cup: 3 pools × 6 teams = 18 teams, 4 rounds × 9 fixtures = 36 pool fixtures.
//
// Pool-stage pseudo-rounds are kept clear of league (1-18), playoffs (19-20), and
// Prem Cup (100-143). One per round is enough: (homeId, awayId) makes each
// fixture's seed unique within a round.

import type { EuropeanFixture, EuropeanCompState } from '../types/gameState';

export type EuropeanFixtureDef = {
  competition: 'europeanCup' | 'europeanShield';
  poolId: number;
  round: number;
  homeId: string;
  awayId: string;
  date: string;
};

// ── Champions Cup pools ────────────────────────────────────────────────────
export const EC_POOLS_2025_26: Record<number, string[]> = {
  1: ['sale', 'saracens', 'toulouse', 'clermont', 'glasgow', 'sharks'],
  2: ['bath', 'gloucester', 'toulon', 'castres', 'edinburgh', 'munster'],
  3: ['harlequins', 'leicester', 'la-rochelle', 'bayonne', 'leinster', 'stormers'],
  4: ['bristol', 'northampton', 'bordeaux', 'pau', 'bulls', 'scarlets'],
};

// ── Challenge Cup pools ────────────────────────────────────────────────────
export const ES_POOLS_2025_26: Record<number, string[]> = {
  1: ['montpellier', 'montauban', 'connacht', 'ospreys', 'zebre', 'black-lion'],
  2: ['lyon', 'usap', 'benetton', 'dragons', 'em-lions', 'newcastle'],
  3: ['racing92', 'stade-francais', 'ulster', 'cardiff', 'exeter', 'cheetahs'],
};

// ── Pseudo-round numbers for deriveFixtureSeed ─────────────────────────────
// Champions Cup uses 200-213, Challenge Cup uses 220-233.
export const EURO_CUP_SEED_ROUNDS = { r1: 200, r2: 201, r3: 202, r4: 203, r16: 210, qf: 211, sf: 212, final: 213 };
export const EURO_SHIELD_SEED_ROUNDS = { r1: 220, r2: 221, r3: 222, r4: 223, r16: 230, qf: 231, sf: 232, final: 233 };

// ── Champions Cup 2025-26 fixtures ─────────────────────────────────────────
export const EC_FIXTURES_2025_26: EuropeanFixtureDef[] = [
  // Round 1 (Dec 5-7)
  { competition: 'europeanCup', poolId: 1, round: 1, homeId: 'sale',        awayId: 'glasgow',    date: '2025-12-05' },
  { competition: 'europeanCup', poolId: 1, round: 1, homeId: 'saracens',    awayId: 'clermont',   date: '2025-12-06' },
  { competition: 'europeanCup', poolId: 1, round: 1, homeId: 'toulouse',    awayId: 'sharks',     date: '2025-12-07' },
  { competition: 'europeanCup', poolId: 2, round: 1, homeId: 'bath',        awayId: 'munster',    date: '2025-12-05' },
  { competition: 'europeanCup', poolId: 2, round: 1, homeId: 'gloucester',  awayId: 'castres',    date: '2025-12-06' },
  { competition: 'europeanCup', poolId: 2, round: 1, homeId: 'edinburgh',   awayId: 'toulon',     date: '2025-12-07' },
  { competition: 'europeanCup', poolId: 3, round: 1, homeId: 'leinster',    awayId: 'harlequins', date: '2025-12-06' },
  { competition: 'europeanCup', poolId: 3, round: 1, homeId: 'la-rochelle', awayId: 'leicester',  date: '2025-12-06' },
  { competition: 'europeanCup', poolId: 3, round: 1, homeId: 'bayonne',     awayId: 'stormers',   date: '2025-12-07' },
  { competition: 'europeanCup', poolId: 4, round: 1, homeId: 'pau',         awayId: 'northampton', date: '2025-12-05' },
  { competition: 'europeanCup', poolId: 4, round: 1, homeId: 'bulls',       awayId: 'bordeaux',   date: '2025-12-06' },
  { competition: 'europeanCup', poolId: 4, round: 1, homeId: 'scarlets',    awayId: 'bristol',    date: '2025-12-07' },
  // Round 2 (Dec 12-14)
  { competition: 'europeanCup', poolId: 1, round: 2, homeId: 'sharks',      awayId: 'saracens',   date: '2025-12-12' },
  { competition: 'europeanCup', poolId: 1, round: 2, homeId: 'clermont',    awayId: 'sale',       date: '2025-12-13' },
  { competition: 'europeanCup', poolId: 1, round: 2, homeId: 'glasgow',     awayId: 'toulouse',   date: '2025-12-14' },
  { competition: 'europeanCup', poolId: 2, round: 2, homeId: 'munster',     awayId: 'gloucester', date: '2025-12-12' },
  { competition: 'europeanCup', poolId: 2, round: 2, homeId: 'castres',     awayId: 'edinburgh',  date: '2025-12-13' },
  { competition: 'europeanCup', poolId: 2, round: 2, homeId: 'toulon',      awayId: 'bath',       date: '2025-12-14' },
  { competition: 'europeanCup', poolId: 3, round: 2, homeId: 'leicester',   awayId: 'leinster',   date: '2025-12-12' },
  { competition: 'europeanCup', poolId: 3, round: 2, homeId: 'stormers',    awayId: 'la-rochelle', date: '2025-12-13' },
  { competition: 'europeanCup', poolId: 3, round: 2, homeId: 'harlequins',  awayId: 'bayonne',    date: '2025-12-14' },
  { competition: 'europeanCup', poolId: 4, round: 2, homeId: 'bordeaux',    awayId: 'scarlets',   date: '2025-12-12' },
  { competition: 'europeanCup', poolId: 4, round: 2, homeId: 'northampton', awayId: 'bulls',      date: '2025-12-13' },
  { competition: 'europeanCup', poolId: 4, round: 2, homeId: 'bristol',     awayId: 'pau',        date: '2025-12-14' },
  // Round 3 (Jan 9-11)
  { competition: 'europeanCup', poolId: 1, round: 3, homeId: 'clermont',    awayId: 'glasgow',    date: '2026-01-09' },
  { competition: 'europeanCup', poolId: 1, round: 3, homeId: 'sale',        awayId: 'sharks',     date: '2026-01-10' },
  { competition: 'europeanCup', poolId: 1, round: 3, homeId: 'saracens',    awayId: 'toulouse',   date: '2026-01-11' },
  { competition: 'europeanCup', poolId: 2, round: 3, homeId: 'castres',     awayId: 'bath',       date: '2026-01-09' },
  { competition: 'europeanCup', poolId: 2, round: 3, homeId: 'edinburgh',   awayId: 'gloucester', date: '2026-01-10' },
  { competition: 'europeanCup', poolId: 2, round: 3, homeId: 'toulon',      awayId: 'munster',    date: '2026-01-11' },
  { competition: 'europeanCup', poolId: 3, round: 3, homeId: 'leinster',    awayId: 'la-rochelle', date: '2026-01-09' },
  { competition: 'europeanCup', poolId: 3, round: 3, homeId: 'leicester',   awayId: 'bayonne',    date: '2026-01-10' },
  { competition: 'europeanCup', poolId: 3, round: 3, homeId: 'harlequins',  awayId: 'stormers',   date: '2026-01-11' },
  { competition: 'europeanCup', poolId: 4, round: 3, homeId: 'scarlets',    awayId: 'pau',        date: '2026-01-09' },
  { competition: 'europeanCup', poolId: 4, round: 3, homeId: 'bulls',       awayId: 'bristol',    date: '2026-01-10' },
  { competition: 'europeanCup', poolId: 4, round: 3, homeId: 'bordeaux',    awayId: 'northampton', date: '2026-01-11' },
  // Round 4 (Jan 16-18)
  { competition: 'europeanCup', poolId: 1, round: 4, homeId: 'sharks',      awayId: 'clermont',   date: '2026-01-16' },
  { competition: 'europeanCup', poolId: 1, round: 4, homeId: 'toulouse',    awayId: 'sale',       date: '2026-01-17' },
  { competition: 'europeanCup', poolId: 1, round: 4, homeId: 'glasgow',     awayId: 'saracens',   date: '2026-01-18' },
  { competition: 'europeanCup', poolId: 2, round: 4, homeId: 'bath',        awayId: 'edinburgh',  date: '2026-01-16' },
  { competition: 'europeanCup', poolId: 2, round: 4, homeId: 'gloucester',  awayId: 'toulon',     date: '2026-01-17' },
  { competition: 'europeanCup', poolId: 2, round: 4, homeId: 'munster',     awayId: 'castres',    date: '2026-01-18' },
  { competition: 'europeanCup', poolId: 3, round: 4, homeId: 'leinster',    awayId: 'bayonne',    date: '2026-01-16' },
  { competition: 'europeanCup', poolId: 3, round: 4, homeId: 'stormers',    awayId: 'leicester',  date: '2026-01-17' },
  { competition: 'europeanCup', poolId: 3, round: 4, homeId: 'la-rochelle', awayId: 'harlequins', date: '2026-01-18' },
  { competition: 'europeanCup', poolId: 4, round: 4, homeId: 'pau',         awayId: 'bulls',      date: '2026-01-16' },
  { competition: 'europeanCup', poolId: 4, round: 4, homeId: 'bristol',     awayId: 'bordeaux',   date: '2026-01-17' },
  { competition: 'europeanCup', poolId: 4, round: 4, homeId: 'northampton', awayId: 'scarlets',   date: '2026-01-18' },
];

// ── Challenge Cup 2025-26 fixtures ─────────────────────────────────────────
export const ES_FIXTURES_2025_26: EuropeanFixtureDef[] = [
  // Round 1 (Dec 5-7)
  { competition: 'europeanShield', poolId: 3, round: 1, homeId: 'ulster',        awayId: 'racing92',      date: '2025-12-05' },
  { competition: 'europeanShield', poolId: 2, round: 1, homeId: 'em-lions',      awayId: 'benetton',      date: '2025-12-06' },
  { competition: 'europeanShield', poolId: 3, round: 1, homeId: 'stade-francais', awayId: 'cardiff',      date: '2025-12-06' },
  { competition: 'europeanShield', poolId: 1, round: 1, homeId: 'black-lion',    awayId: 'montpellier',   date: '2025-12-06' },
  { competition: 'europeanShield', poolId: 2, round: 1, homeId: 'lyon',          awayId: 'newcastle',     date: '2025-12-07' },
  { competition: 'europeanShield', poolId: 1, round: 1, homeId: 'zebre',         awayId: 'montauban',     date: '2025-12-06' },
  { competition: 'europeanShield', poolId: 2, round: 1, homeId: 'usap',          awayId: 'dragons',       date: '2025-12-07' },
  { competition: 'europeanShield', poolId: 1, round: 1, homeId: 'ospreys',       awayId: 'connacht',      date: '2025-12-07' },
  { competition: 'europeanShield', poolId: 3, round: 1, homeId: 'exeter',        awayId: 'cheetahs',      date: '2025-12-07' },
  // Round 2 (Dec 12-14)
  { competition: 'europeanShield', poolId: 1, round: 2, homeId: 'montpellier',   awayId: 'zebre',         date: '2025-12-12' },
  { competition: 'europeanShield', poolId: 2, round: 2, homeId: 'benetton',      awayId: 'usap',          date: '2025-12-13' },
  { competition: 'europeanShield', poolId: 3, round: 2, homeId: 'cheetahs',      awayId: 'stade-francais', date: '2025-12-12' },
  { competition: 'europeanShield', poolId: 1, round: 2, homeId: 'montauban',     awayId: 'ospreys',       date: '2025-12-13' },
  { competition: 'europeanShield', poolId: 2, round: 2, homeId: 'newcastle',     awayId: 'em-lions',      date: '2025-12-14' },
  { competition: 'europeanShield', poolId: 3, round: 2, homeId: 'cardiff',       awayId: 'ulster',        date: '2025-12-12' },
  { competition: 'europeanShield', poolId: 1, round: 2, homeId: 'connacht',      awayId: 'black-lion',    date: '2025-12-13' },
  { competition: 'europeanShield', poolId: 3, round: 2, homeId: 'racing92',      awayId: 'exeter',        date: '2025-12-14' },
  { competition: 'europeanShield', poolId: 2, round: 2, homeId: 'dragons',       awayId: 'lyon',          date: '2025-12-13' },
  // Round 3 (Jan 10-11)
  { competition: 'europeanShield', poolId: 3, round: 3, homeId: 'stade-francais', awayId: 'exeter',       date: '2026-01-10' },
  { competition: 'europeanShield', poolId: 1, round: 3, homeId: 'montauban',     awayId: 'black-lion',    date: '2026-01-10' },
  { competition: 'europeanShield', poolId: 2, round: 3, homeId: 'newcastle',     awayId: 'usap',          date: '2026-01-10' },
  { competition: 'europeanShield', poolId: 2, round: 3, homeId: 'em-lions',      awayId: 'lyon',          date: '2026-01-11' },
  { competition: 'europeanShield', poolId: 3, round: 3, homeId: 'cardiff',       awayId: 'racing92',      date: '2026-01-10' },
  { competition: 'europeanShield', poolId: 2, round: 3, homeId: 'benetton',      awayId: 'dragons',       date: '2026-01-11' },
  { competition: 'europeanShield', poolId: 1, round: 3, homeId: 'montpellier',   awayId: 'connacht',      date: '2026-01-10' },
  { competition: 'europeanShield', poolId: 1, round: 3, homeId: 'zebre',         awayId: 'ospreys',       date: '2026-01-11' },
  { competition: 'europeanShield', poolId: 3, round: 3, homeId: 'cheetahs',      awayId: 'ulster',        date: '2026-01-11' },
  // Round 4 (Jan 16-18)
  { competition: 'europeanShield', poolId: 2, round: 4, homeId: 'dragons',       awayId: 'newcastle',     date: '2026-01-16' },
  { competition: 'europeanShield', poolId: 3, round: 4, homeId: 'ulster',        awayId: 'stade-francais', date: '2026-01-16' },
  { competition: 'europeanShield', poolId: 1, round: 4, homeId: 'black-lion',    awayId: 'zebre',         date: '2026-01-17' },
  { competition: 'europeanShield', poolId: 2, round: 4, homeId: 'usap',          awayId: 'em-lions',      date: '2026-01-17' },
  { competition: 'europeanShield', poolId: 1, round: 4, homeId: 'connacht',      awayId: 'montauban',     date: '2026-01-16' },
  { competition: 'europeanShield', poolId: 1, round: 4, homeId: 'ospreys',       awayId: 'montpellier',   date: '2026-01-17' },
  { competition: 'europeanShield', poolId: 3, round: 4, homeId: 'exeter',        awayId: 'cardiff',       date: '2026-01-17' },
  { competition: 'europeanShield', poolId: 2, round: 4, homeId: 'lyon',          awayId: 'benetton',      date: '2026-01-18' },
  { competition: 'europeanShield', poolId: 3, round: 4, homeId: 'racing92',      awayId: 'cheetahs',      date: '2026-01-18' },
];

// ── Seed builder ───────────────────────────────────────────────────────────
// Returns the EUROPEAN_COMP_SEEDED event payload (minus the `type` field).
export function buildEuropeanCompSeed(
  pools: Record<number, string[]>,
  fixtures: readonly EuropeanFixtureDef[],
  seasonLabel: string,
  competition: 'europeanCup' | 'europeanShield',
): {
  competition: 'europeanCup' | 'europeanShield';
  seasonLabel: string;
  pools: Array<{ id: number; teamIds: string[] }>;
  fixtures: EuropeanFixture[];
} {
  return {
    competition,
    seasonLabel,
    pools: Object.entries(pools).map(([id, teamIds]) => ({ id: Number(id), teamIds: [...teamIds] })),
    fixtures: fixtures
      .filter(f => f.competition === competition)
      .map(f => ({ poolId: f.poolId, round: f.round, homeId: f.homeId, awayId: f.awayId, date: f.date })),
  };
}
