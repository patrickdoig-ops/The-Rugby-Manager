// Game engine orchestrator. Owns the single GameState for a season and is
// the only call site for applySeasonEvent. Analogous to MatchCoordinator,
// but season-scope: lives from "New Game"/"Continue" until session end.
//
// Public surface:
//   GameCoordinator.newSeason(...)      // fresh season
//   GameCoordinator.fromSave(save)      // restore via deterministic replay
//   coord.getState()                    // readonly snapshot
//   coord.getCurrentFixture()           // next fixture for the player's team
//   coord.recordPlayerMatchResult(...)  // applies result + simulates AI + advances week
//   coord.toSavePayload()               // minimal slice for SaveManager
//
// "Tick" of the game engine is a player match completing. The engine never
// runs on a timer.

import type {
  ArchivedSeason, ClubState,
  Fixture, FixtureResult, GameState, MarketState, PlayerRef, PreAgreement, SeasonEvent, SeasonSchedule, TransferOffer,
} from '../types/gameState';
import { emptyCareerState } from '../types/gameState';
import type { Player } from '../types/player';
import type { TeamTactics } from '../types/team';
import { applySeasonEvent } from './applySeasonEvent';
import { simulateFixture } from './simulateFixture';
import { seedRoster } from './rosterSeeder';
import { buildTeamFromRoster } from './rosterTeamBuilder';
import { parseSeasonStartYear } from './age';
import { collectSeasonEvents, type PlayerStatsSnapshot } from './seasonStatsCollector';
import { computeRollover } from './careerRollover';
import { seedContractFields } from './contractSeeder';
import {
  expiringRosterIds, generateRenewalOffers, decideAIOffers, expiryAfterYears,
  decideAISignings, signingTermsFor,
} from './aiTransferDirector';
import { eventBus } from '../utils/eventBus';
import { setCareerSeed } from '../utils/rng';
import { SEASON_VALUES } from '../engine/balance';
import { PREMIERSHIP_2025_26 } from '../data/fixtures-2025-26';
import type { RawTeamInput } from '../types/teamData';

export type SavedSeasonResult = {
  round: number;
  homeId: string;
  awayId: string;
  playerSide: 'home' | 'away' | null;
  homeScore: number;
  awayScore: number;
};

// v5+: persistent career snapshot — every player's current baseStats +
// the per-club squad pointers. Absent on v4 and older saves; fromSave
// seeds a fresh roster from the JSONs in that case.
//
// v7 adds the optional market layer: `freeAgents` (rosterIds of players
// whose contracts expired without renewal) and `market` (the live
// state of an open market window, null when closed). v5/v6 loads
// default both to []/null via emptyCareerState.
//
// v8 adds `pendingMoves` (PreAgreement[]) for Phase 6 cross-Prem
// poaching. Activated at the next rollover.
export interface SavedCareer {
  seasonsCompleted: number;
  nextRosterId: number;
  clubs: ClubState[];
  roster: Record<number, Player>;
  archive: ArchivedSeason[];
  freeAgents?: number[];
  market?: MarketState | null;
  pendingMoves?: PreAgreement[];
}

export interface SavedSeason {
  playerTeamId: string;
  seed: number;
  currentWeek: number;
  results: SavedSeasonResult[];
  // The fixture list and season label captured at save time. Restored
  // verbatim on load so an edit to the canonical schedule (e.g. fixture
  // re-arrangement) does not corrupt an in-progress season. Optional on
  // the type so legacy v2 saves can still be migrated by SaveManager.
  seasonLabel?: string;
  fixtures?: Fixture[];
  // v4+: persisted pre-match choices that carry forward as defaults for
  // the next match. Both undefined on a fresh season; populated after the
  // first Kick Off.
  tactics?: TeamTactics;
  matchdaySquad?: PlayerRef[];
  // v5+: persistent roster + career history. v4 loads seed fresh from
  // JSONs since pre-v5 there has been zero per-player evolution to
  // preserve.
  career?: SavedCareer;
}

