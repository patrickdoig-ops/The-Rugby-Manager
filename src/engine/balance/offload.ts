// Offload tuning. Carriers heading into contact (no line break) may
// unload the ball to a position-matched supporting teammate. The catch
// gate is harder than a normal pass — the carrier is under pressure.
//
// FUTURE: attemptPct becomes attackTeam.tactics.offloadStrategy lookup
// (cautious / balanced / offload_freely) — same shape as
// HARD_CARRY_THRESHOLDS by attackingStyle.

export const OFFLOAD_VALUES = {
  attemptPct:              20,
  maxChain:                2,
  catchHandlingPenalty:    10,
  secondCarryAttackBonus:  10,
} as const;
