// Tuning for every kind of kick: open-play kick-or-carry decision, restart
// kick-off, scrum-half box kick, fly-half tactical kick, goal kick, conversion,
// and penalty-kick distances.

export const KICK_PROBABILITIES = {
  possession: { own22: 66, ownHalf: 40, opposition: 15 },
  kicking:    { own22: 90, ownHalf: 65, opposition: 15 },
  balanced:   { own22: 75, ownHalf: 50, opposition: 10 },
} as const;

export const KICK_OFF_VALUES = {
  goodKickThreshold:     35,
  catchKnockOnThreshold: 30,
  shortKickRetainProb:   30,
  shortKickRetainMargin: -5,
  shortKickClearMargin:  10,
  highBall: { good: [25, 40], poor: [15, 25] },
  short:    { good: [10, 20], poor: [4, 9], autoPoorIfUnder: 10 },
  grubber:  { good: [15, 25], poor: [4, 9] },
} as const;

export const BOX_KICK_VALUES = {
  veryGoodKickThreshold:     75,
  uncontestedCatchThreshold: 35,
  contestClearMargin:        10,
  veryGoodKickDistance:      20,
  poorKickFarDistance:       30,
  poorKickShortDistance:     8,
  // Touch-finder (long_and_off clearance) success probability — kicker's
  // `kicking` stat shifted by `touchFinderKickerStatOffset` then clamped
  // to [touchFinderMinPct, touchFinderMaxPct]. A weak scrum-half can
  // still miss touch; an elite kicker tops out below certainty.
  touchFinderKickerStatOffset: -10,
  touchFinderMinPct:           20,
  touchFinderMaxPct:           85,
} as const;

export const TACTICAL_KICK_VALUES = {
  goodKickThreshold:     75,
  goodKickDistance:      [30, 50],
  poorKickDistance:      [10, 20],
  goodKickOutOnFullProb: 5,
  poorKickOutOnFullProb: 30,
  goodKickTouchProb:     75,
  poorKickTouchProb:     30,
} as const;

// Deliberate 50/22 attempt math. Used when KickDecisionDirector routes a
// family='fifty_22' decision to TacticalKickResolver. Success requires the
// ball to bounce in field and into touch inside the opposition 22, so the
// defending team's backfield count is the dominant gate (more backs deep
// = less grass to aim at). Modulated by the kicker's `kicking` stat
// (pivoted at 70 — average kicker is break-even; top kicker +12pp, weak
// kicker −12pp).
export const FIFTY_22_VALUES = {
  // Base success percent by defender backfield posture. One back deep
  // leaves both wings up — clearest 50/22 lane. Three backs deep cover
  // both corners — almost no chance.
  baseSuccessPct: { one_back: 35, two_back: 18, three_back: 6 },
  // Kicker stat modifier — pivoted at 70 with 0.4pp per stat point.
  kickerStatPivot:  70,
  kickerStatWeight: 0.4,
  // Failure-mode split when the deliberate 50/22 doesn't succeed. The kick
  // STILL travels (the kicker aimed at touch) but either misses opp 22
  // (touch elsewhere → opposition lineout) or doesn't reach touch at all
  // (caught in field → KickReturn).
  failureMissTouchPct: 50,
  // Distance the 50/22 attempt covers when it doesn't succeed (still a
  // good kick, just didn't land in the corner).
  attemptDistance: [35, 55],
  // Clamp on the final success percent — keeps an elite kicker against
  // a one-back backfield from approaching certainty, and an average
  // kicker against a three-back backfield from dropping to ~0.
  successPctMin: 1,
  successPctMax: 85,
} as const;

// Advanced-mode 50:22 accuracy bonus. In advanced tactics the flat gameplan
// bonus is replaced by one derived from the zone's 50:22 kick-type weight —
// committing more of your kick mix to 50:22 in a zone means you execute it
// better there. Linear in the weight (0–100), clamped. weight 25 ≈ +3pp,
// weight ≥67 ≈ +8pp. Tunable; preset matches keep the flat
// gamePlanFiftyTwentyTwoBonus table instead.
export const FIFTY_22_COMMITMENT = { weightFactor: 0.12, maxBonus: 8 } as const;

