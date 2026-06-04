// International-break + Prem Cup collaborator — owns the two-phase break flow
// (begin: RNG-free squad selection + flagging + cup lookup; run: cup sims +
// training periods + international returns), the headless cup-fixture / knockout
// sims, and the Assistant-Manager cup direction. Holds the same GameState
// reference GameCoordinator holds (mutations visible across both) plus the
// teamsById lookup for sims; all writes go through applySeasonEvent. Emits
// game:trainingApplied inline. GameCoordinator keeps thin public delegations so
// screens / main.ts / the determinism harness keep talking to it.

import type { CupFixture, GameState } from '../types/gameState';
import type { RawTeamInput } from '../types/teamData';
import type { InternationalWindow } from '../types/player';
import type { TrainingPlan, TrainingWeekResult, InternationalBreakSummary } from '../types/training';
import { applySeasonEvent } from './applySeasonEvent';
import { simulateFixture } from './simulateFixture';
import { buildCupTeamFromRoster } from './rosterTeamBuilder';
import { CUP_POOLS_2025_26, CUP_SEED_ROUND, buildCupSeed, buildCupKnockoutSeed } from './cupScheduler';
import { cupDevelopmentEvents } from './cupDevelopment';
import { collectConditionEvents } from './seasonStatsCollector';
import { rollNewInjuryEvents } from './injuryEffects';
import { runTrainingPeriods } from './trainingRunner';
import { upcomingGap, splitGapIntoPeriods } from './trainingCalendar';
import {
  isInternationalBreak, selectInternationalSquads, buildCallUpEvents,
  resolveInternationalBreak, getEnglandSummerTourRosterIds, type CallUp,
} from './internationalDutyEngine';
import { eventBus } from '../utils/eventBus';

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

// Returned by beginPreSeasonBlock() — simplified equivalent for the
// pre-season cup block (no international call-ups, no break window).
export interface PreSeasonBlockResult {
  cupFixturesThisBlock: CupFixture[];
  cupDirection: 'best' | 'rest_first_15';
}

export class InternationalBreakCoordinator {
  constructor(private state: GameState, private teamsById: Map<string, RawTeamInput>) {}

  // ── International break: begin / run split ───────────────────────────────
  //
  // The break is a two-phase flow so the UI can show the call-ups + Prem Cup
  // fixtures (and collect the Assistant-Manager direction) BEFORE the block
  // simulates. beginInternationalBreak does only RNG-free work (squad
  // selection + flagging + cup lookup); runInternationalBreakBlock does the
  // cup sims (MATCH stream), the training periods + international returns
  // (rngTransfer — identical sequence to applyTrainingBlock).

  // ── Pre-season cup block ────────────────────────────────────────────────
  //
  // Mirrors the international-break flow but runs before league R1 with no
  // international call-ups. Leg 0 pool fixtures only — no knockouts.

  // Pure detector: true if leg-0 fixtures exist and any are unresolved.
  isPreSeasonCupPending(): boolean {
    const cup = this.state.league.premCup;
    if (!cup) return false;
    return cup.fixtures.some(f => f.leg === 0 && !f.result);
  }

  // Fetches the leg-0 fixtures and persisted cup direction. RNG-free.
  beginPreSeasonBlock(): PreSeasonBlockResult {
    const cup = this.state.league.premCup;
    const cupFixturesThisBlock = (cup?.fixtures ?? []).filter(f => f.leg === 0);
    const cupDirection = this.state.player.cupDirection ?? 'best';
    return { cupFixturesThisBlock, cupDirection };
  }

  // Runs the pre-season cup block: leg-0 pool fixtures, cup development
  // nudge, then a fixed 13-day (≈2-week) training period before R1.
  async runPreSeasonBlock(weeks: TrainingPlan[]): Promise<TrainingWeekResult> {
    const restIds = this.state.player.cupDirection === 'rest_first_15'
      ? this.firstChoiceStarterIds()
      : undefined;
    // England summer-tour players were excluded from the two pre-season cup
    // rounds (leg 0) by agreement with the RFU — compute their IDs for all
    // clubs so the headless sims honour the exclusion.
    const englandExcluded = this.buildEnglandExclusionMap();
    const featured = new Set<number>();

    for (const fx of (this.state.league.premCup?.fixtures ?? []).filter(f => f.leg === 0)) {
      await this.simulateCupFixture(fx, restIds, featured, englandExcluded);
    }

    for (const ev of cupDevelopmentEvents(this.state, featured, this.state.calendar.date)) {
      applySeasonEvent(this.state, ev);
    }

    const n = Math.max(1, weeks.length);
    // Use the fixed pre-season gap (Sep 12 → Sep 25 ≈ 13 days) rather than
    // upcomingGap(), which falls back to 7 days at week 1 with no prior round.
    const PRE_SEASON_GAP_DAYS = 13;
    const spans = splitGapIntoPeriods(PRE_SEASON_GAP_DAYS, n);
    const acc = runTrainingPeriods(this.state, weeks, spans);

    eventBus.emit('game:trainingApplied', { state: this.state });
    return { plan: weeks[weeks.length - 1], players: [...acc.values()], weeks: n };
  }

