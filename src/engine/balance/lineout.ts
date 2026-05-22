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
  // Soft floor on own-throw retention. When the resolver would return any
  // non-clean_catch outcome (crooked / scrappy / steal), it re-rolls at this
  // rate to clean_catch. Stops a weaker hooker/jumper pairing from losing
  // most own throws and lifts the floor to roughly 70%+ league-wide. Strong
  // packs are barely affected — their natural loss rate is already low.
  ownThrowRescuePct: 70,
} as const;
