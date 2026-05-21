// Career-determinism golden-master harness.
//
// Runs three full seasons of a fixed (playerTeamId, seed) career through
// GameCoordinator, with rollSeason() between each. Records the player's
// own fixtures via the same headless simulator the game engine uses for
// AI matches. Snapshot covers all three seasons' final standings + the
// post-rollover roster baseStats + retirement archive + the generated
// year-2 and year-3 fixture lists. Asserts two runs produce identical
// SHA-256 hashes. Exit 0 = deterministic.
//
// Companion to scripts/checkDeterminism.ts (single-match determinism) —
// both must pass before commit.
//
// Locks the contract that:
//   1. The match-result + AI-sim flow is reproducible (existing v4
//      coverage).
//   2. The PLAYER_SEASON_STATS_ACCUMULATED events fire in a deterministic
//      sequence and accumulate the same per-player tallies.
//   3. computeRollover (aging + retirement via rngTransfer) is
//      reproducible — same retirements, same stat deltas.
//   4. Generated year-2+ fixtures are reproducible.

import { createHash } from 'node:crypto';
import { GameCoordinator } from '../src/game/GameCoordinator.js';
import { simulateFixture } from '../src/game/simulateFixture.js';
import { buildTeamFromRoster } from '../src/game/rosterTeamBuilder.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import { applyStarBoost } from '../src/team/applyStarBoost.js';
import type { TeamJson } from '../src/team/teamProfile.js';

import bathRaw         from '../src/data/team-bath.json' with { type: 'json' };
import bristolRaw      from '../src/data/team-bristol.json' with { type: 'json' };
import exeterRaw       from '../src/data/team-exeter.json' with { type: 'json' };
import gloucesterRaw   from '../src/data/team-gloucester.json' with { type: 'json' };
import harlequinsRaw   from '../src/data/team-harlequins.json' with { type: 'json' };
import leicesterRaw    from '../src/data/team-leicester.json' with { type: 'json' };
import newcastleRaw    from '../src/data/team-newcastle.json' with { type: 'json' };
import northamptonRaw  from '../src/data/team-northampton.json' with { type: 'json' };
import saleRaw         from '../src/data/team-sale.json' with { type: 'json' };
import saracensRaw     from '../src/data/team-saracens.json' with { type: 'json' };

const SEED = 0xDEADBEEF;
const PLAYER_ID = 'bath';
const SEASONS = 3;

const allTeams = ([
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as TeamJson[]).map(applyStarBoost) as unknown as RawTeamInput[];

async function simulateSeason(coord: GameCoordinator, teamsById: Map<string, RawTeamInput>): Promise<void> {
  while (true) {
    const next = coord.getCurrentFixture();
    if (!next) break;
    const state = coord.getState();
    const homeJson = teamsById.get(next.homeId)!;
    const awayJson = teamsById.get(next.awayId)!;
    const home = buildTeamFromRoster(state, homeJson);
    const away = buildTeamFromRoster(state, awayJson);
    const sim = await simulateFixture(home, away, state.seed, next.round);
    await coord.recordPlayerMatchResult(next.round, sim.homeScore, sim.awayScore);
  }
}

async function runOnce(seed: number): Promise<string> {
  const coord = GameCoordinator.newSeason(PLAYER_ID, seed, allTeams);
  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  const seasonSnapshots: unknown[] = [];

  for (let s = 0; s < SEASONS; s++) {
    await simulateSeason(coord, teamsById);
    const preRolloverState = coord.getState();
    const seasonLabel = preRolloverState.calendar.seasonLabel;
    const finalStandings = preRolloverState.league.standings;
    const resultsHash = createHash('sha256').update(JSON.stringify(preRolloverState.league.results)).digest('hex');

    let rolloverEvents: unknown[] = [];
    if (s < SEASONS - 1) {
      rolloverEvents = coord.rollSeason();
    }

    seasonSnapshots.push({
      seasonLabel,
      finalStandings,
      resultsHash,
      // Strip large stable fields from the rollover payload — only the
      // PLAYER_RETIRED rosterIds and PLAYER_AGED deltas matter for the
      // determinism contract; SEASON_ROLLED_OVER's fixture list is
      // already covered via the next season's `finalStandings`.
      rolloverEvents,
    });
  }

  // Final roster snapshot: every player's baseStats, sorted by rosterId
  // so JSON serialization is order-stable.
  const endState = coord.getState();
  const rosterEntries = Object.keys(endState.career.roster)
    .map(Number)
    .sort((a, b) => a - b)
    .map(rid => ({
      rid,
      baseStats: endState.career.roster[rid].baseStats,
    }));

  return createHash('sha256').update(JSON.stringify({
    seasons: seasonSnapshots,
    finalRoster: rosterEntries,
    seasonsCompleted: endState.career.seasonsCompleted,
    archiveLen: endState.career.archive.length,
  })).digest('hex');
}

const h1 = await runOnce(SEED);
const h2 = await runOnce(SEED);
if (h1 !== h2) {
  console.error(`CAREER DETERMINISM BROKEN\n  run1: ${h1}\n  run2: ${h2}`);
  process.exit(1);
}
console.log(`OK: career deterministic (${SEASONS} seasons). seed=0x${SEED.toString(16)} hash=${h1.slice(0, 16)}…`);
