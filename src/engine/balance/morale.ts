// Player morale balance constants.
//
// Morale (0-100) is a persistent per-roster-player value that responds to
// playing time, match results, and individual standout performances.
// It decays toward a neutral baseline each week and feeds into
// computeFormInputs as a clamped ±formCap bias (same magnitude as conditionCap).

export const MORALE = {
  // Decay
  baseline: 65,         // morale drifts toward this value each week
  decayRate: 0.05,      // fraction of (baseline − morale) applied per WEEK_ADVANCED

  // Playing-time deltas (per fixture, relative to OVR rank within the club)
  omittedTopDelta: -4,      // top-15 OVR in club squad, didn't take the field
  benchedUnusedDelta: -2,   // OVR rank 16-23 in club squad, didn't take the field

  // Match result deltas (applied to all non-injured squad members)
  winDelta: 3,
  drawDelta: 0,
  lossDelta: -3,

  // Individual standout performance boost
  standoutRatingThreshold: 8.0,
  standoutDelta: 5,

  // Inbox "have a chat" CTA boost
  chatBoostDelta: 10,

  // Inbox alert threshold — item fires when morale drops below this
  unhappyThreshold: 35,

  // Form-bias contribution in computeFormInputs
  // (morale − formNeutral) × formSlope, clamped to ±formCap.
  // At morale 100: (100-65)×0.086 ≈ 3.0; at morale 0: clamped to −3.
  formNeutral: 65,
  formSlope: 0.086,
  formCap: 3,
} as const;
