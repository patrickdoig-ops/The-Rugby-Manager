import type { Player } from '../../types/player';
import type { BreakdownResult } from '../../types/engine';
import type { DefendingBreakdown } from '../../types/team';
import { rng } from '../../utils/rng';

export interface BreakdownResolution {
  result: BreakdownResult;
  ars: number;
  dts: number;
  margin: number;
}

// Diminishing-return weights per body at the ruck. Players sorted best-first
// so the strongest specialist always gets the full 1.0 weight.
const WEIGHTS = [1.0, 0.6, 0.4, 0.3];

function stackedScore(
  players: Player[],
  leadStat: 'breakdown' | 'strength',
  supportStat: 'breakdown' | 'strength',
): number {
  const sorted = [...players].sort((a, b) =>
    (b.currentStats[leadStat] * 0.6 + b.currentStats[supportStat] * 0.4) -
    (a.currentStats[leadStat] * 0.6 + a.currentStats[supportStat] * 0.4)
  );
  return sorted.reduce((sum, p, i) => {
    const w = WEIGHTS[i] ?? 0.3;
    return sum + (
      p.currentStats[leadStat] * 0.6
      + p.currentStats[supportStat] * 0.4
      + (p.currentStats.discipline - 50) * 0.15
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
  const ars = stackedScore(supporters, 'breakdown', 'strength') + rng(1, 20) + attackBonus;

  let dts: number;
  if (defPlan === 'counter_ruck' && defendPack.length > 0) {
    const top4 = [...defendPack]
      .sort((a, b) =>
        (b.currentStats.strength * 0.6 + b.currentStats.breakdown * 0.4) -
        (a.currentStats.strength * 0.6 + a.currentStats.breakdown * 0.4)
      )
      .slice(0, 4);
    dts = stackedScore(top4, 'strength', 'breakdown') + rng(1, 20);
  } else if (defPlan === 'shadow') {
    dts = rng(1, 10);
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
