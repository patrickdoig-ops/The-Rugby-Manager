import type { Player } from '../../types/player';
import type { BreakdownResult } from '../../types/engine';
import type { DefendingBreakdown } from '../../types/team';
import { rng } from '../../utils/rng';
import { BREAKDOWN_VALUES } from '../balance';

export interface BreakdownResolution {
  result: BreakdownResult;
  ars: number;
  dts: number;
  margin: number;
}

function stackedScore(
  players: Player[],
  leadStat: 'breakdown' | 'strength',
  supportStat: 'breakdown' | 'strength',
): number {
  const { leadWeight, supportWeight, disciplineWeight, bodyWeights, bodyWeightFallback } = BREAKDOWN_VALUES;
  const sorted = [...players].sort((a, b) =>
    (b.currentStats[leadStat] * leadWeight + b.currentStats[supportStat] * supportWeight) -
    (a.currentStats[leadStat] * leadWeight + a.currentStats[supportStat] * supportWeight)
  );
  return sorted.reduce((sum, p, i) => {
    const w = bodyWeights[i] ?? bodyWeightFallback;
    return sum + (
      p.currentStats[leadStat] * leadWeight
      + p.currentStats[supportStat] * supportWeight
      + (p.currentStats.discipline - BREAKDOWN_VALUES.disciplinePivot) * disciplineWeight
    ) * w;
  }, 0) / 2;
}

export function resolveBreakdown(
  supporters: Player[],
  jackal: Player,
  defPlan: DefendingBreakdown = 'jackal',
  defendPack: Player[] = [],
  attackBonus = 0,
): BreakdownResolution {
  const { jackalLeadWeight, jackalSupportWeight, disciplineWeight, counterRuckTop, cleanBallMargin, slowBallMargin, turnoverMargin } = BREAKDOWN_VALUES;
  const ars = stackedScore(supporters, 'breakdown', 'strength') + rng(1, 20) + attackBonus;

  let dts: number;
  if (defPlan === 'counter_ruck' && defendPack.length > 0) {
    const top4 = [...defendPack]
      .sort((a, b) =>
        (b.currentStats.strength * BREAKDOWN_VALUES.leadWeight + b.currentStats.breakdown * BREAKDOWN_VALUES.supportWeight) -
        (a.currentStats.strength * BREAKDOWN_VALUES.leadWeight + a.currentStats.breakdown * BREAKDOWN_VALUES.supportWeight)
      )
      .slice(0, counterRuckTop);
    dts = stackedScore(top4, 'strength', 'breakdown') + rng(1, 20);
  } else if (defPlan === 'shadow') {
    dts = rng(1, 10);
  } else {
    // jackal
    dts = jackal.currentStats.breakdown * jackalLeadWeight
        + jackal.currentStats.strength * jackalSupportWeight
        + (jackal.currentStats.discipline - BREAKDOWN_VALUES.disciplinePivot) * disciplineWeight
        + rng(1, 20);
  }

  const margin = ars - dts;

  let result: BreakdownResult;
  if (margin >= cleanBallMargin) result = 'clean_ball';
  else if (margin >= slowBallMargin) result = 'slow_ball';
  else if (margin >= turnoverMargin) result = 'turnover';
  else result = 'penalty_defending';

  return { result, ars, dts, margin };
}
