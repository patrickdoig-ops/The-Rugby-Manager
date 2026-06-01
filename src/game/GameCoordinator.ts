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
  ArchivedSeason, ClubState, CupFixture,
  Fixture, FixtureResult, GameState, MarketState, PlayerRef, PlayoffMatch, PlayoffState, PreAgreement, SeasonEvent, SeasonSchedule,
} from '../types/gameState';
import { emptyCareerState } from '../types/gameState';
import { sortStandings } from './leagueTable';
import type { Player, InternationalWindow } from '../types/player';
import type { TeamTactics } from '../types/team';
import type { TrainingPlan, TrainingWeekResult, PlayerTrainingResult, InternationalBreakSummary } from '../types/training';
import type { PlayerStats } from '../types/player';
import { applySeasonEvent } from './applySeasonEvent';
import type { PreSeasonTransfer } from '../data/transfers-2025-26';
import { simulateFixture } from './simulateFixture';
import { seedRoster } from './rosterSeeder';
import { buildAutoSelectedTeamFromRoster, buildCupTeamFromRoster } from './rosterTeamBuilder';
import { CUP_POOLS_2025_26, CUP_SEED_ROUND, buildCupSeed, buildCupKnockoutSeed } from './cupScheduler';
import { cupDevelopmentEvents } from './cupDevelopment';
import { parseSeasonStartYear, seasonOpenIso, getAge } from './age';
import { recentForm } from './teamStats';
import { generateMatchStory, type MediaMatchContext, type MediaPlayer } from './media/mediaManager';
import { collectSeasonEvents, collectConditionEvents, type MatchSnapshot, type PlayerStatsSnapshot } from './seasonStatsCollector';
import { computeTrainingWeek } from './trainingWeek';
import { upcomingGap, splitGapIntoPeriods } from './trainingCalendar';
import {
  isInternationalBreak, selectInternationalSquads, buildCallUpEvents,
  resolveInternationalBreak, reconcileRestObligations, lionsReturnEvents,
  type CallUp,
} from './internationalDutyEngine';
import { computeRollover } from './careerRollover';
import { generatePersona } from './personaGenerator';
import { buildRosterSeededEvent, buildCareerArchiveRestoredEvent } from './saveMigration';
import { TransferCoordinator, type EarlyRenewalResult } from './TransferCoordinator';
import { computeBudgetEvents } from './budgetPlanner';
import { computeAttendance } from './attendance';
import { eventBus } from '../utils/eventBus';
import { setCareerSeed, rngTransfer, getTransferCallCount, advanceTransferTo, hashSeed } from '../utils/rng';
import { SEASON_VALUES, INJURY_SEVERITY, STARTER_FA_POOL } from '../engine/balance';
import type { InjurySeverity } from '../types/player';
import { PREMIERSHIP_2025_26 } from '../data/fixtures-2025-26';
import type { RawTeamInput } from '../types/teamData';

