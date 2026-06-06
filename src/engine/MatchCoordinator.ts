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
import { pickKicker, pickScrumHalf, offFieldIds } from './FieldPosition';
import type { RawPlayer, RawTeamInput } from '../types/teamData';
import { MatchPhase, type PossessionSide, type KickOffStrategy } from '../types/engine';
import { eventBus } from '../utils/eventBus';
import { colorsClash } from '../utils/teamColor';
import { rngFormRaw, setMatchSeed, rng, generateSeed } from '../utils/rng';
import { PenaltyHandler } from './PenaltyHandler';
import { CardHandler, buildAnnounce } from './CardHandler';
import { KickAtGoalHandler } from './KickAtGoalHandler';
import { ClockController } from './ClockController';
import { FatigueAccumulator } from './FatigueAccumulator';
import { CommentaryStreamer } from './CommentaryStreamer';
import { buildDisplaySnapshot } from './displaySnapshot';
import { detectEntry22Changes } from './Entry22Tracker';
import { resolvePhase, draftEvent } from './PhaseRouter';
import { makeId, resetEventCounter } from './eventId';
import { applyMatchEvent } from './applyMatchEvent';
import { playerOverall } from './RatingEngine';
import { AITacticalDirector } from './AITacticalDirector';
import { AISubstitutionDirector } from './AISubstitutionDirector';
import { COMMENTARY_BUFFER_CAP, COMMENTARY_PACING, slotFamiliarity, HOME_ADVANTAGE, FORM_MODEL, TEAM_TALK } from './balance';
import { STARTING_XV_MAX } from './Slot';
import type { TalkArgs } from '../types/ui';

// Shallow copy — PlayerStats fields are all primitives, so spread is a
// full clone. (Renamed from deepCloneStats in v2.253a — "deep" was
// misleading.)
function cloneStats(s: PlayerStats): PlayerStats {
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
  // Form = deterministic career-derived bias (recent ratings + condition +
  // return rustiness, precomputed by playerForm.computeFormInputs) + a single
  // random perturbation scaled by the player's volatility (age + marquee). The
  // JSON / legacy path has no precomputed inputs, so it collapses to the old
  // pure-random roll (bias 0, volatility 1). Exactly one rngFormRaw() draw per
  // player keeps the form RNG stream order unchanged.
  const spread = FORM_MODEL.baseSpread * (raw.formVolatility ?? 1);
  const form = Math.max(FORM_MODEL.min, Math.min(FORM_MODEL.max,
    Math.round(rngFormRaw() * spread + (raw.formBias ?? 0))));
  // Out-of-position penalty. A starter (slot 1-15) filling a jersey that isn't
  // their natural position takes an effective-stat hit, scaled onto this
  // player's *per-match* baseStats clone (the roster record is untouched).
  // StaminaSystem re-derives currentStats from baseStats every tick, so the
  // penalty must live on the clone, not just the initial currentStats. Bench
  // players (slot 16-23) stay unscaled here — they get scaled at sub time when
  // SUBSTITUTION_APPLIED reveals the field slot they actually take.
  const base = cloneStats(raw.baseStats);
  const posMult = raw.id <= STARTING_XV_MAX ? slotFamiliarity(raw.position, raw.id) : 1.0;
  if (posMult !== 1.0) {
    for (const key of Object.keys(base) as (keyof PlayerStats)[]) {
      base[key] = Math.max(1, Math.min(100, Math.round(base[key] * posMult)));
    }
  }
  // Form is applied to the per-match baseStats clone (the roster record is
  // untouched), NOT just the initial currentStats — StaminaSystem re-derives
  // currentStats from baseStats on every fatigue drain, so a form offset living
  // only on currentStats would be wiped after the first drain (~5 min in). Same
  // reasoning as the OOP penalty above. `current` inherits it via the clone.
  if (form !== 0) {
    for (const key of Object.keys(base) as (keyof PlayerStats)[]) {
      base[key] = Math.max(1, Math.min(100, base[key] + form));
    }
  }
  const current = cloneStats(base);
  // Carry-over freshness from the previous match (set via PLAYER_CONDITION_UPDATED
  // at match-end, persisted on the roster). Falls back to 100 for JSON
  // imports / legacy paths that don't thread it through.
  // Clamp to the invariant's legal [0,100] range — guards against a corrupt or
  // mis-migrated persisted `condition` crashing the first assertInvariants at kickoff.
  const startingFatigue = Math.max(0, Math.min(100, raw.condition ?? 100));
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
    baseStats: base,
    currentStats: current,
    matchStats: zeroMatchStats(),
    seasonStats: zeroSeasonStats(),
    formModifier: form,
    fatiguePct: startingFatigue,
    rating: 6.0,
    x: 50,
    y: 50,
    condition: startingFatigue,
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
    // Merge over DEFAULT_TACTICS so a team JSON / old save authored before a
    // tactic dimension existed falls back to its default rather than undefined.
    tactics: { ...DEFAULT_TACTICS, ...(tactics ?? {}) },
  };
}

