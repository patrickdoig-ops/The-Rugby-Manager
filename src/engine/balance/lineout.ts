// Tuning for the lineout: crooked-throw threshold, jump weighting, and the
// catch/scrappy margins.

export const LINEOUT_VALUES = {
  crookedThrowThreshold: 95,
  setPieceWeight: 0.5,
  agilityWeight:  0.5,
  cleanCatchMargin: -5,
  scrappyMargin:    -15,
} as const;
