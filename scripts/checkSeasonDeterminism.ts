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

import { createHash } from 'node:crypto';
import { GameCoordinator } from '../src/game/GameCoordinator.js';
import { simulateFixture } from '../src/game/simulateFixture.js';
import { buildAutoSelectedTeamFromRoster } from '../src/game/rosterTeamBuilder.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import { applyStarBoost } from '../src/team/applyStarBoost.js';
import type { TeamJson } from '../src/team/teamProfile.js';

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

const allTeams = ([
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as TeamJson[]).map(applyStarBoost) as unknown as RawTeamInput[];

async function simulateSeason(coord: GameCoordinator, teamsById: Map<string, RawTeamInput>): Promise<void> {
  while (true) {
    const next = coord.getCurrentFixture();
    if (!next) break;
    const state = coord.getState();
    const homeJson = teamsById.get(next.homeId)!;
    const awayJson = teamsById.get(next.awayId)!;
    const home = buildAutoSelectedTeamFromRoster(state, homeJson);
    const away = buildAutoSelectedTeamFromRoster(state, awayJson);
    const sim = await simulateFixture(home, away, state.seed, next.round);
    await coord.recordPlayerMatchResult(next.round, sim.homeScore, sim.awayScore, sim.snapshot);
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

async function runOnce(seed: number): Promise<string> {
  const coord = GameCoordinator.newSeason(PLAYER_ID, seed, allTeams);
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
    if (s < SEASONS - 1) {
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
      // Phase 5: signing window. AI-only — humanClubId still 'bath',
      // but the harness doesn't sign anyone, so the AI's decideAISignings
      // resolves every other club's signings deterministically.
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
        coord.closeSigningWindow();
        const freeAgentsLeft = [...coord.getState().career.freeAgents].sort((a, b) => a - b);
        marketSummary = { ...marketSummary as object, freeAgentsAfterSignings: freeAgentsLeft };
      }
      rolloverEvents = coord.rollSeason();
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

    seasonSnapshots.push({
      seasonLabel,
      finalStandings,
      resultsHash,
      teamStatsHash,
      seasonStatsHash,
      marketSummary,
      playoffSummary,
      // Strip large stable fields from the rollover payload — only the
      // PLAYER_RETIRED rosterIds and PLAYER_AGED deltas matter for the
      // determinism contract; SEASON_ROLLED_OVER's fixture list is
      // already covered via the next season's `finalStandings`.
      rolloverEvents,
    });
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
console.log(`OK: career deterministic (${SEASONS} seasons). seed=0x${SEED.toString(16)} hash=${h1.slice(0, 16)}…`);
