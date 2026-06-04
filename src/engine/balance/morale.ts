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

  // Manager chat: diminishing returns (RNG + exponential decay per chat this season)
  // baseDelta = rngTransfer(chatBoostMin, chatBoostMax); delta = max(chatMinBoost, round(baseDelta × chatDecayFactor^chatCount))
  chatBoostMin: 6,          // first-chat minimum boost
  chatBoostMax: 14,         // first-chat maximum boost
  chatDecayFactor: 0.55,    // multiplier applied per prior chat this season
  chatMinBoost: 2,          // floor — chat never gives less than this

  // Inbox alert thresholds — item fires when morale drops below unhappyThreshold;
  // label escalates to "very unhappy" below veryUnhappyThreshold.
  unhappyThreshold: 35,
  veryUnhappyThreshold: 15,

  // Inbox playing-time diagnosis — player is "underplayed" when they are a
  // top-15 OVR starter and their appearance fraction falls below this threshold,
  // provided at least playingTimeMinGames have been played this season.
  playingTimeRatioThreshold: 0.4,
  playingTimeMinGames: 3,

  // Form-bias contribution in computeFormInputs
  // (morale − formNeutral) × formSlope, clamped to ±formCap.
  // At morale 100: (100-65)×0.086 ≈ 3.0; at morale 0: clamped to −3.
  formNeutral: 65,
  formSlope: 0.086,
  formCap: 3,

  // Transfer request thresholds (Feature 1.4)
  // Player must be at or below veryUnhappyThreshold for this many consecutive
  // rounds before a TRANSFER_REQUEST_SUBMITTED event fires.
  transferRequestStreak: 2,
  // Morale penalty applied when manager rejects a transfer request.
  transferRequestRejectPenalty: -8,
  // Morale penalty applied when a playing-time promise expires unmet.
  promiseBrokenPenalty: -15,

  // Loan-out morale impact (applied immediately when send-on-loan action fires).
  // Rank is OVR position within the club squad (1 = highest OVR).
  loanStarRank: 5,           // ranks 1–5 are "star" players
  loanStarDelta: -15,        // star player sent on loan — distraught
  loanFirstTeamDelta: -8,    // first-team regular (rank 6–15) sent on loan
  loanYoungAge: 24,          // age ≤ this counts as "young backup"
  loanYoungBackupBoost: 5,   // young backup pleased to get game time

  // New-game roster morale seed distribution (rosterSeeder).
  // Roll bracket = rngTransfer(0, 99); then roll morale value within bracket range.
  //   0..59  → OK        [seedOkMin..seedOkMax]        ~60%
  //   60..89 → Happy     [seedHappyMin..seedHappyMax]  ~30%
  //   90..97 → Unsettled [seedUnsMin..seedUnsMax]       ~8%
  //   98..99 → Unhappy   [seedBadMin..seedBadMax]       ~2%
  seedHappyCutoff: 60,
  seedUnsettledCutoff: 90,
  seedUnhappyCutoff: 98,
  seedOkMin: 56,    seedOkMax: 74,
  seedHappyMin: 80, seedHappyMax: 90,
  seedUnsMin: 40,   seedUnsMax: 54,
  seedBadMin: 22,   seedBadMax: 34,
} as const;
