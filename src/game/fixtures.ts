// Round-robin schedule generator for an even-sized league.
//
// Produces a full double round-robin with two structural constraints:
//
//   Derby Weekend  (DERBY_ROUND_POSITIONS.first)  — all rivalry pairs play
//   in one round. Home/away per pair is randomised each season via rngTransfer
//   (biased toward even-season canonical direction, odd-season reversed).
//
//   Big Match Weekend (DERBY_ROUND_POSITIONS.second) — strict home/away
//   rematch of the Derby Weekend; the same pairs with venues swapped.
//
// The remaining 16 rounds are filled with the 80 non-rivalry fixtures using
// the standard circle method, which guarantees every team plays exactly once
// per round and each directed fixture appears exactly once across the season.
//
// generateFixtures is not called at season init — the 2025-26 season uses
// the hardcoded PREMIERSHIP_2025_26 schedule. This is the year 2+ entry point.

import type { Fixture } from '../types/gameState';
import { RIVALRY_PAIRS, DERBY_ROUND_POSITIONS } from '../engine/balance/season';
import { rngTransferRaw } from '../utils/rng';

export interface GenerateFixturesOptions {
  seasonsCompleted: number;
}

export function generateFixtures(
  playerTeamId: string,
  allTeamIds: string[],
  options: GenerateFixturesOptions,
): Fixture[] {
  if (allTeamIds.length === 0 || allTeamIds.length % 2 !== 0) {
    throw new Error(`generateFixtures requires an even, non-zero number of teams (got ${allTeamIds.length})`);
  }
  if (!allTeamIds.includes(playerTeamId)) {
    throw new Error(`generateFixtures: playerTeamId ${playerTeamId} not found in team list`);
  }

  // Order teams so all rivalry pairs land in circle-method round 0:
  // pairs are assigned to complementary positions (0,n-1), (1,n-2), …
  const ordered = orderTeamsForCircle(allTeamIds, RIVALRY_PAIRS);

  // Generate 9 single-RR rounds via the circle method.
  //   singleRR[0] = all 5 rivalry pairs (by construction above).
  //   singleRR[1..8] = 40 non-rivalry undirected pairs.
  const singleRR = circleMethodRounds(ordered);

  // Derby round home/away: odd seasons bias toward reversed direction (65%),
  // even seasons toward canonical direction (35%). Consumes one rngTransferRaw
  // draw per rivalry pair — same contract as the previous implementation.
  const flipThreshold = options.seasonsCompleted % 2 === 1 ? 0.65 : 0.35;
  const derbyA: Fixture[] = [];
  const derbyB: Fixture[] = [];
  for (const [a, b] of singleRR[0]) {
    const flipped = rngTransferRaw() < flipThreshold;
    const homeA = flipped ? b : a;
    const awayA = flipped ? a : b;
    derbyA.push({ round: DERBY_ROUND_POSITIONS.first,  homeId: homeA, awayId: awayA, isDerby: true });
    derbyB.push({ round: DERBY_ROUND_POSITIONS.second, homeId: awayA, awayId: homeA, isDerby: true });
  }

  // 16 non-derby slots (rounds 1–18 excluding the two derby rounds).
  const nonDerbySlots: number[] = [];
  for (let r = 1; r <= 18; r++) {
    if (r !== DERBY_ROUND_POSITIONS.first && r !== DERBY_ROUND_POSITIONS.second) nonDerbySlots.push(r);
  }

  // Each of the 8 non-rivalry single-RR rounds contributes 5 undirected pairs.
  // We create two directed rounds from each: one for the first half and one
  // (with venues swapped) for the second half.
  // Consumes one rngTransferRaw draw per undirected pair (40 draws total).
  const firstHalfSlots  = nonDerbySlots.slice(0, 8);
  const secondHalfSlots = nonDerbySlots.slice(8, 16);

  const nonDerbyFixtures: Fixture[] = [];
  for (let r = 1; r <= 8; r++) {
    const slotFirst  = firstHalfSlots[r - 1];
    const slotSecond = secondHalfSlots[r - 1];
    for (const [a, b] of singleRR[r]) {
      const flip = rngTransferRaw() < 0.5;
      const homeFirst = flip ? b : a;
      const awayFirst = flip ? a : b;
      nonDerbyFixtures.push(
        { round: slotFirst,  homeId: homeFirst,  awayId: awayFirst  },
        { round: slotSecond, homeId: awayFirst,  awayId: homeFirst  },
      );
    }
  }

  // Reassemble and sort within each round so the player's fixture is first
  // (preserves the existing fixture-list display convention).
  const byRound = new Map<number, Fixture[]>();
  for (const f of [...derbyA, ...derbyB, ...nonDerbyFixtures]) {
    if (!byRound.has(f.round)) byRound.set(f.round, []);
    byRound.get(f.round)!.push(f);
  }
  const result: Fixture[] = [];
  for (let r = 1; r <= 18; r++) {
    const round = byRound.get(r) ?? [];
    round.sort((a, b) => {
      const aPlayer = a.homeId === playerTeamId || a.awayId === playerTeamId ? -1 : 1;
      const bPlayer = b.homeId === playerTeamId || b.awayId === playerTeamId ? -1 : 1;
      return aPlayer - bPlayer;
    });
    result.push(...round);
  }

  if (result.length !== 90) {
    throw new Error(`generateFixtures: expected 90 fixtures, got ${result.length}`);
  }
  return result;
}

// Order teams so each rivalry pair occupies one complementary position pair:
// (0, n-1), (1, n-2), …, which is what circleMethodRounds pairs in round 0.
function orderTeamsForCircle(teams: string[], rivalries: [string, string][]): string[] {
  const n = teams.length;
  const ordered = new Array<string>(n);
  const used = new Set<string>();
  let lo = 0;
  let hi = n - 1;
  for (const [a, b] of rivalries) {
    ordered[lo++] = a;
    ordered[hi--] = b;
    used.add(a);
    used.add(b);
  }
  // Fill remaining centre positions with non-rivalry teams in stable order.
  for (const id of teams) {
    if (!used.has(id)) ordered[lo++] = id;
  }
  return ordered;
}

// Standard circle method: n teams (n even) → n-1 rounds of n/2 undirected pairs.
// Keeps position 0 fixed; rotates positions 1..n-1 clockwise each round.
function circleMethodRounds(teams: string[]): [string, string][][] {
  const n = teams.length;
  const order = [...teams];
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push([order[i], order[n - 1 - i]]);
    }
    rounds.push(pairs);
    // Rotate: insert last element at position 1, keeping position 0 fixed.
    order.splice(1, 0, order.pop()!);
  }
  return rounds;
}
