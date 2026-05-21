# Architecture Review — Scalability

A point-in-time architectural review against the invariants in `CLAUDE.md` and best-practice patterns for sport simulators. The codebase is healthy today; this document is forward-looking, identifying where the structures that hold at one-match-at-a-time will strain under expected growth (season simulation, multi-league, multi-match player careers, save/resume).

Companion documents: `docs/match-engine.md` (engine internals), `docs/DESIGN.md` (visual design), `CLAUDE.md` (architectural invariants and ways of working). This file does not duplicate them.

---

## 1. Executive summary

**Verdict: healthy.** Every CLAUDE.md invariant audited is being honoured strictly. There are no god objects, no leaked randomness, no mutation outside `applyMatchEvent`, no engine-imports-UI violations, no direct DOM display toggling outside `ScreenRouter`. Snapshot DTOs (`GameEvent`, `PenaltyContext`, `MatchEvent` payloads) keep flat scalar fields even where live state has nested. Balance constants are centralized. The three RNG streams are isolated.

**The growth risks are external to those invariants.** They concern *what the architecture doesn't yet do* — headless batch simulation, replay verification, dynamic team loading, profile/match-player separation — not the quality of what's there.

**Headline numbers:**

| Metric | Value |
|---|---|
| Engine files / total LOC | 32 / 3,266 |
| UI files | 18 |
| `MatchEvent` union variants | 38 |
| Largest engine file | `MatchCoordinator.ts` (430 LOC) |
| Largest UI file | `PreMatchScreen.ts` (431 LOC) |
| `balance.ts` | 357 LOC |
| Direct-mutation violations | 0 |
| `Math.random()` calls outside `rng.ts` | 0 |
| Tests / linters | 0 |

**One thing to do before any further refactor:** stand up a determinism golden-master script (R1 below). It backstops every other change by detecting non-deterministic regressions automatically.

---

## 2. CLAUDE.md compliance audit

Each invariant in `CLAUDE.md` was audited against the current code. All pass.

| § | Invariant | Status | Evidence |
|---|---|---|---|
| §2 | Simplicity First — no speculative abstractions | PASS | No store/dispatcher wrappers; no plugin systems; no feature-flagged half-implementations |
| §3 | Snapshot DTOs stay flat when live state restructures | PASS | `GameEvent.ballX/ballY` (`src/types/match.ts`) and `PenaltyContext.ballX/ballY` (`src/types/engine.ts`) are scalar; live `state.ball.x/y` is nested. `MatchEvent.BREAKDOWN_MOD_SET` carries `{ attack, defend }` as flat fields |
| §4 | Navigation via `screenRouter.show(id)` | PASS | Only `src/ui/ScreenRouter.ts` touches `style.display`; every navigation in `main.ts` routes through `screenRouter.show()` |
| §4 | `MatchCoordinator` owns and releases bus subscriptions | PASS | Constructor captures unsubs in `busUnsubs[]`; `destroy()` runs them, cancels the tick timer, clears the run flag (`src/engine/MatchCoordinator.ts:161–171`); `main.ts` calls `engine.destroy()` after the match-result overlay is dismissed |
| §5 | All `MatchState`/player writes flow through `applyMatchEvent` | PASS | The only `state.events.push` is in the `COMMENTARY_LOGGED` branch of `applyMatchEvent` (`src/engine/applyMatchEvent.ts:303`). `player.fatiguePct`/`currentStats` are only written in the `FATIGUE_APPLIED` branch (lines 252–253). `player.rating` is only written in the `RATINGS_RECALCULATED` branch (lines 297–298). All 11 phase handlers in `src/engine/events/` are read-only and return `PhaseResult.events` |
| §5 | Domain-meaningful event names | PASS | The 38 `MatchEvent` variants are all domain verbs (`TRY_SCORED`, `KNOCK_ON`, `LINEOUT_RESOLVED`); the documented exceptions for structural setters (`BALL_REPOSITIONED`, `PHASE_CHANGED`, `BREAKDOWN_MOD_SET`, `POSSESSION_SWAPPED`, `POSSESSION_SET`) are present and used only where the domain has no single name |
| §6 | All randomness flows through `src/utils/rng.ts` | PASS | The single `Math.random()` call lives at `src/utils/rng.ts:26` in `generateSeed()`, used only when no seed is passed. Three streams (`outcomeRand`/`formRand`/`commentaryRand`) seeded once via `setMatchSeed` |
| Balance | Every tuning literal in `balance.ts` | PASS | No tuning literals leaked into resolvers or events. Jersey-number checks (`p.id <= 8` etc.) and RNG shape values (`rng(1, 20)`) are documented exemptions |
| Engine↔UI | Engine never imports UI; UI calls engine only via `SimController` | PASS | No engine file imports from `src/ui/`. Only `SimController` holds the `MatchCoordinator` reference and exposes `start/pause/resume/setTickDelay/getState/substitute` |
| Event bus | Subscriptions are either permanent (documented) or unsub'd | PASS | The 5 permanent subscribers (`CommentaryFeed`, `Scoreboard`, `PitchStrip`, `StatsPanel`, `ModalManager`) are documented in CLAUDE.md §4. `SimController` and `CommentaryFeed`'s team-colour cache are per-match and tracked |

