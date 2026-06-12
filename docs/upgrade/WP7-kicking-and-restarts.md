# WP 7 — Kicking + Restarts

> Spatial Engine Upgrade, work package 7 of 9. Master plan: [`Upgrade.md`](../../Upgrade.md) § 5.7 (kicking & aerial contest), § 4 phase map (KickOff / DropOut22 / TacticalKick / BoxKick / KickReturn rows).

| | |
|---|---|
| **Recommended model** | **Sonnet** — trajectory maths, chase assignment, and the aerial contest are formula work with clear legacy distributions to match; the strategic layer (`KickDecisionDirector`) is explicitly retained, which removes the judgment-heavy half of the problem. |
| **Depends on** | WP 5 (chase/receipt use the shape + layer systems); independent of WP 6 |
| **Unlocks** | WP 8 |
| **Size** | 4–5 commits (trajectory + height scalar / chase & receipt / aerial contest / restarts / scenarios + calibration) |

## Objective

Spatial *execution* for every kick in open play and all restarts: real trajectories with hang time and dispersion, chase lines, backfield coverage, contested or clean takes — while kick *strategy* (when/what to kick) stays with `KickDecisionDirector` untouched. Covers `TacticalKick`, `BoxKick`, `KickOff`, `DropOut22`, `KickReturn`.

## Pre-read

`CLAUDE.md` (full), `Upgrade.md` §§ 4, 5.7, WP 5 landed code, `src/engine/KickDecisionDirector.ts` (**retained — its outputs become execution orders**), `src/engine/resolvers/KickingResolver.ts` + `BoxKickResolver.ts` + `KickOffResolver.ts` + `DropOutResolver.ts` (being replaced at the execution level — inventory events + outcome rates: `good_kick`/`poor_kick`/`knock_on_catch`, `clean_receive`/`knock_on`/`short_kick_retain`/`poor_kick`), 50:22 + `FIFTY_22_ATTEMPTED` handling, `src/engine/balance/kicking.ts` + `kickDecision.ts`, remaining `rngPosition` consumers (kick launch angles — this WP migrates them to the spatial model or retires them; inventory first).

## Deliverables

### 1. Trajectory model — `src/engine/spatial/KickFlight.ts`

Launch from kicker position: range/hang from `kicking` (+ kick type: bomb high/short, box steep, grubber ground-bounce, touch-finder flat), landing dispersion via `rngSpatial`, **render-only height scalar** per micro-tick in the frame stream (`Upgrade.md` § 8.1 — never in `MatchState`, invariant § 2.6). Touch detection at the existing lines; 50:22 qualification reuses the existing rule path and emits `FIFTY_22_ATTEMPTED` exactly as today. Constants in `balance/kicking.ts` additions (or `spatialSteering.ts` where movement-related) — keep one home per concern, no duplicates.

### 2. Chase & receipt (via WP 5's layer stack)

- **Chase**: chasers assigned by proximity + derived work rate; chase line as Layer-1 targets timed against ball flight. The non-chasing line reorganises (existing fold model).
- **Receipt**: backfield (`backfieldDefence` posts from WP 2) converge on the projected landing point; receipt pods for kick-offs (3 pods deep, per staged formation data).
- **The contest decision is geometric**: chaser arrival time vs hang time → contested take or clean catch — *this replaces the legacy probabilistic kick-outcome roll*, which is the point of the WP.

### 3. Aerial contest

Contested take: receiver (`handling`, derived aerial from `agility`/`positioning`) vs chaser pressure, fatigue-reduced, `rngSpatial` band → clean take / spilled (`KNOCK_ON` vocabulary) / chaser take. Calibrate the composite outcome rates against the legacy resolvers' distributions (WP 0 bands + kick-specific rates measured from the legacy engine before starting — record them in the PR).

### 4. Restarts spatially (`KickOff`, `DropOut22`, `KickReturn`)

Same machinery + staged starting formations (kick-off receipt pods, chase wall). `KickReturn`: the returner runs the WP 5 carrier utility AI (counter / return kick handoff / pass to pod) against the arriving chase. Kick-off strategy modal (`high_ball`/`short_kick`/`grubber`) keeps its existing flow — strategies map to trajectory profiles.

### 5. Scenarios

- **Hang-time trade-off**: long flat kick → clean catch + counter space; steep bomb → contested majority.
- **50:22**: occurs at the legacy baseline rate across the telemetry pool (band from WP 0 measurement).
- **Box-kick escape**: pressured box from own 22 vs competent chase → territory distribution matches legacy.
- **Short kick-off retain**: `short_kick` strategy → retain rate within legacy band.

## Out of scope

Kicks at goal / conversions (staged, existing maths — WP 8 staging only). Kick *decision* logic (retained). Weather/wind — not in v1, do not add speculatively.

## Gate (definition of done)

- [ ] `npm run build` + `npm run verify` green
- [ ] WP 0 bands + kick-specific legacy rates in band (50:22, retain rates, kick outcome split)
- [ ] All four scenarios pass
- [ ] Frame-debugger review: ball arcs (height scalar present in frames), chase lines look like chase lines, backfield rotates
- [ ] `rngPosition` consumer inventory resolved (migrated or documented as retained)
- [ ] Silent-fixture timing within budget
- [ ] Version bump

## Doc-sync (per CLAUDE.md)

- `docs/match-engine.md`: kicking + restart sections rewritten (trajectory model, chase/receipt, aerial contest — final constants; which resolvers are replaced at execution level, what `KickDecisionDirector` still owns); Determinism § if `rngPosition`'s role changed.
- `Upgrade.md` § 14: mark WP 7 landed.