function initMatchState(homeRaw: RawTeamInput, awayRaw: RawTeamInput, tickDelayMs: number, seed: number, playerTactics?: TeamTactics, humanSide: 'home' | 'away' = 'home', neutralVenue = false, homeFillRate: number = HOME_ADVANTAGE.crowdFillNeutral, isDerby = false, isPlayoffSemi = false, humanCaptainRosterId?: number): MatchState {
  return {
    clock: {
      gameMinute: 0,
      halfTimeDone: false,
      clockInTheRed: false,
      penaltyKickToTouchLineout: false,
    },
    ball: { x: 50, y: 50, lateralDir: 1 },
    engine: {
      isRunning: false,
      tickDelayMs,
      seed,
      firstHalfKicker: 'home',
      humanSide,
      humanCaptainRosterId,
      commentaryBufferCap: COMMENTARY_BUFFER_CAP,
      neutralVenue,
      homeFillRate,
      isDerby,
      isPlayoffSemi,
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
      mauls:    { home: 0, away: 0 },
      maulMetres: { home: 0, away: 0 },
      ownLineouts: { home: { thrown: 0, won: 0 }, away: { thrown: 0, won: 0 } },
      ownScrums:   { home: { putIn: 0, won: 0 }, away: { putIn: 0, won: 0 } },
      entries22: {
        home: { count: 0, pointsScored: 0, active: false },
        away: { count: 0, pointsScored: 0, active: false },
      },
    },
    events: [],
    breakdownMod: { attack: 0, defend: 0 },
    teamTalkMod: {
      home: { attack: 0, defend: 0, startMinute: 0, decayMinutes: 0 },
      away: { attack: 0, defend: 0, startMinute: 0, decayMinutes: 0 },
    },
    lastBallQuality: 'clean',
    cards: {
      sinBin:        { home: [], away: [] },
      sentOff:       { home: [], away: [] },
      teamPenalty22: { home: 0,  away: 0  },
      teamWarned22:  { home: false, away: false },
      injured:       { home: [], away: [] },
      version: 0,
    },
    consecutiveWheels: 0,
  };
}

export class MatchCoordinator {
  private state: MatchState;
  private tickTimeout: ReturnType<typeof setTimeout> | null = null;
  // Single-flight guard: true while a tickBody() is in flight (incl. parked on
  // an internal await such as the pre-penalty streamer flush or a forced-sub
  // modal). Stops a resume()-triggered scheduleTick from starting a SECOND
  // concurrent tickBody — see the comment in tick().
  private ticking = false;
  // Phase at the start of the most recently completed tick. Drives the
  // cross-tick set-piece announcement: when a tick begins in Lineout or
  // Scrum and the previous tick started in a different phase, fire
  // `set_piece_award` BEFORE resolvePhase. Defers the announcement out of
  // the busy penalty / knock-on tick into the calmer set-piece tick that
  // follows, evening commentary pacing.
  private prevTickStartPhase: MatchPhase | null = null;
  private kickOffStrategy: KickOffStrategy = 'high_ball';
  private humanSide: 'home' | 'away';
  private penaltyHandler: PenaltyHandler;
  private cardHandler: CardHandler;
  private kickAtGoalHandler: KickAtGoalHandler;
  private clock: ClockController;
  private fatigue: FatigueAccumulator;
  private director: AITacticalDirector;
  private subDirector: AISubstitutionDirector;
  private streamer: CommentaryStreamer;
  private busUnsubs: Array<() => void> = [];
  // When a red_20 forced-substitution modal is open and waiting on the
  // manager, the Promise's resolve sits here so destroy() can short-circuit
  // it (resolve(null) → "no replacement chosen, play short") rather than
  // leaving the Promise pending after teardown.
  private pendingForcedSubResolve: ((n: number | null) => void) | null = null;
  private pendingSubQueue: Array<{ side: 'home' | 'away'; benchSquadNum: number; fieldSquadNum: number }> = [];
  // Silent matches suppress every engine event except `engine:finished`
  // (which the headless caller awaits) so the live UI stays inert while a
  // background AI fixture runs. PenaltyHandler short-circuits modal prompts
  // to the same defaults the determinism harness uses.
  private silent: boolean;
  // Pre-game average morale of the human squad, threaded in from GameCoordinator
  // so the half-time team talk panel knows the squad's mood. Defaults to the
  // neutral baseline (65) for headless / legacy paths.
  private humanSquadMorale: number;
  // Pre-match team talk choice from the TeamTalkScreen, stored until initialize()
  // applies it alongside the AI talk.
  private humanPreTalk?: TalkArgs;

