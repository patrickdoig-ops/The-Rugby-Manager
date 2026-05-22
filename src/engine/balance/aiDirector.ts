// Thresholds and intent-bundle definitions for AITacticalDirector. The
// director is pure (no RNG); these constants are the only tunable knobs.
//
// Score gap is interpreted as (team's score − opponent's score). Minutes
// remaining is `CLOCK_VALUES.fullTimeMinute - state.clock.gameMinute`.
// Intents stay close to authored team identity outside the late-game window;
// the late-game window flips the team into CHASING / PROTECTING when the
// scoreboard situation warrants.

import type { TeamTactics } from '../../types/team';

export const AI_DIRECTOR_VALUES = {
  scoreGapTrigger:        8,   // points difference required to flip out of BASELINE
  minutesRemainingTrigger: 15, // only flip inside the final 15 game-minutes
} as const;

// CHASING: a team trailing late maximises possession, plays wide-to-wide,
// commits fewer forwards to the breakdown to keep width, and keeps a flat
// backfield to commit numbers forward. defendingBreakdown stays on jackal
// because they still need turnovers to get the ball back. defensiveLine
// flips to blitz — line speed forces errors and the trailing team accepts
// the line-break risk to get possession back.
export const AI_INTENT_CHASING: TeamTactics = {
  attackingGamePlan:  'possession',
  attackingStyle:     'wide_wide',
  attackingBreakdown: 'wide_play',
  defendingBreakdown: 'jackal',
  backfieldDefence:   'one_back',
  defensiveLine:      'blitz',
};

// PROTECTING: a team leading late kicks for territory, keeps it tight in
// hand, commits forwards to slow the ruck, shadows the breakdown defensively
// (no risk of penalties), and stacks the backfield against counter-kicks.
// defensiveLine drops to drift — concede a little ground per phase to keep
// the line organised; no line-break catastrophes with the lead.
export const AI_INTENT_PROTECTING: TeamTactics = {
  attackingGamePlan:  'kicking',
  attackingStyle:     'keep_it_tight',
  attackingBreakdown: 'pick_and_drive',
  defendingBreakdown: 'shadow',
  backfieldDefence:   'two_back',
  defensiveLine:      'drift',
};
