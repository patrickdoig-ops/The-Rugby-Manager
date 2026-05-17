import type { Player } from '../../types/player';
import type { BreakdownResult } from '../../types/engine';
import type { DefendingBreakdown } from '../../types/team';
import { avgStat } from '../../utils/math';
import { rng } from '../../utils/rng';

export interface BreakdownResolution {
  result: BreakdownResult;
  ars: number;
  dts: number;
  margin: number;
}

export function resolveBreakdown(
  supporters: Player[],
  jackal: Player,
  defPlan: DefendingBreakdown = 'jackal',
  defendPack: Player[] = [],
  attackBonus = 0,
): BreakdownResolution {
  const ars = avgStat(supporters, 'breakdown') * 0.6
            + avgStat(supporters, 'strength') * 0.4
            + (avgStat(supporters, 'discipline') - 50) * 0.15
            + rng(1, 20)
            + attackBonus;

  let dts: number;
  if (defPlan === 'counter_ruck' && defendPack.length > 0) {
    dts = avgStat(defendPack, 'strength') * 0.6
        + avgStat(defendPack, 'breakdown') * 0.4
        + (avgStat(defendPack, 'discipline') - 50) * 0.15
        + rng(1, 20);
  } else if (defPlan === 'shadow') {
    dts = rng(1, 10); // Low score concedes clean ball to reset defensive line
  } else {
    // jackal
    dts = jackal.currentStats.breakdown * 0.7
        + jackal.currentStats.strength * 0.3
        + (jackal.currentStats.discipline - 50) * 0.15
        + rng(1, 20);
  }

  const margin = ars - dts;

  let result: BreakdownResult;
  if (margin >= 10) result = 'clean_ball';
  else if (margin >= -8) result = 'slow_ball';
  else if (margin >= -14) result = 'turnover';
  else result = 'penalty_defending';

  return { result, ars, dts, margin };
}

