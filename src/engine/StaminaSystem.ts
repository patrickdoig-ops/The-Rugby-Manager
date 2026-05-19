import type { Team } from '../types/team';
import type { Player, PlayerStats } from '../types/player';
import { clamp } from '../utils/math';
import { rng } from '../utils/rng';

export interface FatigueUpdate {
  player: Player;
  newFatiguePct: number;
  newCurrentStats: PlayerStats;
}

export interface FatigueResult {
  updates: FatigueUpdate[];
  newlyTired: Player[];
}

// Pure: computes the fatigue decay and updated currentStats for every player on the
// team but does not write to any Player field. The caller emits FATIGUE_APPLIED
// MatchEvents which apply through `applyMatchEvent`.
export function computeFatigue(team: Team, elapsedMinutes: number): FatigueResult {
  void elapsedMinutes; // signature kept for clarity at call site; the formula uses fixed RNG decay per call
  const updates: FatigueUpdate[] = [];
  const newlyTired: Player[] = [];

  for (const player of team.players) {
    const decayRate = rng(4, 12);
    const staminaBase = player.baseStats.stamina;
    let actualDecay = decayRate * (1 - staminaBase / 150);
    if (player.id <= 8) {
      if (team.tactics.attackingBreakdown === 'pick_and_drive') actualDecay *= 1.1;
      if (team.tactics.defendingBreakdown === 'counter_ruck')   actualDecay *= 1.1;
    }
    const prevFatigue = player.fatiguePct;
    const newFatiguePct = clamp(player.fatiguePct - actualDecay, 0, 100);
    if (prevFatigue >= 50 && newFatiguePct < 50) {
      newlyTired.push(player);
    }

    const base = player.baseStats;
    const f = newFatiguePct;
    const stats: PlayerStats = { ...base };

    if (f < 90) {
      stats.strength   = Math.round(base.strength   * 0.90);
    }
    if (f < 80) {
      stats.tackling   = Math.round(base.tackling   * 0.80);
    }
    if (f < 70) {
      stats.pace       = Math.round(base.pace       * 0.75);
      stats.agility    = Math.round(base.agility    * 0.75);
      stats.handling   = Math.round(base.handling   * 0.80);
      stats.discipline = Math.round(base.discipline * 0.80);
      stats.composure  = Math.round(base.composure  * 0.80);
      stats.setPiece   = Math.round(base.setPiece   * 0.80);
      stats.breakdown  = Math.round(base.breakdown  * 0.80);
      stats.strength   = Math.round(base.strength   * 0.70);
    }
    if (f < 50) {
      stats.pace       = Math.round(base.pace       * 0.55);
      stats.agility    = Math.round(base.agility    * 0.55);
      stats.handling   = Math.round(base.handling   * 0.60);
      stats.discipline = Math.round(base.discipline * 0.60);
      stats.composure  = Math.round(base.composure  * 0.60);
      stats.setPiece   = Math.round(base.setPiece   * 0.60);
      stats.breakdown  = Math.round(base.breakdown  * 0.60);
      stats.strength   = Math.round(base.strength   * 0.50);
    }
    if (f < 30) {
      stats.pace       = Math.round(base.pace       * 0.35);
      stats.agility    = Math.round(base.agility    * 0.35);
      stats.handling   = Math.round(base.handling   * 0.40);
      stats.discipline = Math.round(base.discipline * 0.40);
      stats.composure  = Math.round(base.composure  * 0.40);
      stats.tackling   = Math.round(base.tackling   * 0.40);
      stats.setPiece   = Math.round(base.setPiece   * 0.30);
      stats.breakdown  = Math.round(base.breakdown  * 0.30);
      stats.strength   = Math.round(base.strength   * 0.30);
    }

    const newCurrentStats = Object.fromEntries(
      Object.entries(stats).map(([k, v]) => [k, clamp(v as number, 1, 100)])
    ) as unknown as PlayerStats;

    updates.push({ player, newFatiguePct, newCurrentStats });
  }

  return { updates, newlyTired };
}
