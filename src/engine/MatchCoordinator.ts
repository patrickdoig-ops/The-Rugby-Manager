// Match engine orchestrator. Owns the single MatchState for one fixture
// and is the only call site for applyMatchEvent's per-tick mutations.
//
// UI ↔ engine contract: the UI never calls into the match engine directly
// except through `SimController` (Play / Pause / Speed). Every other
// communication goes via the typed pub/sub at `src/utils/eventBus.ts`.
//
// Public surface (the only methods SimController and main.ts may call):
//   new MatchCoordinator(homeTeam, awayTeam, opts)  // build for one match
//   coord.initialize()                              // emits engine:initialized + first tick
//   coord.start() / coord.pause() / coord.resume()  // SimController play/pause
//   coord.setTickDelay(ms)                          // SimController speed slider
//   coord.getState()                                // readonly snapshot
//   coord.getHumanSide()                            // for UI ordering
//   coord.destroy()                                 // cancel timer + unsub bus
//
// Anything else (substitute, runForcedSubstitution, tactics changes from
// the modal, kick-off strategy picks) is wired in via eventBus, not via
// direct calls.

import type { MatchState, GameEvent } from '../types/match';
import type { Team, TeamTactics } from '../types/team';
import { DEFAULT_TACTICS } from '../types/team';
import type { Player, PlayerStats, Position } from '../types/player';
import { isForward, zeroMatchStats, zeroSeasonStats } from '../types/player';
import type { RawPlayer, RawTeamInput } from '../types/teamData';
import { MatchPhase, type PossessionSide, type KickOffStrategy } from '../types/engine';
import { eventBus } from '../utils/eventBus';
import { colorsClash } from '../utils/teamColor';
import { rngForm, setMatchSeed, rng, generateSeed } from '../utils/rng';
import { PenaltyHandler } from './PenaltyHandler';
import { CardHandler, buildAnnounce } from './CardHandler';
import { ClockController } from './ClockController';
import { FatigueAccumulator } from './FatigueAccumulator';
import { detectEntry22Changes } from './Entry22Tracker';
import { resolvePhase, draftEvent } from './PhaseRouter';
import { makeId, resetEventCounter } from './eventId';
import { applyMatchEvent } from './applyMatchEvent';
import { AITacticalDirector } from './AITacticalDirector';
import { AISubstitutionDirector } from './AISubstitutionDirector';
import { COMMENTARY_BUFFER_CAP } from './balance';

function deepCloneStats(s: PlayerStats): PlayerStats {
  return { ...s };
}

// Like-for-like fallback chain for forced-sub auto-pick. The off player's
// position is tried first, then the listed alternates in order — a Wing
// down looks for another Wing, then a Fullback, then Utility Back, then a
// Centre, only falling back to the broad forward/back split if none of
// those are on the bench. Keeps the new on-field player in something close
// to the right role rather than dropping a Scrum-Half on the wing.
const POSITION_FALLBACK: Record<Position, Position[]> = {
  'Prop':         ['Prop', 'Hooker'],
  'Hooker':       ['Hooker', 'Prop'],
  'Lock':         ['Lock', 'Number 8', 'Flanker', 'Back Row'],
  'Flanker':      ['Flanker', 'Number 8', 'Back Row', 'Lock'],
  'Number 8':     ['Number 8', 'Flanker', 'Back Row', 'Lock'],
  'Back Row':     ['Back Row', 'Flanker', 'Number 8', 'Lock'],
  'Scrum-Half':   ['Scrum-Half', 'Fly-Half', 'Utility Back'],
  'Fly-Half':     ['Fly-Half', 'Utility Back', 'Centre', 'Scrum-Half'],
  'Centre':       ['Centre', 'Utility Back', 'Fly-Half', 'Fullback', 'Wing'],
  'Wing':         ['Wing', 'Fullback', 'Utility Back', 'Centre'],
  'Fullback':     ['Fullback', 'Wing', 'Utility Back', 'Centre'],
  'Utility Back': ['Utility Back', 'Centre', 'Fullback', 'Fly-Half', 'Wing'],
};

