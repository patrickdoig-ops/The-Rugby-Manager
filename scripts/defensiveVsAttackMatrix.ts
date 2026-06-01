// 3 × 3 controlled experiment: defensive line × attacking style.
//
// Holds one team (Bath by default) as the defender and varies BOTH their
// defensiveLine AND every opponent's attackingStyle. Reports Bath's win
// rate, PF, PA, and tries conceded for each of the 9 cells.
//
// Surfaces the real-world interactions:
//   * blitz vs keep_it_tight  — does blitz crush crash balls?
//   * drift vs wide_wide      — does drift shut down expansive attacks?
//   * blitz vs wide_wide      — does blitz suffer most when beaten wide?
//   * etc.
//
// Usage:
//   npx tsx scripts/defensiveVsAttackMatrix.ts
//   TEST_TEAM=saracens npx tsx scripts/defensiveVsAttackMatrix.ts
//   ATT_DIMENSION=attackingGamePlan npx tsx scripts/defensiveVsAttackMatrix.ts
//   ROOT_SEEDS=2       npx tsx scripts/defensiveVsAttackMatrix.ts  (faster)

import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { deriveFixtureSeed } from '../src/game/derive.js';
import { eventBus } from '../src/utils/eventBus.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { DefensiveLine, AttackingStyle, AttackingGamePlan, AttackingBreakdown } from '../src/types/team.js';
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

type AttackingDimension = 'attackingStyle' | 'attackingGamePlan' | 'attackingBreakdown';
type AttackingValue = AttackingStyle | AttackingGamePlan | AttackingBreakdown;

const TEST_TEAM_ID = (process.env.TEST_TEAM ?? 'bath').toLowerCase();
const ATT_DIMENSION = (process.env.ATT_DIMENSION ?? 'attackingStyle') as AttackingDimension;
const ROOT_SEEDS_DEFAULT = [0xDEADBEEF, 0xCAFEBABE, 0xBEEFCAFE, 0xFACEFEED, 0xC0FFEE00];
const ROOT_SEEDS = process.env.ROOT_SEEDS
  ? ROOT_SEEDS_DEFAULT.slice(0, parseInt(process.env.ROOT_SEEDS, 10))
  : ROOT_SEEDS_DEFAULT;
const COMMENTARY_CAP_HIGH = 10000;

const DEF_TACTICS: DefensiveLine[] = ['blitz', 'hybrid', 'drift'];
const ATT_VALUES_BY_DIM: Record<AttackingDimension, readonly AttackingValue[]> = {
  attackingStyle:     ['keep_it_tight', 'balanced', 'wide_wide'],
  attackingGamePlan:  ['possession', 'balanced', 'kicking'],
  attackingBreakdown: ['commit_numbers', 'balanced', 'minimal_ruck'],
};
const ATT_VALUES = ATT_VALUES_BY_DIM[ATT_DIMENSION];

const BOOSTED_TEAMS = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

interface CellStats {
  played: number;
  wins:   number;
  draws:  number;
  losses: number;
  pointsFor:     number;
  pointsAgainst: number;
  triesScored:   number;
  triesConceded: number;
  lineBreaksConceded: number;
}

function emptyCell(): CellStats {
  return {
    played: 0, wins: 0, draws: 0, losses: 0,
    pointsFor: 0, pointsAgainst: 0,
    triesScored: 0, triesConceded: 0,
    lineBreaksConceded: 0,
  };
}

function withDefensiveLine(team: RawTeamInput, dl: DefensiveLine): RawTeamInput {
  return { ...team, suggestedTactics: { ...team.suggestedTactics!, defensiveLine: dl } };
}

function withAttackingOverride(team: RawTeamInput, dim: AttackingDimension, val: AttackingValue): RawTeamInput {
  return { ...team, suggestedTactics: { ...team.suggestedTactics!, [dim]: val } };
}

