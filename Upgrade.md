# Upgrade.md — The 30-Agent Spatial Match Engine (TypeScript, Web)

**Goal: a Football Manager–quality match engine for rugby.** Matches are decided by where 30 players actually are and what they individually decide to do — line breaks happen because a runner beat the defensive line in space, turnovers happen because the carrier was isolated, overlaps happen because the defence folded too slowly. The 2D pitch stops being a visualisation of dice rolls and becomes a window onto a real simulation.

This document supersedes the platform choice in the "Master Engine Rebuild Specification V3" (Swift/SpriteKit) while keeping its best ideas. The spatial engine is built **in TypeScript, inside this codebase**, for these reasons established during review:

- **Performance is a non-issue.** 30 agents × ~30 neighbour checks × 10 ticks/sec ≈ 50k float ops/sec — roughly 0.01–0.05% of one core under V8's JIT. The wall this rebuild needs to worry about is *believability*, not throughput.
- **The season/career layer (~14k LOC), team data (~11k lines of JSON), 40 balance files, and the docs are the project's moat.** Building in-place keeps all of it live. A platform port can follow later, from a *proven* design (see § 12).
- **Decouple the two bets.** Bet 1: is emergent spatial rugby fun? Bet 2: should the product go native? Validating both simultaneously means a failure is undiagnosable. This plan is Bet 1.

What we take from V3: dynamic pod structures, heuristic ruck commitment, the two-phase tackle model, set pieces as statistical sub-engines, model/view separation, fixed sim tick + interpolated rendering.

What we reject from V3: Swift/SpriteKit (different bet), fixed-point integer math (lockstep-netcode tool; our determinism is already solved by seeded streams), full ECS (we have 31 entities, not 10,000 — plain arrays of plain objects, pre-allocated), and the inline magic numbers (every tuning value goes in `src/engine/balance/`).

---

## 1. Non-negotiable invariants (carried over from the current engine)

These survive the rebuild unchanged. They are why this is an *upgrade*, not a rewrite.

1. **`applyMatchEvent` stays the sole mutation boundary for `MatchState`.** The spatial sim produces *domain outcomes* — `TRY_SCORED`, `KNOCK_ON`, `CARRY_RESOLVED`, `TURNOVER_AT_BREAKDOWN` — as `MatchEvent`s, exactly as resolvers do today. Everything downstream (commentary, ratings, `PlayerMatchStats`, season aggregation, saves, telemetry) keeps working untouched.
2. **All randomness through `src/utils/rng.ts` seeded streams.** A new sixth stream, `rngSpatial(min, max)`, reset by `setMatchSeed`, isolates every spatial draw (steering jitter, decision noise) so the spatial sim can never perturb the outcome/positioning/commentary streams of phases still running on the legacy path. Same pattern, same reason, as `rngPosition`.
3. **`npm run verify` determinism gates stay green at every phase.** Same seed → same match, including every agent trajectory.
4. **Every tuning number in `src/engine/balance/`** — new files `spatialSteering.ts`, `spatialTackle.ts`, `spatialRuck.ts`, `spatialDecision.ts`, `spatialShape.ts`, barrel-exported from `balance/index.ts`.
5. **Engine never imports UI; UI reads via the event bus + display snapshots.** The spatial world adds a *render snapshot* per tick (see § 8) but the direction of dependency is unchanged.
6. **`state.ball.{x,y}` in 0–100 coordinates remains canonical at phase boundaries.** The spatial world uses the same 0–100 space (x = long axis, y = lateral) — no new coordinate system, no `pitchCoords` changes.
7. **Set pieces stay statistical.** Scrum, lineout, maul, kick-at-goal resolvers are kept as-is (V3 § 5 agrees). The spatial world receives their *outcome* (ball position, possession, quality) and resumes open play from it.
8. **Player data contract is unchanged.** The 12 authored `PlayerStats` drive everything via derivation (§ 5). No new authored attributes in v1 — `docs/team-data.md` stays the source of truth.

---

## 2. Architecture overview

