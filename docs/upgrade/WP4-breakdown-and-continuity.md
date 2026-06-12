# WP 4 — Breakdown Commitment + World Continuity

> Spatial Engine Upgrade, work package 4 of 9. Master plan: [`Upgrade.md`](../../Upgrade.md) § 5.6 (ruck commitment), § 3 (continuity rule), § 4 phase map (Breakdown row), § 11 (determinism).

| | |
|---|---|
| **Recommended model** | **Opus** — two determinism-sensitive systems at once: the commitment heuristic must feed the *proven* `BreakdownResolver` without disturbing its RNG consumption order, and World persistence across phases changes the substrate's lifecycle contract. Subtle bugs here (a desync, a teleport, a double-build) poison every later WP. |
| **Depends on** | WP 3 |
| **Unlocks** | WP 5 (persistent folding defences are what make overlaps meaningful) |
| **Size** | 4–5 commits (commitment heuristic / resolver input wiring / World persistence / scenarios / debugger continuity check) |

## Objective

Two coupled deliverables: (1) per-player heuristic ruck commitment whose body count + quality feed the existing `BreakdownResolver` formula as inputs; (2) the World **persists across contiguous spatial phases** (PhasePlay → Breakdown → PhasePlay → …) so defences are genuinely mid-fold when play resumes and nothing teleports.

## Pre-read

`CLAUDE.md` (full), `Upgrade.md` §§ 3 (continuity rule — read twice), 5.6, 11, WP 2–3 landed code, `src/engine/resolvers/BreakdownResolver.ts` (**the formula being fed — understand its inputs and its RNG draws exactly; it is NOT being replaced**), `src/engine/balance/breakdown.ts`, `docs/match-engine.md` § breakdown (tactical caps: `attackingBreakdown`/`defendingBreakdown` semantics).

## Deliverables

### 1. Commitment heuristic — `src/engine/spatial/RuckCommitment.ts`

On tackle completion (from WP 3's `ContactSystem`), every agent within an eligibility radius scores commit-vs-reform per decision tick during the breakdown's micro-tick window (`Upgrade.md` § 5.6 table):

| Factor | Source |
|---|---|
| Team tactical cap | `attackingBreakdown` / `defendingBreakdown` tactics — base incentive → 0 at cap |
| Carrier isolation | **real measured distance** to nearest support in the World |
| Specialisation | `breakdown` stat — weights ruck over line |
| Override threshold | specialisation + threat > threshold beats the cap |

Committed agents physically converge (steering targets at the ruck mark); everyone else gets reform targets (defensive fold from WP 2; attacking placeholder shape until WP 5). All weights/thresholds/radii in **`balance/spatialRuck.ts`**.

### 2. Feeding `BreakdownResolver` — inputs, not replacement

The resolver's existing attack-vs-defence contest formula stays **byte-for-byte**. The spatial layer modifies its *inputs*: committed body count and the quality (breakdown stats, fatigue) of those specific bodies replace whatever player-selection the resolver does today — study how it currently picks contest participants and substitute the spatially-committed set via its existing parameters. **Critical determinism constraint:** the resolver's own draws stay on the outcome stream (`rng`) in their existing order; all spatial commitment draws use `rngSpatial`. If the resolver's participant selection itself consumes outcome-stream draws today, preserve those draws (consume-and-ignore is acceptable with a comment) OR re-derive its order carefully — telemetry bands are the tripwire. The `BreakdownResult` vocabulary (clean/slow/turnover/penalty) and all downstream consumers are untouched.

### 3. World continuity — lifecycle upgrade in `SpatialSimulator` / router seam

Per `Upgrade.md` § 3: the World **persists across contiguous spatial phases** and is rebuilt from `MatchState` only when spatial play resumes after a statistical/staged phase (scrum, lineout, penalty, etc.) or a full stoppage. Implementation contract:

- One owner: `MatchCoordinator` holds the World reference (alongside `clock`/`fatigue`); `SpatialSimulator` receives it.
- `ensureWorld(state)`: rebuild if absent **or** if the previous phase was non-spatial; else continue with current positions.
- On rebuild, seed positions from `MatchState` + the staged formation appropriate to the entry context (placeholder formations until WP 8 staging lands).
- Invalidate on: substitutions (re-bind the slot's agent), cards (remove/return agents — sync with `onFieldPlayers` filtering), half-time (attack direction flips — rebuild, don't mirror in place), `POSITION_SWAP`.
- The World remains engine-internal: never serialised, never in `MatchState`, no save impact (`Upgrade.md` § 3).

### 4. Scenarios

- **Isolation jackal**: carrier tackled with support ≥ N m and a high-`breakdown` defender adjacent → turnover rate materially above the supported case.
- **Cap override**: `minimal_ruck` attacking cap + isolated carrier → specialist support commits anyway (override fires).
- **Continuity**: scripted 10-phase same-way sequence → assert zero position discontinuities > ε between consecutive beats (programmatic teleport check, not just visual).
- **Fold fatigue compounding**: late-match fatigued defence over a 6-phase sequence → measurably wider/slower line by phase 6 (the overlap genesis mechanic, now persistent).

## Out of scope

Replacing the `BreakdownResolver` formula (explicitly retained; revisit only post-v1 with telemetry proof). Attack pods/shape (WP 5). Maul (stays statistical+staged, WP 8). Penalty staging (WP 8).

## Gate (definition of done)

- [ ] `npm run build` + `npm run verify` green
- [ ] WP 0 bands — turnovers (2.0 ± 0.5) and penalties (9.9 ± 1.5) especially
- [ ] All four scenarios pass; the continuity check is programmatic
- [ ] Frame-debugger review of a 10-phase sequence: bodies visibly arrive at rucks, line visibly folds, **no teleports**
- [ ] Silent-fixture timing within budget
- [ ] Version bump

## Doc-sync (per CLAUDE.md)

- `docs/match-engine.md`: breakdown section — commitment heuristic with final constants, the resolver-input seam, the World lifecycle/continuity contract (new subsection).
- `Upgrade.md` § 14: mark WP 4 landed.
