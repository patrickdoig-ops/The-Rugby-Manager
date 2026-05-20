// Season-determinism golden-master harness.
//
// Runs a fixed (playerTeamId, seed) season through GameCoordinator twice,
// recording the player's own fixtures via the same headless simulator the
// game engine uses for AI matches. Asserts the two final standings + result
// arrays produce identical SHA-256 hashes. Exit 0 = deterministic.
//
// Companion to scripts/checkDeterminism.ts (single-match determinism) — both
// must pass before commit.

import { createHash } from 'node:crypto';
import { GameCoordinator } from '../src/game/GameCoordinator.js';
import { simulateFixture } from '../src/game/simulateFixture.js';
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

const allTeams = ([
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as TeamJson[]).map(applyStarBoost) as unknown as RawTeamInput[];

async function runOnce(seed: number): Promise<string> {
  const coord = GameCoordinator.newSeason(PLAYER_ID, seed, allTeams);
  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  while (true) {
    const next = coord.getCurrentFixture();
    if (!next) break;
    const home = teamsById.get(next.homeId)!;
    const away = teamsById.get(next.awayId)!;
    const sim = await simulateFixture(home, away, coord.getState().seed, next.round);
    await coord.recordPlayerMatchResult(next.round, sim.homeScore, sim.awayScore);
  }

  const state = coord.getState();
  const snapshot = {
    week: state.calendar.week,
    date: state.calendar.date,
    results: state.league.results,
    standings: state.league.standings,
  };
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

const h1 = await runOnce(SEED);
const h2 = await runOnce(SEED);
if (h1 !== h2) {
  console.error(`SEASON DETERMINISM BROKEN\n  run1: ${h1}\n  run2: ${h2}`);
  process.exit(1);
}
console.log(`OK: season deterministic. seed=0x${SEED.toString(16)} hash=${h1.slice(0, 16)}…`);
