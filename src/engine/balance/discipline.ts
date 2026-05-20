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
