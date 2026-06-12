# Upgrade.md — The 30-Agent Spatial Match Engine (TypeScript, Web)

**North star: a Football Manager–quality match engine for rugby.** Every one of the 30 players on the pitch is a simulated agent with a position, a velocity, a role, and a decision loop. Line breaks happen because a runner beat the defensive line in space; turnovers happen because the carrier was isolated; overlaps happen because the defence folded too slowly. The 2D pitch stops being a visualisation of dice rolls and becomes a window onto a real simulation — and the user can always *see why* something worked.

The engine is built **in TypeScript, inside this codebase**, phased in behind the existing engine seams. The legacy engine remains intact underneath at every milestone, so every work package is shippable and every step is reversible.

---

## 1. Why TypeScript, in this codebase

- **Performance is a non-issue.** 30 agents × ~30 neighbour checks × 10 sim ticks/sec ≈ 50k float ops/sec — roughly 0.01–0.05% of one core under V8's JIT. The wall this project needs to worry about is *believability*, not throughput.
- **The season/career layer (~14k LOC), team data (~11k lines of JSON), 40 balance files, and the engine docs are the project's moat.** Building in-place keeps all of it live and continuously shipping.
- **Decouple the two bets.** Bet 1: is emergent spatial rugby fun and credible? Bet 2: should a sequel go native iOS? This plan is Bet 1; § 16 covers how a proven design becomes the Bet 2 port spec.

Deliberately rejected: fixed-point integer math (a lockstep-netcode tool — our determinism is already solved by seeded streams), a full ECS (we have 31 entities, not 10,000 — plain pre-allocated arrays of plain objects), and inline tuning literals (everything goes in `src/engine/balance/`).

---

## 2. Non-negotiable invariants

These survive the upgrade unchanged. They are why this is an *upgrade*, not a rewrite.

1. **`applyMatchEvent` stays the sole mutation boundary for `MatchState`.** The spatial sim produces *domain outcomes* — `TRY_SCORED`, `KNOCK_ON`, `CARRY_RESOLVED`, `TURNOVER_AT_BREAKDOWN` — as `MatchEvent`s, exactly as resolvers do today. Everything downstream (commentary, ratings, `PlayerMatchStats`, season aggregation, saves, telemetry) keeps working untouched.
2. **All randomness through `src/utils/rng.ts` seeded streams.** A new sixth stream, `rngSpatial(min, max)`, reset by `setMatchSeed`, isolates every spatial draw (steering jitter, decision noise) so the spatial sim can never perturb the outcome/positioning/commentary streams of phases still on the legacy path. Same pattern, same reason, as `rngPosition`.
3. **`npm run verify` determinism gates stay green at every phase.** Same seed → same match, including every agent trajectory.
4. **Every tuning number in `src/engine/balance/`** — new files `spatialSteering.ts`, `spatialTackle.ts`, `spatialRuck.ts`, `spatialDecision.ts`, `spatialShape.ts`, barrel-exported from `balance/index.ts`.
5. **Engine never imports UI; UI reads via the event bus + display snapshots.** The spatial world adds a *frame stream* per beat (§ 8) but the direction of dependency is unchanged.
6. **`state.ball.{x,y}` in 0–100 coordinates remains canonical at phase boundaries.** The spatial world uses the same 0–100 space (x = long axis, y = lateral) — no new coordinate system, no `pitchCoords` changes. Ball height during kicks is a render-only scalar (§ 5.7), never part of `MatchState`.
7. **Set-piece *contests* stay statistical.** Scrum, lineout, maul, and goal-kick resolvers are proven and balanced; the spatial layer stages their formations and receives their outcomes (§ 4.2). Replacing a contest formula is never a goal of this plan.
8. **Player data contract is unchanged.** The 12 authored `PlayerStats` drive everything via derivation (§ 10). No new authored attributes in v1 — `docs/team-data.md` stays the source of truth.

---

## 3. Architecture

```
MatchCoordinator.tick()                     (existing cadence, unchanged)
 ├─ ClockController / directors / cards     (unchanged)
 ├─ PhaseRouter.resolvePhase()
 │   ├─ staged phases  → existing resolvers + formation staging   (§ 4.2, § 4.3)
 │   └─ spatial phases → SpatialSimulator.run(phase)              (§ 4.1)
 │       ├─ N micro-ticks @ 10 Hz over the World
 │       │   ├─ ShapeSolver      (team-level target map, § 6 Layer 1)
 │       │   ├─ DecisionSystem   (per-agent utility + interrupts, § 6 Layers 2–3)
 │       │   ├─ SteeringSystem   (desired velocity per agent)
 │       │   ├─ MovementSystem   (integrate, clamp, soft separation)
 │       │   └─ ContactSystem    (tackle / offload / break / take detection)
 │       └─ returns PhaseResult { events: MatchEvent[], frames: Frame[] }
 ├─ applyMatchEvent(queue)                  (unchanged mutation seam)
 └─ eventBus emits                          (unchanged)
```

**The `World` is engine-internal, not part of `MatchState`.** It holds 30 agent records `{ slot, side, pos, vel, role, intent, fatigueSnapshot }` plus the ball `{ pos, vel, height, carrierSlot? }`.

**Continuity rule — the key to a match that *looks* continuous:** the World **persists across contiguous spatial phases** (PhasePlay → Breakdown → PhasePlay → TacticalKick → KickReturn …), so the defence is genuinely mid-fold when the next carry starts and nobody ever teleports between phases. It is **rebuilt deterministically from `MatchState`** (ball position, possession, on-field players via `onFieldPlayers`, the staged formation of § 4.2/4.3) whenever spatial play resumes after a statistical or staged phase, and discarded at full stoppages. Because the World is always reconstructable from `MatchState`, mid-match state remains exactly what it is today: **no save-schema change, no `SAVE_VERSION` bump, anywhere in this plan.**

**Hybrid by design, permanently during the build.** `PhaseRouter` keeps its `PHASE_HANDLERS` map; spatial resolution replaces legacy resolvers *one phase at a time* behind the same `PhaseResult` contract. Reverting any phase is a router-table change, not a rollback.

**Agents are plain objects in a plain pre-allocated array.** Zero allocation in the micro-tick loop (reused scratch vectors, in-place mutation — the World is *not* behind `applyMatchEvent`; only its **outcomes** are).

