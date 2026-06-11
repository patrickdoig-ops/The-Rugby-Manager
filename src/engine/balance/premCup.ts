// Prem Cup tuning. Self-contained — the cup never feeds budgets / cap /
// reputation. The only knob today is the development nudge a player earns
// for getting Prem Cup game time during an international break.
//
// The nudge is RNG-free and bounded: one application per featured player
// per block (not per match), so a player who plays every cup game in a
// block develops the same as one who played a single game — the reward is
// "got minutes", not "played more". Veterans get nothing; youth get the
// most. Stats are added to the player's weakest baseStats (developing
// weaknesses), clamped 1-99 by the PLAYER_TRAINED reducer.

export const CUP_DEVELOPMENT = {
  // Age bands (inclusive upper bound) and the per-block stat gain each earns.
  youthAgeMax: 23,
  developingAgeMax: 27,
  // Points added per targeted stat, and how many of the player's lowest
  // stats to target.
  youthStatGain: 1,
  youthStatsTargeted: 2,
  developingStatGain: 1,
  developingStatsTargeted: 1,
} as const;
