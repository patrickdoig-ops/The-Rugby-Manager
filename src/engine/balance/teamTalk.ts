// Team talk balance constants.
// Applied pre-match and at half-time; decay linearly over the first portion
// of each half. See docs/match-engine.md "Team talk modifier".

export const TEAM_TALK = {
  calm:      { attack: 2, defend: 4, decayMinutes: 15 },
  encourage: { attack: 5, defend: 2, decayMinutes: 12 },
  demand:    { attack: 8, defend: 2, decayMinutes: 10 },
  singleOut: { attack: 3, defend: 1, decayMinutes: 12, playerBonus: 8 },
  flatThreshold:   50,  // avg morale < 50 → "Flat"
  flyingThreshold: 75,  // avg morale ≥ 75 → "Flying"
  encourageFlatMultiplier: 0.5,
  demandFlatAttack: -8,
  demandFlatDefend: -8,
  aiCalmMinDelta:   75,  // AI total OVR lead ≥ 75 pts → calm (pre-match)
  aiScoreCalmMin:    7,  // AI score lead ≥ 7 → calm (half-time)
  aiScoreDemandMax: -7,  // AI score trail ≥ 7 → demand (half-time)
} as const;