---

## 4. The phase map — every rugby phase, classified

All 19 `MatchPhase` values fall into three families. Nothing is left unspecified: every phase has an owner, a movement model, and a defined seam crossing.

| Phase | Family | Contest logic | All-30 movement |
|---|---|---|---|
| `PhasePlay` | **Spatial** | carries, passes, breaks via §§ 5–6 | full sim |
| `FirstPhase` | **Spatial** | strike platform — playbook plays fire here | full sim |
| `KickReturn` | **Spatial** | returner utility AI vs chase line | full sim |
| `KickOff` / `DropOut22` | **Spatial** | kick trajectory, chase vs receipt pods, aerial take | full sim |
| `TacticalKick` / `BoxKick` | **Spatial** | execution spatial; *decision* stays with `KickDecisionDirector` | full sim |
| `Breakdown` | **Hybrid** | spatial commitment heuristic (§ 5.6) feeding the proven statistical resolution core | converging bodies + off-ball reshaping during resolution |
| `Scrum` | **Statistical + staged** | existing `ScrumResolver` untouched | bind formation, backline alignment, shove/wheel nudge by outcome |
| `Lineout` | **Statistical + staged** | existing `LineoutResolver` untouched | line assembly, throw arc, lift, off-the-top or maul exit |
| `Maul` | **Statistical + staged** | existing `MaulResolver` untouched | bound cluster advances as a unit by outcome margin; defenders bind or fan |
| `Penalty` | **Staged** | modal/decision flow unchanged | 10 m retreat walk; **tap-and-go re-enters the spatial sim immediately** |
| `KickAtGoal` / `ConversionKick` | **Staged** | existing kick maths untouched | kicker routine at the mark, teams posted, ball-flight arc |
| `TryScored` | **Staged** | — | grounding at the line (existing in-goal rules), celebration cluster, retreat |
| `TmoReview` | **Staged** | existing 3-tick narrative untouched | breather formations, huddles |
| `Substitution` | **Staged** | — | player jogs to touchline, replacement enters at slot |
| `HalfTime` / `FullTime` | **Snap** | — | existing snap transitions |

### 4.1 The spatial family — open play

The heart of the engine: §§ 5–6 define the model. What matters architecturally is the **seam contract**: each spatial beat runs its micro-ticks, detects domain outcomes through `ContactSystem` and the decision layer, and returns the *same `MatchEvent` vocabulary the legacy resolvers emit*. A line break is `CARRY_RESOLVED` with real metres; a spilled high ball is `KNOCK_ON`; a chase tackle behind the gain line feeds the same breakdown context as today. Downstream consumers cannot tell which engine produced the event — that is the design test.

### 4.2 Statistical contests with spatial staging — scrum, lineout, maul

The set-piece formulas are years of tuning and stay byte-for-byte. The spatial layer wraps them in **staging**: before the contest, the ShapeSolver places all 30 agents in the authored set-piece formation (8 binding at the mark, backs aligned per shape sheet, defensive backline mirroring); the contest resolves statistically as today; the *outcome* is then expressed physically — a dominant scrum nudges the bound pack 2–3 m with a wheel rotation for `wheel`, a won maul advances the cluster by the resolved margin, a stolen lineout snaps the receive pod to the other side. Exit hands the World to the spatial family with everyone already in a true position: **set piece → strike play → open play is one continuous motion on screen.**

### 4.3 Staged ceremonies — penalties, goal kicks, tries, TMO, subs

No contest to simulate — these are *theatre with rules*. Each gets an authored staging layout (formation data, not code) and uses the existing modal/decision flows untouched. Two details that matter for realism: the **penalty 10-m retreat** is a real walk-back (defenders physically move, so a quick tap punishes a slow retreat — emergent advantage from staging), and **try/conversion sequences** keep the existing in-goal grounding rules (`isTryScoredAt`, grounding at line+4) as the authoritative positions the staging converges to.

---

## 5. The spatial model

### 5.1 Tick & integration

- Sim micro-tick: **10 Hz**. The mapping from micro-ticks to `gameMinute` is owned by the existing `ClockController` budget for the phase.
- Velocity-capped kinematics, no physics engine: `pos += vel·dt`, `vel` steered toward desired velocity under an acceleration cap. Top speed and acceleration derive from `pace`/`agility`/live `fatiguePct` (§ 10).
- Overlapping radii trigger `ContactSystem`; otherwise agents repel softly (separation force) so dots never stack.

### 5.2 The defensive system — where match quality is decided

A defence that holds *shape* is what makes attacking play meaningful. Modelled top-down, not emergently — real defences are drilled systems:

- **Line model:** defenders are assigned slots on a line anchored at the last breakdown/set piece, spaced laterally by the `defensiveLine` tactic (rush/drift/shadow map to line speed and lateral bias). Each defender steers to *his slot*, not to the ball — that single rule produces line integrity.
- **Backfield:** `backfieldDefence` posts 1–2 players (via `pickFullback`) deep for kick coverage, exempt from the line.
- **Fold & press:** after each tackle, defenders re-slot around the new breakdown at a speed driven by derived work rate (`stamina` + `positioning`) and fatigue. **Slow folds are where overlaps come from** — the emergent payoff must come from the fold model, never a dice roll.
- **Offside discipline:** the line may not advance past the offside plane until ball-out; creep is governed by `discipline`/`positioning` (+ team `discipline` tactic) and feeds the existing penalty pipeline (`PENALTY_AWARDED` → cards/TMO untouched).

### 5.3 Attacking shape: pods & width

- On secured possession, forwards self-assign to pods per `attackingGamePlan`/`attackingStyle` (`keep_it_tight` → 1-3-3-1 tight pods; `wide_wide` → 2-4-2 with edge pods). Tight five default to mid-field pods; back-row may slot into the backline as link/edge runners (selected by derived mobility).
- Backs hold depth-and-width lanes off first receiver (`pickScrumHalf`/`pickKicker` chains unchanged).
- All shape definitions (pod anchors, depths, lane widths, set-piece and staging formations) are **data in `balance/spatialShape.ts`**, authored visually in the Phase Animator (§ 9) — tuning shape is editing numbers, never code.

### 5.4 Carrier decision layer (utility AI)

