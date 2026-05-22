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
  //    break threshold is harder to clear. Tuned in v2.68a from blitz -8
  //    to -4 to halve the blitz line-break frequency. Tuned again in
  //    v2.69a from drift +5 to +2: the controlled per-team experiment
  //    (scripts/defensiveLineCompare.ts on Bath, v2.68a) showed drift
  //    was the bigger outlier from "balanced" — Bath as drift won 92 %
  //    of its season vs hybrid's 79 % vs blitz's 71 %. Drift was
  //    conceding only 1.92 line breaks per game (well under hybrid's
  //    2.81 and well below realism). Halving the safety lifts drift
  //    back into low-risk-but-not-invulnerable territory.
  defensiveLineEvasionMod:    { blitz: -4, hybrid:  0, drift:  2 },
  // 2. Collision margin shift — blitz hits with momentum (more dominant
  //    tackles, gain-line carries pushed back); drift hits late and lateral
  //    (more play_on, more metres conceded on regular carries). Tuned in
  //    v2.72a from drift -5 to -8: the def×att matrix surfaced that drift
  //    was conceding only 8.83 m/carry vs hybrid's 9.90 — the line-break
  //    suppression dominated and drift's collision penalty wasn't kicking
  //    in enough. Making the collision mod harsher pushes drift firmly
  //    into "soft defence, gives ground per carry" territory.
  defensiveLineCollisionMod:  { blitz:  8, hybrid:  0, drift: -8 },
  // 3. Line break gain bonus — when a line break HAPPENS, blitz cover is
  //    behind the runner and concedes more metres; drift cover is wide
  //    and shallow and chases laterally. Tuned in v2.67a from blitz +10
  //    to +5: the v2.66a pressure mechanism (knock-ons + interceptions)
  //    couldn't offset the original +10 penalty, so blitz teams sat at
  //    the bottom of the table even though dominant_tackles + pick rate
  //    were correctly elevated.
  defensiveLineBreakBonus:    { blitz:  5, hybrid:  0, drift: -5 },
  // 4. Offside-at-ruck rate (plugs the existing TODO in BreakdownEvent).
  //    Pct points added to BREAKDOWN_PENALTIES.offsideAtRuckBasePct.
  offsideAtRuckDefendMod:     { blitz:  6, hybrid:  2, drift: -2 },
  // 5. Back-position fatigue multiplier. Backs running the blitz line up
  //    and dropping back ~25 times a half drain faster than backs sitting
  //    in a drift. Applied per-tick in StaminaSystem for player.id >= 9.
  //    Tuned in v2.70a from { blitz: 1.10, drift: 0.95 } (15 pp spread)
  //    to { blitz: 1.05, drift: 0.97 } (8 pp spread). The controlled
  //    experiment (defensiveLineCompare, Bath, v2.69a) showed roughly half
  //    of drift's win-rate advantage was actually an *attacking* bonus
  //    via fresher backs, not a defensive bonus — back-fatigue was
  //    compounding the defensive tactic into attack output. Asymmetry
  //    kept (blitz costs slightly more than drift saves) — real-world
  //    blitz drains backs faster than drift conserves them.
  backFatigueMultiplier:      { blitz: 1.05, hybrid: 1.00, drift: 0.97 },
  // 6. Tactical-kick touch-finding shift vs the OPPOSING side's defensive
  //    line. Blitz cover sprints forward so the kicker has more grass to
  //    aim at behind the rush; drift cover sits deeper and shrinks that
  //    space. Pct points added to res.touchProbability in handleTacticalKick.
  defensiveLineKickProbMod:   { blitz: 10, hybrid: 0, drift: -5 },
  // 7. Handling-gate pressure — pct points added to knockOnThreshold at
  //    every pass site in OpenPlayEvent / FirstPhaseEvent. Blitz hurries
  //    the receiver onto the ball; drift gives the receiver time. Lifts
  //    knock-on rate uniformly across the carrier / fly-half / outside-back
  //    chain. Net effect for blitz at +4: ~2 extra knock-ons per side per
  //    match. Drift tuned in v2.72a from -2 to -4 so drift defenders
  //    force noticeably fewer fumbles — drift is the conservative,
  //    pressure-light option in the lineup.
  defensiveLineHandlingPressure: { blitz: 4, hybrid: 0, drift: -4 },
  // 8. Per-pass interception rate shift (in pct points) added to
  //    INTERCEPTION_BASE_PCT. Defender intercepts; possession flips and the
  //    interceptor runs through KickReturn with a +12 breakdownMod.attack
  //    front-foot boost. Calibrated so blitz teams collect ~1 interception
  //    per side per match, drift teams almost never.
  interceptionMod:            { blitz: 1.0, hybrid: 0, drift: -0.3 },
  // 9. Multiplier on CARRY_HANDOFF_BONUSES.lineBreak when the previous
  //    play was a line break against THIS defensive line. Models how
  //    quickly the broken defence regroups for the next phase. The
  //    immediate line-break gain (defensiveLineBreakBonus) already
  //    captures the metres-on-the-break — this damps the cascade so a
  //    blitz line break isn't double-counted into the next phase's
  //    handoff. Drift's lateral cover takes the normal time to recover
  //    so it doesn't get the dampener. Without this, blitz teams were
  //    overpunished by the line-break-handoff compounding: one line
  //    break ≈ one try because the cover-out-of-position effect was
  //    fired twice (once on the break, once on the chain).
  lineBreakChainMultiplier:   { blitz: 0.5, hybrid: 1.0, drift: 1.0 },
  // 10. Path-specific collision bonuses for blitz on TIGHT attacking
  //     paths only. Blitz line speed crushes the two predictable
  //     inside plays — crash ball (set-piece strike #10 → #12) and
  //     hard carry (PhasePlay !goWide: scrum-half → carrier hits the
  //     line) — before they can build momentum. Added on top of the
  //     base defensiveLineCollisionMod.
  //
  //     Wide / out-the-back paths get NO path bonus — the press is
  //     already exposed when the attack goes wide, so the base mod
  //     applies alone.
  //
  //     Wired in:
  //       * FirstPhaseEvent — crashBall bonus when goCrashBall is true
  //       * OpenPlayEvent  — hardCarry bonus when !goWide is true
  //
  //     Hybrid / drift stay at 0 — their identity is the lateral cover
  //     and the safer-line trade-off, not the inside collision.
  crashBallCollisionBonus:    { blitz: 5, hybrid: 0, drift: 0 },
  hardCarryCollisionBonus:    { blitz: 3, hybrid: 0, drift: 0 },
} as const;
