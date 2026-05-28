import type { Player } from '../../types/player';
import type { MaulResult } from '../../types/engine';
import { rng } from '../../utils/rng';
import { MAUL_VALUES } from '../balance';

export interface MaulResolution {
  result: MaulResult;
  attackScore: number;
  defendScore: number;
  margin: number;
  // Metres advanced by the attacking side when result === 'maul_won'.
  // 0 for the other two outcomes. The handler reads this to reposition
  // the ball and to check whether the maul crossed the try line.
  gainMetres: number;
}

// Sum (not average) so a pack a man down genuinely weakens. Mirrors
// ScrumResolver.packScore. Weights tuned slightly toward strength —
// a maul is a sustained drive more than a coordinated set-piece bind.
function packScore(forwards: Player[]): number {
  return forwards.reduce(
    (sum, p) => sum + p.currentStats.strength * MAUL_VALUES.strengthWeight + p.currentStats.setPiece * MAUL_VALUES.setPieceWeight,
    0,
  );
}

// Average — discipline is a per-player attribute. Empty pack falls back
// to the discipline pivot so the term contributes zero.
function packDiscipline(forwards: Player[]): number {
  if (forwards.length === 0) return MAUL_VALUES.disciplinePivot;
  return forwards.reduce((sum, p) => sum + p.currentStats.discipline, 0) / forwards.length;
}

export function resolveMaul(attackForwards: Player[], defendForwards: Player[]): MaulResolution {
  const { rngSpan, collapseFromMarginWeight, collapseFromDisciplineWeight, maxCollapsePct } = MAUL_VALUES;
  const attackScore = packScore(attackForwards) + rng(1, rngSpan);
  const defendScore = packScore(defendForwards) + rng(1, rngSpan);
  const margin = attackScore - defendScore;

  let result: MaulResult;
  let gainMetres = 0;

  if (margin <= 0) {
    // Defenders stop the maul cleanly — ball locked in, turnover scrum.
    result = 'maul_held';
  } else {
    // Attackers winning the contest. Roll for cynical collapse — the
    // defender's discipline + the pressure (margin) decide whether they
    // crack. Otherwise the maul gets the metres.
    const defDisc = packDiscipline(defendForwards);
    const pressureTerm = margin * collapseFromMarginWeight;
    const disciplineTerm = Math.max(0, MAUL_VALUES.disciplinePivot - defDisc) * collapseFromDisciplineWeight;
    const collapsePct = Math.min(maxCollapsePct, pressureTerm + disciplineTerm);
    if (rng(1, 100) <= collapsePct) {
      result = 'maul_collapse_penalty';
    } else {
      result = 'maul_won';
      if (rng(1, 100) <= MAUL_VALUES.longDrivePct) {
        gainMetres = rng(MAUL_VALUES.longGainMin, MAUL_VALUES.longGainMax);
      } else {
        gainMetres = rng(MAUL_VALUES.baseGainMin, MAUL_VALUES.baseGainMax);
      }
    }
  }

  return { result, attackScore, defendScore, margin, gainMetres };
}
