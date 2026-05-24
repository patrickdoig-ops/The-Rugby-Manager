// Game engine orchestrator. Owns the single GameState for a season and is
// the only call site for applySeasonEvent. Analogous to MatchCoordinator,
// but season-scope: lives from "New Game"/"Continue" until session end.
//
// Public surface (every UI call into the game engine goes through one of
// these — there is no other read or write seam):
//
//   Lifecycle / state access
//     GameCoordinator.newSeason(...)        // fresh season
//     GameCoordinator.fromSave(save, teams) // restore via deterministic replay
//     coord.getState()                      // readonly snapshot
//     coord.getCurrentFixture()             // next fixture for the player's team
//     coord.toSavePayload()                 // minimal slice for SaveManager
//
//   In-season per-round
//     coord.recordPlayerMatchResult(...)    // applies result + simulates AI + advances week
//     coord.setPlayerTactics(...)           // persists pre-match tactics commit
//     coord.setPlayerMatchdaySquad(...)     // persists pre-match line-up commit
//
//   Off-season market (Phases 2-7)
//     coord.designateMarquee(clubId, rid)   // tap-to-toggle marquee
//     coord.openRenewalWindow()             // populates state.career.market (renewals)
//     coord.closeRenewalWindow(decisions)   // resolves user + AI renewals
//     coord.openSigningWindow()             // populates state.career.market (signings)
//     coord.signFreeAgent(rosterId)         // user-side signing
//     coord.unsignFreeAgent(rosterId)       // undo an in-window signing
//     coord.preAgreePoach(rosterId)         // user-side Reg 7 pre-agreement
//     coord.cancelPreAgreement(rosterId)    // undo an in-window pre-agreement
//     coord.closeSigningWindow()            // runs AI signing + poaching pass
//     coord.rollSeason()                    // archives season + aging + transfers
//
// "Tick" of the game engine is a player match completing. The engine never
// runs on a timer.

import type {
  ArchivedSeason, ClubState,
  Fixture, FixtureResult, GameState, MarketState, PlayerRef, PreAgreement, SeasonEvent, SeasonSchedule,
} from '../types/gameState';
import { emptyCareerState } from '../types/gameState';
import type { Player } from '../types/player';
import type { TeamTactics } from '../types/team';
import { applySeasonEvent } from './applySeasonEvent';
import type { PreSeasonTransfer } from '../data/transfers-2025-26';
import { simulateFixture } from './simulateFixture';
import { seedRoster } from './rosterSeeder';
import { buildAutoSelectedTeamFromRoster } from './rosterTeamBuilder';
import { parseSeasonStartYear } from './age';
import { collectSeasonEvents, type MatchSnapshot, type PlayerStatsSnapshot } from './seasonStatsCollector';
import { computeRollover } from './careerRollover';
import { seedContractFields } from './contractSeeder';
import { TransferCoordinator } from './TransferCoordinator';
import { eventBus } from '../utils/eventBus';
import { setCareerSeed, rngTransfer } from '../utils/rng';
import { SEASON_VALUES, INJURY_SEVERITY } from '../engine/balance';
import type { InjurySeverity } from '../types/player';
import { PREMIERSHIP_2025_26 } from '../data/fixtures-2025-26';
import type { RawTeamInput } from '../types/teamData';

export type SavedSeasonResult = {
  round: number;
  homeId: string;
  awayId: string;
  playerSide: 'home' | 'away' | null;
  homeScore: number;
  awayScore: number;
  // Added in save v11 for the bonus-points system. Pre-v11 saves default
  // both to 0 on load (no retroactive try-bonus award), see SaveManager.
  homeTries: number;
  awayTries: number;
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
  // v12+: Squad Builder resumption flag. Optional — outside Squad
  // Builder this is always undefined and the field is omitted from the
  // payload, so existing in-season saves stay byte-equivalent.
  preSeasonStep?: 'overview' | 'signings' | 'marquee';
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
  // v9+: per-team season aggregates. Keyed by teamId; one TeamSeasonStats
  // bucket per club. Absent on v8 and older — fromSave falls through to
  // the zeroed buckets created by SEASON_INITIALIZED.
  teamSeasonStats?: Record<string, import('../types/gameState').TeamSeasonStats>;
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
    league: { fixtures: [], results: [], standings: [], teamSeasonStats: {} },
    player: { teamId: '' },
    seed: 0,
    career: emptyCareerState(),
  };
}

