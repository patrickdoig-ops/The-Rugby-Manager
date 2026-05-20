// Two rating systems:
// 1. RATING_WEIGHTS — the post-match performance rating (1–10), derived from
//    in-match events (tries, line breaks, tackles, knock-ons, …) plus
//    position-specific bonuses.
// 2. PLAYER_OVERALL_WEIGHTS — the player's career overall (0–100), a
//    position-weighted average of the 12 baseStats; used in pre-match displays
//    and team summaries, never mutated in-match.

export const RATING_WEIGHTS = {
  base: 6.0,
  divisor: 10.0,
  min: 1.0,
  max: 10.0,
  universal: {
    tries:               7.0,
    lineBreaks:          2.5,
    defendersBeaten:     0.8,
    turnoversWon:        2.5,
    dominantTackles:     1.0,
    tacklesMade:         0.35,
    kicksMade:           1.0,
    metresCarried:       0.05,
    knockOns:            -1.5,
    missedTacklePerMiss: -0.5,
    penaltiesConceded:   -1.2,
    kicksMissed:         -0.75,
  },
  position: {
    hooker:    { lineoutWinRateBaseline: 0.75, lineoutBonusMultiplier: 20 },
    locks:     { lineoutCatch: 1.5, lineoutSteal: 3.0 },
    frontRow:  { scrumPenaltyWon: 2.5, scrumPenaltyConceded: -2.5 },
    backRow:   { extraTurnoverWon: 1.5, carry: 0.3 },
    scrumHalf: { passes: 0.05 },
    flyHalf:   { kicksFromHand: 0.25 },
    backThree: { extraLineBreak: 1.5 },
  },
} as const;

// Per-position multipliers applied over the 12 baseStats when computing an
// ability-based overall rating (`playerOverall` in RatingEngine.ts). Higher
// weight = the stat matters more for that position. Missing stats default to
// 1.0. The helper normalises by the sum of weights so output stays on the
// 0–100 scale that the simple-mean version produced.
import type { Position, PlayerStats } from '../../types/player';

type StatWeights = Partial<Record<keyof PlayerStats, number>>;

const PROP_WEIGHTS: StatWeights = {
  setPiece: 2.0, strength: 2.0, breakdown: 1.5, tackling: 1.5, stamina: 1.2,
  pace: 0.4, agility: 0.4, kicking: 0.2, handling: 0.6,
};
const HOOKER_WEIGHTS: StatWeights = {
  setPiece: 2.0, breakdown: 1.5, tackling: 1.5, strength: 1.3, handling: 1.1,
  kicking: 0.3, pace: 0.5,
};
const LOCK_WEIGHTS: StatWeights = {
  setPiece: 2.0, strength: 1.8, tackling: 1.4, breakdown: 1.2, stamina: 1.2,
  pace: 0.5, agility: 0.5, kicking: 0.3, handling: 0.7,
};
const FLANKER_WEIGHTS: StatWeights = {
  breakdown: 2.0, tackling: 1.8, stamina: 1.5, strength: 1.2, pace: 1.1,
  positioning: 1.2, setPiece: 0.7, kicking: 0.3,
};
const NUMBER_8_WEIGHTS: StatWeights = {
  strength: 1.8, breakdown: 1.6, tackling: 1.4, handling: 1.3, stamina: 1.3,
  pace: 1.0, setPiece: 0.8, kicking: 0.4,
};
const SCRUM_HALF_WEIGHTS: StatWeights = {
  handling: 2.0, pace: 1.5, composure: 1.5, positioning: 1.4, agility: 1.3,
  kicking: 1.2, setPiece: 0.3, strength: 0.5, breakdown: 0.7,
};
const FLY_HALF_WEIGHTS: StatWeights = {
  kicking: 2.0, composure: 1.8, handling: 1.6, positioning: 1.4, discipline: 1.2,
  pace: 1.0, setPiece: 0.3, strength: 0.5, breakdown: 0.6,
};
const CENTRE_WEIGHTS: StatWeights = {
  tackling: 1.6, pace: 1.5, handling: 1.5, strength: 1.3, agility: 1.2,
  positioning: 1.2, setPiece: 0.4, kicking: 0.8, breakdown: 0.9,
};
const WING_WEIGHTS: StatWeights = {
  pace: 2.0, agility: 1.6, handling: 1.4, positioning: 1.2, composure: 1.1,
  setPiece: 0.3, strength: 0.7, kicking: 0.6, breakdown: 0.5,
};
const FULLBACK_WEIGHTS: StatWeights = {
  positioning: 1.8, kicking: 1.6, handling: 1.4, pace: 1.4, composure: 1.4,
  setPiece: 0.3, strength: 0.6, breakdown: 0.5,
};

// Utility Back uses unit weights (simple mean) — they fill anywhere on the bench.
const UTILITY_WEIGHTS: StatWeights = {};

export const PLAYER_OVERALL_WEIGHTS: Record<Position, StatWeights> = {
  'Loosehead Prop':    PROP_WEIGHTS,
  'Tighthead Prop':    PROP_WEIGHTS,
  'Hooker':            HOOKER_WEIGHTS,
  'Left Lock':         LOCK_WEIGHTS,
  'Right Lock':        LOCK_WEIGHTS,
  'Blindside Flanker': FLANKER_WEIGHTS,
  'Openside Flanker':  FLANKER_WEIGHTS,
  'Number 8':          NUMBER_8_WEIGHTS,
  'Scrum-Half':        SCRUM_HALF_WEIGHTS,
  'Fly-Half':          FLY_HALF_WEIGHTS,
  'Left Wing':         WING_WEIGHTS,
  'Inside Centre':     CENTRE_WEIGHTS,
  'Outside Centre':    CENTRE_WEIGHTS,
  'Right Wing':        WING_WEIGHTS,
  'Fullback':          FULLBACK_WEIGHTS,
  'Utility Back':      UTILITY_WEIGHTS,
};
