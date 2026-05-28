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
  Fixture, FixtureResult, GameState, MarketState, PlayerRef, PlayoffMatch, PlayoffState, PreAgreement, SeasonEvent, SeasonSchedule,
} from '../types/gameState';
import { emptyCareerState } from '../types/gameState';
import { sortStandings } from './leagueTable';
import type { Player } from '../types/player';
import type { TeamTactics } from '../types/team';
import type { TrainingPlan } from '../types/training';
import { applySeasonEvent } from './applySeasonEvent';
import type { PreSeasonTransfer } from '../data/transfers-2025-26';
import { simulateFixture } from './simulateFixture';
import { seedRoster } from './rosterSeeder';
import { buildAutoSelectedTeamFromRoster } from './rosterTeamBuilder';
import { parseSeasonStartYear, seasonOpenIso } from './age';
import { collectSeasonEvents, collectConditionEvents, type MatchSnapshot, type PlayerStatsSnapshot } from './seasonStatsCollector';
import { computeTrainingWeek } from './trainingWeek';
import { computeRollover } from './careerRollover';
import { generatePersona } from './personaGenerator';
import { resolveSchedule, backfillCareerContracts, buildRosterSeededEvent, buildCareerArchiveRestoredEvent } from './saveMigration';
import { TransferCoordinator } from './TransferCoordinator';
import { computeBudgetEvents } from './budgetPlanner';
import { eventBus } from '../utils/eventBus';
import { setCareerSeed, rngTransfer } from '../utils/rng';
import { SEASON_VALUES, INJURY_SEVERITY, STARTER_FA_POOL } from '../engine/balance';
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
  // v14+: clubIds taken over so far (Newcastle Red Bull at year 2;
  // random investor takeovers from year 3+). Pre-v14 saves migrate as
  // []. Each taken-over club is excluded from future random rolls.
  takeoverHistory?: string[];
  // v16+: per-rosterId mid-season FA rejection cooldown. Pre-v16 saves
  // migrate as {} (no historical cooldowns known). Cleared at the next
  // SEASON_ROLLED_OVER along with the FA pool reshuffle.
  midseasonRejections?: Record<number, number>;
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
  // v18+: persisted training plan from the last training-week screen.
  // Undefined on a fresh save / pre-v18 load — TrainingScreen falls back
  // to DEFAULT_TRAINING_PLAN.
  training?: TrainingPlan;
  // v5+: persistent roster + career history. v4 loads seed fresh from
  // JSONs since pre-v5 there has been zero per-player evolution to
  // preserve.
  career?: SavedCareer;
  // v9+: per-team season aggregates. Keyed by teamId; one TeamSeasonStats
  // bucket per club. Absent on v8 and older — fromSave falls through to
  // the zeroed buckets created by SEASON_INITIALIZED.
  teamSeasonStats?: Record<string, import('../types/gameState').TeamSeasonStats>;
  // v13+: the active playoff bracket. Top-level (not under `career`)
  // because it lives on `state.league.playoffs`. null when no bracket
  // is active (e.g. mid-regular-season); absent on pre-v13 saves.
  playoffs?: PlayoffState | null;
}

// Deep clone the roster index for save serialisation — every Player and
// its nested PlayerStats / PlayerMatchStats / PlayerSeasonStats. Skip


