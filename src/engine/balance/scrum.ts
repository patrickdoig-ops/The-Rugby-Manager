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
  // is ~14.7% — Premiership real-world is roughly 10-15% per scrum.
  attackPenaltyMargin: 30,
  stableWinMargin:    -16,
  wheelMargin:        -36,
} as const;