  constructor(
    homeRaw: RawTeamInput,
    awayRaw: RawTeamInput,
    opts: { tickDelayMs?: number; homeTactics?: TeamTactics; playerTactics?: TeamTactics; humanSide?: 'home' | 'away'; seed?: number; silent?: boolean; commentaryBufferCap?: number; neutralVenue?: boolean; homeFillRate?: number; isDerby?: boolean; isPlayoffSemi?: boolean; humanCaptainRosterId?: number; humanPreTalk?: TalkArgs; humanSquadMorale?: number } = {},
  ) {
    const seed = (opts.seed ?? generateSeed()) >>> 0;
    setMatchSeed(seed);
    resetEventCounter();
    this.humanSide = opts.humanSide ?? 'home';
    this.silent = opts.silent ?? false;
    this.humanSquadMorale = opts.humanSquadMorale ?? TEAM_TALK.flatThreshold + 15; // neutral default ~65 = baseline
    this.humanPreTalk = opts.humanPreTalk;
    const tactics = opts.playerTactics ?? opts.homeTactics;
    this.state = initMatchState(homeRaw, awayRaw, opts.tickDelayMs ?? 500, seed, tactics, this.humanSide, opts.neutralVenue ?? false, opts.homeFillRate, opts.isDerby ?? false, opts.isPlayoffSemi ?? false, opts.humanCaptainRosterId);
    if (opts.commentaryBufferCap !== undefined) {
      applyMatchEvent(this.state, { type: 'COMMENTARY_BUFFER_CAP_SET', value: opts.commentaryBufferCap });
    }
    // Streamer must be constructed before the other handlers since they
    // all enqueue events through it.
    this.streamer = new CommentaryStreamer(this.silent, this.state);
    this.clock = new ClockController(this.silent, this.streamer);
    this.fatigue = new FatigueAccumulator(this.state, this.silent, this.streamer);

    this.penaltyHandler = new PenaltyHandler({
      state: this.state,
      humanSide: this.humanSide,
      silent: this.silent,
      streamer: this.streamer,
    });

    this.cardHandler = new CardHandler({
      state: this.state,
      humanSide: this.humanSide,
      silent: this.silent,
      streamer: this.streamer,
    });

    this.kickAtGoalHandler = new KickAtGoalHandler({
      state: this.state,
      silent: this.silent,
      streamer: this.streamer,
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
      this.silent
        ? (side, benchSquadNum, fieldSquadNum) => this.substitute(side, benchSquadNum, fieldSquadNum)
        : (side, benchSquadNum, fieldSquadNum) => this.queueSubstitute(side, benchSquadNum, fieldSquadNum),
    );

    if (!this.silent) {
      this.busUnsubs.push(
        eventBus.on('ui:tacticsChange', ({ teamId, tactics }) => {
          if (teamId === 'home' || teamId === 'away') {
            applyMatchEvent(this.state, { type: 'TACTICS_UPDATED', side: teamId, tactics });
          }
        }),
        eventBus.on('ui:substitution', ({ benchSquadNum, fieldSquadNum }) => {
          this.queueSubstitute(this.humanSide, benchSquadNum, fieldSquadNum);
        }),
      );
    }
  }

  // Events are queued in the streamer and flushed evenly across the next
  // tickDelayMs interval so multi-event ticks (kick-off announce +
  // resolution, penalty + lineout award, etc.) read as separate beats
  // rather than a single visual burst. The streamer pairs each event with
  // a matching `engine:stateChange` emit at flush time, preserving the
  // existing event-then-stateChange contract.
  private emitEvent(event: GameEvent): void {
    this.streamer.enqueue(event);
  }

  // No-op kept so the many existing call sites compile unchanged. The
  // streamer already pairs stateChange with every flushed event; firing
  // an additional stateChange here would race the paced flush.
  private emitStateChange(): void { /* handled by streamer */ }

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
    this.pendingSubQueue = [];
    this.streamer.clear();
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
      applyMatchEvent(this.state, { type: 'INJURY_STRANDED', player: off, teamSide: side });
      return;
    }

    let benchSquadNum: number | null = null;
    if (this.silent || side !== this.humanSide) {
      benchSquadNum = pickAutoReplacement(team.bench, off);
    } else {
      // Drain queued events before opening the forced-sub modal so the
      // user reads the red_20 / injury narration before picking a
      // replacement.
      await this.streamer.flush(this.state.engine.tickDelayMs, this.state);
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

    if (!this.state.engine.isRunning) return;
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

    // A sin-binned (or sent-off) player is temporarily off the field but still
    // occupies their slot in team.players — they must NOT be replaceable, or the
    // manager could quietly swap in a fresh player and erase the numerical
    // disadvantage the card is meant to impose. The forced-sub flow for an
    // expired red_20 goes through runForcedSubstitution, not here, so this guard
    // is safe. Injured players ARE replaceable, but they leave via
    // runForcedSubstitution too, so by the time a normal sub runs they're no
    // longer in offFieldIds.
    if (offFieldIds(this.state, side).has(off.id)) return;

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

  private queueSubstitute(side: 'home' | 'away', benchSquadNum: number, fieldSquadNum: number): void {
    if (!this.pendingSubQueue.some(s => s.side === side && s.fieldSquadNum === fieldSquadNum)) {
      this.pendingSubQueue.push({ side, benchSquadNum, fieldSquadNum });
    }
  }

  private isNaturalBreak(): boolean {
    const p = this.state.phase;
    return p === MatchPhase.Penalty || p === MatchPhase.Scrum || p === MatchPhase.Lineout
      || p === MatchPhase.KickOff || p === MatchPhase.DropOut22
      || p === MatchPhase.ConversionKick || p === MatchPhase.TryScored;
  }

  private flushPendingSubQueue(): void {
    const queue = this.pendingSubQueue.splice(0);
    for (const { side, benchSquadNum, fieldSquadNum } of queue) {
      this.substitute(side, benchSquadNum, fieldSquadNum);
    }
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
    const tossSteps: import('../types/narration').NarrationStep[] = [
      { kind: 'phase_outcome', phase: MatchPhase.KickOff, key: 'coin_toss' },
    ];
    const occasionKey = this.state.engine.isDerby ? 'occasion_kickoff_derby'
      : this.state.engine.neutralVenue ? 'occasion_kickoff_final'
      : this.state.engine.isPlayoffSemi ? 'occasion_kickoff_playoff_semi'
      : null;
    if (occasionKey) {
      tossSteps.push({ kind: 'announcement', key: occasionKey as import('../types/narration').AnnouncementKey });
    }
    const tossEvent: GameEvent = {
      ...draft,
      id: makeId(),
      narration: { steps: tossSteps },
    };
    applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: tossEvent });
    this.emitEvent(tossEvent);

