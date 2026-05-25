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
  catchHandlingPenalty:    10,
  secondCarryAttackBonus:  10,
} as const;