```
MatchCoordinator.tick()                     (existing cadence, unchanged)
 ├─ ClockController / directors / cards     (unchanged)
 ├─ PhaseRouter.resolvePhase()
 │   ├─ legacy phases  → existing resolvers           (Scrum, Lineout, Maul,
 │   │                                                  kicks at goal, TMO, …)
 │   └─ spatial phases → SpatialSimulator.run(phase)  (open play, carry,
 │       │                                              tackle, breakdown,
 │       │                                              kick-chase — phased in)
 │       ├─ N micro-ticks @ 10 Hz over the World
 │       │   ├─ DecisionSystem   (carrier + off-ball intents)
 │       │   ├─ SteeringSystem   (desired velocity per agent)
 │       │   ├─ MovementSystem   (integrate, clamp, collision radii)
 │       │   └─ ContactSystem    (tackle / offload / break detection)
 │       └─ returns PhaseResult { events: MatchEvent[], frames: Frame[] }
 ├─ applyMatchEvent(queue)                  (unchanged mutation seam)
 └─ eventBus emits                          (unchanged)
```

**The `World` is engine-internal, not part of `MatchState`.** It holds the 30 agent records `{ slot, side, pos, vel, intent, fatigueSnapshot }` plus the ball. Rationale: `MatchState` stays the authoritative *discrete* game state (what saves, what invariants check, what replays mean); the World is a transient substrate that is **reconstructed deterministically** at each spatial-phase entry from `MatchState` (ball position, possession, phase, on-field players via `onFieldPlayers`) and discarded at exit. Mid-match saves and the existing save schema are therefore untouched — no `SAVE_VERSION` bump anywhere in this plan.

**Hybrid by design, permanently during the build.** `PhaseRouter` keeps its `PHASE_HANDLERS` map; spatial resolution replaces legacy resolvers *one phase at a time* behind the same `PhaseResult` contract. At every intermediate milestone the game is complete, shippable, and verifiable — there is no "big bang" cutover and no long-lived branch divergence.

**Agents are plain objects in a plain pre-allocated array.** No ECS, no component stores. Per CLAUDE.md § 3: zero per-tick allocation in the micro-tick loop (reuse vectors, mutate in place inside the World — the World is *not* behind `applyMatchEvent`; only its **outcomes** are).

---

## 3. The spatial model

### 3.1 Tick & integration

- Sim micro-tick: **10 Hz** (100 ms of game-world time per micro-tick at the presentation timescale; the mapping from micro-ticks to `gameMinute` is owned by the existing `ClockController` budget for the phase).
- Velocity-capped kinematics, no physics engine: `pos += vel * dt`, `vel` steered toward desired velocity with an acceleration cap. Top speed and acceleration derive from `pace` / `agility` / live `fatiguePct` (§ 5).
- Collision = overlapping radii triggers `ContactSystem`; agents otherwise repel softly (separation force) so dots never stack.

### 3.2 Defensive system (the half V3 under-specified — and the half that decides quality)

A defence that holds *shape* is what makes attacking play meaningful. Modelled top-down, not emergently — real defences are drilled systems:

- **Line model:** defenders are assigned slots on a defensive line anchored at the last breakdown/set piece, spaced laterally by the team's `defensiveLine` tactic (existing tactic dimension: rush/drift/shadow map to line speed and lateral bias). Each defender steers to *their slot*, not to the ball — that single rule produces realistic line integrity.
- **Backfield:** `backfieldDefence` (existing tactic) posts 1–2 players (fullback/wings via `pickFullback`) deep for kick coverage; they are exempt from the line.
- **Fold & press:** after each tackle, defenders re-slot around the new breakdown at a speed driven by `workRate`-proxy (`stamina` + `positioning` derivation) and fatigue. **Slow folds are where overlaps come from** — this is the emergent payoff and must come from the fold model, not a dice roll.
- **Offside discipline:** the line may not advance past the offside plane until ball-out; a defender's `discipline`/`positioning` (+ team `discipline` tactic) governs creep, which feeds the existing penalty pipeline (`PENALTY_AWARDED` → cards/TMO untouched).

### 3.3 Attacking shape: pods & width (V3 § 3, adapted)

- On secured possession, forwards self-assign to pods per the team's `attackingGamePlan`/`attackingStyle` (existing tactics select the framework: e.g. `keep_it_tight` → 1-3-3-1 tight pods; `wide_wide` → 2-4-2 with edge pods).
- Tight five default to mid-field pods; back-row may slot into the backline as link/edge runners (selection by derived mobility score).
- Backs hold depth-and-width lanes off first receiver (`pickScrumHalf`/`pickKicker` chains unchanged).
- Shape definitions (pod anchors, depths, lane widths) live in `balance/spatialShape.ts` as data, not code — tuning shape = editing numbers.

