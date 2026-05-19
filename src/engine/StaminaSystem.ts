import type { Team } from '../types/team';
import type { Player, PlayerStats } from '../types/player';
import { clamp } from '../utils/math';
import { rng } from '../utils/rng';
import { FATIGUE_SCALING, TACTIC_MODIFIERS } from './balance';

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
  const { decayRange, staminaDivisor, tirednessThreshold, tiers } = FATIGUE_SCALING;
  const forwardMult = TACTIC_MODIFIERS.forwardFatigueMultiplier;

  for (const player of team.players) {
    const decayRate = rng(decayRange[0], decayRange[1]);
    const staminaBase = player.baseStats.stamina;
    let actualDecay = decayRate * (1 - staminaBase / staminaDivisor);
    if (player.id <= 8) {
      if (team.tactics.attackingBreakdown === 'pick_and_drive') actualDecay *= forwardMult.pick_and_drive;
      if (team.tactics.defendingBreakdown === 'counter_ruck')   actualDecay *= forwardMult.counter_ruck;
    }
    const prevFatigue = player.fatiguePct;
    const newFatiguePct = clamp(player.fatiguePct - actualDecay, 0, 100);
    if (prevFatigue >= tirednessThreshold && newFatiguePct < tirednessThreshold) {
      newlyTired.push(player);
    }

    const base = player.baseStats;
    const stats: PlayerStats = { ...base };

    // Tiers iterate high → low; each tier overwrites prior tier's value for any stat it lists.
    for (const tier of tiers) {
      if (newFatiguePct < tier.threshold) {
        for (const [stat, mult] of Object.entries(tier.multipliers) as [keyof PlayerStats, number][]) {
          stats[stat] = Math.round(base[stat] * mult);
        }
      }
    }

    const newCurrentStats = Object.fromEntries(
      Object.entries(stats).map(([k, v]) => [k, clamp(v as number, 1, 100)])
    ) as unknown as PlayerStats;

    updates.push({ player, newFatiguePct, newCurrentStats });
  }

  return { updates, newlyTired };
}
