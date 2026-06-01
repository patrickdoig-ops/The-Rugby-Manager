// Controlled experiment: hold every variable fixed except ONE team's
// defensiveLine, and observe the win rate, PF, PA, tries, line breaks,
// dominant tackles, interceptions. Run the test team's full schedule
// (18 fixtures per seed × N seeds) three times — once as blitz, once as
// hybrid, once as drift — and report the delta.
//
// Fairness:
//   * Same root seed list → identical deriveFixtureSeed(rootSeed, round,
//     home, away) per fixture.
//   * Same opponents with their own authored tactics unchanged.
//   * Star-boost runs once before the override (so the override doesn't
//     re-boost).
//   * Only the test team's suggestedTactics.defensiveLine differs across
//     the three runs.
//
// Usage:
//   npx tsx scripts/defensiveLineCompare.ts            (defaults to 'bath')
//   TEST_TEAM=saracens npx tsx scripts/defensiveLineCompare.ts
//   ROOT_SEEDS=1 npx tsx scripts/defensiveLineCompare.ts (single-seed run)

import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { deriveFixtureSeed } from '../src/game/derive.js';
import { eventBus } from '../src/utils/eventBus.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { DefensiveLine } from '../src/types/team.js';
import type { MatchState } from '../src/types/match.js';

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

const TEST_TEAM_ID = (process.env.TEST_TEAM ?? 'bath').toLowerCase();
const ROOT_SEEDS_DEFAULT = [0xDEADBEEF, 0xCAFEBABE, 0xBEEFCAFE, 0xFACEFEED, 0xC0FFEE00];
const ROOT_SEEDS = process.env.ROOT_SEEDS
  ? ROOT_SEEDS_DEFAULT.slice(0, parseInt(process.env.ROOT_SEEDS, 10))
  : ROOT_SEEDS_DEFAULT;
const COMMENTARY_CAP_HIGH = 10000;
const DEFENSIVE_LINES: DefensiveLine[] = ['blitz', 'hybrid', 'drift'];

const BOOSTED_TEAMS = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

interface TestStats {
  played: number;
  wins:  number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  triesScored: number;
  triesConceded: number;
  lineBreaksMade: number;
  lineBreaksConceded: number;
  dominantTacklesMade: number;
  carriesConceded: number;
  metresCarriedConceded: number;
  turnoversWon: number;    // includes interceptions (reused field)
  knockOnsConceded: number; // attacker's knock-ons against this defence
}

function emptyStats(): TestStats {
  return {
    played: 0, wins: 0, draws: 0, losses: 0,
    pointsFor: 0, pointsAgainst: 0,
    triesScored: 0, triesConceded: 0,
    lineBreaksMade: 0, lineBreaksConceded: 0,
    dominantTacklesMade: 0,
    carriesConceded: 0, metresCarriedConceded: 0,
    turnoversWon: 0, knockOnsConceded: 0,
  };
}

// Clone one team's RawTeamInput with a different defensiveLine. Deep-clones
// only the suggestedTactics block (everything else stays referentially
// shared with the original boosted team, which is fine because the engine
// only reads from it).
function withDefensiveLine(team: RawTeamInput, dl: DefensiveLine): RawTeamInput {
  return {
    ...team,
    suggestedTactics: {
      ...team.suggestedTactics!,
      defensiveLine: dl,
    },
  };
}

function runSilent(home: RawTeamInput, away: RawTeamInput, seed: number, consume: (state: MatchState) => void): Promise<void> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, {
      tickDelayMs: 0,
      seed,
      silent: true,
      commentaryBufferCap: COMMENTARY_CAP_HIGH,
    });
    const off = eventBus.on('engine:finished', ({ state }) => {
      off();
      consume(state);
      engine.destroy();
      resolve();
    });
    engine.initialize();
    engine.start();
  });
}

function aggregate(stats: TestStats, state: MatchState, testIsHome: boolean): void {
  stats.played++;

  const testSide = testIsHome ? 'home' : 'away';
  const oppSide  = testIsHome ? 'away' : 'home';
  const testTeam = testIsHome ? state.homeTeam : state.awayTeam;
  const oppTeam  = testIsHome ? state.awayTeam : state.homeTeam;

  const testScore = state.score[testSide];
  const oppScore  = state.score[oppSide];
  if      (testScore > oppScore) stats.wins++;
  else if (testScore < oppScore) stats.losses++;
  else                            stats.draws++;
  stats.pointsFor     += testScore;
  stats.pointsAgainst += oppScore;
  stats.triesScored   += state.stats.tries[testSide];
  stats.triesConceded += state.stats.tries[oppSide];

  const testAllPlayers = [...testTeam.players, ...testTeam.substitutedOff];
  const oppAllPlayers  = [...oppTeam.players,  ...oppTeam.substitutedOff];
  for (const p of testAllPlayers) {
    stats.lineBreaksMade      += p.matchStats.lineBreaks;
    stats.dominantTacklesMade += p.matchStats.dominantTackles;
    stats.turnoversWon        += p.matchStats.turnoversWon;
  }
  for (const p of oppAllPlayers) {
    stats.lineBreaksConceded     += p.matchStats.lineBreaks;
    stats.carriesConceded        += p.matchStats.carries;
    stats.metresCarriedConceded  += p.matchStats.metresCarried;
    stats.knockOnsConceded       += p.matchStats.knockOns;
  }
}

