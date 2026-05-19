// Single source of truth for every gameplay tuning number.
//
// If a literal influences a match outcome — probability, threshold, modifier,
// gain range, weight, fatigue multiplier, rating point value — it lives here.
// Do not introduce new tuning literals in resolvers, events, or systems.
//
// Exempt by design: rugby pitch geometry (FieldPosition.ts), jersey-number
// position checks, and RNG shape values inside resolver formulas (e.g. rng(1,20)).

// =============================================================================
// KICK / CARRY DECISION (FirstPhaseEvent, OpenPlayEvent, KickReturnEvent)
// =============================================================================

export const KICK_PROBABILITIES = {
  possession: { own22: 50, ownHalf: 15, opposition: 0 },
  kicking:    { own22: 90, ownHalf: 65, opposition: 15 },
  balanced:   { own22: 75, ownHalf: 50, opposition: 10 },
} as const;

export const HARD_CARRY_THRESHOLDS = {
  keep_it_tight: 90,
  balanced:      70,
  wide_wide:     50,
} as const;

// =============================================================================
// TACTIC MODIFIERS
// =============================================================================

export const TACTIC_MODIFIERS = {
  backfieldLineBreakPenalty:  { three_back: -10, two_back: -5,  one_back: 0 },
  breakdownAttack:            { pick_and_drive: -8, wide_play: 8,  balanced: 0 },
  breakdownDefend:            { shadow: 10, counter_ruck: -8, jackal: 0 },
  breakdownSupporterCount:    { pick_and_drive: 4,  wide_play: 2,  balanced: 3 },
  boxKickFullbackBonus:       { three_back: 15, two_back: 8,  one_back: 0 },
  tacticalKickTouchReduction: { three_back: 25, two_back: 15, one_back: 0 },
  tacticalKickReturnBonus:    { three_back: 10, two_back: 5,  one_back: 0 },
  forwardFatigueMultiplier:   { pick_and_drive: 1.1, counter_ruck: 1.1 },
  dominantCarryBonus: 6,
} as const;

// =============================================================================
// HANDLING (knock-on gate — appears 7x today, extracted as a helper)
// =============================================================================

export const HANDLING_GATE = {
  baseThreshold:   85,
  clockInRedScale: 0.4,
  maxThreshold:    99,
} as const;

export function knockOnThreshold(handling: number, clockInTheRed: boolean): number {
  const g = HANDLING_GATE;
  return clockInTheRed
    ? Math.min(g.maxThreshold, g.baseThreshold + Math.round(Math.max(0, g.baseThreshold - handling) * g.clockInRedScale))
    : g.baseThreshold;
}

// =============================================================================
// BREAKDOWN
// =============================================================================

export const BREAKDOWN_VALUES = {
  leadWeight:       0.6,
  supportWeight:    0.4,
  disciplineWeight: 0.15,
  bodyWeights:      [1.0, 0.6, 0.4, 0.3],
  bodyWeightFallback: 0.3,
  cleanBallMargin:  10,
  slowBallMargin:   -8,
  turnoverMargin:   -14,
  counterRuckTop:   4,
  jackalLeadWeight: 0.7,
  jackalSupportWeight: 0.3,
} as const;

// =============================================================================
// SCRUM
// =============================================================================

export const SCRUM_VALUES = {
  setPieceWeight:      0.6,
  strengthWeight:      0.4,
  disciplineWeight:    0.15,
  attackPenaltyMargin: 15,
  stableWinMargin:     0,
  wheelMargin:         -8,
} as const;

// =============================================================================
// LINEOUT
// =============================================================================

export const LINEOUT_VALUES = {
  crookedThrowThreshold: 95,
  setPieceWeight: 0.5,
  agilityWeight:  0.5,
  cleanCatchMargin: -5,
  scrappyMargin:    -15,
} as const;

// =============================================================================
// OPEN PLAY (collision + evasion)
// =============================================================================

export const OPEN_PLAY_VALUES = {
  agilityWeight: 0.5,
  paceWeight:    0.5,
  lineBreakMargin: 15,
  lineBreakMetres: [10, 25],
  dominantCarryMargin:  5,
  dominantCarryMetres:  [3, 8],
  dominantTackleMargin: -5,
  dominantTackleMetres: [-2, 1],
  playOnMetres: [1, 4],
  attackerStrengthWeight: 0.5,
  attackerPaceWeight:     0.5,
  defenderTacklingWeight: 0.5,
  defenderStrengthWeight: 0.5,
} as const;