### 3.4 Carrier decision layer (utility AI)

Each decision tick the carrier scores options — **carry into contact / pass to pod / sweep wide / offload / kick** — using: space ahead (nearest-defender gap in corridor), support proximity, field position, team tactics, `composure`/`positioning` derivation, score/clock context (the existing `AITacticalDirector` and `KickDecisionDirector` keep owning *strategic* intent; the utility layer executes it spatially). Noise from `rngSpatial` scaled inversely by composure — composed players pick the top-scoring option; rattled ones occasionally pick second-best.

### 3.5 Contact: the two-phase tackle (V3 § 10, adapted)

Resolved in `ContactSystem` when a defender's radius intersects the carrier:

1. **Evasion check** — attacker `agility`·w₁ + `pace`·w₂ vs defender `positioning`·w₁ + `tackling`·w₂ ± `rngSpatial` band, *modified by approach geometry* (a defender arriving from in front beats one chasing from behind — this is what V3 missed: geometry is an input, not just attributes). Win → **broken tackle / line break**; the defender is beaten *spatially* and must recover.
2. **Collision dominance** — defender (`tackling`, `strength`) vs carrier momentum (`strength`, current speed), both fatigue-reduced. Outcome bands (dominant / neutral / passive+offload-window) and all weights in `balance/spatialTackle.ts`. Maps onto the existing `CollisionResult` vocabulary and emits the same `MatchEvent`s (`CARRY_RESOLVED`, `OFFLOAD_ATTEMPTED/COMPLETED`, `BREAKDOWN_HIT`…) so ratings/commentary/stats are untouched.

### 3.6 The breakdown: heuristic ruck commitment (V3 § 4, kept nearly whole)

This was V3's best section. Every nearby player scores commit-vs-reform each decision tick:

| Factor | Effect |
|---|---|
| Team tactical cap (`attackingBreakdown`/`defendingBreakdown`, existing tactics) | Base incentive → 0 once the cap is reached |
| Isolation of the carrier (real measured distance to nearest support) | Raises defensive jackal priority / attacking secure priority |
| Player specialisation (`breakdown` stat) | High-breakdown players weight the ruck over the line |
| Override threshold | Specialisation + threat above threshold beats the cap |

The *number and quality* of committed bodies then feeds the existing `BreakdownResolver` maths (attack ruck score vs defence) — initially as modified inputs to the proven formula, later replacing it once telemetry says the spatial version matches (§ 9). Slow-ball/clean-ball/turnover/penalty vocabulary (`BreakdownResult`) unchanged.

### 3.7 Backline movement & the attacking playbook (layered control)

The central coordination problem — drilled team shapes coexisting with independently-deciding agents — is solved by a **three-layer control stack**, evaluated per agent per decision tick, each layer able to override the one below:

```
Layer 3 — REACT    hard interrupts: ball in the air near me, line break in radius,
                   loose ball → abandon role, bypass scoring entirely
Layer 2 — DECIDE   per-agent utility: is my assigned role still the best use of me?
                   (winger holds width instead of chasing the ball; openside abandons
                   his pod when the ruck-commit score of § 3.6 beats his shape score)
Layer 1 — ROLE     team-level shape solver, run once per tick: outputs a target map
                   { slot → (targetPos, depth, lane) } from ball, phase, possession,
                   tactics. Assigns destinations only — it never moves anyone.
```

Shapes look drilled because 13 of 15 agents are quietly obeying Layer 1; the 2 making interesting decisions do so for legible reasons. **Independence is veto power over the team plan, not freelancing.** Pure emergence is rejected (real rugby shapes are drilled precisely because they don't arise naturally — chasing emergence produces ants); pure scripting is rejected (that's the legacy engine with more steps). The model is *authored intent, simulated outcome*.

**Three mechanics that make a backline look like a backline:**

1. **Depth as a first-class variable.** Backs align on a diagonal 5–8 m behind the gain line, deeper the wider they stand. Depth is tactic-driven (flat = fast/risky ball, deep = safe/slow) and is what gives the defensive line model (§ 3.2) something real to read.
2. **Run onto the ball.** The receiver's maximum-acceleration window is timed to coincide with pass arrival: his target point drifts toward the gain line as the ball comes his way, and his run starts `flightTime + windup` before release. This single timing mechanic is the signature of a credible backline.
3. **The pass window.** Pass target = receiver's *projected* position at flight time (lead the runner), which falls out naturally once (2) exists.