async function runSeasonWithOverride(testTeamId: string, overrideTactic: DefensiveLine, allTeams: RawTeamInput[]): Promise<TestStats> {
  // Replace the test team in the all-teams array.
  const testTeamIdx = allTeams.findIndex(t => t.id === testTeamId);
  if (testTeamIdx < 0) throw new Error(`Team not found: ${testTeamId}`);
  const baselineTest = allTeams[testTeamIdx];
  const overriddenTest = withDefensiveLine(baselineTest, overrideTactic);
  const others = allTeams.filter(t => t.id !== testTeamId);

  const stats = emptyStats();

  for (const rootSeed of ROOT_SEEDS) {
    // Reproduce the same round-by-round fixture order as the main telemetry
    // (round = home_idx*9 + away_idx_within_others + offset). We only run
    // the fixtures involving the test team. We use the SAME deriveFixtureSeed
    // as the full season would, so the rng pattern is identical.
    let round = 1;
    for (const home of allTeams) {
      for (const away of allTeams) {
        if (home.id === away.id) { continue; }
        // Same seed regardless of which team is overridden.
        const fixtureSeed = deriveFixtureSeed(rootSeed, round++, home.id, away.id);
        if (home.id !== testTeamId && away.id !== testTeamId) continue;
        const homeRun = home.id === testTeamId ? overriddenTest : home;
        const awayRun = away.id === testTeamId ? overriddenTest : away;
        await runSilent(homeRun, awayRun, fixtureSeed, state => {
          aggregate(stats, state, home.id === testTeamId);
        });
      }
    }
  }

  return stats;
}

function pct(num: number, den: number, digits = 1): string {
  return den === 0 ? '—' : `${(100 * num / den).toFixed(digits)}%`;
}

async function main(): Promise<void> {
  console.log(`# defensiveLine Compare — ${TEST_TEAM_ID.toUpperCase()}`);
  console.log('');
  console.log(`Holding all variables fixed except ${TEST_TEAM_ID}'s defensiveLine.`);
  console.log(`Root seeds: ${ROOT_SEEDS.map(s => `0x${s.toString(16)}`).join(', ')}`);
  console.log(`Fixtures per tactic: 18 × ${ROOT_SEEDS.length} = ${18 * ROOT_SEEDS.length}`);
  console.log('');

  const t0 = Date.now();
  const results: Record<DefensiveLine, TestStats> = {} as Record<DefensiveLine, TestStats>;
  for (const dl of DEFENSIVE_LINES) {
    results[dl] = await runSeasonWithOverride(TEST_TEAM_ID, dl, BOOSTED_TEAMS);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`Elapsed: ${elapsed}s`);
  console.log('');

  console.log('## Results — controlled comparison');
  console.log('');
  console.log('| defensiveLine | W | D | L | win % | PF | PA | PD |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const dl of DEFENSIVE_LINES) {
    const s = results[dl];
    const winPct = pct(s.wins, s.played);
    const pd = s.pointsFor - s.pointsAgainst;
    console.log(`| ${dl} | ${s.wins} | ${s.draws} | ${s.losses} | ${winPct} | ${s.pointsFor} | ${s.pointsAgainst} | ${pd >= 0 ? '+' : ''}${pd} |`);
  }
  console.log('');

  console.log('## Attacking output (this team)');
  console.log('');
  console.log('| defensiveLine | tries/g | line breaks/g | turnovers won/g |');
  console.log('|---|---:|---:|---:|');
  for (const dl of DEFENSIVE_LINES) {
    const s = results[dl];
    const games = Math.max(1, s.played);
    console.log(`| ${dl} | ${(s.triesScored/games).toFixed(2)} | ${(s.lineBreaksMade/games).toFixed(2)} | ${(s.turnoversWon/games).toFixed(2)} |`);
  }
  console.log('');

  console.log('## Defensive output (opposition\'s attack)');
  console.log('');
  console.log('| defensiveLine | tries conceded/g | LB conceded/g | dom tackles made/g | knock-ons forced/g | m/carry conceded |');
  console.log('|---|---:|---:|---:|---:|---:|');
  for (const dl of DEFENSIVE_LINES) {
    const s = results[dl];
    const games = Math.max(1, s.played);
    const mpc = s.carriesConceded > 0 ? s.metresCarriedConceded / s.carriesConceded : 0;
    console.log(`| ${dl} | ${(s.triesConceded/games).toFixed(2)} | ${(s.lineBreaksConceded/games).toFixed(2)} | ${(s.dominantTacklesMade/games).toFixed(2)} | ${(s.knockOnsConceded/games).toFixed(2)} | ${mpc.toFixed(2)} |`);
  }
  console.log('');

  console.log('## Net effect');
  console.log('');
  console.log('Differences vs hybrid baseline:');
  console.log('');
  const hybrid = results.hybrid;
  for (const dl of DEFENSIVE_LINES) {
    if (dl === 'hybrid') continue;
    const s = results[dl];
    const winDelta = (100 * s.wins / s.played) - (100 * hybrid.wins / hybrid.played);
    const pfDelta = (s.pointsFor / s.played) - (hybrid.pointsFor / hybrid.played);
    const paDelta = (s.pointsAgainst / s.played) - (hybrid.pointsAgainst / hybrid.played);
    console.log(`* **${dl}**: win % ${winDelta >= 0 ? '+' : ''}${winDelta.toFixed(1)} pp · PF/g ${pfDelta >= 0 ? '+' : ''}${pfDelta.toFixed(2)} · PA/g ${paDelta >= 0 ? '+' : ''}${paDelta.toFixed(2)}`);
  }
}

await main();
