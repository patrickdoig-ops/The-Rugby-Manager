// Tuning for disciplinary infringements. Each constant feeds the matching
// pure resolver in `src/engine/resolvers/`. Probabilities are expressed as
// percentage points and consumed with `rng(1, 100) <= pct`.

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

// TMO review. When a high tackle is awarded, `triggerPct`% chance the TMO
// intervenes and we enter MatchPhase.TmoReview for 3 narrative ticks. Outcome
// is pre-rolled and bucketed by these weights (sum to 100); the narrative is
// pure replay.
export const TMO = {
  triggerPctHighTackle: 60,
  outcomeNoCardPct:     40,
  outcomeYellowPct:     40,
  outcomeRed20Pct:      20,
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
