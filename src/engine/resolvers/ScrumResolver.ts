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

function packScore(forwards: Player[]): number {
  if (forwards.length === 0) return 0;
  return forwards.reduce((sum, p) => sum + p.currentStats.setPiece * SCRUM_VALUES.setPieceWeight + p.currentStats.strength * SCRUM_VALUES.strengthWeight, 0)
       / forwards.length;
}

function packDiscipline(forwards: Player[]): number {
  if (forwards.length === 0) return 50;
  return forwards.reduce((sum, p) => sum + p.currentStats.discipline, 0) / forwards.length;
}

export function resolveScrum(attackForwards: Player[], defendForwards: Player[]): ScrumResolution {
  const { disciplineWeight, attackPenaltyMargin, stableWinMargin, wheelMargin } = SCRUM_VALUES;
  const attackScore = packScore(attackForwards) + (packDiscipline(attackForwards) - 50) * disciplineWeight + rng(1, 20);
  const defendScore = packScore(defendForwards) + (packDiscipline(defendForwards) - 50) * disciplineWeight + rng(1, 20);
  const margin = attackScore - defendScore;

  let result: ScrumResult;
  if (margin > attackPenaltyMargin) result = 'attacking_dominant_penalty';
  else if (margin > stableWinMargin) result = 'stable_win';
  else if (margin > wheelMargin) result = 'wheel';
  else result = 'defending_dominant_penalty';

  return { result, attackScore, defendScore, margin };
}