// Like-for-like auto-pick for a forced sub. Returns the bench player's
// squadNumber, or null if bench is empty. Stable scan (no rng) so AI +
// silent paths stay deterministic.
function pickAutoReplacement(bench: Player[], off: Player): number | null {
  if (bench.length === 0) return null;
  // Walk the position-similarity chain — exact match first, then the
  // closest alternates.
  for (const pos of POSITION_FALLBACK[off.position]) {
    const match = bench.find(p => p.position === pos);
    if (match) return match.squadNumber;
  }
  // Position-group match — last resort before "any bench". Keeps a forward
  // covering a forward, a back covering a back.
  const offIsForward = isForward(off.position);
  const groupMatch = bench.find(p => isForward(p.position) === offIsForward);
  if (groupMatch) return groupMatch.squadNumber;
  // Worst case: first bench player.
  return bench[0].squadNumber;
}

// `rosterId` defaults to 0 when initPlayer is called via the legacy JSON
// path (MatchCoordinator constructed with RawTeamInput). When called via
// rosterTeamBuilder the caller threads in the real rosterId so
// career-scope code can correlate match performance.
function initPlayer(raw: RawPlayer & { rosterId?: number }): Player {
  const form = rngForm();
  const current = deepCloneStats(raw.baseStats);
  for (const key of Object.keys(current) as (keyof PlayerStats)[]) {
    current[key] = Math.max(1, Math.min(100, current[key] + form));
  }
  return {
    ...raw,
    squadNumber: raw.squadNumber ?? raw.id,
    rosterId: raw.rosterId ?? 0,
    reputation: raw.reputation ?? 0,
    contract: {
      clubId:     raw.contract?.clubId     ?? '',
      expiresOn:  raw.contract?.expiresOn  ?? '',
      annualWage: raw.contract?.annualWage ?? 0,
      isMarquee:  raw.contract?.isMarquee  ?? false,
    },
    baseStats: deepCloneStats(raw.baseStats),
    currentStats: current,
    matchStats: zeroMatchStats(),
    seasonStats: zeroSeasonStats(),
    formModifier: form,
    fatiguePct: 100,
    rating: 6.0,
    x: 50,
    y: 50,
  };
}

// `kitColor` overrides `raw.color` when the home team is forced into its
// change strip (see initMatchState). Within MatchState the `color` field
// means "the kit colour for this match" — out-of-match UI (FixtureList,
// LeagueTable, Hub, RoundResults, TeamInfo) reads from RawTeamInput so
// keeps showing the brand colour.
function buildTeam(raw: RawTeamInput, tactics?: TeamTactics, kitColor?: string): Team {
  return {
    ...raw,
    color: kitColor ?? raw.color,
    players: raw.players.map(initPlayer),
    bench: (raw.bench ?? []).map(initPlayer),
    substitutedOff: [],
    tactics: tactics ? { ...tactics } : { ...DEFAULT_TACTICS },
  };
}

