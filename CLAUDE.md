# CLAUDE.md

Architectural invariants and ways of working for this repo. Lean by design. Read in full at session start. Deep-dive docs:

| Topic | Doc |
|---|---|
| Match-engine internals — phases, resolvers, RNG, tactics, cards, maul, commentary, UI event-bus | **`docs/match-engine.md`** |
| Season/career engine — GameCoordinator, season state, fixtures, AI sims, standings, save format | **`docs/game-engine.md`** |
| Transfer system — all 10 phases, market windows, signings, renewals, poaching, supply | **`docs/transfer-system.md`** |
| Media manager — generated inbox stories, phrase bank, personas, determinism | **`docs/media-manager.md`** |
| Visual design + navigation flow + screen architecture | **`docs/DESIGN.md`** |
| League Cup | **`docs/league-cup.md`** |
| Fixture schedule | **`docs/prem-fixtures-2025-26.md`** |
| Team data | **`docs/team-data.md`** |

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
- Use constructor DI for classes whose methods share the same deps (`PenaltyHandler`, `CardHandler`, `ClockController`). Use module-level functions for pure helpers (`FieldPosition`, `PhaseRouter`).
- Extract a shared utility the moment a second module needs it, not before.
- Refactor incrementally — one cohesive split per commit; each commit must build clean and preserve behaviour.
- A module-boundary change is an engine change — update the matching engine doc in the same commit (`docs/match-engine.md` for `src/engine/` work, `docs/game-engine.md` for `src/game/` work).

**Key architectural rules:**

- **Navigation goes through `screenRouter.show(id)`** (`src/ui/ScreenRouter.ts`). Screen modules never poke `document.getElementById('…').style.display` directly; they accept `onForward`/`onBack` callbacks from `main.ts`. Full navigation flow and Hub tile list: **`docs/DESIGN.md`** § 15.
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

**Season-scope mutations go through `applySeasonEvent(state, event)`** in `src/game/applySeasonEvent.ts`, operating on `GameState`. `GameCoordinator` is the only caller. **`applySeasonEvent` runs `assertSeasonInvariants(state)` after every event.** Same `default: never` exhaustiveness contract. Full `SeasonEvent` variant list: **`docs/game-engine.md`** § "Mutation seam".

## 6. Randomness Boundary

**All randomness flows through `src/utils/rng.ts`. Never call `Math.random()` directly in engine code.**

Five isolated mulberry32 streams:
- `rng(min, max)` — outcome stream; every in-play roll. Reset by `setMatchSeed(seed)` (called from the `MatchCoordinator` constructor).
- `rngForm()` — form stream; player form modifier at `initPlayer()`. Reset by `setMatchSeed`.
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

**All animation is purely visual — the DOM's resting state is always the final position.**

The pitch view (`src/ui/PitchView.ts`, `PitchPlayers.ts`, `pitchChoreography.ts`) uses three animation layers. Understanding the separation is essential before touching any of them.

### Layer 1 — Ball (WAAPI, `PitchView.ts`)

The ball's CSS `top`/`left` is committed to its **final** resting position immediately (via `restAt()`). A WAAPI animation on `transform` then offsets it visually back to the start and eases forward. This is the "anchor-and-offset" pattern:

```
restAt(finalTop, finalLeft)             // DOM is now at the final position
ball.animate([
  { transform: offsetTransform(startTop, startLeft, finalTop, finalLeft, w, h) },
  { transform: 'translate(-50%, -50%)' },  // final keyframe = resting state
], { duration, easing })
```

`offsetTransform` produces `translate(calc(-50% + Δpx), calc(-50% + Δpx))` — converting a percentage-coordinate difference into pixel deltas against the pitch's client size. The final keyframe `translate(-50%, -50%)` is the plain centred state, matching the committed anchor exactly.

**Why this matters:** if the animation is cancelled mid-flight, the DOM is already correct. The `stateChange` handler guards on `movementAnimating` and skips repositioning the ball while WAAPI owns it; the animation's `onfinish` clears the flag.

