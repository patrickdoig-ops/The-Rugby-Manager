// Transfer-system tuning constants. Currently consumed by
// src/game/contractSeeder.ts (Phase 2 — read-only contract data) and
// reserved for future phases (cap enforcement, renewal flows, free-
// agent / approach modelling).
//
// Source for the wage tier anchors: 2025/26 RFU Premiership cap +
// 2020-21 RPA averages, surveyed in docs/transfer-system.md §2.
// Numbers are v1 baselines — refine when the market actually opens.

// Headline senior-squad cap (£). The marquee player's wage is
// excluded from this total. Effective spending power per club is
// `SENIOR_CAP + applicableCredits − marqueeWage` — see CAP_CREDITS.
export const SENIOR_CAP = 6_400_000;

// Dispensation pools that lift effective cap headroom for every club.
// Modelled flat per-club rather than per-player tagged: a v1 reflection
// of the real PRL rules (Home Grown / EPS / injury dispensations) just
// good enough to bring seeded squads inside their effective cap.
// Per-player HG/EPS tagging stays deferred (see docs/transfer-system.md).
export const CAP_CREDITS = {
  homeGrownPool: 600_000,   // up to £50k per player, up to 12 players
  epsPool:       400_000,   // up to £80k per player, up to 5 EPS internationals
  injuryPool:    400_000,   // injury-dispensation replacement allowance
};

// Total credit dispensation any club enjoys in v1 (sum of the three
// pools above). Effective cap = SENIOR_CAP + EFFECTIVE_CAP_CREDITS.
export const EFFECTIVE_CAP_CREDITS =
  CAP_CREDITS.homeGrownPool + CAP_CREDITS.epsPool + CAP_CREDITS.injuryPool;

// Map an overall rating (0-100) to a base annual wage band before any
// position-scarcity modifier or noise is applied. Linear interpolation
// between adjacent anchors. Marquee-tier wages (£600k+) are only
// reached via the excluded marquee slot; ordinary stars compress into
// the £350-550k band so a club can field two or three internationals
// inside the effective cap.
export const WAGE_BY_RATING: Array<{ rating: number; wage: number }> = [
  { rating: 60, wage:  30_000 },
  { rating: 70, wage:  60_000 },
  { rating: 75, wage:  90_000 },
  { rating: 80, wage: 130_000 },
  { rating: 85, wage: 200_000 },
  { rating: 88, wage: 280_000 },
  { rating: 90, wage: 360_000 },
  { rating: 93, wage: 460_000 },
  { rating: 96, wage: 560_000 },
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

// Per-club salary budgets for 2025/26 — the cap-relevant amount each
// owner is willing to spend on non-marquee wages. Differs from the
// league-wide effective cap (£7.8m), which is the absolute ceiling no
// club can exceed regardless of owner appetite. Sourced from real-world
// reporting of each club's 2025/26 spend.
//
// Midpoints of the published bands. Newcastle's £4.15m sits below the
// year-2+ floor; the floor only applies from 2026/27 onwards so the
// seed value stands for the opening season. The Red Bull takeover then
// lifts them at the year-1→year-2 rollover.
export const CLUB_SALARY_BUDGETS_2025_26: Record<string, number> = {
  bath:        7_750_000,
  bristol:     6_150_000,
  exeter:      6_500_000,
  gloucester:  6_100_000,
  harlequins:  6_700_000,
  leicester:   6_900_000,
  newcastle:   4_150_000,
  northampton: 6_500_000,
  sale:        7_500_000,
  saracens:    7_700_000,
};

// Year-on-year budget adjustment after each completed season.
//   nextBudget = clamp(
//     prevBudget
//       + (5.5 − finalLeaguePosition) × positionDelta
//       + (semiFinalist ? semiFinalBonus : 0)
//       + (champion    ? championBonus  : 0),
//     floor (from year 2 onwards),
//     EFFECTIVE_CAP
//   )
// `floor` is the RPA-mandated minimum salary spend from 2026/27. The
// 2025/26 seed values are not subject to it (Newcastle starts below).
// `positionDelta` of £100k means roughly £1m swing top-to-bottom — big
// enough to feel real over 3-4 seasons, small enough that the league
// doesn't reshape overnight.
export const BUDGET_VALUES = {
  floor:           5_400_000,
  positionDelta:     100_000,
  semiFinalBonus:    100_000,
  championBonus:     200_000,
};

// Club takeover (new investor / Red Bull style). +£1m to wage budget
// for the upcoming season, clamped at EFFECTIVE_CAP. Hardcoded for
// Newcastle Red Bulls at the year-1 → year-2 rollover; thereafter, each
// not-yet-taken-over club has `randomChancePct`% per rollover.
//
// At 4% per club, with 9 eligible clubs in year 3, expected ~0.4
// takeovers per year league-wide — a takeover roughly every 2-3
// seasons. Once a club is taken over they're permanently out of the
// pool.
export const TAKEOVER_VALUES = {
  boostAmount:           1_000_000,
  hardcodedYear2ClubId:  'newcastle',
  randomChancePct:       4,
};

// All synthesised wages floor at WAGE_FLOOR and round to the nearest
// WAGE_ROUNDING_UNIT, so the UI never shows £138,743 and seeded squads
// can't dip below the RPA rookie rate. WAGE_FLOOR is also the academy
// graduate's fixed starting wage (RPA rookie rate).
export const WAGE_FLOOR = 20_000;
export const WAGE_ROUNDING_UNIT = 5_000;

// Default contract length applied to generated personas (academy
// graduates + foreign imports). Matches the RPA rookie length and a
// simple default for incoming foreign deals — long enough to settle,
// short enough to bring the player back to the market regularly.
export const PERSONA_CONTRACT_LENGTH_YEARS = 2;

// Reputation seed band for generated personas (academy + imports).
// Linear in target overall: rep = clamp(targetOverall × ratingMultiplier,
// [min, max]). Distinct from REPUTATION_SEED (which seeds the JSON
// roster at game start with a slightly higher multiplier + marquee
// bonus) — academy graduates aren't yet famous, hence the lower band.
export const PERSONA_REPUTATION = {
  ratingMultiplier: 0.7,
  min: 25,
  max: 60,
};

// Fallback ages used by contractSeeder.pickLength when a player's JSON
// has no dob. Above the seniorRating threshold the heuristic assumes a
// veteran; otherwise a mid-career player. Only fires on legacy seed
// data — every persona-generated player carries a dob.
export const LENGTH_HEURISTIC_AGE = {
  seniorRating: 85,
  seniorAge: 28,
  defaultAge: 25,
};

// AI signing policy for the free-agent + cross-club poaching windows
// (Phases 5-6). Pure policy parameters — no RNG involved.
//
//   capTarget: cap-utilisation ceiling per club for new signings.
//     0.92 means an AI club stops signing once 92% of effective cap is
//     committed, leaving headroom for in-season needs.
//   perClubLimit: hard cap on signings per window per club. Real clubs
//     typically add 3-6 players in a summer; 4 keeps any one AI from
//     hoovering the free-agent pool.
//   targetPerPosition: minimum positional spread the AI aims for. Once
//     a club has this many at a position group the need bonus drops to
//     zero and the AI prioritises elsewhere.
//   positionNeedWeight: how much each unmet positional slot adds to a
//     candidate's signing score (overall + need × weight). 10 keeps a
//     thin position from being skipped over a one-point OVR gap.
export const AI_SIGNING_POLICY = {
  capTarget: 0.92,
  perClubLimit: 4,
  targetPerPosition: 2,
  positionNeedWeight: 10,
};
