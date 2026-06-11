// Thresholds and intent-bundle definitions for AITacticalDirector. The
// director is pure (no RNG); these constants are the only tunable knobs.
//
// Score gap is interpreted as (team's score − opponent's score). Minutes
// remaining is `CLOCK_VALUES.fullTimeMinute - state.clock.gameMinute`.
// Intents stay close to authored team identity outside the late-game window;
// the late-game window flips the team into CHASING / PROTECTING when the
// scoreboard situation warrants.
//
// Human response: from humanResponseMinute onwards the AI reads the human
// side's current tactics and nudges up to one dimension per rule, capped at
// ±1 step from the AI team's authored baseline so club identity is preserved.

import type { TeamTactics, PresetTacticDim } from '../../types/team';

export const AI_DIRECTOR_VALUES = {
  scoreGapTrigger:          8,  // points difference required to flip out of BASELINE
  minutesRemainingTrigger: 15,  // only flip inside the final 15 game-minutes
  humanResponseMinute:     20,  // start reacting to human tactics from this game-minute
} as const;

// Semantic ordering for each tactic dimension (low index = one end, high = other).
// Used by computeHumanResponse to apply a ±1 nudge from the AI's authored baseline.
export const TACTIC_ORDERS: Record<PresetTacticDim, readonly string[]> = {
  attackingGamePlan:  ['possession', 'balanced', 'kicking'],
  attackingStyle:     ['keep_it_tight', 'balanced', 'wide_wide'],
  attackingBreakdown: ['commit_numbers', 'balanced', 'minimal_ruck'],
  defendingBreakdown: ['jackal', 'counter_ruck', 'shadow'],
  backfieldDefence:   ['one_back', 'two_back', 'three_back'],
  defensiveLine:      ['blitz', 'hybrid', 'drift'],
  offloadStrategy:    ['cautious', 'balanced', 'offload_freely'],
  intensity:          ['light', 'balanced', 'high'],
  discipline:         ['cautious', 'balanced', 'risky'],
};

// pickEffort thresholds — the intensity/discipline dimensions are governed
// separately from the 7-dimension intent bundles (see AITacticalDirector).
// Behind late → empty the tank (high / risky). Big lead late → ease off to
// protect players (light / cautious). Derby kick-off → open at high intensity
// to set the tone.
export const AI_EFFORT_VALUES = {
  lateGameMinutesRemaining: 20,  // pickEffort late-game window
  largeLeadGap:             15,  // points lead that triggers ease-off
  derbyEarlyMinute:         15,  // before this game-minute a derby opens at high intensity
} as const;

export type HumanResponseRule = {
  humanDimension: PresetTacticDim;
  humanValue: string;
  aiDimension: PresetTacticDim;
  delta: -1 | 1;
};

// Each rule says: "if the human is running humanValue on humanDimension,
// nudge the AI's aiDimension by delta steps from its authored baseline."
// Conflicting rules on the same dimension cancel out (stay at baseline).
export const HUMAN_RESPONSE_RULES: readonly HumanResponseRule[] = [
  // --- AI defence reacting to human attack ---
  // Human kicking game → stack more backs behind to cover kicks
  { humanDimension: 'attackingGamePlan',  humanValue: 'kicking',        aiDimension: 'backfieldDefence',   delta:  1 },
  // Human crash-ball → tighten the defensive line to close channels
  { humanDimension: 'attackingStyle',     humanValue: 'keep_it_tight',  aiDimension: 'defensiveLine',      delta: -1 },
  // Human wide game → drift the line to track the ball across the field
  { humanDimension: 'attackingStyle',     humanValue: 'wide_wide',      aiDimension: 'defensiveLine',      delta:  1 },
  // Human offloading freely → contest the carrier with more jackal work
  { humanDimension: 'offloadStrategy',    humanValue: 'offload_freely', aiDimension: 'defendingBreakdown', delta: -1 },
  // Human quick ruck → pressure the ruck before the pass is away
  { humanDimension: 'attackingBreakdown', humanValue: 'minimal_ruck',   aiDimension: 'defendingBreakdown', delta: -1 },
  // --- AI attack reacting to human defence ---
  // Human blitz line → kick over the rushing defenders
  { humanDimension: 'defensiveLine',      humanValue: 'blitz',          aiDimension: 'attackingGamePlan',  delta:  1 },
  // Human drift line → hit the channels directly before they set
  { humanDimension: 'defensiveLine',      humanValue: 'drift',          aiDimension: 'attackingStyle',     delta: -1 },
  // Human shallow backfield → kick into the space behind
  { humanDimension: 'backfieldDefence',   humanValue: 'one_back',       aiDimension: 'attackingGamePlan',  delta:  1 },
];

// CHASING: a team trailing late maximises possession, plays wide-to-wide,
// commits fewer forwards to the breakdown to keep width, and keeps a flat
// backfield to commit numbers forward. defendingBreakdown stays on jackal
// because they still need turnovers to get the ball back. defensiveLine
// flips to blitz — line speed forces errors and the trailing team accepts
// the line-break risk to get possession back.
export const AI_INTENT_CHASING: TeamTactics = {
  attackingGamePlan:  'possession',
  attackingStyle:     'wide_wide',
  attackingBreakdown: 'minimal_ruck',
  defendingBreakdown: 'jackal',
  backfieldDefence:   'one_back',
  defensiveLine:      'blitz',
  offloadStrategy:    'offload_freely',
  // pickEffort overrides these two for the actual scoreboard situation; the
  // values here keep the bundle a complete TeamTactics and align with a
  // trailing team throwing everything at the game.
  intensity:          'high',
  discipline:         'risky',
};

// PROTECTING: a team leading late kicks for territory, keeps it tight in
// hand, commits forwards to slow the ruck, shadows the breakdown defensively
// (no risk of penalties), and stacks the backfield against counter-kicks.
// defensiveLine drops to drift — concede a little ground per phase to keep
// the line organised; no line-break catastrophes with the lead.
export const AI_INTENT_PROTECTING: TeamTactics = {
  attackingGamePlan:  'kicking',
  attackingStyle:     'keep_it_tight',
  attackingBreakdown: 'commit_numbers',
  defendingBreakdown: 'shadow',
  backfieldDefence:   'two_back',
  defensiveLine:      'drift',
  offloadStrategy:    'cautious',
  // pickEffort overrides these two; values align with a leading team easing
  // off to protect condition and stay out of penalty trouble.
  intensity:          'light',
  discipline:         'cautious',
};
