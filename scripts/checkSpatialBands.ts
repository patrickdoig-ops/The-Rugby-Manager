// Spatial-band acceptance checker (Upgrade.md § 13).
//
// Runs a subset of the telemetry fixture pool and asserts that every frozen
// metric in spatialBaselines.ts remains within its acceptance band. Exits
// non-zero naming the first offending metric if any band is violated.
//
// Speed: in `npm run verify` mode (default) the first 3 root seeds (270
// fixtures) are used so the full verify run stays fast while the sample is
// representative — a single 90-fixture seed is too noisy for the rare-event
// metrics (points sits right on its floor post-velocity-fix; one seed can dip
// below on sampling noise alone), and 2 seeds proved too noisy once the WP2
// carry-watchability fixes nudged penalties/home-win/tackles to sit nearer
// their band edges — 3 seeds is the stable fast-mode sample. Pass --all-seeds
// or set CHECK_ALL_SEEDS=1 to run all 5 seeds (450 fixtures), as CI does.
//
// Reuses the MatchCoordinator + eventBus simulation path from telemetry.ts
// (the same runSilent pattern). Does NOT duplicate the simulation driver.

import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { deriveFixtureSeed } from '../src/game/derive.js';
import { eventBus } from '../src/utils/eventBus.js';
import { setInvariantsEnabled } from '../src/utils/invariantsMode.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { MatchState } from '../src/types/match.js';

import {
  BASELINE_TRIES_PER_MATCH,     BAND_TRIES_PER_MATCH,
  BASELINE_POINTS_PER_MATCH,    BAND_POINTS_PER_MATCH,
  BASELINE_PENALTIES_PER_MATCH, BAND_PENALTIES_PER_MATCH,
  BASELINE_TACKLES_ATT_PER_MATCH,  BAND_TACKLES_ATT_PER_MATCH,
  BASELINE_TACKLES_MADE_PER_MATCH, BAND_TACKLES_MADE_PER_MATCH,
  BASELINE_CARRIES_PER_MATCH,   BAND_CARRIES_PER_MATCH,
  BASELINE_TURNOVERS_PER_MATCH, BAND_TURNOVERS_PER_MATCH,
  BASELINE_KNOCKONS_PER_MATCH,  BAND_KNOCKONS_PER_MATCH,
  BASELINE_HOME_WIN_SHARE_PCT,  BAND_HOME_WIN_SHARE_PCT,
} from './spatialBaselines.js';

import bathRaw        from '../src/data/team-bath.json'        with { type: 'json' };
import bristolRaw     from '../src/data/team-bristol.json'     with { type: 'json' };
import exeterRaw      from '../src/data/team-exeter.json'      with { type: 'json' };
import gloucesterRaw  from '../src/data/team-gloucester.json'  with { type: 'json' };
import harlequinsRaw  from '../src/data/team-harlequins.json'  with { type: 'json' };
import leicesterRaw   from '../src/data/team-leicester.json'   with { type: 'json' };
import newcastleRaw   from '../src/data/team-newcastle.json'   with { type: 'json' };
import northamptonRaw from '../src/data/team-northampton.json' with { type: 'json' };
import saleRaw        from '../src/data/team-sale.json'        with { type: 'json' };
import saracensRaw    from '../src/data/team-saracens.json'    with { type: 'json' };

// Tuning runs are correctness-checked elsewhere. Skip the per-event tripwire
// sweep so the band check stays fast.
setInvariantsEnabled(false);

const ALL_TEAMS = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

const ALL_SEEDS = [0xDEADBEEF, 0xCAFEBABE, 0xBEEFCAFE, 0xFACEFEED, 0xC0FFEE00];

const allSeeds = process.argv.includes('--all-seeds') || process.env['CHECK_ALL_SEEDS'] === '1';
const SEEDS = allSeeds ? ALL_SEEDS : ALL_SEEDS.slice(0, 3);

// ── Minimal per-match aggregator ─────────────────────────────────────────

interface MatchAgg {
  tries: number;
  points: number;
  penalties: number;
  tacklesAtt: number;
  tacklesMade: number;
  carries: number;
  turnovers: number;
  knockOns: number;
  homeWin: boolean;
}

function extractMatch(state: MatchState, homeIsHome: boolean): MatchAgg {
  const homeScore = state.score.home;
  const awayScore = state.score.away;

  let tries = 0;
  let penalties = 0;
  let tacklesAtt = 0;
  let tacklesMade = 0;
  let carries = 0;
  let turnovers = 0;
  let knockOns = 0;

  const allPlayers = [
    ...state.homeTeam.players, ...state.homeTeam.substitutedOff,
    ...state.awayTeam.players, ...state.awayTeam.substitutedOff,
  ];
  for (const p of allPlayers) {
    tries        += p.matchStats.tries;
    penalties    += p.matchStats.penaltiesConceded;
    tacklesAtt   += p.matchStats.tacklesAttempted;
    tacklesMade  += p.matchStats.tacklesMade;
    carries      += p.matchStats.carries;
    turnovers    += p.matchStats.turnoversWon;
    knockOns     += p.matchStats.knockOns;
  }

  return {
    tries,
    points: homeScore + awayScore,
    penalties,
    tacklesAtt,
    tacklesMade,
    carries,
    turnovers,
    knockOns,
    homeWin: homeScore > awayScore,
  };
}

