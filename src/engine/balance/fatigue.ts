// Tuning for player fatigue decay and the tiered attribute multipliers applied
// to currentStats as fatiguePct drops.
//
// Tiers ordered high → low. Each tier OVERWRITES prior tier values for any stat
// it lists; stats not listed in a later tier keep the previous tier's value.
// This matches the original hand-unrolled `if (f < 90) ... if (f < 80) ...` chain.

export const FATIGUE_SCALING = {
  decayRange: [4, 12],
  staminaDivisor: 150,
  tirednessThreshold: 50,
  computeIntervalMinutes: 5,
  tiers: [
    { threshold: 90, multipliers: { strength: 0.90 } },
    { threshold: 80, multipliers: { tackling: 0.80 } },
    { threshold: 70, multipliers: { pace: 0.75, agility: 0.75, handling: 0.80, discipline: 0.80, composure: 0.80, setPiece: 0.80, breakdown: 0.80, strength: 0.70 } },
    { threshold: 50, multipliers: { pace: 0.55, agility: 0.55, handling: 0.60, discipline: 0.60, composure: 0.60, setPiece: 0.60, breakdown: 0.60, strength: 0.50 } },
    { threshold: 30, multipliers: { pace: 0.35, agility: 0.35, handling: 0.40, discipline: 0.40, composure: 0.40, tackling: 0.40, setPiece: 0.30, breakdown: 0.30, strength: 0.30 } },
  ],
} as const;