// Deep clone the roster index for save serialisation — every Player and
// its nested PlayerStats / PlayerMatchStats / PlayerSeasonStats. Skip
// volatile per-match fields (currentStats / fatiguePct / rating / x / y /
// matchStats / formModifier) by passing through baseStats only and
// re-zeroing the others on load via initPlayer; but for v5 we keep the
// full Player shape so the load path is uniform. Idle defaults are safe.
function serializeRoster(roster: Record<number, Player>): Record<number, Player> {
  const out: Record<number, Player> = {};
  for (const k of Object.keys(roster)) {
    const p = roster[Number(k)];
    out[Number(k)] = {
      ...p,
      baseStats: { ...p.baseStats },
      currentStats: { ...p.currentStats },
      matchStats: { ...p.matchStats },
      seasonStats: { ...p.seasonStats },
    };
  }
  return out;
}

function emptyState(): GameState {
  return {
    calendar: { date: SEASON_VALUES.startDate, week: 1, seasonLabel: '' },
    league: { fixtures: [], results: [], standings: [] },
    player: { teamId: '' },
    seed: 0,
    career: emptyCareerState(),
  };
}

export class GameCoordinator {
  private state: GameState;
  private teamsById: Map<string, RawTeamInput>;

  private constructor(allTeams: RawTeamInput[]) {
    this.state = emptyState();
    this.teamsById = new Map(allTeams.map(t => [t.id, t]));
  }

  static newSeason(
    playerTeamId: string,
    seed: number,
    allTeams: RawTeamInput[],
    schedule: SeasonSchedule = PREMIERSHIP_2025_26,
  ): GameCoordinator {
    const coord = new GameCoordinator(allTeams);
    setCareerSeed(seed);
    applySeasonEvent(coord.state, {
      type: 'SEASON_INITIALIZED',
      playerTeamId,
      seed: seed >>> 0,
      teamIds: allTeams.map(t => t.id),
      schedule,
    });
    const seeded = seedRoster(allTeams, parseSeasonStartYear(coord.state.calendar.seasonLabel));
    applySeasonEvent(coord.state, {
      type: 'ROSTER_SEEDED',
      roster: seeded.roster,
      clubs: seeded.clubs,
      nextRosterId: seeded.nextRosterId,
    });
    eventBus.emit('game:initialized', { state: coord.state });
    return coord;
  }

