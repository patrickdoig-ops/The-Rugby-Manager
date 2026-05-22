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
  // Carry → breakdown handoff bonuses. Applied in BreakdownEvent by reading
  // the previous CARRY_RESOLVED's outcome. Both shift the breakdown's
  // attackScore upward (more clean ball) AND, for line breaks, the
  // next-phase carry's attackMod (front-foot follow-up). Tuned so a midfield
  // line break that doesn't directly score on the first carry still very
  // often turns into a try over the next 1-2 phases.
  dominantCarryBonus: 6,
  lineBreakBreakdownBonus: 15,
  // Penalty-rate shifts (in pct points) added to the matching base rate
  // in BREAKDOWN_PENALTIES / OBSTRUCTION_BASE_PCT. Modest values — these
  // dials nudge the trigger rate, they don't dominate it.
  // jackal contests body-position harder → more not-rolling-away risk.
  notRollingAwayDefendMod:    { jackal: 3,           counter_ruck: 0,  shadow: -2 },
  // pick_and_drive puts more bodies into the ruck → more chance one of them
  // hits illegally; wide_play commits fewer cleaners → less risk.
  dangerousCleanoutAttackMod: { pick_and_drive: 2,   balanced: 0,      wide_play: -1 },
  // wide moves rely on screening forwards in front of the receiver — more
  // chances of an obstruction call.
  obstructionStyleMod:        { keep_it_tight: -2,   balanced: 0,      wide_wide: 3 },
  // Note: offside_at_ruck has no tactic modifier today. Defensive tactics
  // (blitz / drift) are not yet in the codebase; the BreakdownEvent call
  // site adds `+ 0` with a TODO so a single line will plug in
  // offsideAtRuckDefendMod when those tactics arrive.
} as const;
