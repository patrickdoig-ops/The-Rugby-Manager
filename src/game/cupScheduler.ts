// Prem Cup scheduler — pure fixture + pool generation.
//
// The cup is contested entirely during the two international breaks. The
// pool stage is a full home-&-away double round-robin within each pool of
// 5 (8 games/team); leg 1 plays in the Autumn block, leg 2 + knockouts in
// the Six Nations block. Pools are the real 2025-26 groupings for year 1
// and redrawn via the career RNG (rngTransfer) for year 2+.
//
// Fixture dates are synthetic — spaced inside the break gap purely for
// display. They never drive calendar advance. Match seeds use the reserved
// pseudo-rounds below (home/away already make each fixture's seed unique).

import type { CupFixture, CupKnockoutMatch, Fixture, PremCupState } from '../types/gameState';
import { sortStandings } from './leagueTable';
import { rngTransferRaw } from '../utils/rng';
import { INTERNATIONAL_WINDOWS } from '../engine/balance/international';

// Real 2025-26 pools.
export const CUP_POOLS_2025_26: { A: string[]; B: string[] } = {
  A: ['bath', 'bristol', 'exeter', 'gloucester', 'sale'],
  B: ['harlequins', 'leicester', 'newcastle', 'northampton', 'saracens'],
};

// Pseudo-round numbers for deriveFixtureSeed — kept clear of league (1-18)
// and playoffs (19-20). One per stage is enough: (homeId, awayId) already
// make each fixture's seed unique, and leg 2 swaps home/away vs leg 1.
export const CUP_SEED_ROUND = {
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
// 40 pool fixtures (20 per leg). Pure; pools are passed in (caller decides
// fixed vs redrawn).
export function buildCupSeed(
  pools: { A: string[]; B: string[] },
  leagueFixtures: readonly Fixture[],
  seasonLabel: string,
): { seasonLabel: string; pools: [{ id: 'A'; teamIds: string[] }, { id: 'B'; teamIds: string[] }]; fixtures: CupFixture[] } {
  const [autumn, sixNations] = breakReturnRounds();
  const leg1Dates = gapDates(leagueFixtures, autumn - 1, autumn, 5);
  // Leg 2 shares the Six Nations gap with the knockouts; reserve the last
  // two slots for SF + final by asking for 7 and taking the first 5 here.
  const leg2Dates = gapDates(leagueFixtures, sixNations - 1, sixNations, 7);

  const fixtures: CupFixture[] = [];
  for (const pool of [{ id: 'A' as const, teams: pools.A }, { id: 'B' as const, teams: pools.B }]) {
    const rounds = roundRobinRounds(pool.teams);
    rounds.forEach((pairs, ri) => {
      const d1 = leg1Dates[ri] ?? leg1Dates[leg1Dates.length - 1] ?? '';
      const d2 = leg2Dates[ri] ?? leg2Dates[leg2Dates.length - 1] ?? '';
      for (const [home, away] of pairs) {
        fixtures.push({ pool: pool.id, leg: 1, homeId: home, awayId: away, date: d1 });
        // Leg 2 swaps the venue.
        fixtures.push({ pool: pool.id, leg: 2, homeId: away, awayId: home, date: d2 });
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
    return Array.from({ length: count }, (_, i) => addDays(anchor, -(count - i) * 7));
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

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
