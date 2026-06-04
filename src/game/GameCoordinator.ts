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
  Fixture, FixtureResult, GameState, MarketState, PlayerRef, PlayoffMatch, PlayoffState, PreAgreement, ScoutingRecord, SeasonEvent, SeasonSchedule,
} from '../types/gameState';
import { emptyCareerState } from '../types/gameState';
import { sortStandings } from './leagueTable';
import type { Player } from '../types/player';
import type { TeamTactics } from '../types/team';
import type { TrainingPlan, TrainingWeekResult } from '../types/training';
import { applySeasonEvent } from './applySeasonEvent';
import type { PreSeasonTransfer } from '../data/transfers-2025-26';
import { simulateFixture } from './simulateFixture';
import { seedRoster } from './rosterSeeder';
import { computeFixtureMoraleEvents, computeMoraleDecayEvents } from './moraleEffects';
import { buildAutoSelectedTeamFromRoster } from './rosterTeamBuilder';
import { CUP_POOLS_2025_26, buildCupSeed } from './cupScheduler';
import { parseSeasonStartYear, seasonOpenIso, getAge } from './age';
import { recentForm } from './teamStats';
import { generateMatchStory, type MediaMatchContext, type MediaPlayer } from './media/mediaManager';
import { collectSeasonEvents, collectConditionEvents, type MatchSnapshot } from './seasonStatsCollector';
import { runTrainingPeriods } from './trainingRunner';
import { upcomingGap, splitGapIntoPeriods } from './trainingCalendar';
import { reconcileRestObligations, lionsReturnEvents } from './internationalDutyEngine';
import { computeRollover } from './careerRollover';
import { generateStaffPool } from './staffPoolGenerator';
import { generatePersona } from './personaGenerator';
import { buildLoanPoolEvents } from './loanPoolGenerator';
import { buildRosterSeededEvent, buildCareerArchiveRestoredEvent } from './saveMigration';
import { type ObjectiveVerdict } from './board';
import { rollNewInjuryEvents, tickInjuryEvents } from './injuryEffects';
import { TransferCoordinator, type EarlyRenewalResult } from './TransferCoordinator';
import { StaffCoordinator } from './StaffCoordinator';
import { BoardCoordinator } from './BoardCoordinator';
import { PlayoffCoordinator } from './PlayoffCoordinator';
import { InternationalBreakCoordinator, type BreakBeginResult } from './InternationalBreakCoordinator';
import { computeBudgetEvents } from './budgetPlanner';
import { computeAttendance } from './attendance';
import { eventBus } from '../utils/eventBus';
import { setCareerSeed, rngTransfer, getTransferCallCount, advanceTransferTo, hashSeed } from '../utils/rng';
import { SEASON_VALUES, STARTER_FA_POOL, DISCIPLINE_COUNSEL, YELLOW_BAN_THRESHOLD, MORALE } from '../engine/balance';
import { PREMIERSHIP_2025_26 } from '../data/fixtures-2025-26';
import type { RawTeamInput } from '../types/teamData';

// Re-exported from InternationalBreakCoordinator (where the break flow lives)
// so existing UI imports `from '../game/GameCoordinator'` keep working.
export type { BreakBeginResult };

export type SavedSeasonResult = {
  round: number;
  homeId: string;
  awayId: string;
  playerSide: 'home' | 'away' | null;
  homeScore: number;
  awayScore: number;
  homeTries: number;
  awayTries: number;
};

export interface SavedCareer {
  seasonsCompleted: number;
  nextRosterId: number;
  clubs: ClubState[];
  roster: Record<number, Player>;
  archive: ArchivedSeason[];
  freeAgents?: number[];
  market?: MarketState | null;
  pendingMoves?: PreAgreement[];
  preSeasonStep?: 'overview' | 'signings' | 'marquee';
  takeoverHistory?: string[];
  midseasonRejections?: Record<number, number>;
  activePoachedIds?: number[];
  staff?: import('../types/gameState').StaffMember[];
  nextStaffId?: number;
  // Feature 2.3 — rosterIds of the season's loan-available players.
  loanPool?: number[];
}

