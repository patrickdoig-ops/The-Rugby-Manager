import type { Player } from '../../types/player';
import type { BreakdownResult } from '../../types/engine';
import { avgStat } from '../../utils/math';
import { rng } from '../../utils/rng';

export interface BreakdownResolution {
  result: BreakdownResult;
  ars: number;
  dts: number;
  margin: number;
}

export function resolveBreakdown(supporters: Player[], jackal: Player): BreakdownResolution {
  const ars = avgStat(supporters, 'breakdown') * 0.6
            + avgStat(supporters, 'strength') * 0.4
            + rng(1, 20);

  const dts = jackal.currentStats.breakdown * 0.7
            + jackal.currentStats.strength * 0.3
            + rng(1, 20);

  const margin = ars - dts;

  let result: BreakdownResult;
  if (margin >= 10) result = 'clean_ball';
  else if (margin >= 1) result = 'slow_ball';
  else if (margin >= -14) result = 'turnover';
  else result = 'penalty_defending';

  return { result, ars, dts, margin };
}
