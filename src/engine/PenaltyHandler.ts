import type { MatchState, GameEvent } from '../types/match';
import { MatchPhase, type PenaltyChoice, type KickOffStrategy } from '../types/engine';
import type { StateMachine } from './StateMachine';
import { resolveGoalKick } from './resolvers/KickingResolver';
import { getCommentary } from './CommentaryEngine';
import { eventBus } from '../utils/eventBus';
import { clamp } from '../utils/math';
import { makeId } from './eventId';

export interface PenaltyHandlerDeps {
  state: MatchState;
  sm: StateMachine;
  humanSide: 'home' | 'away';
  attackDir: () => number;
  inOpposition22: () => boolean;
  inOppositionHalf: () => boolean;
  draftEvent: (phase: MatchPhase) => GameEvent;
  recalculateRatings: () => void;
}

export class PenaltyHandler {
  constructor(private deps: PenaltyHandlerDeps) {}

  async awaitKickOffStrategy(): Promise<KickOffStrategy> {
    const { state, humanSide } = this.deps;
    if (state.possession !== humanSide) {
      return 'high_ball';
    }
    state.isPaused = true;
    const choice = await new Promise<KickOffStrategy>(resolve => {
      eventBus.emit('engine:paused', {
        payload: { type: 'kickoff_choice', onChoice: (c) => resolve(c) },
      });
    });
    state.isPaused = false;
    eventBus.emit('engine:resumed', {});
    return choice;
  }

  async handlePenaltyDecision(): Promise<void> {
    const { state, humanSide, inOppositionHalf, inOpposition22 } = this.deps;

    // Only present the choice to the human manager and only when the penalty
    // is in the opposition's half. All other penalties auto-kick to touch.
    if (state.possession !== humanSide || !inOppositionHalf()) {
      const aiSide = humanSide === 'home' ? 'away' : 'home';
      const autoChoice =
        state.clockInTheRed && state.possession === aiSide && state.score[aiSide] > state.score[humanSide]
          ? 'tap_and_kick_dead'
          : 'kick_to_touch';
      this.applyPenaltyChoice(autoChoice);
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
            inOpposition22: inOpposition22(),
            attackingSide: state.possession,
            clockInTheRed: state.clockInTheRed,
            halfTimeDone: state.halfTimeDone,
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
    const { state, sm, attackDir, draftEvent, recalculateRatings } = this.deps;
    const attackTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
    const kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];

    if (choice === 'kick_for_goal') {
      const tryLine = !state.halfTimeDone
        ? (state.possession === 'home' ? 100 : 0)
        : (state.possession === 'home' ? 0 : 100);
      const distFromPosts = Math.abs(state.ballY - 50) * 0.3 + Math.abs(state.ballX - tryLine) * 0.2;
      const res = resolveGoalKick(kicker, distFromPosts);

      kicker.matchStats.kicksAtGoal++;
      if (res.success) kicker.matchStats.kicksMade++;
      else             kicker.matchStats.kicksMissed++;
      recalculateRatings();

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
          ? getCommentary({ ...draftEvent(MatchPhase.Penalty), primaryPlayer: kicker }, 'kick_for_goal')
          : getCommentary({ ...draftEvent(MatchPhase.Penalty), primaryPlayer: kicker }, 'miss'),
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
      if (state.clockInTheRed) state.penaltyKickToTouchLineout = true;
      state.ballX = clamp(state.ballX + attackDir() * 20, 5, 95);
      const penEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.gameMinute,
        phase: MatchPhase.Penalty,
        side: state.possession,
        sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
        primaryPlayer: kicker,
        ballX: state.ballX,
        ballY: state.ballY,
        commentary: getCommentary({ ...draftEvent(MatchPhase.Penalty), primaryPlayer: kicker }, 'kick_to_touch'),
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

    } else if (choice === 'tap_and_kick_dead') {
      const penEvent: GameEvent = {
        id: makeId(),
        gameMinute: state.gameMinute,
        phase: MatchPhase.Penalty,
        side: state.possession,
        sideName: (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
        primaryPlayer: kicker,
        ballX: state.ballX,
        ballY: state.ballY,
        commentary: getCommentary({ ...draftEvent(MatchPhase.Penalty), primaryPlayer: kicker }, 'tap_and_kick_dead'),
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
        primaryPlayer: kicker,
        ballX: state.ballX,
        ballY: state.ballY,
        commentary: getCommentary({ ...draftEvent(MatchPhase.Penalty), primaryPlayer: kicker }, 'tap_and_go'),
      };
      state.events.push(penEvent);
      eventBus.emit('engine:event', { event: penEvent });
      sm.forceTransition(MatchPhase.FirstPhase);
      state.phase = MatchPhase.FirstPhase;
    }

    eventBus.emit('engine:stateChange', { state });
  }
}
