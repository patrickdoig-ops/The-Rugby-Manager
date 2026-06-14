// International-break + Prem Cup collaborator — owns the two-phase break flow
// (begin: RNG-free squad selection + flagging + cup lookup; run: cup sims +
// training periods + international returns), the headless cup-fixture / knockout
// sims, and the Assistant-Manager cup direction. Holds the same GameState
// reference GameCoordinator holds (mutations visible across both) plus the
// teamsById lookup for sims; all writes go through applySeasonEvent. Emits
// game:trainingApplied inline. GameCoordinator keeps thin public delegations so
// screens / main.ts / the determinism harness keep talking to it.

import type { CupFixture, CupKnockoutMatch, CupRoundRef, Fixture, GameState } from '../types/gameState';
import type { RawTeamInput } from '../types/teamData';
import type { InternationalWindow } from '../types/player';
import type { InternationalBreakSummary } from '../types/training';
import { applySeasonEvent } from './applySeasonEvent';
import { simulateFixture } from './simulateFixture';
import { buildCupTeamFromRoster } from './rosterTeamBuilder';
import { CUP_POOLS_2025_26, CUP_FIXTURES_2025_26, CUP_SEED_ROUND, buildCupSeed, buildCupKnockoutSeed } from './cupScheduler';
import { cupDevelopmentEvents } from './cupDevelopment';
import { collectConditionEvents, type MatchSnapshot } from './seasonStatsCollector';
import { leagueRound } from './leagueRound';
import { rollNewInjuryEvents } from './injuryEffects';
import {
  isInternationalBreak, selectInternationalSquads, buildCallUpEvents,
  resolveInternationalBreak, callUpsFromDutyFlags, getSummerTourRosterIds, type CallUp,
} from './internationalDutyEngine';

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

// Identifies the player's next playable cup fixture — pool or knockout.
// Mirrors EuropeanFixtureRef; drives the live cup weekly flow.
export type CupFixtureRef =
  | { kind: 'pool'; fixture: CupFixture }
  | { kind: 'knockout'; stage: 'semifinal_1' | 'semifinal_2' | 'final'; match: CupKnockoutMatch };

export class InternationalBreakCoordinator {
  constructor(private state: GameState, private teamsById: Map<string, RawTeamInput>) {}