  static fromSave(
    save: SavedSeason,
    allTeams: RawTeamInput[],
    schedule: SeasonSchedule = PREMIERSHIP_2025_26,
  ): GameCoordinator {
    const coord = new GameCoordinator(allTeams);
    setCareerSeed(save.seed);
    // Prefer the saved schedule when present (v3+); fall back to the
    // current canonical one for legacy v2 saves that pre-date the field.
    const effectiveSchedule: SeasonSchedule = save.fixtures
      ? { seasonLabel: save.seasonLabel ?? schedule.seasonLabel, fixtures: save.fixtures.map(f => ({ ...f })) }
      : schedule;
    applySeasonEvent(coord.state, {
      type: 'SEASON_INITIALIZED',
      playerTeamId: save.playerTeamId,
      seed: save.seed >>> 0,
      teamIds: allTeams.map(t => t.id),
      schedule: effectiveSchedule,
    });
    // v5+ saves carry the persistent roster + career archive directly.
    // v4 and older predate the roster; seed fresh from JSONs (lossless —
    // pre-v5 there was zero per-player evolution to preserve).
    if (save.career) {
      // v5 → v6 backfill. Saved Players from a v5-era career lack the
      // `contract` + `reputation` fields added in Phase 2. Synthesise
      // them via contractSeeder so the loaded career is usable on v6
      // code paths (ContractsScreen, etc.). The seasonStartYear is
      // derived from the saved season label.
      const seasonStartYear = parseSeasonStartYear(save.seasonLabel ?? coord.state.calendar.seasonLabel);
      const rosterIds = Object.keys(save.career.roster).map(Number).sort((a, b) => a - b);
      for (const rid of rosterIds) {
        const p = save.career.roster[rid];
        if (!p.contract || !p.contract.expiresOn) {
          const club = save.career.clubs.find(c => c.squad.includes(rid));
          const { contract, reputation } = seedContractFields(p, club?.id ?? '', seasonStartYear);
          p.contract = contract;
          if (typeof p.reputation !== 'number') p.reputation = reputation;
        }
      }
      applySeasonEvent(coord.state, {
        type: 'ROSTER_SEEDED',
        roster: save.career.roster,
        clubs: save.career.clubs.map(c => ({ id: c.id, squad: [...c.squad] })),
        nextRosterId: save.career.nextRosterId,
      });
      // ROSTER_SEEDED only repopulates the roster + clubs. Cumulative
      // career counters (seasonsCompleted, archive) and the market
      // layer (freeAgents + market) are restored through
      // CAREER_ARCHIVE_RESTORED so every state.career.* write stays
      // inside applySeasonEvent — no mutation-boundary carveout. v5/v6
      // saves omit freeAgents + market; the event handler leaves them
      // at their emptyCareerState defaults in that case.
      applySeasonEvent(coord.state, {
        type: 'CAREER_ARCHIVE_RESTORED',
        seasonsCompleted: save.career.seasonsCompleted,
        archive: save.career.archive,
        ...(save.career.freeAgents !== undefined ? { freeAgents: save.career.freeAgents } : {}),
        ...(save.career.market !== undefined ? { market: save.career.market } : {}),
        ...(save.career.pendingMoves !== undefined ? { pendingMoves: save.career.pendingMoves } : {}),
      });
    } else {
      const seeded = seedRoster(allTeams, parseSeasonStartYear(coord.state.calendar.seasonLabel));
      applySeasonEvent(coord.state, {
        type: 'ROSTER_SEEDED',
        roster: seeded.roster,
        clubs: seeded.clubs,
        nextRosterId: seeded.nextRosterId,
      });
    }
    // Replay results in round order, then advance week to match the snapshot.
    const ordered = [...save.results].sort((a, b) => a.round - b.round);
    for (const r of ordered) {
      applySeasonEvent(coord.state, {
        type: 'FIXTURE_RESULT_RECORDED',
        result: { ...r },
      });
    }
    while (coord.state.calendar.week < save.currentWeek) {
      applySeasonEvent(coord.state, { type: 'WEEK_ADVANCED' });
    }
    if (save.tactics) {
      applySeasonEvent(coord.state, { type: 'PLAYER_TACTICS_SET', tactics: save.tactics });
    }
    if (save.matchdaySquad) {
      applySeasonEvent(coord.state, { type: 'PLAYER_MATCHDAY_SQUAD_SET', squad: save.matchdaySquad });
    }
    eventBus.emit('game:initialized', { state: coord.state });
    return coord;
  }

  setPlayerTactics(tactics: TeamTactics): void {
    applySeasonEvent(this.state, { type: 'PLAYER_TACTICS_SET', tactics });
  }

  setPlayerMatchdaySquad(squad: PlayerRef[]): void {
    applySeasonEvent(this.state, { type: 'PLAYER_MATCHDAY_SQUAD_SET', squad });
  }

  // Re-designate the marquee slot for a club. Clears the previous
  // marquee on that squad and sets the new one. Pass `rosterId: null`
  // to clear without re-designating.
  designateMarquee(clubId: string, rosterId: number | null): void {
    applySeasonEvent(this.state, { type: 'MARQUEE_DESIGNATED', clubId, rosterId });
  }

  // Open the end-of-season renewal window. Seeds state.career.market
  // with one TransferOffer per expiring player league-wide, status
  // 'pending'. Idempotent — re-opening with the window already open
  // returns without changes. If there are no expiring players, the
  // window doesn't open at all (caller can skip the screen).
  openRenewalWindow(): void {
    if (this.state.career.market) return;
    const expiring = expiringRosterIds(this.state);
    if (expiring.length === 0) return;
    const offers = generateRenewalOffers(this.state);
    applySeasonEvent(this.state, {
      type: 'MARKET_OPENED',
      phase: 'renewals',
      expiringRosterIds: expiring,
      offers,
    });
  }