function emptyState(): GameState {
  return {
    calendar: { date: SEASON_VALUES.startDate, week: 1, seasonLabel: '' },
    league: { fixtures: [], results: [], standings: [], teamSeasonStats: {}, playoffs: null },
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
    const seasonStartYear = parseSeasonStartYear(coord.state.calendar.seasonLabel);
    const seeded = seedRoster(allTeams, seasonStartYear);
    applySeasonEvent(coord.state, {
      type: 'ROSTER_SEEDED',
      roster: seeded.roster,
      clubs: seeded.clubs,
      nextRosterId: seeded.nextRosterId,
    });
    // Seed a small starter free-agent pool so Hub → Transfers has
    // something to scout from day one. Uses the same persona generator
    // as the rollover-time foreign imports; lower rating ceiling +
    // wider age band gives a journeyman feel. fromSave skips this —
    // the saved state already carries whatever FA pool the career has
    // since accumulated.
    coord.seedStarterFreeAgentPool(seasonStartYear);
    eventBus.emit('game:initialized', { state: coord.state });
    return coord;
  }

  // Generates STARTER_FA_POOL.count free agents via personaGenerator
  // and applies one FOREIGN_IMPORT_ARRIVED per persona. RNG flows
  // through rngTransfer so seed → identical pool every run.
  private seedStarterFreeAgentPool(seasonStartYear: number): void {
    const count = rngTransfer(STARTER_FA_POOL.count.min, STARTER_FA_POOL.count.max);
    const calendarAnchor = seasonOpenIso(seasonStartYear);
    let nextRid = this.state.career.nextRosterId;
    for (let i = 0; i < count; i++) {
      const player = generatePersona(
        { rosterId: nextRid, ageBand: STARTER_FA_POOL.ageBand, ratingBand: STARTER_FA_POOL.ratingBand },
        calendarAnchor,
      );
      applySeasonEvent(this.state, { type: 'FOREIGN_IMPORT_ARRIVED', player });
      nextRid += 1;
    }
  }

  static fromSave(
    save: SavedSeason,
    allTeams: RawTeamInput[],
    schedule: SeasonSchedule = PREMIERSHIP_2025_26,
  ): GameCoordinator {
    const coord = new GameCoordinator(allTeams);
    setCareerSeed(save.seed);
    applySeasonEvent(coord.state, {
      type: 'SEASON_INITIALIZED',
      playerTeamId: save.playerTeamId,
      seed: save.seed >>> 0,
      teamIds: allTeams.map(t => t.id),
      schedule: resolveSchedule(save, schedule),
    });
    // v5+ saves carry the persistent roster + career archive directly.
    // v4 and older predate the roster; seed fresh from JSONs (lossless —
    // pre-v5 there was zero per-player evolution to preserve). The
    // version-ladder back-fill (contracts, budgets, optional market /
    // playoff layers) lives in saveMigration.ts; these calls just replay
    // the resulting events through the season mutation boundary.
    if (save.career) {
      const seasonStartYear = parseSeasonStartYear(save.seasonLabel ?? coord.state.calendar.seasonLabel);
      backfillCareerContracts(save.career, seasonStartYear);
      applySeasonEvent(coord.state, buildRosterSeededEvent(save.career));
      applySeasonEvent(coord.state, buildCareerArchiveRestoredEvent(save));
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
    if (save.training) {
      applySeasonEvent(coord.state, { type: 'PLAYER_TRAINING_PLAN_SET', plan: save.training });
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

  // Applies one week of training league-wide. Emits one PLAYER_TRAINING_PLAN_SET
  // (so the manager's choice persists) then walks every club (id-ascending) and
  // every player on each club's squad (rosterId-ascending), firing one
  // PLAYER_TRAINED per non-injured player plus optional PLAYER_INJURED from
  // training-injury rolls. AI clubs get their plan from aiTrainingDirector.
  // RNG flows through rngTransfer; stable iteration order keeps it
  // deterministic across runs. Called by TrainingScreen's Continue handler
  // in the post-match navigation chain (between LeagueTable and Hub).
  applyTrainingWeek(userPlan: TrainingPlan): void {
    for (const ev of computeTrainingWeek(this.state, userPlan)) {
      applySeasonEvent(this.state, ev);
    }
    eventBus.emit('game:trainingApplied', { state: this.state });
  }

  // Persists the manager's training plan without executing training. Used
  // by the Hub-tile mid-week entry into TrainingScreen — the user is
  // editing next week's default, not running an extra session.
  setPlayerTrainingPlan(plan: TrainingPlan): void {
    applySeasonEvent(this.state, { type: 'PLAYER_TRAINING_PLAN_SET', plan });
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

  // Competitive signing flow (Phase 10) — thin delegates onto
  // TransferCoordinator. UI calls these between rounds; per-method
  // docs live on the TransferCoordinator class.
  submitBid(rosterId: number): boolean {
    return this.transfers.submitBid(rosterId);
  }

  withdrawBid(rosterId: number): boolean {
    return this.transfers.withdrawBid(rosterId);
  }

  submitRetentionBid(rosterId: number): boolean {
    return this.transfers.submitRetentionBid(rosterId);
  }

  withdrawRetentionBid(rosterId: number): boolean {
    return this.transfers.withdrawRetentionBid(rosterId);
  }

  getUserRetentionPrompts(): number[] {
    return this.transfers.getUserRetentionPrompts();
  }

  runAIBidPass(): void {
    this.transfers.runAIBidPass();
  }

  runAIRetentionPass(): void {
    this.transfers.runAIRetentionPass();
  }

  resolveSigningRound() {
    return this.transfers.resolveSigningRound();
  }

  hasViableSigningOptions(): boolean {
    return this.transfers.hasViableSigningOptions();
  }

  closeSigningWindow(opts: { skipPoaches?: boolean } = {}): void {
    this.transfers.closeSigningWindow(opts);
  }

  // Mid-season FA signings (Hub → Transfers). Pure delegates onto
  // TransferCoordinator; per-method docs live there.
  openMidseasonSigningWindow(): void {
    this.transfers.openMidseasonSigningWindow();
  }

  closeMidseasonSigningWindow(): void {
    this.transfers.closeMidseasonSigningWindow();
  }

  runMidseasonSigning() {
    return this.transfers.runMidseasonSigning();
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
      homeStats: snapshot.homeSummary,
      awayStats: snapshot.awaySummary,
    };
    applySeasonEvent(this.state, { type: 'FIXTURE_RESULT_RECORDED', result });
    for (const ev of collectSeasonEvents(snapshot)) {
      applySeasonEvent(this.state, ev);
    }
    for (const ev of collectConditionEvents(snapshot)) {
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
        homeStats: sim.snapshot.homeSummary,
        awayStats: sim.snapshot.awaySummary,
      };
      applySeasonEvent(this.state, { type: 'FIXTURE_RESULT_RECORDED', result: aiResult });
      for (const ev of collectSeasonEvents(sim.snapshot)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of collectConditionEvents(sim.snapshot)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of this.rollNewInjuryEvents(sim.snapshot.playerSnapshots)) {
        applySeasonEvent(this.state, ev);
      }
      eventBus.emit('game:fixtureRecorded', { result: aiResult, state: this.state });
    }

    applySeasonEvent(this.state, { type: 'WEEK_ADVANCED' });
    eventBus.emit('game:weekAdvanced', { state: this.state });

    // Last regular-season fixture just resolved → seed the playoff
    // bracket from the final standings. game:bracketSeeded is the post-
    // match chain's trigger to route through PlayoffBracketScreen
    // instead of straight to Hub. The end-of-season chain (EndOfSeason
    // → Renewals → Signings → Rollover) is now triggered later, after
    // the season final resolves and fires game:seasonComplete.
    if (this.allRegularFixturesPlayed() && this.state.league.playoffs === null) {
      this.seedPlayoffBracket();
    }
  }

  // True when every fixture in league.fixtures (regular season) has a
  // result. Plays the role getCurrentFixture() === null used to play,
  // but is league-wide rather than player-only — the bracket seeds off
  // the league's final standings, not just the player's results.
  private allRegularFixturesPlayed(): boolean {
    return this.state.league.fixtures.every(f =>
      this.state.league.results.some(r =>
        r.round === f.round && r.homeId === f.homeId && r.awayId === f.awayId
      )
    );
  }

  // Seeds the bracket from the final regular-season standings (top 4).
  // Idempotent — exits early if already seeded or the regular season
  // isn't done. Public so the determinism harness can call it directly.
  seedPlayoffBracket(): void {
    if (this.state.league.playoffs !== null) return;
    if (!this.allRegularFixturesPlayed()) return;
    const top4 = sortStandings(this.state.league.standings).slice(0, 4);
    if (top4.length < 4) return;
    const [s1, s2, s3, s4] = top4;
    // Real-world league cadence: SFs the weekend after R18, final
    // the weekend after the SFs. Anchored to the last R18 fixture date
    // when available; falls back to the current calendar date.
    const r18LastDate = this.state.league.fixtures
      .filter(f => f.round === 18 && f.date)
      .map(f => f.date!)
      .sort()
      .pop() ?? this.state.calendar.date;
    const sfDate    = addDaysIso(r18LastDate, 6);
    const finalDate = addDaysIso(r18LastDate, 13);
    const semifinals: [PlayoffMatch, PlayoffMatch] = [
      {
        kind: 'semifinal_1',
        homeId: s1.teamId, awayId: s4.teamId,
        homeSeed: 1, awaySeed: 4,
        date: sfDate,
      },
      {
        kind: 'semifinal_2',
        homeId: s2.teamId, awayId: s3.teamId,
        homeSeed: 2, awaySeed: 3,
        date: sfDate,
      },
    ];
    const final: PlayoffMatch = {
      kind: 'final',
      homeId: null, awayId: null,
      homeSeed: null, awaySeed: null,
      date: finalDate,
    };
    applySeasonEvent(this.state, { type: 'PLAYOFF_BRACKET_SEEDED', semifinals, final });
    eventBus.emit('game:bracketSeeded', { state: this.state });
  }

  // Returns the next unresolved playoff match where the player's team is
  // involved, walking SF1 → SF2 → Final. Null when the player is not in
  // playoffs or their playoff run is complete (lost an SF, or won the
  // Final). The Final entry can still be returned with homeId/awayId
  // unset — call sites should treat that as "not yet decided".
  getPlayerPlayoffMatch(): PlayoffMatch | null {
    const playoffs = this.state.league.playoffs;
    if (!playoffs) return null;
    const playerId = this.state.player.teamId;
    const isPlayer = (m: PlayoffMatch): boolean =>
      (m.homeId === playerId || m.awayId === playerId) && !m.result;
    if (isPlayer(playoffs.semifinals[0])) return playoffs.semifinals[0];
    if (isPlayer(playoffs.semifinals[1])) return playoffs.semifinals[1];
    if (isPlayer(playoffs.final))         return playoffs.final;
    return null;
  }

  // Records the player's playoff result. Mirrors recordPlayerMatchResult's
  // shape (idempotency guard, injury tick + roll, per-player + per-team
  // stats accumulation) but writes through PLAYOFF_RESULT_RECORDED instead
  // of FIXTURE_RESULT_RECORDED, so league standings are not touched.
  // Fires game:seasonComplete when the final resolves.
  async recordPlayerPlayoffResult(
    kind: 'semifinal_1' | 'semifinal_2' | 'final',
    homeScore: number,
    awayScore: number,
    snapshot: MatchSnapshot,
  ): Promise<void> {
    const playoffs = this.state.league.playoffs;
    if (!playoffs) throw new Error('No active playoff bracket');
    const target = kind === 'semifinal_1' ? playoffs.semifinals[0]
                 : kind === 'semifinal_2' ? playoffs.semifinals[1]
                 : playoffs.final;
    if (target.result) return; // idempotency guard
    if (!target.homeId || !target.awayId) {
      throw new Error(`Playoff match ${kind} has no teams yet`);
    }

    // Injury tick — represents the week of rest between matches. Same
    // pattern as recordPlayerMatchResult so cumulative recovery is
    // continuous across regular season → playoffs.
    for (const ev of this.tickInjuryEvents()) {
      applySeasonEvent(this.state, ev);
    }

    const playerSide: 'home' | 'away' = target.homeId === this.state.player.teamId ? 'home' : 'away';
    applySeasonEvent(this.state, {
      type: 'PLAYOFF_RESULT_RECORDED',
      kind,
      homeScore,
      awayScore,
      homeTries: snapshot.homeSummary.tries,
      awayTries: snapshot.awaySummary.tries,
      playerSide,
    });
    for (const ev of collectSeasonEvents(snapshot)) {
      applySeasonEvent(this.state, ev);
    }
    for (const ev of collectConditionEvents(snapshot)) {
      applySeasonEvent(this.state, ev);
    }
    for (const ev of this.rollNewInjuryEvents(snapshot.playerSnapshots)) {
      applySeasonEvent(this.state, ev);
    }
    eventBus.emit('game:playoffsUpdated', { state: this.state });

    if (this.state.league.playoffs?.championTeamId !== null && this.state.league.playoffs?.championTeamId !== undefined) {
      eventBus.emit('game:seasonComplete', { state: this.state });
    }
  }

  // Sims (silent) every pending AI-vs-AI match in the given stage.
  // Stage 'sf' covers SF1 + SF2; stage 'final' covers the Final. Skips
  // any match the player's team is in — those go through
  // recordPlayerPlayoffResult instead. Fires game:playoffsUpdated for
  // each, plus game:seasonComplete once the Final resolves.
  async simulatePendingPlayoffMatches(stage: 'sf' | 'final'): Promise<void> {
    const playoffs = this.state.league.playoffs;
    if (!playoffs) return;
    const playerId = this.state.player.teamId;
    const matches = stage === 'sf'
      ? [playoffs.semifinals[0], playoffs.semifinals[1]]
      : [playoffs.final];
    const pseudoRound = stage === 'sf' ? 19 : 20;
    for (const match of matches) {
      if (match.result) continue;
      if (!match.homeId || !match.awayId) continue;
      if (match.homeId === playerId || match.awayId === playerId) continue;
      const homeJson = this.teamsById.get(match.homeId);
      const awayJson = this.teamsById.get(match.awayId);
      if (!homeJson || !awayJson) continue;
      const home = buildAutoSelectedTeamFromRoster(this.state, homeJson);
      const away = buildAutoSelectedTeamFromRoster(this.state, awayJson);
      const sim = await simulateFixture(
        home, away, this.state.seed, pseudoRound,
        { neutralVenue: match.kind === 'final' },
      );
      applySeasonEvent(this.state, {
        type: 'PLAYOFF_RESULT_RECORDED',
        kind: match.kind,
        homeScore: sim.homeScore,
        awayScore: sim.awayScore,
        homeTries:  sim.snapshot.homeSummary.tries,
        awayTries:  sim.snapshot.awaySummary.tries,
        playerSide: null,
      });
      for (const ev of collectSeasonEvents(sim.snapshot)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of collectConditionEvents(sim.snapshot)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of this.rollNewInjuryEvents(sim.snapshot.playerSnapshots)) {
        applySeasonEvent(this.state, ev);
      }
      eventBus.emit('game:playoffsUpdated', { state: this.state });
    }
    if (this.state.league.playoffs?.championTeamId !== null && this.state.league.playoffs?.championTeamId !== undefined) {
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

  // Computes + applies the next season's salaryBudget per club and any
  // takeover boosts. Fired in the off-season chain BEFORE renewals so
  // the player + AI both see the new budgets when making wage
  // decisions. Returns the events applied so the UI (BudgetRevealScreen
  // + TakeoverRevealScreen) can render the diff.
  prepareBudgetsForNextSeason(): SeasonEvent[] {
    const events = computeBudgetEvents(this.state);
    for (const ev of events) applySeasonEvent(this.state, ev);
    return events;
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
      ...(this.state.player.training ? { training: { ...this.state.player.training } } : {}),
      career: {
        seasonsCompleted: this.state.career.seasonsCompleted,
        nextRosterId: this.state.career.nextRosterId,
        clubs: this.state.career.clubs.map(c => ({ id: c.id, squad: [...c.squad], salaryBudget: c.salaryBudget })),
        roster: this.state.career.roster,
        archive: this.state.career.archive.map(a => ({
          seasonLabel: a.seasonLabel,
          standings: a.standings.map(s => ({ ...s })),
          topScorerRosterId: a.topScorerRosterId,
          mvpRosterId: a.mvpRosterId,
          championTeamId: a.championTeamId,
          ...(a.leaders
            ? { leaders: {
                topTries:   a.leaders.topTries.map(l => ({ ...l })),
                topCarries: a.leaders.topCarries.map(l => ({ ...l })),
                topTackles: a.leaders.topTackles.map(l => ({ ...l })),
                topRating:  a.leaders.topRating.map(l => ({ ...l })),
              } }
            : {}),
          ...(a.playerSeasonHistory
            ? { playerSeasonHistory: clonePlayerHistoryForSave(a.playerSeasonHistory) }
            : {}),
        })),
        freeAgents: [...this.state.career.freeAgents],
        market: this.state.career.market
          ? {
              phase: this.state.career.market.phase,
              openedAfterSeason: this.state.career.market.openedAfterSeason,
              expiringRosterIds: [...this.state.career.market.expiringRosterIds],
              offers: this.state.career.market.offers.map(o => ({ ...o })),
              bids: this.state.career.market.bids.map(b => ({ ...b })),
            }
          : null,
        pendingMoves: this.state.career.pendingMoves.map(m => ({ ...m })),
        ...(this.state.career.preSeasonStep !== undefined
          ? { preSeasonStep: this.state.career.preSeasonStep }
          : {}),
        takeoverHistory: [...this.state.career.takeoverHistory],
        midseasonRejections: { ...this.state.career.midseasonRejections },
      },
      teamSeasonStats: Object.fromEntries(
        Object.entries(this.state.league.teamSeasonStats).map(([id, s]) => [id, { ...s }]),
      ),
      // Persist the live playoff bracket only when it exists — keeps the
      // save payload byte-equivalent for the common in-season case.
      ...(this.state.league.playoffs
        ? { playoffs: clonePlayoffs(this.state.league.playoffs) }
        : {}),
    };
  }
}

function clonePlayerHistoryForSave(
  h: Record<number, import('../types/gameState').ArchivedPlayerSeason>,
): Record<number, import('../types/gameState').ArchivedPlayerSeason> {
  const out: Record<number, import('../types/gameState').ArchivedPlayerSeason> = {};
  for (const k of Object.keys(h)) out[Number(k)] = { ...h[Number(k)] };
  return out;
}

// Deep-ish clone of a PlayoffState for the save payload. Shallow on the
// PlayoffMatch level, with a fresh `result` object so a downstream
// reader's mutation can't reach back into our state.
function clonePlayoffs(p: PlayoffState): PlayoffState {
  const cloneMatch = (m: PlayoffMatch): PlayoffMatch => ({
    ...m,
    ...(m.result ? { result: { ...m.result } } : {}),
  });
  return {
    semifinals: [cloneMatch(p.semifinals[0]), cloneMatch(p.semifinals[1])],
    final: cloneMatch(p.final),
    championTeamId: p.championTeamId,
  };
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

// Add n days to an ISO yyyy-mm-dd date and return the same shape.
function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

