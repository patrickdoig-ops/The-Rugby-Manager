import type { MatchState, GameEvent } from '../types/match';
import type { Team } from '../types/team';
import { DEFAULT_TACTICS } from '../types/team';
import type { Player, PlayerStats } from '../types/player';
import { MatchPhase, type PossessionSide, type PenaltyChoice } from '../types/engine';
import { StateMachine } from './StateMachine';
import { applyFatigue } from './StaminaSystem';
import { resolveGoalKick } from './resolvers/KickingResolver';
import { getCommentary } from './CommentaryEngine';
import { eventBus } from '../utils/eventBus';
import { rng, rngForm } from '../utils/rng';
import { clamp } from '../utils/math';
import type { PhaseContext, PhaseResult } from './events/types';
import { handleKickOff }        from './events/KickOffEvent';
import { handlePhasePlay }      from './events/OpenPlayEvent';
import { handleFirstPhase }     from './events/FirstPhaseEvent';
import { handleKickReturn }     from './events/KickReturnEvent';
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

type RawPlayer = Omit<Player, 'currentStats' | 'fatiguePct' | 'rating' | 'x' | 'y' | 'squadNumber'> & { squadNumber?: number };

export type RawTeamInput = {
  id: string; name: string; shortName: string; color: string; secondaryColor: string;
  players: RawPlayer[];
  bench?: RawPlayer[];
};

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
    formModifier: form,
    fatiguePct: 100,
    rating: 6.0,
    x: 50,
    y: 50,
  };
}

function buildTeam(raw: RawTeamInput): Team {
  return {
    ...raw,
    players: raw.players.map(initPlayer),
    bench: (raw.bench ?? []).map(initPlayer),
    substitutedOff: [],
    tactics: { ...DEFAULT_TACTICS },
  };
}

function initMatchState(homeRaw: RawTeamInput, awayRaw: RawTeamInput, tickDelayMs: number): MatchState {
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
    breakdownMod: { attack: 0, defend: 0 },
  };
}