  // Close the renewal window: gather decisions, apply CONTRACT_EXTENDED
  // for accepts and CONTRACT_TERMINATED ('expired') for rejects, then
  // fire MARKET_CLOSED.
  //
  // `userDecisions` keys are offer IDs (only those belonging to the
  // player's club take effect); values are 'renew' or 'release'. Any
  // unsupplied offer falls back to the AI default for its club.
  closeRenewalWindow(userDecisions: Record<string, 'renew' | 'release'> = {}): void {
    const market = this.state.career.market;
    if (!market) return;
    const playerClubId = this.state.player.teamId;

    // Gather decisions per offer ID. AI decides everywhere first,
    // then the user can override only their own club's offers.
    const decisions = new Map<string, boolean>();
    for (const club of this.state.career.clubs) {
      const { acceptIds, rejectIds } = decideAIOffers(this.state, club.id);
      for (const id of acceptIds) decisions.set(id, true);
      for (const id of rejectIds) decisions.set(id, false);
    }
    for (const [id, choice] of Object.entries(userDecisions)) {
      const offer = market.offers.find(o => o.id === id);
      if (offer && offer.fromClubId === playerClubId) {
        decisions.set(id, choice === 'renew');
      }
    }

    // Apply in the offer-list order so the event log is stable.
    for (const offer of market.offers) {
      if (offer.status !== 'pending') continue;
      const accept = decisions.get(offer.id) ?? false;
      applySeasonEvent(this.state, {
        type: 'OFFER_RESPONDED',
        offerId: offer.id,
        accept,
        ...(accept ? {} : { reason: 'cap_overcommit' as const }),
      });
      if (accept) {
        applySeasonEvent(this.state, {
          type: 'CONTRACT_EXTENDED',
          rosterId: offer.rosterId,
          newExpiresOn: expiryAfterYears(this.state, offer.lengthYears),
          newAnnualWage: offer.annualWage,
        });
      } else {
        applySeasonEvent(this.state, {
          type: 'CONTRACT_TERMINATED',
          rosterId: offer.rosterId,
          reason: 'expired',
        });
      }
    }

    applySeasonEvent(this.state, { type: 'MARKET_CLOSED' });
  }

  // ===== Free-agent signings (Phase 5) =====

  // Opens the signing window. Pre-computes one TransferOffer per
  // free agent (asking-wage every club sees) in stable rosterId order
  // — advances rngTransfer twice per FA via contractSeeder, deterministic.
  // Idempotent — no-op if window is already open or freeAgents is empty.
  //
  // Stores offers on state.career.market so subsequent renders +
  // signFreeAgent reads + the AI close pass all see identical terms.
  openSigningWindow(): void {
    if (this.state.career.market) return;
    if (this.state.career.freeAgents.length === 0) return;
    const seasonStartYear = parseSeasonStartYear(this.state.calendar.seasonLabel);
    const sortedFAs = [...this.state.career.freeAgents].sort((a, b) => a - b);
    const offers: TransferOffer[] = [];
    for (const rid of sortedFAs) {
      const terms = signingTermsFor(this.state, rid, this.state.player.teamId);
      if (!terms) continue;
      offers.push({
        id: `s${this.state.career.seasonsCompleted}_${rid}`,
        fromClubId: '',  // free agents aren't tied to any particular bidder until accepted
        rosterId: rid,
        annualWage: terms.annualWage,
        lengthYears: terms.lengthYears,
        isMarquee: false,
        status: 'pending',
      });
    }
    applySeasonEvent(this.state, {
      type: 'MARKET_OPENED',
      phase: 'signings',
      expiringRosterIds: [],
      offers,
    });
  }

