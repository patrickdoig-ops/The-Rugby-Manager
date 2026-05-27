// Controlled mirror-match tactical COMBO experiment.
//
// Follow-up to tacticsExperiment.ts. The earlier run tested each tactic
// dimension in isolation with all OTHER dimensions held at the balanced
// default. minimal_ruck came out -15.6 margin under that regime — but it
// was designed as part of an expansive package (wide_wide attackingStyle
// + offload_freely offloadStrategy), so testing it alone may strip it of
// its supporting cast.
//
// This script tests the expansive combo coherently. Mirror match
// (Northampton vs Northampton), 200 paired seeds per condition,
// AITacticalDirector neutralised. Symmetric counterpoint: also tests
// the tight combo (commit_numbers + keep_it_tight + cautious) to see
// if commit_numbers is similarly redeemed by its natural partners.

import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { AITacticalDirector } from '../src/engine/AITacticalDirector.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { TeamTactics } from '../src/types/team.js';
import { DEFAULT_TACTICS } from '../src/types/team.js';
import { eventBus } from '../src/utils/eventBus.js';
import { applyStarBoost } from '../src/team/applyStarBoost.js';
import type { TeamJson } from '../src/team/teamProfile.js';
import norRaw from '../src/data/team-northampton.json' with { type: 'json' };

(AITacticalDirector.prototype as unknown as { evaluate: () => void }).evaluate = () => {};

const N_PER_CONDITION = 200;

interface Condition {
  label: string;
  overrides: Partial<TeamTactics>;
  isControl: boolean;
}

const CONDITIONS: Condition[] = [
  { label: 'control (all balanced)',                        overrides: {},                                                                                isControl: true  },
  // Single-tactic isolates (re-run for fresh seeds; should match earlier deltas).
  { label: 'minimal_ruck only',                             overrides: { attackingBreakdown: 'minimal_ruck' },                                            isControl: false },
  { label: 'wide_wide only',                                overrides: { attackingStyle: 'wide_wide' },                                                   isControl: false },
  { label: 'offload_freely only',                           overrides: { offloadStrategy: 'offload_freely' },                                             isControl: false },
  // Pairs.
  { label: 'minimal_ruck + wide_wide',                      overrides: { attackingBreakdown: 'minimal_ruck', attackingStyle: 'wide_wide' },               isControl: false },
  { label: 'minimal_ruck + offload_freely',                 overrides: { attackingBreakdown: 'minimal_ruck', offloadStrategy: 'offload_freely' },         isControl: false },
  { label: 'wide_wide + offload_freely',                    overrides: { attackingStyle: 'wide_wide', offloadStrategy: 'offload_freely' },                isControl: false },
  // The coherent expansive package.
  { label: 'EXPANSIVE: minimal_ruck + wide_wide + offload_freely', overrides: { attackingBreakdown: 'minimal_ruck', attackingStyle: 'wide_wide', offloadStrategy: 'offload_freely' }, isControl: false },
  // Symmetric counterpoint: tight package — does commit_numbers come good
  // when paired with keep_it_tight + cautious?
  { label: 'TIGHT: commit_numbers + keep_it_tight + cautious',     overrides: { attackingBreakdown: 'commit_numbers', attackingStyle: 'keep_it_tight', offloadStrategy: 'cautious' },  isControl: false },
];

interface Metrics {
  pf: number; pa: number;
  homeTries: number; awayTries: number;
  homeLineBreaks: number; awayLineBreaks: number;
  homeTurnoversWon: number; awayTurnoversWon: number;
  homePossession: number;
  homeOffloadsAttempted: number; homeOffloadsCompleted: number;
  homeKnockOns: number; awayKnockOns: number;
  homePenalties: number; awayPenalties: number;
  homeCarries: number; homeMetres: number;
}

function emptyMetrics(): Metrics {
  return {
    pf: 0, pa: 0,
    homeTries: 0, awayTries: 0,
    homeLineBreaks: 0, awayLineBreaks: 0,
    homeTurnoversWon: 0, awayTurnoversWon: 0,
    homePossession: 0,
    homeOffloadsAttempted: 0, homeOffloadsCompleted: 0,
    homeKnockOns: 0, awayKnockOns: 0,
    homePenalties: 0, awayPenalties: 0,
    homeCarries: 0, homeMetres: 0,
  };
}

function sumStat(players: { matchStats: Record<string, number> }[], field: string): number {
  let s = 0;
  for (const p of players) s += p.matchStats[field] ?? 0;
  return s;
}

