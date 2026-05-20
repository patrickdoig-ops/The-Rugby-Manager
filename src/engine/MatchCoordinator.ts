import type { MatchState, GameEvent } from '../types/match';
import type { Team, TeamTactics } from '../types/team';
import { DEFAULT_TACTICS } from '../types/team';
import type { Player, PlayerStats } from '../types/player';
import { zeroMatchStats } from '../types/player';
import type { RawPlayer, RawTeamInput } from '../types/teamData';
import { MatchPhase, type PossessionSide, type KickOffStrategy } from '../types/engine';
import { eventBus } from '../utils/eventBus';
import { rngForm, setMatchSeed, rng, generateSeed } from '../utils/rng';
import { PenaltyHandler } from './PenaltyHandler';
import { ClockController } from './ClockController';
import { FatigueAccumulator } from './FatigueAccumulator';
import { detectEntry22Changes } from './Entry22Tracker';
import { resolvePhase, draftEvent } from './PhaseRouter';
import { makeId, resetEventCounter } from './eventId';
import { applyMatchEvent } from './applyMatchEvent';

function deepCloneStats(s: PlayerStats): PlayerStats {
  return { ...s };
}

function initPlayer(raw: RawPlayer): Player {
  const form = rngForm();
  const current = deepCloneStats(raw.baseStats);
  for (const key of Object.keys(current) as (keyof PlayerStats)[]) {
    current[key] = Math.max(1, Math.min(100, current[key] + form));
  }
  return {
    ...raw,
    squadNumber: raw.squadNumber ?? raw.id,
    baseStats: deepCloneStats(raw.baseStats),
    currentStats: current,
    matchStats: zeroMatchStats(),
    formModifier: form,
    fatiguePct: 100,
    rating: 6.0,
    x: 50,
    y: 50,
  };
}

function buildTeam(raw: RawTeamInput, tactics?: TeamTactics): Team {
  return {
    ...raw,
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
    },
    phase: MatchPhase.KickOff,
    score: { home: 0, away: 0 },
    possession: 'home',
    homeTeam: buildTeam(homeRaw, humanSide === 'home' ? playerTactics : undefined),
    awayTeam: buildTeam(awayRaw, humanSide === 'away' ? playerTactics : undefined),
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
  };
}

export class MatchCoordinator {
  private state: MatchState;
  private tickTimeout: ReturnType<typeof setTimeout> | null = null;
  private kickOffStrategy: KickOffStrategy = 'high_ball';
  private humanSide: 'home' | 'away';
  private penaltyHandler: PenaltyHandler;
  private clock: ClockController;
  private fatigue: FatigueAccumulator;
  private busUnsubs: Array<() => void> = [];
  // Silent matches suppress every engine event except `engine:finished`
  // (which the headless caller awaits) so the live UI stays inert while a
  // background AI fixture runs. PenaltyHandler short-circuits modal prompts
  // to the same defaults the determinism harness uses.
  private silent: boolean;

  constructor(
    homeRaw: RawTeamInput,
    awayRaw: RawTeamInput,
    opts: { tickDelayMs?: number; homeTactics?: TeamTactics; playerTactics?: TeamTactics; humanSide?: 'home' | 'away'; seed?: number; silent?: boolean } = {},
  ) {
    const seed = (opts.seed ?? generateSeed()) >>> 0;
    setMatchSeed(seed);
    resetEventCounter();
    this.humanSide = opts.humanSide ?? 'home';
    this.silent = opts.silent ?? false;
    const tactics = opts.playerTactics ?? opts.homeTactics;
    this.state = initMatchState(homeRaw, awayRaw, opts.tickDelayMs ?? 500, seed, tactics, this.humanSide);
    this.clock = new ClockController(this.silent);
    this.fatigue = new FatigueAccumulator(this.state, this.silent);

    this.penaltyHandler = new PenaltyHandler({
      state: this.state,
      humanSide: this.humanSide,
      silent: this.silent,
    });

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
    for (const unsub of this.busUnsubs) unsub();
    this.busUnsubs = [];
  }

  getHumanSide(): 'home' | 'away' {
    return this.humanSide;
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

    try {
      const wasInRed = this.state.clock.clockInTheRed;
      const timeAdvance = this.clock.advanceMinute(this.state);

      this.fatigue.tick(timeAdvance);

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
    } catch (err) {
      console.error('MatchCoordinator tick error encountered, recovering loop:', err);
    }

    this.scheduleTick(this.state.engine.tickDelayMs);
  }

}

// Re-export PossessionSide so UI modules that imported it from here continue to work
export type { PossessionSide };
