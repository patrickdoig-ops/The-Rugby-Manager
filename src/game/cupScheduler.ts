// Prem Cup scheduler — pure fixture + pool generation.
//
// Three blocks across the season:
//   Leg 0 (pre-season): rounds 0-1 home — Sep, before league R1 (4 fixtures/pool)
//   Leg 1 (Autumn):     rounds 2-3 home + rounds 0-1 away — Autumn Nations break (8/pool)
//   Leg 2 (Six Nations): round 4 home + rounds 2-4 away + knockouts — Six Nations break (8/pool)
//
// Full home-&-away double round-robin within each pool of 5 (8 games/team,
// 20 fixtures/pool, 40 total). Pools are the real 2025-26 groupings for
// year 1 and redrawn via the career RNG (rngTransfer) for year 2+.
//
// Fixture dates are synthetic — spaced inside the block gap purely for
// display. They never drive calendar advance. Match seeds use the reserved
// pseudo-rounds below (home/away already make each fixture's seed unique).

import type { CupFixture, CupKnockoutMatch, Fixture, PremCupState } from '../types/gameState';
import { sortStandings } from './leagueTable';
import { rngTransferRaw } from '../utils/rng';
import { INTERNATIONAL_WINDOWS } from '../engine/balance/international';
import { addDaysIso } from './age';

// Real 2025-26 pools.
export const CUP_POOLS_2025_26: { A: string[]; B: string[] } = {
  A: ['bath', 'bristol', 'exeter', 'gloucester', 'sale'],
  B: ['harlequins', 'leicester', 'newcastle', 'northampton', 'saracens'],
};

// Pseudo-round numbers for deriveFixtureSeed — kept clear of league (1-18)
// and playoffs (19-20). One per stage is enough: (homeId, awayId) already
// make each fixture's seed unique within a leg.
export const CUP_SEED_ROUND = {
  preseason: 100,
  leg1: 101,
  leg2: 102,
  semifinal_1: 141,
  semifinal_2: 142,
  final: 143,
} as const;

// The two break return rounds, ascending (autumn first, then Six Nations).
function breakReturnRounds(): [number, number] {
  const rounds = (Object.keys(INTERNATIONAL_WINDOWS) as (keyof typeof INTERNATIONAL_WINDOWS)[])
    .map(k => INTERNATIONAL_WINDOWS[k].returnRound)
    .sort((a, b) => a - b);
  return [rounds[0], rounds[1]];
}

// Builds the full PREM_CUP_SEEDED payload for a season: the two pools + all
// 40 pool fixtures (4+8+8 per pool across 3 blocks). Pure; pools are passed
// in (caller decides fixed vs redrawn).
//
// Round-robin assignment per pool (5 rounds, 2 matches each):
//   ri 0-1 home → leg 0 (pre-season), ri 0-1 away → leg 1 (Autumn)
//   ri 2-3 home → leg 1 (Autumn),     ri 2-3 away → leg 2 (Six Nations)
//   ri 4   home → leg 2 (Six Nations), ri 4   away → leg 2 (Six Nations)
export function buildCupSeed(
  pools: { A: string[]; B: string[] },
  leagueFixtures: readonly Fixture[],
  seasonLabel: string,
): { seasonLabel: string; pools: [{ id: 'A'; teamIds: string[] }, { id: 'B'; teamIds: string[] }]; fixtures: CupFixture[] } {
  const [autumn, sixNations] = breakReturnRounds();
  // Pre-season: 2 matchdays before R1 (falls back to ~Sep 11 and Sep 18 when
  // round 0 has no fixtures, which is always the case).
  const preSeasonDates = gapDates(leagueFixtures, 0, 1, 2);
  // Leg 1: 4 matchdays in the Autumn Nations gap.
  const leg1Dates = gapDates(leagueFixtures, autumn - 1, autumn, 4);
  // Leg 2 shares the Six Nations gap with the knockouts; indices 5-6 are
  // reserved for SF + final.
  const leg2Dates = gapDates(leagueFixtures, sixNations - 1, sixNations, 7);

  const fixtures: CupFixture[] = [];
  for (const pool of [{ id: 'A' as const, teams: pools.A }, { id: 'B' as const, teams: pools.B }]) {
    const rounds = roundRobinRounds(pool.teams);
    rounds.forEach((pairs, ri) => {
      const homeLeg: 0 | 1 | 2 = ri < 2 ? 0 : ri < 4 ? 1 : 2;
      const awayLeg: 1 | 2 = ri < 2 ? 1 : 2;
      const homeD = homeLeg === 0 ? (preSeasonDates[ri] ?? preSeasonDates[1] ?? '')
                  : homeLeg === 1 ? (leg1Dates[ri - 2] ?? leg1Dates[leg1Dates.length - 1] ?? '')
                  :                  (leg2Dates[0] ?? leg2Dates[leg2Dates.length - 1] ?? '');
      const awayD = awayLeg === 1 ? (leg1Dates[ri + 2] ?? leg1Dates[leg1Dates.length - 1] ?? '')
                  :                  (leg2Dates[ri - 1] ?? leg2Dates[leg2Dates.length - 1] ?? '');
      for (const [home, away] of pairs) {
        fixtures.push({ pool: pool.id, leg: homeLeg, homeId: home, awayId: away, date: homeD });
        fixtures.push({ pool: pool.id, leg: awayLeg, homeId: away, awayId: home, date: awayD });
      }
    });
  }

  return {
    seasonLabel,
    pools: [{ id: 'A', teamIds: [...pools.A] }, { id: 'B', teamIds: [...pools.B] }],
    fixtures,
  };
}