// =============================================================================
// KICK-OFF
// =============================================================================

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

// =============================================================================
// BOX KICK
// =============================================================================

export const BOX_KICK_VALUES = {
  veryGoodKickThreshold:     75,
  uncontestedCatchThreshold: 35,
  contestClearMargin:        10,
  veryGoodKickDistance:      20,
  poorKickFarDistance:       30,
  poorKickShortDistance:     8,
} as const;

// =============================================================================
// TACTICAL KICK (open-field)
// =============================================================================

export const TACTICAL_KICK_VALUES = {
  goodKickThreshold:     25,
  goodKickDistance:      [30, 50],
  poorKickDistance:      [10, 20],
  goodKickOutOnFullProb: 0,
  poorKickOutOnFullProb: 30,
  goodKickTouchProb:     75,
  poorKickTouchProb:     30,
} as const;

// =============================================================================
// GOAL KICK (penalty + conversion)
// =============================================================================

export const GOAL_KICK_VALUES = {
  angleWeight:      0.3,
  composureWeight:  0.2,
  successThreshold: 120,
} as const;

export const CONVERSION_VALUES = {
  distanceFromPostsWeight: 0.4,
} as const;

// =============================================================================
// FATIGUE / STAMINA
// =============================================================================

// Tiers ordered high → low. Each tier OVERWRITES prior tier values for any stat
// it lists; stats not listed in a later tier keep the previous tier's value.
// This matches the original hand-unrolled `if (f < 90) ... if (f < 80) ...` chain.
export const FATIGUE_SCALING = {
  decayRange: [4, 12],
  staminaDivisor: 150,
  tirednessThreshold: 50,
  computeIntervalMinutes: 5,
  tiers: [
    { threshold: 90, multipliers: { strength: 0.90 } },
    { threshold: 80, multipliers: { tackling: 0.80 } },
    { threshold: 70, multipliers: { pace: 0.75, agility: 0.75, handling: 0.80, discipline: 0.80, composure: 0.80, setPiece: 0.80, breakdown: 0.80, strength: 0.70 } },
    { threshold: 50, multipliers: { pace: 0.55, agility: 0.55, handling: 0.60, discipline: 0.60, composure: 0.60, setPiece: 0.60, breakdown: 0.60, strength: 0.50 } },
    { threshold: 30, multipliers: { pace: 0.35, agility: 0.35, handling: 0.40, discipline: 0.40, composure: 0.40, tackling: 0.40, setPiece: 0.30, breakdown: 0.30, strength: 0.30 } },
  ],
} as const;

// =============================================================================
// RATINGS
// =============================================================================

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

// =============================================================================
// CLOCK
// =============================================================================

// The advance formula is `baseAdvance + rng(rngMin, rngMax) / rngDivisor` →
// 0.2 + 0..0.8 = 0.2 to 1.0 in 0.1 steps. Kept split out (not collapsed to
// `rng(2, 10) / 10`) because IEEE-754 makes `0.2 + 0.1 !== 0.3`, and changing
// the formula shape would alter accumulated game-minute trajectories.
export const CLOCK_VALUES = {
  baseAdvance: 0.2,
  rngMin: 0,
  rngMax: 8,
  rngDivisor: 10,
  halfTimeMinute: 40,
  fullTimeMinute: 80,
} as const;

// =============================================================================
// PENALTY
// =============================================================================

export const PENALTY_VALUES = {
  goalKickTryLineOffsetWeight:     0.2,
  goalKickDistanceFromPostsWeight: 0.3,
  kickToTouchDistance: 20,
} as const;

// =============================================================================
// COMMENTARY CHANCES (tactic-note trigger probabilities)
// =============================================================================

export const COMMENTARY_CHANCES = {
  breakdownPickAndDriveClean:   30,
  breakdownShadowClean:         30,
  breakdownJackalClean:         25,
  breakdownWidePlaySlow:        30,
  breakdownCounterRuckSlow:     30,
  breakdownJackalTurnover:      35,
  breakdownCounterRuckTurnover: 30,
  breakdownWidePlayTurnover:    25,
  breakdownPickAndDrivePenalty: 25,
  breakdownWidePlayPenalty:     25,
  breakdownJackalPenalty:       25,
  lineBreakBackfieldThin:       30,
  boxKickBackfieldCaught:       30,
  tacticalKickFiftyTwentyTwo:   25,
  tacticalKickCaughtReturn:     35,
} as const;
