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
    hooker:    { lineoutWinRateBaseline: 0.75, lineoutBonusMultiplier: 25 },
    locks:     { lineoutCatch: 2.0, lineoutSteal: 4.5 },
    frontRow:  { scrumPenaltyWon: 2.5, scrumPenaltyConceded: -2.5 },
    backRow:   { extraTurnoverWon: 3.5, carry: 0.5 },
    scrumHalf: { passes: 0.05 },
    flyHalf:   { kicksFromHand: 0.25 },
    backThree: { extraLineBreak: 1.0 },
  },
} as const;

// Per-position multipliers applied over the 12 baseStats when computing an
// ability-based overall rating (`playerOverall` in RatingEngine.ts). Higher
// weight = the stat matters more for that position. Missing stats default to
// 1.0. The helper normalises by the sum of weights so output stays on the
// 0–100 scale that the simple-mean version produced.
import type { Position, PlayerStats } from '../../types/player';

type StatWeights = Partial<Record<keyof PlayerStats, number>>;

// Forwards: kicking weight = 0 (no kicking skill expected, value clipped low at
// spawn — see IRRELEVANT_STATS below).
// Backs: setPiece weight = 0 (no scrum/lineout skill expected, same treatment).

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

// Spawn-time lift applied at team JSON ingest (`src/team/applyStarBoost.ts`).
// Maps each team's authored `stars[]` metadata (indexHigh + suggestedRating)
// onto its players' baseStats so elite real-world players compute to ~95 OVR
// rather than the ~80 a hand-authored "realistic" stat line produces under the
// position-weighted average above. League-wide floor lifts every rostered
// player a couple of points; per-star floors + iterative top-up land each
// named star within ~1 of (suggestedRating + targetOffset).
export const STAR_BOOST = {
  targetOffset:      3,    // target OVR = star.suggestedRating + offset
  indexHighMin:      95,   // floor for star's indexHigh stats (regular stars)
  topIndexHighMin:   97,   // floor for star's indexHigh stats (suggestedRating ≥ topThreshold)
  topThreshold:      90,
  otherStatMin:      78,   // floor for star's non-indexHigh stats
  capPerStat:        99,
  maxIterations:     120,
  irrelevantStatMax: 15,   // cap for stats listed in IRRELEVANT_STATS (forwards' kicking, backs' setPiece)
  statHardFloor:     35,   // never let any non-irrelevant stat drop below this (matches the generator's lower clamp)
} as const;

// Per-tier additive shift applied at spawn to every non-star, non-irrelevant
// baseStat — keeps within-player stat shape intact (additive, not scaling)
// while creating a clear OVR step between starting XV non-stars, the
// matchday bench, and the wider squad. Stars skip the shift entirely
// (boostStar drives them to their own targets).
export const TIER_CALIBRATION = {
  starter: +10,   // starting 15 non-stars
  bench:   +3,
  squad:   -5,
} as const;

// Stats that don't belong to a position's skillset at all — value clamped to
// `STAR_BOOST.irrelevantStatMax` at spawn, weight 0 in the OVR formula above.
// Forwards have no kicking skill; backs have no scrum/lineout skill.
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

// League-wide per-stat ceilings honoured by both the league-floor pass and the
// star-boost iteration. Lets us say "no one in the league has pace > 95" with
// one constant. Per-player exceptions live in PLAYER_STAT_OVERRIDES below and
// are applied AFTER ceilings, so they can exceed them.
export const LEAGUE_STAT_CEILINGS: Partial<Record<keyof PlayerStats, number>> = {
  pace: 95,
};

// Per-player exact-value overrides applied as the very last spawn step. Use
// for visible stats where the league ordering matters and the position/star
// machinery can't express the constraint (e.g. "Henry Arundell is the
// league's fastest, no one else may match him"). Overrides exceed
// LEAGUE_STAT_CEILINGS. Keyed by exact full name as authored in the team
// JSON (case-sensitive, matched after the team data is loaded).
//
// For stars, the override also acts as a per-player cap during the boost
// iteration — so a star whose pace is overridden to 85 has those weight
// points redistributed to other stats rather than the iteration driving
// pace up to the league ceiling only to be slammed back down at the end.
export const PLAYER_STAT_OVERRIDES: Record<string, Partial<PlayerStats>> = {
  'Henry Arundell':     { pace: 99 },
  'Adam Radwan':        { pace: 98 },
  'Cadan Murley':       { pace: 95 },
  'Ollie Sleightholme': { pace: 95 },
  'Henry Slade':        { pace: 85 },
  'Alex Mitchell':      { pace: 88 },
  'Henry Pollock':      { pace: 92 },
  'Ben Earl':           { pace: 89 },
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
