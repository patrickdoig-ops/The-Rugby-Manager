import type { MatchState, GameEvent } from '../types/match';
import { MatchPhase, type PenaltyChoice, type KickOffStrategy } from '../types/engine';
import { resolveGoalKick } from './resolvers/KickingResolver';
import { eventBus } from '../utils/eventBus';
import { clamp } from '../utils/math';
import { makeId } from './eventId';
import { attackDir, inOpposition22, inOppositionHalf, metresFromOppositionTryLine, pickKicker } from './FieldPosition';
import { applyMatchEvent } from './applyMatchEvent';
import { PENALTY_VALUES, TAP_AND_GO_AI } from './balance';
import { rng } from '../utils/rng';
import type { CommentaryStreamer } from './CommentaryStreamer';

export interface PenaltyHandlerDeps {
  state: MatchState;
  humanSide: 'home' | 'away';
  // Silent mode (headless AI fixture): never prompt; resolve with the same
  // defaults the determinism harness uses (`high_ball` / `kick_for_goal`).
  silent?: boolean;
  // Events route through the streamer so they pace evenly across the tick.
  streamer: CommentaryStreamer;
}

export class PenaltyHandler {
  constructor(private deps: PenaltyHandlerDeps) {}

  async awaitKickOffStrategy(): Promise<KickOffStrategy> {
    const { state, humanSide, silent } = this.deps;
    if (silent || state.possession !== humanSide) {
      return 'high_ball';
    }
    const wasRunning = state.engine.isRunning;
    const choice = await new Promise<KickOffStrategy>(resolve => {
      eventBus.emit('engine:paused', {
        payload: { type: 'kickoff_choice', onChoice: (c) => resolve(c) },
      });
    });
    if (wasRunning) eventBus.emit('engine:resumed', {});
    return choice;
  }

  async handlePenaltyDecision(): Promise<void> {
    const { state, humanSide, silent } = this.deps;

    // Silent mode is used for telemetry, the determinism harness, and the
    // headless AI fixtures inside `recordPlayerMatchResult`. The auto-choice
    // must be symmetric for both sides — until v2.48a this branch was
    // gated on `state.possession === humanSide`, and since `humanSide`
    // defaults to 'home' in silent fixtures, that meant home auto-kicked at
    // goal in opposition half (3 pts) while away auto-kicked to touch
    // (defensive lineout). Across the 90-fixture round-robin telemetry
    // that asymmetry produced ~3 percentage points of structural home-win
    // bias on top of the documented HOME_ADVANTAGE channel.
    if (silent) {
      const opposingSide = state.possession === 'home' ? 'away' : 'home';
      let autoChoice: PenaltyChoice;
      if (inOppositionHalf(state)) {
        // 5-10m from the try line: defenders are unset, a quick tap goes
        // for the 7-point shot instead of the certain 3 from a goal kick.
        const dist = metresFromOppositionTryLine(state);
        const inTapZone = dist >= TAP_AND_GO_AI.closeRangeMinMetres && dist <= TAP_AND_GO_AI.closeRangeMaxMetres;
        autoChoice = (inTapZone && rng(1, 100) <= TAP_AND_GO_AI.closeRangePct) ? 'tap_and_go' : 'kick_for_goal';
      } else if (state.clock.clockInTheRed && state.score[state.possession] > state.score[opposingSide]) {
        autoChoice = 'tap_and_kick_dead';
      } else {
        autoChoice = 'kick_to_touch';
      }
      this.applyPenaltyChoice(autoChoice);
      return;
    }

    // Live mode: prompt the human only when they have a penalty in opposition
    // half. The AI side stays defensive (kick to touch, with a clock-burn
    // exception when leading late) — this human-vs-AI asymmetry is by
    // design (the AI is intentionally less aggressive than the manager).
    if (state.possession !== humanSide || !inOppositionHalf(state)) {
      const aiSide = humanSide === 'home' ? 'away' : 'home';
      let autoChoice: PenaltyChoice;
      if (state.clock.clockInTheRed && state.possession === aiSide && state.score[aiSide] > state.score[humanSide]) {
        autoChoice = 'tap_and_kick_dead';
      } else if (state.possession === aiSide && inOppositionHalf(state)) {
        // AI side attacking: normally kick to touch, but in the 5-10m close
        // range take the occasional tap-and-go shot at a 7-point try with
        // the defence unset (same probability as the silent-mode branch).
        const dist = metresFromOppositionTryLine(state);
        const inTapZone = dist >= TAP_AND_GO_AI.closeRangeMinMetres && dist <= TAP_AND_GO_AI.closeRangeMaxMetres;
        autoChoice = (inTapZone && rng(1, 100) <= TAP_AND_GO_AI.closeRangePct) ? 'tap_and_go' : 'kick_to_touch';
      } else {
        autoChoice = 'kick_to_touch';
      }
      this.applyPenaltyChoice(autoChoice);
      return;
    }

    // state.lastPenalty is set by the PENALTY_AWARDED reducer before the phase
    // transitions to Penalty; reaching the modal without one is a programming
    // error (the assert keeps the bus boundary honest about what it sends).
    const last = state.lastPenalty;
    if (!last) throw new Error('PenaltyHandler: state.lastPenalty unset when entering Penalty phase');

    const wasRunning = state.engine.isRunning;
    const choice = await new Promise<PenaltyChoice>(resolve => {
      eventBus.emit('engine:paused', {
        payload: {
          type: 'penalty_choice',
          context: {
            phase: state.phase,
            ballX: state.ball.x,
            ballY: state.ball.y,
            inOpposition22: inOpposition22(state),
            attackingSide: state.possession,
            clockInTheRed: state.clock.clockInTheRed,
            halfTimeDone: state.clock.halfTimeDone,
            offence: last.offence,
            offenderName: `${last.offender.firstName} ${last.offender.lastName}`,
            offenderPosition: last.offender.position,
          },
          onChoice: (c) => resolve(c),
        },
      });
    });
    if (wasRunning) eventBus.emit('engine:resumed', {});
    if (!state.engine.isRunning) return;
    this.applyPenaltyChoice(choice);
  }