Each decision tick the carrier scores **carry into contact / pass to pod / sweep wide / offload / kick** using: space ahead (nearest-defender gap in corridor), support proximity, field position, team tactics, and `composure`/`positioning` derivation. The existing `AITacticalDirector` and `KickDecisionDirector` keep owning *strategic* intent; the utility layer executes it spatially. Decision noise from `rngSpatial`, scaled inversely by composure — composed players pick the top option; rattled ones occasionally pick second-best.

### 5.5 Contact: the two-phase tackle

Resolved in `ContactSystem` when a defender's radius intersects the carrier:

1. **Evasion check** — attacker (`agility`, `pace`) vs defender (`positioning`, `tackling`) ± `rngSpatial` band, **modified by approach geometry**: a defender arriving square beats one chasing from behind — geometry is an input, not just attributes. Win → broken tackle / line break; the beaten defender must physically recover.
2. **Collision dominance** — defender (`tackling`, `strength`) vs carrier momentum (`strength`, current speed), both fatigue-reduced. Outcome bands (dominant / neutral / passive + offload window) and all weights in `balance/spatialTackle.ts`. Maps onto the existing `CollisionResult` vocabulary and emits the same `MatchEvent`s (`CARRY_RESOLVED`, `OFFLOAD_ATTEMPTED/COMPLETED`, `BREAKDOWN_HIT` …) so ratings/commentary/stats are untouched.

### 5.6 The breakdown: heuristic ruck commitment

Every nearby player scores commit-vs-reform each decision tick:

| Factor | Effect |
|---|---|
| Team tactical cap (`attackingBreakdown`/`defendingBreakdown`) | Base incentive → 0 once the cap is reached |
| Carrier isolation (real measured distance to nearest support) | Raises defensive jackal priority / attacking secure priority |
| Player specialisation (`breakdown` stat) | High-breakdown players weight the ruck over the line |
| Override threshold | Specialisation + threat above threshold beats the cap |

The *number and quality* of committed bodies feed the existing `BreakdownResolver` maths — initially as modified inputs to the proven formula, later replacing it only if telemetry says the spatial version matches (§ 13). The `BreakdownResult` vocabulary (clean/slow/turnover/penalty) is unchanged. Meanwhile the 24+ uncommitted agents are *visibly reforming* — pods setting, line folding — which is what makes phase-to-phase rugby read as one continuous game.

### 5.7 Kicking & the aerial contest

Tactical kicks get a real trajectory: hang time from `kicking`, landing point with `rngSpatial` dispersion, and a render-only **height scalar** carried in the frame stream (§ 8) so the animation layer can arc and scale the ball without any 3D in the model. Chasers are assigned by proximity + derived work rate; the take is contested (chaser pressure vs `handling` + derived aerial ability) or clean depending on whether hang time beats chase distance. Box-kick and 50:22 strategy remain with `KickDecisionDirector`; only *execution* becomes spatial. Kick-offs and drop-outs use the same machinery with their own staging formations and receipt pods.

---

## 6. Layered control — drilled shapes from independent agents

The central coordination problem — coherent team shapes from 30 independently-deciding agents — is solved by a **three-layer control stack**, evaluated per agent per decision tick, each layer able to override the one below:

```
Layer 3 — REACT    hard interrupts: ball in the air near me, line break in radius,
                   loose ball → abandon role, bypass scoring entirely
Layer 2 — DECIDE   per-agent utility: is my assigned role still the best use of me?
                   (winger holds width instead of chasing the ball; openside abandons
                   his pod when the ruck-commit score of § 5.6 beats his shape score)
Layer 1 — ROLE     team-level ShapeSolver, run once per tick: outputs a target map
                   { slot → (targetPos, depth, lane) } from ball, phase, possession,
                   tactics. Assigns destinations only — it never moves anyone.
```

Shapes look drilled because 13 of 15 agents are quietly obeying Layer 1; the 2 making interesting decisions do so for legible reasons. **Independence is veto power over the team plan, not freelancing.** Pure emergence is rejected (real rugby shapes are drilled precisely because they don't arise naturally — chasing emergence produces ants); pure scripting is rejected (that's the legacy engine with more steps). The model throughout is *authored intent, simulated outcome*.

**Three mechanics that make a backline look like a backline:**

1. **Depth as a first-class variable.** Backs align on a diagonal 5–8 m behind the gain line, deeper the wider they stand. Depth is tactic-driven (flat = fast/risky ball, deep = safe/slow) and gives the defensive line model something real to read.
2. **Run onto the ball.** The receiver's maximum-acceleration window is timed to pass arrival: his target drifts toward the gain line as the ball comes his way, and his run starts `flightTime + windup` before release. This single timing mechanic is the signature of a credible backline.
3. **The pass window.** Pass target = receiver's *projected* position at flight time (lead the runner) — falls out naturally once (2) exists.

---

## 7. The playbook & manager controls — set moves, formations, positioning

### 7.1 Plays are data overlays, not scripts

A play is a temporary named role-assignment — 2–4 roles, ~3 s lifetime — carrying run lines (waypoints **relative to the play origin and `attackDir`**, so one definition mirrors anywhere on the pitch in either direction) and a timing schedule (`t`-offset pass/dummy/receive actions). It overrides Layer 1 for its named roles only; **Layers 2–3 stay live throughout**, and every play carries abort conditions (turnover, intercept risk over threshold, receiver covered). The play sets up the picture; contact (§ 5.5), evasion geometry, and the defensive fold (§ 5.2) decide whether it works. The same miss-2 dies into a rush defence and creates the overlap against a slow drift fold — and the user can *see why*.

- **Definitions are content in `src/data/playbook/`** (roles, run lines, triggers, aborts); **selection weights are tuning in `balance/spatialDecision.ts`** — the same data/tuning separation as everywhere else.
- **Initial library** (~15 lines of data each): switch/scissors, loop, miss-1, miss-2 + blocker, dummy switch, crash ball + tip-on, back-door screen, blindside strike off scrum, midfield bust off lineout, 1-3-3-1 same-way phase patterns.
- **Play selection** is owned by the carrier utility layer (§ 5.4): field position, defensive picture (rush vs drift, fold speed — readable from § 5.2), `attackingGamePlan`, playmaker `composure`/`positioning`, plus a **recency familiarity penalty** so defenders "learn" a repeated play.
- **Triggers:** plays fire primarily at `FirstPhase` (off scrum/lineout — classic strike plays) and off clean quick ruck ball in `PhasePlay`.