// Returned by beginInternationalBreak() — the context the break-flow UI
// (call-ups screen → cup-fixtures screen → training) needs, and that
// runInternationalBreakBlock() consumes to play out the block.
export interface BreakBeginResult {
  window: InternationalWindow;
  callUps: CallUp[];
  cupLeg: 1 | 2;
  cupFixturesThisBlock: CupFixture[];
  cupDirection: 'best' | 'rest_first_15';
}

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
    eventBus.emit('game:initialized', { state: coord.state });
    return coord;
  }

  setPlayerTactics(tactics: TeamTactics): void {
    applySeasonEvent(this.state, { type: 'PLAYER_TACTICS_SET', tactics });
  }

  setPlayerMatchdaySquad(squad: PlayerRef[]): void {
    applySeasonEvent(this.state, { type: 'PLAYER_MATCHDAY_SQUAD_SET', squad });
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
    const acc = this.runTrainingPeriods(weeks, spans);
    eventBus.emit('game:trainingApplied', { state: this.state });
    return { plan: weeks[weeks.length - 1], players: [...acc.values()], weeks: n };
  }

  // Per-period training loop, shared by the non-break path (applyTrainingBlock)
  // and the international-break path (runInternationalBreakBlock). Each period
  // emits one PLAYER_TRAINING_PLAN_SET then one PLAYER_TRAINED per non-injured,
  // non-international player league-wide plus optional PLAYER_INJURED; AI clubs
  // get their plan from aiTrainingDirector, re-picked per period. Returns the
  // per-player results merged across the block for PostTrainingResultsScreen.
  private runTrainingPeriods(weeks: TrainingPlan[], spans: number[]): Map<number, PlayerTrainingResult> {
    const n = Math.max(1, weeks.length);
    // Per-player accumulator merged across periods. conditionBefore is
    // captured the first period a player trains; conditionAfter tracks the
    // latest; statDeltas sum; newlyInjured latches on any period.
    const acc = new Map<number, PlayerTrainingResult>();

    for (let i = 0; i < n; i++) {
      const plan = weeks[i] ?? weeks[weeks.length - 1];
      const events = computeTrainingWeek(this.state, plan, spans[i]);

      // Snapshot the to-be-changed stats per trained player before applying.
      const beforeSnap = new Map<number, { condition: number; stats: Partial<PlayerStats> }>();
      for (const ev of events) {
        if (ev.type !== 'PLAYER_TRAINED') continue;
        const p = this.state.career.roster[ev.rosterId];
        if (!p) continue;
        const stats: Partial<PlayerStats> = {};
        for (const k of Object.keys(ev.statDeltas) as (keyof PlayerStats)[]) {
          stats[k] = p.baseStats[k];
        }
        beforeSnap.set(ev.rosterId, { condition: p.condition ?? 100, stats });
      }

      const injuredThisPeriod = new Set<number>();
      for (const ev of events) {
        if (ev.type === 'PLAYER_INJURED') injuredThisPeriod.add(ev.rosterId);
      }

      for (const ev of events) applySeasonEvent(this.state, ev);

      for (const ev of events) {
        if (ev.type !== 'PLAYER_TRAINED') continue;
        const p = this.state.career.roster[ev.rosterId];
        const snap = beforeSnap.get(ev.rosterId);
        if (!p || !snap) continue;
        const existing = acc.get(ev.rosterId);
        const entry = existing ?? {
          rosterId: ev.rosterId,
          conditionBefore: snap.condition,
          conditionAfter: p.condition ?? 100,
          statDeltas: {},
          newlyInjured: false,
        };
        // Real (post-clamp) gains for this period, summed into the block total.
        for (const k of Object.keys(snap.stats) as (keyof PlayerStats)[]) {
          const gain = (p.baseStats[k] ?? 0) - (snap.stats[k] ?? 0);
          if (gain > 0) entry.statDeltas[k] = (entry.statDeltas[k] ?? 0) + gain;
        }
        entry.conditionAfter = p.condition ?? 100;
        if (injuredThisPeriod.has(ev.rosterId)) entry.newlyInjured = true;
        acc.set(ev.rosterId, entry);
      }
    }
    return acc;
  }

  // ── International break: begin / run split ───────────────────────────────
  //
  // The break is a two-phase flow so the UI can show the call-ups + Prem Cup
  // fixtures (and collect the Assistant-Manager direction) BEFORE the block
  // simulates. beginInternationalBreak does only RNG-free work (squad
  // selection + flagging + cup lookup); runInternationalBreakBlock does the
  // cup sims (MATCH stream), the training periods + international returns
  // (rngTransfer — identical sequence to applyTrainingBlock).

  // Detects the break, flags the called-up players, and returns the call-ups
  // + this block's cup fixtures + the persisted cup direction. Returns null
  // off a break round. Idempotent: re-calling at the same break won't
  // double-bump internationalCaps. RNG-free.
  // Pure detector (no side effects): true when the calendar is parked at an
  // international break whose cup leg hasn't been played yet — i.e. the break
  // flow was interrupted (tab close) before completing. Used by continueGame
  // to resume the break on reload rather than silently skipping it. Returns
  // false once the leg's fixtures are all resolved (break done, just awaiting
  // the post-break round).
  isBreakPending(): boolean {
    const window = isInternationalBreak(this.state);
    if (!window) return false;
    const cup = this.state.league.premCup;
    if (!cup) return true; // not seeded → break definitely hasn't run
    const cupLeg: 1 | 2 = window === 'autumn' ? 1 : 2;
    return cup.fixtures.some(f => f.leg === cupLeg && !f.result);
  }

  beginInternationalBreak(): BreakBeginResult | null {
    const window = isInternationalBreak(this.state);
    if (!window) return null;

    // Lazy-seed the cup if it isn't (defensive — covers saves created before
    // the cup system). Fixed 2025-26 pools, RNG-free.
    if (this.state.league.premCup === null) {
      applySeasonEvent(this.state, {
        type: 'PREM_CUP_SEEDED',
        ...buildCupSeed(CUP_POOLS_2025_26, this.state.league.fixtures, this.state.calendar.seasonLabel),
      });
    }

    const callUps = selectInternationalSquads(this.state, window);
    const alreadyFlagged = callUps.some(
      c => this.state.career.roster[c.rosterId]?.internationalDuty?.window === window,
    );
    if (!alreadyFlagged) {
      for (const ev of buildCallUpEvents(callUps, window)) applySeasonEvent(this.state, ev);
    }

    const cupLeg: 1 | 2 = window === 'autumn' ? 1 : 2;
    const cupFixturesThisBlock = (this.state.league.premCup?.fixtures ?? []).filter(f => f.leg === cupLeg);
    const cupDirection = this.state.player.cupDirection ?? 'best';
    return { window, callUps, cupLeg, cupFixturesThisBlock, cupDirection };
  }

  // Runs the break block: Prem Cup fixtures (+ knockouts in leg 2), the cup
  // development nudge, the training periods, then international returns.
  // Determinism: the cup sims use the MATCH stream (independent of
  // rngTransfer); the dev nudge is RNG-free; the training + returns
  // rngTransfer sequence is byte-identical to applyTrainingBlock.
  async runInternationalBreakBlock(weeks: TrainingPlan[], begin: BreakBeginResult): Promise<TrainingWeekResult> {
    const restIds = begin.cupDirection === 'rest_first_15' ? this.firstChoiceStarterIds() : undefined;
    const featured = new Set<number>();

    // 1. Pool fixtures for this block (Assistant-managed, headless).
    for (const fx of begin.cupFixturesThisBlock) {
      await this.simulateCupFixture(fx, restIds, featured);
    }

    // 2. Leg 2: seed + play the knockout (SFs cascade into the final).
    if (begin.cupLeg === 2 && this.state.league.premCup) {
      const seed = buildCupKnockoutSeed(this.state.league.premCup, this.state.league.fixtures);
      applySeasonEvent(this.state, { type: 'PREM_CUP_KNOCKOUT_SEEDED', semifinals: seed.semifinals, final: seed.final });
      await this.simulateCupKnockout('semifinal_1', restIds, featured);
      await this.simulateCupKnockout('semifinal_2', restIds, featured);
      await this.simulateCupKnockout('final', restIds, featured);
    }

    // 3. Cup development nudge — one per featured player, RNG-free, before
    // training (so the dev nudge's conditionDelta-0 PLAYER_TRAINED doesn't
    // interleave with the training condition recovery).
    for (const ev of cupDevelopmentEvents(this.state, featured, this.state.calendar.date)) {
      applySeasonEvent(this.state, ev);
    }

    // 4. Training periods (rngTransfer). Internationals are already flagged
    // by beginInternationalBreak, so computeTrainingWeek skips them.
    const n = Math.max(1, weeks.length);
    const { days } = upcomingGap(this.state);
    const spans = splitGapIntoPeriods(days, n);
    const acc = this.runTrainingPeriods(weeks, spans);

    // 5. International returns (rngTransfer).
    let international: InternationalBreakSummary | undefined;
    if (begin.callUps.length > 0) {
      const resolved = resolveInternationalBreak(this.state, begin.callUps, begin.window);
      for (const ev of resolved.events) applySeasonEvent(this.state, ev);
      international = resolved.summary;
    }

    eventBus.emit('game:trainingApplied', { state: this.state });
    return {
      plan: weeks[weeks.length - 1],
      players: [...acc.values()],
      weeks: n,
      ...(international ? { international } : {}),
    };
  }

  // Build a Prem Cup matchday side from the roster. The user's club honours
  // the rest-the-first-15 direction; everyone else fields best-available
  // (international-duty + injured players excluded by buildCupTeamFromRoster).
  private buildCupSide(teamJson: RawTeamInput, restIds: number[] | undefined): RawTeamInput {
    const rest = teamJson.id === this.state.player.teamId ? restIds : undefined;
    return buildCupTeamFromRoster(this.state, teamJson, rest);
  }

  // Simulate one cup pool fixture (silent) and record it + the condition
  // writeback. NOT collectSeasonEvents (cup stats stay out of league leaderboards).
  private async simulateCupFixture(fx: CupFixture, restIds: number[] | undefined, featured: Set<number>): Promise<void> {
    const homeJson = this.teamsById.get(fx.homeId);
    const awayJson = this.teamsById.get(fx.awayId);
    if (!homeJson || !awayJson) return;
    const home = this.buildCupSide(homeJson, restIds);
    const away = this.buildCupSide(awayJson, restIds);
    const pseudoRound = fx.leg === 1 ? CUP_SEED_ROUND.leg1 : CUP_SEED_ROUND.leg2;
    const sim = await simulateFixture(home, away, this.state.seed, pseudoRound, {});
    applySeasonEvent(this.state, {
      type: 'PREM_CUP_FIXTURE_RECORDED',
      pool: fx.pool, leg: fx.leg, homeId: fx.homeId, awayId: fx.awayId,
      homeScore: sim.homeScore, awayScore: sim.awayScore,
      homeTries: sim.snapshot.homeSummary.tries, awayTries: sim.snapshot.awaySummary.tries,
    });
    for (const ev of collectConditionEvents(sim.snapshot)) applySeasonEvent(this.state, ev);
    for (const ev of this.rollNewInjuryEvents(sim.snapshot.playerSnapshots)) applySeasonEvent(this.state, ev);
    for (const s of sim.snapshot.playerSnapshots) featured.add(s.rosterId);
  }

  // Simulate one cup knockout match (silent). The final plays at a neutral
  // venue. Skips a match whose slots aren't filled yet / already resolved.
  private async simulateCupKnockout(
    kind: 'semifinal_1' | 'semifinal_2' | 'final',
    restIds: number[] | undefined,
    featured: Set<number>,
  ): Promise<void> {
    const ko = this.state.league.premCup?.knockout;
    if (!ko) return;
    const match = kind === 'semifinal_1' ? ko.semifinals[0] : kind === 'semifinal_2' ? ko.semifinals[1] : ko.final;
    if (match.result || !match.homeId || !match.awayId) return;
    const homeJson = this.teamsById.get(match.homeId);
    const awayJson = this.teamsById.get(match.awayId);
    if (!homeJson || !awayJson) return;
    const home = this.buildCupSide(homeJson, restIds);
    const away = this.buildCupSide(awayJson, restIds);
    const sim = await simulateFixture(home, away, this.state.seed, CUP_SEED_ROUND[kind], { neutralVenue: kind === 'final' });
    applySeasonEvent(this.state, {
      type: 'PREM_CUP_KNOCKOUT_RECORDED',
      kind,
      homeScore: sim.homeScore, awayScore: sim.awayScore,
      homeTries: sim.snapshot.homeSummary.tries, awayTries: sim.snapshot.awaySummary.tries,
    });
    for (const ev of collectConditionEvents(sim.snapshot)) applySeasonEvent(this.state, ev);
    for (const ev of this.rollNewInjuryEvents(sim.snapshot.playerSnapshots)) applySeasonEvent(this.state, ev);
    for (const s of sim.snapshot.playerSnapshots) featured.add(s.rosterId);
  }

  // rosterIds of the user's first-choice starting XV (slots 1-15 of the
  // persisted matchday squad), used by the "rest the starters" cup direction.
  private firstChoiceStarterIds(): number[] {
    const md = this.state.player.matchdaySquad;
    if (!md) return [];
    const club = this.state.career.clubs.find(c => c.id === this.state.player.teamId);
    if (!club) return [];
    const idByName = new Map<string, number>();
    for (const rid of club.squad) {
      const p = this.state.career.roster[rid];
      if (p) idByName.set(`${p.firstName}|${p.lastName}`, rid);
    }
    const out: number[] = [];
    for (const ref of md.slice(0, 15)) {
      const rid = idByName.get(`${ref.firstName}|${ref.lastName}`);
      if (rid !== undefined) out.push(rid);
    }
    return out;
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
    applySeasonEvent(this.state, { type: 'PLAYER_CUP_DIRECTION_SET', direction });
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
      for (const ev of this.tickInjuryEvents(gapStartIso)) {
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
    for (const ev of this.rollNewInjuryEvents(snapshot.playerSnapshots)) {
      applySeasonEvent(this.state, ev);
    }
    eventBus.emit('game:fixtureRecorded', { result, state: this.state });

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
      for (const ev of this.rollNewInjuryEvents(sim.snapshot.playerSnapshots)) {
        applySeasonEvent(this.state, ev);
      }
      eventBus.emit('game:fixtureRecorded', { result: aiResult, state: this.state });
    }

    // Reconcile PGA rest obligations for the round just played (calendar.week
    // still points at this round). A player whose obligation covered this
    // round and who didn't feature has satisfied it. Runs before
    // WEEK_ADVANCED so the round number is correct.
    for (const ev of reconcileRestObligations(this.state, this.humanMatchdaySquadIds())) {
      applySeasonEvent(this.state, ev);
    }

    applySeasonEvent(this.state, { type: 'WEEK_ADVANCED' });
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
    if (this.allRegularFixturesPlayed() && this.state.league.playoffs === null) {
      this.seedPlayoffBracket();
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
  // gapStartIso, when supplied, scopes the tick to injuries sustained at or
  // before the start of the rest gap (the previous match). Injuries sustained
  // *during* the gap — training injuries and international-duty injuries, both
  // dated at the upcoming round — are skipped so a long gap (e.g. the ~5-week
  // Autumn / ~8-week Six Nations break) doesn't retroactively heal an injury
  // that only just happened.
  private tickInjuryEvents(gapStartIso?: string): SeasonEvent[] {
    const out: SeasonEvent[] = [];
    const rosterIds = Object.keys(this.state.career.roster).map(Number).sort((a, b) => a - b);
    for (const rid of rosterIds) {
      const p = this.state.career.roster[rid];
      if (!p.injury) continue;
      if (gapStartIso && p.injury.injuredOn > gapStartIso) continue;
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

