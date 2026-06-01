import type { Team } from '../types/team';
import type { Player, PlayerStats } from '../types/player';
import { clamp } from '../utils/math';
import { rng } from '../utils/rng';
import { FATIGUE_SCALING, TACTIC_MODIFIERS } from './balance';
import { isForwardSlot } from './Slot';

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
//
// `offFieldIds` (sin-bin + sent-off) is passed in by the caller so off-field
// players don't accrue fatigue — they're not actually playing. Skipping the
// rng() call too is the deliberate choice: a benched player making no rolls
// shouldn't consume the outcome stream. Hashes shift when a card is issued
// in a determinism run; that's the correct behaviour change.
export function computeFatigue(team: Team, elapsedMinutes: number, offFieldIds?: Set<number>): FatigueResult {
  void elapsedMinutes; // signature kept for clarity at call site; the formula uses fixed RNG decay per call
  const updates: FatigueUpdate[] = [];
  const newlyTired: Player[] = [];
  const { decayRange, staminaDivisor, tirednessThreshold, tiers } = FATIGUE_SCALING;
  const forwardMult = TACTIC_MODIFIERS.forwardFatigueMultiplier;
  const backMult = TACTIC_MODIFIERS.backFatigueMultiplier;
  // Team-wide intensity multiplier — applied to every player (forwards and
  // backs) on top of the positional multipliers below. high drains faster,
  // light drains slower.
  const intensityMult = TACTIC_MODIFIERS.intensityFatigueMultiplier[team.tactics.intensity];

  for (const player of team.players) {
    if (offFieldIds?.has(player.id)) continue;
    const decayRate = rng(decayRange[0], decayRange[1]);
    const staminaBase = player.baseStats.stamina;
    let actualDecay = decayRate * (1 - staminaBase / staminaDivisor);
    if (isForwardSlot(player.id)) {
      if (team.tactics.attackingBreakdown === 'commit_numbers') actualDecay *= forwardMult.commit_numbers;
      if (team.tactics.defendingBreakdown === 'counter_ruck')   actualDecay *= forwardMult.counter_ruck;
      if (team.tactics.attackingGamePlan   === 'possession')    actualDecay *= forwardMult.possession;
    } else {
      // Backs (#9–#15) drain by team.tactics.defensiveLine: blitz adds 10 %
      // for the up-and-back motion, drift takes 5 % off the rate, hybrid is
      // neutral. Multiplier is 1.0 for hybrid so the no-op path stays cheap.
      actualDecay *= backMult[team.tactics.defensiveLine];
    }
    actualDecay *= intensityMult;
    const prevFatigue = player.fatiguePct;
    const newFatiguePct = clamp(player.fatiguePct - actualDecay, 0, 100);
    if (prevFatigue >= tirednessThreshold && newFatiguePct < tirednessThreshold) {
      newlyTired.push(player);
    }

    const base = player.baseStats;
    const newCurrentStats: PlayerStats = { ...base };

    // Tiers iterate high → low; each tier overwrites prior tier's value for any stat it lists.
    for (const tier of tiers) {
      if (newFatiguePct < tier.threshold) {
        for (const [stat, mult] of Object.entries(tier.multipliers) as [keyof PlayerStats, number][]) {
          newCurrentStats[stat] = clamp(Math.round(base[stat] * mult), 1, 100);
        }
      }
    }

    updates.push({ player, newFatiguePct, newCurrentStats });
  }

  return { updates, newlyTired };
}
