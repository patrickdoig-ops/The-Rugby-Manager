// Spatial decision / pass-mechanics tuning (Upgrade.md § 5.4, § 6 backline trio;
// WP5). All weights/distances/timings the spatial pass chain reads live here — no
// magic literals in src/engine/spatial/. Coordinates are the 0–100 pitch (x = long
// axis, y = lateral); a coord-unit on the long axis ≈ 1 metre.

// The PASS CHAIN that prefixes a spatial carry: the ball is swept from the
// scrum-half at the ruck, through the intervening backline, to the carrier at his
// receiving point, BEFORE he runs. Purely the ball's spatial path + the receiving
// geometry — the pass OUTCOME (knock-on / interception) stays on the legacy rng()
// rolls in OpenPlayEvent (the spatial chain is the visual + the where, not a re-roll).
export const PASS_CHAIN = {
  // Micro-ticks the ball spends in flight per pass (10 Hz, so 3 ≈ 0.3 s). Kept
  // short so the chain reads as crisp passing, not a slow lob.
  flightTicks: 3,

  // A BACK carrier receives the ball OUT WIDE in the backline (not at the ruck):
  // `receiveWidth` is how far toward the open side of the mark his receiving point
  // sits, `receiveDepth` how far behind the gain line (so he runs ONTO the line).
  // A FORWARD carrier ignores these — he engages from the ruck (the mark) as before.
  receiveWidth: 16.0,
  receiveDepth: 4.0,

  // Intervening receivers (e.g. the fly-half) are posted evenly along the line
  // between the ruck and the carrier's receiving point during the pass phase, at
  // this depth behind the gain line — a flat-ish backline the ball travels across.
  linkDepth: 3.0,
} as const;
