import type { MatchState, GameEvent } from '../types/match';
import type { Team } from '../types/team';
import type { Player, PlayerStats } from '../types/player';
import { MatchPhase, type PossessionSide, type PenaltyChoice } from '../types/engine';
import { StateMachine } from './StateMachine';
import { applyFatigue } from './StaminaSystem';
import { resolveBreakdown } from './resolvers/BreakdownResolver';
import { resolveScrum } from './resolvers/ScrumResolver';
import { resolveLineout } from './resolvers/LineoutResolver';
import { resolveKickOff } from './resolvers/KickOffResolver';
import { resolveOpenPlay } from './resolvers/OpenPlayResolver';
import { resolveTacticalKick, resolveGoalKick } from './resolvers/KickingResolver';
import { getCommentary } from './CommentaryEngine';
import { eventBus } from '../utils/eventBus';
import { rng } from '../utils/rng';
import { clamp } from '../utils/math';

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

  // Direction the current possession team is attacking: +1 = toward x=100, -1 = toward x=0.
  // Home attacks right (→100) in the first half, left (→0) in the second half.
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

  private scheduleTick(delay: number): void {
    this.tickTimeout = setTimeout(() => this.tick(), delay);
  }

  private async tick(): Promise<void> {
    if (!this.state.isRunning) return;

    // Advance time
    const timeAdvance = 0.5 + rng(0, 15) / 10;
    this.state.gameMinute = Math.min(80, this.state.gameMinute + timeAdvance);

    // Fatigue every ~5 game minutes
    this.fatigueAccumulator += timeAdvance;
    if (this.fatigueAccumulator >= 5) {
      applyFatigue(this.state.homeTeam, this.fatigueAccumulator);
      applyFatigue(this.state.awayTeam, this.fatigueAccumulator);
      this.fatigueAccumulator = 0;
    }

    // Update possession stats
    this.state.stats.possession[this.state.possession]++;
    if (this.state.ballX > 50) this.state.stats.territory.home++;
    else this.state.stats.territory.away++;

    // Resolve the current phase
    const event = this.resolvePhase();
    this.state.events.push(event);

    eventBus.emit('engine:event', { event });
    eventBus.emit('engine:stateChange', { state: this.state });

    // Check for interactive pause (penalty in opp 22)
    if (this.state.phase === MatchPhase.Penalty) {
      await this.handlePenaltyDecision(event);
      if (!this.state.isRunning) return;
    }

    // Check half-time
    if (this.state.gameMinute >= 40 && !this.state.halfTimeDone) {
      this.triggerHalfTime();
      if (!this.state.isRunning) return;
    }

    // Check full-time
    if (this.state.gameMinute >= 80) {
      this.endMatch();
      return;
    }

    this.scheduleTick(this.state.tickDelayMs);
  }

  private resolvePhase(): GameEvent {
    const { state, sm } = this;
    const attackTeam  = state.possession === 'home' ? state.homeTeam : state.awayTeam;
    const defendTeam  = state.possession === 'home' ? state.awayTeam : state.homeTeam;

    let commentary = '';
    let nextPhase  = state.phase;
    let primaryPlayer: Player | undefined;
    let secondaryPlayer: Player | undefined;

    const pickPlayer  = (team: Team, ...ids: number[]) => team.players.find(p => ids.includes(p.id))!;
    const randomPlayer = (team: Team) => team.players[rng(0, team.players.length - 1)];

    switch (state.phase) {
      case MatchPhase.KickOff: {
        const kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
        const receiver = randomPlayer(defendTeam);
        const chaser   = randomPlayer(attackTeam);
        const res = resolveKickOff(kicker, receiver, chaser);
        primaryPlayer   = receiver;
        secondaryPlayer = chaser;

        if (res.result === 'knock_on') {
          this.adjustRating(receiver, -0.25);
          state.possession = state.possession === 'home' ? 'away' : 'home';
          nextPhase = MatchPhase.Scrum;
          commentary = getCommentary({ ...this.draftEvent(nextPhase), primaryPlayer, secondaryPlayer }, 'knock_on');
        } else {
          nextPhase = MatchPhase.OpenPlay;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.KickOff), primaryPlayer, secondaryPlayer }, res.result);
        }
        break;
      }

      case MatchPhase.OpenPlay: {
        const carrier  = randomPlayer(attackTeam);
        const defender = randomPlayer(defendTeam);
        primaryPlayer   = carrier;
        secondaryPlayer = defender;
        const res = resolveOpenPlay(carrier, defender);

        if (res.outcome === 'knock_on') {
          this.adjustRating(carrier, -0.3);
          state.stats.handlingErrors[state.possession]++;
          const prev = state.possession;
          state.possession = prev === 'home' ? 'away' : 'home';
          nextPhase = MatchPhase.Scrum;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.OpenPlay), primaryPlayer, secondaryPlayer }, 'knock_on');
        } else if (res.outcome === 'line_break') {
          this.adjustRating(carrier, +0.25);
          state.ballX = clamp(state.ballX + this.attackDir() * res.gainMetres, 0, 100);
          nextPhase = MatchPhase.Breakdown;

          if (this.isTryScored()) {
            nextPhase = MatchPhase.TryScored;
          }
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.OpenPlay), primaryPlayer, secondaryPlayer }, 'line_break');
        } else if (res.outcome === 'dominant_tackle') {
          this.adjustRating(defender, +0.2);
          this.adjustRating(carrier, -0.05);
          state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].attempted++;
          state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].made++;
          state.ballX = clamp(state.ballX + this.attackDir() * res.gainMetres, 0, 100);
          nextPhase = MatchPhase.Breakdown;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.OpenPlay), primaryPlayer, secondaryPlayer }, 'dominant_tackle');
        } else {
          // dominant_carry or play_on
          if (res.outcome === 'dominant_carry') this.adjustRating(carrier, +0.15);
          state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].attempted++;
          state.ballX = clamp(state.ballX + this.attackDir() * res.gainMetres, 0, 100);
          nextPhase = MatchPhase.Breakdown;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.OpenPlay), primaryPlayer, secondaryPlayer }, res.outcome);
        }

        // Randomly trigger tactical kicking (~15% of open play)
        if (nextPhase === MatchPhase.Breakdown && rng(1, 100) <= 15) {
          nextPhase = MatchPhase.TacticalKick;
        }
        break;
      }

      case MatchPhase.Breakdown: {
        const forwardPool = attackTeam.players.filter(p => p.id <= 8);
        const pool = [...forwardPool];
        const supporters: Player[] = [];
        while (supporters.length < 3 && pool.length > 0) {
          const idx = rng(0, pool.length - 1);
          supporters.push(...pool.splice(idx, 1));
        }
        const backRow    = defendTeam.players.filter(p => p.id >= 6 && p.id <= 8);
        const jackal     = backRow.length > 0 ? backRow[rng(0, backRow.length - 1)] : defendTeam.players[0];
        primaryPlayer   = supporters[0];
        secondaryPlayer = jackal;
        const res = resolveBreakdown(supporters, jackal);

        if (res.result === 'clean_ball' || res.result === 'slow_ball') {
          if (res.result === 'clean_ball') this.adjustRating(primaryPlayer, +0.1);
          nextPhase = MatchPhase.OpenPlay;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.Breakdown), primaryPlayer, secondaryPlayer }, res.result);
        } else if (res.result === 'turnover') {
          this.adjustRating(jackal, +0.3);
          this.adjustRating(primaryPlayer, -0.1);
          state.possession = state.possession === 'home' ? 'away' : 'home';
          nextPhase = MatchPhase.OpenPlay;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.Breakdown), primaryPlayer: secondaryPlayer, secondaryPlayer: primaryPlayer }, 'turnover');
        } else {
          // penalty_defending
          this.adjustRating(primaryPlayer, -0.25);
          nextPhase = MatchPhase.Penalty;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.Breakdown), primaryPlayer, secondaryPlayer }, 'penalty_defending');
        }
        break;
      }

      case MatchPhase.Scrum: {
        const attackFront5 = attackTeam.players.filter(p => p.id <= 5);
        const defendFront5 = defendTeam.players.filter(p => p.id <= 5);
        primaryPlayer   = attackFront5[1]; // hooker
        secondaryPlayer = defendFront5[1];
        const res = resolveScrum(attackFront5, defendFront5);

        if (res.result === 'stable_win') {
          this.adjustRating(primaryPlayer, +0.1);
          state.stats.scrums[state.possession]++;
          nextPhase = MatchPhase.OpenPlay;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.Scrum), primaryPlayer, secondaryPlayer }, 'stable_win');
        } else if (res.result === 'wheel') {
          nextPhase = MatchPhase.OpenPlay;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.Scrum), primaryPlayer, secondaryPlayer }, 'wheel');
        } else {
          // dominant_penalty — defending team gets penalty
          this.adjustRating(secondaryPlayer, +0.15);
          this.adjustRating(primaryPlayer, -0.2);
          state.possession = state.possession === 'home' ? 'away' : 'home';
          nextPhase = MatchPhase.Penalty;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.Scrum), primaryPlayer: secondaryPlayer, secondaryPlayer: primaryPlayer }, 'dominant_penalty');
        }
        break;
      }

      case MatchPhase.Lineout: {
        const hooker       = pickPlayer(attackTeam, 2);
        const attackJumper = pickPlayer(attackTeam, 4, 5, 6);
        const defendJumper = pickPlayer(defendTeam, 4, 5, 6);
        primaryPlayer   = attackJumper;
        secondaryPlayer = defendJumper;
        const res = resolveLineout(hooker, attackJumper, defendJumper);

        if (res.result === 'clean_catch') {
          this.adjustRating(attackJumper, +0.15);
          state.stats.lineouts[state.possession]++;
          nextPhase = MatchPhase.OpenPlay;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.Lineout), primaryPlayer, secondaryPlayer: hooker }, 'clean_catch');
        } else if (res.result === 'scrappy_knock_on') {
          this.adjustRating(attackJumper, -0.2);
          state.stats.handlingErrors[state.possession]++;
          const prev = state.possession;
          state.possession = prev === 'home' ? 'away' : 'home';
          nextPhase = MatchPhase.Scrum;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.Lineout), primaryPlayer, secondaryPlayer }, 'scrappy_knock_on');
        } else {
          // steal
          this.adjustRating(defendJumper, +0.3);
          this.adjustRating(attackJumper, -0.1);
          state.possession = state.possession === 'home' ? 'away' : 'home';
          nextPhase = MatchPhase.OpenPlay;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.Lineout), primaryPlayer: secondaryPlayer, secondaryPlayer: primaryPlayer }, 'steal');
        }
        break;
      }

      case MatchPhase.TacticalKick: {
        const kicker   = attackTeam.players.find(p => p.id === 10 || p.id === 9) ?? attackTeam.players[0];
        const defender = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam);
        primaryPlayer   = kicker;
        secondaryPlayer = defender;
        const res = resolveTacticalKick(kicker, defender);

        if (res.result === 'poor_kick') {
          this.adjustRating(kicker, -0.15);
          nextPhase = MatchPhase.OpenPlay;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.TacticalKick), primaryPlayer, secondaryPlayer }, 'poor_kick');
        } else if (res.result === 'knock_on_catch') {
          this.adjustRating(defender, -0.2);
          state.stats.handlingErrors[state.possession === 'home' ? 'away' : 'home']++;
          nextPhase = MatchPhase.Scrum;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.TacticalKick), primaryPlayer, secondaryPlayer }, 'knock_on_catch');
        } else {
          // good_kick — ball goes to touch → lineout, or open play if caught
          this.adjustRating(kicker, +0.1);
          const goesToTouch = rng(1, 100) <= 60;
          if (goesToTouch) {
            const kickDir = this.attackDir(); // capture before possession swap
            state.possession = state.possession === 'home' ? 'away' : 'home';
            state.ballX = clamp(state.ballX + kickDir * Math.abs(res.ballMovement) * 2, 5, 95);
            nextPhase = MatchPhase.Lineout;
          } else {
            nextPhase = MatchPhase.OpenPlay;
          }
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.TacticalKick), primaryPlayer, secondaryPlayer }, 'good_kick');
        }
        break;
      }

      case MatchPhase.TryScored: {
        const scorer = randomPlayer(attackTeam);
        primaryPlayer = scorer;
        this.adjustRating(scorer, +0.5);
        state.score[state.possession] += 5;
        state.stats.tries[state.possession]++;
        nextPhase = MatchPhase.ConversionKick;
        commentary = getCommentary({ ...this.draftEvent(MatchPhase.TryScored), primaryPlayer }, 'try');
        break;
      }

      case MatchPhase.ConversionKick: {
        const kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
        primaryPlayer = kicker;
        const distFromPosts = Math.abs(state.ballY - 50) * 0.4;
        const res = resolveGoalKick(kicker, distFromPosts);
        if (res.success) {
          this.adjustRating(kicker, +0.15);
          state.score[state.possession] += 2;
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.ConversionKick), primaryPlayer }, 'success');
        } else {
          this.adjustRating(kicker, -0.1);
          commentary = getCommentary({ ...this.draftEvent(MatchPhase.ConversionKick), primaryPlayer }, 'miss');
        }
        // Swap possession and reset ball for kick-off
        state.possession = state.possession === 'home' ? 'away' : 'home';
        state.ballX = 50;
        state.ballY = 50;
        nextPhase = MatchPhase.KickOff;
        break;
      }

      case MatchPhase.Penalty: {
        // This is reached only after the modal resolves — see handlePenaltyDecision
        // Shouldn't reach here in normal flow
        nextPhase = MatchPhase.OpenPlay;
        commentary = 'Penalty resolved.';
        break;
      }

      case MatchPhase.HalfTime:
      case MatchPhase.FullTime:
      default: {
        commentary = 'Match event.';
        nextPhase = state.phase;
        break;
      }
    }

    // Transition state machine
    try {
      sm.transition(nextPhase);
    } catch {
      sm.forceTransition(nextPhase);
    }
    state.phase = nextPhase;

    const event: GameEvent = {
      id: makeId(),
      gameMinute: state.gameMinute,
      phase: state.phase,
      side: state.possession,
      primaryPlayer,
      secondaryPlayer,
      ballX: state.ballX,
      ballY: state.ballY,
      commentary,
    };

    return event;
  }

  private draftEvent(phase: MatchPhase): GameEvent {
    return {
      id: '',
      gameMinute: this.state.gameMinute,
      phase,
      side: this.state.possession,
      ballX: this.state.ballX,
      ballY: this.state.ballY,
      commentary: '',
    };
  }

  private async handlePenaltyDecision(event: GameEvent): Promise<void> {
    const { state } = this;
    const inOpp22 = this.inOpposition22();

    if (!inOpp22) {
      // Auto-choose kick to touch when not in scoring range
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
      const kicker = (state.possession === 'home' ? state.homeTeam : state.awayTeam)
        .players.find(p => p.id === 10) ?? (state.possession === 'home' ? state.homeTeam : state.awayTeam).players[0];
      const tryLine = !state.halfTimeDone
        ? (state.possession === 'home' ? 100 : 0)
        : (state.possession === 'home' ? 0 : 100);
      const distFromPosts = Math.abs(state.ballY - 50) * 0.3 + Math.abs(state.ballX - tryLine) * 0.2;
      const res = resolveGoalKick(kicker, distFromPosts);

      if (res.success) this.adjustRating(kicker, +0.2);
      else this.adjustRating(kicker, -0.15);
      const penEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.gameMinute,
        phase: MatchPhase.Penalty,
        side: state.possession,
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
      ballX: 50,
      ballY: 50,
      commentary: 'Half time! The teams head to the dressing rooms to regroup.',
    };
    state.phase = MatchPhase.HalfTime;
    sm.forceTransition(MatchPhase.HalfTime);
    state.events.push(htEvent);
    eventBus.emit('engine:event', { event: htEvent });
    eventBus.emit('engine:stateChange', { state });

    // Swap sides and reset possession
    state.possession = state.possession === 'home' ? 'away' : 'home';
    state.ballX = 50;
    state.ballY = 50;

    // Transition back to kick-off for second half
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
