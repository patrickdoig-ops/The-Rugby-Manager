// Player morale balance constants.
//
// Morale (0-100) is a persistent per-roster-player value that responds to
// playing time, match results, and individual standout performances.
// It decays toward a neutral baseline each week and feeds into
// computeFormInputs as a clamped ±formCap bias (same magnitude as conditionCap).

import type { SquadStatusKey } from '../../types/player';

// Per-fixture morale penalty when a player didn't appear, keyed by their
// squad status. Replaces the legacy OVR-rank-based omittedTopDelta /
// benchedUnusedDelta constants.
export const SQUAD_STATUS_OMIT_PENALTY: Record<SquadStatusKey, number> = {
  star:      -6,
  firstTeam: -4,
  impact:    -2,
  squad:     -1,
  backup:     0,
};

// Seasonal starts / appearances thresholds that match each status. Used to
// detect playing-time pace mismatches (pro-rated against rounds played).
export const SQUAD_STATUS_THRESHOLDS: Record<SquadStatusKey, { minStarts: number; minApps: number }> = {
  star:      { minStarts: 14, minApps: 16 },
  firstTeam: { minStarts: 10, minApps: 12 },
  impact:    { minStarts:  0, minApps: 10 },
  squad:     { minStarts:  0, minApps:  5 },
  backup:    { minStarts:  0, minApps:  0 },
};

// Wage multiplier applied on top of the base WAGE_BY_RATING formula when
// generating renewal asking wages. Stars expect a premium; backups a discount.
export const SQUAD_STATUS_WAGE_MULT: Record<SquadStatusKey, number> = {
  star:      1.25,
  firstTeam: 1.10,
  impact:    1.00,
  squad:     0.92,
  backup:    0.85,
};

export const MORALE = {
  // Decay
  baseline: 65,         // morale drifts toward this value each week
  decayRate: 0.03,      // fraction of (baseline − morale) applied per WEEK_ADVANCED.
                        // Gentle enough that a sustained losing streak accumulates
                        // rather than being clawed back to baseline each week.

  // Match result deltas (applied to all non-injured squad members).
  // Asymmetric: a loss bites harder than a win lifts, so a sustained losing
  // run drives the team-talk average out of the "Steady" band into "Flat".
  winDelta: 3,
  drawDelta: 0,
  lossDelta: -6,

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

  // Weekly morale penalty applied when a player's actual playing-time pace
  // falls behind their status threshold and has done so for at least
  // statusMismatchWarningRounds rounds (minimum gate before penalty fires).
  statusMismatchWeeklyPenalty: -3,
  statusMismatchWarningRounds: 4,

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
  //   0..59  → OK    [seedOkMin..seedOkMax]      ~60%
  //   60..99 → Happy [seedHappyMin..seedHappyMax] ~40%
  seedHappyCutoff: 60,
  seedOkMin: 56,    seedOkMax: 74,
  seedHappyMin: 80, seedHappyMax: 90,
} as const;
