import type { MatchState, GameEvent } from '../types/match';
import { MatchPhase } from '../types/engine';
import type { NarrationDescriptor } from '../types/narration';
import { eventBus } from '../utils/eventBus';
import { rng } from '../utils/rng';
import { makeId } from './eventId';
import { applyMatchEvent } from './applyMatchEvent';
import { CLOCK_VALUES, COMMENTARY_CHANCES, EXTRA_TIME } from './balance';
import type { CommentaryStreamer } from './CommentaryStreamer';
import type { AnnouncementKey, AnnouncementParams } from '../types/narration';

// The clock-in-red target for the live period: 40 / 80 / 90 / 100.
function periodTargetMinute(state: MatchState): number {
  switch (state.clock.period) {
    case 'first':        return CLOCK_VALUES.halfTimeMinute;
    case 'second':       return CLOCK_VALUES.fullTimeMinute;
    case 'extra_first':  return CLOCK_VALUES.extraFirstMinute;
    case 'extra_second': return CLOCK_VALUES.extraSecondMinute;
  }
}

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
    const periodTarget = periodTargetMinute(state);
    if (state.clock.gameMinute < periodTarget) return;

    applyMatchEvent(state, { type: 'CLOCK_IN_RED_TRIPPED' });
    const isFirstHalf = state.clock.period === 'first';
    const redSteps: NarrationDescriptor['steps'] = [
      // Extra-time periods reuse the second-half "into overtime" line.
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

  // Opens the first extra-time period after a level full time. Mirrors
  // triggerHalfTime's centre-ball restart, but extra time plays in the
  // second-half attack direction throughout (halfTimeDone stays true — no
  // change of ends), so the World does not need a direction flip beyond the
  // kick-off reposition. ET1 is kicked off by the original first-half kicker
  // (alternating again from the second half, which the other side started).
  triggerExtraTime(state: MatchState): void {
    applyMatchEvent(state, { type: 'EXTRA_TIME_STARTED' });
    applyMatchEvent(state, { type: 'POSSESSION_SET', side: state.engine.firstHalfKicker });
    applyMatchEvent(state, { type: 'BALL_REPOSITIONED', x: 50, y: 50 });
    applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.KickOff });
    this.emitAnnounce(state, 'extra_time_start', CLOCK_VALUES.fullTimeMinute);
    this.emitStateChange(state);
  }

  // Turns ET1 → ET2. The other side (relative to ET1) kicks off the second
  // extra-time period.
  triggerExtraTimeHalf(state: MatchState): void {
    applyMatchEvent(state, { type: 'EXTRA_TIME_HALF_REACHED' });
    const et2Kicker: 'home' | 'away' = state.engine.firstHalfKicker === 'home' ? 'away' : 'home';
    applyMatchEvent(state, { type: 'POSSESSION_SET', side: et2Kicker });
    applyMatchEvent(state, { type: 'BALL_REPOSITIONED', x: 50, y: 50 });
    applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.KickOff });
    this.emitAnnounce(state, 'extra_time_half', CLOCK_VALUES.extraFirstMinute);
    this.emitStateChange(state);
  }

  // Kicking-competition fallback: only reached when the score is STILL level
  // after both extra-time periods. Each side takes `rounds` place-kicks (a
  // `makePct`% make roll on the outcome stream), then sudden-death rounds until
  // one side leads after an equal number of kicks. The match score is NOT
  // touched — the winner is recorded on state.engine.extraTimeWinner and the
  // season layer awards the tie from it.
  runKickingCompetition(state: MatchState): void {
    const { rounds, makePct } = EXTRA_TIME.kickComp;
    let home = 0;
    let away = 0;
    for (let i = 0; i < rounds; i++) {
      if (rng(1, 100) <= makePct) home++;
      if (rng(1, 100) <= makePct) away++;
    }
    while (home === away) {
      if (rng(1, 100) <= makePct) home++;
      if (rng(1, 100) <= makePct) away++;
    }
    const winner: 'home' | 'away' = home > away ? 'home' : 'away';
    applyMatchEvent(state, { type: 'EXTRA_TIME_WINNER_SET', side: winner });
    const winnerName = (winner === 'home' ? state.homeTeam : state.awayTeam).name;
    this.emitAnnounce(state, 'kicking_competition', CLOCK_VALUES.extraSecondMinute, {
      teamName: winnerName,
      homeScore: home,
      awayScore: away,
    });
  }

  // Shared builder for a period-transition / kicking-competition announcement.
  private emitAnnounce(state: MatchState, key: AnnouncementKey, gameMinute: number, params?: AnnouncementParams): void {
    const ev: GameEvent = {
      id: makeId(),
      gameMinute,
      phase: state.phase,
      side: state.possession,
      sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
      ballX: state.ball.x,
      ballY: state.ball.y,
      narration: { steps: [{ kind: 'announcement', key, params }] },
    };
    applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: ev });
    this.emitEvent(ev);
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
