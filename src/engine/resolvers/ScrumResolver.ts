import type { Player } from '../../types/player';
import type { ScrumResult } from '../../types/engine';
import { rng } from '../../utils/rng';
import { SCRUM_VALUES } from '../balance';

export interface ScrumResolution {
  result: ScrumResult;
  attackScore: number;
  defendScore: number;
  margin: number;
}

// Sum (not average) so a pack a man down genuinely weakens. 8 forwards at
// ~70 setPiece × 0.6 + ~75 strength × 0.4 = ~72 per forward → ~576 total.
// SCRUM_VALUES margin thresholds scale with this — see balance/scrum.ts.
function packScore(forwards: Player[]): number {
  return forwards.reduce((sum, p) => sum + p.currentStats.setPiece * SCRUM_VALUES.setPieceWeight + p.currentStats.strength * SCRUM_VALUES.strengthWeight, 0);
}

// Discipline stays as an average — it's a per-player attribute, not a pack
// aggregate. Empty pack falls back to the pivot so the term contributes zero.
function packDiscipline(forwards: Player[]): number {
  if (forwards.length === 0) return SCRUM_VALUES.disciplinePivot;
  return forwards.reduce((sum, p) => sum + p.currentStats.discipline, 0) / forwards.length;
}

export function resolveScrum(attackForwards: Player[], defendForwards: Player[]): ScrumResolution {
  const { disciplineWeight, disciplinePivot, attackPenaltyMargin, stableWinMargin, wheelMargin } = SCRUM_VALUES;
  // rng(1,50) per side ⇒ margin distribution triangular on [-49, +49] with
  // peak at 0. Tighter than the previous (1,60) spread so penalty rates land
  // in the real-rugby 10-15%-per-scrum band given the SCRUM_VALUES buckets.
  const attackScore = packScore(attackForwards) + (packDiscipline(attackForwards) - disciplinePivot) * disciplineWeight + rng(1, 50);
  const defendScore = packScore(defendForwards) + (packDiscipline(defendForwards) - disciplinePivot) * disciplineWeight + rng(1, 50);
  const margin = attackScore - defendScore;

  let result: ScrumResult;
  if (margin > attackPenaltyMargin) result = 'attacking_dominant_penalty';
  else if (margin > stableWinMargin) result = 'stable_win';
  else if (margin > wheelMargin) result = 'wheel';
  else result = 'defending_dominant_penalty';

  return { result, attackScore, defendScore, margin };
}
