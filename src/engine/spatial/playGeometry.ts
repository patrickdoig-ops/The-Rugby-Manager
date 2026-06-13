// Play-overlay geometry (Upgrade.md § 7.1; WP6) — the ONE transform that turns a
// mark-relative, attack-oriented play waypoint into an absolute pitch coordinate.
// Both the overlay engine (PlayOverlay) and the Phase Animator play-editor preview
// apply this same transform, so a play authored to one side mirrors correctly in
// EITHER direction (attackDir) and off EITHER touchline (openSign) with no
// hand-mirrored data (CLAUDE.md § 4 — the data contract is the attack-oriented
// offset; the mirror is a runtime function of it).
//
//   fwd — along attackDir: +1 attacks toward x=100, −1 toward x=0.
//   lat — toward the open side: openSign +1 when the open side is +y, −1 when −y.
//
// Pure function over the play coordinate space; no rng, no World, no MatchState —
// it cannot perturb determinism. Coordinates are the 0–100 pitch (x = long axis,
// y = lateral) matching every other spatial consumer (Upgrade.md § 2.6).

import type { Vec2 } from './types';

// The open side is the wider half of the pitch from the mark — the same rule the
// ShapeSolver uses (mark.y <= 50 → open side is +y). Returned as a sign so a
// waypoint's `lat` mirrors to the live open side.
export function openSignFor(markY: number): 1 | -1 {
  return markY <= 50 ? 1 : -1;
}

// Transform an attack-oriented, mark-relative play offset into an absolute pitch
// point. `origin` is the play's anchor (the ruck / scrum / lineout mark);
// `attackDir` and `openSign` come from the live beat. Unclamped — the caller
// clamps to the pitch when it writes a steering target (the editor preview clamps
// for display); this keeps the transform a pure mirror with no policy baked in.
export function playPointToPitch(
  origin: Vec2,
  attackDir: 1 | -1,
  openSign: 1 | -1,
  fwd: number,
  lat: number,
): Vec2 {
  return {
    x: origin.x + attackDir * fwd,
    y: origin.y + openSign * lat,
  };
}
