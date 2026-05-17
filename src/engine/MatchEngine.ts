import type { MatchState, GameEvent } from '../types/match';
import type { Team } from '../types/team';
import type { Player, PlayerStats } from '../types/player';
import { MatchPhase, type PossessionSide, type PenaltyChoice } from '../types/engine';
import { StateMachine } from './StateMachine';
import { applyFatigue } from './StaminaSystem';
import { resolveGoalKick } from './resolvers/KickingResolver';
import { getCommentary } from './CommentaryEngine';
import { eventBus } from '../utils/eventBus';
import { rng } from '../utils/rng';
import { clamp } from '../utils/math';
import type { PhaseContext, PhaseResult } from './events/types';
import { handleKickOff }        from './events/KickOffEvent';
import { handleOpenPlay }       from './events/OpenPlayEvent';
import { handleBreakdown }      from './events/BreakdownEvent';
import { handleScrum }          from './events/ScrumEvent';
import { handleLineout }        from './events/LineoutEvent';
import { handleTacticalKick }   from './events/TacticalKickEvent';
import { handleBoxKick }        from './events/BoxKickEvent';
import { handleTryScored }      from './events/TryScoredEvent';
import { handleConversionKick } from './events/ConversionKickEvent';

let _eventCounter = 0;
function makeId(): string {
  return `evt_${++_eventCounter}`;
}

function deepCloneStats(s: PlayerStats): PlayerStats {
  return { ...s };
}

function initPlayer(raw: Omit<Player, 'currentStats' | 'fatiguePct' | 'rating' | 'x' | 'y'>): Player {
  return {
    ...raw,
    currentStats: deepCloneStats(raw.baseStats),
    fatiguePct: 100,
    rating: 6.0,
    x: 50,
    y: 50,
  };
}

function buildTeam(raw: { id: string; name: string; shortName: string; color: string; secondaryColor: string; players: Omit<Player, 'currentStats' | 'fatiguePct' | 'x' | 'y'>[] }): Team {
  return {
    ...raw,
    players: raw.players.map(initPlayer),
  };
}

function initMatchState(homeRaw: Parameters<typeof buildTeam>[0], awayRaw: Parameters<typeof buildTeam>[0], tickDelayMs: number): MatchState {
  return {
    phase: MatchPhase.KickOff,
    gameMinute: 0,
    score: { home: 0, away: 0 },
    possession: 'home',
    ballX: 50,
    ballY: 50,
    homeTeam: buildTeam(homeRaw),
    awayTeam: buildTeam(awayRaw),
    stats: {
      possession: { home: 0, away: 0 },
      territory:  { home: 0, away: 0 },
      tackles:    { home: { attempted: 0, made: 0 }, away: { attempted: 0, made: 0 } },
      handlingErrors: { home: 0, away: 0 },
      scrums:   { home: 0, away: 0 },
      lineouts: { home: 0, away: 0 },
      tries:    { home: 0, away: 0 },
    },
    events: [],
    isRunning: false,
    isPaused: false,
    halfTimeDone: false,
    tickDelayMs,
  };
}

const PHASE_HANDLERS: Partial<Record<MatchPhase, (ctx: PhaseContext) => PhaseResult>> = {
  [MatchPhase.KickOff]:        handleKickOff,
  [MatchPhase.OpenPlay]:       handleOpenPlay,
  [MatchPhase.Breakdown]:      handleBreakdown,
  [MatchPhase.Scrum]:          handleScrum,
  [MatchPhase.Lineout]:        handleLineout,
  [MatchPhase.TacticalKick]:   handleTacticalKick,
  [MatchPhase.BoxKick]:        handleBoxKick,
  [MatchPhase.TryScored]:      handleTryScored,
  [MatchPhase.ConversionKick]: handleConversionKick,
};

export class MatchEngine {
  private state: MatchState;
  private sm: StateMachine;
  private tickTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingChoiceResolve: ((choice: PenaltyChoice) => void) | null = null;
  private fatigueAccumulator = 0;

  constructor(
    homeRaw: Parameters<typeof buildTeam>[0],
    awayRaw: Parameters<typeof buildTeam>[0],
    opts: { tickDelayMs?: number } = {},
  ) {
    this.state = initMatchState(homeRaw, awayRaw, opts.tickDelayMs ?? 500);
    this.sm = new StateMachine(MatchPhase.KickOff);
  }

