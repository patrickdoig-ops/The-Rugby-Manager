// Controlled mirror-match tactical experiment.
//
// Mirror match: Northampton (a relatively balanced authored team)
// plays itself. Both sides start on DEFAULT_TACTICS. For each tactic
// dimension, the HOME side's value is flipped to each option (including
// the default as a control) while the AWAY side stays on DEFAULT. We
// then measure how each tactic shifts PF / PA / tries / line breaks /
// turnovers / possession away from the symmetric baseline.
//
// AITacticalDirector is disabled for the duration so the late-match
// score-gap flip doesn't perturb the test. Paired seeds across conditions
// give a within-seed comparison.

import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { AITacticalDirector } from '../src/engine/AITacticalDirector.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { TeamTactics } from '../src/types/team.js';
import { DEFAULT_TACTICS } from '../src/types/team.js';
import { eventBus } from '../src/utils/eventBus.js';
import norRaw from '../src/data/team-northampton.json' with { type: 'json' };

// Neutralise the director so neither side flips tactics mid-match.
// Restore would matter if anything else in this process used the
// engine afterwards; since this script exits cleanly, no restore.
(AITacticalDirector.prototype as unknown as { evaluate: () => null }).evaluate = () => null;

const N_PER_CONDITION = 200;

interface Condition {
  dimension: keyof TeamTactics;
  value: string;
  isControl: boolean;
}

const CONDITIONS: Condition[] = [
  // attackingGamePlan: possession / balanced / kicking
  { dimension: 'attackingGamePlan',   value: 'balanced',       isControl: true  },
  { dimension: 'attackingGamePlan',   value: 'possession',     isControl: false },
  { dimension: 'attackingGamePlan',   value: 'kicking',        isControl: false },
  // attackingStyle: keep_it_tight / balanced / wide_wide
  { dimension: 'attackingStyle',      value: 'balanced',       isControl: true  },
  { dimension: 'attackingStyle',      value: 'keep_it_tight',  isControl: false },
  { dimension: 'attackingStyle',      value: 'wide_wide',      isControl: false },
  // attackingBreakdown: commit_numbers / balanced / minimal_ruck
  { dimension: 'attackingBreakdown',  value: 'balanced',       isControl: true  },
  { dimension: 'attackingBreakdown',  value: 'commit_numbers', isControl: false },
  { dimension: 'attackingBreakdown',  value: 'minimal_ruck',   isControl: false },
  // defendingBreakdown: jackal / counter_ruck / shadow
  { dimension: 'defendingBreakdown',  value: 'jackal',         isControl: true  },
  { dimension: 'defendingBreakdown',  value: 'counter_ruck',   isControl: false },
  { dimension: 'defendingBreakdown',  value: 'shadow',         isControl: false },
  // backfieldDefence: one_back / two_back / three_back
  { dimension: 'backfieldDefence',    value: 'one_back',       isControl: true  },
  { dimension: 'backfieldDefence',    value: 'two_back',       isControl: false },
  { dimension: 'backfieldDefence',    value: 'three_back',     isControl: false },
  // defensiveLine: blitz / hybrid / drift
  { dimension: 'defensiveLine',       value: 'hybrid',         isControl: true  },
  { dimension: 'defensiveLine',       value: 'blitz',          isControl: false },
  { dimension: 'defensiveLine',       value: 'drift',          isControl: false },
  // offloadStrategy: cautious / balanced / offload_freely
  { dimension: 'offloadStrategy',     value: 'balanced',       isControl: true  },
  { dimension: 'offloadStrategy',     value: 'cautious',       isControl: false },
  { dimension: 'offloadStrategy',     value: 'offload_freely', isControl: false },
];

interface Metrics {
  pf: number; pa: number;
  homeTries: number; awayTries: number;
  homeLineBreaks: number; awayLineBreaks: number;
  homeTurnoversWon: number; awayTurnoversWon: number;
  homePossession: number;
  homeMissedTackles: number; awayMissedTackles: number;
  homeKnockOns: number; awayKnockOns: number;
  homePenalties: number; awayPenalties: number;
  homeMauls: number; awayMauls: number;
}

function emptyMetrics(): Metrics {
  return {
    pf: 0, pa: 0,
    homeTries: 0, awayTries: 0,
    homeLineBreaks: 0, awayLineBreaks: 0,
    homeTurnoversWon: 0, awayTurnoversWon: 0,
    homePossession: 0,
    homeMissedTackles: 0, awayMissedTackles: 0,
    homeKnockOns: 0, awayKnockOns: 0,
    homePenalties: 0, awayPenalties: 0,
    homeMauls: 0, awayMauls: 0,
  };
}

function sumStat(players: { matchStats: Record<string, number> }[], field: string): number {
  let s = 0;
  for (const p of players) s += p.matchStats[field] ?? 0;
  return s;
}

