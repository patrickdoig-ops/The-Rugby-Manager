// Tuning for the spatial substrate's steering + movement systems (Upgrade.md
// §§ 5.1, 10). Every number the steering/movement systems read lives here —
// no magic literals in src/engine/spatial/.
//
// Coordinate space is the existing 0–100 pitch (Upgrade.md § 2.6): x = long
// axis (try lines x=0/x=100), y = lateral (touchlines y=0/y=100). All speeds
// and accelerations below are expressed in coordinate-units per second.

// Sim micro-tick rate (Upgrade.md § 5.1). 10 Hz → dt = 0.1 s.
export const SPATIAL_TICK_HZ = 10;
export const SPATIAL_DT = 1 / SPATIAL_TICK_HZ;

// Pitch clamp bands — same semantics as the UI clampX [2,98] / clampY [3,97]
// (src/ui/pitchChoreography.ts). Duplicated here (not imported) because the
// engine never imports UI (CLAUDE.md § 5); these are the on-field bounds the
// MovementSystem keeps every agent within.
export const SPATIAL_CLAMP_X_MIN = 2;
export const SPATIAL_CLAMP_X_MAX = 98;
export const SPATIAL_CLAMP_Y_MIN = 3;
export const SPATIAL_CLAMP_Y_MAX = 97;

// ── Speed / acceleration derivation (Upgrade.md § 10) ─────────────────────
// Top speed = pace × fatigue curve; acceleration = agility (+ minor pace).
// Stats are authored 1–20 (see docs/team-data.md); the curve maps a 1–20
// attribute onto a coordinate-units/sec range linearly between MIN and MAX.

// Top speed (coord-units/sec) at the slowest (attr=1) and fastest (attr=20)
// pace, before fatigue scaling. A coord-unit on the long axis ≈ 1 metre
// (100 units over a 100m pitch), so ~9 u/s ≈ a 9 m/s sprinter.
export const TOP_SPEED_MIN = 4.0;
export const TOP_SPEED_MAX = 9.5;

// Acceleration cap (coord-units/sec²) at the least (attr=1) and most (attr=20)
// agile. Drives how fast desired velocity is reached — change of direction.
export const ACCEL_MIN = 6.0;
export const ACCEL_MAX = 14.0;

// Minor pace contribution to acceleration: a fraction of the pace-derived
// speed factor is folded into the agility-derived accel (Upgrade.md § 10
// "agility (+ pace minor)").
export const ACCEL_PACE_WEIGHT = 0.15;

// Fatigue curve: at fatiguePct = 0 a player runs at full derived speed; at
// fatiguePct = 100 they are scaled to FATIGUE_SPEED_FLOOR of it. Linear.
export const FATIGUE_SPEED_FLOOR = 0.7;

// ── Arrive behaviour ──────────────────────────────────────────────────────
// Arrival slowing radius (coord-units): inside it the desired speed ramps down
// linearly to zero at the target, so agents settle rather than oscillate.
export const ARRIVE_SLOW_RADIUS = 6.0;
// Distance (coord-units) within which an agent is considered to have arrived;
// desired velocity is zeroed to avoid jitter at the target.
export const ARRIVE_STOP_RADIUS = 0.3;

// ── Soft separation ───────────────────────────────────────────────────────
// Agents within SEPARATION_RADIUS of each other are pushed apart so dots never
// stack (Upgrade.md § 5.1). Strength is the peak push speed (coord-units/sec)
// applied at zero distance, falling linearly to 0 at the radius edge.
export const SEPARATION_RADIUS = 2.5;
export const SEPARATION_STRENGTH = 4.0;

// Derive an agent's top speed (coord-units/sec) from pace and live fatigue.
export function deriveTopSpeed(pace: number, fatiguePct: number): number {
  const paceFrac = (clampAttr(pace) - 1) / 19;
  const base = TOP_SPEED_MIN + (TOP_SPEED_MAX - TOP_SPEED_MIN) * paceFrac;
  const fatigueFrac = clamp01(fatiguePct / 100);
  const fatigueScale = 1 - (1 - FATIGUE_SPEED_FLOOR) * fatigueFrac;
  return base * fatigueScale;
}

// Derive an agent's acceleration cap (coord-units/sec²) from agility + minor pace.
export function deriveAccel(agility: number, pace: number): number {
  const agilFrac = (clampAttr(agility) - 1) / 19;
  const paceFrac = (clampAttr(pace) - 1) / 19;
  const frac = clamp01(agilFrac + ACCEL_PACE_WEIGHT * paceFrac);
  return ACCEL_MIN + (ACCEL_MAX - ACCEL_MIN) * frac;
}

function clampAttr(v: number): number {
  return v < 1 ? 1 : v > 20 ? 20 : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