  initialize(): void {
    eventBus.emit('engine:stateChange', { state: this.state });
  }

  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    this.scheduleTick(0);
  }

  pause(): void {
    this.state.isRunning = false;
    if (this.tickTimeout) { clearTimeout(this.tickTimeout); this.tickTimeout = null; }
  }

  resume(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    this.scheduleTick(0);
  }

  setTickDelay(ms: number): void {
    this.state.tickDelayMs = ms;
  }

  resolvePlayerChoice(choice: PenaltyChoice): void {
    if (this.pendingChoiceResolve) {
      this.pendingChoiceResolve(choice);
      this.pendingChoiceResolve = null;
    }
  }

  getState(): Readonly<MatchState> {
    return this.state;
  }

  private adjustRating(player: Player | undefined, delta: number): void {
    if (!player) return;
    player.rating = clamp(player.rating + delta, 1, 10);
  }

  // Home attacks toward x=100 in the first half, toward x=0 in the second.
  // Teams only swap ends at half-time, never on turnovers.
  private attackDir(): number {
    const homeAttacksRight = !this.state.halfTimeDone;
    if (this.state.possession === 'home') return homeAttacksRight ? 1 : -1;
    return homeAttacksRight ? -1 : 1;
  }

  private isTryScored(): boolean {
    const { ballX, possession } = this.state;
    const homeAttacksRight = !this.state.halfTimeDone;
    if (possession === 'home') return homeAttacksRight ? ballX >= 95 : ballX <= 5;
    return homeAttacksRight ? ballX <= 5 : ballX >= 95;
  }

  private inOpposition22(): boolean {
    const { ballX, possession } = this.state;
    const homeAttacksRight = !this.state.halfTimeDone;
    if (possession === 'home') return homeAttacksRight ? ballX >= 78 : ballX <= 22;
    return homeAttacksRight ? ballX <= 22 : ballX >= 78;
  }

  private inOppositionHalf(): boolean {
    const { ballX, possession } = this.state;
    const homeAttacksRight = !this.state.halfTimeDone;
    if (possession === 'home') return homeAttacksRight ? ballX > 50 : ballX < 50;
    return homeAttacksRight ? ballX < 50 : ballX > 50;
  }

  private scheduleTick(delay: number): void {
    this.tickTimeout = setTimeout(() => this.tick(), delay);
  }

  private async tick(): Promise<void> {
    if (!this.state.isRunning) return;

    const timeAdvance = 0.5 + rng(0, 15) / 10;
    this.state.gameMinute = Math.min(80, this.state.gameMinute + timeAdvance);

    this.fatigueAccumulator += timeAdvance;
    if (this.fatigueAccumulator >= 5) {
      applyFatigue(this.state.homeTeam, this.fatigueAccumulator);
      applyFatigue(this.state.awayTeam, this.fatigueAccumulator);
      this.fatigueAccumulator = 0;
    }

    this.state.stats.possession[this.state.possession]++;
    if (this.state.ballX > 50) this.state.stats.territory.home++;
    else this.state.stats.territory.away++;

    const event = this.resolvePhase();
    this.state.events.push(event);

    eventBus.emit('engine:event', { event });
    eventBus.emit('engine:stateChange', { state: this.state });

    if (this.state.phase === MatchPhase.Penalty) {
      await this.handlePenaltyDecision(event);
      if (!this.state.isRunning) return;
    }

    if (this.state.gameMinute >= 40 && !this.state.halfTimeDone) {
      this.triggerHalfTime();
      if (!this.state.isRunning) return;
    }

    if (this.state.gameMinute >= 80) {
      this.endMatch();
      return;
    }

    this.scheduleTick(this.state.tickDelayMs);
  }

  private resolvePhase(): GameEvent {
    const { state } = this;
    const attackTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
    const defendTeam = state.possession === 'home' ? state.awayTeam : state.homeTeam;

    const ctx: PhaseContext = {
      state,
      attackTeam,
      defendTeam,
      attackDir:      () => this.attackDir(),
      isTryScored:    () => this.isTryScored(),
      inOpposition22: () => this.inOpposition22(),
      adjustRating:   (player, delta) => this.adjustRating(player, delta),
      randomPlayer:   (team) => team.players[rng(0, team.players.length - 1)],
      pickPlayer:     (team, ...ids) => team.players.find(p => ids.includes(p.id))!,
      draftEvent:     (phase) => this.draftEvent(phase),
    };

    const handler = PHASE_HANDLERS[state.phase];
    const { nextPhase, commentary, primaryPlayer, secondaryPlayer } = handler
      ? handler(ctx)
      : { nextPhase: state.phase, commentary: 'Match event.', primaryPlayer: undefined, secondaryPlayer: undefined };

    try {
      this.sm.transition(nextPhase);
    } catch {
      this.sm.forceTransition(nextPhase);
    }
    state.phase = nextPhase;

    return {
      id: makeId(),
      gameMinute: state.gameMinute,
      phase: state.phase,
      side: state.possession,
      sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
      primaryPlayer,
      secondaryPlayer,
      ballX: state.ballX,
      ballY: state.ballY,
      commentary,
    };
  }

  private draftEvent(phase: MatchPhase): GameEvent {
    const team = this.state.possession === 'home' ? this.state.homeTeam : this.state.awayTeam;
    return {
      id: '',
      gameMinute: this.state.gameMinute,
      phase,
      side: this.state.possession,
      sideName: team.name,
      ballX: this.state.ballX,
      ballY: this.state.ballY,
      commentary: '',
    };
  }

  private async handlePenaltyDecision(event: GameEvent): Promise<void> {
    const { state } = this;

    // Only present the choice to the human manager (home team) and only when
    // the penalty is in the opposition's half. All other penalties auto-kick to touch.
    if (state.possession !== 'home' || !this.inOppositionHalf()) {
      this.applyPenaltyChoice('kick_to_touch');
      return;
    }

    state.isPaused = true;
    const choice = await new Promise<PenaltyChoice>(resolve => {
      this.pendingChoiceResolve = resolve;
      eventBus.emit('engine:paused', {
        payload: {
          type: 'penalty_choice',
          context: {
            phase: state.phase,
            ballX: state.ballX,
            ballY: state.ballY,
            inOpposition22: true,
            attackingSide: state.possession,
          },
          onChoice: (c) => resolve(c),
        },
      });
    });
    state.isPaused = false;
    eventBus.emit('engine:resumed', {});
    this.applyPenaltyChoice(choice);
    void event;
  }

  private applyPenaltyChoice(choice: PenaltyChoice): void {
    const { state, sm } = this;

    if (choice === 'kick_for_goal') {
      const attackTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
      const kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
      const tryLine = !state.halfTimeDone
        ? (state.possession === 'home' ? 100 : 0)
        : (state.possession === 'home' ? 0 : 100);
      const distFromPosts = Math.abs(state.ballY - 50) * 0.3 + Math.abs(state.ballX - tryLine) * 0.2;
      const res = resolveGoalKick(kicker, distFromPosts);

      if (res.success) this.adjustRating(kicker, +0.2);
      else             this.adjustRating(kicker, -0.15);

      const penEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.gameMinute,
        phase: MatchPhase.Penalty,
        side: state.possession,
        sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
        primaryPlayer: kicker,
        ballX: state.ballX,
        ballY: state.ballY,
        commentary: res.success
          ? getCommentary({ ...this.draftEvent(MatchPhase.Penalty), primaryPlayer: kicker }, 'kick_for_goal')
          : getCommentary({ ...this.draftEvent(MatchPhase.Penalty), primaryPlayer: kicker }, 'miss'),
      };
      if (res.success) state.score[state.possession] += 3;
      state.events.push(penEvent);
      eventBus.emit('engine:event', { event: penEvent });

      state.possession = state.possession === 'home' ? 'away' : 'home';
      state.ballX = 50;
      state.ballY = 50;
      sm.forceTransition(MatchPhase.KickOff);
      state.phase = MatchPhase.KickOff;

    } else if (choice === 'kick_to_touch') {
      state.ballX = clamp(state.ballX + this.attackDir() * 10, 5, 95);
      const penEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.gameMinute,
        phase: MatchPhase.Penalty,
        side: state.possession,
        sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
        ballX: state.ballX,
        ballY: state.ballY,
        commentary: getCommentary(this.draftEvent(MatchPhase.Penalty), 'kick_to_touch'),
      };
      state.events.push(penEvent);
      eventBus.emit('engine:event', { event: penEvent });
      sm.forceTransition(MatchPhase.Lineout);
      state.phase = MatchPhase.Lineout;

    } else {
      // tap_and_go
      const penEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.gameMinute,
        phase: MatchPhase.Penalty,
        side: state.possession,
        sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
        ballX: state.ballX,
        ballY: state.ballY,
        commentary: getCommentary(this.draftEvent(MatchPhase.Penalty), 'tap_and_go'),
      };
      state.events.push(penEvent);
      eventBus.emit('engine:event', { event: penEvent });
      sm.forceTransition(MatchPhase.OpenPlay);
      state.phase = MatchPhase.OpenPlay;
    }

    eventBus.emit('engine:stateChange', { state });
  }

  private triggerHalfTime(): void {
    const { state, sm } = this;
    state.halfTimeDone = true;

    const htEvent: GameEvent = {
      id: makeId(),
      gameMinute: 40,
      phase: MatchPhase.HalfTime,
      side: state.possession,
      sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
      ballX: 50,
      ballY: 50,
      commentary: 'Half time! The teams head to the dressing rooms to regroup.',
    };
    state.phase = MatchPhase.HalfTime;
    sm.forceTransition(MatchPhase.HalfTime);
    state.events.push(htEvent);
    eventBus.emit('engine:event', { event: htEvent });
    eventBus.emit('engine:stateChange', { state });

    state.possession = state.possession === 'home' ? 'away' : 'home';
    state.ballX = 50;
    state.ballY = 50;

    sm.forceTransition(MatchPhase.KickOff);
    state.phase = MatchPhase.KickOff;
  }

  private endMatch(): void {
    const { state, sm } = this;
    state.isRunning = false;
    sm.forceTransition(MatchPhase.FullTime);
    state.phase = MatchPhase.FullTime;

    const ftEvent: GameEvent = {
      id: makeId(),
      gameMinute: 80,
      phase: MatchPhase.FullTime,
      side: state.possession,
      sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
      ballX: state.ballX,
      ballY: state.ballY,
      commentary: `Full time! ${state.homeTeam.name} ${state.score.home} – ${state.score.away} ${state.awayTeam.name}`,
    };
    state.events.push(ftEvent);
    eventBus.emit('engine:event', { event: ftEvent });
    eventBus.emit('engine:stateChange', { state });
    eventBus.emit('engine:finished', { state });
  }
}

// Re-export PossessionSide so UI modules that imported it from here continue to work
export type { PossessionSide };
