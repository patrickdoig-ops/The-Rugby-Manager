// Tactic-driven modifiers applied across multiple phases (breakdown, kick,
// fatigue). The values are intentionally cross-cutting — one tactic setting
// (e.g. backfield count) affects line-break probability, box-kick fullback
// catch, and tactical-kick touch-finding all at once.
//
// Every entry here keys off a TeamTactics enum value. Outcome-driven
// bonuses (the previous CARRY_RESOLVED's outcome rather than a tactic
// choice) live in CARRY_HANDOFF_BONUSES in balance/breakdown.ts.

export const TACTIC_MODIFIERS = {
  backfieldLineBreakPenalty:  { three_back: -7,  two_back: -5,  one_back: 0 },
  // Line break gain bonus based on backfield cover. one_back has no cover and
  // concedes massive metres; three_back has a deep safety net and stops breaks early.
  backfieldLineBreakGainBonus: { three_back: -8, two_back: 0, one_back: 6 },
  // Breakdown attack evasion mod. This represents the presence (or absence)
  // of supporting runners in the backline, and therefore ONLY applies
  // during OpenPlayEvent when the team attempts to go wide (goWide = true).
  // - commit_numbers (-20): few players left on their feet, easily covered out wide.
  // - minimal_ruck (+22): massive numbers out wide to exploit space.
  // If the team keeps it tight (!goWide), this modifier is ignored entirely,
  // making minimal_ruck a flawed strategy for tight play (all the risk of losing
  // the ruck with none of the evasion reward).
  breakdownAttack:            { commit_numbers: -20, minimal_ruck: 22, balanced: 0 },
  breakdownDefend:            { shadow: 10, counter_ruck: -8, jackal: 0 },
  breakdownSupporterCount:    { commit_numbers: 4,  minimal_ruck: 2,  balanced: 3 },
  // Compensating bonus added to the BREAKDOWN attack score (ars) to offset
  // the supporter-count headcount deficit baked into the body-weights
  // stack ([1.0, 0.6, 0.4, 0.3] in BREAKDOWN_VALUES.bodyWeights). minimal_ruck
  // with 2 supporters produces ~80% of balanced's ruck score from the
  // stacked-bodies formula alone — enough to push penalty_defending
  // outcomes ~4× higher and bleed possession by ~7pp in the v2.179a
  // controlled mirror-match experiment (scripts/tacticsComboExperiment.ts).
  // The +6 here models "fewer ruckers but each one knows their role and
  // hits harder" — pulls minimal_ruck back to ~95% of balanced parity at
  // the ruck so the +35 evasion bonus on wide play can actually pay off.
  // commit_numbers stays at 0 — it already wins more rucks via the
  // headcount-driven body-weight stack, no further reward needed.
  breakdownArsMod:            { commit_numbers: 0,   minimal_ruck: 6,  balanced: 0 },
  // Territory bonuses for the `kicking` attacking gameplan. Wired into
  // TacticalKickEvent and resolveFiftyTwentyTwo so a team committed to a
  // kicking style gets:
  //   * Longer territory + clearance kicks from #10 (+5m to res.distance)
  //   * Higher deliberate 50:22 success rate (+8pp to baseSuccessPct)
  // Box kicks (#9) and goal kicks are unaffected — those are situational
  // calls that don't track a "we're going to play a kicking game" identity.
  // The +5m / +8pp magnitudes are tuned to bring the `kicking` plan out
  // of its slightly-negative margin (v2.181a controlled mirror match
  // measured -0.9 vs balanced) without making it dominant; expected
  // headline effect is ~+1.5 to +3 margin gain on a kicking-plan team.
  gamePlanKickDistanceBonus:  { possession: 0, balanced: 0, kicking: 5 },
  gamePlanFiftyTwentyTwoBonus:{ possession: 0, balanced: 0, kicking: 8 },
  // Trimmed in v2.181a — the controlled mirror-match experiment
  // (scripts/tacticsExperiment.ts) showed three_back giving home a +4.2
  // margin advantage over one_back, driven primarily by the kicking-game
  // dominance these three bonuses compound. Two_back stays at its
  // established mid-range values; three_back gets a smaller incremental
  // step over two_back so the choice between them turns on opposition
  // matchup, not raw effectiveness.
  boxKickFullbackBonus:       { three_back: 10, two_back: 8,  one_back: 0 },
  tacticalKickTouchReduction: { three_back: 18, two_back: 10, one_back: 0 },
  tacticalKickReturnBonus:    { three_back:  7, two_back: 5,  one_back: 0 },
  // Forward fatigue multiplier — applied per tick in StaminaSystem. Keyed
  // on three orthogonal tactic dimensions: attackingBreakdown (4-supporter
  // ruckers tire), defendingBreakdown (counter-rucking forwards tire), and
  // attackingGamePlan (possession-style teams that keep carrying into
  // contact tire). The three multiplications compound — a counter_ruck +
  // possession team would push 1.1 × 1.05 = 1.155×.
  //
  // possession: 1.05 added in v2.184a after the v2.181a controlled mirror
  // match showed possession at +3.8 margin vs balanced with NO defensive
  // cost. The 5% extra forward fatigue is the real-rugby trade-off for
  // running the ball through multiple phases — combines with the
  // gamePlanHandlingPressure knock-on penalty below.
  forwardFatigueMultiplier:   { commit_numbers: 1.1, counter_ruck: 1.1, possession: 1.05 },
  // Possession-style handling-error pressure. Added on top of
  // defensiveLineHandlingPressure when computing knockOnPct at each carry
  // / outside-back pass site in OpenPlayEvent. Models "carrying repeatedly
  // into contact creates more drop opportunities". 2pp is conservative —
  // with ~30 carries/match and a base ~5% knock-on rate, this generates
  // ~0.6 extra knock-ons per possession-side per match. Translates to
  // -1 to -1.5 PF/g, the second half of the possession-plan rebalance.
  gamePlanHandlingPressure:   { possession: 2, balanced: 0, kicking: 0 },
  // Penalty-rate shifts (in pct points) added to the matching base rate
  // in BREAKDOWN_PENALTIES / OBSTRUCTION_BASE_PCT. Modest values — these
  // dials nudge the trigger rate, they don't dominate it.
  // jackal contests body-position harder → more not-rolling-away risk, but
  // tuned down from +3 to +1 in v2.79a: the offender field puts the whole
  // penalty on the player attempting the turnover, and the previous +3 was
  // tanking top jackalers' post-match ratings hard enough to make them
  // invisible in the leaderboards despite high turnover counts.
  notRollingAwayDefendMod:    { jackal: 1,           counter_ruck: 0,  shadow: -2 },
  // commit_numbers puts more bodies into the ruck → more chance one of them
  // hits illegally; minimal_ruck commits fewer cleaners → less risk.
  dangerousCleanoutAttackMod: { commit_numbers: 2,   balanced: 0,      minimal_ruck: -1 },
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
  //    Tuned again in v2.103a from hybrid 0 to -2: the slice telemetry
  //    showed hybrid was conceding ~15% fewer points than blitz / drift
  //    with no offsetting downside, making it the strictly dominant
  //    defensive choice. Giving hybrid a small evasion penalty (~0.4
  //    extra line breaks per game) lets blitz / drift each retain their
  //    own identity (blitz: line speed costs metres on contact; hybrid:
  //    middle ground with a small line-break cost; drift: deep cover
  //    but soft in the channel) without making hybrid an outright trap.
  defensiveLineEvasionMod:    { blitz: -4, hybrid: -2, drift:  2 },
  // 2. Collision margin shift — blitz hits with momentum (more dominant
  //    tackles, gain-line carries pushed back); drift hits late and lateral
  //    (more play_on, more metres conceded on regular carries). Tuned in
  //    v2.72a from drift -5 to -8: the def×att matrix surfaced that drift
  //    was conceding only 8.83 m/carry vs hybrid's 9.90 — the line-break
  //    suppression dominated and drift's collision penalty wasn't kicking
  //    in enough. Making the collision mod harsher pushes drift firmly
  //    into "soft defence, gives ground per carry" territory.
  defensiveLineCollisionMod:  { blitz:  8, hybrid:  0, drift: -6 },
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
  // 7. Handling-gate pressure — pct points added to knockOnPct at
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
  // 10. Path-specific MODIFIERS on TIGHT attacking paths only — crash
  //     ball (set-piece strike #10 → #12) and hard carry (PhasePlay
  //     !goWide: scrum-half → carrier hits the line). Two parallel
  //     mods, one for collision (collisionDefend), one for evasion
  //     (defendMod on the line-break check). Both are added on top of
  //     the base defensiveLineCollisionMod / defensiveLineEvasionMod.
  //
  //     Why two mods on the same path: collision alone doesn't move
  //     PA enough because tries require LINE BREAKS in this engine
  //     (the line_break outcome is the only path that calls
  //     isTryScoredAt). A pure collision penalty just generates more
  //     dominantCarry metres that pile up against the try line
  //     without scoring. The matching evasion mod opens up line
  //     breaks on the tight paths so the cumulative metres convert
  //     into tries.
  //
  //     Captures the matchup asymmetry the additive-only model missed:
  //       * Blitz line speed CRUSHES tight predictable plays — collision
  //         positive on both paths. (No blitz evasion mod here today —
  //         blitz already concedes line breaks via the global
  //         defensiveLineEvasionMod = -4.)
  //       * Drift defenders are moving LATERALLY while the attacker is
  //         running FORWARD — they can't get square in time and the
  //         attacker wins the collision more often AND occasionally
  //         beats the line. Negative on collision AND negative on
  //         evasion (a chunk of which cancels drift's own global +2).
  //       * Hybrid stays at 0 — middle-ground identity preserved.
  //
  //     Wide / out-the-back paths get NO path modifier — the press is
  //     already exposed when the attack goes wide, so the base mod
  //     applies alone. This creates the rock-paper-scissors:
  //     blitz dominates vs tight / loses vs wide; drift opposite.
  //
  //     Wired in:
  //       * FirstPhaseEvent — crashBall mod when goCrashBall is true
  //       * OpenPlayEvent  — hardCarry mod when !goWide is true
  crashBallCollisionMod:      { blitz: 5, hybrid: 0, drift: -8 },
  hardCarryCollisionMod:      { blitz: 3, hybrid: 0, drift: -5 },
  // Drift's tight-path evasion penalties need to be large enough to
  // overcome the inherent low evasion of crash-ball carriers (#12,
  // forwards) — they have low agility/pace so the line-break threshold
  // is hard to clear regardless of defender mod. The magnitudes below
  // are sized so a drift defender on a tight path is materially worse
  // on evasion than even hybrid (drift base +2 minus -6 = -4 net on
  // crash; -2 net on hard carry).
  crashBallEvasionMod:        { blitz: 0, hybrid: 0, drift: -6 },
  hardCarryEvasionMod:        { blitz: 0, hybrid: 0, drift: -4 },
} as const;