**Nothing to fix here.** The discipline is the work product.

---

## 3. Sport-simulator best-practice benchmark

The codebase is benchmarked against seven patterns common in shipped sport simulators (Football Manager, Out of the Park Baseball, EA Sports CM, fan-made cricket/rugby sims). The verdicts:

| Pattern | Status | Notes |
|---|---|---|
| **Determinism + replayability** | PRESENT but UNVERIFIED | Seed and three isolated RNG streams are in place. There is no test harness that pins event-log hashes — meaning a refactor could quietly change RNG ordering and no human would notice until a saved match diverged. R1 closes this. |
| **Event sourcing as canonical record** | PARTIAL | `state.events[]` is the de-facto event log: every domain change is reified as a `MatchEvent` and applied through one reducer. The log is in-memory only, unbounded, and not yet used for replay, save, or analytics. The shape is right; the consumers are missing. |
| **Headless / batch simulation** | ABSENT | `MatchCoordinator` is structurally decoupled from UI (no UI imports, all communication via `eventBus`), but it **emits unconditionally**. There is no `simulateMatchHeadless(home, away, seed)` API and no way to skip commentary/event emission for batch sim. This blocks season simulation. R4. |
| **Data-driven tuning** | STRONG | `balance.ts` is centralized, team data is in JSON, commentary templates are data. Designers can tune without touching engine code. |
| **Schema versioning / save migration** | PARTIAL | `SavedGame.version` exists in `src/ui/SaveManager.ts`, but only the season summary is persisted. `MatchEvent` itself has no schema version. The moment a save persists `state.events[]`, the next event-shape change breaks shipped saves. R7. |
| **Bounded memory per match** | WEAK | `state.events[]` grows unbounded per match (~500 events for an 80-minute match today). Fine while only the current match is in memory. Problematic if a season-summary screen keeps multiple finished matches resident, or if very long matches are introduced. R9. |
| **Profile-vs-instance entity split** | WEAK | `Player` (`src/types/player.ts`) conflates identity (`firstName`, `lastName`, `dob`, `nationality`, `position`, `baseStats`) with per-match state (`currentStats`, `matchStats`, `fatiguePct`, `formModifier`, `rating`, `x`, `y`, `squadNumber`). Acceptable for one-match-in-memory; obstructs multi-match careers, player-of-the-season aggregation, transfers, and save-as-tuple. R5. |

---

## 4. Scaling pressure points (ranked)

Each point: **what's at risk**, **where** in the code, **what concrete growth event triggers the issue**, **what fails if ignored**, and **rough cost** (S = hours, M = a day, L = a few days).

### 1. No determinism / replay test harness
- **Where:** Nowhere — this is missing infrastructure.
- **Trigger:** Any change that affects RNG call order. This includes innocuous-looking refactors (adding a `commentaryChance()` call in the wrong stream, reordering resolver calls, adding an early-return).
- **Risk if ignored:** Silent replay breakage. A seed that produces match X today produces match Y after a refactor. No human will notice until the first save/replay/share feature ships.
- **Cost:** S.

### 2. No headless simulation entry point
- **Where:** `src/engine/MatchCoordinator.ts`, `src/main.ts`.
- **Trigger:** Season-simulation feature (round-robin = 45 fixtures), AI-vs-AI matches outside the player's fixture, "simulate to end of half" feature.
- **Risk if ignored:** Forced to spin a full DOM/UI subscription set per simulated match. Batches become impractical. Season sim falls back to fake/stub scorelines, breaking continuity with single-match results.
- **Cost:** M.

