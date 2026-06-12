// Career-determinism golden-master harness.
//
// Runs three full seasons of a fixed (playerTeamId, seed) career through
// GameCoordinator, with rollSeason() between each. Records the player's
// own fixtures via the same headless simulator the game engine uses for
// AI matches. Snapshot covers all three seasons' final standings + the
// post-rollover roster baseStats + retirement archive + the generated
// year-2 and year-3 fixture lists. Asserts two runs produce identical
// SHA-256 hashes. Exit 0 = deterministic.
//
// Companion to scripts/checkDeterminism.ts (single-match determinism) —
// both must pass before commit.
//
// Locks the contract that:
//   1. The match-result + AI-sim flow is reproducible (existing v4
//      coverage).
//   2. The PLAYER_SEASON_STATS_ACCUMULATED events fire in a deterministic
//      sequence and accumulate the same per-player tallies.
//   3. computeRollover (aging + retirement via rngTransfer) is
//      reproducible — same retirements, same stat deltas.
//   4. Generated year-2+ fixtures are reproducible.
//   5. The renewal window (Phase 4: openRenewalWindow +
//      closeRenewalWindow with AI-only decisions) produces the same
//      offers + accept/reject outcomes + freeAgents pool every run.
//   6. The Prem Cup live weekly flow (drainCupBreak: per-matchday cup sims +
//      per-matchday training + international call-up/return bracketing at the
//      pre-season block and rounds 6 / 11) is reproducible: same pool seeding
//      (incl. year-2+ redraw), cup results, KO cascade + champion — and the
//      reload round-trip resumes mid-career identically.

import { createHash } from 'node:crypto';
import { GameCoordinator } from '../src/game/GameCoordinator.js';
import { simulateFixture } from '../src/game/simulateFixture.js';
import { buildAutoSelectedTeamFromRoster } from '../src/game/rosterTeamBuilder.js';
import { buildEuropeanOpponent } from '../src/game/buildEuropeanOpponent.js';
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
const SEASONS = 3;

const allTeams = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

// Fixed training plan for the harness's break blocks — only consistency
// across runs matters for determinism.
const HARNESS_TRAINING_PLAN = { intensity: 'light', forwardsFocus: 'set_piece', backsFocus: 'tackling' } as const;

async function simulateSeason(coord: GameCoordinator, teamsById: Map<string, RawTeamInput>): Promise<void> {
  while (true) {
    // Drive any pending cup game-weeks before the next league round — the
    // pre-season leg-0 block (before R1) and the autumn / six-nations break
    // legs. Mirrors the Hub-driven per-matchday flow with the assistant
    // managing every cup match (cupManageLive = false).
    await drainCupBreak(coord);
    const next = coord.getCurrentFixture();
    if (!next) break;
    const state = coord.getState();
    const homeJson = teamsById.get(next.homeId)!;
    const awayJson = teamsById.get(next.awayId)!;
    const home = buildAutoSelectedTeamFromRoster(state, homeJson);
    const away = buildAutoSelectedTeamFromRoster(state, awayJson);
    const sim = await simulateFixture(home, away, state.seed, next.round);
    await coord.recordPlayerMatchResult(next.round, sim.homeScore, sim.awayScore, sim.snapshot);
    // Play out the player's own European fixtures that have come due (mirrors
    // the post-match chain's maybePlayEuropeanFixture). This completes the EC
    // pool so the Shield knockout (which seeds the EC drop-downs) can resolve.
    await drainEuropean(coord, teamsById);
  }
  // After the final regular fixture, the engine has already seeded the
  // bracket (via recordPlayerMatchResult). Drive the knockouts headlessly
  // so the championship layer gets determinism coverage too. The
  // harness has no UI seam, so player-involved playoff matches go
  // through the same silent sim path as AI-only ones via
  // simulatePendingPlayoffMatches (the method skips player matches; we
  // pick them up directly here).
  await playOutPlayoffs(coord);
}

// Drive the cup break to completion: flag call-ups (beginInternationalBreak,
// idempotent), play out every cup matchday (assistant-simmed) with its own
// training week, advance completed rounds, and resolve international returns.
// Mirrors the Hub / onPlayCupStep driver in main.ts.
async function drainCupBreak(coord: GameCoordinator): Promise<void> {
  const begin = coord.beginInternationalBreak(); // flags call-ups; null off a break round
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
      else break; // defensive — should never happen (duty implies a window)
    }
  }
}

