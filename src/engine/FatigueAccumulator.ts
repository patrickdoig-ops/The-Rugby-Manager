// Owns the per-tick fatigue accumulator and drains it in 5-minute (per
// FATIGUE_SCALING.computeIntervalMinutes) increments. Each drain computes a
// fatigue delta for every player on both teams via StaminaSystem.computeFatigue
// and applies FATIGUE_APPLIED through the mutation boundary EVERY tick (gameplay
// and ratings depend on it). Players crossing the tirednessThreshold are buffered
// and their tiredness commentary is held until the coordinator calls flush() at a
// natural break in play (so a "tiring" line never interrupts open play).
//
// Home is computed before away — this ordering must not change without an
// equivalent regeneration of the determinism golden hash (npm run verify).

import type { MatchState, GameEvent } from '../types/match';
import type { Player } from '../types/player';
import { computeFatigue } from './StaminaSystem';
import { offFieldIds, onFieldPlayers } from './FieldPosition';
import { applyMatchEvent } from './applyMatchEvent';
import { makeId } from './eventId';
import { FATIGUE_SCALING } from './balance';
import type { CommentaryStreamer } from './CommentaryStreamer';

export class FatigueAccumulator {
  private accumulator = 0;
  // Players who crossed the tiredness threshold since the last flush, with the
  // side they were on, awaiting a natural break to announce. Insertion order
  // (home before away within a drain) is preserved for determinism.
  private pendingTired: Array<{ player: Player; side: 'home' | 'away' }> = [];

  // `silent` matches headless AI fixtures — suppresses the newly-tired commentary
  // streamer enqueue. The COMMENTARY_LOGGED still applies through the boundary at
  // flush so headless logs stay consistent. Events route through the streamer so
  // they pace evenly across the break beat.
  constructor(private state: MatchState, private silent: boolean, private streamer: CommentaryStreamer) {}

  tick(timeAdvance: number): void {
    this.accumulator += timeAdvance;
    while (this.accumulator >= FATIGUE_SCALING.computeIntervalMinutes) {
      const homeFatigue = computeFatigue(this.state.homeTeam, this.accumulator, offFieldIds(this.state, 'home'));
      const awayFatigue = computeFatigue(this.state.awayTeam, this.accumulator, offFieldIds(this.state, 'away'));
      this.accumulator -= FATIGUE_SCALING.computeIntervalMinutes;
      for (const u of [...homeFatigue.updates, ...awayFatigue.updates]) {
        applyMatchEvent(this.state, {
          type: 'FATIGUE_APPLIED',
          player: u.player,
          newFatiguePct: u.newFatiguePct,
          newCurrentStats: u.newCurrentStats,
        });
      }

      // Buffer newly-tired players; the commentary is emitted at the next break.
      for (const player of homeFatigue.newlyTired) this.pendingTired.push({ player, side: 'home' });
      for (const player of awayFatigue.newlyTired) this.pendingTired.push({ player, side: 'away' });
    }
  }

  // Emit the buffered tiredness commentary — called by the coordinator at a
  // natural break. Players who have since left the field (subbed / injured /
  // carded) are dropped so we never announce "X is tiring" for someone off.
  flush(): void {
    if (this.pendingTired.length === 0) return;
    const pending = this.pendingTired;
    this.pendingTired = [];
    for (const { player, side } of pending) {
      const team = side === 'home' ? this.state.homeTeam : this.state.awayTeam;
      if (!onFieldPlayers(team, this.state, side).includes(player)) continue;
      const fatEvent: GameEvent = {
        id: makeId(),
        gameMinute: this.state.clock.gameMinute,
        phase: this.state.phase,
        side,
        sideName: team.name,
        primaryPlayer: player,
        ballX: this.state.ball.x,
        ballY: this.state.ball.y,
        narration: { steps: [{ kind: 'announcement', key: 'fatigue_tiredness', primary: player }] },
      };
      applyMatchEvent(this.state, { type: 'COMMENTARY_LOGGED', event: fatEvent });
      if (!this.silent) this.streamer.enqueue(fatEvent);
    }
  }
}
