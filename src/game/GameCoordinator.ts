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
//   Calendar-block surface (unified-calendar Stage 2 — not yet wired to UI)
//     coord.getNextBlock()                  // next unplayed CalendarBlock across all comps
//     coord.simRestOfBlock(block)           // sims all non-player fixtures in the block
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
  ArchivedSeason, ClubState, CupRoundRef, EuropeanObjective, EuropeanRoundRef,
  Fixture, FixtureResult, GameState, MarketState, PlayerRef, PlayoffMatch, PlayoffState, PreAgreement, ScoutingRecord, SeasonEvent, SeasonSchedule,
} from '../types/gameState';
import { emptyCareerState } from '../types/gameState';
import { sortStandings } from './leagueTable';
import type { Player } from '../types/player';
import type { TeamTactics } from '../types/team';
import type { TrainingPlan, TrainingWeekResult, InternationalBreakSummary } from '../types/training';
import type { InternationalWindow } from '../types/player';
import { applySeasonEvent } from './applySeasonEvent';
import type { PreSeasonTransfer } from '../data/transfers-2025-26';
import { simulateFixture } from './simulateFixture';
import { seedRoster } from './rosterSeeder';
import { computeFixtureMoraleEvents, computeMoraleDecayEvents } from './moraleEffects';
import { buildAutoSelectedTeamFromRoster } from './rosterTeamBuilder';
import { CUP_POOLS_2025_26, CUP_FIXTURES_2025_26, buildCupSeed } from './cupScheduler';
import { parseSeasonStartYear, seasonOpenIso, getAge } from './age';
import { recentForm } from './teamStats';
import { generateMatchStory, generateInternationalStories, type MediaMatchContext, type MediaPlayer } from './media/mediaManager';
import { playerOverall } from '../engine/RatingEngine';
import { buildEuropeanDrawStory, buildEuropeanEliminationStory } from './media/europeanStories';
import { collectSeasonEvents, collectConditionEvents, type MatchSnapshot } from './seasonStatsCollector';
import { runTrainingPeriods } from './trainingRunner';
import { upcomingGap, upcomingGapFromDate, splitGapIntoPeriods, nextPlayableDate, lastPlayedMatchdayDate } from './trainingCalendar';
import { leagueRound, earliestDateForRound } from './leagueRound';
import { addDaysIso } from './age';
import { reconcileRestObligations, lionsReturnEvents, summerTourReturnEvents } from './internationalDutyEngine';
import { computeRollover } from './careerRollover';
import { generateStaffPool, staffWageForRating } from './staffPoolGenerator';
import { STAFF_RATING_BAND } from '../engine/balance/staff';
import { generatePersona } from './personaGenerator';
import { buildLoanPoolEvents } from './loanPoolGenerator';
import { buildRosterSeededEvent, buildCareerArchiveRestoredEvent } from './saveMigration';
import { type ObjectiveVerdict } from './board';
import { rollNewInjuryEvents, tickInjuryEvents } from './injuryEffects';
import { TransferCoordinator, type EarlyRenewalResult } from './TransferCoordinator';
import { StaffCoordinator } from './StaffCoordinator';
import { BoardCoordinator } from './BoardCoordinator';
import { PlayoffCoordinator } from './PlayoffCoordinator';
import { InternationalBreakCoordinator, type BreakBeginResult, type CupFixtureRef } from './InternationalBreakCoordinator';
import { EuropeanCoordinator } from './EuropeanCoordinator';
import { computeBudgetEvents } from './budgetPlanner';
import { computeAttendance } from './attendance';
import { eventBus } from '../utils/eventBus';
import { setCareerSeed, rngTransfer, getTransferCallCount, advanceTransferTo, hashSeed } from '../utils/rng';
import { SEASON_VALUES, STARTER_FA_POOL, DISCIPLINE_COUNSEL, YELLOW_BAN_THRESHOLD, MORALE, AI_EARLY_RENEWAL_CADENCE_ROUNDS, ARCHIVE_CAP } from '../engine/balance';
import type { SquadStatusKey } from '../types/player';
import { PREMIERSHIP_2025_26 } from '../data/fixtures-2025-26';
import { assignReferees, getRefereeById } from '../data/referees';
import type { RawTeamInput } from '../types/teamData';
import { nextBlock, type CalendarBlock } from './calendarBlocks';

// Re-exported from InternationalBreakCoordinator (where the break flow lives)
// so existing UI imports `from '../game/GameCoordinator'` keep working.
export type { BreakBeginResult, CupFixtureRef };
export type { CupRoundRef } from '../types/gameState';

import type { EuropeanFixture, EuropeanKnockoutMatch } from '../types/gameState';

// Re-export EuropeanRoundRef so UI modules import from one place.
export type { EuropeanRoundRef } from '../types/gameState';

// Identifies the player's next playable European fixture — pool or knockout.
export type EuropeanFixtureRef =
  | { kind: 'pool'; competition: 'europeanCup' | 'europeanShield'; fixture: EuropeanFixture }
  | { kind: 'knockout'; competition: 'europeanCup' | 'europeanShield'; stage: 'r16' | 'quarterfinal' | 'semifinal' | 'final'; match: EuropeanKnockoutMatch };

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
  // Players inducted into the managed club's Hall of Fame. Additive-optional —
  // absent on legacy saves (treated as empty, no HoF entries).
  hallOfFame?: import('../types/gameState').HallOfFameEntry[];
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
  // Remembered manage-cup-live preference (omitted when false/default).
  cupManageLive?: boolean;
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
  // European competition states. Not replayable from `results`; persisted
  // directly like premCup. Optional — absent on saves written before the
  // European competitions system.
  europeanCup?: import('../types/gameState').EuropeanCompState | null;
  europeanShield?: import('../types/gameState').EuropeanCompState | null;
  // Fan sentiment meter (0–100). Additive-optional — absent on legacy saves
  // (treated as 50 by all consumers). Persisted when non-default so the
  // season-long value survives save/load.
  fanSentiment?: number;
}