  // User-side sign. Looks up the cached offer for `rosterId` in the
  // open signing window and fires CONTRACT_SIGNED at those terms.
  // Returns false if no window is open, no cached offer exists, or
  // the player is no longer a free agent.
  //
  // No cap-affordability gate — the user can deliberately overspend.
  signFreeAgent(rosterId: number): boolean {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return false;
    if (!this.state.career.freeAgents.includes(rosterId)) return false;
    const offer = market.offers.find(o => o.rosterId === rosterId && o.status === 'pending');
    if (!offer) return false;
    applySeasonEvent(this.state, {
      type: 'CONTRACT_SIGNED',
      rosterId,
      clubId: this.state.player.teamId,
      expiresOn: expiryAfterYears(this.state, offer.lengthYears),
      annualWage: offer.annualWage,
    });
    return true;
  }

  // Closes the signing window. Runs the AI's signing pass over
  // whatever free agents remain (decideAISignings), fires CONTRACT_SIGNED
  // for each, then fires MARKET_CLOSED to clear state.career.market.
  closeSigningWindow(): void {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return;
    const humanClubId = this.state.player.teamId;
    const signings = decideAISignings(this.state, humanClubId);
    for (const s of signings) {
      applySeasonEvent(this.state, {
        type: 'CONTRACT_SIGNED',
        rosterId: s.rosterId,
        clubId: s.clubId,
        expiresOn: s.expiresOn,
        annualWage: s.annualWage,
      });
    }
    applySeasonEvent(this.state, { type: 'MARKET_CLOSED' });
  }

  getState(): Readonly<GameState> {
    return this.state;
  }

  // The player's next unplayed fixture (lowest round number). Null when the
  // season is complete.
  getCurrentFixture(): Fixture | null {
    const playerId = this.state.player.teamId;
    const played = new Set(this.state.league.results.map(r => r.round));
    const upcoming = this.state.league.fixtures
      .filter(f => (f.homeId === playerId || f.awayId === playerId) && !played.has(f.round))
      .sort((a, b) => a.round - b.round);
    return upcoming[0] ?? null;
  }

  // playerSnapshots is required so the season-aggregate path can't be
  // silently bypassed by a future caller that forgets to pass it. Use an
  // empty array if you genuinely have nothing to record (e.g. a forfeit
  // path with no per-player stats — not a thing today).
  async recordPlayerMatchResult(
    round: number,
    homeScore: number,
    awayScore: number,
    playerSnapshots: PlayerStatsSnapshot[],
  ): Promise<void> {
    const fixture = this.state.league.fixtures.find(f =>
      f.round === round && (f.homeId === this.state.player.teamId || f.awayId === this.state.player.teamId)
    );
    if (!fixture) throw new Error(`No player fixture for round ${round}`);

    // Re-entrancy guard. The match-result screen's Continue button kicks off
    // an async handler (player result → 4 headless AI sims → WEEK_ADVANCED),
    // and the button isn't disabled while that work runs. A double-click
    // would otherwise double-apply every standings update for the round and
    // tick the calendar twice. The player result is recorded first, so its
    // presence is a reliable signal that the round is already in flight.
    const alreadyRecorded = this.state.league.results.some(r =>
      r.round === round && r.homeId === fixture.homeId && r.awayId === fixture.awayId
    );
    if (alreadyRecorded) return;

    const playerSide: 'home' | 'away' = fixture.homeId === this.state.player.teamId ? 'home' : 'away';
    const result: FixtureResult = {
      round,
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      homeScore,
      awayScore,
      playerSide,
    };
    applySeasonEvent(this.state, { type: 'FIXTURE_RESULT_RECORDED', result });
    for (const ev of collectSeasonEvents(playerSnapshots)) {
      applySeasonEvent(this.state, ev);
    }
    eventBus.emit('game:fixtureRecorded', { result, state: this.state });

    // Headless-simulate every other fixture in this round so the league table
    // reflects a full round of results. Sims run in fixture order; each derives
    // its own seed from (rootSeed, round, homeId, awayId).
    const aiFixtures = this.state.league.fixtures.filter(f =>
      f.round === round &&
      f.homeId !== this.state.player.teamId &&
      f.awayId !== this.state.player.teamId
    );
    for (const f of aiFixtures) {
      const homeJson = this.teamsById.get(f.homeId);
      const awayJson = this.teamsById.get(f.awayId);
      if (!homeJson || !awayJson) continue;
      const home = buildTeamFromRoster(this.state, homeJson);
      const away = buildTeamFromRoster(this.state, awayJson);
      const sim = await simulateFixture(home, away, this.state.seed, f.round);
      const aiResult: FixtureResult = {
        round: f.round,
        homeId: f.homeId,
        awayId: f.awayId,
        homeScore: sim.homeScore,
        awayScore: sim.awayScore,
        playerSide: null,
      };
      applySeasonEvent(this.state, { type: 'FIXTURE_RESULT_RECORDED', result: aiResult });
      for (const ev of collectSeasonEvents(sim.playerSnapshots)) {
        applySeasonEvent(this.state, ev);
      }
      eventBus.emit('game:fixtureRecorded', { result: aiResult, state: this.state });
    }

    applySeasonEvent(this.state, { type: 'WEEK_ADVANCED' });
    eventBus.emit('game:weekAdvanced', { state: this.state });

    // No more player fixtures after this round → fire the season-complete
    // signal so the post-match Continue chain (LeagueTable → ...) reroutes
    // through EndOfSeasonScreen instead of landing back on Hub.
    if (this.getCurrentFixture() === null) {
      eventBus.emit('game:seasonComplete', { state: this.state });
    }
  }

