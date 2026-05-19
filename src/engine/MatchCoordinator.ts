import type { MatchState, GameEvent } from '../types/match';
import type { Team, TeamTactics } from '../types/team';
import { DEFAULT_TACTICS } from '../types/team';
import type { Player, PlayerStats, PlayerMatchStats } from '../types/player';
import { MatchPhase, type PossessionSide, type KickOffStrategy } from '../types/engine';
import { StateMachine } from './StateMachine';
import { computeFatigue } from './StaminaSystem';
import { getCommentary } from './CommentaryEngine';
import { eventBus } from '../utils/eventBus';
import { rng, rngForm } from '../utils/rng';
import { PenaltyHandler } from './PenaltyHandler';
import { ClockController } from './ClockController';
import { resolvePhase, draftEvent } from './PhaseRouter';
import { makeId } from './eventId';
import { applyMatchEvent } from './applyMatchEvent';

function deepCloneStats(s: PlayerStats): PlayerStats {
  return { ...s };
}

function zeroMatchStats(): PlayerMatchStats {
  return {
    carries: 0, metresCarried: 0, lineBreaks: 0, defendersBeaten: 0,
    knockOns: 0, passes: 0, tacklesAttempted: 0, tacklesMade: 0,
    dominantTackles: 0, turnoversWon: 0, penaltiesConceded: 0, tries: 0,
    kicksFromHand: 0, kicksAtGoal: 0, kicksMade: 0, kicksMissed: 0,
    lineoutThrows: 0, lineoutWins: 0, lineoutCatches: 0, lineoutSteals: 0,
    scrumPenaltiesWon: 0, scrumPenaltiesConceded: 0,
    kickMetres: 0, rucksHit: 0,
  };
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

function initMatchState(homeRaw: RawTeamInput, awayRaw: RawTeamInput, tickDelayMs: number, playerTactics?: TeamTactics, humanSide: 'home' | 'away' = 'home'): MatchState {
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
      isPaused: false,
      tickDelayMs,
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
    },
    events: [],
    breakdownMod: { attack: 0, defend: 0 },
  };
}

export class MatchCoordinator {
  private state: MatchState;
  private sm: StateMachine;
  private tickTimeout: ReturnType<typeof setTimeout> | null = null;
  private fatigueAccumulator = 0;
  private kickOffStrategy: KickOffStrategy = 'high_ball';
  private humanSide: 'home' | 'away';
  private penaltyHandler: PenaltyHandler;
  private clock: ClockController;