### 7.2 How the manager steers it

Three tiers of control, shallowest first, so casual players get good rugby by default and tinkerers get depth:

1. **Existing nine tactic dimensions, remapped spatially.** Nothing new to learn: `attackingGamePlan`/`attackingStyle` select attack shape sheets; `defensiveLine`/`backfieldDefence` set line speed, drift bias, and backfield count; breakdown dimensions set ruck caps; `intensity`/`discipline` keep their fatigue/risk meanings, now also scaling fold speed and offside creep. AI sides get all of this for free through their authored `suggestedTactics` and the existing directors.
2. **Match-day playbook (new, with WP 6b).** In `PreMatchScreen`, pick ~4–6 plays from the library into the match-day playbook and weight them by channel (tight/mid/wide). Mid-match, the existing tactics modal gains a playbook tab — same `ui:tacticsChange` → `TACTICS_UPDATED` seam.
3. **Formation & shape overrides (power user, post-v1).** Explicit shape-sheet picker (e.g. force 2-4-2 off lineout ball) and per-unit depth/width nudges. Deferred until the defaults prove out — guidance should be *optional* depth, never required homework.

---

## 8. Engine → animation: pulling 30 agents through cleanly

The pipeline is designed so the renderer is a **dumb, swappable consumer of frames** — no game logic on the UI side, ever.

### 8.1 The frame stream

`SpatialSimulator` captures one `Frame` per micro-tick (live matches only — silent fixtures skip capture entirely, like `GameEvent.movements` today):

```ts
interface Frame {
  t: number;                       // micro-tick index within the beat
  ball: { x; y; h; carrierSlot? }; // h = render-only height scalar for kick arcs
  dots: AgentFrame[30];            // fixed order: home slots 1–15, away slots 1–15
  markers?: FrameMarker[];         // { t, kind: 'tackle'|'offload'|'break'|'take', slot }
}
```

Frames ride on the `GameEvent` exactly as `movements` does today — a frozen render snapshot with the same lifetime rules (never range-checked, never part of `MatchState`, never saved). Identity is positional: dot *n* is always the same matchday slot; substitutions and cards are events, not frame mutations, so the renderer learns them from the existing bus traffic it already handles.

### 8.2 One driver per beat — the simplified contract

Today's renderer juggles three animation channels per dot (carrier-follower XOR chase-`from` XOR authored choreography). For spatial beats this collapses into something *simpler*: **every dot and the ball are driven by the frame stream, full stop.** `PitchView` gains one new driver — `playFrames(frames)` — that interpolates all 31 actors through the captured positions at the presentation timescale (the existing presenter pacing), easing between micro-ticks for 60 fps smoothness. Staged and legacy beats keep the existing channel model and authored choreography unchanged.

The § 15.7 master invariant generalises rather than breaks: *the DOM's resting state is always the final position* → **the final frame of every beat equals the World's authoritative positions, which equal the next beat's first frame** (continuity rule, § 3). Cancellation-safe by construction: skip the animation and every dot is already standing exactly where the next beat expects it.

### 8.3 Markers: sync for sound, commentary, and flourish

`FrameMarker`s let the UI fire effects at the *moment* something happens mid-beat — tackle thud at the tackle frame, crowd swell on the break, commentary line timed to the offload — replacing today's beat-level timing with event-level timing. Markers are derived from the same `MatchEvent`s crossing the seam; they add no new truth.

### 8.4 Renderer phases

- **Phase A (during the engine build): keep the DOM dots.** 31 absolutely-positioned divs interpolating a 10 Hz stream at 60 fps is comfortably within DOM budget.
- **Phase B (after the engine proves out): Canvas/WebGL paint layer** (PixiJS or hand-rolled) for motion trails, camera, particles, guaranteed 60 fps on low-end mobile and the Capacitor iOS shell. A swap of the paint layer only — the frame format, drivers, and markers are identical. Decision deferred until Phase A makes it worth gold-plating.

---

## 9. Phase Animator: from keyframe tool to engine workbench

The existing tool (`public/tools/phase-animator.html`) is already a visual keyframe editor over pitch coordinates — exactly the right substrate. It grows three modes alongside the existing choreography editor, turning shape, plays, and debugging into one visual workflow:

| Mode | Purpose | Output |
|---|---|---|
| **Choreography** (existing) | Author staged-beat keyframes (set pieces, ceremonies — § 4.2/4.3 staging layouts) | choreography JSON (existing pipeline, `npm run export:phases`) |
| **Shape editor** (new) | Author pod anchors, defensive slots, depth lanes, set-piece + staging formations on the pitch | `balance/spatialShape.ts` data |
| **Play editor** (new) | Author run-line waypoints + timing offsets per role; preview the mirroring; set triggers and aborts | play JSON → `src/data/playbook/` |
| **Frame debugger** (new — **build this first**) | Load a captured frame stream (from the probe harness or a dev-build match), scrub micro-ticks, and overlay *decision annotations* — which layer drove each agent, the utility scores behind each choice, recorded in dev builds | — (read-only; the believability microscope) |

The frame debugger is the most important deliverable in this entire plan after the engine itself: "the 13 looks lost" stops being a guess and becomes *scrub to tick 47, read his utility scores, see that his lane target was mis-anchored*. It lands in WP 1, before there is anything polished to watch, because every subsequent WP's watchability gate depends on it. The existing probe harness (`npm run probe`) extends to dump frame streams alongside its dot traces.

---

## 10. Attribute derivation (12 authored stats → spatial parameters)

The authored data contract does not expand in v1 — spatial parameters are derived. All weights in `balance/spatialSteering.ts` / `spatialDecision.ts`:

| Spatial parameter | Derived from |
|---|---|
| Top speed | `pace` × fatigue curve |
| Acceleration / change of direction | `agility` (+ `pace` minor) |
| Tackle attempt & dominance | `tackling`, `strength` |
| Evasion | `agility`, `pace` |
| Catch / take / offload security | `handling` |
| Ruck commit value & jackal threat | `breakdown` |
| Kick distance / dispersion / hang | `kicking` |
| Defensive slot accuracy, fold speed | `positioning`, `stamina` |
| Decision noise (inverse) | `composure` |
| Offside creep, penalty propensity | `discipline` |
| Fatigue resistance | `stamina` (existing `StaminaSystem` untouched) |
| Set-piece inputs | `setPiece` (unchanged path) |

