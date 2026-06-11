import type { OffloadStrategy } from '../../types/team';

// Offload tuning. Carriers heading into contact (no line break) may
// unload the ball to a position-matched supporting teammate. The catch
// gate is harder than a normal pass — the carrier is under pressure.
//
// `attemptPctByStrategy` is the per-team trigger rate, looked up from
// `attackTeam.tactics.offloadStrategy`. Span is wide enough to make the
// dimension meaningful: cautious teams keep the ball off the deck
// (~2 offloads/match league-wide), offload_freely teams keep it alive
// (~9/match), with balanced retaining the original 20% baseline.

export const OFFLOAD_VALUES = {
  attemptPctByStrategy: {
    cautious:        8,
    balanced:        20,
    offload_freely:  35,
  } as Record<OffloadStrategy, number>,
  maxChain:                2,
  // Lifted from 10 to 13 in v2.181a after the controlled mirror-match
  // experiment showed offload_freely +2.6 margin vs balanced with the
  // knock-on rate barely moving — the supposed handling gate wasn't
  // biting. The +3 here is a gentle nudge (offload_freely sees ~3.6
  // completed offloads/match in the experiment; raising the catch-gate
  // penalty turns a chunk of those into knock-ons).
  catchHandlingPenalty:    13,
  secondCarryAttackBonus:  10,
} as const;