async function runMatch(overrides: Partial<TeamTactics>, seed: number): Promise<Metrics> {
  const homeRaw: RawTeamInput = JSON.parse(JSON.stringify(norRaw));
  const awayRaw: RawTeamInput = JSON.parse(JSON.stringify(norRaw));
  const home = applyStarBoost(homeRaw as unknown as TeamJson) as unknown as RawTeamInput;
  const away = applyStarBoost(awayRaw as unknown as TeamJson) as unknown as RawTeamInput;
  home.suggestedTactics = { ...DEFAULT_TACTICS, ...overrides };
  away.suggestedTactics = { ...DEFAULT_TACTICS };

  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, { tickDelayMs: 0, seed, silent: true });
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
        homeOffloadsAttempted: sumStat(homeAll, 'offloadsAttempted'),
        homeOffloadsCompleted: sumStat(homeAll, 'offloadsCompleted'),
        homeKnockOns: state.stats.handlingErrors.home,
        awayKnockOns: state.stats.handlingErrors.away,
        homePenalties: sumStat(homeAll, 'penaltiesConceded'),
        awayPenalties: sumStat(awayAll, 'penaltiesConceded'),
        homeCarries: sumStat(homeAll, 'carries'),
        homeMetres: sumStat(homeAll, 'metresCarried'),
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

function fmt(n: number, d = 1): string { return n.toFixed(d); }
function fmtDelta(t: number, c: number, d = 1): string {
  const x = t - c;
  return `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
}

async function main() {
  console.log(`# Controlled mirror-match tactical COMBO experiment`);
  console.log(`#`);
  console.log(`# Mirror match: Northampton vs Northampton.`);
  console.log(`# AITacticalDirector neutralised.`);
  console.log(`# ${N_PER_CONDITION} paired-seed matches per condition.`);
  console.log(`# Home overrides the listed tactics; away stays on DEFAULT_TACTICS.`);
  console.log(`#`);

  const results = new Map<string, Agg>();
  for (const c of CONDITIONS) results.set(c.label, newAgg());

  const baseSeed = 0xc0ffee01;
  let runIdx = 0;
  const total = CONDITIONS.length * N_PER_CONDITION;
  for (const c of CONDITIONS) {
    const agg = results.get(c.label)!;
    for (let i = 0; i < N_PER_CONDITION; i++) {
      const m = await runMatch(c.overrides, baseSeed + i);
      accumulate(agg, m);
      runIdx++;
      if (runIdx % 100 === 0) process.stderr.write(`  ${runIdx}/${total}\r`);
    }
  }
  process.stderr.write('\n');

  const ctrl = finalise(results.get(CONDITIONS[0].label)!);
  const ctrlMargin = ctrl.pf - ctrl.pa;
  const ctrlOffloadRate = ctrl.homeOffloadsAttempted > 0 ? ctrl.homeOffloadsCompleted / ctrl.homeOffloadsAttempted : 0;

  console.log('## Headline results');
  console.log('');
  console.log('| Condition | PF | PA | Margin (Δ) | Tries F/A | LB F/A | TO won F/A | Poss % | Off att/cmp | Carries F | Metres F | Knock-ons F/A | Pen F/A |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of CONDITIONS) {
    const m = finalise(results.get(c.label)!);
    const margin = m.pf - m.pa;
    const label = c.isControl ? `${c.label} ⭐` : c.label;
    console.log(
      `| ${label} | ${fmt(m.pf)} | ${fmt(m.pa)} | ${fmt(margin)} (${fmtDelta(margin, ctrlMargin)}) | ${fmt(m.homeTries)}/${fmt(m.awayTries)} | ${fmt(m.homeLineBreaks)}/${fmt(m.awayLineBreaks)} | ${fmt(m.homeTurnoversWon)}/${fmt(m.awayTurnoversWon)} | ${fmt(100*m.homePossession)} | ${fmt(m.homeOffloadsAttempted)}/${fmt(m.homeOffloadsCompleted)} | ${fmt(m.homeCarries)} | ${fmt(m.homeMetres, 0)} | ${fmt(m.homeKnockOns)}/${fmt(m.awayKnockOns)} | ${fmt(m.homePenalties)}/${fmt(m.awayPenalties)} |`,
    );
  }
  console.log('');
  console.log(`Control offload completion rate: ${fmt(100*ctrlOffloadRate)}%`);
}

main();