If play-testing shows two derived parameters must diverge per player (the slow prop who reads the game brilliantly), *that* is the trigger to consider new authored attributes — a later, separate data-contract decision with its own `team-data.md` + JSON regeneration cycle.

---

## 11. Determinism & testing

- One spatial evaluation order, fixed: ShapeSolver → decision → steering → movement → contact; agents iterated in slot order, home then away (mirroring the determinism-critical convention in `FatigueAccumulator`).
- `rngSpatial` is consumed **only** inside `SpatialSimulator`; legacy phases never touch it, so partially-migrated builds stay stable.
- `scripts/checkDeterminism.ts` extends to hash agent trajectories per beat, not just final state.
- New `scripts/checkSpatialScenarios.ts`: authored World setups asserting qualitative outcomes across many seeds — 2-on-1 converts, isolated carrier gets jackalled, rush defence kills the miss-2 that beats a slow drift fold, quick tap punishes a slow retreat. The FM-style "does the engine understand rugby" regression suite, run by `npm run verify`.
- Silent fixtures run the same sim **without frame capture**; `skipInvariants` semantics unchanged. Outcomes must be capture-independent by construction (capture is pure observation).

---

## 12. Performance budget (so it never becomes the excuse)

| Budget item | Cost | Check |
|---|---|---|
| Steering, 30 agents, all-pairs separation | ~5k ops/micro-tick | trivial |
| Decision scoring (carrier + 29 off-ball) | ~3k ops/micro-tick | trivial |
| 10 Hz live play | ~100k ops/sec | ≤0.1% of a core |
| Silent fixture (full match, flat-out) | **<250 ms** added per AI fixture | timing assert in CI via `checkSilentScores` |

Rules enforced in review: no allocation in the micro-tick loop, no `Object.entries`/spread in the hot path, frames captured only when not `silent`. If a silent fixture exceeds budget, drop the silent micro-tick rate (e.g. 4 Hz) — the scenario suite asserts outcomes are tick-rate-robust, making this a pure speed knob.

---

## 13. Calibration: the legacy engine is the measuring stick

Current telemetry is years of balance work — it is the **target distribution**. Frozen baselines (from `telemetry/latest.md`) become acceptance bands; after each WP lands, `npm run telemetry` must stay within band:

| Metric | Baseline (frozen) | Band |
|---|---|---|
| Tries / match | 4.0 | ±0.5 |
| Combined points | 26.2 | ±3 |
| Penalties conceded / match | 11.4 | ±1.5 |
| Tackles attempted / made | 67.6 / 65.7 | ±6 |
| Carries / match | 39.8 | ±5 |
| Turnovers won | 2.5 | ±0.5 |
| Knock-ons | 3.0 | ±0.6 |
| Home win share | 51.6% | ±5pp |

Plus new spatial-only metrics with bands from real Premiership data: line breaks/match (~10), defenders beaten (~25), offloads (~10), metres carried (~450/team). When spatial and legacy disagree, the question is "which matches real rugby?" — answered with the harness, never by feel alone.

---

## 14. Roadmap — ten gated work packages

Each WP merges only when: `npm run build` + `npm run verify` green, telemetry within § 13 bands, docs updated per CLAUDE.md doc-sync, one cohesive feature per commit.

**Each WP has a detailed, self-contained implementation plan in [`docs/upgrade/`](docs/upgrade/)** — pre-reads, deliverables with file paths, scenario specs, gates, and doc-sync checklists. The **Model** column is the recommended implementing model: **Opus** for foundational/judgment-heavy/fragile-area packages, **Sonnet** for well-specified formula, data, and UI work — so the build is not reliant on any one model.

| WP | Plan | Model | Deliverable | Replaces | Gate |
|---|---|---|---|---|---|
| **0. Baseline freeze** | [WP0](docs/upgrade/WP0-baseline-freeze.md) | Sonnet | § 13 bands committed; silent-fixture timing assert | — | bands reproduce on 5 seeds |
| **1. Substrate + microscope** | [WP1](docs/upgrade/WP1-substrate-and-microscope.md) | Opus | `World`, agent array, micro-tick loop, steering/movement primitives, `rngSpatial`, frame format, **frame debugger** (§ 9), scenario-harness skeleton | nothing (runs dark) | determinism incl. trajectory hash; perf budget; debugger scrubs a captured stream |
| **2. Defensive line + carry** | [WP2](docs/upgrade/WP2-defensive-line-and-carry.md) | Opus | Line/fold/backfield model (§ 5.2) + carry corridor; spatial **line breaks** | line-break/metres portion of `OpenPlayResolver` | telemetry bands; fold + 2-on-1 scenarios; watchability review in the debugger |
| **3. Contact ✅** | [WP3](docs/upgrade/WP3-contact.md) | Sonnet | Two-phase tackle (§ 5.5), broken tackles, offload window | tackle outcomes in `OpenPlayResolver` paths | dominant/neutral/passive distribution matches baseline; **kill-criteria checkpoint** |
| **4. Breakdown + continuity ✅** | [WP4](docs/upgrade/WP4-breakdown-and-continuity.md) | Opus | Ruck commitment (§ 5.6) feeding `BreakdownResolver` inputs; **World persistence across the open-play sequence** (§ 3) | breakdown *inputs* (formula retained) | turnover/penalty rates in band; isolation scenario; no teleports across a 10-phase sequence in the debugger |
| **5. Shape & distribution 🟡** | [WP5](docs/upgrade/WP5-shape-and-distribution.md) | Opus | ShapeSolver + three-layer stack (§ 6), pods, depth/run-timing/pass-window, pass chains, carrier utility AI, **shape editor** (§ 9) | remaining `OpenPlayResolver` + `Lateral.ts` sweep model | overlap-conversion scenario; try distribution by channel sane |
| **6. Playbook** | [WP6](docs/upgrade/WP6-playbook.md) | Sonnet | Play-overlay system + schema, initial ~10-move library (§ 7.1), **play editor** (§ 9), familiarity penalty, match-day playbook UI (§ 7.2) | nothing (additive) | strike-play scenarios (miss-2 vs fold speeds); play-abort rate credible |
| **7. Kicking + restarts** | [WP7](docs/upgrade/WP7-kicking-and-restarts.md) | Sonnet | Trajectories, chase, aerial contests, height scalar (§ 5.7); spatial `KickOff`/`DropOut22`/`KickReturn` | `KickingResolver`/`BoxKickResolver` execution, `KickOffResolver` | kick-outcome rates in band; 50:22 at baseline rate; contested-take scenario |
| **8. Renderer + staging** | [WP8](docs/upgrade/WP8-renderer-and-staging.md) | Opus | `playFrames` driver in `PitchView` (§ 8.2), markers (§ 8.3), set-piece + ceremony staging layouts (§ 4.2/4.3) via choreography mode | authored choreography for spatial beats only | probe traces match frames; set-piece → strike → open play reads continuous; no regression on staged beats |
| **9. Polish to FM-quality** | [WP9](docs/upgrade/WP9-polish-to-fm-quality.md) | Sonnet | Decision-noise tuning, marker-timed commentary/sound, new telemetry metrics, Canvas Phase B decision | — | end-to-end watch test: a full match is *legible as rugby with the sound off* |

