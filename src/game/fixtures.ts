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
// The remaining 16 rounds are filled with the 80 non-rivalry fixtures via
// a seeded greedy matching pass so each team plays exactly once per round.
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

  const rivalrySet = new Set(RIVALRY_PAIRS.map(([a, b]) => pairKey(a, b)));

  // Phase 1 — two derby rounds.
  // Each pair independently flips home/away via rngTransfer. Odd seasons
  // are biased toward the reversed direction (65% flip); even seasons toward
  // the canonical direction (35% flip).
  const flipThreshold = options.seasonsCompleted % 2 === 1 ? 0.65 : 0.35;
  const derbyA: Fixture[] = [];
  const derbyB: Fixture[] = [];
  for (const [canonical, rival] of RIVALRY_PAIRS) {
    const flipped = rngTransferRaw() < flipThreshold;
    const homeA = flipped ? rival : canonical;
    const awayA = flipped ? canonical : rival;
    derbyA.push({ round: DERBY_ROUND_POSITIONS.first,  homeId: homeA, awayId: awayA, isDerby: true });
    derbyB.push({ round: DERBY_ROUND_POSITIONS.second, homeId: awayA, awayId: homeA, isDerby: true });
  }

  // Phase 2 — 16 non-derby rounds from the remaining 80 fixtures.
  const pool: Array<{ homeId: string; awayId: string }> = [];
  for (const home of allTeamIds) {
    for (const away of allTeamIds) {
      if (home !== away && !rivalrySet.has(pairKey(home, away))) {
        pool.push({ homeId: home, awayId: away });
      }
    }
  }

  // Fisher-Yates shuffle seeded by rngTransfer for per-season variety.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rngTransferRaw() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const derbySlots = new Set<number>([DERBY_ROUND_POSITIONS.first, DERBY_ROUND_POSITIONS.second]);
  const nonDerbySlots: number[] = [];
  for (let r = 1; r <= 18; r++) {
    if (!derbySlots.has(r)) nonDerbySlots.push(r);
  }

  const remaining = [...pool];
  const allFixtures: Fixture[] = [...derbyA, ...derbyB];

  for (const slot of nonDerbySlots) {
    const round: Fixture[] = [];
    const used = new Set<string>();

    // Hoist the player's fixture first (matches existing fixture-list convention).
    const pi = remaining.findIndex(
      f => (f.homeId === playerTeamId || f.awayId === playerTeamId) && !used.has(f.homeId) && !used.has(f.awayId),
    );
    if (pi !== -1) {
      const [f] = remaining.splice(pi, 1);
      round.push({ ...f, round: slot });
      used.add(f.homeId);
      used.add(f.awayId);
    }

    for (let i = 0; i < remaining.length && round.length < 5; i++) {
      const f = remaining[i];
      if (!used.has(f.homeId) && !used.has(f.awayId)) {
        round.push({ ...f, round: slot });
        used.add(f.homeId);
        used.add(f.awayId);
        remaining.splice(i, 1);
        i--;
      }
    }

    allFixtures.push(...round);
  }

  return allFixtures;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
