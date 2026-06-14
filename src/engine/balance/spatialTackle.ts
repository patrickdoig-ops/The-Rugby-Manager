// Tuning for the WP3 two-phase spatial tackle (Upgrade.md § 5.5).
// All constants the ContactSystem reads live here — no magic literals in
// src/engine/spatial/ContactSystem.ts (CLAUDE.md balance rule).
//
// Phase 1 — Evasion: attacker (agility, pace) vs defender (positioning, tackling)
//   ± spatial-RNG noise, modified by approach geometry.
// Phase 2 — Collision dominance: defender (tackling, strength) vs carrier
//   (strength, current speed), both fatigue-reduced.
// Offload window: triggered on passive tackle, probability decays with support distance.

// ── Geometry modifier ─────────────────────────────────────────────────────
// Defender approach angle relative to carrier's velocity direction.
// cos(angle between carrier-vel and defender-vel):
//   +1 = chasing same direction (behind carrier) → penalty
//    0 = square-on (perpendicular) → full score
//   -1 = head-on (direct charge) → slight boost
export const GEOMETRY = {
  // cos threshold below which "chasing" penalty applies (cos > CHASE_THRESHOLD)
  chaseThreshold:   0.6,   // |angleDiff| < ~53° from carrier direction
  // cos threshold below which "head-on" boost applies (cos < HEADON_THRESHOLD)
  headOnThreshold: -0.6,   // |angleDiff| > ~127° from carrier direction
  chaseMult:        0.65,  // defender score × this when chasing from behind
  squareOnMult:     1.0,   // full score when perpendicular
  headOnMult:       1.1,   // slight boost for direct charge
} as const;

// ── Phase 1 — Evasion weights ─────────────────────────────────────────────
// Attacker: agility + pace (baseStats 1–100 range)
// Defender: positioning + tackling (baseStats 1–100 range)
export const EVASION = {
  attackerAgilityWeight: 0.5,
  attackerPaceWeight:    0.5,
  defenderPositioningWeight: 0.5,
  defenderTacklingWeight:    0.5,
  // Noise band: spatial-RNG draw in [-NOISE, NOISE] added to each side's score.
  // ±15 matches the legacy rng(1,20) jitter band.
  noiseBand: 15,
  // First-phase set-defence bonus (WP6). A strike off a scrum/lineout meets the
  // most ORGANISED defence of the sequence — a square, connected line — so the
  // carrier beats his man 1-on-1 LESS often than in broken-field phase play (where
  // the fold leaves the overlaps). Added to the DEFENDER's evasion score ONLY on a
  // FirstPhase carry (phase play passes 0, unchanged); converts the over-broken
  // first-phase clean breaks into dominant tackles / contact, bringing spatial
  // first-phase line breaks back to the legacy ~13.3/match rate.
  firstPhaseDefenderBonus: 18,
} as const;

// ── Phase 2 — Collision weights ───────────────────────────────────────────
// Carrier momentum: strength + normalised current speed (from World vel magnitude)
// Defender power:   tackling + strength
// Both reduced by live fatigue.
export const COLLISION = {
  carrierStrengthWeight: 0.5,
  carrierSpeedWeight:    0.5,
  defenderTacklingWeight: 0.6,
  defenderStrengthWeight: 0.4,
  // Fatigue reduction: both sides × (1 - fatigue * scale). At full fatigue
  // (100%) output is reduced to (1 - scale) of full. 0.3 → 70% at 100% fatigue.
  fatigueScale: 0.3,
  // Dominant carry / tackle margin thresholds. Calibrated to mirror legacy
  // OPEN_PLAY_VALUES dominantCarryMargin=5 / dominantTackleMargin=-5 on the
  // 1–100 stat scale (spatialTackle uses baseStats, not currentStats; total
  // possible range is much wider, so margins are wider too).
  dominantCarryMargin:  10,
  dominantTackleMargin: -10,
} as const;

// ── Offload window ────────────────────────────────────────────────────────
// Fires only on play_on or dominant_tackle outcome (not on dominant_carry —
// the carrier won, he chooses to keep it).
// Support proximity (same side, not carrier) measured from World positions.
export const OFFLOAD = {
  // Distance within which a support player triggers a meaningful offload chance.
  maxSupportDist: 15,
  // Offload attempt probability at minimum distance (≤ 0 units away) — scaled
  // linearly down to near-zero at maxSupportDist and beyond. This is then
  // multiplied by the team's offloadStrategy base rate (OFFLOAD_VALUES).
  attemptBase: 0.6,
  // Catch gate: probability that the offload recipient actually catches it.
  // Handling-based (higher handling → better catch). Applied as a linear
  // scale using this weight on catcher's handling stat (1–100).
  catchHandlingWeight: 0.008,  // at handling=100: catch prob = 0.8
  catchBase:           0.1,    // floor catch prob (even worst handler catches occasionally)
} as const;

// ── Contact geometry ──────────────────────────────────────────────────────
// Distance (coord-units) at which a defender's radius intersects the carrier.
// The spatial positions are in 0–100 pitch coords; 1 unit ≈ 1 metre.
export const CONTACT_RADIUS = 2.2;

// Seeding clear-space guard (WP3 contact-timing fix). When seedFormation snaps
// defenders onto their line slots, any defender whose seeded position falls within
// CONTACT_RADIUS + SEEDING_CLEAR_MARGIN of the carrier is nudged away along
// attackDir so no defender can be inside contact range at t=0. A carry must
// always START in space — an instant tackle at spawn is not a rugby play.
// The margin adds a small buffer so the first tick of movement cannot
// immediately re-enter contact range before the launch grace fires.
export const SEEDING_CLEAR_MARGIN = 0.8;

// Launch grace (WP3 contact-timing fix). Contact detection is suppressed until
// the carrier has run at least LAUNCH_GRACE_TICKS micro-ticks AND covered at
// least LAUNCH_GRACE_DIST coord-units from the carry start. This represents
// the carrier receiving the ball and running onto it — a real rugby carry
// always has a non-trivial engagement distance before the tackle fires.
export const LAUNCH_GRACE_TICKS = 3;
export const LAUNCH_GRACE_DIST  = 1.5;

// How far behind the carrier a beaten defender is repositioned (recovery lockout).
// He is physically behind play and must steer back. Along the attackDir axis.
export const RECOVERY_LOCKOUT_DIST = 6.0;
