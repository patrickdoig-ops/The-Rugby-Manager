import type { Player } from '../../types/player';
import type { ScrumResult } from '../../types/engine';
import { rng } from '../../utils/rng';

export interface ScrumResolution {
  result: ScrumResult;
  attackScore: number;
  defendScore: number;
  margin: number;
}

function packScore(forwards: Player[]): number {
  if (forwards.length === 0) return 0;
  return forwards.reduce((sum, p) => sum + p.currentStats.setPiece * 0.6 + p.currentStats.strength * 0.4, 0)
       / forwards.length;
}

function packDiscipline(forwards: Player[]): number {
  if (forwards.length === 0) return 50;
  return forwards.reduce((sum, p) => sum + p.currentStats.discipline, 0) / forwards.length;
}

export function resolveScrum(attackForwards: Player[], defendForwards: Player[]): ScrumResolution {
  const attackScore = packScore(attackForwards) + (packDiscipline(attackForwards) - 50) * 0.15 + rng(1, 20);
  const defendScore = packScore(defendForwards) + (packDiscipline(defendForwards) - 50) * 0.15 + rng(1, 20);
  const margin = attackScore - defendScore;

  let result: ScrumResult;
  if (margin > 0) result = 'stable_win';
  else if (margin > -15) result = 'wheel';
  else result = 'dominant_penalty';

  return { result, attackScore, defendScore, margin };
}