const PHASE_HANDLERS: Partial<Record<MatchPhase, (ctx: PhaseContext) => PhaseResult>> = {
  [MatchPhase.KickOff]:        handleKickOff,
  [MatchPhase.PhasePlay]:      handlePhasePlay,
  [MatchPhase.FirstPhase]:     handleFirstPhase,
  [MatchPhase.KickReturn]:     handleKickReturn,
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
  private fatigueAccumulator = 0;

  constructor(
    homeRaw: RawTeamInput,
    awayRaw: RawTeamInput,
    opts: { tickDelayMs?: number } = {},
  ) {
    this.state = initMatchState(homeRaw, awayRaw, opts.tickDelayMs ?? 500);
    this.sm = new StateMachine(MatchPhase.KickOff);

    eventBus.on('ui:tacticsChange', ({ teamId, tactics }) => {
      if (teamId === 'home') {
        this.state.homeTeam.tactics = { ...tactics };
      } else if (teamId === 'away') {
        this.state.awayTeam.tactics = { ...tactics };
      }
    });

    eventBus.on('ui:substitution', ({ benchSquadNum, fieldSquadNum }) => {
      this.substitute('home', benchSquadNum, fieldSquadNum);
    });
  }

  substitute(side: 'home' | 'away', benchSquadNum: number, fieldSquadNum: number): void {
    const team = side === 'home' ? this.state.homeTeam : this.state.awayTeam;
    const benchIdx = team.bench.findIndex(p => p.squadNumber === benchSquadNum);
    const fieldIdx = team.players.findIndex(p => p.squadNumber === fieldSquadNum);
    if (benchIdx === -1 || fieldIdx === -1) return;

    const sub = team.bench[benchIdx];
    const off = team.players[fieldIdx];

    sub.id = off.id;
    sub.x  = off.x;
    sub.y  = off.y;

    team.players[fieldIdx] = sub;
    team.bench.splice(benchIdx, 1);
    team.substitutedOff.push(off);

    const templates = [
      `${sub.name} (#${sub.squadNumber}) comes on to replace ${off.name} (#${off.squadNumber}).`,
      `${sub.name} (#${sub.squadNumber}) is introduced, replacing ${off.name} (#${off.squadNumber}).`,
      `A change for ${team.name}: ${off.name} (#${off.squadNumber}) makes way for ${sub.name} (#${sub.squadNumber}).`,
      `${off.name} (#${off.squadNumber}) is replaced by ${sub.name} (#${sub.squadNumber}).`,
    ];
    const subEvent: GameEvent = {
      id: makeId(),
      gameMinute: this.state.gameMinute,
      phase: MatchPhase.Substitution,
      side,
      sideName: team.name,
      primaryPlayer: sub,
      secondaryPlayer: off,
      ballX: this.state.ballX,
      ballY: this.state.ballY,
      commentary: templates[rng(0, templates.length - 1)],
    };
    this.state.events.push(subEvent);
    eventBus.emit('engine:event', { event: subEvent });
    eventBus.emit('engine:stateChange', { state: this.state });
  }


  initialize(): void {
    // Coin toss — 50/50; winner kicks off in the first half, loser in the second.
    // Half-time already flips possession, so just set the first-half kicker here.
    this.state.possession = rng(0, 1) === 0 ? 'home' : 'away';
    const draft = this.draftEvent(MatchPhase.KickOff);
    const tossEvent: GameEvent = {
      ...draft,
      id: makeId(),
      commentary: getCommentary(draft, 'coin_toss'),
    };
    this.state.events.push(tossEvent);
    eventBus.emit('engine:event', { event: tossEvent });
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
    if (this.state.isRunning && this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.scheduleTick(ms);
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

  private inOwn22(): boolean {
    const { ballX, possession } = this.state;
    const homeAttacksRight = !this.state.halfTimeDone;
    if (possession === 'home') return homeAttacksRight ? ballX <= 22 : ballX >= 78;
    return homeAttacksRight ? ballX >= 78 : ballX <= 22;
  }

  private inOwnHalf(): boolean {
    const { ballX, possession } = this.state;
    const homeAttacksRight = !this.state.halfTimeDone;
    if (possession === 'home') return homeAttacksRight ? ballX <= 50 : ballX >= 50;
    return homeAttacksRight ? ballX >= 50 : ballX <= 50;
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
    if (!this.state.isRunning) return;

    try {
      const timeAdvance = 0.2 + rng(0, 8) / 10;
      this.state.gameMinute = Math.min(80, this.state.gameMinute + timeAdvance);

      this.fatigueAccumulator += timeAdvance;
      if (this.fatigueAccumulator >= 5) {
        applyFatigue(this.state.homeTeam, this.fatigueAccumulator);
        applyFatigue(this.state.awayTeam, this.fatigueAccumulator);
        this.fatigueAccumulator -= 5;
      }

      this.state.stats.possession[this.state.possession]++;
      const homeInOppHalf = !this.state.halfTimeDone ? this.state.ballX > 50 : this.state.ballX < 50;
      if (homeInOppHalf) this.state.stats.territory.home++;
      else this.state.stats.territory.away++;

      const previousPhase = this.state.phase;

      if (this.state.phase === MatchPhase.KickOff) {
        const attackTeam = this.state.possession === 'home' ? this.state.homeTeam : this.state.awayTeam;
        const kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
        const announceEvent: GameEvent = {
          id: makeId(),
          gameMinute: this.state.gameMinute,
          phase: MatchPhase.KickOff,
          side: this.state.possession,
          sideName: attackTeam.name,
          primaryPlayer: kicker,
          ballX: this.state.ballX,
          ballY: this.state.ballY,
          commentary: getCommentary({ ...this.draftEvent(MatchPhase.KickOff), primaryPlayer: kicker }, 'announce'),
        };
        this.state.events.push(announceEvent);
        eventBus.emit('engine:event', { event: announceEvent });
      }

      if (this.state.phase === MatchPhase.BoxKick) {
        const attackTeam = this.state.possession === 'home' ? this.state.homeTeam : this.state.awayTeam;
        const scrumHalf = attackTeam.players.find(p => p.id === 9) ?? attackTeam.players[0];
        const announceEvent: GameEvent = {
          id: makeId(),
          gameMinute: this.state.gameMinute,
          phase: MatchPhase.BoxKick,
          side: this.state.possession,
          sideName: attackTeam.name,
          primaryPlayer: scrumHalf,
          ballX: this.state.ballX,
          ballY: this.state.ballY,
          commentary: getCommentary({ ...this.draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf }, 'announce'),
        };
        this.state.events.push(announceEvent);
        eventBus.emit('engine:event', { event: announceEvent });
      }

      const event = this.resolvePhase();
      this.state.events.push(event);
      if (this.state.events.length > 300) this.state.events.splice(0, this.state.events.length - 300);

      eventBus.emit('engine:event', { event });
      eventBus.emit('engine:stateChange', { state: this.state });

      if ((this.state.phase === MatchPhase.Lineout && previousPhase !== MatchPhase.Lineout) ||
          (this.state.phase === MatchPhase.Scrum && previousPhase !== MatchPhase.Scrum)) {
        const phaseName = this.state.phase === MatchPhase.Lineout ? 'Lineout' : 'Scrum';
        const teamName = (this.state.possession === 'home' ? this.state.homeTeam : this.state.awayTeam).name;
        const awardEvent: GameEvent = {
          id: makeId(),
          gameMinute: this.state.gameMinute,
          phase: this.state.phase,
          side: this.state.possession,
          sideName: teamName,
          ballX: this.state.ballX,
          ballY: this.state.ballY,
          commentary: `${phaseName} awarded to ${teamName}.`,
        };
        this.state.events.push(awardEvent);
        eventBus.emit('engine:event', { event: awardEvent });
      }

      if (this.state.phase === MatchPhase.Penalty) {
        await this.handlePenaltyDecision();
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
    } catch (err) {
      console.error('MatchEngine tick error encountered, recovering loop:', err);
    }

    this.scheduleTick(this.state.tickDelayMs);
  }

  private resolvePhase(): GameEvent {
    const { state } = this;
    const attackTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
    const defendTeam = state.possession === 'home' ? state.awayTeam : state.homeTeam;
    // Capture before the handler runs — possession may flip inside the handler.
    // ConversionKick flips possession to set up the kick-off, but the event itself
    // belongs to the scoring team, so we preserve the pre-handler side for that case.
    const phaseAtStart   = state.phase;
    const sideAtStart    = state.possession;
    const sideNameAtStart = attackTeam.name;

    const ctx: PhaseContext = {
      state,
      attackTeam,
      defendTeam,
      attackDir:      () => this.attackDir(),
      isTryScored:    () => this.isTryScored(),
      inOpposition22:   () => this.inOpposition22(),
      inOppositionHalf: () => this.inOppositionHalf(),
      inOwn22:          () => this.inOwn22(),
      inOwnHalf:        () => this.inOwnHalf(),
      adjustRating:   (player, delta) => this.adjustRating(player, delta),
      randomPlayer:   (team) => team.players[rng(0, team.players.length - 1)],
      pickPlayer:     (team, ...ids) => team.players.find(p => ids.includes(p.id)) ?? team.players[0],
      draftEvent:     (phase) => this.draftEvent(phase),
    };

    const handler = PHASE_HANDLERS[state.phase];
    const { nextPhase, commentary, primaryPlayer, secondaryPlayer, outcome } = handler
      ? handler(ctx)
      : { nextPhase: state.phase, commentary: 'Match event.', primaryPlayer: undefined, secondaryPlayer: undefined, outcome: undefined };

    try {
      this.sm.transition(nextPhase);
    } catch {
      this.sm.forceTransition(nextPhase);
    }
    state.phase = nextPhase;

    const isConversion = phaseAtStart === MatchPhase.ConversionKick;
    return {
      id: makeId(),
      gameMinute: state.gameMinute,
      phase: state.phase,
      side:     isConversion ? sideAtStart    : state.possession,
      sideName: isConversion ? sideNameAtStart : (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
      primaryPlayer,
      secondaryPlayer,
      ballX: state.ballX,
      ballY: state.ballY,
      commentary,
      outcome,
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

  private async handlePenaltyDecision(): Promise<void> {
    const { state } = this;

    // Only present the choice to the human manager (home team) and only when
    // the penalty is in the opposition's half. All other penalties auto-kick to touch.
    if (state.possession !== 'home' || !this.inOppositionHalf()) {
      this.applyPenaltyChoice('kick_to_touch');
      return;
    }

    state.isPaused = true;
    const choice = await new Promise<PenaltyChoice>(resolve => {
      eventBus.emit('engine:paused', {
        payload: {
          type: 'penalty_choice',
          context: {
            phase: state.phase,
            ballX: state.ballX,
            ballY: state.ballY,
            inOpposition22: this.inOpposition22(),
            attackingSide: state.possession,
          },
          onChoice: (c) => resolve(c),
        },
      });
    });
    state.isPaused = false;
    eventBus.emit('engine:resumed', {});
    this.applyPenaltyChoice(choice);
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

      if (res.success) this.adjustRating(kicker, +0.3);
      else             this.adjustRating(kicker, -0.225);

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
      state.ballX = clamp(state.ballX + this.attackDir() * 20, 5, 95);
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

      const teamName = (state.possession === 'home' ? state.homeTeam : state.awayTeam).name;
      const awardEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.gameMinute,
        phase: MatchPhase.Lineout,
        side: state.possession,
        sideName: teamName,
        ballX: state.ballX,
        ballY: state.ballY,
        commentary: `Lineout awarded to ${teamName}.`,
      };
      state.events.push(awardEvent);
      eventBus.emit('engine:event', { event: awardEvent });

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
      sm.forceTransition(MatchPhase.FirstPhase);
      state.phase = MatchPhase.FirstPhase;
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
