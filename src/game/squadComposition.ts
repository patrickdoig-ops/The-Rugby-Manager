// Squad composition helpers — position families and per-position depth floors.
// A matchday 23 needs a fixed positional spread (props, hooker, locks, back row,
// half-backs, centres, back three); academy intake is uniformly random across
// the 12 generic positions, which over a long career starves the single-label
// scarce positions (Lock / Prop / Hooker / SH / FH) and bloats the three-label
// back row. The rollover uses these floors to target intake at thin positions
// and to protect them when releasing to the squad-size cap.

import type { Position } from '../types/player';
import { POSITION_FLOORS } from '../engine/balance/career';

// Position families that map the 12 generic positions onto the cohorts that
// fill a band of the matchday 23.
export const POSITION_GROUPS = [
  'Prop', 'Hooker', 'Lock', 'BackRow', 'SH', 'FH', 'Centre', 'Back3', 'UtilBack',
] as const;
export type PositionGroup = typeof POSITION_GROUPS[number];

export function positionGroup(pos: string): PositionGroup | 'Other' {
  switch (pos) {
    case 'Prop': return 'Prop';
    case 'Hooker': return 'Hooker';
    case 'Lock': return 'Lock';
    case 'Flanker': case 'Number 8': case 'Back Row': return 'BackRow';
    case 'Scrum-Half': return 'SH';
    case 'Fly-Half': return 'FH';
    case 'Centre': return 'Centre';
    case 'Wing': case 'Fullback': return 'Back3';
    case 'Utility Back': return 'UtilBack';
    default: return 'Other';
  }
}

// The concrete Position generatePersona should create to fill each group.
const GROUP_REPRESENTATIVE: Record<PositionGroup, Position> = {
  Prop: 'Prop', Hooker: 'Hooker', Lock: 'Lock', BackRow: 'Flanker',
  SH: 'Scrum-Half', FH: 'Fly-Half', Centre: 'Centre', Back3: 'Wing', UtilBack: 'Utility Back',
};

// Given a club's current per-group counts, return the concrete Position that
// best fills its biggest shortfall vs POSITION_FLOORS — or null if every floor
// is met (the caller then leaves the position to the random roll). Deterministic:
// POSITION_GROUPS is a fixed array, ties resolve to the earlier group.
export function neediestPosition(counts: Record<PositionGroup, number>): Position | null {
  let worstGroup: PositionGroup | null = null;
  let worstDeficit = 0;
  for (const g of POSITION_GROUPS) {
    const deficit = POSITION_FLOORS[g] - counts[g];
    if (deficit > worstDeficit) {
      worstDeficit = deficit;
      worstGroup = g;
    }
  }
  return worstGroup ? GROUP_REPRESENTATIVE[worstGroup] : null;
}

export function emptyGroupCounts(): Record<PositionGroup, number> {
  return { Prop: 0, Hooker: 0, Lock: 0, BackRow: 0, SH: 0, FH: 0, Centre: 0, Back3: 0, UtilBack: 0 };
}
