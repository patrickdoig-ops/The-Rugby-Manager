// Frozen acceptance bands for the legacy engine's statistical behaviour.
//
// These constants are the calibration baseline for the Spatial Engine Upgrade
// (Upgrade.md § 13). Every subsequent work package must keep `npm run telemetry`
// within band — `checkSpatialBands.ts` enforces this mechanically.
//
// Values were measured by running `npm run telemetry` (5 root seeds, 90 fixtures
// each = 450 fixtures total) on commit e0d4029 and confirmed stable across two
// consecutive runs before being frozen here.
//
// Band widths are as specified in Upgrade.md § 13.

/** Tries per match (combined both teams). Measured mean: 4.0. Band: ±0.5. */
export const BASELINE_TRIES_PER_MATCH     = 4.0;
export const BAND_TRIES_PER_MATCH         = 0.5;

/** Combined points per match (both teams). Measured mean: 26.2. Band: ±3. */
export const BASELINE_POINTS_PER_MATCH    = 26.2;
export const BAND_POINTS_PER_MATCH        = 3.0;

/** Penalties conceded per match (combined both teams). Measured mean: 11.4. Band: ±1.5. */
export const BASELINE_PENALTIES_PER_MATCH = 11.4;
export const BAND_PENALTIES_PER_MATCH     = 1.5;

/** Tackles attempted per match (combined both teams). Measured mean: 67.6. Band: ±6. */
export const BASELINE_TACKLES_ATT_PER_MATCH = 67.6;
export const BAND_TACKLES_ATT_PER_MATCH     = 6.0;

/** Tackles made per match (combined both teams). Measured mean: 65.7. Band: ±6. */
export const BASELINE_TACKLES_MADE_PER_MATCH = 65.7;
export const BAND_TACKLES_MADE_PER_MATCH     = 6.0;

/** Carries per match (combined both teams). Measured mean: 39.8. Band: ±5. */
export const BASELINE_CARRIES_PER_MATCH  = 39.8;
export const BAND_CARRIES_PER_MATCH      = 5.0;

/** Turnovers won per match (combined both teams). Measured mean: 2.5. Band: ±0.5. */
export const BASELINE_TURNOVERS_PER_MATCH = 2.5;
export const BAND_TURNOVERS_PER_MATCH     = 0.5;

/** Knock-ons per match (combined both teams). Measured mean: 3.0. Band: ±0.6. */
export const BASELINE_KNOCKONS_PER_MATCH = 3.0;
export const BAND_KNOCKONS_PER_MATCH     = 0.6;

/** Home win share (percentage of matches won by the home team). Measured mean: 51.6%. Band: ±5pp. */
export const BASELINE_HOME_WIN_SHARE_PCT = 51.6;
export const BAND_HOME_WIN_SHARE_PCT     = 5.0;

// ── Timing baseline (Upgrade.md § 12) ────────────────────────────────────

/**
 * Mean wall-clock time per silent fixture measured on the current engine
 * (45-fixture one-way round-robin, ROOT_SEED = 0xDEADBEEF).
 *
 * Budget: current mean + 250 ms headroom (Upgrade.md § 12).
 * The timing assert in checkSilentScores.ts enforces mean < SILENT_FIXTURE_MEAN_MS + 250.
 */
export const SILENT_FIXTURE_MEAN_MS = 10;
