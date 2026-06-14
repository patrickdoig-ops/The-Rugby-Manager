// Two rating systems:
// 1. RATING_WEIGHTS — the post-match performance rating (1–10), derived from
//    in-match events (tries, line breaks, tackles, knock-ons, …) plus
//    position-specific bonuses.
// 2. PLAYER_OVERALL_WEIGHTS — the player's career overall (0–100), a
//    position-weighted average of the 12 baseStats; used in pre-match displays
//    and team summaries, never mutated in-match.

export const RATING_WEIGHTS = {
  base: 6.0,
  // Performance contributions are scaled by 1/divisor on top of `base`. A
  // lower divisor widens the spread around the 6.0 baseline so a standout
  // season tops out around 8.5 (the best handful of players reach 8s) while a
  // quiet game still sits near 6.0 — calibrated against the season avg-rating
  // leaderboard (top ≈ 8.5, p50 ≈ 6.5, floor ≈ 5.1). See docs/match-engine.md.
  divisor: 5.4,
  min: 1.0,
  max: 10.0,
  universal: {
    tries:               7.0,
    lineBreaks:          1.2,
    defendersBeaten:     0.8,
    turnoversWon:        3.5,
    dominantTackles:     2.0,
    tacklesMade:         0.35,
    kicksMade:           1.0,
    metresCarried:       0.05,
    knockOns:            -1.5,
    missedTacklePerMiss: -0.5,
    penaltiesConceded:   -1.2,
    kicksMissed:         -0.75,
    yellowCards:         -5.0,   // a yellow tanks the rating — proportional to 10 min off
    redCards:           -15.0,   // a red is a match-ruining offence
  },
  position: {
    hooker:    { lineoutWinRateBaseline: 0.75, lineoutBonusMultiplier: 25, tryDiscount: 3.5 },
    locks:     { lineoutCatch: 2.0, lineoutSteal: 4.5 },
    frontRow:  { scrumPenaltyWon: 2.5, scrumPenaltyConceded: -2.5 },
    backRow:   { extraTurnoverWon: 3.5, carry: 0.5 },
    scrumHalf: { passes: 0.05 },
    flyHalf:   { kicksFromHand: 0.25 },
    backThree: { extraLineBreak: 0.5 },
  },
} as const;

// Per-position multipliers applied over the 12 baseStats when computing an
// ability-based overall rating (`playerOverall` in RatingEngine.ts). Higher
// weight = the stat matters more for that position. Missing stats default to
// 1.0. The helper normalises by the sum of weights so output stays on the
// 0–100 scale that the simple-mean version produced.
import type { Position, PlayerStats } from '../../types/player';

type StatWeights = Partial<Record<keyof PlayerStats, number>>;

// Forwards: kicking weight = 0 (no kicking skill expected — see IRRELEVANT_STATS
// below). Backs: setPiece weight = 0 (no scrum/lineout skill expected).

const PROP_WEIGHTS: StatWeights = {
  setPiece: 2.0, strength: 2.0, breakdown: 1.5, tackling: 1.5, stamina: 1.2,
  pace: 0.2, agility: 0.2, kicking: 0, handling: 0.6,
};
const HOOKER_WEIGHTS: StatWeights = {
  setPiece: 2.0, breakdown: 1.5, tackling: 1.5, strength: 1.3, handling: 1.1,
  kicking: 0, pace: 0.3,
};
const LOCK_WEIGHTS: StatWeights = {
  setPiece: 2.0, strength: 1.8, tackling: 1.4, breakdown: 1.2, stamina: 1.2,
  pace: 0.25, agility: 0.25, kicking: 0, handling: 0.7,
};
const FLANKER_WEIGHTS: StatWeights = {
  breakdown: 2.0, tackling: 1.8, stamina: 1.5, strength: 1.2, pace: 0.9,
  positioning: 1.2, setPiece: 0.7, kicking: 0,
};
const NUMBER_8_WEIGHTS: StatWeights = {
  strength: 1.8, breakdown: 1.6, tackling: 1.4, handling: 1.3, stamina: 1.3,
  pace: 0.7, setPiece: 0.8, kicking: 0,
};
const SCRUM_HALF_WEIGHTS: StatWeights = {
  handling: 2.0, pace: 1.5, composure: 1.5, positioning: 1.4, agility: 1.3,
  kicking: 1.2, setPiece: 0, strength: 0.3, breakdown: 0.7,
};
const FLY_HALF_WEIGHTS: StatWeights = {
  kicking: 2.0, composure: 1.8, handling: 1.6, positioning: 1.4, discipline: 1.2,
  pace: 0.8, setPiece: 0, strength: 0.3, breakdown: 0,
};
const CENTRE_WEIGHTS: StatWeights = {
  tackling: 1.6, pace: 1.5, handling: 1.5, strength: 1.3, agility: 1.2,
  positioning: 1.2, setPiece: 0, kicking: 0.8, breakdown: 0.9,
};
const WING_WEIGHTS: StatWeights = {
  pace: 2.0, agility: 1.6, handling: 1.4, positioning: 1.2, composure: 1.1,
  setPiece: 0, strength: 0.7, kicking: 0.6, breakdown: 0.3,
};
const FULLBACK_WEIGHTS: StatWeights = {
  positioning: 1.8, kicking: 1.6, handling: 1.4, pace: 1.4, composure: 1.4,
  setPiece: 0, strength: 0.6, breakdown: 0.3,
};

// Utility Back uses unit weights (simple mean) — they fill anywhere on the bench.
const UTILITY_WEIGHTS: StatWeights = {};

// Stats that don't belong to a position's skillset at all — weight 0 in the
// OVR formula above, so they never affect a player's overall. Forwards have no
// kicking skill; backs have no scrum/lineout skill. Read by the UI
// (PlayerProfileScreen greys these out on the radar). Their authored values in
// docs/team-data.md are flavour only.
export const IRRELEVANT_STATS: Record<Position, (keyof PlayerStats)[]> = {
  'Prop':         ['kicking'],
  'Hooker':       ['kicking'],
  'Lock':         ['kicking'],
  'Flanker':      ['kicking'],
  'Number 8':     ['kicking'],
  'Back Row':     ['kicking'],
  'Scrum-Half':   ['setPiece'],
  'Fly-Half':     ['setPiece'],
  'Centre':       ['setPiece'],
  'Wing':         ['setPiece'],
  'Fullback':     ['setPiece'],
  'Utility Back': ['setPiece'],
};

export const PLAYER_OVERALL_WEIGHTS: Record<Position, StatWeights> = {
  'Prop':         PROP_WEIGHTS,
  'Hooker':       HOOKER_WEIGHTS,
  'Lock':         LOCK_WEIGHTS,
  'Flanker':      FLANKER_WEIGHTS,
  'Number 8':     NUMBER_8_WEIGHTS,
  // Back-row utility players who could play 6/7/8 get the flanker profile —
  // mobile, breakdown-focused. Players whose data specifies Number 8 keep the
  // strength-leaning N8 table above.
  'Back Row':     FLANKER_WEIGHTS,
  'Scrum-Half':   SCRUM_HALF_WEIGHTS,
  'Fly-Half':     FLY_HALF_WEIGHTS,
  'Centre':       CENTRE_WEIGHTS,
  'Wing':         WING_WEIGHTS,
  'Fullback':     FULLBACK_WEIGHTS,
  'Utility Back': UTILITY_WEIGHTS,
};