// Play the player's due European fixtures headlessly (the harness has no live
// match seam) + step through completed round screens, each followed by its own
// matchday training week — mirroring main.ts's maybePlayEuropeanFixture.
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
  // Silent: each stage may contain at most 2 SFs + 1 Final, and at most
  // one of the SFs (and the final) may be the player's match.
  for (const stage of ['sf', 'final'] as const) {
    // Player matches in this stage — drive each through the headless
    // playoff path used by the live UI's recordPlayerPlayoffResult.
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
    // Then sim every remaining AI match in this stage.
    await coord.simulatePendingPlayoffMatches(stage);
  }
}

function lookupTeam(teamId: string): RawTeamInput | undefined {
  return allTeams.find(t => t.id === teamId);
}

// `roundTrip: true` exercises the save/load contract: after the season-2 →
// season-3 rollover, the coordinator is serialised via toSavePayload(), put
// through a real JSON round-trip, and rebuilt with GameCoordinator.fromSave;
// season 3 then runs on the restored coordinator. The final hash must match
// the uninterrupted run — this is what makes the careerRngOffset snapshot
// claim ("load/reload is fully deterministic") an enforced invariant.
async function runOnce(seed: number, roundTrip = false): Promise<string> {
  let coord = await GameCoordinator.newSeason(PLAYER_ID, seed, allTeams);
  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  const seasonSnapshots: unknown[] = [];

  for (let s = 0; s < SEASONS; s++) {
    await simulateSeason(coord, teamsById);
    const preRolloverState = coord.getState();
    const seasonLabel = preRolloverState.calendar.seasonLabel;
    const finalStandings = preRolloverState.league.standings;
    const resultsHash = createHash('sha256').update(JSON.stringify(preRolloverState.league.results)).digest('hex');
    // Hash the league-wide team-season aggregates (v9+) and every roster
    // player's seasonStats. Both rebuild from per-fixture
    // *_SEASON_STATS_ACCUMULATED events, so any drift in the collector
    // or reducer shows up here even when the scores hash agrees.
    const teamStatsKeys = Object.keys(preRolloverState.league.teamSeasonStats).sort();
    const teamStatsHash = createHash('sha256')
      .update(JSON.stringify(teamStatsKeys.map(k => [k, preRolloverState.league.teamSeasonStats[k]])))
      .digest('hex');
    const seasonStatsKeys = Object.keys(preRolloverState.career.roster).map(Number).sort((a, b) => a - b);
    const seasonStatsHash = createHash('sha256')
      .update(JSON.stringify(seasonStatsKeys.map(rid => [rid, preRolloverState.career.roster[rid].seasonStats])))
      .digest('hex');

    let rolloverEvents: unknown[] = [];
    let marketSummary: unknown = null;
    let budgetSummary: unknown = null;
    if (s < SEASONS - 1) {
      // Phase 9: prepare next-season budgets (performance + takeovers)
      // BEFORE renewals so the AI signs against the new owner-set
      // budget. Hash the resulting events + the post-apply per-club
      // budget map.
      const budgetEvents = coord.prepareBudgetsForNextSeason();
      const clubsAfter = [...coord.getState().career.clubs].sort((a, b) => a.id.localeCompare(b.id));
      const takeoverHistoryAfter = [...coord.getState().career.takeoverHistory].sort();
      budgetSummary = {
        eventCount: budgetEvents.length,
        budgetMap: clubsAfter.map(c => [c.id, c.salaryBudget]),
        takeoverHistory: takeoverHistoryAfter,
      };
      // Phase 4: exercise the renewal window between seasons. AI-only
      // — no user decisions, so the director resolves every offer
      // deterministically against the cap target.
      coord.openRenewalWindow();
      const renewalMarket = coord.getState().career.market;
      if (renewalMarket) {
        const offerHashSource = renewalMarket.offers
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(o => `${o.id}|${o.rosterId}|${o.annualWage}|${o.lengthYears}|${o.status}`);
        marketSummary = {
          expiringCount: renewalMarket.expiringRosterIds.length,
          renewalOfferHash: createHash('sha256').update(offerHashSource.join('\n')).digest('hex'),
        };
        coord.closeRenewalWindow();
        const freeAgentsAfter = [...coord.getState().career.freeAgents].sort((a, b) => a - b);
        marketSummary = { ...marketSummary as object, freeAgentsAfterRenewals: freeAgentsAfter };
      }
      // Phase 5+10: signing window. Drive one user-bid round to
      // exercise the competitive resolution path, then Finish to
      // trigger the final AI fill-up + close. The user (bath) bids
      // on the top-3 most-affordable free agents and on any final-
      // year contracted player they can afford — covers free-agent,
      // poach, and retention paths through the resolver.
      coord.openSigningWindow();
      const signingMarket = coord.getState().career.market;
      if (signingMarket) {
        const offerHashSource = signingMarket.offers
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(o => `${o.id}|${o.rosterId}|${o.annualWage}|${o.lengthYears}`);
        marketSummary = {
          ...marketSummary as object,
          signingOfferHash: createHash('sha256').update(offerHashSource.join('\n')).digest('hex'),
        };
        // User-bid pass: pick the 3 cheapest pending offers and bid.
        const cheapestOffers = signingMarket.offers
          .filter(o => o.status === 'pending')
          .sort((a, b) => a.annualWage - b.annualWage)
          .slice(0, 3);
        for (const o of cheapestOffers) coord.submitBid(o.rosterId);
        // AI bid + retention + resolve one round.
        coord.runAIBidPass();
        coord.runAIRetentionPass();
        const outcomes = coord.resolveSigningRound();
        const outcomesHash = createHash('sha256').update(JSON.stringify(outcomes.map(o => ({
          rosterId: o.rosterId,
          winner: o.winnerBid?.clubId ?? null,
          kind: o.winnerBid?.kind ?? null,
        })))).digest('hex');
        marketSummary = { ...marketSummary as object, roundOutcomesHash: outcomesHash };
        // Finish — final AI fill-up + close.
        coord.closeSigningWindow();
        const freeAgentsLeft = [...coord.getState().career.freeAgents].sort((a, b) => a - b);
        marketSummary = { ...marketSummary as object, freeAgentsAfterSignings: freeAgentsLeft };
      }
      rolloverEvents = await coord.rollSeason();
    }

    // Snapshot the playoff bracket too — every score, the cascaded final
    // matchup, and the eventual champion. The bracket clears at
    // SEASON_ROLLED_OVER, so we read it here while it's still populated.
    const playoffs = preRolloverState.league.playoffs;
    const playoffSummary = playoffs ? {
      championTeamId: playoffs.championTeamId,
      semifinals: playoffs.semifinals.map(m => ({
        kind: m.kind,
        homeId: m.homeId, awayId: m.awayId,
        homeSeed: m.homeSeed, awaySeed: m.awaySeed,
        result: m.result ? { ...m.result } : null,
      })),
      final: {
        homeId: playoffs.final.homeId, awayId: playoffs.final.awayId,
        result: playoffs.final.result ? { ...playoffs.final.result } : null,
      },
    } : null;

    // Snapshot the Prem Cup — pool standings, every fixture result, the
    // knockout bracket + champion. Cleared at SEASON_ROLLED_OVER, so read
    // here while populated. Locks cup seeding (incl. year-2+ pool redraw),
    // cup sim reproducibility, the KO cascade, and that the cup never
    // perturbs the league hash.
    const cup = preRolloverState.league.premCup;
    const premCupSummary = cup ? {
      seasonLabel: cup.seasonLabel,
      pools: cup.pools.map(p => ({ id: p.id, teamIds: p.teamIds, standings: p.standings })),
      fixtures: cup.fixtures.map(f => ({ pool: f.pool, leg: f.leg, homeId: f.homeId, awayId: f.awayId, result: f.result ?? null })),
      knockout: cup.knockout ? {
        championTeamId: cup.knockout.championTeamId,
        semifinals: cup.knockout.semifinals.map(m => ({ homeId: m.homeId, awayId: m.awayId, result: m.result ?? null })),
        final: { homeId: cup.knockout.final.homeId, awayId: cup.knockout.final.awayId, result: cup.knockout.final.result ?? null },
      } : null,
    } : null;

    // Snapshot both European competitions — pool standings, every fixture
    // result, and the full knockout cascade + champion. Locks the European
    // sims (the only competition layer previously uncovered by this harness).
    const euroSummary = (comp: typeof preRolloverState.league.europeanCup): unknown => comp ? {
      seasonLabel: comp.seasonLabel,
      pools: comp.pools.map(p => ({ id: p.id, teamIds: p.teamIds, standings: p.standings })),
      fixtures: comp.fixtures.map(f => ({ poolId: f.poolId, round: f.round, homeId: f.homeId, awayId: f.awayId, result: f.result ?? null })),
      knockout: comp.knockout ? {
        championTeamId: comp.knockout.championTeamId,
        r16: comp.knockout.r16.map(m => ({ homeId: m.homeId, awayId: m.awayId, result: m.result ?? null })),
        quarterfinals: comp.knockout.quarterfinals.map(m => ({ homeId: m.homeId, awayId: m.awayId, result: m.result ?? null })),
        semifinals: comp.knockout.semifinals.map(m => ({ homeId: m.homeId, awayId: m.awayId, result: m.result ?? null })),
        final: { homeId: comp.knockout.final.homeId, awayId: comp.knockout.final.awayId, result: comp.knockout.final.result ?? null },
      } : null,
    } : null;
    const europeanSummary = {
      cup: euroSummary(preRolloverState.league.europeanCup),
      shield: euroSummary(preRolloverState.league.europeanShield),
    };

    // Freeze the snapshot BY VALUE at capture time. Several fields hold live
    // references into coordinator state (standings; rollover events carrying
    // whole Player objects), which continue mutating through later seasons —
    // run-vs-run that cancels out, but the save/load round-trip leg swaps
    // coordinators mid-career, freezing the old references while the
    // uninterrupted run keeps mutating them. Value snapshots make the
    // comparison reflect actual game state, not aliasing.
    seasonSnapshots.push(JSON.parse(JSON.stringify({
      seasonLabel,
      finalStandings,
      resultsHash,
      teamStatsHash,
      seasonStatsHash,
      marketSummary,
      budgetSummary,
      playoffSummary,
      premCupSummary,
      europeanSummary,
      // Strip large stable fields from the rollover payload — only the
      // PLAYER_RETIRED rosterIds and PLAYER_AGED deltas matter for the
      // determinism contract; SEASON_ROLLED_OVER's fixture list is
      // already covered via the next season's `finalStandings`.
      rolloverEvents,
    })));

    // Save/load round-trip leg — rebuild the coordinator from its own save
    // after the rollover into the final season.
    if (roundTrip && s === SEASONS - 2) {
      const payload = JSON.parse(JSON.stringify(coord.toSavePayload()));
      coord = GameCoordinator.fromSave(payload, allTeams);
    }
  }

  // Final roster snapshot: every player's baseStats, sorted by rosterId
  // so JSON serialization is order-stable.
  const endState = coord.getState();
  const rosterEntries = Object.keys(endState.career.roster)
    .map(Number)
    .sort((a, b) => a - b)
    .map(rid => ({
      rid,
      baseStats: endState.career.roster[rid].baseStats,
      contract: endState.career.roster[rid].contract,
      morale: endState.career.roster[rid].morale,
    }));

  return createHash('sha256').update(JSON.stringify({
    seasons: seasonSnapshots,
    finalRoster: rosterEntries,
    seasonsCompleted: endState.career.seasonsCompleted,
    archiveLen: endState.career.archive.length,
    freeAgentsFinal: [...endState.career.freeAgents].sort((a, b) => a - b),
  })).digest('hex');
}

const h1 = await runOnce(SEED);
const h2 = await runOnce(SEED);
if (h1 !== h2) {
  console.error(`CAREER DETERMINISM BROKEN\n  run1: ${h1}\n  run2: ${h2}`);
  process.exit(1);
}
const h3 = await runOnce(SEED, true);
if (h3 !== h1) {
  console.error(`SAVE/LOAD ROUND-TRIP BROKEN — a career restored from its own save diverges\n  uninterrupted: ${h1}\n  round-trip:    ${h3}`);
  process.exit(1);
}
console.log(`OK: career deterministic (${SEASONS} seasons, incl. save/load round-trip). seed=0x${SEED.toString(16)} hash=${h1.slice(0, 16)}…`);