**Plays are data overlays, not scripts.** A play is a temporary named role-assignment — 2–4 roles, ~3 s lifetime — carrying run lines (waypoints **relative to the play origin and `attackDir`**, so one definition mirrors to anywhere on the pitch in either direction) and a timing schedule (`t`-offset pass/dummy/receive actions). It overrides Layer 1 for its named roles only; **Layers 2–3 stay live throughout**, and every play carries abort conditions (turnover, intercept risk over threshold, receiver covered). The play sets up the picture; contact (§ 3.5), evasion geometry, and the defensive fold (§ 3.2) decide whether it works. The same miss-2 dies into a rush defence and creates the overlap against a slow drift fold — and the user can *see why*. That is the FM-quality bar.

- **Definitions live in `src/data/` as content** (roles, run lines, triggers, aborts); **selection weights live in `balance/spatialDecision.ts`** as tuning — same data/tuning separation as everywhere else.
- **Initial library** (~15 lines of data each): switch/scissors, loop, miss-1, miss-2 + blocker, dummy switch, crash ball + tip-on, back-door screen, blindside strike off scrum, midfield bust off lineout, 1-3-3-1 same-way phase patterns.
- **Play selection** is owned by the carrier utility layer (§ 3.4): field position, defensive picture (rush vs drift, fold speed — readable from the § 3.2 model), `attackingGamePlan`, playmaker `composure`/`positioning`, plus a **recency familiarity penalty** so defenders "learn" a repeated play (cheap to implement, large realism payoff).
- **Authoring pipeline:** the phase-animator (`public/tools/phase-animator.html`) is already a keyframe editor over pitch coordinates — retool it to author run-line waypoints + timing offsets and export play JSON, turning the playbook into a visual content pipeline rather than blind number-editing.

### 3.8 Kicking & chase

Tactical kicks get a real trajectory (hang time from `kicking`, landing point via `rngSpatial` dispersion), a chase line (chasers assigned by proximity + derived work rate), and a contested or clean take using `handling`/jump derivation vs chaser pressure. Box-kick and 50:22 logic reuse `KickDecisionDirector` strategy; only *execution* becomes spatial.

---

## 4. What stays statistical (permanently fine)

- **Scrum, lineout, maul** — self-contained battles, current resolvers already good. The World takes their outputs as entry conditions (e.g. lineout win at touchline → ball at y≈5, pods forming infield).
- **Goal kicking / conversions** (`KickAtGoalHandler`) — unchanged.
- **Cards, TMO, penalty decisions, substitutions, fatigue accrual, ratings, injuries** — all orchestrator-level systems that consume `MatchEvent`s; untouched by design.

---

## 5. Attribute derivation (12 authored stats → spatial parameters)

V3 proposed 22 attributes. We do **not** expand the authored contract in v1 — we derive. All derivation weights in `balance/spatialSteering.ts` / `spatialDecision.ts`:

| Spatial parameter | Derived from |
|---|---|
| Top speed | `pace` × fatigue curve |
| Acceleration / change of direction | `agility` (+ `pace` minor) |
| Tackle attempt & dominance | `tackling`, `strength` |
| Evasion | `agility`, `pace` |
| Catch / take / offload security | `handling` |
| Ruck commit value & jackal threat | `breakdown` |
| Kick distance / dispersion | `kicking` |
| Defensive slot accuracy, fold speed | `positioning`, `stamina` |
| Decision noise (inverse) | `composure` |
| Offside creep, penalty propensity | `discipline` |
| Fatigue resistance | `stamina` (existing `StaminaSystem` untouched) |
| Set-piece inputs | `setPiece` (unchanged path) |

If play-testing shows two derived parameters need to diverge per player (e.g. a slow prop who reads defence brilliantly), *that* is the trigger to consider new authored attributes — as a later, separate, data-contract decision with its own `team-data.md` + JSON regeneration cycle.

---

## 6. Determinism & testing

- One spatial draw order, fixed: decision → steering → movement → contact, agents iterated in slot order, home then away (mirrors the determinism-critical home-then-away convention in `FatigueAccumulator`).
- `rngSpatial` is consumed **only** inside `SpatialSimulator`; legacy phases never touch it, so partially-migrated builds stay stable.
- `scripts/checkDeterminism.ts` extends to hash agent trajectories per phase, not just final state.
- New `scripts/checkSpatialScenarios.ts`: authored World setups (2-on-1 overlap, isolated carrier, rush defence vs deep attack) asserting qualitative outcomes across many seeds — the FM-style "does the engine understand rugby" regression suite. Run by `npm run verify`.
- Silent fixtures (`simulateFixture`) run the same spatial sim **without frame capture** (frames are render-only, like `GameEvent.movements` today) — `skipInvariants` semantics unchanged.