  // ── International break: call-up flagging ────────────────────────────────
  //
  // The cup is now a sequence of ordinary game-weeks (see the live cup flow
  // below). beginInternationalBreak does the RNG-free call-up flagging (+ the
  // call-ups context for the screen) at the start of a break.

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
        ...buildCupSeed(CUP_POOLS_2025_26, this.state.league.fixtures, this.state.calendar.seasonLabel, CUP_FIXTURES_2025_26),
      });
    }

    // Guard against a caps double-bump on re-entry (the user can leave and
    // re-open the break after a cup matchday's dev nudge shifts OVRs): key off
    // whether ANY player is already flagged for this window — the duty flags are
    // stable, a fresh squad re-selection can drift. On re-entry, derive the
    // returned call-ups from the flags too, so the UI shows exactly who was
    // called up rather than a drifted re-selection. RNG-free either way.
    const alreadyFlagged = this.anyOnInternationalDuty(window);
    const callUps = alreadyFlagged
      ? callUpsFromDutyFlags(this.state, window)
      : selectInternationalSquads(this.state, window);
    if (!alreadyFlagged) {
      for (const ev of buildCallUpEvents(callUps, window)) applySeasonEvent(this.state, ev);
    }

    const cupLeg: 1 | 2 = window === 'autumn' ? 1 : 2;
    const cupFixturesThisBlock = (this.state.league.premCup?.fixtures ?? []).filter(f => f.leg === cupLeg);
    const cupDirection = this.state.player.cupDirection ?? 'best';
    return { window, callUps, cupLeg, cupFixturesThisBlock, cupDirection };
  }

  // Build a Prem Cup matchday side from the roster. The user's club honours
  // the rest-the-first-15 direction; everyone else fields best-available
  // (international-duty + injured players excluded by buildCupTeamFromRoster).
  // Leg-0 (pre-season) additionally excludes that club's summer-tour
  // (England / Wales) players so they stay rested.
  private buildCupSide(
    teamJson: RawTeamInput,
    restIds: number[] | undefined,
    leg: 0 | 1 | 2,
  ): RawTeamInput {
    const rest = teamJson.id === this.state.player.teamId ? restIds : undefined;
    const extraExcluded = leg === 0 ? getSummerTourRosterIds(this.state, teamJson.id) : undefined;
    return buildCupTeamFromRoster(this.state, teamJson, rest, extraExcluded);
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

  // ── Live cup weekly flow (per-matchday) — mirrors the European flow ──────
  //
  // Each cup matchday is an ordinary game week: the player plays (or
  // assistant-sims) their own fixture, the rest of that matchday is simmed
  // headless. Cup stats stay OUT of the league leaderboards (no
  // collectSeasonEvents), matching the legacy headless block. The leg the
  // player is "in" is scoped by the league calendar (a leg is reachable once
  // its earliest fixture date is on or before the upcoming league round's
  // date), NOT by calendar.date stepping — so display-only date advances
  // can't hide a later matchday of the same leg.
  //
  // Wired into main.ts / the Hub by commit 4; dormant until then.

  // The earliest date of the upcoming league round — the horizon that scopes
  // which cup leg is currently reachable.
  upcomingLeagueDate(): string {
    const fixtures: Fixture[] = this.state.league.fixtures;
    const round = leagueRound(this.state);
    let earliest: string | null = null;
    for (const f of fixtures) {
      if (f.round !== round || !f.date) continue;
      if (earliest === null || f.date < earliest) earliest = f.date;
    }
    return earliest ?? this.state.calendar.date;
  }

  // The leg whose fixtures are currently in play, scoped by which break the
  // calendar is in rather than by fixture dates — robust against the synthetic
  // year-2+ schedule where cup/league dates can interleave oddly. Leg 0 is the
  // pre-season block (before any league round is played); legs 1 / 2 map to the
  // Autumn / Six Nations breaks. Null outside a block / when the leg is done.
  private activeCupLeg(): 0 | 1 | 2 | null {
    const cup = this.state.league.premCup;
    if (!cup) return null;
    const hasUnresolved = (leg: 0 | 1 | 2) => cup.fixtures.some(f => f.leg === leg && !f.result);
    if (this.state.league.results.length === 0 && hasUnresolved(0)) return 0;
    const window = isInternationalBreak(this.state);
    if (window === 'autumn' && hasUnresolved(1)) return 1;
    if (window === 'six_nations' && hasUnresolved(2)) return 2;
    return null;
  }

  // The player's next playable cup fixture — a pool fixture in the active
  // leg, or an unplayed knockout match. Null when the player has nothing due
  // (bye / leg done / not in the knockout).
  getCurrentCupFixture(): CupFixtureRef | null {
    const cup = this.state.league.premCup;
    if (!cup) return null;
    const playerId = this.state.player.teamId;
    const leg = this.activeCupLeg();
    if (leg !== null) {
      const pending = cup.fixtures
        .filter(f => f.leg === leg && !f.result && (f.homeId === playerId || f.awayId === playerId))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (pending[0]) return { kind: 'pool', fixture: pending[0] };
    }
    // Knockout — the player's unplayed SF / final. Decoupled from the active
    // leg: the leg-2 pool is complete (so activeCupLeg is null) by the time
    // the bracket is seeded, but the player may still be in it.
    const ko = cup.knockout;
    if (ko && ko.championTeamId === null) {
      for (const m of [ko.semifinals[0], ko.semifinals[1], ko.final]) {
        if (!m.result && m.homeId && m.awayId && (m.homeId === playerId || m.awayId === playerId)) {
          return { kind: 'knockout', stage: m.kind, match: m };
        }
      }
    }
    return null;
  }

  // The player's playable cup fixture dated on or before `blockEnd` — i.e.
  // their fixture in the CURRENT block only. Null on a bye (their next fixture
  // falls in a later block) or when nothing is due. Block-scoped sibling of
  // getCurrentCupFixture so each cup matchday is one Continue, byes included.
  getCupFixtureInBlock(blockEnd: string): CupFixtureRef | null {
    const ref = this.getCurrentCupFixture();
    if (!ref) return null;
    const date = ref.kind === 'pool' ? ref.fixture.date : (ref.match.date ?? '');
    return date && date <= blockEnd ? ref : null;
  }

  // The earliest cup round (leg / KO stage) whose fixtures are all resolved
  // and not yet shown to the player. Mirrors getCurrentEuropeanRound.
  getCurrentCupRound(): CupRoundRef | null {
    const cup = this.state.league.premCup;
    if (!cup) return null;
    const shown = new Set(cup.shownRounds ?? []);
    for (const leg of [0, 1, 2] as const) {
      const key = `leg:${leg}`;
      if (shown.has(key)) continue;
      const fxs = cup.fixtures.filter(f => f.leg === leg);
      if (fxs.length === 0 || fxs.some(f => !f.result)) continue;
      // Leg 2 also gates on the knockout being decided, since its recap
      // (CupResultsScreen) renders the full bracket — wait for the champion so
      // the recap is complete and never pre-empts the player's own KO matches.
      if (leg === 2 && (!cup.knockout || cup.knockout.championTeamId === null)) continue;
      const label = leg === 0 ? 'Pre-Season' : leg === 1 ? 'Pool Stage — Leg 1' : 'Pool Stage — Leg 2 + Knockouts';
      return { roundKey: key, isFinal: leg === 2, label };
    }
    return null;
  }

  markCupRoundShown(roundKey: string): void {
    applySeasonEvent(this.state, { type: 'PREM_CUP_ROUND_SHOWN', roundKey });
  }

  // Display-only calendar advance to a cup matchday's date. Safe to call with
  // an earlier or later date — leg scoping is independent of calendar.date.
  advanceCupCalendar(toDate: string): void {
    if (toDate && toDate !== this.state.calendar.date) {
      applySeasonEvent(this.state, { type: 'MATCHDAY_ADVANCED', toDate });
    }
  }

  // Record a live cup pool match the player just played. Applies condition +
  // injury (NOT season stats — cup stays out of league leaderboards), then
  // sims the rest of that matchday headless and seeds/sims the knockout when
  // the pool stage completes. The per-leg development nudge fires when the
  // leg's last fixture resolves.
  async recordPlayerCupPoolResult(
    pool: 'A' | 'B', leg: 0 | 1 | 2, homeId: string, awayId: string,
    homeScore: number, awayScore: number, snapshot: MatchSnapshot,
  ): Promise<void> {
    const cup = this.state.league.premCup;
    if (!cup) return;
    const fx = cup.fixtures.find(f => f.pool === pool && f.leg === leg && f.homeId === homeId && f.awayId === awayId);
    if (!fx || fx.result) return; // idempotent
    const playerId = this.state.player.teamId;
    const playerSide: 'home' | 'away' | null = homeId === playerId ? 'home' : awayId === playerId ? 'away' : null;
    applySeasonEvent(this.state, {
      type: 'PREM_CUP_FIXTURE_RECORDED',
      pool, leg, homeId, awayId, homeScore, awayScore,
      homeTries: snapshot.homeSummary.tries, awayTries: snapshot.awaySummary.tries, playerSide,
    });
    this.applyCupMatchAftermath(snapshot);
    await this.simRestOfCupLeg(leg, fx.date);
    if (leg === 2) this.maybeSeedCupKnockout();
    if (leg === 2) await this.simDueCupKnockouts();
    this.maybeFireCupLegDevelopment(leg);
  }

  // Record a live cup knockout match the player just played. Sims the rest of
  // the bracket (skipping the player) so the cascade completes.
  async recordPlayerCupKnockoutResult(
    kind: 'semifinal_1' | 'semifinal_2' | 'final',
    homeScore: number, awayScore: number, snapshot: MatchSnapshot,
  ): Promise<void> {
    const ko = this.state.league.premCup?.knockout;
    if (!ko) return;
    const match = kind === 'semifinal_1' ? ko.semifinals[0] : kind === 'semifinal_2' ? ko.semifinals[1] : ko.final;
    if (match.result || !match.homeId || !match.awayId) return; // idempotent
    const playerId = this.state.player.teamId;
    const playerSide: 'home' | 'away' | null = match.homeId === playerId ? 'home' : match.awayId === playerId ? 'away' : null;
    applySeasonEvent(this.state, {
      type: 'PREM_CUP_KNOCKOUT_RECORDED',
      kind, homeScore, awayScore,
      homeTries: snapshot.homeSummary.tries, awayTries: snapshot.awaySummary.tries, playerSide,
    });
    this.applyCupMatchAftermath(snapshot);
    await this.simDueCupKnockouts();
    this.maybeFireCupLegDevelopment(2); // fires once the champion is crowned
  }

  // Assistant-sims the player's own cup fixture (the skip-to-assistant path),
  // honouring the cup direction, then records it through the player-result
  // method so the rest of the matchday + knockouts resolve identically.
  async runPlayerCupFixtureHeadless(ref: CupFixtureRef): Promise<void> {
    const restIds = this.state.player.cupDirection === 'rest_first_15' ? this.firstChoiceStarterIds() : undefined;
    if (ref.kind === 'pool') {
      const fx = ref.fixture;
      const homeJson = this.teamsById.get(fx.homeId);
      const awayJson = this.teamsById.get(fx.awayId);
      if (!homeJson || !awayJson) return;
      const home = this.buildCupSide(homeJson, restIds, fx.leg);
      const away = this.buildCupSide(awayJson, restIds, fx.leg);
      const pseudoRound = fx.leg === 0 ? CUP_SEED_ROUND.preseason : fx.leg === 1 ? CUP_SEED_ROUND.leg1 : CUP_SEED_ROUND.leg2;
      const sim = await simulateFixture(home, away, this.state.seed, pseudoRound, {});
      await this.recordPlayerCupPoolResult(fx.pool, fx.leg, fx.homeId, fx.awayId, sim.homeScore, sim.awayScore, sim.snapshot);
    } else {
      const m = ref.match;
      if (!m.homeId || !m.awayId) return;
      const homeJson = this.teamsById.get(m.homeId);
      const awayJson = this.teamsById.get(m.awayId);
      if (!homeJson || !awayJson) return;
      const home = this.buildCupSide(homeJson, restIds, 2);
      const away = this.buildCupSide(awayJson, restIds, 2);
      const sim = await simulateFixture(home, away, this.state.seed, CUP_SEED_ROUND[m.kind], { neutralVenue: m.kind === 'final' });
      await this.recordPlayerCupKnockoutResult(m.kind, sim.homeScore, sim.awayScore, sim.snapshot);
    }
  }

  // Sims all non-player cup fixtures whose matchday has been reached but the
  // player has no fixture for (byes), so pool tables stay consistent and legs
  // can complete. Seeds + sims the knockout when leg-2 pool finishes.
  async simDueCupFixtures(): Promise<void> {
    const leg = this.activeCupLeg();
    if (leg === null) { await this.simDueCupKnockouts(); return; }
    // Complete the whole leg (unbounded date) — this is the catch-up pass that
    // resolves byes / non-player fixtures so the leg can close.
    await this.simRestOfCupLeg(leg, '9999-12-31');
    if (leg === 2) this.maybeSeedCupKnockout();
    if (leg === 2) await this.simDueCupKnockouts();
    this.maybeFireCupLegDevelopment(leg);
  }

  // Block-scoped simDueCupFixtures: sim every non-player cup fixture in the
  // active leg dated on or before `blockEnd` (the byes / other games of this
  // matchday), then seed + sim the knockout if the leg-2 pool just completed.
  // Lets each cup matchday resolve as its own Continue without jumping the
  // whole leg ahead.
  async simCupBlock(blockEnd: string): Promise<void> {
    const leg = this.activeCupLeg();
    if (leg === null) { await this.simDueCupKnockouts(); return; }
    await this.simRestOfCupLeg(leg, blockEnd);
    if (leg === 2) this.maybeSeedCupKnockout();
    if (leg === 2) await this.simDueCupKnockouts();
    this.maybeFireCupLegDevelopment(leg);
  }

  // Sim every unplayed non-player fixture in `leg` dated on or before
  // `uptoDate`, in fixture-list order (stable).
  private async simRestOfCupLeg(leg: 0 | 1 | 2, uptoDate: string): Promise<void> {
    const cup = this.state.league.premCup;
    if (!cup) return;
    const playerId = this.state.player.teamId;
    const restIds = this.state.player.cupDirection === 'rest_first_15' ? this.firstChoiceStarterIds() : undefined;
    const pseudoRound = leg === 0 ? CUP_SEED_ROUND.preseason : leg === 1 ? CUP_SEED_ROUND.leg1 : CUP_SEED_ROUND.leg2;
    for (const fx of cup.fixtures) {
      if (fx.leg !== leg || fx.result || fx.date > uptoDate) continue;
      if (fx.homeId === playerId || fx.awayId === playerId) continue; // player's own — recorded live
      const homeJson = this.teamsById.get(fx.homeId);
      const awayJson = this.teamsById.get(fx.awayId);
      if (!homeJson || !awayJson) continue;
      const home = this.buildCupSide(homeJson, restIds, leg);
      const away = this.buildCupSide(awayJson, restIds, leg);
      const sim = await simulateFixture(home, away, this.state.seed, pseudoRound, {});
      applySeasonEvent(this.state, {
        type: 'PREM_CUP_FIXTURE_RECORDED',
        pool: fx.pool, leg: fx.leg, homeId: fx.homeId, awayId: fx.awayId,
        homeScore: sim.homeScore, awayScore: sim.awayScore,
        homeTries: sim.snapshot.homeSummary.tries, awayTries: sim.snapshot.awaySummary.tries, playerSide: null,
      });
      this.applyCupMatchAftermath(sim.snapshot);
    }
  }

  // Seed the knockout once the leg-2 pool stage is complete (idempotent).
  private maybeSeedCupKnockout(): void {
    const cup = this.state.league.premCup;
    if (!cup || cup.knockout) return;
    const leg2 = cup.fixtures.filter(f => f.leg === 2);
    if (leg2.length === 0 || leg2.some(f => !f.result)) return;
    const seed = buildCupKnockoutSeed(cup, this.state.league.fixtures);
    applySeasonEvent(this.state, { type: 'PREM_CUP_KNOCKOUT_SEEDED', semifinals: seed.semifinals, final: seed.final });
  }

  // Sim every slotted knockout match the player is NOT in (player KO matches
  // are played live / assistant-simmed via the matchday flow). Runs SFs then
  // the final so the cascade fills before the final is simmed.
  private async simDueCupKnockouts(): Promise<void> {
    const playerId = this.state.player.teamId;
    const restIds = this.state.player.cupDirection === 'rest_first_15' ? this.firstChoiceStarterIds() : undefined;
    for (const kind of ['semifinal_1', 'semifinal_2', 'final'] as const) {
      const ko = this.state.league.premCup?.knockout;
      if (!ko) return;
      const m = kind === 'semifinal_1' ? ko.semifinals[0] : kind === 'semifinal_2' ? ko.semifinals[1] : ko.final;
      if (m.result || !m.homeId || !m.awayId) continue;
      if (m.homeId === playerId || m.awayId === playerId) continue; // player's own — live
      const homeJson = this.teamsById.get(m.homeId);
      const awayJson = this.teamsById.get(m.awayId);
      if (!homeJson || !awayJson) continue;
      const home = this.buildCupSide(homeJson, restIds, 2);
      const away = this.buildCupSide(awayJson, restIds, 2);
      const sim = await simulateFixture(home, away, this.state.seed, CUP_SEED_ROUND[kind], { neutralVenue: kind === 'final' });
      applySeasonEvent(this.state, {
        type: 'PREM_CUP_KNOCKOUT_RECORDED',
        kind, homeScore: sim.homeScore, awayScore: sim.awayScore,
        homeTries: sim.snapshot.homeSummary.tries, awayTries: sim.snapshot.awaySummary.tries, playerSide: null,
      });
      this.applyCupMatchAftermath(sim.snapshot);
    }
  }

  // Condition writeback + injury rolls + per-leg featured tracking for one
  // cup match. NOT collectSeasonEvents (cup stays out of league leaderboards).
  private applyCupMatchAftermath(snapshot: MatchSnapshot): void {
    for (const ev of collectConditionEvents(snapshot)) applySeasonEvent(this.state, ev);
    for (const ev of rollNewInjuryEvents(this.state, snapshot.playerSnapshots)) applySeasonEvent(this.state, ev);
    const rosterIds = snapshot.playerSnapshots.map(s => s.rosterId);
    if (rosterIds.length > 0) applySeasonEvent(this.state, { type: 'PREM_CUP_FEATURED_ADDED', rosterIds });
  }

  // Fire the once-per-leg development nudge when the leg is fully done, then
  // clear the featured accumulator. RNG-free. Leg 2 bundles the knockout, so
  // it waits for the champion to be crowned (otherwise the player's SF / final
  // participants — added to legFeatured after the pool closes — would miss the
  // nudge and orphan the accumulator). Idempotent: legFeatured is emptied on
  // fire, so a later call no-ops.
  private maybeFireCupLegDevelopment(leg: 0 | 1 | 2): void {
    const cup = this.state.league.premCup;
    if (!cup) return;
    if (leg === 2) {
      if (!cup.knockout || cup.knockout.championTeamId === null) return; // KO not done
    } else {
      const fxs = cup.fixtures.filter(f => f.leg === leg);
      if (fxs.length === 0 || fxs.some(f => !f.result)) return; // pool not complete
    }
    const featured = cup.legFeatured ?? [];
    if (featured.length === 0) return;
    for (const ev of cupDevelopmentEvents(this.state, featured, this.state.calendar.date)) {
      applySeasonEvent(this.state, ev);
    }
    applySeasonEvent(this.state, { type: 'PREM_CUP_FEATURED_ADDED', rosterIds: [], reset: true });
  }

  // ── Break lifecycle (per-matchday weekly flow) ───────────────────────────
  //
  // The international break is no longer a single headless block. It is a
  // sequence of ordinary cup game-weeks driven by the Hub / determinism
  // harness through getCupBreakStep(). Call-ups are flagged once at the start
  // (beginInternationalBreak, reused) and returns are processed once at the
  // end (resolveInternationalWindow), bracketing the intervening cup weeks so
  // the manager's internationals are away throughout (the rotation challenge).

  // What the cup break needs next, in priority order. Null when the break has
  // nothing left to do (→ the Hub falls through to the next league round).
  getCupBreakStep(): 'play_fixture' | 'advance_round' | 'resolve_returns' | null {
    const cup = this.state.league.premCup;
    if (cup) {
      if (this.getCurrentCupFixture()) return 'play_fixture';
      const leg = this.activeCupLeg();
      if (leg !== null && cup.fixtures.some(f => f.leg === leg && !f.result)) return 'advance_round';
      if (cup.knockout && cup.knockout.championTeamId === null) return 'advance_round';
      if (this.getCurrentCupRound()) return 'advance_round';
    }
    const window = isInternationalBreak(this.state);
    if (window && this.anyOnInternationalDuty(window)) return 'resolve_returns';
    return null;
  }

  // Resolve the international window at the end of the break's cup weeks:
  // re-derive the call-ups (RNG-free selection → reload-safe), then process
  // returns (rngTransfer). Calendar advance is now handled by the caller
  // (GameCoordinator) via tickElapsedWeeks so elapsed-week passes fire.
  resolveInternationalWindow(window: InternationalWindow): InternationalBreakSummary | undefined {
    // Derive returns from the actually-flagged players (not a fresh selection,
    // which could drift mid-break) so every called-up player is returned.
    const callUps = callUpsFromDutyFlags(this.state, window);
    if (callUps.length === 0) return undefined;
    const resolved = resolveInternationalBreak(this.state, callUps, window);
    for (const ev of resolved.events) applySeasonEvent(this.state, ev);
    return resolved.summary;
  }

  private anyOnInternationalDuty(window: InternationalWindow): boolean {
    for (const rid in this.state.career.roster) {
      if (this.state.career.roster[rid].internationalDuty?.window === window) return true;
    }
    return false;
  }

  // The break window the calendar is currently in (or null) — used to resolve
  // returns and to know which leg the cup CTA is playing.
  getBreakWindow(): InternationalWindow | null {
    return isInternationalBreak(this.state);
  }

  // True only at the very first matchday of a cup block (the active leg has no
  // resolved fixtures yet) — the cue to show the live/assistant decision once.
  isCupBlockStart(): boolean {
    const cup = this.state.league.premCup;
    const leg = this.activeCupLeg();
    if (!cup || leg === null) return false;
    return !cup.fixtures.some(f => f.leg === leg && f.result);
  }
}
