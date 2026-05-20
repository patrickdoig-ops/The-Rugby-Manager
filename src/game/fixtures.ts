// Round-robin schedule generator for an even-sized league.
//
// Uses the standard "circle" method: team at position 0 is fixed, the
// remaining n−1 teams rotate one step per round. Produces a full double
// round-robin — every pair plays once at each venue across the two legs.
//
// The player's team is placed at position 0 so the player's match each round
// is always the first of the round's pairings (intuitive for the fixture UI).
//
// Replaces the player-only fixture loop that used to live inside
// FixtureListScreen.ts (before the game-engine refactor).

import type { Fixture } from '../types/gameState';

export function generateFixtures(playerTeamId: string, allTeamIds: string[]): Fixture[] {
  if (allTeamIds.length === 0 || allTeamIds.length % 2 !== 0) {
    throw new Error(`generateFixtures requires an even, non-zero number of teams (got ${allTeamIds.length})`);
  }
  const others = allTeamIds.filter(id => id !== playerTeamId);
  if (others.length !== allTeamIds.length - 1) {
    throw new Error(`generateFixtures: playerTeamId ${playerTeamId} not found in team list`);
  }

  // Position 0 is the fixed team (player); positions 1..n-1 rotate.
  const ring = [playerTeamId, ...others];
  const n = ring.length;
  const ringSize = n - 1;
  const matchesPerRound = n / 2;
  const roundsPerLeg = n - 1;

  const fixtures: Fixture[] = [];
  for (let leg = 0; leg < 2; leg++) {
    for (let r = 0; r < roundsPerLeg; r++) {
      const round = leg * roundsPerLeg + r + 1;
      for (let i = 0; i < matchesPerRound; i++) {
        let home: string;
        let away: string;
        if (i === 0) {
          // Fixed team (ring[0]) vs rotating[r]
          const opp = ring[1 + (r % ringSize)];
          // Alternate fixed team's venue per round inside the first leg.
          const fixedHome = r % 2 === 0;
          home = fixedHome ? ring[0] : opp;
          away = fixedHome ? opp : ring[0];
        } else {
          const aPos = 1 + ((r + i) % ringSize);
          const bPos = 1 + ((r - i + ringSize) % ringSize);
          home = ring[aPos];
          away = ring[bPos];
        }
        if (leg === 1) {
          // Reverse-leg: flip venues so each pair plays once at each ground.
          [home, away] = [away, home];
        }
        fixtures.push({ round, homeId: home, awayId: away });
      }
    }
  }
  return fixtures;
}
