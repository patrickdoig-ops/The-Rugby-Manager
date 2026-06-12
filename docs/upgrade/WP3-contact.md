# WP 3 — Contact: the Two-Phase Tackle

> Spatial Engine Upgrade, work package 3 of 9. Master plan: [`Upgrade.md`](../../Upgrade.md) § 5.5 (contact model), § 4.1 (seam contract), § 13 (calibration), § 14 (kill criteria — evaluated after this WP).

| | |
|---|---|
| **Recommended model** | **Sonnet** — the formulas, inputs, outcome bands, and event vocabulary are fully specified in `Upgrade.md` § 5.5 and below; the work is faithful implementation + calibration against known distributions. Escalate to Opus only if calibration can't converge after two tuning passes (that's also the kill-criteria checkpoint). |
| **Depends on** | WP 2 |
| **Unlocks** | WP 4 (ruck context derives from tackle outcomes) |
| **Size** | 3–4 commits (ContactSystem / event wiring / scenarios + calibration) |

## Objective

Replace the legacy contact-outcome handoff from WP 2 with the spatial two-phase tackle: evasion (geometry-aware) then collision dominance, resolved in `ContactSystem` at radius intersection, emitting the existing event vocabulary so ratings/commentary/stats are untouched.

## Pre-read

`CLAUDE.md` (full), `Upgrade.md` §§ 5.5, 10, 13, WP 2 landed code, `src/engine/balance/tackling.ts` + `carrying.ts` + `offload.ts` (legacy distributions to match), `docs/match-engine.md` § collision/carry (exact current event emissions: `CARRY_RESOLVED`, `OFFLOAD_ATTEMPTED/COMPLETED`, `BREAKDOWN_HIT`, the `CollisionResult` vocabulary `dominant_carry` / `dominant_tackle` / `broken_tackle`), `src/types/player.ts` (`PlayerMatchStats` fields fed by these events: tacklesAttempted/Made, dominantTackles, defendersBeaten, lineBreaks, metresCarried, knockOns).

## Deliverables

### 1. `src/engine/spatial/ContactSystem.ts`

Triggered when a defender's radius intersects the carrier (radii in `balance/spatialTackle.ts`):

**Phase 1 — Evasion.** Attacker score from (`agility`, `pace`); defender score from (`positioning`, `tackling`); ± `rngSpatial` band; **approach-geometry modifier** — compute the defender's approach angle relative to the carrier's velocity: square-on approach gets the full defender score, chasing from behind is penalised, head-on slightly boosted. Weights, band, and geometry curve all in `balance/spatialTackle.ts`. Win → broken tackle: defender gets a recovery lockout (he is physically behind play and must steer back), carrier continues; emit defenders-beaten/line-break stat events per the legacy vocabulary.

**Phase 2 — Collision dominance.** Defender (`tackling`, `strength`) vs carrier momentum (`strength`, **current speed from the World** — a carrier hit at full tilt is harder to stop; this is the spatial engine's value-add), both reduced by live fatigue. Outcome bands → `dominant_tackle` / neutral / `dominant_carry` + offload window. In the offload window, roll offload attempt (carrier `handling`, support proximity *measured in the World*) → `OFFLOAD_ATTEMPTED`/`OFFLOAD_COMPLETED` with the existing payloads.

All outcomes terminate in the same downstream as today: tackle → breakdown context (position, tackler, carrier) for the Breakdown phase; events through `PhaseResult.events`; **no new `MatchEvent` variants expected** — if one proves necessary, follow CLAUDE.md § 6 (union variant + reducer branch + doc-sync, same commit).

### 2. Calibration

The legacy engine's outcome distributions are the target (`Upgrade.md` § 13): dominant/neutral/passive split must match the baseline dominant-tackles rate (9.5/match), tackle completion (54.4 of 56.2), offload rates, knock-on contribution. Expect 2 tuning passes over `balance/spatialTackle.ts`. **Record the final constants in `docs/match-engine.md` with real numbers** (CLAUDE.md doc-sync: the doc carries the actual number, never "see balance/X.ts").

### 3. Scenarios

- Prop at full speed vs lightweight back square-on → dominant carry majority.
- Jackal-class openside chasing from behind vs stepping fly-half → high evasion rate.
- Fatigued (80 %+) defender vs fresh carrier → dominance distribution shifts measurably vs both-fresh.
- Offload window: passive tackle with support runner ≤ N metres → offload attempt rate within band; isolated (no support) → near-zero attempts.

## Out of scope

Ruck formation/commitment (WP 4 — this WP ends at "tackle completed, breakdown context handed over"). Attack shape (WP 5). Double-tackles/choke tackles — **not in v1 anywhere**; do not add speculatively (CLAUDE.md § 3).

## Gate (definition of done)

- [ ] `npm run build` + `npm run verify` green
- [ ] WP 0 bands pass — tackles attempted/made, dominant tackles, knock-ons, tries all in band
- [ ] All four scenarios pass across seeds
- [ ] Silent-fixture timing within budget
- [ ] Frame-debugger review: hits look like hits (carrier momentum visibly matters; beaten defenders visibly recover)
- [ ] **Kill-criteria checkpoint** (`Upgrade.md` § 14): explicit owner sign-off that the spatial match ≥ legacy credibility before WP 4 proceeds
- [ ] Version bump

## Doc-sync (per CLAUDE.md)

- `docs/match-engine.md`: collision/carry section rewritten for the spatial path — both phases' formulas with the final tuned constants, the geometry modifier curve, outcome bands, event emissions.
- `Upgrade.md` § 14: mark WP 3 landed + kill-criteria checkpoint outcome.
