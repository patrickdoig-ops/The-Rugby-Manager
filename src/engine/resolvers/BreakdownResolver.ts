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
  defendBonus = 0,
  // First-to-arrive pace: the fastest loose forward (back row) on each side
  // racing to the ball. Computed symmetrically by the caller so the term is a
  // pure pack-pace differential. Defaults to the pivot (zero edge).
  attackArrivalPace: number = BREAKDOWN_VALUES.paceArrivalPivot,
  defendArrivalPace: number = BREAKDOWN_VALUES.paceArrivalPivot,
): BreakdownResolution {
  const { jackalLeadWeight, jackalSupportWeight, disciplineWeight, counterRuckTop, cleanBallMargin, slowBallMargin, turnoverMargin, paceArrivalWeight, paceArrivalPivot } = BREAKDOWN_VALUES;
  // First-to-arrive: the quickest loose forward gets over the ball to secure it.
  const ars = stackedScore(supporters, 'breakdown', 'strength') + rng(1, 20) + attackBonus
            + BREAKDOWN_VALUES.ruckRetentionBonus
            + (attackArrivalPace - paceArrivalPivot) * paceArrivalWeight;

  let dts: number;
  if (defPlan === 'counter_ruck' && defendPack.length > 0) {
    const top4 = [...defendPack]
      .sort((a, b) =>
        (b.currentStats.strength * BREAKDOWN_VALUES.leadWeight + b.currentStats.breakdown * BREAKDOWN_VALUES.supportWeight) -
        (a.currentStats.strength * BREAKDOWN_VALUES.leadWeight + a.currentStats.breakdown * BREAKDOWN_VALUES.supportWeight)
      )
      .slice(0, counterRuckTop);
    dts = stackedScore(top4, 'strength', 'breakdown') + rng(1, 20) + BREAKDOWN_VALUES.counterRuckDtsMod
        + (defendArrivalPace - paceArrivalPivot) * paceArrivalWeight;
  } else if (defPlan === 'shadow') {
    // Shadow defenders sprint back into the defensive line rather than
    // contest the ruck — the base contest is minimal. The wide rng band
    // captures occasional "scrappy ball" outcomes where the attacking
    // side fumbles the placement, the ball squirts out the side, or
    // late-arriving defenders scoop it up. Calibrated in v2.188a from
    // rng(1, 10) (literal zero turnovers — Saracens / Sale showed 0.0
    // breakdown turnovers across 450 fixtures) to rng(1, 90), giving a
    // low but non-zero rate (~0.3 TO/match for shadow-defending teams)
    // while preserving the design intent that shadow rarely wins the
    // physical contest.
    dts = rng(1, 90);
  } else {
    // jackal
    dts = jackal.currentStats.breakdown * jackalLeadWeight
        + jackal.currentStats.strength * jackalSupportWeight
        + (jackal.currentStats.discipline - BREAKDOWN_VALUES.disciplinePivot) * disciplineWeight
        + (defendArrivalPace - paceArrivalPivot) * paceArrivalWeight
        + rng(1, 20);
  }
  dts += defendBonus;

  const margin = ars - dts;

  let result: BreakdownResult;
  if (margin >= cleanBallMargin) result = 'clean_ball';
  else if (margin >= slowBallMargin) result = 'slow_ball';
  else if (margin >= turnoverMargin) result = 'turnover';
  else result = 'penalty_defending';

  return { result, ars, dts, margin };
}