Ball animation forms:
- `animateKickArc` — straight-line travel with a `scale(1.5)` apex at offset 0.5 (reads as ball in the air)
- `animateMovements` — multi-leg carry: `GameEvent.movements[]` gives the path; one WAAPI keyframe per leg
- `runAnim` — the underlying primitive both use; commits the anchor, creates the animation, wires `onfinish`
- Lineout→Maul: ball travels from lineout mark to the hooker at the tail of the maul (dx=14)
- Lineout→FirstPhase: 2-leg path — lineout mark → #9's stored position → first-phase ball position (uses `lineoutSHTop/Left` cached on the previous lineout beat)

### Layer 2 — Individual dot animation (WAAPI, `PitchView.ts`)

When a single known dot needs its own animation (kickoff chaser, scrum halves), the same anchor-and-offset pattern applies to the dot element directly:

```
el.style.top  = `${finalTop}%`;    // choreograph already did this via applyBeat
el.style.left = `${finalLeft}%`;
el.animate([
  { transform: offsetTransform(startTop, startLeft, finalTop, finalLeft, w, h) },
  { transform: 'translate(-50%, -50%)' },
], { duration, easing });
```

The pipeline to get the element:
1. `choreograph` places the dot at its **final** position and sets a flag on the `Placed` record (`isChaser`, `scrumHalfRole: 'atk' | 'def'`)
2. `PitchPlayers.applyBeat` detects the flag and stores the element reference in a tracked variable
3. `PitchView` reads it via a getter (`players.chaserEl`, `players.atkScrumHalfEl`, `players.defScrumHalfEl`) immediately after calling `applyBeat`, and runs the WAAPI

PitchView computes the **start** position from first principles (event data + `attacksTop`) — it does not read the element's current CSS, which would be the final position.

**The carrier dot is the one Layer-2 actor driven through a seam, not a getter.** `PitchPlayers.ballWalkFollower.run(finalTop, finalLeft, frames, duration, easing)` commits the carrier dot's resting anchor just behind the ball's final position, then plays PitchView's bespoke `carrierFrames`: the dot **holds at the ball's penultimate position** (the receive point — the last `movements[]` entry before the carry leg) for the first `(n-1)/n` of the walk, then **runs only the final carry leg** onto the ball into contact. This is the middle ground between riding every pass (the carrier looks passed along the chain) and pre-placing at the finish (the ball arrives alone). It synchronises with the ball because the ball reaches that same penultimate position at `(n-1)/n` of its own walk. `clearMovement` calls `follower.cancel()`; the seam tracks `animatedEl` separately from `carrierEl` (the next beat reassigns `carrierEl` before `cancel()` runs) and sets `transition:none` while the WAAPI owns the dot, guarding against the Layer-3 `dot-transitioning` class tweening the committed anchor underneath. Earlier iterations made this a no-op (carrier faded in at its placed spot) after an attempt that rode the *whole* walk looked wrong — the hold-then-final-leg form is the resolution. It is **phase-agnostic** — `animateMovements` fires for any beat with `movements.length >= 2`, so the only requirement for a carry phase to get the ride is that its `choreograph` layout flags a dot `isCarrier` and the phase emits a multi-leg `movements` path. Coverage: **open play / pick-and-go** (`openPlayLayout`), **first phase** (`firstPhaseBacklineLayout`), **kick return** (`openPlayLayout` + its 1-hop sweep), and **penalty tap-and-go** (`PenaltyHandler` hand-builds a `[tap-mark, final]` `movements` path since it runs outside `PhaseRouter`). The **maul** is the exception: it drives as a *bound unit*, not via the per-carrier follower — the whole pack glides forward to the post-drive cluster (Layer-3 `dot-transitioning`) with the ball sliding to the hooker at the tail, so `maulLayout` flags **no** `isCarrier` and the Maul branch in `PitchView` sits *ahead* of the `movements` branch (a won drive must not reach `animateMovements`, which would peel the hooker off the pack).

