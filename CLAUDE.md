# CLAUDE.md

Architectural invariants and ways of working for this repo. Lean by design. Read in full at session start. Deep-dive docs and source-of-truth pointers:

| Topic | Doc / source |
|---|---|
| Match-engine internals — phases, resolvers, RNG, tactics, cards, maul, commentary, UI event-bus | **`docs/match-engine.md`** |
| Season/career engine — GameCoordinator, season state, fixtures, AI sims, standings, save format | **`docs/game-engine.md`** |
| Transfer system — all 10 phases, market windows, signings, renewals, poaching, supply | **`docs/transfer-system.md`** |
| Media manager — generated inbox stories, phrase bank, personas, determinism | **`docs/media-manager.md`** |
| Visual design + navigation flow + screen architecture + Hub tile list | **`docs/DESIGN.md`** |
| 2D pitch animation — layers, seams, choreography, dot persistence | **`docs/DESIGN.md`** § 15.7 |
| League Cup | **`docs/league-cup.md`** ↔ `src/game/cupScheduler.ts` |
| Fixture schedule | **`docs/prem-fixtures-2025-26.md`** ↔ `src/data/fixtures-2025-26.ts` |
| Team data (squad tables, baseStats, star players) | **`docs/team-data.md`** → `node scripts/generateTeamJsons.mjs` syncs JSONs |
| Phase Animator dev tool (keyframe authoring) | **`docs/phase-animator.md`** ↔ `public/tools/phase-animator.html` (regen: `npm run export:phases`) |
| Wiring an exported animation JSON | **`docs/phase-animator.md`** § 9 + **`docs/DESIGN.md`** § 15.7 |

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Do not deep-clone data structures just to pass them to `JSON.stringify()` (e.g., save payloads). `JSON.stringify` naturally traverses objects without mutation; explicitly allocating deep clones beforehand causes severe GC churn.
- Avoid heavy functional object pipelines (e.g., `Object.fromEntries(Object.entries(x).map(...))`) inside high-frequency engine loops. A simple `for` loop populating a single object is faster and avoids severe GC churn.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

**Resolve constant arithmetic at write-time, not runtime.** If a formula applies a fixed multiplier or offset to a literal or random range, collapse it. `rng(0.5, 1.5) * 8` → `rng(4, 12)`. The result should express the actual value used, not the derivation of it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.

The test: every changed line traces directly to the user's request.

**Restructuring a live type doesn't restructure its snapshots.** A frozen log row, an event-bus payload, or a replay event has schema lifetime independent of the live state it was copied from. `GameEvent.ballX/ballY`, `GameEvent.movements` (the frozen in-phase ball path), `PenaltyContext.*`, and `MatchEvent` payload fields stay scalar even when their source moved into `state.ball`/`state.clock`. The test: would renaming break replay, an existing log entry, or a downstream consumer that already serialised the old shape? If yes, leave it alone.

**Namespacing is not decoupling.** `state.phase.breakdownMod` has identical coupling properties to `state.breakdownMod`. Before drafting a "decouple" refactor, name the specific coupling smell and verify the proposed shape actually removes it.

## 4. Module Boundaries

**Split before god objects form. Don't wrap clean primitives.**

- Split a file when it accumulates multiple unrelated responsibilities.
- Don't wrap already-clean primitives (typed state object in a "store"; typed pub/sub singleton in a "dispatcher").
- Prefer pure functions over methods when state can be passed directly. `FieldPosition` helpers take `state: MatchState` as an argument; they are not closures threaded through a deps interface.
- Use constructor DI for classes whose methods share the same deps (`PenaltyHandler`, `CardHandler`, `ClockController`; the season sub-coordinators `TransferCoordinator`, `StaffCoordinator`, `BoardCoordinator`, `PlayoffCoordinator`, `InternationalBreakCoordinator` — each takes the shared `GameState`, plus `teamsById` where it runs team lookups / sims). Use module-level functions for pure helpers (`FieldPosition`, `PhaseRouter`; the season helpers `injuryEffects`, `moraleEffects`, `trainingRunner`).
- Extract a shared utility the moment a second module needs it, not before.
- Refactor incrementally — one cohesive split per commit; each commit must build clean and preserve behaviour.
- A module-boundary change is an engine change — update the matching engine doc in the same commit (`docs/match-engine.md` for `src/engine/` work, `docs/game-engine.md` for `src/game/` work).

**Key architectural rules:**

