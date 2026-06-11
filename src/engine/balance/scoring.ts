// Points awarded by the laws of the game for each scoring play. Routed
// through applyMatchEvent's TRY_SCORED / CONVERSION_KICKED /
// PENALTY_GOAL_KICKED branches.

export const SCORE_VALUES = {
  try:         5,
  conversion:  2,
  penaltyGoal: 3,
} as const;
