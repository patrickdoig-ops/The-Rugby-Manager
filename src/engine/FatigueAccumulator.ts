// Owns the per-tick fatigue accumulator and drains it in 5-minute (per
// FATIGUE_SCALING.computeIntervalMinutes) increments. Each drain computes a
// fatigue delta for every player on both teams via StaminaSystem.computeFatigue,
// applies FATIGUE_APPLIED through the mutation boundary, and emits a tiredness
// commentary GameEvent for any player crossing the tirednessThreshold.
//
// Home is computed before away — this ordering must not change without an
// equivalent regeneration of the determinism golden hash (npm run verify).

import type { MatchState, GameEvent } from '../types/match';
import { computeFatigue } from './StaminaSystem';
import { applyMatchEvent } from './applyMatchEvent';
import { makeId } from './eventId';
import { eventBus } from '../utils/eventBus';
import { FATIGUE_SCALING } from './balance';

export class FatigueAccumulator {
  private accumulator = 0;

  // `silent` matches headless AI fixtures — suppresses the newly-tired
  // commentary emit. The state mutations (FATIGUE_APPLIED, COMMENTARY_LOGGED)
  // still apply through the boundary so headless ratings and player stats stay
  // consistent with the live UI run.
  constructor(private state: MatchState, private silent: boolean = false) {}

  tick(timeAdvance: number): void {
    this.accumulator += timeAdvance;
    while (this.accumulator >= FATIGUE_SCALING.computeIntervalMinutes) {
      const homeFatigue = computeFatigue(this.state.homeTeam, this.accumulator);
      const awayFatigue = computeFatigue(this.state.awayTeam, this.accumulator);
      this.accumulator -= FATIGUE_SCALING.computeIntervalMinutes;
      for (const u of [...homeFatigue.updates, ...awayFatigue.updates]) {
        applyMatchEvent(this.state, {
          type: 'FATIGUE_APPLIED',
          player: u.player,
          newFatiguePct: u.newFatiguePct,
          newCurrentStats: u.newCurrentStats,
        });
      }

      for (const player of [...homeFatigue.newlyTired, ...awayFatigue.newlyTired]) {
        const fatEvent: GameEvent = {
          id: makeId(),
          gameMinute: this.state.clock.gameMinute,
          phase: this.state.phase,
          side: this.state.possession,
          sideName: this.state.possession === 'home' ? this.state.homeTeam.name : this.state.awayTeam.name,
          primaryPlayer: player,
          ballX: this.state.ball.x,
          ballY: this.state.ball.y,
          narration: { steps: [{ kind: 'announcement', key: 'fatigue_tiredness', primary: player }] },
        };
        applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: fatEvent });
        if (!this.silent) eventBus.emit('engine:event', { event: fatEvent });
      }
    }
  }
}