- **Navigation goes through `screenRouter.show(id)`** (`src/ui/ScreenRouter.ts`). Screen modules never poke `document.getElementById('…').style.display` directly; they accept `onForward`/`onBack` callbacks from `main.ts`. Full navigation flow and Hub tile list: **`docs/DESIGN.md`** § 15.
- **The Hub tile count is fixed at six. Do not add more Hub tiles.** New in-season screens must be reached through an existing sub-menu. `ClubMenuScreen` (add a `.cm-nav-row` entry) and `ContractsTransfersMenuScreen` (add a `.hub-tile` entry) are the designated homes for new club-management screens.
- **In-season screens are initialised once per page lifetime** via `initInSeasonScreens()` in `main.ts` (gated by `inSeasonInited`). Each takes a `getGameEngine: () => GameCoordinator` getter — not the engine reference — so a new game reaches every screen without re-init. See **`docs/DESIGN.md`** § 15.2.
- **`MatchCoordinator` owns its event-bus subscriptions and must be destroyed.** `main.ts` calls `engine.destroy()` after the match-result overlay is dismissed.
- **`silent: true` on `MatchCoordinator`** suppresses every `engine:*` emit except `engine:finished`, skips UI-event subscriptions, and short-circuits modal prompts to defaults. Every orchestrator that emits to the bus must gate on this flag.
- **`state.engine.humanSide`** is the canonical source for which side the manager picked — set once in `initMatchState`, never mutated.
- **`Player.rosterId` is the persistent identity; `Player.id` is the matchday slot 1-23.** `SeasonEvent` variants carry `rosterId`; `MatchEvent` variants carry `id`. Don't conflate the two.
- **`state.phase` is the sole source of truth for the current phase.** All transitions go through `PHASE_CHANGED` via `applyMatchEvent`.
- **`GameCoordinator.recordPlayerMatchResult` is idempotent per round.** Any new mutations added inside it must go AFTER the re-entry guard at the top.
- **Slot constants live in `src/engine/Slot.ts`** — use `SLOT.SCRUM_HALF` etc., not raw jersey-number literals. Specialist-slot lookups for kickers/receivers go through `pickKicker` / `pickScrumHalf` / `pickFullback` in `src/engine/FieldPosition.ts` — these filter through `onFieldPlayers`, so sin-binned/injured players are never chosen.
- **Position is generic, not split.** Don't reintroduce Loosehead/Tighthead, Left/Right Lock, Blindside/Openside Flanker, Inside/Outside Centre, Left/Right Wing splits — the generic form is the data contract.
- **Player stats are authored, not transformed.** The `baseStats` in `src/data/team-*.json` are the play-ready values — no spawn-time transform. Source of truth is `docs/team-data.md`; regenerate JSONs with `node scripts/generateTeamJsons.mjs`.
- **Engine never imports from UI; UI communicates via `src/utils/eventBus.ts`.** Within a single tick, `engine:event` fires before `engine:stateChange`.

For full module internals (AITacticalDirector, AISubstitutionDirector, CardHandler, KickDecisionDirector, PenaltyHandler, phase handlers, home advantage, attack direction, position familiarity, tactics, maul, display snapshot / presenter pacing) see **`docs/match-engine.md`**.

## 5. Mutation Boundaries

**State mutation flows through one function. Don't sneak in a direct write.**

- All writes to `MatchState`, `player.matchStats`, `player.fatiguePct`, `player.currentStats`, and `player.rating` go through **`applyMatchEvent(state, event)`** in `src/engine/applyMatchEvent.ts`. No exceptions, including `state.events.push(...)`.
- **`applyMatchEvent` runs `assertInvariants(state)` after every event** (`src/engine/invariants.ts`). It throws if score/possession/phase/ball/clock or any player's `fatiguePct`/`rating`/`currentStats` strays outside its legal range. Adding a mutation that could push a value off the asserted range: extend the invariant check too.
- Phase handlers in `src/engine/events/` are **read-only** over state: they read, compute, build a `MatchEvent[]`, and return it on `PhaseResult.events`. `PhaseRouter.resolvePhase()` applies the queue.
- Use **domain-meaningful** event names (`TRY_SCORED`, `KNOCK_ON`, `CARRY_RESOLVED`). Narrow exception: structural setters (`BALL_REPOSITIONED` — optional `x`/`y`/`lateralDir`, `PHASE_CHANGED`, `POSSESSION_SWAPPED`). `ball.lateralDir` (lateral sweep direction) is a sign, not a coordinate — not range-checked by `assertInvariants`. See `docs/match-engine.md` § "Lateral / Y-axis model".
- Adding a new mutation kind: one variant in the `MatchEvent` union (`src/types/matchEvent.ts`) + one branch in `applyMatchEvent`. The `default: const _: never = event;` exhaustiveness check catches missing branches at compile time.
- Adding a new player stat: extend `PlayerMatchStats` + `zeroMatchStats()` (both in `src/types/player.ts`, co-located) + the domain event's apply branch — never push a raw `player.matchStats.X++` into a handler.
- `eventBus.emit` calls are **pure UI side effects** — they live in orchestrators alongside `applyMatchEvent` calls, not inside `applyMatchEvent` itself.
- Do not redundantly clone payloads inside `applyMatchEvent` — assign by reference where the orchestrator already allocated a fresh object.

