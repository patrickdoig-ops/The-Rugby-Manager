import type { MatchState, GameEvent } from '../types/match';
import { MatchPhase } from '../types/engine';
import type { NarrationDescriptor } from '../types/narration';
import type { StateMachine } from './StateMachine';
import { eventBus } from '../utils/eventBus';
import { rng } from '../utils/rng';
import { makeId } from './eventId';
import { applyMatchEvent } from './applyMatchEvent';
import { CLOCK_VALUES } from './balance';

export class ClockController {
  constructor(private sm: StateMachine) {}

  // Advances state.clock.gameMinute via a CLOCK_ADVANCED MatchEvent.
  // Returns the raw timeAdvance so the caller can drive the fatigue accumulator.
  advanceMinute(state: MatchState): number {
    const C = CLOCK_VALUES;
    const timeAdvance = C.baseAdvance + rng(C.rngMin, C.rngMax) / C.rngDivisor;
    applyMatchEvent(state, { type: 'CLOCK_ADVANCED', delta: timeAdvance });
    return timeAdvance;
  }

  // Enters the "clock in the red" state if the half target has been reached;
  // emits commentary event through the UI bus.
  checkClockInRed(state: MatchState): void {
    if (state.clock.clockInTheRed) return;
    const halfTarget = state.clock.halfTimeDone ? CLOCK_VALUES.fullTimeMinute : CLOCK_VALUES.halfTimeMinute;
    if (state.clock.gameMinute < halfTarget) return;

    applyMatchEvent(state, { type: 'CLOCK_IN_RED_TRIPPED' });
    const isFirstHalf = !state.clock.halfTimeDone;
    const narration: NarrationDescriptor = {
      steps: [{ kind: 'announcement', key: isFirstHalf ? 'clock_in_red_first_half' : 'clock_in_red_second_half' }],
    };
    const redEvent: GameEvent = {
      id: makeId(),
      gameMinute: state.clock.gameMinute,
      phase: state.phase,
      side: state.possession,
      sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
      ballX: state.ball.x,
      ballY: state.ball.y,
      narration,
    };
    applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: redEvent });
    eventBus.emit('engine:event', { event: redEvent });
  }

  shouldEndPeriod(state: MatchState, prevPhase: MatchPhase): boolean {
    // Knock-on or crooked lineout throw → scrum (but not a wheel reset scrum)
    if (state.phase === MatchPhase.Scrum && prevPhase !== MatchPhase.Scrum) return true;
    // Ball went to touch → lineout (exception: penalty kick-to-touch lineout)
    if (state.phase === MatchPhase.Lineout) {
      if (state.clock.penaltyKickToTouchLineout) {
        // Reset the flag through the boundary, then suppress the period-end.
        applyMatchEvent(state, { type: 'PENALTY_KICK_TO_TOUCH_FLAG_SET', value: false });
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
    applyMatchEvent(state, { type: 'HALF_TIME_REACHED' });

    const htEvent: GameEvent = {
      id: makeId(),
      gameMinute: CLOCK_VALUES.halfTimeMinute,
      phase: MatchPhase.HalfTime,
      side: state.possession,
      sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
      ballX: 50,
      ballY: 50,
      narration: { steps: [{ kind: 'announcement', key: 'half_time_whistle' }] },
    };
    applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.HalfTime });
    this.sm.forceTransition(MatchPhase.HalfTime);
    applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: htEvent });
    eventBus.emit('engine:event', { event: htEvent });
    eventBus.emit('engine:stateChange', { state });

    applyMatchEvent(state, { type: 'POSSESSION_SWAPPED' });
    applyMatchEvent(state, { type: 'BALL_REPOSITIONED', x: 50, y: 50 });

    this.sm.forceTransition(MatchPhase.KickOff);
    applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.KickOff });
  }

  endMatch(state: MatchState): void {
    applyMatchEvent(state, { type: 'MATCH_ENDED' });
    this.sm.forceTransition(MatchPhase.FullTime);
    applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.FullTime });

    const ftEvent: GameEvent = {
      id: makeId(),
      gameMinute: CLOCK_VALUES.fullTimeMinute,
      phase: MatchPhase.FullTime,
      side: state.possession,
      sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
      ballX: state.ball.x,
      ballY: state.ball.y,
      narration: {
        steps: [{
          kind: 'announcement',
          key: 'full_time_summary',
          params: {
            homeName: state.homeTeam.name,
            awayName: state.awayTeam.name,
            homeScore: state.score.home,
            awayScore: state.score.away,
          },
        }],
      },
    };
    applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: ftEvent });
    eventBus.emit('engine:event', { event: ftEvent });
    eventBus.emit('engine:stateChange', { state });
    eventBus.emit('engine:finished', { state });
  }
}
