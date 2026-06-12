# WP 0 — Baseline Freeze

> Spatial Engine Upgrade, work package 0 of 9. Master plan: [`Upgrade.md`](../../Upgrade.md) § 13 (calibration), § 12 (performance budget), § 14 (roadmap row).

| | |
|---|---|
| **Recommended model** | **Sonnet** — scripted measurement and constants extraction; no architectural judgment required. |
| **Depends on** | nothing (first WP) |
| **Unlocks** | every later WP's telemetry gate |
| **Size** | 1–2 commits |

## Objective

Freeze the legacy engine's statistical behaviour as committed, machine-checkable acceptance bands, and add the silent-fixture timing assertion — so every subsequent WP has an objective "did we break balance / performance?" gate before any spatial code exists.

## Pre-read

`CLAUDE.md` (full), `Upgrade.md` §§ 12–13, `scripts/telemetry.ts`, `scripts/checkSilentScores.ts`, `telemetry/latest.md`.

## Deliverables

1. **`scripts/spatialBaselines.ts`** — exported constants: the frozen bands from `Upgrade.md` § 13 (tries 3.9 ± 0.5, combined points 25.3 ± 3, penalties 9.9 ± 1.5, tackles attempted/made 56.2/54.4 ± 6, carries 32.9 ± 5, turnovers 2.0 ± 0.5, knock-ons 2.4 ± 0.6, home-win share 55.3% ± 5pp). **Re-measure before freezing**: run `npm run telemetry` against the current commit; if current means differ from the § 13 table (telemetry drifts with balance commits), freeze the *measured* values and update `Upgrade.md` § 13 in the same commit.
2. **`scripts/checkSpatialBands.ts`** — runs the telemetry fixture pool (reuse the harness internals from `telemetry.ts`; do not duplicate the simulation driver) and asserts every § 13 metric is within band. Exits non-zero with the offending metric named. Wire into `npm run verify` **behind a fast mode** if full 450-fixture telemetry is too slow for verify — acceptable fallback: assert on 1 root seed (90 fixtures) in verify, all 5 seeds in CI/on demand.
3. **Timing assertion** in `scripts/checkSilentScores.ts`: measure wall-clock per silent fixture, assert mean < current mean + 250 ms headroom (the budget from `Upgrade.md` § 12). Record the current mean as a constant in `spatialBaselines.ts`.

## Steps

1. Run `npm run telemetry` twice on the 5 root seeds; confirm metric means are stable run-to-run (they must be — it's seeded; if not, stop and report).
2. Extract the measured means into `spatialBaselines.ts` with the § 13 band widths.
3. Build `checkSpatialBands.ts`; confirm it passes against the unmodified engine on all 5 root seeds.
4. Add the timing assert to `checkSilentScores.ts`.
5. Reconcile `Upgrade.md` § 13 numbers with the measured values if they drifted.

## Out of scope

No `src/engine/` changes of any kind. No new balance files. No spatial code.

## Gate (definition of done)

- [ ] `npm run build` clean (verify scripts are `tsx`-run but must typecheck if included in `tsc` scope — match how existing `scripts/*.ts` are handled)
- [ ] `npm run verify` green, now including the band check
- [ ] `checkSpatialBands.ts` passes on all 5 root seeds (0xdeadbeef, 0xcafebabe, 0xbeefcafe, 0xfacefeed, 0xc0ffee00)
- [ ] Timing assert passes with current engine
- [ ] `Upgrade.md` § 13 matches the frozen constants exactly

## Doc-sync (per CLAUDE.md)

Code-only scripts change → no engine doc updates required. If `Upgrade.md` § 13 numbers are corrected, that edit lands in the same commit. **`src/` untouched → no version bump for the scripts-only portions is NOT applicable** — `scripts/` changes are code: run build + verify, bump `src/version.ts` only if `src/` is touched (it should not be in this WP, so no bump).