### Layer 3 — Formation-wide transition (CSS, `PitchPlayers.ts`)

When an entire pack needs to glide from one formation to another (Lineout→Maul), `PitchPlayers` adds `dot-transitioning` to the `#pitch-2d-field` element. This enables `transition: top 0.5s ease, left 0.5s ease` on every `.pitch-dot` simultaneously. The class is removed via `setTimeout(..., 600)` once the transition completes. Dots are already at their new positions — the CSS transition is triggered by the position change.

### Between-beat state

- **`prevBallX / prevBallY`** (module-level in `PitchPlayers`) — the previous beat's ball position, passed to `choreograph` so `firstPhaseBacklineLayout` can place the #9 at its set-piece ending position (the sweep's feed origin). The rest of the backline anchors on the engine's `movements[]` hops, not on #9. Updated at the end of every `applyBeat`.

**FirstPhase ball never invents its own path.** The set-piece first phase animates the engine's own `GameEvent.movements[]` (via `animateMovements`) exactly like open play — the movements already encode the pass-by-pass lateral sweep AND the carrier's forward drive, and end at the authoritative ball position, so the ball follows the same steps the match engine took and never teleports when the next phase reconciles. **The backline dots are placed on the engine's real sweep too:** `movements[]` index 0 is the set-piece feed, the last entry is the carrier's post-carry position, and every entry between is one backline pass landing (a receiver's lateral position). `firstPhaseBacklineLayout` maps the narration pass chain (#10, then each pass's receiver) onto those receive hops, so each back sits where the ball actually went — only a small per-back *depth* stagger (deeper as play goes wider) is synthesised for the diagonal read; the lateral `y` is engine-driven. A first phase with no sweep (knock-on / interception / penalty) has no `movements`, so it falls back to the generic `openPlayLayout`.

**Kick-off chaser direction comes from the ball, not the side.** At a kick-off beat `event.side` is the *receiving* team (possession has flipped to the receiver), so the chaser's run direction is taken from the ball's actual travel (`chaseDir = event.ballX >= 50 ? 1 : -1`), never from `event.side`'s attack direction.

**Kick choreography places the kicker at the origin and the on-ball player at the landing — never a default fly-half.** A traveling kick (tactical incl. 50:22, box, drop-out, plus the conversion spot) flies from the kicker to the landing, so `travelingKickLayout` puts the **kicker** (the primary actor; drop-outs name the receiver as primary, so they swap) back at the kick origin (`prevBall`) and the **on-ball** player (the secondary receiver/chaser, or the kicker on a retained/goal kick) just behind the landing — each via `sideOf(player)` so a possession-swap kick still draws the right teams. Don't reintroduce the old "draw `event.side`'s `SLOT.FLY_HALF` at `event.ballX`" shortcut: it showed #10 at the wrong end on every kick. **Kick-offs are special:** they span coin-toss → announce → outcome beats with *no phase change between*, so persisted dots accumulate. `kickOffLayout` therefore (a) derives the kicker's team so it stays the *same* team across all those beats — possession side on pre-kick/retained beats, the opposite side once possession swaps to the receiver — instead of flipping and drawing both teams' #10; and (b) draws content *only* on the actual outcome beat, never on the pre-kick beats whose ball still sits at halfway (which would strand spare dots on the centre spot). On the kick beat it lays out the **full 15-v-15 kick-off formation** authored in the phase animator (`KICKOFF_RECV` / `KICKOFF_KICK`, keyed by slot): the kicker on the centre spot, both XVs in the authored shape, and the **real catcher (`primaryPlayer`) snapped to the real landing**. The authored frame (ball toward low x, landing on the high-y touchline) is transformed onto each kick — the long axis flips to the real `kickDir` (`50 − (x−50)·kickDir`) and the lateral mirrors when the ball lands on the low-y side — so it holds for either kicking side and after half-time. This is *static* (no chase motion yet); animating the chase is a separate, deferred pass. Re-author in the animator (`docs/phase-animator.md`) and paste new values into the two constants to retune.