---

## 7. Performance budget (so it never becomes the excuse)

| Budget item | Cost | Headroom check |
|---|---|---|
| Steering, 30 agents, all-pairs separation | ~5k ops/micro-tick | trivial |
| Decision scoring (carrier + 29 off-ball) | ~3k ops/micro-tick | trivial |
| 10 Hz live play | ~100k ops/sec | ≤0.1% of a core |
| Silent fixture (full match, flat-out) | target **<250 ms** added per AI fixture | gate in CI — `checkSilentScores` timing assert |

Rules enforced by review: no allocation in the micro-tick loop (pre-allocated agent array, reused scratch vectors), no `Object.entries`/spread in the hot path, frames captured only when not `silent`. If a silent fixture exceeds budget, drop silent-mode micro-tick rate (e.g. 4 Hz) — outcomes must be tick-rate-independent enough that this is a pure speed knob, which the scenario suite asserts.

---

## 8. Rendering

**Phase A (during engine build): keep the DOM dots.** `SpatialSimulator` returns `frames` (per-micro-tick positions) on the `GameEvent` — a richer cousin of today's `movements` array. `PitchView`/`PitchPlayers` interpolate dots along real trajectories instead of authored choreography for spatialised phases; authored choreography remains for legacy/set-piece phases. 30 absolutely-positioned divs at interpolated 60 fps is well within DOM budget.

**Phase B (after the engine proves out): Canvas/WebGL layer (PixiJS or hand-rolled canvas).** Motion trails, smoother camera, particle flourish, guaranteed 60 fps on low-end mobile + Capacitor iOS. This is a *swap of the paint layer only* — frames format unchanged. Decision deferred until Phase A makes it worth gold-plating.

The § 15.7 invariant generalises rather than breaks: *the DOM's resting state is always the final position* → *the rendered frame always converges to the World's authoritative position*; rendering stays a passive consumer.

---

## 9. Calibration: the legacy engine is the measuring stick

The current engine's telemetry is years of balance work — it is the **target distribution**, not discarded code. Freeze the current baselines (from `telemetry/latest.md`) as acceptance bands; after each spatial phase lands, `npm run telemetry` must stay within band:

| Metric | Baseline (frozen) | Band |
|---|---|---|
| Tries / match | 3.9 | ±0.5 |
| Combined points | 25.3 | ±3 |
| Penalties conceded / match | 9.9 | ±1.5 |
| Tackles attempted / made | 56.2 / 54.4 | ±6 |
| Carries / match | 32.9 | ±5 |
| Turnovers won | 2.0 | ±0.5 |
| Knock-ons | 2.4 | ±0.6 |
| Home win share | 55.3% | ±5pp |

Plus new spatial-only metrics with bands set from real Premiership data: line breaks/match (~10), defenders beaten (~25), offloads (~10), metres carried (~450/team). When spatial and legacy disagree, the question is "which matches real rugby?", answered with the telemetry harness — never by feel alone.

---

## 10. Roadmap — eight gated work packages

Each WP merges only when: `npm run build` + `npm run verify` green, telemetry within § 9 bands, docs updated (`docs/match-engine.md` § for the touched system, per CLAUDE.md doc-sync), one cohesive feature per commit.