async function runMatch(homeTactic: { dim: keyof TeamTactics; val: string }, seed: number): Promise<Metrics> {
  const homeRaw: RawTeamInput = JSON.parse(JSON.stringify(norRaw));
  const awayRaw: RawTeamInput = JSON.parse(JSON.stringify(norRaw));
  const home = homeRaw as unknown as RawTeamInput;
  const away = awayRaw as unknown as RawTeamInput;
  home.suggestedTactics = { ...DEFAULT_TACTICS, [homeTactic.dim]: homeTactic.val } as TeamTactics;
  away.suggestedTactics = { ...DEFAULT_TACTICS };

  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, { tickDelayMs: 0, seed, silent: true, neutralVenue: true });
    const off = eventBus.on('engine:finished', () => {
      off();
      const state = engine.getState();
      const homeAll = [...state.homeTeam.players, ...state.homeTeam.substitutedOff];
      const awayAll = [...state.awayTeam.players, ...state.awayTeam.substitutedOff];
      const totalPoss = state.stats.possession.home + state.stats.possession.away;

      const m: Metrics = {
        pf: state.score.home,
        pa: state.score.away,
        homeTries: state.stats.tries.home,
        awayTries: state.stats.tries.away,
        homeLineBreaks: sumStat(homeAll, 'lineBreaks'),
        awayLineBreaks: sumStat(awayAll, 'lineBreaks'),
        homeTurnoversWon: sumStat(homeAll, 'turnoversWon'),
        awayTurnoversWon: sumStat(awayAll, 'turnoversWon'),
        homePossession: totalPoss > 0 ? state.stats.possession.home / totalPoss : 0.5,
        homeMissedTackles: sumStat(homeAll, 'missedTackles'),
        awayMissedTackles: sumStat(awayAll, 'missedTackles'),
        homeKnockOns: state.stats.handlingErrors.home,
        awayKnockOns: state.stats.handlingErrors.away,
        homePenalties: sumStat(homeAll, 'penaltiesConceded'),
        awayPenalties: sumStat(awayAll, 'penaltiesConceded'),
        homeMauls: state.stats.mauls.home,
        awayMauls: state.stats.mauls.away,
      };
      engine.destroy();
      resolve(m);
    });
    engine.initialize();
    engine.start();
  });
}

interface Agg {
  mean: Metrics;
  count: number;
}

function newAgg(): Agg { return { mean: emptyMetrics(), count: 0 }; }

function accumulate(agg: Agg, m: Metrics) {
  agg.count++;
  for (const k of Object.keys(m) as Array<keyof Metrics>) {
    agg.mean[k] += m[k];
  }
}

function finalise(agg: Agg): Metrics {
  if (agg.count === 0) return emptyMetrics();
  const out = emptyMetrics();
  for (const k of Object.keys(out) as Array<keyof Metrics>) {
    out[k] = agg.mean[k] / agg.count;
  }
  return out;
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function fmtDelta(treat: number, ctrl: number, decimals = 1): string {
  const d = treat - ctrl;
  const sign = d >= 0 ? '+' : '';
  return `${sign}${d.toFixed(decimals)}`;
}

async function main() {
  console.log(`# Controlled mirror-match tactical experiment`);
  console.log(`#`);
  console.log(`# Mirror match: Northampton vs Northampton.`);
  console.log(`# AITacticalDirector neutralised (no mid-match adaptation).`);
  console.log(`# ${N_PER_CONDITION} paired-seed matches per condition.`);
  console.log(`# Home side carries the test tactic; away holds DEFAULT_TACTICS.`);
  console.log(`#`);

  // Group conditions by dimension so we can compute deltas vs the in-group control.
  const dims = ['attackingGamePlan', 'attackingStyle', 'attackingBreakdown', 'defendingBreakdown', 'backfieldDefence', 'defensiveLine', 'offloadStrategy'] as const;

  const results = new Map<string, Agg>();
  for (const c of CONDITIONS) results.set(`${c.dimension}:${c.value}`, newAgg());

  const baseSeed = 0xdeadbeef;
  let runIdx = 0;
  const total = CONDITIONS.length * N_PER_CONDITION;
  for (const c of CONDITIONS) {
    const agg = results.get(`${c.dimension}:${c.value}`)!;
    for (let i = 0; i < N_PER_CONDITION; i++) {
      const m = await runMatch({ dim: c.dimension, val: c.value }, baseSeed + i);
      accumulate(agg, m);
      runIdx++;
      if (runIdx % 100 === 0) {
        process.stderr.write(`  ${runIdx}/${total} matches...\r`);
      }
    }
  }
  process.stderr.write('\n');

  for (const dim of dims) {
    const dimConditions = CONDITIONS.filter(c => c.dimension === dim);
    const control = dimConditions.find(c => c.isControl)!;
    const ctrl = finalise(results.get(`${dim}:${control.value}`)!);

    console.log(`## ${dim} (control = ${control.value})`);
    console.log('');
    console.log(`| Value | PF/g | PA/g | Margin | Tries F/A | LB F/A | TO F/A | Poss % | Pen F/A | Mauls F/A | KnockOns F/A | MissedTk F/A |`);
    console.log(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
    for (const c of dimConditions) {
      const m = finalise(results.get(`${dim}:${c.value}`)!);
      const tag = c.isControl ? ' (ctrl)' : '';
      const margin = m.pf - m.pa;
      const ctrlMargin = ctrl.pf - ctrl.pa;
      console.log(
        `| ${c.value}${tag} | ${fmt(m.pf)} | ${fmt(m.pa)} | ${fmt(margin)} (${fmtDelta(margin, ctrlMargin)}) | ${fmt(m.homeTries)}/${fmt(m.awayTries)} | ${fmt(m.homeLineBreaks)}/${fmt(m.awayLineBreaks)} | ${fmt(m.homeTurnoversWon)}/${fmt(m.awayTurnoversWon)} | ${fmt(100*m.homePossession)} | ${fmt(m.homePenalties)}/${fmt(m.awayPenalties)} | ${fmt(m.homeMauls)}/${fmt(m.awayMauls)} | ${fmt(m.homeKnockOns)}/${fmt(m.awayKnockOns)} | ${fmt(m.homeMissedTackles)}/${fmt(m.awayMissedTackles)} |`,
      );
    }
    console.log('');
  }
}

main();