function emptyState(): GameState {
  return {
    calendar: { date: SEASON_VALUES.startDate, week: 1, seasonLabel: '' },
    league: { fixtures: [], results: [], standings: [], teamSeasonStats: {}, playoffs: null, premCup: null, mediaStories: [], europeanCup: null, europeanShield: null },
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
  // European Cup + Shield collaborator — owns pool seeding, headless pool-stage
  // and knockout sims. Same `state` reference + teamsById.
  private european: EuropeanCoordinator;

  private constructor(allTeams: RawTeamInput[]) {
    this.state = emptyState();
    this.teamsById = new Map(allTeams.map(t => [t.id, t]));
    this.transfers = new TransferCoordinator(this.state);
    this.staff = new StaffCoordinator(this.state);
    this.board = new BoardCoordinator(this.state, this.teamsById);
    this.playoffs = new PlayoffCoordinator(this.state, this.teamsById);
    this.intlBreak = new InternationalBreakCoordinator(this.state, this.teamsById);
    this.european = new EuropeanCoordinator(this.state, this.teamsById);
  }

  static async newSeason(
    playerTeamId: string,
    seed: number,
    allTeams: RawTeamInput[],
    schedule: SeasonSchedule = PREMIERSHIP_2025_26,
    quickStart = false,
  ): Promise<GameCoordinator> {
    const coord = new GameCoordinator(allTeams);
    setCareerSeed(seed);
    // Assign a referee to each fixture via the career RNG stream before
    // SEASON_INITIALIZED writes them into state. Fixtures are read-only
    // authored data; build a new schedule rather than mutating the import.
    const scheduleWithRefs: typeof schedule = {
      ...schedule,
      fixtures: assignReferees(schedule.fixtures),
    };
    applySeasonEvent(coord.state, {
      type: 'SEASON_INITIALIZED',
      playerTeamId,
      seed: seed >>> 0,
      teamIds: allTeams.map(t => t.id),
      schedule: scheduleWithRefs,
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
    // B&I Lions 2025 return: the 2025/26 opener only. The next Lions tour
    // (2029) is out of scope; a 2029 branch should be added here when ready.
    if (seasonStartYear === 2025) {
      for (const ev of lionsReturnEvents(coord.state)) applySeasonEvent(coord.state, ev);
    }
    // Summer-tour returns fire every season: hardcoded 2025 names in year 1,
    // dynamic top-OVR England/Wales selection from year 2 onwards.
    for (const ev of summerTourReturnEvents(coord.state)) applySeasonEvent(coord.state, ev);
    // Seed the Prem Cup for year 1 — real 2025-26 pools (RNG-free; pool
    // redraw for year 2+ happens at rollover). Fixtures derive their
    // synthetic break-gap dates from the league schedule.
    applySeasonEvent(coord.state, {
      type: 'PREM_CUP_SEEDED',
      ...buildCupSeed(CUP_POOLS_2025_26, coord.state.league.fixtures, coord.state.calendar.seasonLabel, CUP_FIXTURES_2025_26),
    });
    // Seed the European competitions (pools + pool fixtures, no results). The
    // AI fixtures sim incrementally by date through advanceEuropeanCompetitions
    // (driven from the match tick), and the player plays their own live — so
    // the bracket fills in over the season rather than being pre-populated.
    coord.european.seedEuropeanComps(coord.state.calendar.seasonLabel);
    coord.board.seedBoardState();
    coord.seedEuropeanObjectiveAndDrawStory();
    // Seed the initial staff hire pool. Quick-start pre-hires one average-rated
    // member of each role so the player has a functional backroom from day one.
    const { staff: initialStaff, nextStaffId: poolNextId } = generateStaffPool(1);
    let staffPool = initialStaff;
    let nextStaffId = poolNextId;
    if (quickStart) {
      // Seed starter staff with a low rating (min band) and an appropriate salary.
      // This gives the user a functional backroom but incentivizes upgrading.
      const rating = STAFF_RATING_BAND.min;
      const annualWage = staffWageForRating(rating);
      const make = (role: 'assistant' | 'fitness' | 'scout', name: string) => ({
        id: `s${nextStaffId++}`, role, name, rating, annualWage,
        clubId: playerTeamId,
      });
      staffPool = [
        make('assistant', 'Mark Davies'),
        make('fitness',   'Tom Fletcher'),
        make('scout',     'Phil Morgan'),
        ...initialStaff,
      ];
    }
    applySeasonEvent(coord.state, { type: 'STAFF_POOL_SEEDED', staff: staffPool, nextStaffId });
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
    // Restore the monotonic week counter to the saved value. WEEK_ADVANCED no
    // longer touches calendar.date, so re-home the date onto the next league
    // round's earliest kick-off (the saved value of calendar.date is derived,
    // not persisted — same as before this loop owned the date).
    while (coord.state.calendar.week < save.currentWeek) {
      applySeasonEvent(coord.state, { type: 'WEEK_ADVANCED' });
    }
    const loadedRoundDate = earliestDateForRound(coord.state.league.fixtures, leagueRound(coord.state));
    if (loadedRoundDate && loadedRoundDate !== coord.state.calendar.date) {
      applySeasonEvent(coord.state, { type: 'MATCHDAY_ADVANCED', toDate: loadedRoundDate });
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
    if (save.cupManageLive) {
      applySeasonEvent(coord.state, { type: 'PLAYER_CUP_MANAGE_LIVE_SET', manageLive: save.cupManageLive });
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
        ...(save.board.europeanObjective !== undefined
          ? { europeanObjective: save.board.europeanObjective }
          : {}),
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
    if (save.fanSentiment !== undefined) {
      // Restore fan sentiment directly: fire a delta from the default (50) to
      // the saved value so the clamping path in the reducer is honoured.
      applySeasonEvent(coord.state, {
        type: 'FAN_SENTIMENT_UPDATED',
        delta: save.fanSentiment - 50,
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
    const expiresAfterRound = leagueRound(this.state) + DISCIPLINE_COUNSEL.durationRounds;
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

  // Called once per playoff match result (SF or Final) — advances scouting
  // by one week since ~1 week elapses between each playoff fixture. Mirrors
  // the per-round advance in recordPlayerMatchResult.
  advancePlayoffWeekScouting(): void {
    this.staff.advanceScoutingAccuracy();
  }

  setStaffBudgetBoost(boost: number): void {
    applySeasonEvent(this.state, { type: 'STAFF_BUDGET_BOOSTED', clubId: this.state.player.teamId, boost });
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
  // iteration order keeps it deterministic. Cup / European matchday training
  // is handled separately (runCupMatchdayTraining / runEuropeanMatchdayTraining).
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
  // The cup is now a sequence of ordinary game-weeks (see the live cup flow
  // delegates below). beginInternationalBreak still flags the international
  // call-ups (and surfaces the call-ups screen) at the start of a break.

  beginInternationalBreak(): BreakBeginResult | null {
    return this.intlBreak.beginInternationalBreak();
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

  // Persists whether the manager plays their own cup matches live or hands
  // them to the assistant. Remembered default for subsequent matchdays.
  setCupManageLive(manageLive: boolean): void {
    applySeasonEvent(this.state, { type: 'PLAYER_CUP_MANAGE_LIVE_SET', manageLive });
  }

  // ── Live cup weekly flow — delegates to InternationalBreakCoordinator ────
  getCurrentCupFixture(): CupFixtureRef | null {
    return this.intlBreak.getCurrentCupFixture();
  }

  getCupFixtureInBlock(blockEnd: string): CupFixtureRef | null {
    return this.intlBreak.getCupFixtureInBlock(blockEnd);
  }

  getCurrentCupRound(): CupRoundRef | null {
    return this.intlBreak.getCurrentCupRound();
  }

  markCupRoundShown(roundKey: string): void {
    this.intlBreak.markCupRoundShown(roundKey);
  }

  async advanceMatchdayCalendar(toDate: string): Promise<void> {
    // Cup / European / playoff matchdays now drive the elapsed-week passes for
    // the weeks they advance, so season progression (week counter, morale
    // decay, scouting accuracy, AI European catch-up) is competition-agnostic
    // rather than batched at the next league round. `tickElapsedWeeks` sets the
    // date AND advances Europe, so the trailing advanceEuropeanCompetitions is
    // no longer needed here.
    await this.tickElapsedWeeks(toDate);
  }

  async recordPlayerCupPoolResult(
    pool: 'A' | 'B', leg: 0 | 1 | 2, homeId: string, awayId: string,
    homeScore: number, awayScore: number, snapshot: MatchSnapshot,
  ): Promise<void> {
    await this.intlBreak.recordPlayerCupPoolResult(pool, leg, homeId, awayId, homeScore, awayScore, snapshot);
    eventBus.emit('game:weekAdvanced', { state: this.state });
  }

  async recordPlayerCupKnockoutResult(
    kind: 'semifinal_1' | 'semifinal_2' | 'final',
    homeScore: number, awayScore: number, snapshot: MatchSnapshot,
  ): Promise<void> {
    await this.intlBreak.recordPlayerCupKnockoutResult(kind, homeScore, awayScore, snapshot);
    eventBus.emit('game:weekAdvanced', { state: this.state });
  }

  async runPlayerCupFixtureHeadless(ref: CupFixtureRef): Promise<void> {
    await this.intlBreak.runPlayerCupFixtureHeadless(ref);
    eventBus.emit('game:weekAdvanced', { state: this.state });
  }

  async simDueCupFixtures(): Promise<void> {
    await this.intlBreak.simDueCupFixtures();
    eventBus.emit('game:weekAdvanced', { state: this.state });
  }

  async simCupBlock(blockEnd: string): Promise<void> {
    await this.intlBreak.simCupBlock(blockEnd);
    eventBus.emit('game:weekAdvanced', { state: this.state });
  }

  // What the cup break needs next (play a fixture / advance a round / resolve
  // international returns), or null when the break is done. Drives the Hub CTA
  // + the determinism harness.
  getCupBreakStep(): 'play_fixture' | 'advance_round' | 'resolve_returns' | null {
    return this.intlBreak.getCupBreakStep();
  }

  // Process international returns at the end of the break's cup weeks.
  // Also publishes 1–2 media stories about the manager's called-up players and,
  // at the autumn break, offers the season-once national-team release-request
  // decision if there is a capped player in the squad.
  async resolveInternationalWindow(window: InternationalWindow): Promise<InternationalBreakSummary | undefined> {
    // Advance the calendar to the resuming league date via tickElapsedWeeks so
    // the final break segment ticks morale decay, scouting accuracy, and the
    // week counter — previously a bare advanceCupCalendar bypassed all of these.
    await this.tickElapsedWeeks(this.intlBreak.upcomingLeagueDate());
    const summary = this.intlBreak.resolveInternationalWindow(window);
    if (!summary) return undefined;

    // Publish 1–2 international break media stories.
    const teamId = this.state.player.teamId;
    const myTeam = this.teamsById.get(teamId);
    const mine = summary.callUps.filter(c => c.clubId === teamId);
    if (mine.length > 0 && myTeam) {
      const stories = generateInternationalStories({
        seed: hashSeed(this.state.seed, 'intl', window, String(this.state.calendar.week)),
        window,
        clubName: myTeam.name,
        clubShort: myTeam.shortName ?? myTeam.name,
        players: mine.map(c => ({
          firstName: c.firstName,
          lastName: c.lastName,
          nation: c.nation,
          appearances: c.appearances,
          injured: c.injured,
          statGains: Object.keys(c.statDeltas).length,
        })),
      });
      for (const story of stories) {
        applySeasonEvent(this.state, { type: 'MEDIA_STORY_PUBLISHED', story });
      }
    }

    return summary;
  }

  getBreakWindow(): InternationalWindow | null {
    return this.intlBreak.getBreakWindow();
  }

  isCupBlockStart(): boolean {
    return this.intlBreak.isCupBlockStart();
  }

  // One training week for a cup/European matchday — gap-based like
  // applyTrainingBlock, but from the current matchday's date to the next
  // matchday (cup or league), so each game week recovers/develops over just
  // its own span. Emits game:trainingApplied.
  runCupMatchdayTraining(weeks: TrainingPlan[]): TrainingWeekResult {
    const n = Math.max(1, weeks.length);
    const { days } = this.matchdayGap();
    const spans = splitGapIntoPeriods(days, n);
    const acc = runTrainingPeriods(this.state, weeks, spans);
    eventBus.emit('game:trainingApplied', { state: this.state });
    return { plan: weeks[weeks.length - 1], players: [...acc.values()], weeks: n };
  }

  // One training week for a European matchday — gap-scoped to the next matchday,
  // anchored on the date of the just-played fixture (see matchdayGap).
  // Emits game:trainingApplied.
  runEuropeanMatchdayTraining(weeks: TrainingPlan[]): TrainingWeekResult {
    const n = Math.max(1, weeks.length);
    const { days } = this.matchdayGap();
    const spans = splitGapIntoPeriods(days, n);
    const acc = runTrainingPeriods(this.state, weeks, spans);
    eventBus.emit('game:trainingApplied', { state: this.state });
    return { plan: weeks[weeks.length - 1], players: [...acc.values()], weeks: n };
  }

  europeanMatchdayGap(): { weeks: number; days: number } {
    return this.matchdayGap();
  }

  // The gap from the current cup matchday to the player's next matchday — used
  // by the training screen so a cup-week training session shows a single,
  // matchday-scoped week rather than the surrounding multi-week league break
  // (which `upcomingGap`, keyed off the derived leagueRound, would report). Mirrors the
  // span runCupMatchdayTraining itself recovers/develops over.
  cupMatchdayGap(): { weeks: number; days: number } {
    return this.matchdayGap();
  }

  // Shared FROM→TO span for a cup/European matchday training week. The FROM
  // anchor is the date of the matchday the manager just played, NOT
  // `calendar.date`: a non-league fixture often kicks off on a Friday, while
  // `calendar.date` tracks the upcoming LEAGUE round's earliest fixture (often a
  // later date). Anchoring on `calendar.date` understates the rest gap — e.g. a
  // Fri cup match with the next league round opening on a later Friday would
  // report a 3-day gap when the player's own next match is 9 days away (#118).
  // Falls back to `calendar.date` when no matchday has been played yet.
  private matchdayGap(): { weeks: number; days: number } {
    const playerId = this.state.player.teamId;
    const from = lastPlayedMatchdayDate(this.state, playerId) ?? this.state.calendar.date;
    return upcomingGapFromDate(from, nextPlayableDate(this.state, playerId, from));
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

  // The player's earliest pending European fixture whose date falls on or
  // before the current calendar date. Returns null when none is due yet or
  // the player's team is not in any European competition.
  getCurrentEuropeanFixture(): EuropeanFixtureRef | null {
    const playerTeamId = this.state.player.teamId;
    const calDate = this.state.calendar.date;

    const findPool = (competition: 'europeanCup' | 'europeanShield'): EuropeanFixtureRef | null => {
      const comp = this.state.league[competition];
      if (!comp) return null;
      const pending = comp.fixtures
        .filter(f => !f.result && (f.homeId === playerTeamId || f.awayId === playerTeamId) && !!f.date && f.date <= calDate)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      if (!pending[0]) return null;
      return { kind: 'pool', competition, fixture: pending[0] };
    };

    const findKO = (competition: 'europeanCup' | 'europeanShield'): EuropeanFixtureRef | null => {
      const ko = this.state.league[competition]?.knockout;
      if (!ko) return null;
      const stages: Array<['r16' | 'quarterfinal' | 'semifinal' | 'final', EuropeanKnockoutMatch[]]> = [
        ['r16', ko.r16],
        ['quarterfinal', ko.quarterfinals],
        ['semifinal', ko.semifinals as EuropeanKnockoutMatch[]],
        ['final', [ko.final]],
      ];
      for (const [stage, matches] of stages) {
        for (const match of matches) {
          if (!match.result && match.homeId && match.awayId
            && (match.homeId === playerTeamId || match.awayId === playerTeamId)
            && match.date && match.date <= calDate) {
            return { kind: 'knockout', competition, stage, match };
          }
        }
      }
      return null;
    };

    return findPool('europeanCup')
      ?? findPool('europeanShield')
      ?? findKO('europeanCup')
      ?? findKO('europeanShield');
  }

  // The earliest European round (across both competitions) whose every fixture
  // is resolved, whose latest date is on or before today, and which has not
  // yet been shown to the player. Returns null when nothing is due.
  getCurrentEuropeanRound(): EuropeanRoundRef | null {
    const calDate = this.state.calendar.date;
    for (const comp of ['europeanCup', 'europeanShield'] as const) {
      const compState = this.state.league[comp];
      if (!compState) continue;
      const shown = new Set(compState.shownRounds ?? []);
      const compLabel = comp === 'europeanCup' ? 'European Cup' : 'European Shield';

      // Pool rounds 1-4
      for (let r = 1; r <= 4; r++) {
        const key = `pool:${r}`;
        if (shown.has(key)) continue;
        const fxs = compState.fixtures.filter(f => f.round === r);
        if (fxs.length === 0) continue;
        const latestDate = fxs.map(f => f.date ?? '').filter(Boolean).sort().pop() ?? '';
        if (!latestDate || latestDate > calDate) continue;
        if (fxs.some(f => !f.result)) continue; // wait until all resolved
        return { competition: comp, roundKey: key, isFinal: false, label: `Pool Round ${r}`, compLabel };
      }

      // Knockout rounds
      const ko = compState.knockout;
      if (!ko) continue;
      const koStages: Array<{ key: string; label: string; isFinal: boolean; matches: Array<{ date?: string; result?: unknown; homeId: string | null; awayId: string | null }> }> = [
        { key: 'r16', label: 'Round of 16', isFinal: false, matches: ko.r16 },
        { key: 'qf', label: 'Quarter-Finals', isFinal: false, matches: ko.quarterfinals },
        { key: 'sf', label: 'Semi-Finals', isFinal: false, matches: ko.semifinals as Array<{ date?: string; result?: unknown; homeId: string | null; awayId: string | null }> },
        { key: 'final', label: 'Final', isFinal: true, matches: [ko.final] },
      ];
      for (const { key, label, isFinal, matches } of koStages) {
        if (shown.has(key)) continue;
        const slotted = matches.filter(m => m.homeId && m.awayId);
        if (slotted.length === 0) continue;
        const latestDate = slotted.map(m => m.date ?? '').filter(Boolean).sort().pop() ?? '';
        if (!latestDate || latestDate > calDate) continue;
        if (slotted.some(m => !m.result)) continue;
        return { competition: comp, roundKey: key, isFinal, label, compLabel };
      }
    }
    return null;
  }

  // Mark a European round as shown. Called after the player dismisses the
  // EuropeanRoundScreen or EuropeanFinalScreen for that round.
  markEuropeanRoundShown(competition: 'europeanCup' | 'europeanShield', roundKey: string): void {
    applySeasonEvent(this.state, { type: 'EUROPEAN_ROUND_SHOWN', competition, roundKey });
  }

  // Seed the European objective for the competition the player is in and
  // publish the pool-draw inbox story. Called once at season start.
  private seedEuropeanObjectiveAndDrawStory(): void {
    for (const comp of ['europeanCup', 'europeanShield'] as const) {
      const compState = this.state.league[comp];
      if (!compState) continue;
      const playerTeamId = this.state.player.teamId;
      const playerPool = compState.pools.find(p => p.teamIds.includes(playerTeamId));
      if (!playerPool) continue;

      this.board.seedEuropeanObjective(comp);

      const team = this.teamsById.get(playerTeamId);
      const clubName = team?.name ?? playerTeamId;
      const compLabel = comp === 'europeanCup' ? 'European Cup' : 'European Shield';
      const opponents = playerPool.teamIds
        .filter(id => id !== playerTeamId)
        .map(id => this.teamsById.get(id)?.name ?? id);
      const story = buildEuropeanDrawStory(
        comp, compLabel, this.state.calendar.seasonLabel,
        clubName, playerPool.id, opponents,
      );
      applySeasonEvent(this.state, { type: 'MEDIA_STORY_PUBLISHED', story });
      break; // player is in exactly one competition
    }
  }

  // Check if the player was eliminated from the European competition after
  // recording their result. Returns the achieved stage (or null if still in).
  private getEliminationStage(
    competition: 'europeanCup' | 'europeanShield',
    stage: 'pool' | 'r16' | 'quarterfinal' | 'semifinal' | 'final',
    homeScore: number,
    awayScore: number,
    playerSide: 'home' | 'away',
  ): EuropeanObjective | null {
    // For pool: check after the player's last pool match if they failed to qualify
    if (stage === 'pool') {
      const compState = this.state.league[competition];
      if (!compState) return null;
      const playerTeamId = this.state.player.teamId;
      const pool = compState.pools.find(p => p.teamIds.includes(playerTeamId));
      if (!pool) return null;
      // Only apply at end of pool stage (all 4 rounds played)
      const playerFixtures = compState.fixtures.filter(f =>
        (f.homeId === playerTeamId || f.awayId === playerTeamId) && f.result,
      );
      if (playerFixtures.length < 4) return null; // pool not finished yet
      // Check if they qualified (top 4) — must use the same sort as the
      // actual R16 seeding (EuropeanCoordinator.seedR16), else on level
      // points the verdict can contradict the bracket.
      const sorted = sortStandings([...pool.standings]);
      const rank = sorted.findIndex(s => s.teamId === playerTeamId) + 1;
      if (rank <= 4) return null; // qualified — not eliminated
      return 'participate';
    }
    // For knockout: player is eliminated if they lost
    const playerScore = playerSide === 'home' ? homeScore : awayScore;
    const oppScore = playerSide === 'home' ? awayScore : homeScore;
    if (playerScore >= oppScore) return null; // won — not eliminated
    // Map stage to achieved objective (they REACHED this stage but lost)
    const STAGE_TO_OBJECTIVE: Record<string, EuropeanObjective> = {
      r16: 'r16',
      quarterfinal: 'quarterfinal',
      semifinal: 'semifinal',
      final: 'final',
    };
    return STAGE_TO_OBJECTIVE[stage] ?? null;
  }

  // Play out the AI side of both European competitions up to the current
  // calendar date: sim due pool fixtures, seed each knockout once its pool
  // completes, then sim due knockout matches (the player's own are skipped —
  // they're played live). Idempotent + date-gated, so results accumulate
  // round-by-round across the season. Driven from the match tick + after the
  // player records a European result.
  async advanceEuropeanCompetitions(): Promise<void> {
    const asOf = this.state.calendar.date;
    // Pool fixtures for both competitions first.
    await this.european.runPoolStage('europeanCup', asOf);
    await this.european.runPoolStage('europeanShield', asOf);
    // EC knockout once its pool is complete.
    if (this.european.allPoolFixturesDone('europeanCup')) {
      await this.european.runKnockoutStage('europeanCup', asOf);
    }
    // Shield knockout once BOTH pools are complete — the Shield R16 seeds the
    // 5th-placed EC teams as drop-downs, so the EC pool's final standings must
    // be settled first.
    if (this.european.allPoolFixturesDone('europeanShield') && this.european.allPoolFixturesDone('europeanCup')) {
      await this.european.runKnockoutStage('europeanShield', asOf);
    }
  }

  async recordPlayerEuropeanPoolResult(
    competition: 'europeanCup' | 'europeanShield',
    poolId: number,
    round: number,
    homeId: string,
    awayId: string,
    homeScore: number,
    awayScore: number,
    snapshot: MatchSnapshot,
  ): Promise<void> {
    const playerTeamId = this.state.player.teamId;
    const playerSide: 'home' | 'away' = homeId === playerTeamId ? 'home' : 'away';
    // Idempotency guard — EuropeanCoordinator skips an already-recorded
    // fixture, so the board-confidence / media-story side effects below
    // must not re-apply either (e.g. a double-tap on the result overlay).
    const poolFx = this.state.league[competition]?.fixtures.find(f =>
      f.poolId === poolId && f.round === round && f.homeId === homeId && f.awayId === awayId,
    );
    if (!poolFx || poolFx.result) return;
    await this.european.recordPlayerEuropeanPoolResult(
      competition, poolId, round, homeId, awayId, homeScore, awayScore, snapshot,
    );
    // Sim any AI fixtures now due + seed the knockout once the pool completes,
    // so the elimination check below sees the finished pool / seeded bracket.
    await this.advanceEuropeanCompetitions();
    // Check for pool-stage elimination after the player's last pool match
    const elim = this.getEliminationStage(competition, 'pool', homeScore, awayScore, playerSide);
    if (elim !== null) {
      this.board.applyEuropeanElimination(competition, elim);
      const team = this.teamsById.get(playerTeamId);
      const compLabel = competition === 'europeanCup' ? 'European Cup' : 'European Shield';
      applySeasonEvent(this.state, {
        type: 'MEDIA_STORY_PUBLISHED',
        story: buildEuropeanEliminationStory(competition, compLabel, team?.name ?? playerTeamId, elim, round),
      });
    }
    eventBus.emit('game:weekAdvanced', { state: this.state });
  }

  async recordPlayerEuropeanKnockoutResult(
    competition: 'europeanCup' | 'europeanShield',
    stage: 'r16' | 'quarterfinal' | 'semifinal' | 'final',
    matchIndex: number,
    homeScore: number,
    awayScore: number,
    snapshot: MatchSnapshot,
  ): Promise<void> {
    const ko = this.state.league[competition]?.knockout;
    if (!ko) return;
    const matchArr = stage === 'r16' ? ko.r16 : stage === 'quarterfinal' ? ko.quarterfinals : stage === 'semifinal' ? ko.semifinals as Array<{ homeId: string | null; awayId: string | null; result?: unknown }> : [ko.final];
    const match = matchArr[matchIndex];
    // Idempotency guard — mirror EuropeanCoordinator's already-recorded skip
    // so the board-confidence / media-story side effects below don't re-apply.
    if (!match || match.result) return;
    const playerTeamId = this.state.player.teamId;
    const playerSide: 'home' | 'away' = match.homeId === playerTeamId ? 'home' : 'away';
    await this.european.recordPlayerEuropeanKnockoutResult(
      competition, stage, matchIndex, homeScore, awayScore, snapshot,
    );
    // Sim the rest of this knockout round's AI matches (now due) so the
    // bracket cascades; later rounds sim by date as the season advances.
    await this.advanceEuropeanCompetitions();
    if (stage !== 'final') {
      const elim = this.getEliminationStage(competition, stage, homeScore, awayScore, playerSide);
      if (elim !== null) {
        this.board.applyEuropeanElimination(competition, elim);
        const team = this.teamsById.get(playerTeamId);
        const compLabel = competition === 'europeanCup' ? 'European Cup' : 'European Shield';
        const roundNum = stage === 'r16' ? 5 : stage === 'quarterfinal' ? 6 : 7;
        applySeasonEvent(this.state, {
          type: 'MEDIA_STORY_PUBLISHED',
          story: buildEuropeanEliminationStory(competition, compLabel, team?.name ?? playerTeamId, elim, roundNum),
        });
      }
    } else {
      // Final: if player won, apply board confidence for winning
      const playerScore = playerSide === 'home' ? homeScore : awayScore;
      const oppScore = playerSide === 'home' ? awayScore : homeScore;
      if (playerScore > oppScore) {
        this.board.applyEuropeanElimination(competition, 'win');
      } else {
        this.board.applyEuropeanElimination(competition, 'final');
      }
    }
    eventBus.emit('game:weekAdvanced', { state: this.state });
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
        ? computeAttendance(fixture, homeJson.stadiumCapacity, this.state.league.standings, this.state.league.results, this.state.player.fanSentiment)
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
    // reflects a full round of results.
    await this.simLeagueRound(round);

    // Yellow card accumulation ban: check if any human squad player has hit
    // the threshold for the first time this season. `round` is the league round
    // just played; the ban covers the NEXT league round (round + 1). Keyed off
    // the league round, not the monotonic calendar.week — read back via
    // leagueRound(state) in selectionUnavailableIds / inbox.
    const humanClub = this.state.career.clubs.find(c => c.id === this.state.player.teamId);
    if (humanClub) {
      for (const rid of humanClub.squad) {
        const p = this.state.career.roster[rid];
        if (!p || p.suspension) continue;
        if (p.seasonStats.yellowCards >= YELLOW_BAN_THRESHOLD) {
          applySeasonEvent(this.state, {
            type: 'PLAYER_SUSPENDED',
            rosterId: rid,
            forRound: round + 1,
          });
        }
      }
    }

    // Reconcile PGA rest obligations for the round just played. A player whose
    // obligation covered this round and who didn't feature has satisfied it.
    // `round` is the just-played league round (the obligation eligibleRounds are
    // league-round numbers).
    for (const ev of reconcileRestObligations(this.state, round, this.humanMatchdaySquadIds())) {
      applySeasonEvent(this.state, ev);
    }

    await this.runWeeklyTick();

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

  // The competition-agnostic elapsed-week seam. Advances calendar.date to
  // `toDate` and runs every season pass that fires purely on the passage of
  // game time, scaled by the whole-week gap from the current cursor: the
  // monotonic week counter, AI European catch-up, morale decay, and
  // scouting-accuracy gain. Called from EVERY competition's advance — the
  // league tick (via runWeeklyTick), and the cup / European / playoff matchday
  // flow (via advanceMatchdayCalendar) — so each elapsed week is ticked exactly
  // once, as it passes, rather than batched at the next league round.
  //
  // The cursor is **forward-only**: a `toDate` at or before the current
  // `calendar.date` ticks 0 weeks AND leaves `calendar.date` untouched (no
  // backward `MATCHDAY_ADVANCED`). Only a strictly-later `toDate` advances the
  // date and ticks weeks. This is the load-bearing invariant — without it a
  // matchday whose date the league cursor has already skipped past would move
  // the cursor backward and (via the `days <= 0 → weeks:1` floor) tick a
  // phantom extra week.
  //
  // `weeks` = round(daysBetween(currentDate, toDate) / 7), min 1 for a real
  // forward advance (matchdays are ≥5 days apart in the real schedule, so this
  // never floors a genuine gap); a no-op or backward advance ticks nothing.
  // Summed across a season — every advance counting only the strictly-forward
  // days since the last cursor position — the increments total the true
  // calendar span (first→last fixture) with no week double-counted and none
  // skipped, including across international breaks (each break matchday ticks
  // the days since the previous one) and on bye weeks (the next block's start
  // date carries the cursor through).
  //
  // Round-based passes (transfer-request/promise checks, poach threats, AI
  // early-renewal cadence, playoff seeding) are NOT here — they stay tied to
  // league rounds in recordPlayerMatchResult, since their streak edges /
  // cadence counters are per-league-round and would misfire if looped per
  // calendar week or re-run on every cup/European matchday during a break.
  private async tickElapsedWeeks(toDate: string): Promise<void> {
    const forward = !!toDate && toDate > this.state.calendar.date;
    const weeks = forward ? upcomingGapFromDate(this.state.calendar.date, toDate).weeks : 0;
    if (forward) {
      applySeasonEvent(this.state, { type: 'MATCHDAY_ADVANCED', toDate });
    }
    if (weeks > 0) {
      applySeasonEvent(this.state, { type: 'WEEK_ADVANCED', weeks });
    }
    // Play out any European fixtures whose date has now arrived (AI sides;
    // the player plays their own live). The bracket fills in over the season.
    // Date-gated + idempotent over already-simmed fixtures, so the European
    // record paths re-calling it after recording a player result is harmless.
    await this.advanceEuropeanCompetitions();
    // Morale decay + scouting accuracy run once per elapsed week, so a
    // multi-week international break decays idle players toward baseline /
    // accrues scouting accuracy proportionally more than a one-week turnaround.
    // RNG-free + order-stable, so determinism holds.
    for (let w = 0; w < weeks; w++) {
      for (const ev of computeMoraleDecayEvents(this.state)) {
        applySeasonEvent(this.state, ev);
      }
    }
    for (let w = 0; w < weeks; w++) this.staff.advanceScoutingAccuracy();
    eventBus.emit('game:weekAdvanced', { state: this.state });
  }

  // The league-round weekly tick. Advances the cursor only as far as the next
  // actual calendar event — the next unplayed block's start date across ALL
  // competitions, NOT the next league round. During an international break that
  // next event is the first cup/European matchday, so the league round ticks
  // only up to it and the break's own matchdays tick forward through the rest;
  // re-homing straight to the next league round would jump the cursor past the
  // whole break and force the break's matchdays to move it backward (the H1
  // double-count bug). For a pure league-to-league gap with no intervening
  // matchday the next block IS the next league round, so behaviour is
  // unchanged. The block start date exists regardless of whether the player has
  // a fixture in it, so byes still advance the cursor correctly. Falls back to
  // the next league round's kick-off (then +1 week) when no block remains.
  // Then the league-round-keyed passes that are NOT safe to fire per-calendar-
  // week: transfer-request/promise checks, poach-threat assessment, AI
  // early-renewal cadence.
  private async runWeeklyTick(): Promise<void> {
    const nextBlockDate = this.getNextBlock()?.startDate;
    const newDate = nextBlockDate
      ?? earliestDateForRound(this.state.league.fixtures, leagueRound(this.state))
      ?? addDaysIso(this.state.calendar.date, SEASON_VALUES.weekLengthDays);
    await this.tickElapsedWeeks(newDate);

    this.transfers.checkTransferRequestsAndPromises();

    // Background poach-threat assessment — RNG-free, runs every round.
    // Keeps the Hub Transfers badge current without the user opening
    // the screen first.
    if (!this.state.career.market) {
      this.transfers.updatePoachThreats();
    }

    // AI early-renewal cadence: every AI_EARLY_RENEWAL_CADENCE_ROUNDS league
    // rounds, each AI club attempts to lock in its best expiring player before
    // the off-season window. Keyed off the league round (the cadence is a
    // round count), not the monotonic calendar.week.
    if (leagueRound(this.state) % AI_EARLY_RENEWAL_CADENCE_ROUNDS === 1) {
      this.transfers.runAIEarlyRenewals();
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

  // Sets (or changes) a player's squad status. Callable at any time in-season;
  // the new status affects morale expectations on omission from the next
  // fixture onwards and feeds into renewal wage/acceptance at end of season.
  setSquadStatus(rosterId: number, status: SquadStatusKey): void {
    applySeasonEvent(this.state, { type: 'SQUAD_STATUS_SET', rosterId, status });
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
  async rollSeason(): Promise<SeasonEvent[]> {
    const events = computeRollover(this.state, [...this.teamsById.keys()]);
    for (const ev of events) applySeasonEvent(this.state, ev);
    // Re-seed the loan pool for the new season — replaces the old pool
    // (whose returned players persist in the roster as orphaned records).
    // Runs AFTER the rollover events so nextRosterId reflects the academy/
    // import allocations, and after redrawCupPools so its rngTransfer draws
    // can't shift any rollover draw. [RNG]: shifts career draws downstream
    // of the rollover relative to pre-reseed saves.
    for (const ev of buildLoanPoolEvents(this.state)) {
      applySeasonEvent(this.state, ev);
      events.push(ev);
    }
    // Re-seed board confidence for the new season from the finish just
    // archived by SEASON_ROLLED_OVER (resets the final-warning latch).
    this.board.seedBoardState();
    // Simulate European competitions headlessly for the new season.
    // Pools are already seeded via EUROPEAN_COMP_SEEDED in computeRollover;
    // we just need to run the matches.
    await this.european.runPoolStage('europeanCup');
    if (this.european.allPoolFixturesDone('europeanCup')) {
      await this.european.runKnockoutStage('europeanCup');
    }
    await this.european.runPoolStage('europeanShield');
    if (this.european.allPoolFixturesDone('europeanShield')) {
      await this.european.runKnockoutStage('europeanShield');
    }
    this.seedEuropeanObjectiveAndDrawStory();
    eventBus.emit('game:seasonRolledOver', { state: this.state });
    return events;
  }

  // ===== Calendar-block surface (Stage 2 of the unified-calendar refactor) =====

  // The next unplayed block across all competitions, or null when the season
  // is exhausted. Thin wrapper over the pure calendarBlocks.nextBlock helper.
  getNextBlock(): CalendarBlock | null {
    return nextBlock(this.state, [...this.teamsById.keys()]);
  }

  // Sims all non-player, not-yet-recorded fixtures in the block across every
  // competition present. Delegates to the existing per-competition sim methods;
  // does NOT drive calendar advance or weekly passes (those belong to the block
  // driver in main.ts). Fixtures are processed in competition order (league →
  // cup → european → playoff), then by date, then by homeId within each
  // competition — determinism depends on this stable ordering.
  async simRestOfBlock(block: CalendarBlock): Promise<void> {
    // League: collect distinct rounds in the block (stable: ascending round).
    if (block.competitions.includes('league')) {
      const rounds = [...new Set(
        block.fixtures
          .filter((f): f is Extract<typeof f, { comp: 'league' }> => f.comp === 'league')
          .map(f => f.round),
      )].sort((a, b) => a - b);
      for (const r of rounds) {
        await this.simLeagueRound(r);
      }
    }

    // Cup: simDueCupFixtures sims all non-player unplayed cup fixtures
    // (including knockouts seeded once leg-2 completes), skipping player's own.
    if (block.competitions.includes('cup')) {
      await this.simDueCupFixtures();
    }

    // European: advanceEuropeanCompetitions sims all non-player pool + knockout
    // fixtures due by the current calendar date, skipping player's own.
    if (block.competitions.includes('european')) {
      await this.advanceEuropeanCompetitions();
    }

    // Playoff: sim SFs first (so the final slot fills), then the final.
    if (block.competitions.includes('playoff')) {
      await this.simulatePendingPlayoffMatches('sf');
      await this.simulatePendingPlayoffMatches('final');
    }
  }

  // Headless-simulate every non-player, unrecorded fixture in `round`. Sims
  // run in fixture-list order (stable: authored/generated sort). Each fixture
  // derives its own seed from (rootSeed, round, homeId, awayId) via
  // simulateFixture. Called from recordPlayerMatchResult (after the player's
  // own result is applied) and simRestOfBlock (for AI-only rounds in the block).
  private async simLeagueRound(round: number): Promise<void> {
    const playerId = this.state.player.teamId;
    const recorded = new Set(
      this.state.league.results
        .filter(r => r.round === round)
        .map(r => `${r.homeId}|${r.awayId}`),
    );
    const aiFixtures = this.state.league.fixtures.filter(f =>
      f.round === round &&
      f.homeId !== playerId &&
      f.awayId !== playerId &&
      !recorded.has(`${f.homeId}|${f.awayId}`),
    );
    for (const f of aiFixtures) {
      const homeJson = this.teamsById.get(f.homeId);
      const awayJson = this.teamsById.get(f.awayId);
      if (!homeJson || !awayJson) continue;
      const home = buildAutoSelectedTeamFromRoster(this.state, homeJson);
      const away = buildAutoSelectedTeamFromRoster(this.state, awayJson);
      const attendance = homeJson.stadiumCapacity
        ? computeAttendance(f, homeJson.stadiumCapacity, this.state.league.standings, this.state.league.results)
        : undefined;
      const homeFillRate = attendance !== undefined && homeJson.stadiumCapacity
        ? attendance / homeJson.stadiumCapacity
        : undefined;
      const ref = f.refereeId ? getRefereeById(f.refereeId) : undefined;
      const sim = await simulateFixture(home, away, this.state.seed, f.round, { homeFillRate, isDerby: f.isDerby, refStrictness: ref?.strictness, refCardThreshold: ref?.cardThreshold });
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
        attendance,
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
  }

  // Every consumer immediately JSON.stringifys the payload (autosave →
  // saveGame → saveToSlot; the schema harness only inspects keys), so the
  // sub-trees are returned by reference — no defensive cloning (CLAUDE.md §2:
  // never deep-clone just to stringify).
  //

  toSavePayload(): SavedSeason {
    return {
      playerTeamId: this.state.player.teamId,
      seed: this.state.seed,
      currentWeek: this.state.calendar.week,
      results: this.state.league.results,
      seasonLabel: this.state.calendar.seasonLabel,
      fixtures: this.state.league.fixtures,
      ...(this.state.player.tactics ? { tactics: this.state.player.tactics } : {}),
      ...(this.state.player.matchdaySquad
        ? { matchdaySquad: this.state.player.matchdaySquad }
        : {}),
      ...(this.state.player.training ? { training: this.state.player.training } : {}),
      ...(this.state.player.board ? { board: this.state.player.board } : {}),
      careerRngOffset: getTransferCallCount(),
      career: {
        seasonsCompleted: this.state.career.seasonsCompleted,
        nextRosterId: this.state.career.nextRosterId,
        clubs: this.state.career.clubs.map(c => ({ id: c.id, squad: c.squad, salaryBudget: c.salaryBudget })),
        roster: this.state.career.roster,
        archive: this.state.career.archive.slice(-ARCHIVE_CAP),
        freeAgents: this.state.career.freeAgents,
        market: this.state.career.market,
        pendingMoves: this.state.career.pendingMoves,
        ...(this.state.career.preSeasonStep !== undefined
          ? { preSeasonStep: this.state.career.preSeasonStep }
          : {}),
        takeoverHistory: this.state.career.takeoverHistory,
        midseasonRejections: this.state.career.midseasonRejections,
        activePoachedIds: this.state.career.activePoachedIds,
        ...(this.state.career.staff !== undefined
          ? { staff: this.state.career.staff, nextStaffId: this.state.career.nextStaffId }
          : {}),
        ...(this.state.career.loanPool !== undefined
          ? { loanPool: this.state.career.loanPool }
          : {}),
        ...(this.state.career.hallOfFame !== undefined
          ? { hallOfFame: this.state.career.hallOfFame }
          : {}),
      },
      teamSeasonStats: this.state.league.teamSeasonStats,
      // Persist the live playoff bracket only when it exists — keeps the
      // save payload byte-equivalent for the common in-season case.
      ...(this.state.league.playoffs
        ? { playoffs: this.state.league.playoffs }
        : {}),
      // Persist the Prem Cup (cup results aren't replayable from `results`).
      ...(this.state.league.premCup
        ? { premCup: this.state.league.premCup }
        : {}),
      ...(this.state.player.cupDirection
        ? { cupDirection: this.state.player.cupDirection }
        : {}),
      ...(this.state.player.cupManageLive
        ? { cupManageLive: true }
        : {}),
      ...(this.state.league.mediaStories.length > 0
        ? { mediaStories: this.state.league.mediaStories }
        : {}),
      ...(this.state.player.captainRosterId !== undefined
        ? { captainRosterId: this.state.player.captainRosterId }
        : {}),
      ...(this.state.player.scouting && Object.keys(this.state.player.scouting).length > 0
        ? { scouting: this.state.player.scouting }
        : {}),
      ...(this.state.player.fanSentiment !== undefined
        ? { fanSentiment: this.state.player.fanSentiment }
        : {}),
      // Persist European competition states (not replayable from `results`).
      ...(this.state.league.europeanCup
        ? { europeanCup: this.state.league.europeanCup }
        : {}),
      ...(this.state.league.europeanShield
        ? { europeanShield: this.state.league.europeanShield }
        : {}),
    };
  }
}