| WP | Deliverable | Replaces | Gate |
|---|---|---|---|
| **0. Baseline freeze** | § 9 bands committed; timing assert added to silent-fixture check | — | bands reproduce on 5 seeds |
| **1. Substrate** | `World`, agent array, micro-tick loop, steering/movement primitives, `rngSpatial` stream, scenario-test harness skeleton | nothing (runs dark) | determinism incl. trajectory hash; perf budget met |
| **2. Defensive line + carry corridor** | Line model (§ 3.2) + straight-line carry vs fold; spatial **line breaks**; emits existing `CARRY_RESOLVED` | the line-break/metres portion of `OpenPlayResolver` | telemetry bands; 2-on-1 + fold scenarios pass; *watchability review* |
| **3. Contact** | Two-phase tackle (§ 3.5), broken tackles, offload window | tackle outcomes in `OpenPlayResolver`/`TacklingInfringement` paths | dominant/neutral/passive distribution matches baseline |
| **4. Breakdown commitment** | Heuristic ruck entries (§ 3.6) feeding `BreakdownResolver` inputs | breakdown *inputs* (formula retained) | turnover/penalty rates in band; isolation scenario passes |
| **5. Shape & distribution** | Shape solver + three-layer control stack (§ 3.7), pods (§ 3.3), depth/run-timing/pass-window mechanics, pass chains, carrier utility AI (§ 3.4), width/overlap play | remaining `OpenPlayResolver` + `Lateral.ts` sweep model | overlap-conversion scenario; try distribution by channel sane |
| **5b. Attacking playbook** | Play-overlay system + data schema, initial library (~10 moves, § 3.7), phase-animator retooled as play editor, defensive familiarity penalty | nothing (additive over WP 5) | strike-play scenarios: miss-2 vs slow drift fold creates the overlap, same play vs rush dies; play-abort rate in credible band |
| **6. Kicking spatially** | Trajectories, chase lines, contested takes (§ 3.8) | `KickingResolver`/`BoxKickResolver` execution (decision layer retained) | kick-outcome rates in band; 50:22 still occurs at baseline rate |
| **7. Renderer Phase A** | Frames-driven dot animation for spatial phases | authored choreography for those phases only | probe harness traces match frames; no regression on set-piece beats |
| **8. Polish to FM-quality** | Decision-noise tuning, commentary hooks for spatial moments ("beat three men on the outside"), new telemetry metrics, Canvas spike decision | — | end-to-end watch test: a full match is *legible* as rugby with the sound off |

Sequencing rationale: defence before attack (WP 2 before 5) because attacking play is only as believable as the line it attacks; contact before breakdown because ruck context derives from tackle outcomes; rendering late because frames are cheap to store and the engine truth must settle first.

**Kill criteria (honesty clause):** if after WP 3 the spatial match is *less* watchable/credible than the legacy engine and two tuning passes haven't closed the gap, stop and reassess — the legacy engine remains fully intact underneath at every WP, so reverting any phase is a router-table change, not a rollback.

---

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Emergent play looks like ants, not rugby** — the project-defining risk | High at first | Drilled-systems defence (§ 3.2) and data-authored attack shapes (§ 3.3) constrain emergence: *scripted skeleton, emergent muscle*. Scenario suite + per-WP watchability review. Kill criteria above. |
| Calibration whack-a-mole (fixing tries breaks penalties) | Medium | One WP at a time behind the seam; telemetry bands as merge gates; legacy formulas retained as inputs (WP 4) before replacement |
| Hybrid period complexity (two resolution styles coexisting) | Medium | The `PhaseResult` contract makes them indistinguishable downstream; `rngSpatial` isolation prevents cross-perturbation |
| Determinism regression from float trajectory accumulation | Low | Single-threaded, fixed iteration order, seeded streams — same guarantees as today; trajectory hash in `verify` catches drift instantly |
| Scope creep into attribute expansion / new authored data | Medium | Explicitly out of scope for v1 (§ 5); requires its own data-contract decision |
| Renderer rebuilt too early | Medium | WP 7 is gated behind engine truth; Canvas (Phase B) is a deferred spike |

---

## 12. The iOS-native sequel (relationship to this plan)

This plan **is** the de-risking step for the native sequel. If the spatial engine proves out here:

- The validated design (this doc + the updated `docs/match-engine.md` + `balance/spatial*.ts` numbers + the scenario suite) becomes the Swift implementation spec — the thing V3 lacked.
- Tier-1 assets port verbatim (team JSONs, balance constants, fixtures); Tier-2 (season/career logic) ports as validated design; the `MatchEvent`-union/reducer architecture maps *better* to Swift (enums with associated values, exhaustive `switch`) than it sits in TS.
- The native build then re-implements a **known-good** engine with SpriteKit/Metal rendering on top — a port, not a research project.

If it doesn't prove out, that's learned for the cost of some TypeScript work packages instead of a year-long platform rewrite.

---

*Companion docs: `docs/match-engine.md` (current engine reference — update per WP), `docs/DESIGN.md` § 15.7 (rendering invariants), `docs/animation-feedback-playbook.md` (WP 7+), `telemetry/latest.md` (live baselines for § 9).*
