// Transfer-system tuning constants. Currently consumed by
// src/game/contractSeeder.ts (Phase 2 — read-only contract data) and
// reserved for future phases (cap enforcement, renewal flows, free-
// agent / approach modelling).
//
// Source for the wage tier anchors: 2025/26 RFU Premiership cap +
// 2020-21 RPA averages, surveyed in docs/transfer-system.md §2.
// Numbers are v1 baselines — refine when the market actually opens.

// Headline senior-squad cap (£). The marquee player's wage is
// excluded from this total. Shown dimmed on Phase 2's ContractsScreen;
// becomes interactive when Phase 3 lands.
export const SENIOR_CAP = 6_400_000;

// Map an overall rating (0-100) to a base annual wage band before any
// position-scarcity modifier or noise is applied. Linear interpolation
// between adjacent anchors. Marquee tier (rating >= 90) sits above
// the cap-friendly anchors — those signings are designed to be the
// excluded slot.
export const WAGE_BY_RATING: Array<{ rating: number; wage: number }> = [
  { rating: 60, wage:  30_000 },
  { rating: 70, wage:  60_000 },
  { rating: 75, wage:  90_000 },
  { rating: 80, wage: 140_000 },
  { rating: 85, wage: 240_000 },
  { rating: 88, wage: 360_000 },
  { rating: 90, wage: 480_000 },
  { rating: 93, wage: 620_000 },
  { rating: 96, wage: 780_000 },
];

// Position scarcity. Half-backs and tightheads command higher wages
// for the same rating because the league is shallow there.
export const POSITION_SCARCITY: Record<string, number> = {
  'Fly-Half':    1.20,
  'Scrum-Half':  1.10,
  'Hooker':      1.10,
  'Prop':        1.10,
  'Lock':        1.00,
  'Flanker':     1.00,
  'Number 8':    1.00,
  'Back Row':    1.00,
  'Centre':      1.00,
  'Wing':        1.00,
  'Fullback':    1.05,
  'Utility Back':1.00,
};

// Per-player wage noise, applied as a multiplier on the rating ×
// scarcity baseline. Tightens the variance vs the raw anchor table.
export const WAGE_NOISE = { min: 0.88, max: 1.12 };

// Contract-length distribution by age band. Numbers are cumulative
// probabilities — pick a uniform rngTransfer roll and find the first
// bucket it falls into.
export const CONTRACT_LENGTH = {
  under25: { p1: 0.10, p2: 0.40 },   // (rest) → 3yr
  age25to30: { p1: 0.20, p2: 0.60 }, // (rest) → 3yr
  age30plus: { p1: 0.50, p2: 0.80 }, // (rest) → 3yr
};

// Reputation seeding. Linear nudge from overall rating, with a marquee
// bonus to keep the top tier visibly elite. Clamped to [0, 100].
export const REPUTATION_SEED = {
  ratingMultiplier: 0.9,
  marqueeBonus: 8,
};

// End-of-season renewals (Phase 4 onward).
//
// `loyaltyDiscount`: a player's current club can re-sign them for this
//   fraction below their fresh-market wage and the player still accepts.
//   A cross-club poacher (Phase 6) won't get the discount and must pay
//   at least full market.
// `aiTargetCapUtilisation`: each AI club aims to keep cap usage at or
//   below this fraction of SENIOR_CAP when deciding renewals. If
//   renewing every expiring player would push the club over the
//   threshold, lowest-rated expiring players get released until cap
//   fits. Float so we can tune below 1.0 without going right to the
//   ceiling.
// `aiReleaseRatingFloor`: if an AI club has cap headroom, they renew
//   every expiring player who scores above this rating. Below it, the
//   player is at risk regardless of cap — keeps the league from
//   hoarding fringe pros forever.
export const RENEWAL = {
  loyaltyDiscount: 0.10,
  aiTargetCapUtilisation: 0.95,
  aiReleaseRatingFloor: 70,
};
