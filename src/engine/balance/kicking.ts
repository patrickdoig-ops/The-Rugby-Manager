// Tuning for every kind of kick: open-play kick-or-carry decision, restart
// kick-off, scrum-half box kick, fly-half tactical kick, goal kick, conversion,
// and penalty-kick distances.

export const KICK_PROBABILITIES = {
  possession: { own22: 50, ownHalf: 15, opposition: 0 },
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
} as const;

export const TACTICAL_KICK_VALUES = {
  goodKickThreshold:     25,
  goodKickDistance:      [30, 50],
  poorKickDistance:      [10, 20],
  goodKickOutOnFullProb: 0,
  poorKickOutOnFullProb: 30,
  goodKickTouchProb:     75,
  poorKickTouchProb:     30,
} as const;

export const GOAL_KICK_VALUES = {
  angleWeight:      0.3,
  composureWeight:  0.2,
  // Pass mark for resolveGoalKick: `kicking + composure*0.2 - angle*0.3 + rng(1,100)`.
  // Each +1 to the threshold ≈ −1pp success rate across the rng range, so this
  // dial is the cleanest league-wide accuracy lever. Calibrated to land the
  // top kicker (~95 kicking) around 80% and the league at ~75% conversions /
  // ~78% penalties — closer to Premiership real-world (~70% / ~78%) than the
  // 90%+ values we had at 120.
  successThreshold: 135,
} as const;

export const CONVERSION_VALUES = {
  distanceFromPostsWeight: 0.4,
} as const;

export const PENALTY_VALUES = {
  goalKickTryLineOffsetWeight:     0.2,
  goalKickDistanceFromPostsWeight: 0.3,
  kickToTouchDistance: 20,
} as const;

// Kick-return run gain (Step 2 in handleKickReturn): the carrier wins the
// run vs the chaser → `successfulRunMetres`; otherwise `failedRunMetres`.
// Each pair is [min, max] passed to `rng(min, max)`.
export const KICK_RETURN_VALUES = {
  successfulRunMetres: [3, 10],
  failedRunMetres:     [0, 3],
} as const;
