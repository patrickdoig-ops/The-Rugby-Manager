// Tuning for the lineout: crooked-throw threshold, jump weighting, and the
// catch/scrappy margins.

export const LINEOUT_VALUES = {
  crookedThrowThreshold: 95,
  setPieceWeight: 0.5,
  agilityWeight:  0.5,
  cleanCatchMargin: -5,
  scrappyMargin:    -15,
  // Attacking jumper pool — locks (4, 5) and the openside flanker (7).
  // One is picked uniformly at random per lineout (handleLineout).
  jumperIds:        [4, 5, 7],
} as const;
