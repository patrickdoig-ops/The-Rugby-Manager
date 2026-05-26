// Tuning for disciplinary infringements. Each constant feeds the matching
// pure resolver in `src/engine/resolvers/`. Probabilities are expressed as
// percentage points and consumed with `rng(1, 100) <= pct`.

import type { PenaltyOffence } from '../../types/engine';

// Per-offence behaviour table. Single source of truth for the TMO gate (and
// any future offence-level metadata). CardHandler reads OFFENCE_SPEC[offence]
// instead of hardcoding offence names — adding a new TMO-eligible offence is
// a one-line registry edit. `tmoTriggerPct` of 0 means the offence never
// triggers a TMO review. When > 0, CardHandler rolls vs rng(1,100); on hit
// it enters MatchPhase.TmoReview with outcome bucketed by the global TMO
// weights (outcomeNoCardPct / outcomeYellowPct / outcomeRed20Pct).
export interface OffenceSpec {
  tmoTriggerPct: number;
}
export const OFFENCE_SPEC: Record<PenaltyOffence, OffenceSpec> = {
  breakdown_infringement: { tmoTriggerPct:  0 },
  scrum_infringement:     { tmoTriggerPct:  0 },
  high_tackle:            { tmoTriggerPct: 90 },
  offside_at_ruck:        { tmoTriggerPct:  0 },
  obstruction:            { tmoTriggerPct:  0 },
  dangerous_cleanout:     { tmoTriggerPct: 90 },
  not_rolling_away:       { tmoTriggerPct:  0 },
  // maul_collapse uses a direct yellow path inside CardHandler, NOT TMO.
  // Keep tmoTriggerPct at 0 — see MAUL_COLLAPSE_YELLOW in balance/maul.ts.
  maul_collapse:          { tmoTriggerPct:  0 },
};

// High tackle probability per completed tackle attempt. Combines the
// tackler's tackling technique with their discipline rating, pivoting around
// 50 — a 50/50 tackler sits at the baseline; a poor-disciplined, poor-tackling
// defender is materially more likely to give one away than a clean technician.
// `minPct` keeps even an elite tackler vulnerable to an occasional honest
// mistake; without it, top-tier rosters (avg 80/75) drive `pct` negative and
// never give one away. Skipped on line breaks (no completed tackle to be high).
export const HIGH_TACKLE = {
  basePct:          8,
  tacklingWeight:   0.1,
  disciplineWeight: 0.1,
  minPct:           2.5,
} as const;

// TMO review outcome weights — global, applied to ANY offence whose
// OFFENCE_SPEC entry has tmoTriggerPct > 0. Sum to 100. The trigger
// probability itself is per-offence and lives in OFFENCE_SPEC above.
export const TMO = {
  outcomeNoCardPct: 25,
  outcomeYellowPct: 65,
  outcomeRed20Pct:  10,
} as const;

// Sin-bin durations in game minutes. Yellow returns; red_20 expires to sentOff
// and triggers a forced substitution if the bench has a player.
export const SIN_BIN_DURATION = {
  yellow: 10,
  red_20: 20,
} as const;

// Team 22 rule. Each defensive penalty in the offender's own 22 increments the
// per-team counter. At `warnAt`, the referee warns the captain. At `cardAt`,
// the offender of that penalty receives an automatic yellow (no TMO).
export const TEAM_22 = {
  warnAt: 3,
  cardAt: 4,
} as const;

// Short-handed modifiers. When backs are off the field (yellow/red_20/red_full),
// the defending side's wide-defence weakens — fold this into defendMod alongside
// the existing `backfieldLineBreakPenalty`. The scrum/lineout/breakdown weakening
// for missing forwards is handled naturally by the sum-based ScrumResolver and
// by selection-pool shrinkage in LineoutResolver / BreakdownResolver — no
// dedicated constants needed.
export const SHORT_HANDED = {
  missingBackDefendPenalty: -8,   // per missing back; added to defendMod (negative = worse)
} as const;

// AI penalty decision — tap-and-go in the close-range zone. When the
// penalty is awarded between `closeRangeMinMetres` and `closeRangeMaxMetres`
// from the opposition try line, the AI rolls `rng(1, 100) <= closeRangePct`
// to take a quick tap instead of the certain 3 from a goal kick (silent mode)
// or the kick-to-touch default (live mode). Sized so tap-and-go appears as
// an occasional surprise — frequent enough to register in the penalty-decision
// telemetry, rare enough that goal kicks stay the dominant choice in the 22.
export const TAP_AND_GO_AI = {
  closeRangeMinMetres: 5,
  closeRangeMaxMetres: 10,
  closeRangePct:       30,
} as const;
