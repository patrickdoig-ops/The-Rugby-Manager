// Tactic-driven modifiers applied across multiple phases (breakdown, kick,
// fatigue). The values are intentionally cross-cutting — one tactic setting
// (e.g. backfield count) affects line-break probability, box-kick fullback
// catch, and tactical-kick touch-finding all at once.

export const TACTIC_MODIFIERS = {
  backfieldLineBreakPenalty:  { three_back: -10, two_back: -5,  one_back: 0 },
  breakdownAttack:            { pick_and_drive: -8, wide_play: 8,  balanced: 0 },
  breakdownDefend:            { shadow: 10, counter_ruck: -8, jackal: 0 },
  breakdownSupporterCount:    { pick_and_drive: 4,  wide_play: 2,  balanced: 3 },
  boxKickFullbackBonus:       { three_back: 15, two_back: 8,  one_back: 0 },
  tacticalKickTouchReduction: { three_back: 25, two_back: 15, one_back: 0 },
  tacticalKickReturnBonus:    { three_back: 10, two_back: 5,  one_back: 0 },
  forwardFatigueMultiplier:   { pick_and_drive: 1.1, counter_ruck: 1.1 },
  dominantCarryBonus: 6,
} as const;
