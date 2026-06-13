// Long-career growth + squad-floor harness (on-demand, like telemetry).
//
// Runs a single fixed (playerTeamId, seed) career for SEASONS years through
// the real GameCoordinator flow — the same headless drive the determinism
// harness uses (player + AI league fixtures, the Prem Cup break blocks, the
// European competitions, and the playoffs) — and after every rollover asserts
// the two long-career robustness guarantees:
//
//   1. Squad floor — every club starts each season with >= MIN_SQUAD_SIZE
//      players, so no AI-run club can drift below a fieldable 23 over time
//      (computeRollover tops short clubs up with academy graduates).
//   2. Bounded growth — the retired-roster prune + archive cap keep the roster
//      and the save file from growing without bound. Once the archive has
//      filled (season > ARCHIVE_CAP) the save size must plateau, not keep
//      climbing, and stay under an absolute ceiling.
//
// NOT part of `npm run verify`: a faithful season is ~90+ full match-engine
// sims and late seasons carry 1000+ rosters, so the full run takes minutes.
// Run on demand when touching rollover / supply / prune / squad-floor code:
//   npm run check:career
// Exit 0 = both guarantees hold across the whole run.

import { GameCoordinator } from '../src/game/GameCoordinator.js';
import { simulateFixture } from '../src/game/simulateFixture.js';
import { buildAutoSelectedTeamFromRoster } from '../src/game/rosterTeamBuilder.js';
import { buildEuropeanOpponent } from '../src/game/buildEuropeanOpponent.js';
import { MIN_SQUAD_SIZE, ARCHIVE_CAP } from '../src/engine/balance/career.js';
import type { RawTeamInput } from '../src/types/teamData.js';

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
const SEASONS = 20;                 // comfortably past ARCHIVE_CAP so the prune is exercised
const SAVE_CEILING_KB = 4500;       // absolute save-size ceiling (mobile localStorage ≈ 5 MB)
const PLATEAU_TOLERANCE = 1.12;     // post-prune save may not grow > 12% from the cap point to the end

const allTeams = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

const HARNESS_TRAINING_PLAN = { intensity: 'light', forwardsFocus: 'set_piece', backsFocus: 'tackling' } as const;

function lookupTeam(teamId: string): RawTeamInput | undefined {
  return allTeams.find(t => t.id === teamId);
}

// ── Season drive (mirrors the live Hub flow; same helpers as the determinism
// harness — kept local so importing this slow script never triggers that one's
// top-level determinism run). ────────────────────────────────────────────────
async function simulateSeason(coord: GameCoordinator, teamsById: Map<string, RawTeamInput>): Promise<void> {
  while (true) {
    await drainCupBreak(coord);
    const next = coord.getCurrentFixture();
    if (!next) break;
    const state = coord.getState();
    const home = buildAutoSelectedTeamFromRoster(state, teamsById.get(next.homeId)!);
    const away = buildAutoSelectedTeamFromRoster(state, teamsById.get(next.awayId)!);
    const sim = await simulateFixture(home, away, state.seed, next.round);
    await coord.recordPlayerMatchResult(next.round, sim.homeScore, sim.awayScore, sim.snapshot);
    await drainEuropean(coord, teamsById);
  }
  await playOutPlayoffs(coord);
}

async function drainCupBreak(coord: GameCoordinator): Promise<void> {
  const begin = coord.beginInternationalBreak();
  const window = begin?.window;
  let guard = 0;
  while (true) {
    const step = coord.getCupBreakStep();
    if (!step) break;
    if (++guard > 300) throw new Error('cup break did not terminate');
    if (step === 'play_fixture') {
      const ref = coord.getCurrentCupFixture()!;
      await coord.advanceMatchdayCalendar(ref.kind === 'pool' ? ref.fixture.date : ref.match.date);
      await coord.runPlayerCupFixtureHeadless(ref);
      coord.runCupMatchdayTraining([HARNESS_TRAINING_PLAN]);
    } else if (step === 'advance_round') {
      await coord.simDueCupFixtures();
      const round = coord.getCurrentCupRound();
      if (round) coord.markCupRoundShown(round.roundKey);
    } else if (step === 'resolve_returns') {
      if (window) coord.resolveInternationalWindow(window);
      else break;
    }
  }
}

async function drainEuropean(coord: GameCoordinator, teamsById: Map<string, RawTeamInput>): Promise<void> {
  let guard = 0;
  while (true) {
    if (++guard > 200) throw new Error('european drain did not terminate');
    const fix = coord.getCurrentEuropeanFixture();
    if (fix) {
      const state = coord.getState();
      const homeId = fix.kind === 'pool' ? fix.fixture.homeId : (fix.match.homeId ?? '');
      const awayId = fix.kind === 'pool' ? fix.fixture.awayId : (fix.match.awayId ?? '');
      const resolveTeam = (id: string): RawTeamInput =>
        teamsById.get(id) ? buildAutoSelectedTeamFromRoster(state, teamsById.get(id)!) : buildEuropeanOpponent(id)!;
      const home = resolveTeam(homeId);
      const away = resolveTeam(awayId);
      const seedRound = fix.kind === 'pool'
        ? 400 + fix.fixture.round
        : 410 + ['r16', 'quarterfinal', 'semifinal', 'final'].indexOf(fix.stage);
      const isFinal = fix.kind === 'knockout' && fix.stage === 'final';
      // Mirror main.ts: advance the calendar to the fixture date before
      // recording so the elapsed-week passes tick (competition-agnostic).
      const euroDate = fix.kind === 'pool' ? fix.fixture.date : (fix.match.date ?? '');
      if (euroDate) await coord.advanceMatchdayCalendar(euroDate);
      const sim = await simulateFixture(home, away, state.seed, seedRound, { neutralVenue: isFinal });
      if (fix.kind === 'pool') {
        await coord.recordPlayerEuropeanPoolResult(fix.competition, fix.fixture.poolId, fix.fixture.round, homeId, awayId, sim.homeScore, sim.awayScore, sim.snapshot);
      } else {
        await coord.recordPlayerEuropeanKnockoutResult(fix.competition, fix.stage, fix.match.matchIndex, sim.homeScore, sim.awayScore, sim.snapshot);
      }
      coord.runEuropeanMatchdayTraining([HARNESS_TRAINING_PLAN]);
      continue;
    }
    const round = coord.getCurrentEuropeanRound();
    if (round) { coord.markEuropeanRoundShown(round.competition, round.roundKey); continue; }
    break;
  }
}