**Landed:** WP 0 ✅ · WP 1 ✅ · WP 2 ✅ · WP 3 ✅ · WP 4 ✅ · **WP 5 🚧 in progress** (ShapeSolver attack-half, by increment: **(1) continuous onside attack shape** — the carrier ENGAGES FROM THE RUCK each beat (snapped to the mark, runs forward), `reanchorSupport` trails the pod, `reanchorAttack` holds the off-ball forward cluster + backline behind the live gain line every tick; fixes the "support/backline ahead of the ball = offside" the watch test flagged. **(2) defensive open-side spread** — at a wide ruck, front-line slots that would clamp against the near touchline redistribute to the open field (`LINE_OPEN_REDIRECT_CAP = 2`) instead of packing it, while a central ruck stays byte-identical to the old symmetric layout (preserving the tuned fold/2-on-1). **(3) forward pods** — the off-ball forwards set up as PODS (`FORWARD_POD.podSize = 3`) posted across the field at the gain-line depth as receiving stations, fanned to the open side, instead of one loose cluster behind the ruck (`solveAttackSpread` + `reanchorAttack` unified into `layAttackShape`). **(4) style-driven pod spread** — the pod spread is keyed off the team's effective `attackingStyle` (`effAttackingStyle`): `keep_it_tight` keeps pods near the ruck (~11 m), `wide_wide` flings them to the edges (~21 m), `balanced` between (unchanged). **(5) pass mechanics** — a BACK carrier now receives the ball OUT WIDE in the backline; the ball sweeps from the ruck (scrum-half) through the backline to him (`runPassPhase`, `balance/spatialDecision.ts`) before he runs, so a wide play's carry visibly happens out wide (a back sweeps ≈ 13 m laterally; a forward takes a direct ruck pass). The sweep is frame-only (snapshot→sweep→restore, so live == silent; pass outcome stays on the legacy rolls), but the wide receiving point shifts the carry geometry. 24 spatial scenarios guard the shape (onside-discipline, open-side spread, style-driven pod spread, wide-receiving geometry, + the WP2-4 suite); full 5-seed bands hold: pts 24.59, tries 3.78, TO 2.02, pen 12.47, tackMade 63.6, home-win 55.11.

**(6) carrier utility AI** (§ 5.4) — the playmaker (fly-half) shades the wide-vs-hard READ on top of the team's `attackingStyle` base: he attacks the opponent's defensive-line weakness (blitz → wider, drift → tighter) + field position, scaled by his **composure** (a rattled 10 defaults to base tactic + rng; a composed 10 fully applies the read). The `rng()` draw is preserved — only the threshold moves — so the seam stays deterministic; all § 13 bands hold (pts 24.01, tries 3.69, home-win 54.89). Constants in `balance/spatialDecision.ts` (`CARRIER_UTILITY`).

**WP 5 status (🟡 core engine landed; remainder categorised):** the WP 5 OBJECTIVE — the open-play attacking game reads as rugby (shape, pods, onside support, the ball moving through the backline, a playmaker who reads the defence) — is delivered by increments 1–6 above and live on main. The remaining WP 5 deliverables, by nature:
- *Three-layer stack formalisation* (§ 6) — refactor. The layers exist implicitly (ShapeSolver = Layer 1; the per-tick re-anchors + contact = Layer 2/3); formalising the veto/interrupt seam + the debugger "why is he there?" annotations is outstanding.
- *Retire `OpenPlayResolver` + `Lateral.ts` sweep* (§ 5, deliverable 5) — **WP 8-coupled, deferred.** The LIVE display still walks `Lateral.ts`'s `BALL_REPOSITIONED` hops; it cannot be retired until the renderer reads the spatial frames (WP 8). The spatial pass chain already supplies the lateral truth in the frames.
- *Shape editor* (§ 9) — Phase Animator dev tool, not engine.
- *Try-channel telemetry metric* — needs `TRY_SCORED` to carry the channel (a frozen-event-shape change); composure-noise scenario needs the carrier utility AI.
- *Watch test* — owner sign-off (machines can't self-certify).)

**WP 4 deviations from the plan:**
- *Eligibility radius 12 → 16.* The plan suggested ~12 m; calibration showed 12 m starved some rucks of cleaners (committed attacker count fell below the attacking plan's supporter count), dropping points to 22.95 (below the 23.20 floor) and lifting turnovers. Widening to 16 m so the committed count tracks the legacy supporter count restored points (23.56) and tries (3.62) with turnovers on baseline (2.29). `isolationDropFactor` was the inert first lever (iso01 rarely crosses the threshold in real fixtures); the radius was the second, decisive pass — no escalation needed.
- *Resolver participant override, not replacement.* `BreakdownEvent` still consumes the legacy `rng()` supporter/jackal draws (exact order + count preserved) and overrides only the `Player`s handed to `resolveBreakdown`, so the outcome stream stays byte-identical and the non-spatial / revert path keeps live values. The silent-score golden was regenerated (intentional outcome shift — the contest now uses the spatially-committed participants).
- *Continuity teleport check is substrate-level.* `runCarrySim` needs a `MatchState`, so the programmatic no-teleport gate runs through a kit `continuitySequence` driver (seed on beat 0, no reseed after — mirrors the live continuation contract) rather than a full-match probe. The frame-debugger 10-phase visual review remains an owner gate.
- *Seeding-lifecycle fix (post-ship, frame-debugger surfaced).* The frame dump showed beats opening with all 30 dots piled on the ball and "blooming out like a flower." Two coupled causes, both from making Breakdown spatial: **(a)** Breakdown became the first spatial phase to hit a cold World, so it cold-built `buildWorld`'s all-on-ball stub but never seeded it (only the carry phase seeded, inside `runCarrySim`) — and the next PhasePlay treated the stub as a continuation and skipped its seed. Fixed in `ensureWorld`: only the carry phase (`PhasePlay`) may cold-build+seed; a cold Breakdown returns `null` (legacy participant fallback) and leaves the build to the next PhasePlay. **(b)** Even on PhasePlay, the seed lived inside `runCarrySim`, which a kick or pick-and-go beat never reaches — leaving the stub unseeded for the next continuation carry to inherit. Fixed by moving the seed out of `runCarrySim` into a lifecycle-owned `seedWorld(world, params)`, called once at `handlePhasePlay` cold entry **before** the kick/pick-and-go/carry split. With positions now real, frames open in formation on every beat; full 5-seed bands re-validated and held (pts 24.32, tries 3.74, TO 2.18, pen 12.48, tackMade 67.5), silent-score golden regenerated. The earlier `eligibilityRadius = 16` value still holds with correct positions.

**WP 3 deviations from the plan:**
- *CONTACT_RADIUS tuning.* The plan did not specify a contact radius; calibration converged at 2.2 coord-units (≈ 2.2 m) — wide enough to fire before agents pass through each other at 10 Hz, tight enough that the beat terminates late enough to be watchable. The 8-tick `MAX_TICKS_AFTER_BREAK` window (already in `spatialShape.ts`) gives the carrier a credible extra run after a broken tackle before the next contact opportunity closes in.
- *RNG stream preservation.* `handlePhasePlay` still calls `resolveOpenPlaySpatial` (consuming the same 5 `rng()` draws as the legacy path) and then overrides `res.outcome` / `res.collisionResult` with the spatial result. This preserves the stream count (byte-identical contact carries) at the cost of a redundant legacy computation — eliminated when WP 5 replaces `resolveOpenPlaySpatial` entirely.
- *`tryOffloadChain` skip.* The legacy offload chain is skipped when `sim.offloadAttempted` is true (spatial already rolled the offload window). This prevents double-emission; the spatial offload path is the new calibration baseline.
- *Watchability review + kill-criteria checkpoint* — **PASSED (owner sign-off, 2026-06-12).** The WP 3 spatial match is ≥ legacy credibility; WP 4 is cleared to proceed. Frame dump via `npm run probe -- --frames`.
- *Contact-timing fix (post-ship).* Two bugs caused instant/near-instant tackles that broke the "carry is a short run" visual contract: **(a) Seeding guard**: blitz standOff = 2.0u placed defenders inside `CONTACT_RADIUS = 2.2` before tick 0, so beat-2 ended in 1 tick with 0.0 ball path. Fixed in `seedFormation` (`World.ts`): after snapping agents onto formation slots, any defender within `CONTACT_RADIUS + SEEDING_CLEAR_MARGIN = 3.0u` is nudged away along `attackDir`. **(b) Launch grace gate** (`CarrySim.ts`): `detectContact` is now suppressed until the carrier has run ≥ `LAUNCH_GRACE_TICKS = 3` ticks **AND** ≥ `LAUNCH_GRACE_DIST = 1.5` coord-units from the carry start — the carrier receives the ball and runs onto it before the tackle can fire. Both constants in `src/engine/balance/spatialTackle.ts`. All-seeds bands post-fix (450 fixtures): tries 3.67, pts 23.87, pen 12.70 (ceiling 12.9), tackMade 63.23, homeWin 52.67% — all in range. Frame probe confirms: before fix, beat counts 11,8,**1**,8,8,8,8,8,3,3 (beat-2 = 1 tick, 0.0 ball path); after fix, 12,12,12,12,12,12,12,12,12,5 — no 1-tick instant tackles.
- *Backfield slot fix (post-ship).* `solveDefence` picked the 1–2 backfield defenders by depth sort (deepest current x), which chose whichever agents happened to be first in the iteration order — in practice props (slots 1, 2) because all agents start on the ball and the sort was tie-stable. Fixed: backfield is now selected by matchday slot — fullback (15) first, then wings (14, 11) — with fallback to remaining backs (slots 9–15) deepest-first, then the old depth sort as a last resort. Props and forwards rejoin the front line; kick-cover is always the correct specialist players. Frame probe confirms: before fix, 2 deepest defenders were {1, 2} (props); after fix, {14, 15} or {15, 14} (back three) in every beat across all 10 live PhasePlay beats. All-seeds bands post-fix (450 fixtures): tries 3.61, pts 23.51, pen 12.40, tackMade 62.79, homeWin 53.11% — all in range. New scenario "backfield selection: back three by slot, not deepest-by-position" guards the fix (16 spatial scenarios total); fold-overlap thresholds recalibrated.

**WP 2 deviations from the plan:**
- *Lateral-dominant gap metric.* The line-break gap is measured `|Δy| + behind·0.6` (not raw Euclidean) so a defender the carrier ran *past* counts as beaten — pure distance wrongly credited a beaten defender as covering, which broke the fold-overlap scenario and inflated home-win share. Restored the bands and the emergent overlap.
- *`speedScale` field on `Agent`.* Fold speed is applied via a new per-beat `Agent.speedScale` (1 by default) that `MovementSystem` multiplies into the arrive() velocity, NOT by scaling `pace` — the steering speed derivation clamps `pace` at 20, so a 1–100 baseStat scaled by the fold mult still saturated. `speedScale` defaults to 1 for the scenario-kit/trajectory-hash agents, so the frozen WP 1 trajectory hash is unchanged.
- *Mod-shift on the gap threshold.* The legacy `attackMod − defendMod` (home advantage, team talk, tactics) is folded into the break threshold (`modGapWeight`) so those match-shaping factors still bias line breaks — otherwise the pure-geometry verdict dropped them and home-win drifted out of band.
- *Offside narration* reuses the existing `offside_at_ruck_penalty` key (added to the PHASE_PLAY bank) rather than a new key.
- *Initial-placement correction (post-merge).* WP2 built the ShapeSolver (which computes formation TARGETS during the sim) but left `resetWorld`'s on-ball stub — so every beat OPENED with all 30 agents piled on the ball (frame-0 dump: 30/30 within 0.4 u, x/y-range < 1 u) and bloomed outward into a shapeless swarm. Fixed by seeding the opening formation: `solveAttackSpread` (new ShapeSolver pass — placeholder forward cluster + fanning backline for the non-corridor attackers) plus `seedFormation` (`World.ts`) snap every agent off the ball onto its computed formation slot at frame 0 (defenders/spread → target; carrier/support → at/near the mark; empty slots → parked corner). A small **deterministic** slot-keyed stagger (`FORMATION_STAGGER`, no `rngSpatial` draw — a random draw would perturb the beat's downstream gap/offside stream and make outcomes hypersensitive to the stagger magnitude) breaks the ruler-straight wall. After: frame-0 ~5/30 within 5 u (carrier + support), longitudinal spread ~26 u, lateral ~73 u. All § 13 bands hold on 450 fixtures; the verify-mode fast band check now samples 2 seeds (180 fixtures) instead of 1, because post-velocity-fix the points metric sits on its floor and a single 90-fixture seed false-fails on sampling noise.
- *Carry-watchability fixes (post-merge, from the frame-dump review).* Three diagnosed watchability bugs fixed: **① backfield sign** — `solveDefence` posted the backfield at `mark.x − attackDir·22` (in front of the attackers, stranding slots 1–2 offside); corrected to `mark.x + attackDir·22` (deep on the defenders' side). **② ball frozen** — the micro-tick loop never moved `world.ball`, so the frame ball-path was 0.0 and `carrierSlot` undefined while the carrier ran ~12 u; a new `postMove` hook (`coupleBallToCarrier`) glues the ball to the carrier each tick (ball path now ~10–13 u, `carrierSlot` set). **③ static line** — `solveDefence` ran once before the loop, so the line never reacted (~1.5–2.8 u/beat); a new `preMove` hook (`reanchorDefence`) re-anchors the front line onto the live carrier each tick — forward press toward the gain line (`forwardPress`, capped by `pressCap` so offside stays coherent against the fixed mark) + lateral slide to the carrier's channel (`lateralTrack`), keyed per `defensiveLine` tactic — so the line now moves ~3.5–4.7 u/beat. The two hooks added a `(preMove?, postMove?)` signature to `SpatialSimulator.run` (replacing the WP1 `setIntent` stub callback), allocation-free, frozen iteration order preserved. Bug ③'s improved coverage nudged tackles-made/home-win/penalties nearer their band edges; tuned `DEFENCE_REANCHOR` (pressGain 0.55, trackGain 0.12) so all § 13 bands hold on 450 fixtures, and the verify-mode fast band check now samples **3 seeds (270 fixtures)** — 2 seeds proved too noisy at the new edges. A new "ball travels with the carrier" scenario guards Bug ② (8 spatial scenarios total). The frozen `spatialBaselines.ts` bands are unchanged.
- *Watchability review* is PENDING owner sign-off (the one gate a machine cannot self-certify) — frame dump at `harness/frames.json` via `npm run probe -- --frames`.

Sequencing rationale: the debugger before anything watchable (every later gate uses it); defence before attack (attacking play is only as believable as the line it attacks); contact before breakdown (ruck context derives from tackle outcomes); continuity before shape (folding defences must persist for overlaps to mean anything); rendering after engine truth settles.

**Kill criteria (honesty clause):** if after WP 3 the spatial match is *less* credible than the legacy engine and two tuning passes haven't closed the gap, stop and reassess. The legacy engine remains fully intact underneath at every WP — reverting any phase is a router-table change.

---

## 15. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Emergent play looks like ants, not rugby** — the project-defining risk | High at first | Drilled-systems defence (§ 5.2), data-authored shapes (§ 5.3), three-layer stack (§ 6): *scripted skeleton, emergent muscle*. Frame debugger makes every failure diagnosable. Scenario suite + per-WP watchability gates. Kill criteria above. |
| Calibration whack-a-mole (fixing tries breaks penalties) | Medium | One WP at a time behind the seam; telemetry bands as merge gates; legacy formulas retained as inputs (WP 4) before any replacement |
| Hybrid-period complexity (two resolution styles coexisting) | Medium | The `PhaseResult` contract makes them indistinguishable downstream; `rngSpatial` isolation prevents cross-perturbation; the phase map (§ 4) gives every phase exactly one owner |
| Phase-transition seams look wrong (teleports, dots fought over) | Medium | Continuity rule (§ 3) + one-driver-per-beat contract (§ 8.2) are designed for exactly this; WP 4 and WP 8 gate on it explicitly |
| Determinism regression from float trajectory accumulation | Low | Single-threaded, fixed iteration order, seeded streams; trajectory hash in `verify` catches drift instantly |
| Scope creep into attribute expansion / new authored data | Medium | Explicitly out of scope for v1 (§ 10); requires its own data-contract decision |

---

## 16. The iOS-native sequel (relationship to this plan)

This plan **is** the de-risking step for a native sequel. If the spatial engine proves out here:

- The validated design — this doc, the updated `docs/match-engine.md`, the `balance/spatial*.ts` numbers, the playbook data, and the scenario suite — becomes the Swift implementation spec.
- Tier-1 assets port verbatim (team JSONs, balance constants, fixtures); the season/career logic ports as validated design; the `MatchEvent`-union/reducer architecture maps *better* to Swift (enums with associated values, exhaustive `switch`) than it sits in TS; the frame-stream renderer contract (§ 8) maps directly onto SpriteKit-as-passive-consumer.
- The native build then re-implements a **known-good** engine with Metal-class rendering on top — a port, not a research project.

If it doesn't prove out, that's learned for the cost of some TypeScript work packages instead of a year-long platform rewrite.

---

*Companion docs: `docs/match-engine.md` (current engine reference — update per WP), `docs/DESIGN.md` § 15.7 (rendering invariants), `docs/animation-feedback-playbook.md` (WP 8+), `docs/phase-animator.md` (§ 9 modes land here), `telemetry/latest.md` (live baselines for § 13).*
