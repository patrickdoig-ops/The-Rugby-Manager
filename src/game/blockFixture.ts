// Discriminated union identifying one fixture in any competition, used as
// the element type of CalendarBlock.fixtures. Pure data — no methods.

import type { CupFixtureRef } from './InternationalBreakCoordinator';
import type { EuropeanFixtureRef } from './GameCoordinator';

// Reference into state.league.playoffs for a single knockout match.
export type PlayoffMatchRef = { kind: 'semifinal_1' | 'semifinal_2' | 'final' };

export type BlockFixtureRef =
  | { comp: 'league';   date: string; homeId: string; awayId: string; round: number }
  | { comp: 'cup';      date: string; homeId: string; awayId: string; ref: CupFixtureRef }
  | { comp: 'european'; date: string; homeId: string; awayId: string; ref: EuropeanFixtureRef }
  | { comp: 'playoff';  date: string; homeId: string; awayId: string; ref: PlayoffMatchRef };