### Dot persistence across phases

`persistedKeys` (a `Set<string>` in `PitchPlayers`) accumulates dot keys within the current phase. On phase change, any key in `persistedKeys` that is absent from the new beat's `placed` array has `.visible` removed. Exception: `keepLineout` skips clearing `persistedKeys` when transitioning from Lineout or Scrum into FirstPhase — the formation stays visible through the whole first phase and fades when FirstPhase itself ends.

---

## Where to look

| Topic | Source of truth |
|---|---|
| Match-engine internals — phases, resolvers, formulas, RNG, tactics, commentary, UI event-bus contract | **`docs/match-engine.md`** |
| Season/career engine — GameCoordinator, season state, fixtures, headless AI sims, league standings, save format | **`docs/game-engine.md`** |
| Transfer system — market windows, signings, renewals, poaching, generated supply | **`docs/transfer-system.md`** |
| Media manager — generated inbox stories (`src/game/media/`), phrase bank, personas, determinism | **`docs/media-manager.md`** |
| Visual design + navigation flow + screen architecture + Hub tile list | **`docs/DESIGN.md`** |
| 2025/26 League fixture list | **`docs/prem-fixtures-2025-26.md`** ↔ `src/data/fixtures-2025-26.ts` |
| League Cup | **`docs/league-cup.md`** ↔ `src/game/cupScheduler.ts` |
| Architectural invariants & ways of working | this file |
| Team data (squad tables, baseStats, star players) | **`docs/team-data.md`** → `node scripts/generateTeamJsons.mjs` syncs JSONs |
| Phase Animator dev tool (keyframe authoring of 2D-pitch animations) | **`docs/phase-animator.md`** ↔ `public/tools/phase-animator.html` (regen samples: `npm run export:phases`) |

## Documentation sync

**Every code change that touches a documented system must update the matching doc in the same commit. No exceptions — documentation drift is a bug.**

| Code changed | Doc(s) to update |
|---|---|
| `src/engine/` — new phase, resolver formula, event handler | `docs/match-engine.md` (relevant section + formula with real numbers) |
| `src/engine/balance/` — new constant or changed value | `docs/match-engine.md` (formula / table that references it) — the doc must carry the actual number, never "see `balance/X.ts`" |
| `src/types/matchEvent.ts` — new `MatchEvent` variant | `docs/match-engine.md` § "Mutation boundary" list |
| `src/game/` — new coordinator method, season flow change | `docs/game-engine.md` (relevant section) |
| `src/game/applySeasonEvent.ts` — new `SeasonEvent` variant | `docs/game-engine.md` § "Mutation seam" table + `docs/transfer-system.md` § "Mutation-boundary additions" |
| `src/ui/SaveManager.ts` — `SAVE_VERSION` bump | `docs/game-engine.md` version table + `docs/transfer-system.md` §7 table + `CLAUDE.md` § "Save schema" below + `ACCEPTED_VERSIONS` in `SaveManager.ts` |
| `src/utils/eventBus.ts` / new `game:*` event | `docs/game-engine.md` § "UI events" table |
| `src/engine/MatchCoordinator.ts` / new `engine:*` event | `docs/match-engine.md` § "UI Event Bus Contract" table |
| `src/ui/HubScreen.ts` — TILES array | `docs/DESIGN.md` § 15.4 Hub tile list |
| New screen added to `src/ui/` | `docs/DESIGN.md` § 15.5 navigation flow |
| `docs/team-data.md` changes | Run `node scripts/generateTeamJsons.mjs` |

## Save schema

`SAVE_VERSION = 1`. Only v1 saves accepted. Bump whenever the serialised shape changes in a way that would corrupt an existing save on load. Update `ACCEPTED_VERSIONS` in `SaveManager.ts` + `docs/game-engine.md` § "Save format" + `docs/transfer-system.md` §7 + `CLAUDE.md` § "Save schema". New additive-only optional fields do not require a bump — e.g. `SavedSeason.board?: BoardState` (board confidence, restored verbatim or re-seeded on legacy saves) and `SavedSeason.mediaStories?`.

