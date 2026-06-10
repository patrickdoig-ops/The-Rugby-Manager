import type { MatchState, GameEvent } from '../types/match';
import { MatchPhase } from '../types/engine';
import type { NarrationDescriptor } from '../types/narration';
import { eventBus } from '../utils/eventBus';
import { rng } from '../utils/rng';
import { makeId } from './eventId';
import { applyMatchEvent } from './applyMatchEvent';
import { CLOCK_VALUES, COMMENTARY_CHANCES } from './balance';
import type { CommentaryStreamer } from './CommentaryStreamer';

export class ClockController {
  // `silent` matches headless AI fixtures — suppresses every commentary
  // event and stateChange notification. `engine:finished` is still emitted
  // because the headless caller awaits it to read final scores.
  // Events route through the streamer; the streamer pairs each event with
  // a matching engine:stateChange emit at flush time.
  constructor(private silent: boolean, private streamer: CommentaryStreamer) {}

  private emitEvent(event: GameEvent): void {
    if (this.silent) return;
    this.streamer.enqueue(event);
  }

  // Standalone stateChange emit is handled by the streamer pairing it with
  // every flushed event. Kept as a no-op so the (now-unnecessary) call
  // sites below continue to compile.
  private emitStateChange(_state: MatchState): void { /* handled by streamer */ }

  // Advances state.clock.gameMinute via a CLOCK_ADVANCED MatchEvent.
  // Returns the raw timeAdvance so the caller can drive the fatigue accumulator.
  // During MatchPhase.TmoReview and MatchPhase.KickAtGoal the clock is frozen —
  // these are real-time stops (TMO is the official-at-the-screen pause, KickAtGoal
  // is the goal-kick build-up), so we skip the rng roll and the CLOCK_ADVANCED
  // emit and return 0. Fatigue accumulator drains nothing this tick.
  advanceMinute(state: MatchState): number {
    if (state.phase === MatchPhase.TmoReview)  return 0;
    if (state.phase === MatchPhase.KickAtGoal) return 0;
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
    const redSteps: NarrationDescriptor['steps'] = [
      { kind: 'announcement', key: isFirstHalf ? 'clock_in_red_first_half' : 'clock_in_red_second_half' },
    ];
    if (!isFirstHalf && (state.engine.isDerby || state.engine.neutralVenue || state.engine.isPlayoffSemi)) {
      redSteps.push({ kind: 'tactic_note', cause: 'occasion_clock_in_red', chancePct: COMMENTARY_CHANCES.occasionClockInRed });
    }
    const narration: NarrationDescriptor = { steps: redSteps };
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
    this.emitEvent(redEvent);
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
    // Goal kicks (penalty / conversion) resolve in the KickAtGoal micro-phase,
    // whose tick handles the in-the-red period end itself (tickKickAtGoal) —
    // they never reach this check.
    return false;
  }

  triggerHalfTime(state: MatchState): void {
    // Apply all state mutations first so the single engine:stateChange emit
    // at the end shows a coherent post-HT frame (centre ball, 2H kicker in
    // possession, KickOff phase). Rugby rule: the team that didn't kick off
    // the first half kicks off the second.
    applyMatchEvent(state, { type: 'HALF_TIME_REACHED' });
    const secondHalfKicker: 'home' | 'away' =
      state.engine.firstHalfKicker === 'home' ? 'away' : 'home';
    applyMatchEvent(state, { type: 'POSSESSION_SET', side: secondHalfKicker });
    applyMatchEvent(state, { type: 'BALL_REPOSITIONED', x: 50, y: 50 });
    applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.KickOff });

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
    applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: htEvent });
    this.emitEvent(htEvent);
    this.emitStateChange(state);
  }

  async endMatch(state: MatchState): Promise<void> {
    applyMatchEvent(state, { type: 'MATCH_ENDED' });
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
    this.emitEvent(ftEvent);
    // Drain the streamer before signalling match-end so the result screen
    // doesn't replace the commentary feed mid-flush. Silent mode short-
    // circuits the streamer (no events enqueued), so drain is a no-op.
    if (!this.silent) await this.streamer.flush(state.engine.tickDelayMs, state);
    eventBus.emit('engine:finished', { state });
  }
}