### 3. `Player` mixes identity and per-match state
- **Where:** `src/types/player.ts`.
- **Trigger:** Multi-match player careers, season player-of-the-season, transfers, injury continuity across matches.
- **Risk if ignored:** Every cross-match aggregation has to re-`initPlayer()` from `baseStats`, losing form/injury continuity. Saves bloat with redundant identity data. Player look-ups by identity become awkward (you have a `Player` from match N, but its mutable fields reflect match N's state).
- **Cost:** M–L.

### 4. Static team imports
- **Where:** `src/main.ts:38–47` (ten hardcoded `import bathRaw from './data/team-bath.json'` lines).
- **Trigger:** Second league (URC, Top 14, Championship), or seasonally regenerated rosters.
- **Risk if ignored:** Bundle bloat (every team in every build), every new team requires a code change, no path to lazy-load teams the player will never view.
- **Cost:** M.

### 5. `balance.ts` approaching split threshold
- **Where:** `src/engine/balance.ts` (357 lines, 16+ sections).
- **Trigger:** Two more phases (e.g. `MAUL`, `DROP_GOAL_ATTEMPT`) or expanded tactic dimensions.
- **Risk if ignored:** File becomes the largest in the engine, fish-eye searching becomes painful, naming collisions become harder to avoid.
- **Cost:** S.

### 6. `MatchCoordinator` accreting orchestration concerns
- **Where:** `src/engine/MatchCoordinator.ts` (430 lines).
- **Trigger:** Any additional cross-cutting tracker — yellow-card timer, injury rolls, momentum, weather, crowd.
- **Risk if ignored:** God-object emerges. The current responsibilities — public API, tick loop, fatigue accumulator, entry-22 tracker, substitution orchestration, bus lifecycle — are already five concerns sharing one file.
- **Cost:** S–M.

### 7. `MatchEvent` schema has no version
- **Where:** `src/types/matchEvent.ts`.
- **Trigger:** First save format that persists event logs (replay viewer, shareable match seed, season highlights).
- **Risk if ignored:** Shipped saves break on the next event-shape change. Migration becomes ad-hoc and fragile.
- **Cost:** S.

### 8. Phase FSM runtime-checked, not type-checked
- **Where:** `src/engine/StateMachine.ts` (47 lines, throws on illegal transitions).
- **Trigger:** Three or more new phases on the roadmap (maul, drop-goal, restart-22m, yellow-card sin-bin timer).
- **Risk if ignored:** Illegal transitions caught only at runtime, only on the playtest path that exercises them. Compile-time exhaustiveness would surface them at build.
- **Cost:** M.

### 9. Unbounded `state.events[]`
- **Where:** Live `MatchState`.
- **Trigger:** Keeping more than ~5 finished matches in memory simultaneously (season highlights view, side-by-side comparison), or very long matches if duration becomes configurable.
- **Risk if ignored:** Memory growth. With 500 events × 30 matches × a few hundred bytes per event, you're at low-MB before mitigations are needed, but the curve is bad.
- **Cost:** S.

### 10. `PreMatchScreen.ts` size
- **Where:** `src/ui/PreMatchScreen.ts` (431 lines).
- **Trigger:** Any new pre-match feature — formation editor, opposition scouting, kit selector, weather forecast.
- **Risk if ignored:** Largest screen file becomes a god-screen mixing team selection, jersey assignment, tactics modal launch, and player stat display.
- **Cost:** S.

---

## 5. Recommended refactors — Now / Next / Later

Phased so that each refactor is justified by a concrete trigger and can be deferred until that trigger lands. CLAUDE.md §2 ("Simplicity First") is honoured: don't pre-emptively split for hypothetical futures, but do put in place the infrastructure (R1) that lets all later splits land safely.

### Now — do before the next feature

#### R1 — Determinism golden-master test
Build a Node-runnable script (`scripts/checkDeterminism.mjs`) that:
1. Instantiates `MatchCoordinator` with a fixed `(seed, home, away, tactics)` tuple.
2. Ticks it synchronously to completion (requires the headless option from R4, or a temporary tick-loop driver).
3. Hashes `state.events[]` (stable JSON stringify → SHA-256).
4. Repeats with the same inputs and asserts the hash is identical.
5. Compares against a committed golden hash for regression detection.

Wire to `npm run verify` (new script). Document in `CLAUDE.md`'s commands table. This is the precondition for every subsequent refactor — once it exists, every PR can be checked for replay-breaking changes in seconds.

**Files:** `scripts/checkDeterminism.mjs` (new), `package.json` (new script), `CLAUDE.md` (commands table line).

**Note:** R1 has a chicken-and-egg with R4 — running a match in Node currently requires DOM/UI bootstrap. The minimum viable R1 builds just enough of a headless driver to run one match; R4 generalises it.

#### R2 — Split `balance.ts` into `balance/` directory
Move the 16 sections into one file per phase domain:
- `balance/kicking.ts` (kick probabilities, goal kick, tactical kick, box kick)
- `balance/breakdown.ts`
- `balance/scrum.ts`
- `balance/lineout.ts`
- `balance/openPlay.ts` (carries, handling, hard-carry thresholds)
- `balance/kickOff.ts`
- `balance/fatigue.ts` (FATIGUE_SCALING)
- `balance/rating.ts` (RATING_WEIGHTS, PLAYER_OVERALL_WEIGHTS)
- `balance/tactics.ts` (TACTIC_MODIFIERS)
- `balance/clock.ts` (CLOCK_VALUES)
- `balance/penalty.ts` (PENALTY_VALUES)
- `balance/commentary.ts` (COMMENTARY_CHANCES)

Re-export everything from `balance/index.ts` so existing imports (`import { FATIGUE_SCALING } from './balance'`) continue to work unchanged.

**Files:** `src/engine/balance/*` (new), `src/engine/balance.ts` (delete after barrel works).
**Exit criteria:** No other file changes. `npm run build` clean. R1 hash unchanged.

#### R3 — Extract `FatigueAccumulator` and `Entry22Tracker` from `MatchCoordinator`
Both are stateful side-effects driven by the tick loop. Pull them into modules with a small surface area:
- `src/engine/FatigueAccumulator.ts` — owns the per-minute fatigue computation and `FATIGUE_APPLIED` emission cadence
- `src/engine/Entry22Tracker.ts` — owns the in-opposition-22 entry detection and `MATCH_STATS_UPDATED` increments

`MatchCoordinator` constructs both, calls `tick()` on each per match-minute. Coordinator drops below 350 lines and is purely orchestration.

**Files:** `src/engine/FatigueAccumulator.ts` (new), `src/engine/Entry22Tracker.ts` (new), `src/engine/MatchCoordinator.ts` (slim down), `docs/match-engine.md` (Architecture table — per the "module-boundary change is an engine change" rule).
**Exit criteria:** R1 hash unchanged. `MatchCoordinator` below 350 lines.

---

### Next — do before season simulation lands

#### R4 — Headless simulation API
Add `src/engine/headless.ts` exporting `simulateMatchHeadless(home, away, seed, tactics?): MatchSummary`. It:
1. Constructs a `MatchCoordinator` with a new `{ silent: true }` constructor option that:
   - Suppresses `eventBus.emit` calls (engine works against a no-op bus)
   - Skips `NarrationDescriptor` population on `GameEvent`s
2. Ticks synchronously until `state.engine.isFinished`.
3. Returns `{ score, stats, ratings, eventLogHash, winnerSide }`.

This is also the substrate R1 has been waiting for. Once it exists, `checkDeterminism.mjs` is a one-liner.

**Files:** `src/engine/headless.ts` (new), `src/engine/MatchCoordinator.ts` (silent-mode constructor option, suppress eventBus emits when silent), `src/engine/PhaseRouter.ts` (skip `NarrationDescriptor` population when silent — or pass a `narrationEnabled` flag).
**Exit criteria:** A node script can run 45 matches in <1s. Visible-match behaviour unchanged.

#### R5 — Split `Player` into `PlayerProfile` + `MatchPlayer`
Identity vs. per-match state:
- **`PlayerProfile`** — `id`, `firstName`, `lastName`, `dob`, `nationality`, `position`, `baseStats`. Loaded from JSON, never mutated.
- **`MatchPlayer`** — `{ profile: PlayerProfile, squadNumber, currentStats, matchStats, fatiguePct, formModifier, rating, x, y }`. Created at match start, mutated through `applyMatchEvent`, discarded at match end (or kept in match history).

Saves carry profile IDs only. Cross-match aggregations (player-of-the-season, season fatigue carryover, transfers) become trivial. The mutation boundary moves from `Player` to `MatchPlayer` cleanly — `applyMatchEvent` writes only to `MatchPlayer`.

**Files:** `src/types/player.ts` (split), `src/engine/MatchCoordinator.ts` (`initPlayer` returns `MatchPlayer`), every reader of `player.firstName`/`player.position` (UI side, mostly via `playerName()` utility), `src/engine/applyMatchEvent.ts` (mutate `MatchPlayer`, not `Player`), `docs/match-engine.md` (Architecture section).
**Exit criteria:** Type-check passes. No `MatchPlayer` is reused across matches. R1 hash unchanged.

#### R6 — Dynamic team loader
- Add `src/data/teams.index.json` — manifest of `{ id, file, league, division }` for every team.
- `src/utils/teamProfile.ts` accepts a loader interface; default loader uses dynamic `import()` per team.
- `main.ts` no longer hand-imports ten JSONs. Teams load when the team-selector screen needs them; the match coordinator receives raw team data via the loader.

Sets the foundation for multi-league. A second league becomes a manifest extension, not a code change.

**Files:** `src/data/teams.index.json` (new), `src/utils/teamProfile.ts` (loader interface), `src/main.ts` (drop hand-imports), `scripts/generateTeamJsons.mjs` (also generate the manifest).
**Exit criteria:** Adding a team is a JSON file + a manifest line. Build size for the main bundle drops (teams become async chunks).

---

### Later — set explicit triggers; do not do pre-emptively

These are correctly absent today. Each has a concrete trigger; until it fires, the simplest thing wins.

#### R7 — `MatchEvent` schema versioning
**Trigger:** First feature that persists event logs to disk (replay viewer, shareable match seed, season highlights with rewindable matches).
**Sketch:** `SCHEMA_VERSION` constant in `src/types/matchEvent.ts`. Migration registry in `src/engine/migrations/`. Saves carry `{ schemaVersion, events }`; load runs the migration chain.

#### R8 — Type-level phase FSM
**Trigger:** Three or more new phases on the roadmap (maul, drop-goal, restart-22m, yellow-card sin-bin timer).
**Sketch:** Replace `StateMachine.ts`'s `transition()` method with a declarative typed map; transitions become exhaustively checked at compile time.

#### R9 — Bounded event log / external sink
**Trigger:** Keeping more than 5 finished matches in memory at once (season highlights, side-by-side comparison).
**Sketch:** Ring buffer in `MatchState` (last N events kept live); injectable sink interface for the full log (held by orchestrator, queryable for analytics).

#### R10 — Telemetry / analytics dump
**Trigger:** Balance iteration becoming hard to reason about ("did this tactic change move the needle?").
**Sketch:** `summariseMatch(events): MatchAnalytics` — possession curves, fatigue trajectories, tactic-outcome breakdowns. Plug into R4's headless mode for batch balance regression runs.

#### R11 — `PreMatchScreen.ts` split
**Trigger:** Any new pre-match feature (formation editor, opposition scouting, kit selector).
**Sketch:** Extract player-grid renderer to `PreMatchLineupGrid.ts`; tactics modal launch stays in `PreMatchScreen`.

---

## 6. What NOT to do

Aggressive on refactors-for-scale doesn't mean aggressive on abstraction. The following are **anti-recommendations** — preserve simplicity by not building them:

- **Don't introduce a `Store` wrapper around `MatchState`.** It's already a typed object behind the `applyMatchEvent` mutation boundary. A store wrapper would add a layer without removing a coupling.
- **Don't introduce a `Dispatcher` wrapper around `eventBus`.** It's already typed and singleton at `src/utils/eventBus.ts`. The "namespacing is not decoupling" rule in CLAUDE.md §3 applies.
- **Don't migrate to ECS.** `Player`'s fields aren't orthogonal enough to justify entity/component indirection. The profile/match-player split (R5) is the right shape for the actual decoupling need (identity vs. instance).
- **Don't add a plugin system for tactics or commentary** until a second consumer exists. Today there is one game and one renderer.
- **Don't pre-emptively persist `state.events[]` to localStorage.** Wait for the replay-viewer or share-match feature to trigger R7. Persisting an unversioned event log now means migration debt the day the schema changes.
- **Don't decouple `state.phase` into a separate sub-namespace** under the banner of "modularity". Per CLAUDE.md §3, namespacing is not decoupling — the coupling is identical.

---

## 7. How to verify this review

This document is a snapshot. To verify its claims and keep it honest:

1. **Compliance audit (§2):** Re-grep the violations listed as zero — they should remain zero after each commit. The grep patterns:
   - `state.events.push` outside `applyMatchEvent.ts` → must be zero
   - `Math.random()` outside `rng.ts` → must be zero
   - Engine files (`src/engine/**`) importing `src/ui/**` → must be zero
   - `style.display` outside `ScreenRouter.ts` → must be zero
2. **Headline numbers (§1):** Re-run `wc -l` against the listed files; flag any that grows past its stated threshold (e.g. `balance.ts` past 500, `MatchCoordinator.ts` past 500, `PreMatchScreen.ts` past 600).
3. **Refactor exit criteria (§5):** Each R-numbered refactor states its own exit criteria — the R1 hash invariance test is the canonical safety net.
4. **Best-practice benchmark (§3):** Re-rate when R4, R5, R7 land — they're the items that move the four WEAK/PARTIAL/ABSENT scores up to STRONG.

Refactors land **one cohesive split per commit**, version bumped in `src/version.ts`, `npm run build` clean. R1 is the first to land — once it exists, every subsequent refactor is automatically guarded.