function runSilent(home: RawTeamInput, away: RawTeamInput, seed: number, consume: (state: MatchState) => void): Promise<void> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, {
      tickDelayMs: 0, seed, silent: true,
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

function aggregate(c: CellStats, state: MatchState, testIsHome: boolean): void {
  c.played++;
  const testSide = testIsHome ? 'home' : 'away';
  const oppSide  = testIsHome ? 'away' : 'home';
  const testTeam = testIsHome ? state.homeTeam : state.awayTeam;
  const oppTeam  = testIsHome ? state.awayTeam : state.homeTeam;

  const testScore = state.score[testSide];
  const oppScore  = state.score[oppSide];
  if      (testScore > oppScore) c.wins++;
  else if (testScore < oppScore) c.losses++;
  else                            c.draws++;
  c.pointsFor     += testScore;
  c.pointsAgainst += oppScore;
  c.triesScored   += state.stats.tries[testSide];
  c.triesConceded += state.stats.tries[oppSide];

  void testTeam;
  for (const p of [...oppTeam.players, ...oppTeam.substitutedOff]) {
    c.lineBreaksConceded += p.matchStats.lineBreaks;
  }
}

async function runCell(testTeamId: string, def: DefensiveLine, attDim: AttackingDimension, attVal: AttackingValue): Promise<CellStats> {
  const testIdx = BOOSTED_TEAMS.findIndex(t => t.id === testTeamId);
  if (testIdx < 0) throw new Error(`Team not found: ${testTeamId}`);
  const overriddenTest = withDefensiveLine(BOOSTED_TEAMS[testIdx], def);

  // Build the schedule with every team's attacking dimension forced to attVal,
  // EXCEPT the test team (we only change their defensiveLine).
  const schedule: RawTeamInput[] = BOOSTED_TEAMS.map(t =>
    t.id === testTeamId
      ? overriddenTest
      : withAttackingOverride(t, attDim, attVal),
  );

  const stats = emptyCell();

  for (const rootSeed of ROOT_SEEDS) {
    let round = 1;
    for (const home of schedule) {
      for (const away of schedule) {
        if (home.id === away.id) { continue; }
        const fixtureSeed = deriveFixtureSeed(rootSeed, round++, home.id, away.id);
        if (home.id !== testTeamId && away.id !== testTeamId) continue;
        await runSilent(home, away, fixtureSeed, state => {
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
  console.log(`# defensiveLine × ${ATT_DIMENSION} — ${TEST_TEAM_ID.toUpperCase()}`);
  console.log('');
  console.log(`Holding ${TEST_TEAM_ID}'s defensiveLine + every opponent's ${ATT_DIMENSION} as the two variables.`);
  console.log(`Root seeds: ${ROOT_SEEDS.length} · fixtures per cell: 18 × ${ROOT_SEEDS.length} = ${18 * ROOT_SEEDS.length}`);
  console.log('');

  const t0 = Date.now();
  const matrix: Record<string, Record<string, CellStats>> = {};
  for (const def of DEF_TACTICS) {
    matrix[def] = {};
    for (const att of ATT_VALUES) {
      matrix[def][att] = await runCell(TEST_TEAM_ID, def, ATT_DIMENSION, att);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Elapsed: ${elapsed}s`);
  console.log('');

  // ── Win % matrix ───────────────────────────────────────────────────────
  console.log(`## Win % — rows: ${TEST_TEAM_ID}'s defensiveLine · columns: opposition's ${ATT_DIMENSION}`);
  console.log('');
  console.log(`| def \\ att | ${ATT_VALUES.join(' | ')} | avg |`);
  console.log(`|---|${ATT_VALUES.map(() => '---:').join('|')}|---:|`);
  for (const def of DEF_TACTICS) {
    const cells = ATT_VALUES.map(att => matrix[def][att]);
    const winPcts = cells.map(c => pct(c.wins, c.played));
    const avgWinPct = cells.reduce((s, c) => s + c.wins, 0) / cells.reduce((s, c) => s + c.played, 0);
    console.log(`| **${def}** | ${winPcts.join(' | ')} | **${(100 * avgWinPct).toFixed(1)}%** |`);
  }
  // column averages
  const colAvgs = ATT_VALUES.map(att => {
    const cells = DEF_TACTICS.map(d => matrix[d][att]);
    return cells.reduce((s, c) => s + c.wins, 0) / cells.reduce((s, c) => s + c.played, 0);
  });
  console.log(`| **avg** | ${colAvgs.map(a => `**${(100 * a).toFixed(1)}%**`).join(' | ')} | |`);
  console.log('');

  // ── PA matrix ──────────────────────────────────────────────────────────
  console.log(`## PA / g — points conceded per game (lower = better defence)`);
  console.log('');
  console.log(`| def \\ att | ${ATT_VALUES.join(' | ')} |`);
  console.log(`|---|${ATT_VALUES.map(() => '---:').join('|')}|`);
  for (const def of DEF_TACTICS) {
    const pas = ATT_VALUES.map(att => {
      const c = matrix[def][att];
      return (c.pointsAgainst / c.played).toFixed(1);
    });
    console.log(`| **${def}** | ${pas.join(' | ')} |`);
  }
  console.log('');

  // ── Tries conceded / g ─────────────────────────────────────────────────
  console.log(`## Tries conceded / g`);
  console.log('');
  console.log(`| def \\ att | ${ATT_VALUES.join(' | ')} |`);
  console.log(`|---|${ATT_VALUES.map(() => '---:').join('|')}|`);
  for (const def of DEF_TACTICS) {
    const tries = ATT_VALUES.map(att => {
      const c = matrix[def][att];
      return (c.triesConceded / c.played).toFixed(2);
    });
    console.log(`| **${def}** | ${tries.join(' | ')} |`);
  }
  console.log('');

  // ── Line breaks conceded / g ───────────────────────────────────────────
  console.log(`## Line breaks conceded / g`);
  console.log('');
  console.log(`| def \\ att | ${ATT_VALUES.join(' | ')} |`);
  console.log(`|---|${ATT_VALUES.map(() => '---:').join('|')}|`);
  for (const def of DEF_TACTICS) {
    const lbs = ATT_VALUES.map(att => {
      const c = matrix[def][att];
      return (c.lineBreaksConceded / c.played).toFixed(2);
    });
    console.log(`| **${def}** | ${lbs.join(' | ')} |`);
  }
  console.log('');

  // ── Net effect summary ─────────────────────────────────────────────────
  console.log(`## Interaction signal`);
  console.log('');
  console.log(`For each ${ATT_DIMENSION}, which defensiveLine performs best (lowest PA/g)?`);
  console.log('');
  for (const att of ATT_VALUES) {
    const ranked = DEF_TACTICS
      .map(def => ({ def, pa: matrix[def][att].pointsAgainst / matrix[def][att].played }))
      .sort((a, b) => a.pa - b.pa);
    const ranks = ranked.map(r => `${r.def} (${r.pa.toFixed(1)})`).join(' < ');
    console.log(`* vs **${att}**: ${ranks}`);
  }
}

await main();
