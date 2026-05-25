import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { deriveFixtureSeed } from '../src/game/derive.js';
import { eventBus } from '../src/utils/eventBus.js';
import { applyStarBoost } from '../src/team/applyStarBoost.js';
import type { TeamJson } from '../src/team/teamProfile.js';
import type { RawTeamInput } from '../src/types/teamData.js';
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
const TACTIC_TYPE = process.env.TACTIC_TYPE ?? 'attackingBreakdown';
const ROOT_SEEDS_DEFAULT = [0xDEADBEEF, 0xCAFEBABE, 0xBEEFCAFE, 0xFACEFEED, 0xC0FFEE00];
const ROOT_SEEDS = process.env.ROOT_SEEDS ? ROOT_SEEDS_DEFAULT.slice(0, parseInt(process.env.ROOT_SEEDS, 10)) : ROOT_SEEDS_DEFAULT;
const COMMENTARY_CAP_HIGH = 10000;

const TACTICS_MAP: Record<string, string[]> = {
  attackingBreakdown: ['commit_numbers', 'balanced', 'minimal_ruck'],
  attackingGamePlan: ['possession', 'balanced', 'kicking'],
  backfieldDefence: ['three_back', 'two_back', 'one_back']
};

const OPTIONS = TACTICS_MAP[TACTIC_TYPE];

const BOOSTED_TEAMS = ([
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as TeamJson[]).map(applyStarBoost) as unknown as RawTeamInput[];

interface TestStats {
  played: number; wins:  number; draws: number; losses: number;
  pointsFor: number; pointsAgainst: number;
  carriesMade: number; metresCarried: number;
}

function emptyStats(): TestStats {
  return {
    played: 0, wins: 0, draws: 0, losses: 0,
    pointsFor: 0, pointsAgainst: 0,
    carriesMade: 0, metresCarried: 0,
  };
}

function withTactic(team: RawTeamInput, value: string): RawTeamInput {
  return {
    ...team,
    suggestedTactics: {
      ...team.suggestedTactics!,
      [TACTIC_TYPE]: value as any,
    },
  };
}

function runSilent(home: RawTeamInput, away: RawTeamInput, seed: number, consume: (state: MatchState) => void): Promise<void> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, { tickDelayMs: 0, seed, silent: true, commentaryBufferCap: COMMENTARY_CAP_HIGH });
    const off = eventBus.on('engine:finished', ({ state }) => { off(); consume(state); engine.destroy(); resolve(); });
    engine.initialize();
    engine.start();
  });
}

function aggregate(stats: TestStats, state: MatchState, testIsHome: boolean): void {
  stats.played++;
  const testSide = testIsHome ? 'home' : 'away';
  const oppSide  = testIsHome ? 'away' : 'home';
  const testTeam = testIsHome ? state.homeTeam : state.awayTeam;

  const testScore = state.score[testSide];
  const oppScore  = state.score[oppSide];
  if      (testScore > oppScore) stats.wins++;
  else if (testScore < oppScore) stats.losses++;
  else                            stats.draws++;
  stats.pointsFor     += testScore;
  stats.pointsAgainst += oppScore;

  const testAllPlayers = [...testTeam.players, ...testTeam.substitutedOff];
  for (const p of testAllPlayers) {
    stats.carriesMade += p.matchStats.carries;
    stats.metresCarried += p.matchStats.metresCarried;
  }
}

async function runSeasonWithOverride(testTeamId: string, overrideTactic: string, allTeams: RawTeamInput[]): Promise<TestStats> {
  const testTeamIdx = allTeams.findIndex(t => t.id === testTeamId);
  if (testTeamIdx < 0) throw new Error(`Team not found`);
  const baselineTest = allTeams[testTeamIdx];
  const overriddenTest = withTactic(baselineTest, overrideTactic);
  const stats = emptyStats();

  for (const rootSeed of ROOT_SEEDS) {
    let round = 1;
    for (const home of allTeams) {
      for (const away of allTeams) {
        if (home.id === away.id) { continue; }
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

function pct(num: number, den: number, digits = 1): string { return den === 0 ? '—' : `${(100 * num / den).toFixed(digits)}%`; }

async function main(): Promise<void> {
  console.log(`# ${TACTIC_TYPE} Compare — ${TEST_TEAM_ID.toUpperCase()}`);
  const results: Record<string, TestStats> = {};
  for (const t of OPTIONS) {
    results[t] = await runSeasonWithOverride(TEST_TEAM_ID, t, BOOSTED_TEAMS);
  }

  console.log('| tactic | W | D | L | win % | PF/g | PA/g | PD/g | m/carry |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const t of OPTIONS) {
    const s = results[t];
    const winPct = pct(s.wins, s.played);
    const pd = s.pointsFor - s.pointsAgainst;
    const pfg = (s.pointsFor / s.played).toFixed(2);
    const pag = (s.pointsAgainst / s.played).toFixed(2);
    const pdg = (pd / s.played).toFixed(2);
    const mpc = s.carriesMade > 0 ? (s.metresCarried / s.carriesMade).toFixed(2) : '0';
    console.log(`| ${t} | ${s.wins} | ${s.draws} | ${s.losses} | ${winPct} | ${pfg} | ${pag} | ${pdg} | ${mpc} |`);
  }
}
await main();