**Season-scope mutations go through `applySeasonEvent(state, event)`** in `src/game/applySeasonEvent.ts`, operating on `GameState`. `GameCoordinator` and its season sub-coordinators (`TransferCoordinator`, `StaffCoordinator`, `BoardCoordinator`, `PlayoffCoordinator`, `InternationalBreakCoordinator`) plus the pure season helpers (`injuryEffects`, `moraleEffects`, `trainingRunner`) are the only callers — all share the one `GameState`. **`applySeasonEvent` runs `assertSeasonInvariants(state)` after every event.** Same `default: never` exhaustiveness contract. Full `SeasonEvent` variant list: **`docs/game-engine.md`** § "Mutation seam".

## 6. Randomness Boundary

**All randomness flows through `src/utils/rng.ts`. Never call `Math.random()` directly in engine code.**

Five isolated mulberry32 streams:
- `rng(min, max)` — outcome stream; every in-play roll. Reset by `setMatchSeed(seed)` (called from the `MatchCoordinator` constructor).
- `rngFormRaw()` — form stream; player form modifier at `initPlayer()`. Reset by `setMatchSeed`.
- `pickRandom(arr)` / `commentaryChance(pct)` — commentary stream; flavour-text sampling. Reset by `setMatchSeed`.
- `rngPosition(min, max)` — positioning stream; every lateral (Y-axis) draw — open-play sweep pass distances, kick launch angles, kick-off side bias (`src/engine/Lateral.ts`). Reset by `setMatchSeed`. Isolated so adding lateral ball movement cannot perturb an outcome roll.
- `rngTransfer(min, max)` / `rngTransferRaw()` — career stream; contract seeding, aging-curve noise, retirement rolls, persona generation, manager-chat morale boost (`boostPlayerMorale`). Reset by `setCareerSeed(seed)` — independent of the match seed so a per-fixture derivation cannot perturb season-scope outcomes. Note: `boostPlayerMorale` is user-triggered (inbox button), so the stream offset varies with how many chats the manager initiates; this is intentional (career outcomes subtly reflect manager decisions). The `careerRngOffset` is snapshot at save time so load/reload is fully deterministic.

Streams are independent — adding a commentary line cannot shift outcome rolls; adding a transfer event cannot shift a match. Pick the matching stream when adding a randomness consumer. Full details: **`docs/match-engine.md`** § "Determinism (Seeded RNG)".

## 7. Worktree & Branch Integrity

**Each session owns exactly one branch. Never let sessions bleed into each other.**

- **At session start, run `git branch --show-current` and confirm it matches the feature you were asked to work on.** If the branch is wrong, stop and tell the user before touching any files.
- **Never commit directly to `main` unless the user explicitly says "commit to main".**
- **Never merge, rebase, or cherry-pick across branches without explicit instruction.**
- **Before any `git push`, confirm the remote target branch matches the local branch.** `git push origin HEAD` is safe; `git push origin HEAD:main` is not without explicit sign-off.
- **Do not run `git fetch` / `git pull` mid-task unless the user asks.**
- **Never run `git checkout`, `git switch`, or `git worktree add` inside a session** — worktrees are set up by the user or by the harness before the session starts.
- **Treat an unexpected dirty working tree as a signal to pause.** Investigate (`git status`, `git log -5`) and report before making any further changes.
- **One coherent feature per commit; each commit must build clean.** `npm run build` and `npm run verify` must both pass.

Diagnostic: `git status && git log --oneline -5 && git branch -vv`.

## 8. 2D Pitch Animation Model

**All animation is purely visual — the DOM's resting state is always the final position.** Full detail in **`docs/DESIGN.md`** § 15.7.

