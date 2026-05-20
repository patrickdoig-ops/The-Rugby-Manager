// Tuning for the scrum contest: set-piece/strength weights and the margin
// thresholds that decide stable win, wheel, or attacking penalty.

export const SCRUM_VALUES = {
  setPieceWeight:      0.6,
  strengthWeight:      0.4,
  disciplineWeight:    0.15,
  // Pivot used as `(packDiscipline - disciplinePivot) * disciplineWeight`
  // so a pack averaging 50 discipline is neutral. Also doubles as the
  // empty-pack fallback for `packDiscipline`.
  disciplinePivot:     50,
  attackPenaltyMargin: 15,
  stableWinMargin:     0,
  wheelMargin:         -8,
} as const;
