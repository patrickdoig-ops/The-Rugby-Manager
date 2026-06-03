// Tuning constants for the Phase 1.1 scouting system.
// Consumed by src/game/scouting.ts; Phase B wires them into the weekly
// SCOUTING_ACCURACY_ADVANCED event flow.

// accuracy → half-width of the displayed stat band. Linearly interpolated
// between knots. Integer knot values keep displayed bands as whole numbers.
//   accuracy   0 → ±10   (wide fog; only reputation / age gives signal)
//   accuracy  50 → ±4
//   accuracy  90 → ±1    (near-certain; one or two points either side)
//   accuracy 100 → ±0    (exact; same as own squad)
export const BAND_CURVE: readonly { accuracy: number; halfWidth: number }[] = [
  { accuracy:   0, halfWidth: 10 },
  { accuracy:  50, halfWidth:  4 },
  { accuracy:  90, halfWidth:  1 },
  { accuracy: 100, halfWidth:  0 },
] as const;