// Year 2+ pool redraw. Deterministic Fisher-Yates over the sorted team-id
// list via the career RNG. Sorting the input first makes the result
// independent of caller iteration order.
export function redrawCupPools(allTeamIds: readonly string[]): { A: string[]; B: string[] } {
  const arr = [...allTeamIds].sort();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rngTransferRaw() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return { A: arr.slice(0, 5), B: arr.slice(5, 10) };
}

// Seeds the knockout from the (already finalised) pool standings.
// SF1 = winner(A) v runner-up(B); SF2 = winner(B) v runner-up(A).
export function buildCupKnockoutSeed(
  cup: PremCupState,
  leagueFixtures: readonly Fixture[],
): { semifinals: [CupKnockoutMatch, CupKnockoutMatch]; final: CupKnockoutMatch } {
  const [, sixNations] = breakReturnRounds();
  const dates = gapDates(leagueFixtures, sixNations - 1, sixNations, 7);
  const sfDate = dates[5] ?? dates[dates.length - 1] ?? '';
  const finalDate = dates[6] ?? dates[dates.length - 1] ?? '';

  const poolA = sortStandings(cup.pools[0].standings);
  const poolB = sortStandings(cup.pools[1].standings);
  const sf1: CupKnockoutMatch = { kind: 'semifinal_1', homeId: poolA[0]?.teamId ?? null, awayId: poolB[1]?.teamId ?? null, date: sfDate };
  const sf2: CupKnockoutMatch = { kind: 'semifinal_2', homeId: poolB[0]?.teamId ?? null, awayId: poolA[1]?.teamId ?? null, date: sfDate };
  const final: CupKnockoutMatch = { kind: 'final', homeId: null, awayId: null, date: finalDate };
  return { semifinals: [sf1, sf2], final };
}

// ── helpers ──────────────────────────────────────────────────────────────

// Circle-method round-robin for a pool. For an odd count (5) a ghost slot
// supplies the per-round bye; ghost pairings are dropped, leaving 2 real
// matches per round across 5 rounds. Each pair is [home, away].
function roundRobinRounds(teams: readonly string[]): [string, string][][] {
  const arr = [...teams];
  if (arr.length % 2 === 1) arr.push('__bye__');
  const n = arr.length;
  const half = n / 2;
  let order = [...arr];
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < half; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      if (a !== '__bye__' && b !== '__bye__') pairs.push([a, b]);
    }
    rounds.push(pairs);
    // Rotate, keeping the first element fixed.
    order = [order[0], order[n - 1], ...order.slice(1, n - 1)];
  }
  return rounds;
}

// `count` ISO dates evenly spaced strictly inside the gap between the
// earliest fixture of `preRound` and that of `returnRound`. Falls back to
// 7-day-spaced placeholders when league dates are absent (display-only).
function gapDates(fixtures: readonly Fixture[], preRound: number, returnRound: number, count: number): string[] {
  const start = earliestDateForRound(fixtures, preRound);
  const end = earliestDateForRound(fixtures, returnRound);
  if (!start || !end) {
    const anchor = end ?? start ?? '2025-11-01';
    return Array.from({ length: count }, (_, i) => addDaysIso(anchor, -(count - i) * 7));
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const span = endMs - startMs;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const frac = (i + 1) / (count + 1);
    out.push(new Date(startMs + span * frac).toISOString().slice(0, 10));
  }
  return out;
}

function earliestDateForRound(fixtures: readonly Fixture[], round: number): string | null {
  let min: string | null = null;
  for (const f of fixtures) {
    if (f.round !== round || !f.date) continue;
    if (min === null || f.date < min) min = f.date;
  }
  return min;
}