  private emit(name: 'engine:event' | 'engine:stateChange', payload: { event: GameEvent } | { state: MatchState }): void {
    if (this.deps.silent) return;
    // engine:stateChange is paired by the streamer with every flushed event;
    // we only need to forward engine:event emissions through it.
    if (name === 'engine:event') this.deps.streamer.enqueue((payload as { event: GameEvent }).event);
  }

  private applyPenaltyChoice(choice: PenaltyChoice): void {
    const { state } = this.deps;
    const attackTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
    const kicker = pickKicker(attackTeam, state, state.possession);

    if (choice === 'kick_for_goal') {
      const tryLine = !state.clock.halfTimeDone
        ? (state.possession === 'home' ? 100 : 0)
        : (state.possession === 'home' ? 0 : 100);
      const distFromPosts = Math.abs(state.ball.y - 50) * PENALTY_VALUES.goalKickDistanceFromPostsWeight
                          + Math.abs(state.ball.x - tryLine) * PENALTY_VALUES.goalKickTryLineOffsetWeight;
      const res = resolveGoalKick(kicker, distFromPosts);

      const side = state.possession;
      applyMatchEvent(state, { type: 'PENALTY_GOAL_KICKED', kicker, side, success: res.success });
      applyMatchEvent(state, { type: 'RATINGS_RECALCULATED' });

      const penEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.clock.gameMinute,
        phase: MatchPhase.Penalty,
        side: state.possession,
        sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
        primaryPlayer: kicker,
        ballX: state.ball.x,
        ballY: state.ball.y,
        narration: {
          steps: [{
            kind: 'phase_outcome',
            phase: MatchPhase.Penalty,
            key: res.success ? 'kick_for_goal' : 'miss',
            primary: kicker,
          }],
        },
      };
      applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: penEvent });
      this.emit('engine:event', { event: penEvent });

      applyMatchEvent(state, { type: 'POSSESSION_SWAPPED' });
      applyMatchEvent(state, { type: 'BALL_REPOSITIONED', x: 50, y: 50 });
      applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.KickOff });

    } else if (choice === 'kick_to_touch') {
      if (state.clock.clockInTheRed) {
        applyMatchEvent(state, { type: 'PENALTY_KICK_TO_TOUCH_FLAG_SET', value: true });
      }
      applyMatchEvent(state, {
        type: 'BALL_REPOSITIONED',
        x: clamp(state.ball.x + attackDir(state) * PENALTY_VALUES.kickToTouchDistance, 5, 95),
      });
      const penEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.clock.gameMinute,
        phase: MatchPhase.Penalty,
        side: state.possession,
        sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
        primaryPlayer: kicker,
        ballX: state.ball.x,
        ballY: state.ball.y,
        narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Penalty, key: 'kick_to_touch', primary: kicker }] },
      };
      applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: penEvent });
      this.emit('engine:event', { event: penEvent });

      const teamName = (state.possession === 'home' ? state.homeTeam : state.awayTeam).name;
      const awardEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.clock.gameMinute,
        phase: MatchPhase.Lineout,
        side: state.possession,
        sideName: teamName,
        ballX: state.ball.x,
        ballY: state.ball.y,
        narration: { steps: [{ kind: 'announcement', key: 'set_piece_award', params: { phaseName: 'Lineout', teamName } }] },
      };
      applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: awardEvent });
      this.emit('engine:event', { event: awardEvent });

      applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.Lineout });

    } else if (choice === 'tap_and_kick_dead') {
      const penEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.clock.gameMinute,
        phase: MatchPhase.Penalty,
        side: state.possession,
        sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
        primaryPlayer: kicker,
        ballX: state.ball.x,
        ballY: state.ball.y,
        narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Penalty, key: 'tap_and_kick_dead', primary: kicker }] },
      };
      applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: penEvent });
      this.emit('engine:event', { event: penEvent });
      applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.Lineout });

    } else {
      // tap_and_go
      const penEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.clock.gameMinute,
        phase: MatchPhase.Penalty,
        side: state.possession,
        sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
        primaryPlayer: kicker,
        ballX: state.ball.x,
        ballY: state.ball.y,
        narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Penalty, key: 'tap_and_go', primary: kicker }] },
      };
      applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: penEvent });
      this.emit('engine:event', { event: penEvent });
      applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.FirstPhase });
    }

    this.emit('engine:stateChange', { state });
  }
}