// ── Simulation driver (same pattern as telemetry.ts runSilent) ────────────

function runSilent(home: RawTeamInput, away: RawTeamInput, seed: number): Promise<MatchState> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, {
      tickDelayMs: 0,
      seed,
      silent: true,
    });
    const off = eventBus.on('engine:finished', ({ state }) => {
      off();
      engine.destroy();
      resolve(state);
    });
    engine.initialize();
    engine.start();
  });
}

async function runSeason(rootSeed: number): Promise<MatchAgg[]> {
  const results: MatchAgg[] = [];
  let round = 1;
  for (const home of ALL_TEAMS) {
    for (const away of ALL_TEAMS) {
      if (home.id === away.id) continue;
      const seed = deriveFixtureSeed(rootSeed, round++, home.id, away.id);
      const state = await runSilent(home, away, seed);
      results.push(extractMatch(state, true));
    }
  }
  return results;
}

// ── Band assertion ────────────────────────────────────────────────────────

function check(label: string, measured: number, baseline: number, band: number): string | null {
  const lo = baseline - band;
  const hi = baseline + band;
  if (measured < lo || measured > hi) {
    return `${label}: measured ${measured.toFixed(2)} outside band [${lo.toFixed(2)}, ${hi.toFixed(2)}] (baseline ${baseline} ± ${band})`;
  }
  return null;
}

// ── Entry point ──────────────────────────────────────────────────────────

const t0 = Date.now();
const allResults: MatchAgg[] = [];
for (const seed of SEEDS) {
  allResults.push(...await runSeason(seed));
}
const elapsed = Date.now() - t0;

const N = allResults.length;
const mean = (fn: (m: MatchAgg) => number) => allResults.reduce((s, m) => s + fn(m), 0) / N;

const triesPerMatch    = mean(m => m.tries);
const pointsPerMatch   = mean(m => m.points);
const penPerMatch      = mean(m => m.penalties);
const tackAttPerMatch  = mean(m => m.tacklesAtt);
const tackMadePerMatch = mean(m => m.tacklesMade);
const carriesPerMatch  = mean(m => m.carries);
const toPerMatch       = mean(m => m.turnovers);
const koPerMatch       = mean(m => m.knockOns);
const homeWinPct       = 100 * allResults.filter(m => m.homeWin).length / N;

const failures: string[] = [];

const f = (label: string, measured: number, baseline: number, band: number) => {
  const err = check(label, measured, baseline, band);
  if (err) failures.push(err);
};

f('tries/match',            triesPerMatch,    BASELINE_TRIES_PER_MATCH,        BAND_TRIES_PER_MATCH);
f('points/match',           pointsPerMatch,   BASELINE_POINTS_PER_MATCH,       BAND_POINTS_PER_MATCH);
f('penalties/match',        penPerMatch,      BASELINE_PENALTIES_PER_MATCH,     BAND_PENALTIES_PER_MATCH);
f('tackles-attempted/match', tackAttPerMatch, BASELINE_TACKLES_ATT_PER_MATCH,  BAND_TACKLES_ATT_PER_MATCH);
f('tackles-made/match',     tackMadePerMatch, BASELINE_TACKLES_MADE_PER_MATCH,  BAND_TACKLES_MADE_PER_MATCH);
f('carries/match',          carriesPerMatch,  BASELINE_CARRIES_PER_MATCH,       BAND_CARRIES_PER_MATCH);
f('turnovers/match',        toPerMatch,       BASELINE_TURNOVERS_PER_MATCH,     BAND_TURNOVERS_PER_MATCH);
f('knock-ons/match',        koPerMatch,       BASELINE_KNOCKONS_PER_MATCH,      BAND_KNOCKONS_PER_MATCH);
f('home-win-share%',        homeWinPct,       BASELINE_HOME_WIN_SHARE_PCT,      BAND_HOME_WIN_SHARE_PCT);

const seedsLabel = allSeeds ? `5 seeds (${N} fixtures)` : `3 seeds (${N} fixtures, fast mode)`;
// Always surface the full metric readout — invaluable when a WP re-baseline pushes
// a band and you need to see every number, not just the first offender.
console.log(`  tries=${triesPerMatch.toFixed(2)}  pts=${pointsPerMatch.toFixed(2)}  pen=${penPerMatch.toFixed(2)}  tackAtt=${tackAttPerMatch.toFixed(2)}  tackMade=${tackMadePerMatch.toFixed(2)}`);
console.log(`  carries=${carriesPerMatch.toFixed(2)}  TO=${toPerMatch.toFixed(2)}  KO=${koPerMatch.toFixed(2)}  homeWin%=${homeWinPct.toFixed(2)}`);
if (failures.length === 0) {
  console.log(`OK: all § 13 spatial bands pass — ${seedsLabel} in ${elapsed} ms`);
} else {
  console.error(`SPATIAL BAND VIOLATION — ${failures.length} metric(s) out of band (${seedsLabel}):`);
  for (const err of failures) console.error(`  ✗ ${err}`);
  process.exit(1);
}