export const GOAL_KICK_VALUES = {
  angleWeight:      0.3,
  composureWeight:  0.2,
  // Pass mark for resolveGoalKick: `kicking + composure*0.2 - angle*0.3 + rng(1,100)`.
  // Each +1 to the threshold ≈ −1pp success rate across the rng range, so this
  // dial is the cleanest league-wide accuracy lever. Calibrated to land the
  // top kicker (~95 kicking) around 80% and the league at ~75% conversions /
  // ~75% penalties — closer to league real-world (~70% / ~78%) than the
  // 90%+ values we had at 120. Lowered 135→133 when lateral ball movement went
  // live: penalties are now taken from realistic (wider) angles and tries land
  // at the swept position, so the mean make-rate needed re-centring back to
  // baseline while the new angle variance (wide harder, central easier) stays.
  successThreshold: 133,
} as const;

export const CONVERSION_VALUES = {
  distanceFromPostsWeight: 0.4,
} as const;

export const PENALTY_VALUES = {
  goalKickTryLineOffsetWeight:     0.2,
  goalKickDistanceFromPostsWeight: 0.3,
} as const;

// Penalty kick to touch. From a penalty, the kicking team retains the
// throw at the resulting lineout — anywhere on the field, not just
// inside their own 22 (which is the rule for kicks from open play).
// The only failure mode is missing touch entirely: the ball stays in
// field and the opposition counter-attacks via KickReturn.
//
// Distance scales with kicker quality (kicker.kicking + rng(1,20) vs
// goodKickThreshold = 25 — same threshold as tactical kicks, so most
// #10s clear it comfortably). Touch probability gates whether the
// deliberate corner kick actually finds the sideline.
//
// Replaced the pre-v2.183a flat 20m teleport (kickToTouchDistance: 20)
// which gave every kicker the same gain regardless of stat. The new
// expected distance of ~32-35m matches real-world league data
// for attacking penalty kicks to the corner.
export const PENALTY_KICK_TO_TOUCH_VALUES = {
  goodKickThreshold: 75,
  goodKickDistance:  [25, 45],
  poorKickDistance:  [10, 20],
  goodKickTouchPct:  90,    // clinical kick — finds touch 9 times out of 10
  poorKickTouchPct:  40,    // poor kick — over half stay in field
  gimmeTouchPct:     99,    // inside the opposition 22 — a short kick to the
                            // corner is virtually guaranteed to find touch
} as const;

// Kick-return run gain (Step 2 in handleKickReturn): the carrier wins the
// run vs the chaser → `successfulRunMetres`; otherwise `failedRunMetres`.
// Each pair is [min, max] passed to `rng(min, max)`.
export const KICK_RETURN_VALUES = {
  successfulRunMetres: [3, 10],
  failedRunMetres:     [0, 3],
} as const;

// Attacking kicks from #10 in / near the opposition half. Two sub-types:
// CROSS-FIELD — high deep kick to opposite-side wing for an aerial contest.
// Success depends on the chasing winger's pace + handling vs the covering
// fullback / opposite winger, plus the kicker's accuracy.
// GRUBBER — low rolling kick through the defensive line. Success depends
// on a bouncing-ball roll plus the chaser's pace beating the defender.
// Each base table is { attackerWinsPct, deadPct }. Defender wins the rest.
// Kicker stat modifier shifts the attacker-wins share (±10pp at the edges).
export const ATTACKING_KICK_VALUES = {
  crossField: {
    distance:           [25, 40],
    attackerWinsBase:   28,   // attacker catches in air
    deadBase:           12,   // knock-on / out the side
    kickerStatPivot:    75,
    kickerStatWeight:   0.4,
  },
  grubber: {
    distance:           [8, 18],
    attackerWinsBase:   22,
    deadBase:           18,   // ball goes dead or out
    kickerStatPivot:    70,
    kickerStatWeight:   0.3,
  },
  // Shared clamp on attacker-wins percent after kicker-stat modifier.
  // Stops an elite kicker against weak cover from approaching certainty
  // and a poor kicker against the back three from dropping to zero.
  attackerWinsMinPct: 5,
  attackerWinsMaxPct: 60,
} as const;
