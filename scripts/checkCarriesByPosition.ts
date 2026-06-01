// One-off telemetry: forward (id 1-8) vs back (id 9-15) carry split, by
// attackingGamePlan. Runs every team head-to-head pairing under one root seed
// for each of the three attackingGamePlan options, applied to BOTH sides for
// a clean signal. Prints per-game carries / metres / line breaks split by
// position group.
//
// Not part of `npm run verify` or `npm run telemetry` — investigative tool
// for the forward-carries imbalance question.

import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { deriveFixtureSeed } from '../src/game/derive.js';
import { eventBus } from '../src/utils/eventBus.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { AttackingStyle, TeamTactics } from '../src/types/team.js';
import type { MatchState } from '../src/types/match.js';
import { MatchPhase } from '../src/types/engine.js';

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

const ROOT_SEED = 0xDEADBEEF;
const COMMENTARY_CAP_HIGH = 10000;

const ALL_TEAMS = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

interface PhaseCarrySplit {
  fwdCarries: number;
  bckCarries: number;
  fwdLineBreaks: number;
  bckLineBreaks: number;
}

interface Agg {
  games: number;
  totalCarries: number;
  fwdCarriesByPos: Map<number, number>;
  phaseSplit: Record<'FirstPhase' | 'PhasePlay' | 'KickReturn', PhaseCarrySplit>;
}

function emptyAgg(): Agg {
  const blank = (): PhaseCarrySplit => ({
    fwdCarries: 0, bckCarries: 0,
    fwdLineBreaks: 0, bckLineBreaks: 0,
  });
  return {
    games: 0,
    totalCarries: 0,
    fwdCarriesByPos: new Map(),
    phaseSplit: { FirstPhase: blank(), PhasePlay: blank(), KickReturn: blank() },
  };
}

const CARRY_OUTCOMES = new Set(['line_break', 'dominant_carry', 'dominant_tackle', 'play_on']);

function aggregate(agg: Agg, state: MatchState): void {
  agg.games++;
  for (const e of state.events) {
    if (!e.outcome || !CARRY_OUTCOMES.has(e.outcome)) continue;
    const carrier = e.primaryPlayer;
    if (!carrier) continue;
    let bucket: PhaseCarrySplit;
    if      (e.phase === MatchPhase.FirstPhase) bucket = agg.phaseSplit.FirstPhase;
    else if (e.phase === MatchPhase.PhasePlay)  bucket = agg.phaseSplit.PhasePlay;
    else if (e.phase === MatchPhase.KickReturn) bucket = agg.phaseSplit.KickReturn;
    else continue;

    agg.totalCarries++;
    const isFwd = carrier.id <= 8;
    if (isFwd) {
      bucket.fwdCarries++;
      if (e.outcome === 'line_break') bucket.fwdLineBreaks++;
      agg.fwdCarriesByPos.set(carrier.id, (agg.fwdCarriesByPos.get(carrier.id) ?? 0) + 1);
    } else {
      bucket.bckCarries++;
      if (e.outcome === 'line_break') bucket.bckLineBreaks++;
    }
  }
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

function withTactics(team: RawTeamInput, tactics: TeamTactics): RawTeamInput {
  return { ...team, suggestedTactics: tactics };
}

function baseTactics(style: AttackingStyle): TeamTactics {
  return {
    // "possession" gameplan keeps ball in hand (low kicks) so the carry-mix
    // signal isn't drowned out by territorial kicking exchanges.
    attackingGamePlan:  'possession',
    attackingStyle:     style,
    attackingBreakdown: style === 'keep_it_tight' ? 'commit_numbers'
                      : style === 'wide_wide'     ? 'minimal_ruck'
                      : 'balanced',
    defendingBreakdown: 'jackal',
    backfieldDefence:   'two_back',
    defensiveLine:      'hybrid',
  };
}

async function runScenario(label: string, style: AttackingStyle): Promise<Agg> {
  const agg = emptyAgg();
  const tactics = baseTactics(style);
  const TEAMS_T = ALL_TEAMS.map(t => withTactics(t, tactics));
  let round = 1;
  for (const home of TEAMS_T) {
    for (const away of TEAMS_T) {
      if (home.id === away.id) continue;
      const seed = deriveFixtureSeed(ROOT_SEED, round++, home.id, away.id);
      await runSilent(home, away, seed, state => aggregate(agg, state));
    }
  }
  console.log(`\n## ${label} (attackingStyle = ${style}, both sides)`);
  console.log(`Games: ${agg.games}`);
  const total = agg.totalCarries;
  const totalFwd = agg.phaseSplit.FirstPhase.fwdCarries + agg.phaseSplit.PhasePlay.fwdCarries + agg.phaseSplit.KickReturn.fwdCarries;
  const totalBck = agg.phaseSplit.FirstPhase.bckCarries + agg.phaseSplit.PhasePlay.bckCarries + agg.phaseSplit.KickReturn.bckCarries;
  console.log(`Total carries: ${total}  (forwards: ${totalFwd} = ${(100*totalFwd/total).toFixed(1)}%, backs: ${totalBck} = ${(100*totalBck/total).toFixed(1)}%)`);
  console.log(`Per-game: ${(total / agg.games).toFixed(1)} total  |  fwd ${(totalFwd / agg.games).toFixed(1)}  |  bck ${(totalBck / agg.games).toFixed(1)}`);

  console.log(`\n| phase       | fwd carries | bck carries | fwd % | fwd LB | bck LB |`);
  console.log(`|---|---:|---:|---:|---:|---:|`);
  for (const phase of ['FirstPhase', 'PhasePlay', 'KickReturn'] as const) {
    const s = agg.phaseSplit[phase];
    const total = s.fwdCarries + s.bckCarries;
    const fwdPct = total === 0 ? 0 : 100 * s.fwdCarries / total;
    console.log(`| ${phase.padEnd(11)} | ${s.fwdCarries.toString().padStart(11)} | ${s.bckCarries.toString().padStart(11)} | ${fwdPct.toFixed(1).padStart(5)} | ${s.fwdLineBreaks.toString().padStart(6)} | ${s.bckLineBreaks.toString().padStart(6)} |`);
  }
  console.log(`\nFwd carries by jersey id (across all phases):`);
  for (let id = 1; id <= 8; id++) {
    const c = agg.fwdCarriesByPos.get(id) ?? 0;
    console.log(`  #${id}: ${c}  (${(c / agg.games).toFixed(2)}/game)`);
  }
  return agg;
}

(async function main() {
  console.log(`# Forward vs Back carry split — by attackingStyle`);
  console.log(`Root seed: ${ROOT_SEED.toString(16)}, 90 fixtures per scenario, attackingGamePlan = possession`);
  await runScenario('Keep it tight', 'keep_it_tight');
  await runScenario('Balanced',      'balanced');
  await runScenario('Wide wide',     'wide_wide');
})();
