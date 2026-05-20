import type { MatchState, GameEvent } from '../types/match';
import { MatchPhase, type PenaltyChoice, type KickOffStrategy } from '../types/engine';
import { resolveGoalKick } from './resolvers/KickingResolver';
import { eventBus } from '../utils/eventBus';
import { clamp } from '../utils/math';
import { makeId } from './eventId';
import { attackDir, inOpposition22, inOppositionHalf } from './FieldPosition';
import { applyMatchEvent } from './applyMatchEvent';
import { PENALTY_VALUES } from './balance';

export interface PenaltyHandlerDeps {
  state: MatchState;
  humanSide: 'home' | 'away';
  // Silent mode (headless AI fixture): never prompt; resolve with the same
  // defaults the determinism harness uses (`high_ball` / `kick_for_goal`).
  silent?: boolean;
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

    // Only present the choice to the human manager and only when the penalty
    // is in the opposition's half. All other penalties auto-kick to touch.
    // Silent mode auto-kicks at goal whenever the human would otherwise be
    // prompted, matching the determinism harness behaviour.
    if (silent || state.possession !== humanSide || !inOppositionHalf(state)) {
      let autoChoice: PenaltyChoice;
      if (silent && state.possession === humanSide && inOppositionHalf(state)) {
        autoChoice = 'kick_for_goal';
      } else {
        const aiSide = humanSide === 'home' ? 'away' : 'home';
        autoChoice =
          state.clock.clockInTheRed && state.possession === aiSide && state.score[aiSide] > state.score[humanSide]
            ? 'tap_and_kick_dead'
            : 'kick_to_touch';
      }
      this.applyPenaltyChoice(autoChoice);
      return;
    }

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
          },
          onChoice: (c) => resolve(c),
        },
      });
    });
    if (wasRunning) eventBus.emit('engine:resumed', {});
    this.applyPenaltyChoice(choice);
  }

  private emit(name: 'engine:event' | 'engine:stateChange', payload: { event: GameEvent } | { state: MatchState }): void {
    if (this.deps.silent) return;
    if (name === 'engine:event') eventBus.emit('engine:event', payload as { event: GameEvent });
    else eventBus.emit('engine:stateChange', payload as { state: MatchState });
  }

  private applyPenaltyChoice(choice: PenaltyChoice): void {
    const { state } = this.deps;
    const attackTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
    const kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];

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