**Coordinate space.** Engine `x`/`y` are 0–100: `x` is the long axis (try lines at x=0/100), `y` is lateral (touchlines at y=0/100). `pitchCoords.toTop/toLeft` is the single source — never copy the numbers. `clampX` (`[2,98]`) / `clampY` (`[3,97]`) keep dots on-pitch; only use `clampInGoalX` (`[-8,108]`) for in-goal actors (try scorer, conversion line).

**Three layers:**
- **Layer 1 — Ball (WAAPI, `PitchView.ts`)**: anchor-and-offset — commit the final position via `restAt()`, animate `transform` back to start and ease forward. Cancellation-safe: DOM is already at the final position.
- **Layer 2 — Individual dot (WAAPI, `PitchView.ts`)**: same pattern on the dot element. The carrier follower (`ballWalkFollower`) holds at the receive point then rides only the final carry leg; pick-and-go (`carrierFromStart`) rides the whole path.
- **Layer 3 — Formation (CSS `dot-transitioning`, `PitchPlayers.ts`)**: armed on every phase change except snap phases (`KickOff`, `HalfTime`, `FullTime`, which use `dot-snap-transition`).

**Key invariants — violating any of these breaks animation:**
- **`isCarrier` XOR `from`** on any dot — a dot in both is fought over by two animators simultaneously.
- **`keepX` flags** (`keepLineout`, `keepKickFormation`, `keepTmo`, `keepPhasePlay`, `keepTryScored`, `keepSubstitution`, `keepBoxKickAnnounce`) prevent dot fade on those phase transitions. Empty beats (no `placed` entries) hold automatically.
- **Authored choreography skips the follower** — `animateMovements` returns early on `skipFollower`; the per-dot choreography loop drives those actors instead.
- **`cachedEventPhase`** (not `display.phase`) keys the lineout ball-lateral override — `buildDisplaySnapshot` captures phase *after* the transition, so `display.phase` already reads the next phase on a lineout beat.
- **Try scorer anchors on the try line** (x=100/0), not `ballX` — tries are awarded with 5m leniency so `ballX` can rest short.
- **Kick-off chaser direction** comes from ball travel (`event.ballX >= 50 ? 1 : -1`), not `event.side` (which is the receiving team after possession flips).

---

## Documentation sync

**Every code change that touches a documented system must update the matching doc in the same commit. No exceptions — documentation drift is a bug.**

| Code changed | Doc(s) to update |
|---|---|
| `src/engine/` — new phase, resolver formula, event handler | `docs/match-engine.md` (relevant section + formula with real numbers) |
| `src/engine/balance/` — new constant or changed value | `docs/match-engine.md` (formula / table that references it) — the doc must carry the actual number, never "see `balance/X.ts`" |
| `src/types/matchEvent.ts` — new `MatchEvent` variant | `docs/match-engine.md` § "Mutation boundary" list |
| `src/game/` — new coordinator method, season flow change | `docs/game-engine.md` (relevant section) |
| `src/game/applySeasonEvent.ts` — new `SeasonEvent` variant | `docs/game-engine.md` § "Mutation seam" table + `docs/transfer-system.md` § "Mutation-boundary additions" |
| `src/ui/SaveManager.ts` — `SAVE_VERSION` bump | `docs/game-engine.md` version table + `docs/transfer-system.md` §7 table + `CLAUDE.md` § "Save schema" below + `ACCEPTED_VERSIONS` + a `MIGRATIONS[N]` step in `SaveManager.ts` + the pinned snapshot in `scripts/checkSaveSchema.ts` |
| `src/utils/eventBus.ts` / new `game:*` event | `docs/game-engine.md` § "UI events" table |
| `src/engine/MatchCoordinator.ts` / new `engine:*` event | `docs/match-engine.md` § "UI Event Bus Contract" table |
| `src/ui/HubScreen.ts` — TILES array | `docs/DESIGN.md` § 15.4 Hub tile list |
| New screen added to `src/ui/` | `docs/DESIGN.md` § 15.5 navigation flow |
| Any `src/ui/` screen changed — controls added/removed/renamed, layout restructured, new features surfaced | Review the matching topic in `src/ui/help/helpContent.ts` and update `purpose`, `features`, and `tips` in the same commit so the help overlay stays accurate. If the screen has no help topic yet, add one (`HelpTopicId` entry + button in the screen template). |
| `docs/team-data.md` changes | Run `node scripts/generateTeamJsons.mjs` |
| `src/ui/pitchChoreography.ts` / `PitchView.ts` / `PitchPlayers.ts` — new animation seam, new layout function, or changed choreography behaviour | `docs/DESIGN.md` § 15.7 (update the relevant seam description or between-beat state note) |

