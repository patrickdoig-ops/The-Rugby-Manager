// Tuning for the scrum contest: set-piece/strength weights and the margin
// thresholds that decide stable win, wheel, or attacking penalty.

// packScore is the SUM of forwards' (setPiece × setPieceWeight + strength ×
// strengthWeight) — see ScrumResolver. With 8 forwards averaging ~70/75 the
// per-side score is ~576. Margin thresholds are tuned for that scale; a side
// down one forward loses ~72 of pack score, materially shifting the margin
// distribution.
export const SCRUM_VALUES = {
  setPieceWeight:      0.6,
  strengthWeight:      0.4,
  disciplineWeight:    1.2,
  // Per-side noise span — `rng(1, rngSpan)` per pack. The resolver recentres
  // it around its mean ((rngSpan+1)/2) so the discipline variance multiplier
  // can fatten/narrow the tails without shifting the mean (balanced packs stay
  // byte-identical). Margin is the difference of the two sides' noise.
  rngSpan:             50,
  // Pivot used as `(packDiscipline - disciplinePivot) * disciplineWeight` so
  // a pack averaging 50 discipline is neutral. packDiscipline stays as an
  // average (per-player attribute) even though packScore is now a sum.
  disciplinePivot:     50,
  // Margin buckets, calibrated for the ~576-per-side packScore + (-12..+12)
  // discipline + rng(1,50) (resolver) outcome distribution. Under equal
  // packs the margin is triangular on [-49, 49] with peak at 0:
  //   margin >  30          →  attacking penalty   (~7.6%)
  //   -15 ≤ margin ≤ 30     →  stable win          (~68.6%)
  //   -35 ≤ margin ≤ -16    →  wheel reset         (~19.6%)
  //   margin < -35          →  defending penalty   (~4.2%)
  // Attacker-favoured ~1.8:1 reflects the real-rugby put-in advantage.
  // Effective per-scrum-sequence penalty rate (wheel re-rolls factored)
  // is ~14.7% — league real-world is roughly 10-15% per scrum.
  attackPenaltyMargin: 30,
  stableWinMargin:    -16,
  wheelMargin:        -36,
  // Soft floor on own-put-in retention. When the natural margin produces a
  // defending_dominant_penalty, the resolver re-rolls at this rate to a wheel
  // (reset scrum, no possession change). Lifted in v2.188a from 70 → 85
  // after telemetry showed Newcastle's scrum win % stuck at 69% (real-world
  // bottom-club floor ~80%). Combined with weakPackStableWinPct below to
  // give a fully-weak pack ~80% own-put-in win rate league-wide.
  ownPutInRescuePct: 85,
  // Hard floor on own-put-in retention. After the rescue check above leaves
  // a defending_dominant_penalty result, this gives a second-chance
  // conversion straight to stable_win (possession retained, sequence ends).
  // Models "ref calls the put-in team's ball anyway after a messy scrum
  // they were never going to win cleanly". Together with ownPutInRescuePct
  // this stops weak packs (Newcastle, Sale) entering the runaway
  // possession-loss feedback loop visible across v2.179a-v2.184a telemetry.
  weakPackStableWinPct: 30,
  // Cap on consecutive wheels in a single scrum sequence. After this many
  // prior wheels, the next wheel is promoted to a penalty (the resolver's
  // 3rd-contest margin picks the side). 2 means "wheel, reset, wheel, reset
  // — third reset gets cited". Counter lives at state.consecutiveWheels and
  // resets the moment a scrum resolves to anything other than wheel.
  wheelCap: 2,
} as const;