export interface SavedSeason {
  playerTeamId: string;
  seed: number;
  currentWeek: number;
  results: SavedSeasonResult[];
  // Fixture list and season label captured at save time — restored verbatim
  // so an edit to the canonical schedule doesn't corrupt an in-progress season.
  seasonLabel?: string;
  fixtures?: Fixture[];
  tactics?: TeamTactics;
  matchdaySquad?: PlayerRef[];
  training?: TrainingPlan;
  careerRngOffset?: number;
  career?: SavedCareer;
  teamSeasonStats?: Record<string, import('../types/gameState').TeamSeasonStats>;
  playoffs?: PlayoffState | null;
  // The active Prem Cup (cup results aren't replayable from `results`, so
  // the subtree is persisted directly, like `playoffs`). Optional — absent
  // on saves written before the cup system / before the first break.
  premCup?: import('../types/gameState').PremCupState | null;
  // Remembered Assistant-Manager cup direction.
  cupDirection?: 'best' | 'rest_first_15';
  // Generated media stories for the current season. Not replayable from
  // `results` (they need the per-match snapshot), so persisted directly and
  // restored verbatim by fromSave. Optional — absent on saves written before
  // the media manager.
  mediaStories?: import('../types/gameState').MediaStory[];
  // Manager's nominated match captain (rosterId). Narrative-only.
  captainRosterId?: number;
  // Board confidence for the managed club. Not replayable from `results`, so
  // persisted directly. Optional — absent on saves written before this system.
  board?: import('../types/gameState').BoardState;
  // Scouting knowledge map. Not replayable; restored verbatim. Absent on
  // saves written before the scouting system.
  scouting?: Record<number, import('../types/gameState').ScoutingRecord>;
}

// Deep clone the roster index for save serialisation — every Player and
// its nested PlayerStats / PlayerMatchStats / PlayerSeasonStats. Skip