    // Apply pre-match team talks. Human side uses the chosen talk (if any);
    // AI side is deterministic (OVR-sum based). Silent / headless: both sides
    // get AI talks so determinism is preserved.
    const aiSide: 'home' | 'away' = this.humanSide === 'home' ? 'away' : 'home';
    if (this.silent) {
      this.applyTalk('home', this.computeAITalk('home'));
      this.applyTalk('away', this.computeAITalk('away'));
    } else {
      if (this.humanPreTalk) this.applyTalk(this.humanSide, this.humanPreTalk);
      this.applyTalk(aiSide, this.computeAITalk(aiSide));
    }

    // Fire a synchronous stateChange so the UI repaints to the fresh
    // kickoff state (score 0-0, players in starting positions, empty stats)
    // BEFORE `#app` is revealed. The streamer-paced flush only happens
    // during `tick()`; without this direct emit, the DOM would still show
    // the previous match's final frame until the user pressed Play.
    if (!this.silent) eventBus.emit('engine:stateChange', { state: this.state, display: buildDisplaySnapshot(this.state) });
  }

  start(): void {
    if (this.state.engine.isRunning) return;
    applyMatchEvent(this.state, { type: 'IS_RUNNING_SET', value: true });
    if (this.silent) { void this.runSilent(); return; }
    this.scheduleTick(0);
  }

  // Silent-mode driver: loops tickBody() synchronously (all awaits inside
  // resolve as microtasks, no setTimeout overhead) until isRunning goes false.
  private async runSilent(): Promise<void> {
    while (this.state.engine.isRunning) {
      await this.tickBody();
    }
  }

  pause(): void {
    applyMatchEvent(this.state, { type: 'IS_RUNNING_SET', value: false });
    if (this.tickTimeout) { clearTimeout(this.tickTimeout); this.tickTimeout = null; }
    this.streamer.pause();
  }

  resume(): void {
    if (this.state.engine.isRunning) return;
    // The producer can race ahead to full-time (endMatch → MATCH_ENDED sets
    // isRunning false + phase FullTime) while the presenter is still draining
    // the beat buffer and the Subs/Tactics buttons stay live. A Subs close in
    // that window calls resume(); without this guard it would flip isRunning
    // back to true and schedule a tick that resolvePhase()s the terminal
    // FullTime phase → "No phase handler registered for FULL_TIME". The match
    // is over — don't restart it.
    if (this.state.phase === MatchPhase.FullTime) return;
    applyMatchEvent(this.state, { type: 'IS_RUNNING_SET', value: true });
    this.streamer.resume();
    this.scheduleTick(0);
  }

  setTickDelay(ms: number): void {
    applyMatchEvent(this.state, { type: 'TICK_DELAY_SET', value: ms });
    // The presenter paces off its own cached tickDelayMs (refreshed on flush).
    // While run-ahead-throttled the producer stops flushing, so push the new
    // speed straight into the streamer or a live speed change (incl. auto-slow
    // on key moments) wouldn't reach the on-screen cadence.
    this.streamer.setTickDelay(ms);
    if (this.state.engine.isRunning && this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.scheduleTick(ms);
    }
  }

  getState(): Readonly<MatchState> {
    return this.state;
  }

  // Compute the AI team talk for a given side based on match context.
  // Pre-match: OVR-sum delta drives calm/encourage/demand.
  // Half-time: score diff drives calm/encourage/demand.
  private computeAITalk(side: 'home' | 'away'): TalkArgs {
    const aiTeam = side === 'home' ? this.state.homeTeam : this.state.awayTeam;
    const oppTeam = side === 'home' ? this.state.awayTeam : this.state.homeTeam;
    if (!this.state.clock.halfTimeDone) {
      // Pre-match: use total OVR sum delta
      const aiOvr = aiTeam.players.reduce((s, p) => s + playerOverall(p.baseStats, p.position), 0);
      const oppOvr = oppTeam.players.reduce((s, p) => s + playerOverall(p.baseStats, p.position), 0);
      const delta = aiOvr - oppOvr;
      if (delta >= TEAM_TALK.aiCalmMinDelta) {
        return { attack: TEAM_TALK.calm.attack, defend: TEAM_TALK.calm.defend, decayMinutes: TEAM_TALK.calm.decayMinutes };
      } else if (delta > 0) {
        return { attack: TEAM_TALK.encourage.attack, defend: TEAM_TALK.encourage.defend, decayMinutes: TEAM_TALK.encourage.decayMinutes };
      } else {
        return { attack: TEAM_TALK.demand.attack, defend: TEAM_TALK.demand.defend, decayMinutes: TEAM_TALK.demand.decayMinutes };
      }
    } else {
      // Half-time: score diff
      const aiScore = side === 'home' ? this.state.score.home : this.state.score.away;
      const oppScore = side === 'home' ? this.state.score.away : this.state.score.home;
      const diff = aiScore - oppScore;
      if (diff >= TEAM_TALK.aiScoreCalmMin) {
        return { attack: TEAM_TALK.calm.attack, defend: TEAM_TALK.calm.defend, decayMinutes: TEAM_TALK.calm.decayMinutes };
      } else if (diff <= TEAM_TALK.aiScoreDemandMax) {
        return { attack: TEAM_TALK.demand.attack, defend: TEAM_TALK.demand.defend, decayMinutes: TEAM_TALK.demand.decayMinutes };
      } else {
        return { attack: TEAM_TALK.encourage.attack, defend: TEAM_TALK.encourage.defend, decayMinutes: TEAM_TALK.encourage.decayMinutes };
      }
    }
  }

  // Apply a team talk to a side via TEAM_TALK_APPLIED.
  private applyTalk(side: 'home' | 'away', args: TalkArgs): void {
    applyMatchEvent(this.state, {
      type: 'TEAM_TALK_APPLIED',
      side,
      attack: args.attack,
      defend: args.defend,
      startMinute: this.state.clock.gameMinute,
      decayMinutes: args.decayMinutes,
      singleOut: args.singleOut,
    });
  }

  private scheduleTick(delay: number): void {
    if (this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.tickTimeout = null;
    }
    this.tickTimeout = setTimeout(() => this.tick(), delay);
  }

  private async tick(): Promise<void> {
    // Re-entrancy guard. A live tick can park mid-body on an internal `await`
    // (the pre-penalty streamer flush at the top of the Penalty branch, a
    // forced-sub modal) while isRunning stays true and the Subs / Tactics
    // buttons stay enabled. If the manager opens Subs in that window then
    // closes it, SimController calls resume() → scheduleTick(0), which would
    // otherwise start a SECOND tickBody concurrently with the parked one — and
    // that second run hits resolvePhase() with state.phase still === Penalty
    // (the parked tick hasn't applied the decision yet), throwing "No phase
    // handler registered for PENALTY". One tickBody at a time; the in-flight
    // tick reschedules the next when it completes.
    if (this.ticking) return;
    this.ticking = true;
    // Silent fixtures (telemetry, determinism harness, headless AI sims) must
    // propagate exceptions so CI sees them. Live mode catches and surfaces the
    // error through `engine:error` so the UI can render a copy-pastable crash
    // overlay instead of silently freezing.
    try {
      await this.tickBody();
    } catch (err) {
      // Emit engine:error so the in-app headless-fixture path (simulateFixture)
      // can REJECT its promise instead of hanging the caller's await forever.
      this.reportTickCrash(err);
      // Rethrow in silent mode so telemetry/experiment scripts that drive a
      // silent engine directly still fail loudly (they don't subscribe to
      // engine:error).
      if (this.silent) throw err;
    } finally {
      this.ticking = false;
    }
  }

  private reportTickCrash(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : '(no stack)';
    const lastEvents = this.state.events.slice(-5).map(e => {
      const step = e.narration?.steps[0];
      const key = step && 'key' in step ? step.key : '(no key)';
      return `${e.gameMinute.toFixed(0)}' ${e.phase} ${key}`;
    });
    if (this.state.engine.isRunning) {
      applyMatchEvent(this.state, { type: 'IS_RUNNING_SET', value: false });
    }
    if (this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.tickTimeout = null;
    }
    eventBus.emit('engine:error', {
      message,
      stack,
      seed: this.state.engine.seed,
      clockMinute: this.state.clock.gameMinute,
      phase: this.state.phase,
      possession: this.state.possession,
      score: { home: this.state.score.home, away: this.state.score.away },
      lastEvents,
    });
  }

  private async tickBody(): Promise<void> {
    this.tickTimeout = null;
    if (!this.state.engine.isRunning) return;
    // Backstop: once endMatch has run, phase is the terminal FullTime, which
    // has no resolvePhase handler. isRunning is normally false by now, but a
    // stray resume() (Subs close while the producer is parked in endMatch's
    // buffer drain) can flip it back to true — bail before resolvePhase().
    if (this.state.phase === MatchPhase.FullTime) return;

    // Run-ahead throttle (live mode only): the producer resolves phases far
    // faster than the presenter narrates them, so cap how far it leads. When
    // the look-ahead buffer is full, re-check at the beat cadence instead of
    // producing. This is a poll (setTimeout re-check), NOT a wait on a
    // presenter promise, so it can never deadlock. Silent fixtures have no
    // presenter (buffer stays empty) and run flat-out.
    if (!this.silent && this.streamer.bufferDepth() >= COMMENTARY_PACING.lookaheadBeats) {
      this.scheduleTick(this.streamer.beatGap());
      return;
    }

    const wasInRed = this.state.clock.clockInTheRed;
    const timeAdvance = this.clock.advanceMinute(this.state);

    this.fatigue.tick(timeAdvance);

    if (this.state.phase === MatchPhase.TmoReview) { await this.tickTmoReview(); return; }
    if (this.state.phase === MatchPhase.KickAtGoal) { await this.tickKickAtGoal(); return; }

    if (await this.processForcedSubstitutions()) return;

    const homeInOppHalf = !this.state.clock.halfTimeDone ? this.state.ball.x > 50 : this.state.ball.x < 50;
    applyMatchEvent(this.state, {
      type: 'TICK_BOOKKEEPING',
      possessionSide: this.state.possession,
      territorySide: homeInOppHalf ? 'home' : 'away',
    });

    let previousPhase = this.state.phase;
    // Frozen snapshot for the prevTickStartPhase update at end of tick.
    // Distinct from `previousPhase` which gets reassigned inside the
    // Penalty branch below.
    const phaseAtTickStart = this.state.phase;

    if (await this.prepareEnteringPhase()) return;

    // At a natural break in play (penalty, scrum, lineout, kickoff, dropout,
    // conversion, try scored) flush the deferred interruptions so they never land
    // mid-open-play: buffered tiredness commentary (both modes, keeps the log
    // consistent) and, in live matches, any pending voluntary subs (so they take
    // effect on the same tick that resolves the set piece). Forced red_20 subs
    // bypass the queue; injury subs are flushed here too (see below).
    if (this.isNaturalBreak()) {
      this.fatigue.flush();
      if (!this.silent) this.flushPendingSubQueue();
      // Deferred injury_off + forced replacement (may pause on a human modal).
      if (await this.processPendingInjuries()) return;
    }

    // AI tactical adaptation runs before resolvePhase so the new tactics
    // take effect on the very tick that meets the trigger condition. The
    // sub director runs next so a fresh replacement participates in the
    // same tick's resolver.
    const tacticsSignal = this.director.evaluate();
    if (!this.silent && tacticsSignal !== null) {
      const key: import('../types/narration').AnnouncementKey =
        tacticsSignal.category === 'chasing'    ? 'ai_tactics_chasing' :
        tacticsSignal.category === 'protecting' ? 'ai_tactics_protecting' :
                                                  'ai_tactics_revert';
      const tacticsEvent: GameEvent = {
        id: makeId(),
        gameMinute: this.state.clock.gameMinute,
        phase: this.state.phase,
        side: tacticsSignal.side,
        sideName: tacticsSignal.teamName,
        ballX: this.state.ball.x,
        ballY: this.state.ball.y,
        narration: {
          steps: [{
            kind: 'announcement',
            key,
            params: {
              teamName: tacticsSignal.teamName,
              minutesLeft: tacticsSignal.minutesLeft,
              scoreGap: tacticsSignal.scoreGap,
            },
          }],
        },
      };
      applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: tacticsEvent });
      this.emitEvent(tacticsEvent);
    }
    this.subDirector.evaluate();

    const event = resolvePhase(this.state, this.kickOffStrategy, this.silent);
    applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event });

    detectEntry22Changes(this.state);

    this.emitEvent(event);
    this.emitStateChange();

    if (this.state.phase === MatchPhase.Penalty) {
      // CardHandler runs before PenaltyHandler so a TMO review can preempt
      // the penalty modal. 'tmo' verdict transitions phase to TmoReview;
      // we bail this tick and let the TmoReview branch above drive the
      // next 3 ticks of narrative.
      const verdict = this.cardHandler.evaluateNewPenalty();
      if (verdict === 'tmo') {
        this.streamer.flush(this.state.engine.tickDelayMs, this.state);
        if (!this.silent) this.scheduleTick(this.nextTickDelay());
        return;
      }
      // 'team22_card' issued an inline yellow before this point; 'none'
      // means no card. Either way, run the penalty decision modal next.
      // Drain queued events first so the user reads the penalty narration
      // (and any card announcement) before the modal pops.
      await this.streamer.flush(this.state.engine.tickDelayMs, this.state);
      await this.penaltyHandler.handlePenaltyDecision();
      if (!this.state.engine.isRunning) return;
      previousPhase = MatchPhase.Penalty;
    }

    if (await this.handleEndOfPeriod(wasInRed, previousPhase)) return;

    // Stash this tick's starting phase so the next tick can detect a
    // cross-tick set-piece entry. Must be the snapshot — state.phase has
    // mutated several times during the tick body.
    this.prevTickStartPhase = phaseAtTickStart;

    // Hand this tick's beats to the presenter (non-awaited — it paces them in
    // the background while the producer races on). In live mode schedule the
    // next tick ASAP; the run-ahead throttle at tickBody's top caps how far we
    // actually get. Silent fixtures keep the existing tickDelay schedule (no
    // presenter to pace against).
    this.streamer.flush(this.state.engine.tickDelayMs, this.state);
    if (!this.silent) this.scheduleTick(0);
  }

  // End-of-period handling: clock-in-the-red check, period end
  // (triggerHalfTime / endMatch), and the live-mode half-time auto-pause.
  // `wasInRed` is the pre-advance clock snapshot; `previousPhase` is the
  // (possibly Penalty-reassigned) phase fed to shouldEndPeriod. Returns
  // true when the tick has terminated (match ended, or half-time paused
  // the engine) — caller returns without scheduling. Returns false to let
  // the orchestrator stash + schedule the next tick (incl. the silent
  // half-time case, which plays straight on into the second half).
  private async handleEndOfPeriod(wasInRed: boolean, previousPhase: MatchPhase): Promise<boolean> {
    const wasHalfTimeDone = this.state.clock.halfTimeDone;
    if (!this.state.clock.clockInTheRed) {
      this.clock.checkClockInRed(this.state);
    } else if (wasInRed && this.clock.shouldEndPeriod(this.state, previousPhase)) {
      if (!this.state.clock.halfTimeDone) {
        this.clock.triggerHalfTime(this.state);
        if (!this.state.engine.isRunning) return true;
      } else {
        await this.clock.endMatch(this.state);
        return true;
      }
    }

    // Half-time auto-pause. When triggerHalfTime fires on this tick, drain
    // the commentary queue so the user reads the half-time line, then pause
    // the engine and signal SimController to flip the buttons back to
    // playable. The user clicks Play to start the second half. Skipped in
    // silent mode so headless harnesses (determinism, telemetry, AI
    // fixtures) blow straight through to full-time.
    if (!wasHalfTimeDone && this.state.clock.halfTimeDone) {
      const aiSide: 'home' | 'away' = this.humanSide === 'home' ? 'away' : 'home';
      if (this.silent) {
        // Headless: apply AI talks for both sides, no pause needed.
        this.applyTalk('home', this.computeAITalk('home'));
        this.applyTalk('away', this.computeAITalk('away'));
      } else {
        // AI talk applied immediately; human talk collected via the panel.
        this.applyTalk(aiSide, this.computeAITalk(aiSide));
        await this.streamer.flush(this.state.engine.tickDelayMs, this.state);
        // Collect human team talk via the half-time panel. Engine stays
        // running = false (pause() below) while the user makes their choice.
        const humanTalkArgs = await new Promise<TalkArgs>(resolve => {
          eventBus.emit('engine:paused', {
            payload: {
              type: 'team_talk_choice',
              side: this.humanSide,
              state: this.state,
              averageMorale: this.humanSquadMorale,
              onChoice: resolve,
            },
          });
        });
        this.applyTalk(this.humanSide, humanTalkArgs);
        eventBus.emit('ui:halfTimeTalkDone', {});
        this.pause();
        eventBus.emit('engine:autoPaused', { reason: 'half_time' });
        return true;
      }
    }
    return false;
  }

  // Pre-resolution narration for the phase about to resolve: the cross-tick
  // set-piece award, the KickOff / DropOut22 kicker announce, the KickOff
  // strategy modal, and the BoxKick announce. Returns true if the KickOff
  // modal left the engine paused (caller returns without scheduling);
  // false to continue the tick.
  private async prepareEnteringPhase(): Promise<boolean> {
    // Cross-tick set-piece entry: a tick starting in Lineout or Scrum
    // whose predecessor was a different phase fires the announcement here,
    // before resolvePhase. Replaces the old end-of-tick award branch — the
    // award now lands in the SAME tick that resolves the set piece rather
    // than tacking onto the previous tick. Evens out commentary pacing
    // around penalties (kick_to_touch → lineout) and knock-ons
    // (open play → scrum). The first tick has prevTickStartPhase=null and
    // the match opens in KickOff, so this never fires at kickoff.
    if ((this.state.phase === MatchPhase.Lineout || this.state.phase === MatchPhase.Scrum) &&
        this.prevTickStartPhase !== null &&
        this.prevTickStartPhase !== this.state.phase) {
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

    if (this.state.phase === MatchPhase.KickOff || this.state.phase === MatchPhase.DropOut22) {
      const attackTeam = this.state.possession === 'home' ? this.state.homeTeam : this.state.awayTeam;
      const kicker = pickKicker(attackTeam, this.state, this.state.possession);
      const phase = this.state.phase;
      const announceEvent: GameEvent = {
        id: makeId(),
        gameMinute: this.state.clock.gameMinute,
        phase,
        side: this.state.possession,
        sideName: attackTeam.name,
        primaryPlayer: kicker,
        ballX: this.state.ball.x,
        ballY: this.state.ball.y,
        narration: { steps: [{ kind: 'phase_outcome', phase, key: 'announce', primary: kicker }] },
      };
      applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: announceEvent });
      this.emitEvent(announceEvent);
    }

    if (this.state.phase === MatchPhase.KickOff) {
      // Drain queued events before opening the kick-off strategy modal so
      // the user reads the announce line ("Bath to kick off") before being
      // asked to pick high/long/short.
      await this.streamer.flush(this.state.engine.tickDelayMs, this.state);
      this.kickOffStrategy = await this.penaltyHandler.awaitKickOffStrategy();
      if (!this.state.engine.isRunning) return true;
    }

    if (this.state.phase === MatchPhase.BoxKick) {
      const attackTeam = this.state.possession === 'home' ? this.state.homeTeam : this.state.awayTeam;
      const scrumHalf = pickScrumHalf(attackTeam, this.state, this.state.possession);
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
    return false;
  }

  // Sin-bin + injury forced-substitution scans, run after the clock
  // advances but before phase resolution. Returns true if the engine was
  // paused mid-substitution (human forced-sub modal) — the caller must
  // then return without scheduling. Returns false to continue the tick.
  private async processForcedSubstitutions(): Promise<boolean> {
    // Sin-bin scan: returnMinute is gameMinute-based and the clock just
    // advanced (or didn't, if we were in TMO — handled above). Yellow
    // expirations are inline; red_20 expirations queue a forced-sub flow.
    const expiredRed20 = this.cardHandler.scanSinBinReturns();
    for (const exp of expiredRed20) {
      await this.runForcedSubstitution(exp.player, exp.side, 'red_20');
      if (!this.state.engine.isRunning) return true;
    }

    // Injury forced subs are NOT processed here — they're deferred to the next
    // break in play (processPendingInjuries, called from the tick's natural-break
    // block) so the injury_off line + replacement never interrupt open play.
    return false;
  }

  // Deferred injury flow, run at a natural break in play. For each player pushed
  // onto state.cards.injured by a PLAYER_INJURED_IN_MATCH (on an earlier tick's
  // phase resolution), emit the held injury_off commentary then run the forced
  // replacement (mirrors red_20 expiry). The injured player is already off the
  // field (offFieldIds includes cards.injured) from the moment of injury; this
  // just brings the bench player on. Players whose bench was empty are stranded
  // by runForcedSubstitution. Returns true if the engine paused on a human modal.
  private async processPendingInjuries(): Promise<boolean> {
    const pendingInjurySubs = this.collectPendingInjurySubs();
    for (const exp of pendingInjurySubs) {
      this.emitInjuryOff(exp.player, exp.side);
      await this.runForcedSubstitution(exp.player, exp.side, 'injury');
      if (!this.state.engine.isRunning) return true;
    }
    return false;
  }

  // The held "X is off injured" line, emitted at the break just before the
  // replacement (the tackle beat that caused the injury no longer carries it).
  private emitInjuryOff(player: Player, side: 'home' | 'away'): void {
    const ev: GameEvent = {
      id: makeId(),
      gameMinute: this.state.clock.gameMinute,
      phase: this.state.phase,
      side,
      sideName: (side === 'home' ? this.state.homeTeam : this.state.awayTeam).name,
      primaryPlayer: player,
      ballX: this.state.ball.x,
      ballY: this.state.ball.y,
      narration: { steps: [{ kind: 'announcement', key: 'injury_off', primary: player }] },
    };
    applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: ev });
    this.emitEvent(ev);
  }

  // KickAtGoal micro-phase: entry handler emitted kicker_steps_up and
  // parked here. Resolve the kick, transition to KickOff (or DropOut22 on
  // a missed penalty). Mirrors the TMO branch shape. Terminal: schedules,
  // pauses, or ends the match internally.
  private async tickKickAtGoal(): Promise<void> {
    this.kickAtGoalHandler.advance();
    this.emitStateChange();
    this.streamer.flush(this.state.engine.tickDelayMs, this.state);

    // Any goal kick (penalty or conversion, success or miss) resolved while
    // the clock is in the red ends the period — no restart played. World
    // Rugby rule: time off after the kick.
    if (this.state.clock.clockInTheRed) {
      if (!this.state.clock.halfTimeDone) {
        this.clock.triggerHalfTime(this.state);
        if (!this.state.engine.isRunning) return;
        if (!this.silent) {
          await this.streamer.flush(this.state.engine.tickDelayMs, this.state);
          this.pause();
          eventBus.emit('engine:autoPaused', { reason: 'half_time' });
          return;
        }
      } else {
        await this.clock.endMatch(this.state);
        return;
      }
    }

    if (!this.silent) this.scheduleTick(this.nextTickDelay());
  }

  // TMO review: clock is frozen (advanceMinute returned 0) and play is
  // suspended. Steps 1 + 2 narrate and bail. Step 3 applies CARD_ISSUED,
  // resolves the review, and transitions phase back to Penalty — we then
  // run the penalty modal in the SAME tick so the next tick starts in a
  // phase resolvePhase() can handle. Without this fall-through the next
  // tick enters resolvePhase with phase=Penalty and the game stalls on
  // the TMO outcome. evaluateNewPenalty is deliberately NOT re-called
  // here: the team-22 counter was bumped on the original Penalty tick
  // before TMO began, and re-running would either double-bump or
  // re-trigger TMO. Terminal: always schedules the next tick or returns
  // paused.
  private async tickTmoReview(): Promise<void> {
    this.cardHandler.advanceTmoReview();
    this.emitStateChange();
    // advanceTmoReview may have mutated state.phase (step 3 → Penalty);
    // cast to defeat the narrowing TS inherited from the outer condition.
    if ((this.state.phase as MatchPhase) === MatchPhase.Penalty) {
      await this.penaltyHandler.handlePenaltyDecision();
      if (!this.state.engine.isRunning) return;
    }
    this.streamer.flush(this.state.engine.tickDelayMs, this.state);
    if (!this.silent) this.scheduleTick(this.nextTickDelay());
  }

  // Custom inter-tick delay for the KickAtGoal micro-phase: when the previous
  // tick parked the engine in KickAtGoal (kicker_steps_up entry beat lands,
  // resolve is deferred to the next tick), use a shorter delay so the build-up
  // doesn't consume a full sim tick. Scales with the user's chosen tickDelayMs
  // so faster sim speeds still feel cohesive; clamp keeps a visible split at
  // 4× and prevents a 3-second drag at ½×. Constants live inline (no balance
  // file needed — pure UI rhythm).
  private nextTickDelay(): number {
    const tickDelayMs = this.state.engine.tickDelayMs;
    // Silent mode (telemetry, determinism harness, headless AI fixtures) has no
    // UI rhythm to honour — skip the KickAtGoal build-up floor entirely.
    if (this.silent) return tickDelayMs;
    if (this.state.phase === MatchPhase.KickAtGoal) {
      const KICK_BUILD_UP_FRACTION = 0.6;
      const KICK_BUILD_UP_MIN_MS   = 300;
      const KICK_BUILD_UP_MAX_MS   = 1200;
      return Math.max(KICK_BUILD_UP_MIN_MS, Math.min(KICK_BUILD_UP_MAX_MS, tickDelayMs * KICK_BUILD_UP_FRACTION));
    }
    return tickDelayMs;
  }

}

// Re-export PossessionSide so UI modules that imported it from here continue to work
export type { PossessionSide };
