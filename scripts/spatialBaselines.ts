// Frozen acceptance bands for the engine's statistical behaviour.
//
// These constants are the calibration baseline for the Spatial Engine Upgrade
// (Upgrade.md § 13). Every subsequent work package must keep `npm run telemetry`
// within band — `checkSpatialBands.ts` enforces this mechanically.
//
// Original values were measured on commit e0d4029 (5 root seeds × 90 fixtures =
// 450 fixtures), confirmed stable across two consecutive runs before being frozen.
//
// RE-BASELINED 2026-06 for the owner's scoring rebalance (maul tries nerfed, open-
// play tries lifted via the cover-beat run-on): the TARGET distribution moved, so
// tries / points / tackles-made / turnovers / home-win are re-centred on the new
// measured 5-seed means (band WIDTHS unchanged). The other metrics were unaffected
// and keep their original legacy baselines.
//
// Band widths are as specified in Upgrade.md § 13.

/** Tries per match (combined both teams). Owner target ~5.5 (was 4.0). Band: ±0.5. */
export const BASELINE_TRIES_PER_MATCH     = 5.5;
export const BAND_TRIES_PER_MATCH         = 0.5;

/** Combined points per match (both teams). Measured mean: 35.9 (was 26.2). Band: ±3. */
export const BASELINE_POINTS_PER_MATCH    = 35.9;
export const BAND_POINTS_PER_MATCH        = 3.0;

/** Penalties conceded per match (combined both teams). Measured mean: 11.4. Band: ±1.5. */
export const BASELINE_PENALTIES_PER_MATCH = 11.4;
export const BAND_PENALTIES_PER_MATCH     = 1.5;

/** Tackles attempted per match (combined both teams). Measured mean: 67.6. Band: ±6. */
export const BASELINE_TACKLES_ATT_PER_MATCH = 67.6;
export const BAND_TACKLES_ATT_PER_MATCH     = 6.0;

/** Tackles made per match (combined both teams). Measured mean: 56.4 (was 65.7). Band: ±6. */
export const BASELINE_TACKLES_MADE_PER_MATCH = 56.4;
export const BAND_TACKLES_MADE_PER_MATCH     = 6.0;

/** Carries per match (combined both teams). Measured mean: 39.8. Band: ±5. */
export const BASELINE_CARRIES_PER_MATCH  = 39.8;
export const BAND_CARRIES_PER_MATCH      = 5.0;

/** Turnovers won per match (combined both teams). Measured mean: 1.8 (was 2.5). Band: ±0.5. */
export const BASELINE_TURNOVERS_PER_MATCH = 1.8;
export const BAND_TURNOVERS_PER_MATCH     = 0.5;

/** Knock-ons per match (combined both teams). Measured mean: 3.0. Band: ±0.6. */
export const BASELINE_KNOCKONS_PER_MATCH = 3.0;
export const BAND_KNOCKONS_PER_MATCH     = 0.6;

/** Home win share (percentage of matches won by the home team). Measured mean: 56.5% (was 51.6%). Band: ±5pp. */
export const BASELINE_HOME_WIN_SHARE_PCT = 56.5;
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