function emptyState(): GameState {
  return {
    calendar: { date: SEASON_VALUES.startDate, week: 1, seasonLabel: '' },
    league: { fixtures: [], results: [], standings: [], teamSeasonStats: {}, playoffs: null, premCup: null, mediaStories: [] },
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
  // Staff & scouting collaborator — owns hire/release + scout assignment +
  // weekly accuracy advance. Holds the same `state` reference.
  private staff: StaffCoordinator;
  // Board-confidence collaborator — owns seeding, per-result swing, the
  // sack/warning fail-state, and press effects. Same `state` reference + the
  // teamsById lookup.
  private board: BoardCoordinator;
  // Playoff collaborator — owns bracket seeding, the player playoff tick, and
  // headless AI playoff sims. Same `state` reference + the teamsById lookup.
  private playoffs: PlayoffCoordinator;
  // International-break + Prem Cup collaborator — owns the two-phase break flow,
  // headless cup sims, and the cup direction. Same `state` reference + teamsById.
  private intlBreak: InternationalBreakCoordinator;

  private constructor(allTeams: RawTeamInput[]) {
    this.state = emptyState();
    this.teamsById = new Map(allTeams.map(t => [t.id, t]));
    this.transfers = new TransferCoordinator(this.state);
    this.staff = new StaffCoordinator(this.state);
    this.board = new BoardCoordinator(this.state, this.teamsById);
    this.playoffs = new PlayoffCoordinator(this.state, this.teamsById);
    this.intlBreak = new InternationalBreakCoordinator(this.state, this.teamsById);
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
    // B&I Lions 2025 return: the 2025/26 opener only. Curated Australia-tour
    // members start under-cooked, each at a slightly different return condition
    // (rngTransfer noise). Runs AFTER the FA-pool seed so that pool stays
    // deterministically identical regardless of the Lions roll. The next Lions
    // tour (2029) is out of scope.
    if (seasonStartYear === 2025) {
      for (const ev of lionsReturnEvents(coord.state)) applySeasonEvent(coord.state, ev);
    }
    // Seed the Prem Cup for year 1 — real 2025-26 pools (RNG-free; pool
    // redraw for year 2+ happens at rollover). Fixtures derive their
    // synthetic break-gap dates from the league schedule.
    applySeasonEvent(coord.state, {
      type: 'PREM_CUP_SEEDED',
      ...buildCupSeed(CUP_POOLS_2025_26, coord.state.league.fixtures, coord.state.calendar.seasonLabel),
    });
    coord.board.seedBoardState();
    // Seed the initial staff hire pool (no hired staff on season 1).
    const { staff: initialStaff, nextStaffId } = generateStaffPool(1);
    applySeasonEvent(coord.state, { type: 'STAFF_POOL_SEEDED', staff: initialStaff, nextStaffId });
    // Seed the season's loan-available player pool (Feature 2.3).
    for (const ev of buildLoanPoolEvents(coord.state)) {
      applySeasonEvent(coord.state, ev);
    }
    eventBus.emit('game:initialized', { state: coord.state });
    return coord;
  }

  // ===== Board confidence =====
  //
  // All delegate to BoardCoordinator (same `state` reference). seedBoardState
  // + applyBoardResult are called internally (lifecycle + match tick); the rest
  // are the public surface screens/main.ts read.

  // True once the manager has been sacked mid-season (the persisted latch).
  // Routing reads this both in-session and on load (continue / resume paths).
  isManagerSacked(): boolean {
    return this.board.isManagerSacked();
  }

  judgeSeasonObjective(): { verdict: ObjectiveVerdict; sacked: boolean } {
    return this.board.judgeSeasonObjective();
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
    advanceTransferTo(save.careerRngOffset ?? 0);
    applySeasonEvent(coord.state, {
      type: 'SEASON_INITIALIZED',
      playerTeamId: save.playerTeamId,
      seed: save.seed >>> 0,
      teamIds: allTeams.map(t => t.id),
      schedule: save.fixtures
        ? { seasonLabel: save.seasonLabel ?? schedule.seasonLabel, fixtures: save.fixtures.map(f => ({ ...f })) }
        : schedule,
    });
    if (save.career) {
      applySeasonEvent(coord.state, buildRosterSeededEvent(save.career));
      applySeasonEvent(coord.state, buildCareerArchiveRestoredEvent(save));
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
    if (save.cupDirection) {
      applySeasonEvent(coord.state, { type: 'PLAYER_CUP_DIRECTION_SET', direction: save.cupDirection });
    }
    // Media stories aren't replayable from `results` (they need the per-match
    // snapshot), so restore them verbatim.
    if (save.mediaStories) {
      for (const story of save.mediaStories) {
        applySeasonEvent(coord.state, { type: 'MEDIA_STORY_PUBLISHED', story: { ...story } });
      }
    }
    if (save.captainRosterId !== undefined) {
      applySeasonEvent(coord.state, { type: 'PLAYER_CAPTAIN_SET', rosterId: save.captainRosterId });
    }
    // Board confidence isn't replayable from `results` (the per-result delta
    // depends on the human-match context), so it's restored verbatim. Legacy
    // saves without it fall back to a fresh seed.
    if (save.board) {
      applySeasonEvent(coord.state, {
        type: 'BOARD_STATE_SEEDED',
        confidence: save.board.confidence,
        objective: save.board.objective,
        warningIssued: save.board.warningIssued,
        sacked: save.board.sacked,
      });
    } else {
      coord.board.seedBoardState();
    }
    // Staff pool/hired state isn't replayable from results; restore verbatim.
    // Legacy saves without it keep career.staff undefined — UI treats that as
    // an empty pool, which is correct (no staff hired).
    if (save.career?.staff) {
      applySeasonEvent(coord.state, {
        type: 'STAFF_POOL_SEEDED',
        staff: save.career.staff.map(m => ({ ...m })),
        nextStaffId: save.career.nextStaffId ?? save.career.staff.length + 1,
      });
    }
    // Loan pool isn't replayable from results; restore verbatim. Legacy saves
    // without it leave career.loanPool undefined — LoanScreen handles this
    // gracefully (treats as empty, no crash).
    if (save.career?.loanPool && save.career.loanPool.length > 0) {
      applySeasonEvent(coord.state, {
        type: 'LOAN_POOL_SEEDED',
        rosterIds: [...save.career.loanPool],
      });
    }
    // Scouting state isn't replayable from results; restore verbatim.
    // Legacy saves without it leave scouting undefined — all external
    // players start at accuracy 0 (correct for a fresh save).
    if (save.scouting && Object.keys(save.scouting).length > 0) {
      applySeasonEvent(coord.state, {
        type: 'PLAYER_SCOUTING_RESTORED',
        scouting: Object.fromEntries(
          Object.entries(save.scouting).map(([k, v]) => [Number(k), { ...v }]),
        ),
      });
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

  setPlayerCaptain(rosterId: number | undefined): void {
    applySeasonEvent(this.state, { type: 'PLAYER_CAPTAIN_SET', rosterId });
  }

  counselPlayer(rosterId: number): void {
    const p = this.state.career.roster[rosterId];
    if (!p) return;
    const expiresAfterRound = this.state.calendar.week + DISCIPLINE_COUNSEL.durationRounds;
    applySeasonEvent(this.state, { type: 'PLAYER_DISCIPLINE_COUNSELLED', rosterId, expiresAfterRound });
  }

  boostPlayerMorale(rosterId: number): void {
    const p = this.state.career.roster[rosterId];
    if (!p) return;
    const chatCount = p.moraleChats ?? 0;
    const baseDelta = rngTransfer(MORALE.chatBoostMin, MORALE.chatBoostMax);
    const scale = Math.pow(MORALE.chatDecayFactor, chatCount);
    const delta = Math.max(MORALE.chatMinBoost, Math.round(baseDelta * scale));
    applySeasonEvent(this.state, {
      type: 'PLAYER_MORALE_ADJUSTED',
      rosterId,
      delta,
      reason: 'manager_chat',
    });
  }

  // ===== Staff & scouting =====
  //
  // All five delegate to StaffCoordinator (same `state` reference). Kept here
  // as a thin facade so existing screens keep talking to GameCoordinator.

  hireStaff(staffId: string): void {
    this.staff.hireStaff(staffId);
  }

  releaseStaff(staffId: string): void {
    this.staff.releaseStaff(staffId);
  }

  assignScout(rosterId: number, scoutId: string): void {
    this.staff.assignScout(rosterId, scoutId);
  }

  unassignScout(rosterId: number): void {
    this.staff.unassignScout(rosterId);
  }

  removeScouting(rosterId: number): void {
    this.staff.removeScouting(rosterId);
  }

  // Apply the outcome of a press conference. Delegates to BoardCoordinator.
  applyPressEffects(skipped: boolean, answers: Array<{ boardDelta: number; moraleDelta: number }>): void {
    this.board.applyPressEffects(skipped, answers);
  }

  // rosterIds of the human club's persisted matchday 23 (mapped from the
  // saved PlayerRef[] by name). Used by the rest-obligation reconciliation to
  // tell whether an obligated player featured this round. Empty when no squad
  // is persisted yet.
  private humanMatchdaySquadIds(): Set<number> {
    const out = new Set<number>();
    const md = this.state.player.matchdaySquad;
    if (!md) return out;
    const club = this.state.career.clubs.find(c => c.id === this.state.player.teamId);
    if (!club) return out;
    const idByName = new Map<string, number>();
    for (const rid of club.squad) {
      const p = this.state.career.roster[rid];
      if (p) idByName.set(`${p.firstName}|${p.lastName}`, rid);
    }
    for (const ref of md) {
      const rid = idByName.get(`${ref.firstName}|${ref.lastName}`);
      if (rid !== undefined) out.add(rid);
    }
    return out;
  }

  // Applies a (non-break) training block — one entry in `weeks` per discrete
  // training week of the gap until the player's next match. The gap's real
  // day count is split into ~7-day periods (splitGapIntoPeriods); condition
  // recovers per day across each period's span while development + injury
  // rolls fire once per period. RNG flows through rngTransfer; stable
  // iteration order keeps it deterministic. International breaks are handled
  // separately — beginInternationalBreak() + runInternationalBreakBlock() —
  // so the call-ups + Prem Cup screens can surface before the block runs.
  applyTrainingBlock(weeks: TrainingPlan[]): TrainingWeekResult {
    const n = Math.max(1, weeks.length);
    const { days } = upcomingGap(this.state);
    const spans = splitGapIntoPeriods(days, n);
    const acc = runTrainingPeriods(this.state, weeks, spans);
    eventBus.emit('game:trainingApplied', { state: this.state });
    return { plan: weeks[weeks.length - 1], players: [...acc.values()], weeks: n };
  }

  // ===== International break + Prem Cup =====
  //
  // All delegate to InternationalBreakCoordinator (same `state` reference).
  // The non-break applyTrainingBlock above stays on GameCoordinator; these
  // are the break-flow surface main.ts / the determinism harness drive.

  isBreakPending(): boolean {
    return this.intlBreak.isBreakPending();
  }

  beginInternationalBreak(): BreakBeginResult | null {
    return this.intlBreak.beginInternationalBreak();
  }

  async runInternationalBreakBlock(weeks: TrainingPlan[], begin: BreakBeginResult): Promise<TrainingWeekResult> {
    return this.intlBreak.runInternationalBreakBlock(weeks, begin);
  }

  // Persists the manager's training plan without executing training. Used
  // by the Hub-tile mid-week entry into TrainingScreen — the user is
  // editing next week's default, not running an extra session.
  setPlayerTrainingPlan(plan: TrainingPlan): void {
    applySeasonEvent(this.state, { type: 'PLAYER_TRAINING_PLAN_SET', plan });
  }

  // Persists the Assistant-Manager Prem Cup direction (best XV vs rest the
  // first-choice 15). Becomes the remembered default for the next break.
  setCupDirection(direction: 'best' | 'rest_first_15'): void {
    this.intlBreak.setCupDirection(direction);
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

  closeRenewalWindow(
    userDecisions: Record<string, 'renew' | 'release'> = {},
    userWages: Record<string, number> = {},
  ): void {
    this.transfers.closeRenewalWindow(userDecisions, userWages);
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

  signFreeAgent(rosterId: number, offeredWage?: number): boolean {
    return this.transfers.signFreeAgent(rosterId, offeredWage);
  }

  unsignFreeAgent(rosterId: number): boolean {
    return this.transfers.unsignFreeAgent(rosterId);
  }

  preAgreePoach(rosterId: number, offeredWage?: number): boolean {
    return this.transfers.preAgreePoach(rosterId, offeredWage);
  }

  cancelPreAgreement(rosterId: number): boolean {
    return this.transfers.cancelPreAgreement(rosterId);
  }

  // Competitive signing flow (Phase 10) — thin delegates onto
  // TransferCoordinator. UI calls these between rounds; per-method
  // docs live on the TransferCoordinator class.
  submitBid(rosterId: number, offeredWage?: number): boolean {
    return this.transfers.submitBid(rosterId, offeredWage);
  }

  withdrawBid(rosterId: number): boolean {
    return this.transfers.withdrawBid(rosterId);
  }

  submitRetentionBid(rosterId: number, offeredWage?: number): boolean {
    return this.transfers.submitRetentionBid(rosterId, offeredWage);
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

  runAIMidseasonPoachPass(): void {
    this.transfers.runAIMidseasonPoachPass();
  }

  updatePoachThreats(): void {
    this.transfers.updatePoachThreats();
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

  submitMidseasonPoach(rosterId: number, wage: number): 'accepted' | 'declined' {
    return this.transfers.submitMidseasonPoach(rosterId, wage);
  }

  // Mid-season Reg 7 poaching of the user's players (live, main.ts-driven).
  openMidseasonPoachWindow(): void {
    this.transfers.openMidseasonPoachWindow();
  }

  closeMidseasonPoachWindow() {
    return this.transfers.closeMidseasonPoachWindow();
  }

  // Mid-season early contract renewal (Hub → Contracts). One-shot
  // voluntary renewal of an expiring own-squad player — delegate.
  offerEarlyRenewal(rosterId: number, offeredWage?: number): EarlyRenewalResult {
    return this.transfers.offerEarlyRenewal(rosterId, offeredWage);
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
    // get added. Represents the rest between the player's previous match and
    // this one: every injured player decrements weeksRemaining by 1 per week
    // of the gap (PLAYER_RECOVERED when a counter hits 0), so a long
    // international window (e.g. ~8 weeks across the Six Nations break) heals
    // proportionally more than a normal 1-week turnaround. Order is
    // rosterId-ascending so the season-determinism harness stays clean.
    const recoveryWeeks = upcomingGap(this.state).weeks;
    // Only heal injuries that pre-date this rest gap. Injuries picked up during
    // the gap (training / international duty, dated at the upcoming round)
    // shouldn't be retroactively recovered by the gap they happened within.
    const prevFixture = this.state.league.fixtures.find(f =>
      f.round === round - 1 && (f.homeId === this.state.player.teamId || f.awayId === this.state.player.teamId)
    );
    const gapStartIso = prevFixture?.date;
    for (let w = 0; w < recoveryWeeks; w++) {
      for (const ev of tickInjuryEvents(this.state, gapStartIso)) {
        applySeasonEvent(this.state, ev);
      }
    }

    const playerSide: 'home' | 'away' = fixture.homeId === this.state.player.teamId ? 'home' : 'away';
    const homeJson = this.teamsById.get(fixture.homeId);
    // Capture "expected to win" from the PRE-match table — after the result is
    // recorded the standings already reflect this game, which would skew the
    // upset/capitulation framing of the media story.
    const preStandings = sortStandings(this.state.league.standings);
    const oppId = playerSide === 'home' ? fixture.awayId : fixture.homeId;
    const myPosPre = preStandings.findIndex(s => s.teamId === this.state.player.teamId);
    const oppPosPre = preStandings.findIndex(s => s.teamId === oppId);
    const expectedToWin = myPosPre >= 0 && oppPosPre >= 0 && myPosPre < oppPosPre;
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
      attendance: homeJson?.stadiumCapacity
        ? computeAttendance(fixture, homeJson.stadiumCapacity, this.state.league.standings, this.state.league.results)
        : undefined,
    };
    applySeasonEvent(this.state, { type: 'FIXTURE_RESULT_RECORDED', result });
    for (const ev of collectSeasonEvents(snapshot)) {
      applySeasonEvent(this.state, ev);
    }
    for (const ev of collectConditionEvents(snapshot)) {
      applySeasonEvent(this.state, ev);
    }
    for (const ev of rollNewInjuryEvents(this.state, snapshot.playerSnapshots)) {
      applySeasonEvent(this.state, ev);
    }
    for (const ev of computeFixtureMoraleEvents(this.state, result, snapshot)) {
      applySeasonEvent(this.state, ev);
    }
    eventBus.emit('game:fixtureRecorded', { result, state: this.state });

    // Board confidence — adjust on the human result, then check the
    // final-warning / mid-season-sack thresholds. Deterministic (no RNG).
    this.board.applyBoardResult(result, expectedToWin);

    // Media story — one deterministic, flavour-only take on the player's
    // fixture, dropped into the inbox. Seeded off (rootSeed, round, clubId) via
    // a standalone RNG so it can't perturb the career stream / season
    // determinism. Built from the live snapshot (exact per-player ratings).
    this.publishMediaStory(round, result, snapshot, playerSide, fixture, expectedToWin);

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
      const homeFillRate = homeJson.stadiumCapacity
        ? computeAttendance(f, homeJson.stadiumCapacity, this.state.league.standings, this.state.league.results) / homeJson.stadiumCapacity
        : undefined;
      const sim = await simulateFixture(home, away, this.state.seed, f.round, { homeFillRate, isDerby: f.isDerby });
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
        attendance: homeJson?.stadiumCapacity
          ? computeAttendance(f, homeJson.stadiumCapacity, this.state.league.standings, this.state.league.results)
          : undefined,
      };
      applySeasonEvent(this.state, { type: 'FIXTURE_RESULT_RECORDED', result: aiResult });
      for (const ev of collectSeasonEvents(sim.snapshot)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of collectConditionEvents(sim.snapshot)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of rollNewInjuryEvents(this.state, sim.snapshot.playerSnapshots)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of computeFixtureMoraleEvents(this.state, aiResult, sim.snapshot)) {
        applySeasonEvent(this.state, ev);
      }
      eventBus.emit('game:fixtureRecorded', { result: aiResult, state: this.state });
    }

    // Yellow card accumulation ban: check if any human squad player has hit
    // the threshold for the first time this season. calendar.week is still
    // the round just played; the ban covers the next round (week + 1).
    const humanClub = this.state.career.clubs.find(c => c.id === this.state.player.teamId);
    if (humanClub) {
      for (const rid of humanClub.squad) {
        const p = this.state.career.roster[rid];
        if (!p || p.suspension) continue;
        if (p.seasonStats.yellowCards >= YELLOW_BAN_THRESHOLD) {
          applySeasonEvent(this.state, {
            type: 'PLAYER_SUSPENDED',
            rosterId: rid,
            forRound: this.state.calendar.week + 1,
          });
        }
      }
    }

    // Reconcile PGA rest obligations for the round just played (calendar.week
    // still points at this round). A player whose obligation covered this
    // round and who didn't feature has satisfied it. Runs before
    // WEEK_ADVANCED so the round number is correct.
    for (const ev of reconcileRestObligations(this.state, this.humanMatchdaySquadIds())) {
      applySeasonEvent(this.state, ev);
    }

    applySeasonEvent(this.state, { type: 'WEEK_ADVANCED' });
    for (const ev of computeMoraleDecayEvents(this.state)) {
      applySeasonEvent(this.state, ev);
    }
    this.transfers.checkTransferRequestsAndPromises();
    this.staff.advanceScoutingAccuracy();
    eventBus.emit('game:weekAdvanced', { state: this.state });

    // Background poach-threat assessment — RNG-free, runs every round.
    // Keeps the Hub Transfers badge current without the user opening
    // the screen first.
    if (!this.state.career.market) {
      this.transfers.updatePoachThreats();
    }

    // AI early-renewal cadence: every 4 rounds, each AI club attempts to
    // lock in its best expiring player before the off-season window.
    if (this.state.calendar.week % 4 === 1) {
      this.transfers.runAIEarlyRenewals();
    }

    // Last regular-season fixture just resolved → seed the playoff
    // bracket from the final standings. game:bracketSeeded is the post-
    // match chain's trigger to route through PlayoffBracketScreen
    // instead of straight to Hub. The end-of-season chain (EndOfSeason
    // → Renewals → Signings → Rollover) is now triggered later, after
    // the season final resolves and fires game:seasonComplete.
    if (this.playoffs.allRegularFixturesPlayed() && this.state.league.playoffs === null) {
      this.playoffs.seedPlayoffBracket();
    }
  }

  // Build the media context from the just-recorded player fixture and publish
  // one generated story. Flavour-only; the RNG is standalone (see media
  // manager) so this never affects any gameplay outcome. No-op for headless
  // contexts where no club roster player took the field.
  private publishMediaStory(
    round: number,
    result: FixtureResult,
    snapshot: MatchSnapshot,
    playerSide: 'home' | 'away',
    fixture: Fixture,
    expectedToWin: boolean,
  ): void {
    const teamId = this.state.player.teamId;
    const myTeam = this.teamsById.get(teamId);
    const oppId = playerSide === 'home' ? result.awayId : result.homeId;
    const oppTeam = this.teamsById.get(oppId);
    if (!myTeam || !oppTeam) return;

    const club = this.state.career.clubs.find(c => c.id === teamId);
    const squad = new Set(club?.squad ?? []);
    const players: MediaPlayer[] = [];
    for (const snap of snapshot.playerSnapshots) {
      if (!squad.has(snap.rosterId)) continue;
      const p = this.state.career.roster[snap.rosterId];
      if (!p) continue;
      const m = snap.matchStats;
      players.push({
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        age: getAge(p.dob, this.state.calendar.date),
        rating: snap.rating,
        tries: m.tries,
        lineBreaks: m.lineBreaks,
        defendersBeaten: m.defendersBeaten,
        tacklesMade: m.tacklesMade,
        turnoversWon: m.turnoversWon,
        carries: m.carries,
      });
    }
    if (players.length === 0) return;

    const form = recentForm(teamId, this.state.league.results, 4)
      .filter((r): r is 'W' | 'L' | 'D' => r !== null);
    // Match the attendance model: the figure is capped against the effective
    // venue capacity, which can exceed the home ground at special-venue games.
    const capacity = fixture.venueCapacity ?? myTeam.stadiumCapacity;

    const ctx: MediaMatchContext = {
      seed: hashSeed(this.state.seed, round, teamId),
      round,
      clubName: myTeam.name,
      clubShort: myTeam.shortName,
      oppName: oppTeam.name,
      isHome: playerSide === 'home',
      teamScore: playerSide === 'home' ? result.homeScore : result.awayScore,
      oppScore: playerSide === 'home' ? result.awayScore : result.homeScore,
      teamTries: playerSide === 'home' ? result.homeTries : result.awayTries,
      stadium: myTeam.stadium,
      ...(result.attendance != null ? { attendance: result.attendance } : {}),
      ...(capacity ? { capacity } : {}),
      expectedToWin,
      recentForm: form,
      ...(myTeam.suggestedTactics ? { tactics: myTeam.suggestedTactics } : {}),
      teamSummary: playerSide === 'home' ? snapshot.homeSummary : snapshot.awaySummary,
      players,
    };

    applySeasonEvent(this.state, { type: 'MEDIA_STORY_PUBLISHED', story: generateMatchStory(ctx) });
  }

  // ===== Transfer requests + loans (Features 1.4 / 2.3) =====
  //
  // All delegate to TransferCoordinator (same `state` reference). The match
  // tick calls this.transfers.checkTransferRequestsAndPromises(); the rest are
  // the public surface inbox / LoanScreen read.

  makePlayingTimePromise(rosterId: number): void {
    this.transfers.makePlayingTimePromise(rosterId);
  }

  grantTransferRequest(rosterId: number): void {
    this.transfers.grantTransferRequest(rosterId);
  }

  rejectTransferRequest(rosterId: number): void {
    this.transfers.rejectTransferRequest(rosterId);
  }

  loanOutPlayer(rosterId: number): void {
    this.transfers.loanOutPlayer(rosterId);
  }

  recallLoanedPlayer(rosterId: number): void {
    this.transfers.recallLoanedPlayer(rosterId);
  }

  signLoanPlayer(rosterId: number): void {
    this.transfers.signLoanPlayer(rosterId);
  }

  releaseLoanPlayer(rosterId: number): void {
    this.transfers.releaseLoanPlayer(rosterId);
  }

  // ===== Playoffs =====
  //
  // All delegate to PlayoffCoordinator (same `state` reference). The match
  // tick calls this.playoffs.allRegularFixturesPlayed()/seedPlayoffBracket();
  // the rest are the public surface screens / main.ts / the determinism
  // harness read.

  seedPlayoffBracket(): void {
    this.playoffs.seedPlayoffBracket();
  }

  getPlayerPlayoffMatch(): PlayoffMatch | null {
    return this.playoffs.getPlayerPlayoffMatch();
  }

  async recordPlayerPlayoffResult(
    kind: 'semifinal_1' | 'semifinal_2' | 'final',
    homeScore: number,
    awayScore: number,
    snapshot: MatchSnapshot,
  ): Promise<void> {
    return this.playoffs.recordPlayerPlayoffResult(kind, homeScore, awayScore, snapshot);
  }

  async simulatePendingPlayoffMatches(stage: 'sf' | 'final'): Promise<void> {
    return this.playoffs.simulatePendingPlayoffMatches(stage);
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
    // Re-seed board confidence for the new season from the finish just
    // archived by SEASON_ROLLED_OVER (resets the final-warning latch).
    this.board.seedBoardState();
    eventBus.emit('game:seasonRolledOver', { state: this.state });
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
      ...(this.state.player.board ? { board: { ...this.state.player.board } } : {}),
      careerRngOffset: getTransferCallCount(),
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
        activePoachedIds: [...this.state.career.activePoachedIds],
        ...(this.state.career.staff !== undefined
          ? { staff: this.state.career.staff.map(m => ({ ...m })), nextStaffId: this.state.career.nextStaffId }
          : {}),
        ...(this.state.career.loanPool !== undefined
          ? { loanPool: [...this.state.career.loanPool] }
          : {}),
      },
      teamSeasonStats: Object.fromEntries(
        Object.entries(this.state.league.teamSeasonStats).map(([id, s]) => [id, { ...s }]),
      ),
      // Persist the live playoff bracket only when it exists — keeps the
      // save payload byte-equivalent for the common in-season case.
      ...(this.state.league.playoffs
        ? { playoffs: clonePlayoffs(this.state.league.playoffs) }
        : {}),
      // Persist the Prem Cup (cup results aren't replayable from `results`).
      ...(this.state.league.premCup
        ? { premCup: cloneCupForSave(this.state.league.premCup) }
        : {}),
      ...(this.state.player.cupDirection
        ? { cupDirection: this.state.player.cupDirection }
        : {}),
      ...(this.state.league.mediaStories.length > 0
        ? { mediaStories: this.state.league.mediaStories.map(s => ({ ...s })) }
        : {}),
      ...(this.state.player.captainRosterId !== undefined
        ? { captainRosterId: this.state.player.captainRosterId }
        : {}),
      ...(this.state.player.scouting && Object.keys(this.state.player.scouting).length > 0
        ? { scouting: Object.fromEntries(
              Object.entries(this.state.player.scouting).map(([k, v]) => [k, { ...v }]),
            ) as Record<number, ScoutingRecord> }
        : {}),
    };
  }
}

// Deep-ish clone of a PremCupState for the save payload — mirrors clonePlayoffs.
function cloneCupForSave(cup: import('../types/gameState').PremCupState): import('../types/gameState').PremCupState {
  const cloneKo = (m: import('../types/gameState').CupKnockoutMatch) => ({
    ...m,
    ...(m.result ? { result: { ...m.result } } : {}),
  });
  return {
    seasonLabel: cup.seasonLabel,
    pools: [
      { id: 'A', teamIds: [...cup.pools[0].teamIds], standings: cup.pools[0].standings.map(s => ({ ...s })) },
      { id: 'B', teamIds: [...cup.pools[1].teamIds], standings: cup.pools[1].standings.map(s => ({ ...s })) },
    ],
    fixtures: cup.fixtures.map(f => ({ ...f, ...(f.result ? { result: { ...f.result } } : {}) })),
    knockout: cup.knockout
      ? {
          semifinals: [cloneKo(cup.knockout.semifinals[0]), cloneKo(cup.knockout.semifinals[1])],
          final: cloneKo(cup.knockout.final),
          championTeamId: cup.knockout.championTeamId,
        }
      : null,
  };
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