function initMatchState(homeRaw: RawTeamInput, awayRaw: RawTeamInput, tickDelayMs: number, seed: number, playerTactics?: TeamTactics, humanSide: 'home' | 'away' = 'home'): MatchState {
  return {
    clock: {
      gameMinute: 0,
      halfTimeDone: false,
      clockInTheRed: false,
      penaltyKickToTouchLineout: false,
    },
    ball: { x: 50, y: 50 },
    engine: {
      isRunning: false,
      tickDelayMs,
      seed,
      firstHalfKicker: 'home',
      humanSide,
      commentaryBufferCap: COMMENTARY_BUFFER_CAP,
    },
    phase: MatchPhase.KickOff,
    score: { home: 0, away: 0 },
    possession: 'home',
    // Human side runs the tactics chosen pre-match (when supplied); AI side
    // takes the team's authored suggestedTactics from RawTeamInput so each
    // club plays to its own identity rather than DEFAULT_TACTICS. Either
    // input may be absent, in which case buildTeam falls through to
    // DEFAULT_TACTICS.
    //
    // Kit clash: if the two teams' primary colours would be hard to tell
    // apart on small chips, the home side flips to its change strip
    // (secondaryColor). Away never changes — same rule as on-field practice.
    homeTeam: buildTeam(
      homeRaw,
      humanSide === 'home' && playerTactics ? playerTactics : homeRaw.suggestedTactics,
      colorsClash(homeRaw.color, awayRaw.color) ? homeRaw.secondaryColor : undefined,
    ),
    awayTeam: buildTeam(awayRaw, humanSide === 'away' && playerTactics ? playerTactics : awayRaw.suggestedTactics),
    stats: {
      possession: { home: 0, away: 0 },
      territory:  { home: 0, away: 0 },
      tackles:    { home: { attempted: 0, made: 0 }, away: { attempted: 0, made: 0 } },
      handlingErrors: { home: 0, away: 0 },
      scrums:   { home: 0, away: 0 },
      lineouts: { home: 0, away: 0 },
      tries:    { home: 0, away: 0 },
      ownLineouts: { home: { thrown: 0, won: 0 }, away: { thrown: 0, won: 0 } },
      ownScrums:   { home: { putIn: 0, won: 0 }, away: { putIn: 0, won: 0 } },
      entries22: {
        home: { count: 0, pointsScored: 0, active: false },
        away: { count: 0, pointsScored: 0, active: false },
      },
    },
    events: [],
    breakdownMod: { attack: 0, defend: 0 },
    lastBallQuality: 'clean',
    cards: {
      sinBin:        { home: [], away: [] },
      sentOff:       { home: [], away: [] },
      teamPenalty22: { home: 0,  away: 0  },
      teamWarned22:  { home: false, away: false },
      injured:       { home: [], away: [] },
    },
  };
}

export class MatchCoordinator {
  private state: MatchState;
  private tickTimeout: ReturnType<typeof setTimeout> | null = null;
  private kickOffStrategy: KickOffStrategy = 'high_ball';
  private humanSide: 'home' | 'away';
  private penaltyHandler: PenaltyHandler;
  private cardHandler: CardHandler;
  private clock: ClockController;
  private fatigue: FatigueAccumulator;
  private director: AITacticalDirector;
  private subDirector: AISubstitutionDirector;
  private busUnsubs: Array<() => void> = [];
  // When a red_20 forced-substitution modal is open and waiting on the
  // manager, the Promise's resolve sits here so destroy() can short-circuit
  // it (resolve(null) → "no replacement chosen, play short") rather than
  // leaving the Promise pending after teardown.
  private pendingForcedSubResolve: ((n: number | null) => void) | null = null;
  // Silent matches suppress every engine event except `engine:finished`
  // (which the headless caller awaits) so the live UI stays inert while a
  // background AI fixture runs. PenaltyHandler short-circuits modal prompts
  // to the same defaults the determinism harness uses.
  private silent: boolean;

  constructor(
    homeRaw: RawTeamInput,
    awayRaw: RawTeamInput,
    opts: { tickDelayMs?: number; homeTactics?: TeamTactics; playerTactics?: TeamTactics; humanSide?: 'home' | 'away'; seed?: number; silent?: boolean; commentaryBufferCap?: number } = {},
  ) {
    const seed = (opts.seed ?? generateSeed()) >>> 0;
    setMatchSeed(seed);
    resetEventCounter();
    this.humanSide = opts.humanSide ?? 'home';
    this.silent = opts.silent ?? false;
    const tactics = opts.playerTactics ?? opts.homeTactics;
    this.state = initMatchState(homeRaw, awayRaw, opts.tickDelayMs ?? 500, seed, tactics, this.humanSide);
    if (opts.commentaryBufferCap !== undefined) {
      this.state.engine.commentaryBufferCap = opts.commentaryBufferCap;
    }
    this.clock = new ClockController(this.silent);
    this.fatigue = new FatigueAccumulator(this.state, this.silent);

    this.penaltyHandler = new PenaltyHandler({
      state: this.state,
      humanSide: this.humanSide,
      silent: this.silent,
    });

    this.cardHandler = new CardHandler({
      state: this.state,
      humanSide: this.humanSide,
      silent: this.silent,
    });

    // Director adapts AI tactics each tick based on score gap + clock. In
    // silent (fully headless) mode, no humanSide is meaningful — pass
    // undefined so both teams adapt. In a live match, the human owns their
    // side via the modal, so director leaves it alone.
    this.director = new AITacticalDirector(this.state, this.silent ? undefined : this.humanSide);
    // Sub director mirrors the same humanSide gate: only AI-controlled teams
    // get auto-subs. Routes its swaps through this.substitute so the
    // commentary emit + mutation boundary are identical to a manager sub.
    this.subDirector = new AISubstitutionDirector(
      this.state,
      this.silent ? undefined : this.humanSide,
      (side, benchSquadNum, fieldSquadNum) => this.substitute(side, benchSquadNum, fieldSquadNum),
    );

    if (!this.silent) {
      this.busUnsubs.push(
        eventBus.on('ui:tacticsChange', ({ teamId, tactics }) => {
          if (teamId === 'home' || teamId === 'away') {
            applyMatchEvent(this.state, { type: 'TACTICS_UPDATED', side: teamId, tactics });
          }
        }),
        eventBus.on('ui:substitution', ({ benchSquadNum, fieldSquadNum }) => {
          this.substitute(this.humanSide, benchSquadNum, fieldSquadNum);
        }),
      );
    }
  }

