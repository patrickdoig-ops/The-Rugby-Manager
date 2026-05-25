// One-off injury-rate audit. Runs a full league season per root seed
// (5 seeds × 90 fixtures = 450 matches), counts in-match injuries from
// `state.cards.injured`, and reports per-match averages + kind / position
// distributions. Calibration target per `src/engine/balance/injuries.ts`:
// ~1.5 injuries per match across both teams (~14/club/18-round season).
//
// Not part of `npm run verify` — diagnostic only. Run with:
//   npx tsx scripts/injuryAudit.ts
//
// Mirrors scripts/telemetry.ts's silent-match harness exactly so the
// boost / seed / determinism chain is identical to telemetry + the live app.

import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { deriveFixtureSeed } from '../src/game/derive.js';
import { eventBus } from '../src/utils/eventBus.js';
import { applyStarBoost } from '../src/team/applyStarBoost.js';
import type { TeamJson } from '../src/team/teamProfile.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { MatchState } from '../src/types/match.js';
import type { InjuryKind, Position } from '../src/types/player.js';

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

const ROOT_SEEDS = [0xDEADBEEF, 0xCAFEBABE, 0xBEEFCAFE, 0xFACEFEED, 0xC0FFEE00];

const ALL_TEAMS = ([
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as TeamJson[]).map(applyStarBoost) as unknown as RawTeamInput[];

interface MatchInjuryRow {
  total: number;
  byKind: Partial<Record<InjuryKind, number>>;
  byPosition: Partial<Record<Position, number>>;
  matchMinutes: number; // game minute at full-time (~80–85)
}

function runSilent(home: RawTeamInput, away: RawTeamInput, seed: number, consume: (state: MatchState) => void): Promise<void> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, {
      tickDelayMs: 0,
      seed,
      silent: true,
      commentaryBufferCap: 10000,
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

function collect(state: MatchState): MatchInjuryRow {
  const row: MatchInjuryRow = {
    total: 0,
    byKind: {},
    byPosition: {},
    matchMinutes: state.clock.gameMinute,
  };
  // Walk the full events log for `injury_off` narration steps. We cannot
  // just count state.cards.injured at full-time because forced-substituted
  // injured players are stripped from that list by SUBSTITUTION_APPLIED
  // (so the off-the-field injured player doesn't survive in cards.injured
  // and the count would be a severe undercount).
  for (const ev of state.events) {
    for (const step of ev.narration.steps) {
      if (step.kind === 'announcement' && step.key === 'injury_off') {
        row.total++;
        const victim = step.primary;
        if (victim) {
          const kind = victim.pendingInjuryKind;
          if (kind) row.byKind[kind] = (row.byKind[kind] ?? 0) + 1;
          row.byPosition[victim.position] = (row.byPosition[victim.position] ?? 0) + 1;
        }
      }
    }
  }
  return row;
}

function meanStddev(values: number[]): { mean: number; stddev: number; min: number; max: number } {
  if (values.length === 0) return { mean: 0, stddev: 0, min: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return {
    mean,
    stddev: Math.sqrt(variance),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function histogram(values: number[]): Map<number, number> {
  const h = new Map<number, number>();
  for (const v of values) h.set(v, (h.get(v) ?? 0) + 1);
  return h;
}

async function main(): Promise<void> {
  const allRows: MatchInjuryRow[] = [];

  for (const rootSeed of ROOT_SEEDS) {
    let round = 1;
    for (const home of ALL_TEAMS) {
      for (const away of ALL_TEAMS) {
        if (home.id === away.id) continue;
        const seed = deriveFixtureSeed(rootSeed, round++, home.id, away.id);
        await runSilent(home, away, seed, state => {
          allRows.push(collect(state));
        });
      }
    }
  }

  const N = allRows.length;
  const totals = allRows.map(r => r.total);
  const { mean, stddev, min, max } = meanStddev(totals);

  console.log('# Injury Audit');
  console.log();
  console.log(`Fixtures: **${N}** (${ROOT_SEEDS.length} seasons × 90 fixtures)`);
  console.log(`Target (balance/injuries.ts header): **~1.5 injuries / match** combined`);
  console.log();
  console.log('## Per-match injury totals (both teams combined)');
  console.log();
  console.log(`- Mean ± stddev: **${mean.toFixed(2)} ± ${stddev.toFixed(2)}**`);
  console.log(`- Min / Max: ${min} / ${max}`);
  console.log(`- Total injuries across audit: ${totals.reduce((a, b) => a + b, 0)}`);
  console.log();

  const hist = histogram(totals);
  const keys = [...hist.keys()].sort((a, b) => a - b);
  console.log('## Distribution (matches by injury count)');
  console.log();
  console.log('| Injuries | Matches | % |');
  console.log('|---|---|---|');
  for (const k of keys) {
    const c = hist.get(k)!;
    console.log(`| ${k} | ${c} | ${(100 * c / N).toFixed(1)}% |`);
  }
  console.log();

  // Kind breakdown
  const kindTotals: Record<string, number> = {};
  for (const r of allRows) {
    for (const [k, v] of Object.entries(r.byKind)) {
      kindTotals[k] = (kindTotals[k] ?? 0) + (v ?? 0);
    }
  }
  const totalInjuries = Object.values(kindTotals).reduce((a, b) => a + b, 0);
  console.log('## Injury kind distribution');
  console.log();
  console.log('| Kind | Count | % of injuries | Target % (balance file) |');
  console.log('|---|---|---|---|');
  const targets: Record<string, number> = {
    muscle_strain: 22, ligament_sprain: 20, concussion: 15, knock: 12,
    knee_cartilage: 10, shoulder: 9, fracture: 7, laceration: 5,
  };
  for (const k of Object.keys(targets)) {
    const c = kindTotals[k] ?? 0;
    console.log(`| ${k} | ${c} | ${(100 * c / totalInjuries).toFixed(1)}% | ${targets[k]}% |`);
  }
  console.log();

  // Position breakdown
  const posTotals: Record<string, number> = {};
  for (const r of allRows) {
    for (const [p, v] of Object.entries(r.byPosition)) {
      posTotals[p] = (posTotals[p] ?? 0) + (v ?? 0);
    }
  }
  console.log('## Injury position distribution');
  console.log();
  console.log('| Position | Count | % |');
  console.log('|---|---|---|');
  const orderedPositions = ['Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8', 'Back Row', 'Scrum-Half', 'Fly-Half', 'Centre', 'Wing', 'Fullback', 'Utility Back'];
  for (const p of orderedPositions) {
    const c = posTotals[p] ?? 0;
    console.log(`| ${p} | ${c} | ${(100 * c / totalInjuries).toFixed(1)}% |`);
  }
  console.log();

  // Season-rate extrapolation. 18 rounds × 23 matchday slots × 2 teams
  // = 828 player-matches per club per season → so injuries-per-club-season
  // is mean-per-match × 0.5 (one team's share) × 18 rounds.
  const perTeamPerMatch = mean / 2;
  const perClubPerSeason = perTeamPerMatch * 18;
  console.log('## Season-scale extrapolation');
  console.log();
  console.log(`- Injuries per team per match: ~${perTeamPerMatch.toFixed(2)}`);
  console.log(`- Injuries per club per 18-round season: **~${perClubPerSeason.toFixed(1)}**`);
  console.log(`- League-wide per season (10 clubs): ~${(perClubPerSeason * 10).toFixed(0)}`);
  console.log();
  console.log('Real Premiership benchmark (RFU surveillance): ~30 time-loss injuries / club / season.');
  console.log('Engine numbers above all sit at the *triggered* in-match injury count — every');
  console.log('triggered injury here will roll a severity (1+ weeks out) at match teardown via');
  console.log('rngTransfer, so this IS the time-loss number, not a higher "any knock" tally.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
