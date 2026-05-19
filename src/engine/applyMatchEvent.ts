import type { MatchState } from '../types/match';
import type { MatchEvent } from '../types/matchEvent';
import { clamp } from '../utils/math';
import { attackDir } from './FieldPosition';
import { computeRating } from './RatingEngine';

// The single function permitted to mutate MatchState (or any Player field).
// Every handler / orchestrator builds an array of MatchEvent and routes them
// through here. In-place mutation; returns void.

export function applyMatchEvent(state: MatchState, event: MatchEvent): void {
  switch (event.type) {

    // ── Scoring ──────────────────────────────────────────────────────────
    case 'TRY_SCORED':
      event.scorer.matchStats.tries++;
      state.score[event.side] += 5;
      state.stats.tries[event.side]++;
      return;

    case 'CONVERSION_KICKED':
      event.kicker.matchStats.kicksAtGoal++;
      if (event.success) {
        event.kicker.matchStats.kicksMade++;
        state.score[event.side] += 2;
      } else {
        event.kicker.matchStats.kicksMissed++;
      }
      return;

    case 'PENALTY_GOAL_KICKED':
      event.kicker.matchStats.kicksAtGoal++;
      if (event.success) {
        event.kicker.matchStats.kicksMade++;
        state.score[event.side] += 3;
      } else {
        event.kicker.matchStats.kicksMissed++;
      }
      return;

    // ── Carry / tackle ──────────────────────────────────────────────────
    case 'CARRY_RESOLVED': {
      const { carrier, defender, metres, direction, outcome, defSide } = event;
      carrier.matchStats.carries++;
      carrier.matchStats.metresCarried += metres;
      defender.matchStats.tacklesAttempted++;
      state.stats.tackles[defSide].attempted++;
      state.ball.x = clamp(state.ball.x + direction * metres, 0, 100);
      switch (outcome) {
        case 'line_break':
          carrier.matchStats.lineBreaks++;
          carrier.matchStats.defendersBeaten++;
          break;
        case 'dominant_carry':
          carrier.matchStats.defendersBeaten++;
          defender.matchStats.tacklesMade++;
          state.stats.tackles[defSide].made++;
          break;
        case 'dominant_tackle':
          defender.matchStats.tacklesMade++;
          defender.matchStats.dominantTackles++;
          state.stats.tackles[defSide].made++;
          break;
        case 'play_on':
          defender.matchStats.tacklesMade++;
          state.stats.tackles[defSide].made++;
          break;
      }
      return;
    }

    // ── Errors / turnovers ──────────────────────────────────────────────
    case 'KNOCK_ON':
      event.player.matchStats.knockOns++;
      state.stats.handlingErrors[event.attackSide]++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      state.breakdownMod = { attack: 0, defend: 0 };
      return;

    case 'TURNOVER_AT_BREAKDOWN':
      event.jackal.matchStats.turnoversWon++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      state.breakdownMod = { attack: 0, defend: 0 };
      return;

    case 'PENALTY_CONCEDED_AT_BREAKDOWN':
      event.player.matchStats.penaltiesConceded++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      state.breakdownMod = { attack: 0, defend: 0 };
      return;

    // ── Passing / breakdown bookkeeping ─────────────────────────────────
    case 'PASS_COMPLETED':
      event.passer.matchStats.passes++;
      return;

    case 'BREAKDOWN_HIT':
      for (const p of event.players) p.matchStats.rucksHit++;
      return;

    case 'BREAKDOWN_MOD_SET':
      state.breakdownMod = { attack: event.attack, defend: event.defend };
      return;

    // ── Set piece ───────────────────────────────────────────────────────
    case 'LINEOUT_THROWN':
      event.hooker.matchStats.lineoutThrows++;
      return;

    case 'LINEOUT_RESOLVED':
      switch (event.outcome) {
        case 'crooked_throw':
          // possession flips to the non-throwing team (scrum awarded)
          break;
        case 'clean_catch':
          event.hooker.matchStats.lineoutWins++;
          event.attackJumper.matchStats.lineoutCatches++;
          state.stats.lineouts[event.possessionSideAfter]++;
          break;
        case 'scrappy_knock_on':
          state.stats.handlingErrors[event.attackSide]++;
          break;
        case 'steal':
          event.defendJumper.matchStats.lineoutSteals++;
          state.stats.lineouts[event.possessionSideAfter]++;
          break;
      }
      state.possession = event.possessionSideAfter;
      return;

    case 'SCRUM_RESOLVED':
      switch (event.outcome) {
        case 'attacking_dominant_penalty':
          event.attackFrontRow.forEach(p => { p.matchStats.scrumPenaltiesWon++; });
          event.defendFrontRow.forEach(p => { p.matchStats.scrumPenaltiesConceded++; });
          state.stats.scrums[event.possessionSideAfter]++;
          break;
        case 'stable_win':
          state.stats.scrums[event.possessionSideAfter]++;
          break;
        case 'wheel':
          break;
        case 'defending_dominant_penalty':
          event.defendFrontRow.forEach(p => { p.matchStats.scrumPenaltiesWon++; });
          event.attackFrontRow.forEach(p => { p.matchStats.scrumPenaltiesConceded++; });
          state.stats.scrums[event.possessionSideAfter]++;
          break;
      }
      state.possession = event.possessionSideAfter;
      return;

    // ── Kicking ─────────────────────────────────────────────────────────
    case 'KICK_FROM_HAND':
      event.kicker.matchStats.kicksFromHand++;
      event.kicker.matchStats.kickMetres += event.metres;
      return;

    case 'BALL_REPOSITIONED':
      if (event.x !== undefined) state.ball.x = event.x;
      if (event.y !== undefined) state.ball.y = event.y;
      return;

    case 'KICK_RETURN_CARRIER_SET':
      state.kickReturnCarrier = event.player;
      return;

    // ── Possession & phase ──────────────────────────────────────────────
    case 'POSSESSION_SWAPPED':
      state.possession = state.possession === 'home' ? 'away' : 'home';
      return;

    case 'POSSESSION_SET':
      state.possession = event.side;
      return;

    case 'PHASE_CHANGED':
      state.phase = event.phase;
      return;

    // ── Clock & period ──────────────────────────────────────────────────
    case 'CLOCK_ADVANCED': {
      const halfTarget = state.clock.halfTimeDone ? 80 : 40;
      if (state.clock.clockInTheRed) {
        state.clock.gameMinute += event.delta / 2;
      } else {
        state.clock.gameMinute = Math.min(halfTarget, state.clock.gameMinute + event.delta);
      }
      return;
    }

    case 'CLOCK_IN_RED_TRIPPED':
      state.clock.clockInTheRed = true;
      return;

    case 'HALF_TIME_REACHED':
      state.clock.halfTimeDone = true;
      state.clock.clockInTheRed = false;
      state.clock.penaltyKickToTouchLineout = false;
      return;

    case 'MATCH_ENDED':
      state.engine.isRunning = false;
      return;

    case 'PENALTY_KICK_TO_TOUCH_FLAG_SET':
      state.clock.penaltyKickToTouchLineout = event.value;
      return;

    // ── Tick bookkeeping ────────────────────────────────────────────────
    case 'TICK_BOOKKEEPING':
      state.stats.possession[event.possessionSide]++;
      state.stats.territory[event.territorySide]++;
      return;

    case 'HANDLING_ERROR':
      state.stats.handlingErrors[event.side]++;
      return;

    // ── Fatigue ─────────────────────────────────────────────────────────
    case 'FATIGUE_APPLIED':
      event.player.fatiguePct = event.newFatiguePct;
      event.player.currentStats = { ...event.newCurrentStats };
      return;

    // ── Tactics & subs ──────────────────────────────────────────────────
    case 'TACTICS_UPDATED': {
      const team = event.side === 'home' ? state.homeTeam : state.awayTeam;
      team.tactics = { ...event.tactics };
      return;
    }

    case 'SUBSTITUTION_APPLIED': {
      const team = event.teamSide === 'home' ? state.homeTeam : state.awayTeam;
      const { off, on, benchIdx, fieldIdx } = event;
      on.id = off.id;
      on.x = off.x;
      on.y = off.y;
      team.players[fieldIdx] = on;
      team.bench.splice(benchIdx, 1);
      team.substitutedOff.push(off);
      return;
    }

    // ── Engine lifecycle ────────────────────────────────────────────────
    case 'IS_RUNNING_SET':
      state.engine.isRunning = event.value;
      return;

    case 'IS_PAUSED_SET':
      state.engine.isPaused = event.value;
      return;

    case 'TICK_DELAY_SET':
      state.engine.tickDelayMs = event.value;
      return;

    // ── Ratings ─────────────────────────────────────────────────────────
    case 'RATINGS_RECALCULATED':
      for (const p of state.homeTeam.players) p.rating = computeRating(p);
      for (const p of state.awayTeam.players) p.rating = computeRating(p);
      return;

    // ── Commentary feed ─────────────────────────────────────────────────
    case 'COMMENTARY_LOGGED':
      state.events.push(event.event);
      if (state.events.length > 300) state.events.splice(0, state.events.length - 300);
      return;

    default: {
      // Exhaustiveness check — TS will error here if a new MatchEvent type is added
      // without a case above.
      const _exhaustive: never = event;
      void _exhaustive;
      return;
    }
  }
}

// Convenience: apply many events in order. Phase handlers / orchestrators that build
// a queue typically pass it through this to avoid `for` loops at every call site.
export function applyMatchEvents(state: MatchState, events: MatchEvent[]): void {
  for (const e of events) applyMatchEvent(state, e);
}

// `attackDir` is re-exported for handler code that needs the direction at the moment
// it builds CARRY_RESOLVED. Keeps the import surface in handler files tidy.
export { attackDir };
