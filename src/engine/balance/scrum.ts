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
  attackPenaltyMargin: 40,
  stableWinMargin:     0,
  wheelMargin:         -20,
} as const;
