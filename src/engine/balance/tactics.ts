// Tactic-driven modifiers applied across multiple phases (breakdown, kick,
// fatigue). The values are intentionally cross-cutting — one tactic setting
// (e.g. backfield count) affects line-break probability, box-kick fullback
// catch, and tactical-kick touch-finding all at once.
//
// Every entry here keys off a TeamTactics enum value. Outcome-driven
// bonuses (the previous CARRY_RESOLVED's outcome rather than a tactic
// choice) live in CARRY_HANDOFF_BONUSES in balance/breakdown.ts.

export const TACTIC_MODIFIERS = {
  backfieldLineBreakPenalty:  { three_back: -10, two_back: -5,  one_back: 0 },
  breakdownAttack:            { pick_and_drive: -8, wide_play: 8,  balanced: 0 },
  breakdownDefend:            { shadow: 10, counter_ruck: -8, jackal: 0 },
  breakdownSupporterCount:    { pick_and_drive: 4,  wide_play: 2,  balanced: 3 },
  boxKickFullbackBonus:       { three_back: 15, two_back: 8,  one_back: 0 },
  tacticalKickTouchReduction: { three_back: 25, two_back: 15, one_back: 0 },
  tacticalKickReturnBonus:    { three_back: 10, two_back: 5,  one_back: 0 },
  forwardFatigueMultiplier:   { pick_and_drive: 1.1, counter_ruck: 1.1 },
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
  // Defensive line (blitz / hybrid / drift) — three-way effect on the carry
  // duel, plus the offside-at-ruck rate.
  //
  // 1. Evasion margin shift — blitz starts further forward so an attacker
  //    that beats the press has more room; drift sits deeper so the line
  //    break threshold is harder to clear.
  defensiveLineEvasionMod:    { blitz: -8, hybrid:  0, drift:  5 },
  // 2. Collision margin shift — blitz hits with momentum (more dominant
  //    tackles, gain-line carries pushed back); drift hits late and lateral
  //    (more play_on, more metres conceded on regular carries).
  defensiveLineCollisionMod:  { blitz:  8, hybrid:  0, drift: -5 },
  // 3. Line break gain bonus — when a line break HAPPENS, blitz cover is
  //    behind the runner and concedes more metres; drift cover is wide
  //    and shallow and chases laterally.
  defensiveLineBreakBonus:    { blitz: 10, hybrid:  0, drift: -5 },
  // 4. Offside-at-ruck rate (plugs the existing TODO in BreakdownEvent).
  //    Pct points added to BREAKDOWN_PENALTIES.offsideAtRuckBasePct.
  offsideAtRuckDefendMod:     { blitz:  6, hybrid:  2, drift: -2 },
  // 5. Back-position fatigue multiplier. Backs running the blitz line up
  //    and dropping back ~25 times a half drain faster than backs sitting
  //    in a drift. Applied per-tick in StaminaSystem for player.id >= 9.
  backFatigueMultiplier:      { blitz: 1.10, hybrid: 1.00, drift: 0.95 },
  // 6. Tactical-kick touch-finding shift vs the OPPOSING side's defensive
  //    line. Blitz cover sprints forward so the kicker has more grass to
  //    aim at behind the rush; drift cover sits deeper and shrinks that
  //    space. Pct points added to res.touchProbability in handleTacticalKick.
  defensiveLineKickProbMod:   { blitz: 10, hybrid: 0, drift: -5 },
} as const;