## Commands

```bash
npm run dev       # start Vite dev server (hot reload)
npm run build     # tsc type-check then Vite production build → dist/ (GitHub Pages base)
npm run build:cap # same build but with a relative base for the Capacitor native shell
npm run cap:sync  # build:cap then `cap sync ios` (copies dist/ into the iOS project)
npm run cap:ios   # cap:sync then `cap open ios` (opens the Xcode workspace — Mac only)
npm run preview   # serve the dist/ folder locally
npm run verify    # match determinism (scripts/checkDeterminism.ts) AND season determinism (scripts/checkSeasonDeterminism.ts) — both must pass
npm run telemetry # balance + realism report (scripts/telemetry.ts) — 90-fixture league pass × 5 root seeds (450 fixtures), markdown to stdout. Not part of `verify`; run on demand when tuning. Also runs in CI on every push to main via `.github/workflows/telemetry.yml`. **Don't edit `telemetry/latest.md` by hand — it's regenerated by the workflow.**
npm run probe     # headless-Chromium capture of the 2D pitch animation (scripts/pitchProbeDriver.mjs + pitch-probe.html + scripts/pitchProbe.ts). Mounts the REAL PitchView against a REAL match, screenshots set-piece / first-phase / kick-off beats mid-animation, and dumps a frame-by-frame ball/dot trace → `harness/` (gitignored). Reuses a running `npm run dev`, else spawns its own Vite. Use to sense-check ball/dot motion you can't see from static code. Browser = @sparticuz/chromium + puppeteer-core (registry-hosted; the Playwright CDN is blocked in cloud sandboxes). **Trace gotcha:** each sampled dot carries only its jersey number (`n`) — no side flag, no `isCarrier` flag — and both teams share numbers, so a trace shows two `#12`s etc. To identify the attacking carrier, cross-reference against `beats[].side` + the `movements[]` path (the carrier ends at the last `movements` entry); don't assume the dot nearest the ball is the carrier (it's often the passer or a defender). When in doubt, prefer the screenshots or a direct Node-level `choreograph` call over inferring identity from the trace. If a probe run looks stale, kill the reused Vite (`--port 5179`) and re-run — it reuses a running dev server.
```

`npm run build` and `npm run verify` must both pass cleanly before every commit.

**Deploy (web):** push to `main`. GitHub Actions builds and deploys to GitHub Pages. The Vite base path is `/The-Rugby-Manager/` for the default `npm run build` — do not change that or asset URLs break in production. `vite.config.ts` switches `base` to `./` only under `--mode capacitor` (`npm run build:cap`); the GitHub Pages path is untouched.

**Native iOS (Capacitor).** The web app is wrapped via Capacitor (`capacitor.config.ts`, appId `com.patrickdoig.rugbymanager`). The `ios/` Xcode project is committed; a fresh clone must run `npm run cap:sync` before opening Xcode. Building / signing / archiving for the App Store requires a Mac with Xcode + CocoaPods. Asset paths must stay base-relative (use `import.meta.env.BASE_URL`, see `SoundManager.ts`) so they resolve under `capacitor://localhost`.

## Versioning

**After every committed update, bump `src/version.ts` and push to `main`.** Pattern `1.XXb` (e.g. `1.00b`, `1.01b`); increment the two-digit minor number by 1.

## Balance constants

**Every gameplay tuning number — probability, threshold, modifier, weight, fatigue multiplier, rating point value — lives in `src/engine/balance/`.** One file per concern, barrel re-export from `balance/index.ts`. Importers read from `'./balance'`. Do not introduce new tuning literals in resolvers, events, or systems.

Exempt: rugby pitch geometry (`FieldPosition.ts`), jersey-number position checks, and RNG shape values inside resolver formulas (e.g. `rng(1, 20)`).

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