## Save schema

`SAVE_VERSION = 2`. The current version loads directly; a **lower, known** version is carried forward through the ordered `MIGRATIONS` pipeline in `SaveManager.ts` (`MIGRATIONS[1]` regenerates corrupt year-2+ fixture lists); a future/garbage version is rejected. Bump `SAVE_VERSION` whenever the serialised shape changes in a way that would corrupt an existing save on load — and in the **same commit** add the matching `MIGRATIONS[N]` step (vN→v(N+1)), update `ACCEPTED_VERSIONS`, update the pinned snapshot in `scripts/checkSaveSchema.ts`, and update `docs/game-engine.md` § "Save format" + `docs/transfer-system.md` §7. `npm run verify` runs `checkSaveSchema.ts`, which fails if the fresh-new-season `SavedSeason`/`SavedCareer` key set drifts without a bump. New additive-only optional fields do not require a bump (just update the snapshot) — e.g. `SavedSeason.board?: BoardState` and `SavedSeason.mediaStories?`.

**Backup & corruption resistance** (storage-layer, no `SAVE_VERSION` bump): each slot keeps a `.bak` copy rotated before every write; native additionally keeps a rolling disk history; autosave flushes on page-hide and uncaught errors. Full details: **`docs/game-engine.md`** § "Save format".

## Commands

```bash
npm run dev       # start Vite dev server (hot reload)
npm run build     # tsc type-check then Vite production build → dist/ (GitHub Pages base)
npm run build:cap # same build but with a relative base for the Capacitor native shell
npm run cap:sync  # build:cap then `cap sync ios` (copies dist/ into the iOS project)
npm run cap:ios   # cap:sync then `cap open ios` (opens the Xcode workspace — Mac only)
npm run preview   # serve the dist/ folder locally
npm run verify    # match determinism (scripts/checkDeterminism.ts) AND season determinism (scripts/checkSeasonDeterminism.ts) — both must pass
npm run telemetry # balance/realism report — 450 fixtures, markdown to stdout. Not part of `verify`; run on demand when tuning. CI regenerates `telemetry/latest.md` on every push to main; don't edit it by hand.
npm run probe     # headless-Chromium capture of 2D pitch animation — screenshots + dot traces → `harness/` (gitignored). Kill stale Vite first: `pkill -9 -f vite`. Traces carry jersey number only — no side/carrier flag; cross-reference `beats[].side` + `movements[]` to identify actors.
```

`npm run build` and `npm run verify` must both pass cleanly before every commit.

**Docs-only exception:** a commit that touches *only* Markdown / documentation (no `src/` changes) skips both `npm run build` and `npm run verify` — there is nothing to compile or re-baseline.

**Deploy (web):** push to `main`. GitHub Actions builds and deploys to GitHub Pages. The Vite base path is `/The-Rugby-Manager/` for the default `npm run build` — do not change that or asset URLs break in production. `vite.config.ts` switches `base` to `./` only under `--mode capacitor` (`npm run build:cap`); the GitHub Pages path is untouched.

**Native iOS (Capacitor).** The web app is wrapped via Capacitor (`capacitor.config.ts`, appId `com.patrickdoig.rugbymanager`). The `ios/` Xcode project is committed; a fresh clone must run `npm run cap:sync` before opening Xcode. Building / signing / archiving for the App Store requires a Mac with Xcode + CocoaPods. Asset paths must stay base-relative (use `import.meta.env.BASE_URL`, see `SoundManager.ts`) so they resolve under `capacitor://localhost`.

## Versioning

**After every committed update, bump `src/version.ts` and push to `main`.** Pattern `1.XXb` (e.g. `1.00b`, `1.01b`); increment the two-digit minor number by 1.

**Docs-only exception:** a commit that touches *only* Markdown / documentation (no `src/` changes) skips the version bump — the deployed app is unchanged, so the version must not move.

## Balance constants

**Every gameplay tuning number — probability, threshold, modifier, weight, fatigue multiplier, rating point value — lives in `src/engine/balance/`.** One file per concern, barrel re-export from `balance/index.ts`. Importers read from `'./balance'`. Do not introduce new tuning literals in resolvers, events, or systems.

Exempt: rugby pitch geometry (`FieldPosition.ts`), jersey-number position checks, and RNG shape values inside resolver formulas (e.g. `rng(1, 20)`).

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