  // Advance the persistent career one full season. Ages every player,
  // resolves retirements via RETIREMENT_CURVE, archives the just-finished
  // standings + season awards, and replaces league.fixtures with a fresh
  // circle-method schedule (with synthetic Sept-May weekly dates).
  //
  // Returns the SeasonEvent list it applied so the caller can render the
  // diff (retirements + per-player stat changes) in RolloverScreen.
  // Called by main.ts on the EndOfSeason → Rollover transition.
  // Idempotency: relies on the caller — once SEASON_ROLLED_OVER is
  // applied, the league.fixtures and seasonLabel are the new season's;
  // a second call would roll forward again.
  rollSeason(): SeasonEvent[] {
    const events = computeRollover(this.state, [...this.teamsById.keys()]);
    for (const ev of events) applySeasonEvent(this.state, ev);
    return events;
  }

  toSavePayload(): SavedSeason {
    return {
      playerTeamId: this.state.player.teamId,
      seed: this.state.seed,
      currentWeek: this.state.calendar.week,
      results: this.state.league.results.map(r => ({ ...r })),
      seasonLabel: this.state.calendar.seasonLabel,
      fixtures: this.state.league.fixtures.map(f => ({ ...f })),
      ...(this.state.player.tactics ? { tactics: { ...this.state.player.tactics } } : {}),
      ...(this.state.player.matchdaySquad
        ? { matchdaySquad: this.state.player.matchdaySquad.map(r => ({ ...r })) }
        : {}),
      career: {
        seasonsCompleted: this.state.career.seasonsCompleted,
        nextRosterId: this.state.career.nextRosterId,
        clubs: this.state.career.clubs.map(c => ({ id: c.id, squad: [...c.squad] })),
        roster: serializeRoster(this.state.career.roster),
        archive: this.state.career.archive.map(a => ({
          seasonLabel: a.seasonLabel,
          standings: a.standings.map(s => ({ ...s })),
          topScorerRosterId: a.topScorerRosterId,
          mvpRosterId: a.mvpRosterId,
        })),
        freeAgents: [...this.state.career.freeAgents],
        market: this.state.career.market
          ? {
              phase: this.state.career.market.phase,
              openedAfterSeason: this.state.career.market.openedAfterSeason,
              expiringRosterIds: [...this.state.career.market.expiringRosterIds],
              offers: this.state.career.market.offers.map(o => ({ ...o })),
            }
          : null,
        pendingMoves: this.state.career.pendingMoves.map(m => ({ ...m })),
      },
    };
  }
}