  constructor(
    homeRaw: RawTeamInput,
    awayRaw: RawTeamInput,
    opts: { tickDelayMs?: number; homeTactics?: TeamTactics; playerTactics?: TeamTactics; humanSide?: 'home' | 'away' } = {},
  ) {
    this.humanSide = opts.humanSide ?? 'home';
    const tactics = opts.playerTactics ?? opts.homeTactics;
    this.state = initMatchState(homeRaw, awayRaw, opts.tickDelayMs ?? 500, tactics, this.humanSide);
    this.sm = new StateMachine(MatchPhase.KickOff);
    this.clock = new ClockController(this.sm);

    this.penaltyHandler = new PenaltyHandler({
      state: this.state,
      sm: this.sm,
      humanSide: this.humanSide,
    });

    eventBus.on('ui:tacticsChange', ({ teamId, tactics }) => {
      if (teamId === 'home' || teamId === 'away') {
        applyMatchEvent(this.state, { type: 'TACTICS_UPDATED', side: teamId, tactics });
      }
    });

    eventBus.on('ui:substitution', ({ benchSquadNum, fieldSquadNum }) => {
      this.substitute(this.humanSide, benchSquadNum, fieldSquadNum);
    });
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

    const subSurname = sub.name.split(' ').pop()!;
    const offSurname = off.name.split(' ').pop()!;
    const templates = [
      `${subSurname} (#${sub.squadNumber}) comes on to replace ${offSurname} (#${off.squadNumber}).`,
      `${subSurname} (#${sub.squadNumber}) is introduced, replacing ${offSurname} (#${off.squadNumber}).`,
      `A change for ${team.name}: ${offSurname} (#${off.squadNumber}) makes way for ${subSurname} (#${sub.squadNumber}).`,
      `${offSurname} (#${off.squadNumber}) is replaced by ${subSurname} (#${sub.squadNumber}).`,
    ];
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
      commentary: templates[rng(0, templates.length - 1)],
    };
    applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: subEvent });
    eventBus.emit('engine:event', { event: subEvent });
    eventBus.emit('engine:stateChange', { state: this.state });
  }


  initialize(): void {
    // Coin toss — 50/50; winner kicks off in the first half, loser in the second.
    // Half-time already flips possession, so just set the first-half kicker here.
    applyMatchEvent(this.state, {
      type: 'POSSESSION_SET',
      side: rng(0, 1) === 0 ? 'home' : 'away',
    });
    const draft = draftEvent(this.state, MatchPhase.KickOff);
    const tossEvent: GameEvent = {
      ...draft,
      id: makeId(),
      commentary: getCommentary(draft, 'coin_toss'),
    };
    applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: tossEvent });
    eventBus.emit('engine:event', { event: tossEvent });
    eventBus.emit('engine:stateChange', { state: this.state });
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

      this.fatigueAccumulator += timeAdvance;
      if (this.fatigueAccumulator >= 5) {
        const homeFatigue = computeFatigue(this.state.homeTeam, this.fatigueAccumulator);
        const awayFatigue = computeFatigue(this.state.awayTeam, this.fatigueAccumulator);
        this.fatigueAccumulator -= 5;
        for (const u of [...homeFatigue.updates, ...awayFatigue.updates]) {
          applyMatchEvent(this.state, {
            type: 'FATIGUE_APPLIED',
            player: u.player,
            newFatiguePct: u.newFatiguePct,
            newCurrentStats: u.newCurrentStats,
          });
        }

        const fatigueLines = [
          (name: string, num: number) => `${name} (#${num}) is starting to look tired out there — the legs are going.`,
          (name: string, num: number) => `${name} (#${num}) is looking leggy. The fatigue is setting in.`,
          (name: string, num: number) => `You can see the wear on ${name} (#${num}) — the energy is fading.`,
          (name: string, num: number) => `${name} (#${num}) is running on empty now — the effort is starting to show.`,
          (name: string, num: number) => `${name} (#${num}) looks worn out — the pace is dropping off.`,
          (name: string, num: number) => `The tank is emptying for ${name} (#${num}) — that's the fatigue biting.`,
        ];
        for (const player of [...homeFatigue.newlyTired, ...awayFatigue.newlyTired]) {
          const line = fatigueLines[rng(0, fatigueLines.length - 1)];
          const fatEvent: GameEvent = {
            id: makeId(),
            gameMinute: this.state.clock.gameMinute,
            phase: this.state.phase,
            side: this.state.possession,
            sideName: this.state.possession === 'home' ? this.state.homeTeam.name : this.state.awayTeam.name,
            primaryPlayer: player,
            ballX: this.state.ball.x,
            ballY: this.state.ball.y,
            commentary: line(player.name, player.squadNumber),
          };
          applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: fatEvent });
          eventBus.emit('engine:event', { event: fatEvent });
        }
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
          commentary: getCommentary({ ...draftEvent(this.state, MatchPhase.KickOff), primaryPlayer: kicker }, 'announce'),
        };
        applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: announceEvent });
        eventBus.emit('engine:event', { event: announceEvent });
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
          commentary: getCommentary({ ...draftEvent(this.state, MatchPhase.BoxKick), primaryPlayer: scrumHalf }, 'announce'),
        };
        applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: announceEvent });
        eventBus.emit('engine:event', { event: announceEvent });
      }

      const event = resolvePhase(this.state, this.sm, this.kickOffStrategy);
      applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event });

      eventBus.emit('engine:event', { event });
      eventBus.emit('engine:stateChange', { state: this.state });

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
          commentary: `${phaseName} awarded to ${teamName}.`,
        };
        applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: awardEvent });
        eventBus.emit('engine:event', { event: awardEvent });
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