  private emitEvent(event: GameEvent): void {
    if (this.silent) return;
    eventBus.emit('engine:event', { event });
  }

  private emitStateChange(): void {
    if (this.silent) return;
    eventBus.emit('engine:stateChange', { state: this.state });
  }

  // Releases all per-match resources: cancels the pending tick timer, stops the
  // run flag, and unsubscribes the constructor-registered UI-event handlers.
  // After destroy() returns, the coordinator is inert and may be garbage-collected
  // as soon as the caller drops its reference. Safe to call multiple times.
  destroy(): void {
    if (this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.tickTimeout = null;
    }
    if (this.state.engine.isRunning) {
      applyMatchEvent(this.state, { type: 'IS_RUNNING_SET', value: false });
    }
    if (this.pendingForcedSubResolve) {
      this.pendingForcedSubResolve(null);
      this.pendingForcedSubResolve = null;
    }
    for (const unsub of this.busUnsubs) unsub();
    this.busUnsubs = [];
  }

  getHumanSide(): 'home' | 'away' {
    return this.humanSide;
  }

  // Shared forced-substitution flow. Triggered both by red_20 (a player's
  // 20-minute red expired) and by an in-match injury. Human side gets the
  // modal; AI side and silent matches auto-pick by position group. Empty
  // bench → emit the matching "no replacement" announcement and play short.
  //
  // `reason` selects the commentary keys: 'red_20' for sin-bin expiry,
  // 'injury' for an in-match injury. The forced-sub plumbing is otherwise
  // identical — `off` is already excluded from `onFieldPlayers` (sentOff or
  // injured), and SUBSTITUTION_APPLIED strips both arrays on the way in.
  private async runForcedSubstitution(off: Player, side: 'home' | 'away', reason: 'red_20' | 'injury'): Promise<void> {
    const team = side === 'home' ? this.state.homeTeam : this.state.awayTeam;
    const noReplKey = reason === 'red_20' ? 'red_20_no_replacement' : 'injury_no_replacement';
    const replDoneKey = reason === 'red_20' ? 'red_20_replacement_done' : 'injury_replacement_done';
    if (team.bench.length === 0) {
      const ev = buildAnnounce({
        key: noReplKey,
        state: this.state,
        side,
        secondary: off,
        teamName: team.name,
      });
      applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: ev });
      this.emitEvent(ev);
      return;
    }

    let benchSquadNum: number | null = null;
    if (this.silent || side !== this.humanSide) {
      benchSquadNum = pickAutoReplacement(team.bench, off);
    } else {
      const wasRunning = this.state.engine.isRunning;
      benchSquadNum = await new Promise<number | null>(resolve => {
        this.pendingForcedSubResolve = resolve;
        eventBus.emit('engine:paused', {
          payload: {
            type: 'forced_substitution_choice',
            side,
            sentOff: off,
            bench: [...team.bench],
            reason,
            onChoice: (n) => resolve(n),
          },
        });
      });
      this.pendingForcedSubResolve = null;
      if (wasRunning) eventBus.emit('engine:resumed', {});
    }

    if (benchSquadNum === null) return;
    const benchPlayer = team.bench.find(p => p.squadNumber === benchSquadNum);
    if (!benchPlayer) return;

    // Field slot vacated by the off player: team.players still contains them
    // (CARD_ISSUED / PLAYER_INJURED_IN_MATCH didn't remove from the array).
    // Locate by id.
    const fieldIdx = team.players.findIndex(p => p.id === off.id);
    if (fieldIdx === -1) return;
    const benchIdx = team.bench.findIndex(p => p.squadNumber === benchSquadNum);

    applyMatchEvent(this.state, {
      type: 'SUBSTITUTION_APPLIED',
      off, on: benchPlayer, teamSide: side, benchIdx, fieldIdx,
    });

    const ev = buildAnnounce({
      key: replDoneKey,
      state: this.state,
      side,
      primary: benchPlayer,
      secondary: off,
      teamName: team.name,
    });
    applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: ev });
    this.emitEvent(ev);
    this.emitStateChange();
  }

  // Walks state.cards.injured on both sides and returns the entries whose
  // slot is still occupied by the injured player (i.e. no replacement has
  // run yet this match). Stable scan in side ('home' then 'away') and bucket
  // order so the RNG order of runForcedSubstitution stays deterministic.
  private collectPendingInjurySubs(): Array<{ player: Player; side: 'home' | 'away' }> {
    const out: Array<{ player: Player; side: 'home' | 'away' }> = [];
    for (const side of ['home', 'away'] as const) {
      const team = side === 'home' ? this.state.homeTeam : this.state.awayTeam;
      for (const inj of this.state.cards.injured[side]) {
        if (team.players.some(p => p.id === inj.id && p === inj)) {
          out.push({ player: inj, side });
        }
      }
    }
    return out;
  }

  substitute(side: 'home' | 'away', benchSquadNum: number, fieldSquadNum: number): void {
    const team = side === 'home' ? this.state.homeTeam : this.state.awayTeam;
    const benchIdx = team.bench.findIndex(p => p.squadNumber === benchSquadNum);
    const fieldIdx = team.players.findIndex(p => p.squadNumber === fieldSquadNum);
    if (benchIdx === -1 || fieldIdx === -1) return;

    const sub = team.bench[benchIdx];
    const off = team.players[fieldIdx];

    applyMatchEvent(this.state, {
      type: 'SUBSTITUTION_APPLIED',
      off, on: sub, teamSide: side, benchIdx, fieldIdx,
    });

    const subEvent: GameEvent = {
      id: makeId(),
      gameMinute: this.state.clock.gameMinute,
      phase: MatchPhase.Substitution,
      side,
      sideName: team.name,
      primaryPlayer: sub,
      secondaryPlayer: off,
      ballX: this.state.ball.x,
      ballY: this.state.ball.y,
      narration: {
        steps: [{
          kind: 'announcement',
          key: 'substitution',
          primary: sub,
          secondary: off,
          params: { teamName: team.name },
        }],
      },
    };
    applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: subEvent });
    this.emitEvent(subEvent);
    this.emitStateChange();
  }


  initialize(): void {
    if (!this.silent) eventBus.emit('engine:initialized', {});
    // Coin toss — 50/50; winner kicks off in the first half, the other side
    // kicks off the second half (set via FIRST_HALF_KICKER_SET, read by
    // ClockController.triggerHalfTime).
    const tossWinner: 'home' | 'away' = rng(0, 1) === 0 ? 'home' : 'away';
    applyMatchEvent(this.state, { type: 'POSSESSION_SET', side: tossWinner });
    applyMatchEvent(this.state, { type: 'FIRST_HALF_KICKER_SET', side: tossWinner });
    const draft = draftEvent(this.state, MatchPhase.KickOff);
    const tossEvent: GameEvent = {
      ...draft,
      id: makeId(),
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.KickOff, key: 'coin_toss' }] },
    };
    applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: tossEvent });
    this.emitEvent(tossEvent);
    this.emitStateChange();
  }

  start(): void {
    if (this.state.engine.isRunning) return;
    applyMatchEvent(this.state, { type: 'IS_RUNNING_SET', value: true });
    this.scheduleTick(0);
  }

  pause(): void {
    applyMatchEvent(this.state, { type: 'IS_RUNNING_SET', value: false });
    if (this.tickTimeout) { clearTimeout(this.tickTimeout); this.tickTimeout = null; }
  }

  resume(): void {
    if (this.state.engine.isRunning) return;
    applyMatchEvent(this.state, { type: 'IS_RUNNING_SET', value: true });
    this.scheduleTick(0);
  }

  setTickDelay(ms: number): void {
    applyMatchEvent(this.state, { type: 'TICK_DELAY_SET', value: ms });
    if (this.state.engine.isRunning && this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.scheduleTick(ms);
    }
  }

  getState(): Readonly<MatchState> {
    return this.state;
  }

  private scheduleTick(delay: number): void {
    if (this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.tickTimeout = null;
    }
    this.tickTimeout = setTimeout(() => this.tick(), delay);
  }

  private async tick(): Promise<void> {
    this.tickTimeout = null;
    if (!this.state.engine.isRunning) return;

    const wasInRed = this.state.clock.clockInTheRed;
    const timeAdvance = this.clock.advanceMinute(this.state);

    this.fatigue.tick(timeAdvance);

    // TMO review: clock is frozen (advanceMinute returned 0) and play is
    // suspended. Steps 1 + 2 narrate and bail. Step 3 applies CARD_ISSUED,
    // resolves the review, and transitions phase back to Penalty — we then
    // run the penalty modal in the SAME tick so the next tick starts in a
    // phase resolvePhase() can handle. Without this fall-through the next
    // tick enters resolvePhase with phase=Penalty and the game stalls on
    // the TMO outcome. evaluateNewPenalty is deliberately NOT re-called
    // here: the team-22 counter was bumped on the original Penalty tick
    // before TMO began, and re-running would either double-bump or
    // re-trigger TMO.
    if (this.state.phase === MatchPhase.TmoReview) {
      this.cardHandler.advanceTmoReview();
      this.emitStateChange();
      // advanceTmoReview may have mutated state.phase (step 3 → Penalty);
      // cast to defeat the narrowing TS inherited from the outer condition.
      if ((this.state.phase as MatchPhase) === MatchPhase.Penalty) {
        await this.penaltyHandler.handlePenaltyDecision();
        if (!this.state.engine.isRunning) return;
      }
      this.scheduleTick(this.state.engine.tickDelayMs);
      return;
    }

    // Sin-bin scan: returnMinute is gameMinute-based and the clock just
    // advanced (or didn't, if we were in TMO — handled above). Yellow
    // expirations are inline; red_20 expirations queue a forced-sub flow.
    const expiredRed20 = this.cardHandler.scanSinBinReturns();
    for (const exp of expiredRed20) {
      await this.runForcedSubstitution(exp.player, exp.side, 'red_20');
      if (!this.state.engine.isRunning) return;
    }

    // Injury forced-sub flow: any player pushed onto state.cards.injured by
    // a PLAYER_INJURED_IN_MATCH on the previous tick's phase resolution gets
    // a replacement here (mirrors red_20 expiry). The bench player runs on;
    // SUBSTITUTION_APPLIED clears cards.injured so onFieldPlayers stops
    // filtering the slot. Players whose pendingInjuryKind is set but bench
    // was empty stay in cards.injured for the rest of the match — the team
    // plays short, and the teardown severity roll still finds them via the
    // pendingInjuryKind flag.
    const pendingInjurySubs = this.collectPendingInjurySubs();
    for (const exp of pendingInjurySubs) {
      await this.runForcedSubstitution(exp.player, exp.side, 'injury');
      if (!this.state.engine.isRunning) return;
    }

    const homeInOppHalf = !this.state.clock.halfTimeDone ? this.state.ball.x > 50 : this.state.ball.x < 50;
    applyMatchEvent(this.state, {
      type: 'TICK_BOOKKEEPING',
      possessionSide: this.state.possession,
      territorySide: homeInOppHalf ? 'home' : 'away',
    });

    let previousPhase = this.state.phase;

    if (this.state.phase === MatchPhase.KickOff) {
      const attackTeam = this.state.possession === 'home' ? this.state.homeTeam : this.state.awayTeam;
      const kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
      const announceEvent: GameEvent = {
        id: makeId(),
        gameMinute: this.state.clock.gameMinute,
        phase: MatchPhase.KickOff,
        side: this.state.possession,
        sideName: attackTeam.name,
        primaryPlayer: kicker,
        ballX: this.state.ball.x,
        ballY: this.state.ball.y,
        narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.KickOff, key: 'announce', primary: kicker }] },
      };
      applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: announceEvent });
      this.emitEvent(announceEvent);
    }

    if (this.state.phase === MatchPhase.KickOff) {
      this.kickOffStrategy = await this.penaltyHandler.awaitKickOffStrategy();
      if (!this.state.engine.isRunning) return;
    }

    if (this.state.phase === MatchPhase.BoxKick) {
      const attackTeam = this.state.possession === 'home' ? this.state.homeTeam : this.state.awayTeam;
      const scrumHalf = attackTeam.players.find(p => p.id === 9) ?? attackTeam.players[0];
      const announceEvent: GameEvent = {
        id: makeId(),
        gameMinute: this.state.clock.gameMinute,
        phase: MatchPhase.BoxKick,
        side: this.state.possession,
        sideName: attackTeam.name,
        primaryPlayer: scrumHalf,
        ballX: this.state.ball.x,
        ballY: this.state.ball.y,
        narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'announce', primary: scrumHalf }] },
      };
      applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: announceEvent });
      this.emitEvent(announceEvent);
    }

    // AI tactical adaptation runs before resolvePhase so the new tactics
    // take effect on the very tick that meets the trigger condition. The
    // sub director runs next so a fresh replacement participates in the
    // same tick's resolver.
    this.director.evaluate();
    this.subDirector.evaluate();

    const event = resolvePhase(this.state, this.kickOffStrategy);
    applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event });

    detectEntry22Changes(this.state);

    this.emitEvent(event);
    this.emitStateChange();

    if ((this.state.phase === MatchPhase.Lineout && previousPhase !== MatchPhase.Lineout) ||
        (this.state.phase === MatchPhase.Scrum && previousPhase !== MatchPhase.Scrum)) {
      const phaseName = this.state.phase === MatchPhase.Lineout ? 'Lineout' : 'Scrum';
      const teamName = (this.state.possession === 'home' ? this.state.homeTeam : this.state.awayTeam).name;
      const awardEvent: GameEvent = {
        id: makeId(),
        gameMinute: this.state.clock.gameMinute,
        phase: this.state.phase,
        side: this.state.possession,
        sideName: teamName,
        ballX: this.state.ball.x,
        ballY: this.state.ball.y,
        narration: { steps: [{ kind: 'announcement', key: 'set_piece_award', params: { phaseName, teamName } }] },
      };
      applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: awardEvent });
      this.emitEvent(awardEvent);
    }

    if (this.state.phase === MatchPhase.Penalty) {
      // CardHandler runs before PenaltyHandler so a TMO review can preempt
      // the penalty modal. 'tmo' verdict transitions phase to TmoReview;
      // we bail this tick and let the TmoReview branch above drive the
      // next 3 ticks of narrative.
      const verdict = this.cardHandler.evaluateNewPenalty();
      if (verdict === 'tmo') {
        this.emitStateChange();
        this.scheduleTick(this.state.engine.tickDelayMs);
        return;
      }
      // 'team22_card' issued an inline yellow before this point; 'none'
      // means no card. Either way, run the penalty decision modal next.
      await this.penaltyHandler.handlePenaltyDecision();
      if (!this.state.engine.isRunning) return;
      previousPhase = MatchPhase.Penalty;
    }

    if (!this.state.clock.clockInTheRed) {
      this.clock.checkClockInRed(this.state);
    } else if (wasInRed && this.clock.shouldEndPeriod(this.state, previousPhase)) {
      if (!this.state.clock.halfTimeDone) {
        this.clock.triggerHalfTime(this.state);
        if (!this.state.engine.isRunning) return;
      } else {
        this.clock.endMatch(this.state);
        return;
      }
    }

    this.scheduleTick(this.state.engine.tickDelayMs);
  }

}

// Re-export PossessionSide so UI modules that imported it from here continue to work
export type { PossessionSide };