async function playOutPlayoffs(coord: GameCoordinator): Promise<void> {
  for (const stage of ['sf', 'final'] as const) {
    // Mirror main.ts: advance to this stage's date so the elapsed-week passes
    // tick on playoff weeks too.
    const playoffs = coord.getState().league.playoffs;
    if (playoffs) {
      const stageDate = stage === 'sf' ? (playoffs.semifinals[0].date ?? '') : (playoffs.final.date ?? '');
      if (stageDate) await coord.advanceMatchdayCalendar(stageDate);
    }
    while (true) {
      const m = coord.getPlayerPlayoffMatch();
      if (!m) break;
      if (stage === 'sf' && m.kind === 'final') break;
      if (stage === 'final' && (m.kind === 'semifinal_1' || m.kind === 'semifinal_2')) break;
      if (!m.homeId || !m.awayId) break;
      const state = coord.getState();
      const home = buildAutoSelectedTeamFromRoster(state, lookupTeam(m.homeId)!);
      const away = buildAutoSelectedTeamFromRoster(state, lookupTeam(m.awayId)!);
      const pseudoRound = stage === 'sf' ? 19 : 20;
      const sim = await simulateFixture(home, away, state.seed, pseudoRound, { neutralVenue: m.kind === 'final' });
      await coord.recordPlayerPlayoffResult(m.kind, sim.homeScore, sim.awayScore, sim.snapshot);
    }
    await coord.simulatePendingPlayoffMatches(stage);
  }
}

// ── Run + assert ──────────────────────────────────────────────────────────
interface SeasonSample { season: number; minSquad: number; minClub: string; roster: number; retired: number; saveKB: number; }

let coord = await GameCoordinator.newSeason(PLAYER_ID, SEED, allTeams);
const teamsById = new Map(allTeams.map(t => [t.id, t]));
const samples: SeasonSample[] = [];
const violations: string[] = [];

for (let s = 0; s < SEASONS; s++) {
  await simulateSeason(coord, teamsById);
  await coord.rollSeason();

  const st = coord.getState();
  const seasonNo = s + 2; // season label number after this rollover
  const squadSizes = st.career.clubs.map(c => c.squad.length);
  const minSquad = Math.min(...squadSizes);
  const minClub = st.career.clubs[squadSizes.indexOf(minSquad)]?.id ?? '?';
  const rosterIds = Object.keys(st.career.roster).map(Number);
  const retired = rosterIds.filter(r => st.career.roster[r].retired).length;
  const saveKB = Math.round(JSON.stringify(coord.toSavePayload()).length / 1024);
  samples.push({ season: seasonNo, minSquad, minClub, roster: rosterIds.length, retired, saveKB });

  if (minSquad < MIN_SQUAD_SIZE) {
    violations.push(`season ${seasonNo}: ${minClub} squad ${minSquad} < MIN_SQUAD_SIZE ${MIN_SQUAD_SIZE}`);
  }
}

// Print the trace.
for (const r of samples) {
  console.log(
    `season ${String(r.season).padStart(2)} | roster ${String(r.roster).padStart(4)} (retired ${String(r.retired).padStart(4)}) | ` +
    `minSquad ${String(r.minSquad).padStart(2)} (${r.minClub}) | save ${String(r.saveKB).padStart(4)}KB`,
  );
}

// Bounded-growth assertions. The prune only starts removing records once the
// archive has filled (season > ARCHIVE_CAP), so compare the save size at that
// point against the final season — it must have plateaued, not kept climbing.
const capPoint = samples.find(r => r.season >= ARCHIVE_CAP + 2);
const last = samples[samples.length - 1];
if (last.saveKB > SAVE_CEILING_KB) {
  violations.push(`save size ${last.saveKB}KB exceeds ceiling ${SAVE_CEILING_KB}KB at season ${last.season}`);
}
if (capPoint && last.saveKB > capPoint.saveKB * PLATEAU_TOLERANCE) {
  violations.push(
    `save size grew from ${capPoint.saveKB}KB (season ${capPoint.season}) to ${last.saveKB}KB (season ${last.season}) ` +
    `— >${Math.round((PLATEAU_TOLERANCE - 1) * 100)}% after the archive cap; prune may be regressed`,
  );
}

if (violations.length > 0) {
  console.error('\nCAREER GROWTH / SQUAD FLOOR BROKEN:');
  for (const v of violations) console.error(`  • ${v}`);
  process.exit(1);
}

const maxSave = Math.max(...samples.map(r => r.saveKB));
console.log(
  `\nOK: ${SEASONS} seasons — every club stayed >= ${MIN_SQUAD_SIZE} (min ${Math.min(...samples.map(r => r.minSquad))}); ` +
  `save bounded (peak ${maxSave}KB, ceiling ${SAVE_CEILING_KB}KB; plateaued within ${Math.round((PLATEAU_TOLERANCE - 1) * 100)}%).`,
);