export class GameCoordinator {
  private state: GameState;
  private teamsById: Map<string, RawTeamInput>;
  // Off-season market collaborator — owns marquee toggle + renewal /
  // signing / poach window lifecycles. Holds the same `state` reference
  // so mutations are visible across both. The public surface (the
  // delegating methods below) is unchanged so screens that read
  // `getGameEngine: () => GameCoordinator` keep working.
  private transfers: TransferCoordinator;

  private constructor(allTeams: RawTeamInput[]) {
    this.state = emptyState();
    this.teamsById = new Map(allTeams.map(t => [t.id, t]));
    this.transfers = new TransferCoordinator(this.state);
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
        ...(save.career.preSeasonStep !== undefined ? { preSeasonStep: save.career.preSeasonStep } : {}),
        ...(save.teamSeasonStats !== undefined ? { teamSeasonStats: save.teamSeasonStats } : {}),
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

  // ===== Off-season market (Phases 2-7) =====
  //
  // All seven methods delegate to TransferCoordinator. The class lives
  // here as a thin facade so existing screens keep talking to
  // `GameCoordinator` (per the `getGameEngine` getter contract in
  // CLAUDE.md § 4). Full implementations + per-method docs are in
  // src/game/TransferCoordinator.ts.

  designateMarquee(clubId: string, rosterId: number | null): void {
    this.transfers.designateMarquee(clubId, rosterId);
  }

  openRenewalWindow(): void {
    this.transfers.openRenewalWindow();
  }

  closeRenewalWindow(userDecisions: Record<string, 'renew' | 'release'> = {}): void {
    this.transfers.closeRenewalWindow(userDecisions);
  }

  openSigningWindow(opts: { skipPoaches?: boolean } = {}): void {
    this.transfers.openSigningWindow(opts);
  }

  unwindPreSeasonTransfers(transfers: PreSeasonTransfer[]): { matched: number; skipped: number } {
    return this.transfers.unwindPreSeasonTransfers(transfers);
  }

  // Squad Builder resumption flag. Writes go through applySeasonEvent
  // so the mutation boundary holds; the field lives on state.career
  // and is restored via the save layer.
  setPreSeasonStep(step: 'overview' | 'signings' | 'marquee' | null): void {
    applySeasonEvent(this.state, { type: 'PRE_SEASON_STEP_SET', step });
  }

  signFreeAgent(rosterId: number): boolean {
    return this.transfers.signFreeAgent(rosterId);
  }

  unsignFreeAgent(rosterId: number): boolean {
    return this.transfers.unsignFreeAgent(rosterId);
  }

  preAgreePoach(rosterId: number): boolean {
    return this.transfers.preAgreePoach(rosterId);
  }

  cancelPreAgreement(rosterId: number): boolean {
    return this.transfers.cancelPreAgreement(rosterId);
  }

  closeSigningWindow(opts: { skipPoaches?: boolean } = {}): void {
    this.transfers.closeSigningWindow(opts);
  }

  repairAIMarquees(): void {
    this.transfers.repairAIMarquees();
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
    snapshot: MatchSnapshot,
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

    // Injury recovery tick — runs before any new injuries from this round
    // get added. Represents the week of rest between rounds: every player
    // currently injured decrements weeksRemaining by 1; players whose
    // counter would reach 0 fire PLAYER_RECOVERED instead. Order is
    // rosterId-ascending so the season-determinism harness stays clean.
    for (const ev of this.tickInjuryEvents()) {
      applySeasonEvent(this.state, ev);
    }

    const playerSide: 'home' | 'away' = fixture.homeId === this.state.player.teamId ? 'home' : 'away';
    const result: FixtureResult = {
      round,
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      homeScore,
      awayScore,
      homeTries: snapshot.homeSummary.tries,
      awayTries: snapshot.awaySummary.tries,
      playerSide,
    };
    applySeasonEvent(this.state, { type: 'FIXTURE_RESULT_RECORDED', result });
    for (const ev of collectSeasonEvents(snapshot)) {
      applySeasonEvent(this.state, ev);
    }
    for (const ev of this.rollNewInjuryEvents(snapshot.playerSnapshots)) {
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
      const home = buildAutoSelectedTeamFromRoster(this.state, homeJson);
      const away = buildAutoSelectedTeamFromRoster(this.state, awayJson);
      const sim = await simulateFixture(home, away, this.state.seed, f.round);
      const aiResult: FixtureResult = {
        round: f.round,
        homeId: f.homeId,
        awayId: f.awayId,
        homeScore: sim.homeScore,
        awayScore: sim.awayScore,
        homeTries: sim.snapshot.homeSummary.tries,
        awayTries: sim.snapshot.awaySummary.tries,
        playerSide: null,
      };
      applySeasonEvent(this.state, { type: 'FIXTURE_RESULT_RECORDED', result: aiResult });
      for (const ev of collectSeasonEvents(sim.snapshot)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of this.rollNewInjuryEvents(sim.snapshot.playerSnapshots)) {
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

  // Roll severity + weeks for every in-match injury surfaced in the given
  // snapshots. Uses rngTransfer (career stream) so the rolls are independent
  // of the match outcome stream. Walks rosterId-ascending so the call order
  // is stable across runs.
  //
  // Recurrence detection is deferred to a future iteration — v1 always
  // emits isRecurrence: false. The tuning constants
  // (INJURY_RECURRENCE_TIME_LOSS_MULT, etc.) are kept as scaffolding.
  private rollNewInjuryEvents(snapshots: PlayerStatsSnapshot[]): SeasonEvent[] {
    const injured = snapshots
      .filter(s => s.injuryKind !== undefined)
      .sort((a, b) => a.rosterId - b.rosterId);
    const out: SeasonEvent[] = [];
    const injuredOn = this.state.calendar.date;
    for (const s of injured) {
      const kind = s.injuryKind!;
      const profile = INJURY_SEVERITY[kind];
      const severity = pickSeverity(profile.weights);
      const [lo, hi] = profile.bands[severity];
      const weeksRemaining = rngTransfer(lo, hi);
      out.push({
        type: 'PLAYER_INJURED',
        rosterId: s.rosterId,
        kind,
        severity,
        weeksRemaining,
        injuredOn,
        isRecurrence: false,
      });
    }
    return out;
  }

  // Decrement every roster player's `injury.weeksRemaining` by one; fire
  // PLAYER_RECOVERED for any whose counter would reach zero. No RNG —
  // pure walk in rosterId order.
  private tickInjuryEvents(): SeasonEvent[] {
    const out: SeasonEvent[] = [];
    const rosterIds = Object.keys(this.state.career.roster).map(Number).sort((a, b) => a - b);
    for (const rid of rosterIds) {
      const p = this.state.career.roster[rid];
      if (!p.injury) continue;
      if (p.injury.weeksRemaining <= 1) {
        // Decrement to 0 then clear the field. INJURY_TICK_ADVANCED runs
        // first so the per-event trace shows the decrement step.
        if (p.injury.weeksRemaining === 1) {
          out.push({ type: 'INJURY_TICK_ADVANCED', rosterId: rid });
        }
        out.push({ type: 'PLAYER_RECOVERED', rosterId: rid });
      } else {
        out.push({ type: 'INJURY_TICK_ADVANCED', rosterId: rid });
      }
    }
    return out;
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
          ...(a.leaders
            ? { leaders: {
                topTries:   a.leaders.topTries.map(l => ({ ...l })),
                topCarries: a.leaders.topCarries.map(l => ({ ...l })),
                topTackles: a.leaders.topTackles.map(l => ({ ...l })),
                topRating:  a.leaders.topRating.map(l => ({ ...l })),
              } }
            : {}),
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
        ...(this.state.career.preSeasonStep !== undefined
          ? { preSeasonStep: this.state.career.preSeasonStep }
          : {}),
      },
      teamSeasonStats: Object.fromEntries(
        Object.entries(this.state.league.teamSeasonStats).map(([id, s]) => [id, { ...s }]),
      ),
    };
  }
}

// Picks a severity bucket from a per-kind weight table. Uses rngTransfer
// (career stream). Weights sum to 100 by convention; the picker reads
// them in mild → moderate → severe order.
function pickSeverity(weights: Record<InjurySeverity, number>): InjurySeverity {
  const roll = rngTransfer(1, 100);
  let cum = 0;
  cum += weights.mild;
  if (roll <= cum) return 'mild';
  cum += weights.moderate;
  if (roll <= cum) return 'moderate';
  return 'severe';
}

