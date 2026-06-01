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

// `attackBonus` / `defendBonus` are flat shove edges (intensity tactic).
// `attackVarianceMult` / `defendVarianceMult` scale each side's noise around
// its mean (discipline tactic) — 1.0 is the neutral default, so existing
// callers and balanced packs are unchanged. The noise is recentred on its
// mean before scaling, so a wider/narrower multiplier only changes the spread,
// never the mean (margin stays byte-identical at mult 1.0 + bonus 0).
export function resolveScrum(
  attackForwards: Player[],
  defendForwards: Player[],
  attackBonus = 0,
  defendBonus = 0,
  attackVarianceMult = 1,
  defendVarianceMult = 1,
): ScrumResolution {
  const { disciplineWeight, disciplinePivot, attackPenaltyMargin, stableWinMargin, wheelMargin, rngSpan } = SCRUM_VALUES;
  const noiseMid = (rngSpan + 1) / 2;
  const attackNoise = noiseMid + (rng(1, rngSpan) - noiseMid) * attackVarianceMult;
  const defendNoise = noiseMid + (rng(1, rngSpan) - noiseMid) * defendVarianceMult;
  const attackScore = packScore(attackForwards) + (packDiscipline(attackForwards) - disciplinePivot) * disciplineWeight + attackBonus + attackNoise;
  const defendScore = packScore(defendForwards) + (packDiscipline(defendForwards) - disciplinePivot) * disciplineWeight + defendBonus + defendNoise;
  const margin = attackScore - defendScore;

  let result: ScrumResult;
  if (margin > attackPenaltyMargin) result = 'attacking_dominant_penalty';
  else if (margin > stableWinMargin) result = 'stable_win';
  else if (margin > wheelMargin) result = 'wheel';
  else result = 'defending_dominant_penalty';

  // Own-put-in floor — two-stage rescue for defending_dominant_penalty.
  // Stage 1 (ownPutInRescuePct): convert to wheel (reset scrum, possession
  // retained, sequence continues). Stage 2 (weakPackStableWinPct): if stage
  // 1 didn't rescue, with a small probability convert directly to
  // stable_win (sequence ends, possession retained). Together these keep
  // even fully-weak packs around 80% own-put-in retention league-wide.
  if (result === 'defending_dominant_penalty') {
    if (rng(1, 100) <= SCRUM_VALUES.ownPutInRescuePct) {
      result = 'wheel';
    } else if (rng(1, 100) <= SCRUM_VALUES.weakPackStableWinPct) {
      result = 'stable_win';
    }
  }

  return { result, attackScore, defendScore, margin };
}