  // ── International break: begin / run split ───────────────────────────────
  //
  // The break is a two-phase flow so the UI can show the call-ups + Prem Cup
  // fixtures (and collect the Assistant-Manager direction) BEFORE the block
  // simulates. beginInternationalBreak does only RNG-free work (squad
  // selection + flagging + cup lookup); runInternationalBreakBlock does the
  // cup sims (MATCH stream), the training periods + international returns
  // (rngTransfer — identical sequence to applyTrainingBlock).

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

  // Detects the break, flags the called-up players, and returns the call-ups
  // + this block's cup fixtures + the persisted cup direction. Returns null
  // off a break round. Idempotent: re-calling at the same break won't
  // double-bump internationalCaps. RNG-free.
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
    const acc = runTrainingPeriods(this.state, weeks, spans);

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
  private buildCupSide(
    teamJson: RawTeamInput,
    restIds: number[] | undefined,
    extraExcluded?: ReadonlySet<number>,
  ): RawTeamInput {
    const rest = teamJson.id === this.state.player.teamId ? restIds : undefined;
    return buildCupTeamFromRoster(this.state, teamJson, rest, extraExcluded);
  }

  // Simulate one cup pool fixture (silent) and record it + the condition
  // writeback. NOT collectSeasonEvents (cup stats stay out of league leaderboards).
  private async simulateCupFixture(
    fx: CupFixture,
    restIds: number[] | undefined,
    featured: Set<number>,
    extraExcluded?: ReadonlyMap<string, ReadonlySet<number>>,
  ): Promise<void> {
    const homeJson = this.teamsById.get(fx.homeId);
    const awayJson = this.teamsById.get(fx.awayId);
    if (!homeJson || !awayJson) return;
    const home = this.buildCupSide(homeJson, restIds, extraExcluded?.get(fx.homeId));
    const away = this.buildCupSide(awayJson, restIds, extraExcluded?.get(fx.awayId));
    const pseudoRound = fx.leg === 0 ? CUP_SEED_ROUND.preseason : fx.leg === 1 ? CUP_SEED_ROUND.leg1 : CUP_SEED_ROUND.leg2;
    const sim = await simulateFixture(home, away, this.state.seed, pseudoRound, {});
    applySeasonEvent(this.state, {
      type: 'PREM_CUP_FIXTURE_RECORDED',
      pool: fx.pool, leg: fx.leg, homeId: fx.homeId, awayId: fx.awayId,
      homeScore: sim.homeScore, awayScore: sim.awayScore,
      homeTries: sim.snapshot.homeSummary.tries, awayTries: sim.snapshot.awaySummary.tries,
    });
    for (const ev of collectConditionEvents(sim.snapshot)) applySeasonEvent(this.state, ev);
    for (const ev of rollNewInjuryEvents(this.state, sim.snapshot.playerSnapshots)) applySeasonEvent(this.state, ev);
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
    for (const ev of rollNewInjuryEvents(this.state, sim.snapshot.playerSnapshots)) applySeasonEvent(this.state, ev);
    for (const s of sim.snapshot.playerSnapshots) featured.add(s.rosterId);
  }

  // Builds a per-clubId map of England summer-tour rosterIds for every club
  // in the league. Used to exclude them from leg-0 (pre-season) cup selection.
  private buildEnglandExclusionMap(): Map<string, ReadonlySet<number>> {
    const out = new Map<string, ReadonlySet<number>>();
    for (const club of this.state.career.clubs) {
      const ids = getEnglandSummerTourRosterIds(this.state, club.id);
      if (ids.size > 0) out.set(club.id, ids);
    }
    return out;
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

  // Persists the Assistant-Manager Prem Cup direction (best XV vs rest the
  // first-choice 15). Becomes the remembered default for the next break.
  setCupDirection(direction: 'best' | 'rest_first_15'): void {
    applySeasonEvent(this.state, { type: 'PLAYER_CUP_DIRECTION_SET', direction });
  }
}
