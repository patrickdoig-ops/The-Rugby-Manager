import type { MatchState, GameEvent } from '../types/match';
import { MatchPhase } from '../types/engine';
import type { StateMachine } from './StateMachine';
import { eventBus } from '../utils/eventBus';
import { rng } from '../utils/rng';
import { makeId } from './eventId';

export class ClockController {
  constructor(private sm: StateMachine) {}

  // Advances state.gameMinute; halved while clockInTheRed; clamped to the half target otherwise.
  // Returns the raw timeAdvance so the caller can drive the fatigue accumulator.
  advanceMinute(state: MatchState): number {
    const halfTarget = state.halfTimeDone ? 80 : 40;
    const timeAdvance = 0.2 + rng(0, 8) / 10;
    if (state.clockInTheRed) {
      state.gameMinute += timeAdvance / 2;
    } else {
      state.gameMinute = Math.min(halfTarget, state.gameMinute + timeAdvance);
    }
    return timeAdvance;
  }

  // Enters the "clock in the red" state if the half target has been reached; emits commentary event.
  checkClockInRed(state: MatchState): void {
    if (state.clockInTheRed) return;
    const halfTarget = state.halfTimeDone ? 80 : 40;
    if (state.gameMinute < halfTarget) return;

    state.clockInTheRed = true;
    const isFirstHalf = !state.halfTimeDone;
    const lines = isFirstHalf
      ? [
          'That\'s the 40 minutes — the clock is in the red! Play on until the ball is dead.',
          'Forty minutes up — we\'re into added time. The clock is in the red.',
          'The half-time whistle is ready, but the clock is in the red — play continues.',
        ]
      : [
          'That\'s 80 minutes — the clock is in the red! The game isn\'t over until the ball is dead.',
          'Eighty minutes on the clock — we\'re into overtime. The clock is in the red.',
          'Full time on the clock, but the ball is still in play — the clock is in the red!',
        ];
    const redEvent: GameEvent = {
      id: makeId(),
      gameMinute: state.gameMinute,
      phase: state.phase,
      side: state.possession,
      sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
      ballX: state.ballX,
      ballY: state.ballY,
      commentary: lines[rng(0, lines.length - 1)],
    };
    state.events.push(redEvent);
    eventBus.emit('engine:event', { event: redEvent });
  }

  shouldEndPeriod(state: MatchState, prevPhase: MatchPhase): boolean {
    // Knock-on or crooked lineout throw → scrum (but not a wheel reset scrum)
    if (state.phase === MatchPhase.Scrum && prevPhase !== MatchPhase.Scrum) return true;
    // Ball went to touch → lineout (exception: penalty kick-to-touch lineout)
    if (state.phase === MatchPhase.Lineout) {
      if (state.penaltyKickToTouchLineout) {
        state.penaltyKickToTouchLineout = false;
        return false;
      }
      return true;
    }
    // Try scored and conversion taken → kickoff restart
    if (state.phase === MatchPhase.KickOff && prevPhase === MatchPhase.ConversionKick) return true;
    // Penalty goal kick (success or miss) → kickoff restart
    if (state.phase === MatchPhase.KickOff && prevPhase === MatchPhase.Penalty) return true;
    return false;
  }

  triggerHalfTime(state: MatchState): void {
    state.halfTimeDone = true;
    state.clockInTheRed = false;
    state.penaltyKickToTouchLineout = false;

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
    this.sm.forceTransition(MatchPhase.HalfTime);
    state.events.push(htEvent);
    eventBus.emit('engine:event', { event: htEvent });
    eventBus.emit('engine:stateChange', { state });

    state.possession = state.possession === 'home' ? 'away' : 'home';
    state.ballX = 50;
    state.ballY = 50;

    this.sm.forceTransition(MatchPhase.KickOff);
    state.phase = MatchPhase.KickOff;
  }

  endMatch(state: MatchState): void {
    state.isRunning = false;
    this.sm.forceTransition(MatchPhase.FullTime);
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
