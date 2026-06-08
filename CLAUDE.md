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

**Coordinate space.** Engine `x`/`y` are 0–100. `x` is the long axis = the **field of play**, with **try lines at x=0 and x=100**; `y` is lateral, touchlines at y=0/100. `pitchCoords.toTop/toLeft` (the single source — never copy the numbers) map these to screen %, reserving the 0–8% / 92–100% screen margins as **in-goal**: `toTop` *extrapolates*, so **x>100 renders in the top in-goal, x<0 in the bottom** (behind-the-try-line placement, e.g. a conversion's defending line). `clampX` (`[2,98]`) / `clampY` (`[3,97]`) in `pitchChoreography.ts` keep dots on-pitch — a layout needing the in-goal uses **`clampInGoalX`** (`[-8,108]`) for those dots only (the try scorer; later the conversion defending line), never relaxing the global `clampX`, since every baked formation depends on `[2,98]`. The phase animator clamps drags to `[-6,106]` so in-goal frames can be authored.

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
- Lineout→Maul: ball travels from lineout mark to the hooker at the tail of the maul (dx=7.5)
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

**The carrier dot is the one Layer-2 actor driven through a seam, not a getter.** `PitchPlayers.ballWalkFollower.run(finalTop, finalLeft, frames, duration, easing)` commits the carrier dot's resting anchor just behind the ball's final position, then plays PitchView's bespoke `carrierFrames`: the dot **holds at the ball's penultimate position** (the receive point — the last `movements[]` entry before the carry leg) for the first `(n-1)/n` of the walk, then **runs only the final carry leg** onto the ball into contact. This is the middle ground between riding every pass (the carrier looks passed along the chain) and pre-placing at the finish (the ball arrives alone). It synchronises with the ball because the ball reaches that same penultimate position at `(n-1)/n` of its own walk. `clearMovement` calls `follower.cancel()`; the seam tracks `animatedEl` separately from `carrierEl` (the next beat reassigns `carrierEl` before `cancel()` runs) and sets `transition:none` while the WAAPI owns the dot, guarding against the Layer-3 `dot-transitioning` class tweening the committed anchor underneath. Earlier iterations made this a no-op (carrier faded in at its placed spot) after an attempt that rode the *whole* walk looked wrong — the hold-then-final-leg form is the resolution. **Exception: a direct pick-up** (pick-and-go — the carrier picks at the ruck, no pass to it) sets `GameEvent.carrierFromStart`, and the follower instead rides the carrier along the *whole* ball path (staying −fwd·2.5 behind it through every leg). Hold-then-final-leg fails there: the penultimate point sits only the (short) carry distance behind the ball, so the carrier barely moves and the ball looks like it arrives at a stationary player. Carry handlers also emit the lateral sweep **before** `CARRY_RESOLVED` (pick-and-go included, after a fix) so the forward carry is always the final movements leg. It is **phase-agnostic** — `animateMovements` fires for any beat with `movements.length >= 2`, so the only requirement for a carry phase to get the ride is that its `choreograph` layout flags a dot `isCarrier` and the phase emits a multi-leg `movements` path. Coverage: **open play / pick-and-go** (`openPlayLayout`), **first phase** (`firstPhaseBacklineLayout`), **kick return** (`openPlayLayout` + its 1-hop sweep), and **penalty tap-and-go** (`PenaltyHandler` hand-builds a `[tap-mark, final]` `movements` path since it runs outside `PhaseRouter`). **A dot is `isCarrier` XOR `from`, never both** — `PitchPlayers.applyBeat` makes an `isCarrier` dot the `carrierEl` (ball-walk follower) *and* pushes any dot with a `from` to `chaseDots` (chase seam); a dot in both is fought over by two animators. So when a full-formation carry places all 30 via `placeFormation` (penalty `tap_and_go`), flag the real carrier (`event.primaryPlayer`, picked at runtime) `isCarrier` **and clear its `from`** — the other 29 keep theirs and chase-shuffle while the follower rides the carrier onto the ball. The **maul** is the exception: it drives as a *bound unit*, not via the per-carrier follower — the whole pack glides forward to the post-drive cluster (Layer-3 `dot-transitioning`) with the ball sliding to the hooker at the tail, so `maulLayout` flags **no** `isCarrier` and the Maul branch in `PitchView` sits *ahead* of the `movements` branch (a won drive must not reach `animateMovements`, which would peel the hooker off the pack).

**The dominant tackler rides in sync with the carrier.** On a `dominant_carry` / `dominant_tackle` outcome, `openPlayLayout` flags the pinned tackler dot `isDominantTackler` and gives it a `from` at the defensive line. `PitchPlayers` surfaces it as `domTacklerEl` / `domTacklerFrom` and **keeps it out of `chaseDots`** (so the generic chase seam doesn't fight PitchView for it); `animateMovements` then drives it via a second follower channel, `follower.runTackler`, on a path that mirrors the carrier's (held at the receive point, then `fwd·1.3` *ahead* of the carrier into contact) so the collision lands on the same frame as the carry. **Both follower channels (`run` + `runTackler`) are skipped when the beat carries authored `choreography`** (`animateMovements` early-returns on `skipFollower`) — the per-dot choreography loop in `PitchView`'s `engine:event` handler drives those actors instead, so the carrier/tackler are never double-animated.

**A first-phase kick decision animates the kicker stepping into the kick.** When the first phase resolves to a kick *with no authored choreography*, `PitchView.animateKickDecision` holds the ball at the launch spot for the first half of the beat then lobs it to the landing, and runs the fly-half dot from its previous resting spot (read off the dot's `data-prev-top/left`, falling back to behind the landing) to the kick origin — so the kicker steps into the kick rather than getting the generic carry ride. **When a `kick_decision` choreography IS registered**, the ball routes through `animateMovements` instead (honouring the authored `t` offsets) so it stays in sync with the choreographed dots — `animateKickDecision`'s fixed 0/0.5/1 pacing must not own the ball on an authored timeline.

### Layer 3 — Formation-wide transition (CSS, `PitchPlayers.ts`)

When an entire pack needs to glide from one formation to another (Lineout→Maul), `PitchPlayers` adds `dot-transitioning` to the `#pitch-2d-field` element. This enables `transition: top 0.5s ease, left 0.5s ease` on every `.pitch-dot` simultaneously. The class is removed via `setTimeout(..., 600)` once the transition completes. Dots are already at their new positions — the CSS transition is triggered by the position change. The same glide fires on **FirstPhase→Breakdown**: the set-piece pack is held at its scrum/lineout positions through the whole first phase (`keepLineout`), and the breakdown beat is the first to reposition the forwards (into the authored ruck formation), so they ease there from wherever the set piece left them rather than snapping. Because CSS animates from each dot's actual current position, the blend is correct for either predecessor (scrum or lineout) without any per-predecessor forward data. It also fires on **kick→KickReturn** (`keepKickFormation`): the predecessor kick formation is held and the return's involved actors glide onto the ball from where the kick left them (see "Dot persistence across phases").

### Between-beat state

- **`prevBallX / prevBallY`** (module-level in `PitchPlayers`) — the previous beat's ball position, passed to `choreograph` so `firstPhaseBacklineLayout` can place the #9 at its set-piece ending position (the sweep's feed origin). The rest of the backline anchors on the engine's `movements[]` hops, not on #9. Updated at the end of every `applyBeat`.

**FirstPhase ball never invents its own path.** The set-piece first phase animates the engine's own `GameEvent.movements[]` (via `animateMovements`) exactly like open play — the movements already encode the pass-by-pass lateral sweep AND the carrier's forward drive, and end at the authoritative ball position, so the ball follows the same steps the match engine took and never teleports when the next phase reconciles. **The backline dots are placed on the engine's real sweep too:** `movements[]` index 0 is the set-piece feed, the last entry is the carrier's post-carry position, and every entry between is one backline pass landing (a receiver's lateral position). `firstPhaseBacklineLayout` maps the narration pass chain (#10, then each pass's receiver) onto those receive hops, so each back sits where the ball actually went — only a small per-back *depth* stagger (deeper as play goes wider) is synthesised for the diagonal read; the lateral `y` is engine-driven. A first phase with no sweep (knock-on / interception / penalty) has no `movements`, so it falls back to the generic `openPlayLayout`. **First-phase backline hops 2+ draw from `FIRST_PHASE_PASS_DISTANCE_M`** (5%/70%/25% short/mid/long, avg ~10m per hop) rather than the open-play `PASS_DISTANCE_M` (70%/25%/5%, avg ~5m) — so backs should be visibly more spread across the field off set pieces than in a breakdown sweep. The scrum-half's first hop uses `SCRUM_HALF_PASS_M` (10–20m) regardless. This is intentional; don't try to tighten the first-phase dots by adjusting `PASS_DISTANCE_M` — that constant governs open play, kick return, and penalty tap-and-go.

**FirstPhase authored choreography (`FIRST_PHASE_CHOREOGRAPHIES`).** When a Phase Animator JSON is registered for a play type (e.g. crash ball, out the back), `applyChoreography()` in `FirstPhaseEvent.ts` replaces the procedural `emitSweepHops` ball path with the authored keyframes and emits per-back `choreography[]` entries consumed by `PitchView.animateMovements`. **Forwards (slots 1–8) are always skipped** — they stay in the predecessor set-piece formation via `keepLineout`, and injecting JSON coordinates for them would fight the hold and put them at wrong positions. The entire authored move is anchored to the live ball position via a `dx`/`dy` offset (`state.ball.x − authoredAnchorX`), so the animation is always locked to wherever the set piece actually took place, not the canvas origin it was authored at. Lateral mirroring (`flipY`) and long-axis flip (`flipX`) are applied independently; when `flipX !== flipY` the engine swaps laterally-paired jersey numbers (`11↔14`, `1↔3`, `6↔7`) so a right-touchline sweep works correctly on the left touchline. The choreography is in `src/engine/balance/firstPhaseChoreography.ts` (`FIRST_PHASE_CHOREOGRAPHIES`); adding a new play requires exporting a JSON from the Phase Animator, parsing it via `parseChoreography()`, and registering it under the key `"prevPhase:outcomeKey"` (e.g. `"SCRUM:crash_ball"`). See `docs/match-engine.md` § FirstPhase and `docs/phase-animator.md` § 9.

**Authored Timelines and WAAPI Pacing (`t`).** Phase Animator exports contain explicit timestamp offsets (`t` between 0.0 and 1.0) for each keyframe. To keep actors visually synchronised (e.g., the ball carrier catching the ball exactly on time), the engine pipes the `t` value through `BALL_REPOSITIONED` events into `GameEvent.movements`. `PitchView.ts` then explicitly applies `t` as the `offset` property in its WAAPI keyframes for both the ball and the explicitly-pathed carrier (`explicitCarrierPath`). If `offset` is omitted, WAAPI evenly paces the keyframes by default (`1/N` steps), which permanently desynchronises the procedurally-paced ball from any dot running on an authored timeline.

**Dynamic Truncation of Authored Timelines.** When slicing Phase Animator JSONs for early match engine events (knock-on, tackle), **never use a strict initial distance check** (e.g., `d <= 1.0` alone). Human-authored keyframes may drift, and the ball might never perfectly enter that tight radius, causing the algorithm to silently fail and default to `truncateT = 0` (destroying the animation) or `1.0` (playing to the end). Instead, first scan the timeline to find the **absolute minimum distance** the ball ever reaches to the player, then scan again to break at the **first moment** the ball enters that `minDist + 0.5` tolerance. This handles imprecise authoring and prevents floating-point drift from pulling the truncation point to the very end of a player's carry. Furthermore, when matching the engine's target player to the JSON slot, **always filter by attacking/defending side strings**, to avoid accidentally measuring the distance to a similarly-numbered defender.

**Try Y-Coordinate Alignment.** When a `FIRST_PHASE` try is scored via an authored JSON, the ball's final Y-coordinate is dictated entirely by the final JSON keyframe. Do not let the procedural engine append a naive `BALL_REPOSITIONED` using `tryLandingY(state)`, because `state.ball.y` still holds the pre-phase (e.g., set-piece) center coordinate. This will cause the ball to snap back to the center right before the conversion. Instead, extract the final Y-coordinate directly from the truncated `authoredBallEvents` and update the try's final `BALL_REPOSITIONED` event and narration key inline before returning.

**Kick-off chaser direction comes from the ball, not the side.** At a kick-off beat `event.side` is the *receiving* team (possession has flipped to the receiver), so the chaser's run direction is taken from the ball's actual travel (`chaseDir = event.ballX >= 50 ? 1 : -1`), never from `event.side`'s attack direction.

**Kick choreography places the kicker at the origin and the on-ball player at the landing — never a default fly-half.** A traveling kick (tactical incl. 50:22, box, drop-out, plus the conversion spot) flies from the kicker to the landing, so `travelingKickLayout` puts the **kicker** (the primary actor; drop-outs name the receiver as primary, so they swap) back at the kick origin (`prevBall`) and the **on-ball** player (the secondary receiver/chaser, or the kicker on a retained/goal kick) just behind the landing — each via `sideOf(player)` so a possession-swap kick still draws the right teams. Don't reintroduce the old "draw `event.side`'s `SLOT.FLY_HALF` at `event.ballX`" shortcut: it showed #10 at the wrong end on every kick. **A kick to touch is special** (`kickFindsTouch` — the to-touch narration keys): the engine resolves the ball to the lineout mark ~5m infield, so `travelingKickLayout` places **only the kicker** (no on-ball receiver — nobody catches a ball that goes out) and `PitchView` lobs the ball *just past the nearer touchline* (`toLeft` extrapolates beyond `y=0`/`100`) so it visibly goes OUT; the lineout then forms at the mark on the next beat. **Kick-offs are special:** they span coin-toss → announce → outcome beats with *no phase change between*, so persisted dots accumulate. `kickOffLayout` therefore (a) derives the kicker's team so it stays the *same* team across all those beats — possession side on pre-kick/retained beats, the opposite side once possession swaps to the receiver — instead of flipping and drawing both teams' #10; and (b) draws the full formation on **both the announce beat (static, at the START positions) and the actual kick beat (END positions + the chase)** — never on the coin-toss beat, whose ball still sits at halfway — so the pack appears *before* the ball is kicked and the chase starts continuously from there. The **full 15-v-15 kick-off formation** is authored in the phase animator (`KICKOFF_RECV` / `KICKOFF_KICK`, keyed by slot, each carrying a `from`/`to`): the kicker on the centre spot, both XVs in the authored shape, and the **real catcher (`primaryPlayer`) snapped to the real landing**. The authored frame (ball toward low x) is transformed onto each kick — the long axis flips to the real `kickDir` (`50 − (x−50)·kickDir`), where **`kickDir` is derived from team orientation (not the landing) so it is identical on the announce and kick beats**; there is **no lateral mirror** (the landing side isn't known on the announce beat, and mirroring would break announce↔kick continuity) — so it holds for either kicking side and after half-time. Each slot carries a `from` (kick-off line) and `to` (post-chase) position: the dot rests at `to` and **animates the chase from `from`** via the formation-chase seam below, so the pack surges forward and the catcher runs onto the ball as it's in the air. Re-author in the animator (`docs/phase-animator.md`) and paste new values into the two constants to retune.

**A lineout sits the ball ON the nearer touchline** (the throw-in point), not the engine's lineout mark ~5m infield. `PitchView`'s `stateChange` handler overrides the ball's lateral to the touchline (`toLeft(display.ballY < 50 ? 0 : 100)`) on a Lineout *beat* — keyed on **`cachedEventPhase`** (the beat's own `event.phase`, cached in `engine:event`), **not** `display.phase`: `buildDisplaySnapshot` captures `state.phase` *after* the phase transition, so on a lineout beat `display.phase` already reads the next phase (FirstPhase/Maul). `lineoutLayout` puts the throwing hooker just **off the pitch** (`y = −2`/`102`; `toLeft` extrapolates past the touchline). Keeping the ball on the touchline removes the small in-field slide that used to happen when the lineout formed after a kick to touch, and makes the throw-in the first leg of the next phase's ball walk.

**Formation chase (`Placed.from`).** A general seam for animating many dots at once: `choreograph` tags a dot with `from` (a start position in game coords); `PitchPlayers.applyBeat` commits the dot's resting top/left to its `(x,y)` and records `{ el, fromX, fromY, toX, toY }` on `players.chaseDots`; `PitchView` then runs the same anchor-and-offset WAAPI as the ball/scrum-half dots (offset back to `from`, ease to rest) for every chase dot, synced to the beat duration. This replaced the old single-`isChaser` kick-off chaser. It's phase-agnostic — any layout can tag dots with `from` to drive a formation move.

**Wiring an exported phase-animator JSON into the game** — the **kick-off is the worked precedent** (`kickOffLayout` + `KICKOFF_RECV`/`KICKOFF_KICK` + the `tx()` transform in `pitchChoreography.ts`). Bake the authored coords as a slot→spot table (`{from,to}` if it moves), then **parameterise — never hard-code the absolute coords**: flip the long axis to the real direction from team orientation, mirror the lateral per touchline side, and keep the engine-driven bits (real ball landing `event.ballX/ballY`, the on-ball actor `event.primaryPlayer`/`secondaryPlayer`, which side acts) **dynamic** — snap the actual actor to the real spot, place the rest from the table. Animate via: **Ball-relative formation seam (`placeFormation` + `Formation`).** For a full-30 frame the kick-off's bespoke `tx()` is overkill — `placeFormation` is the reusable seam. A `Formation` is `{ nearTop, atk, def, atkFrom?, defFrom? }` where `atk`/`def` are slot→`[dx, dy]` *resting* offsets from the ball, baked in one canonical frame: **attacking team drives toward +x (top), ball near the `nearTop` touchline**. The optional `atkFrom`/`defFrom` tables give a per-slot *start* offset (same `dir`/`mirrorY` transform), so `placeFormation` also drives the chase seam: a dot with a from-entry rests at its `atk`/`def` spot and `PitchView` animates it from the from-spot (kick-moment → settle) via `chaseDots`. Omit them for a static frame; include only the slots that move. At play-time `placeFormation` anchors the table on a passed `(anchorX, anchorY)`, sets `dir` from the *attacking* team's real orientation (`atkSide === possSide ? attacksTop : !attacksTop` — flips when the outcome swapped possession, e.g. a caught box kick or a cleanout penalty), and mirrors `dy` when the live ball is on the opposite touchline (`nearTop !== (anchorY >= 50)`). The attacking side is `sideOf(event.primaryPlayer)`, so the table's `atk`/`def` map to whichever team `primaryPlayer` belongs to: on `clean_ball` / `slow_ball` / `penalty_defending` that's the attacking supporter, but on `turnover` / `not_rolling_away_penalty` / `offside_at_ruck_penalty` the `primaryPlayer` is the **defender** (jackal / penalised defender), so those tables are baked with `atk`/`def` swapped relative to the authored attacking side (i.e., `atk` has positive X offsets, already inverting them to face the correct goal). Because the flip is baked in, do not flip `dir` for these defensive breakdown formations, or they will double-flip and visually render on the wrong side of the ball for a single beat. `nearTop` is the authored-frame fact `authoredBallY >= 50` (NOT a guess) — it drives the `dy` mirror; getting it inverted reflects every dot onto the wrong touchline. Coverage: **box-kick announce** (anchor = `event.ball`) + its five outcome frames (`attack_retain`, `box_kick_to_touch`, `defend_catch`, `defend_catch_contested`, `defend_knock_on` — anchor = the kick origin `prevBall`, since the ball has already flown to the landing), and **all seven breakdown outcomes** `clean_ball` / `slow_ball` / `turnover` / `dangerous_cleanout_penalty` / `not_rolling_away_penalty` / `offside_at_ruck_penalty` / `penalty_defending` (anchor = the live ruck `event.ball`). Four box-kick outcomes (`attack_retain` / `defend_catch` / `defend_catch_contested` / `defend_knock_on`) and the **penalty formations** carry `from`-tables and chase; `box_kick_to_touch` and `tap_and_kick_dead` are static (ball goes out). Penalty anchors: `kick_to_touch` (+`_long`, shared) / `kick_to_touch_close` → the kick origin `prevBall`; `tap_and_go` (a carry — see the carrier note above) → the tap mark `movements[0]`; `tap_and_kick_dead` → the mark, plus its key is in `KICK_TO_TOUCH_KEYS` so PitchView lobs the ball out and the dedicated branch must run *before* the generic `kickFindsTouch` one. Re-bake the offset tables from a fresh export (a small parse script over the JSON) to retune.

**Ball-relative chase seam (`dropOutLayout`).** A traveling kick that is *not* at halfway can't use the kick-off's centre-anchored `tx()` (`50 − (p−50)·kickDir`), and a *two-beat* full-30 chase whose beats anchor on different real points (kick origin vs landing) doesn't fit a single `placeFormation` call (which now does single-anchor chases via `atkFrom`/`defFrom`, but not the two-anchor / per-beat-orientation case). The **22m drop-out** is the worked precedent for the hybrid: ball-relative offset tables (slot→`{from,to}`, baked relative to the authored ball at the matching position) animated via `Placed.from`. Authored across two beats — **announce** (anchor = the kicker's own 22 = `event.ball`; offsets relative to the authored kick origin) and **clean_receive** (anchor = the landing = `event.ball`; offsets relative to the authored landing). The kicking team is held to one consistent side across both beats (`isReceive ? !possSide : possSide`, since clean_receive swaps possession to the receiver). `flip` maps the authored frame (kicker attacking −x) onto the real kicker orientation, **x-axis only — no lateral mirror** (the landing side isn't known at announce), matching the kick-off. The on-ball actor (`event.primaryPlayer` — kicker on announce, catcher on clean_receive) snaps to the real ball; everyone else rests at `to` and chases from `from`. Other drop-out outcomes (`knock_on`, `poor_kick`) have no authored frame and fall back to `travelingKickLayout`.

### Dot persistence across phases

`persistedKeys` (a `Set<string>` in `PitchPlayers`) accumulates dot keys within the current phase. On phase change, any key in `persistedKeys` that is absent from the new beat's `placed` array has `.visible` removed. **The hold pattern** — to keep the predecessor formation through a phase instead of fade-and-redraw, gate the fade on a `keepX` flag (so `persistedKeys` carries forward) and enable `dot-transitioning` only if the involved movers should glide to new spots (omit it to freeze). Six cases use it: `keepLineout` skips clearing `persistedKeys` when transitioning from Lineout or Scrum into FirstPhase — the formation stays visible through the whole first phase and fades when FirstPhase itself ends. `keepKickFormation` does the same on a kick → KickReturn transition (`currentPhase` ∈ {KickOff, BoxKick, TacticalKick, DropOut22}): the predecessor kick formation is kept on screen and `dot-transitioning` is enabled, so the return is **seeded from the predecessor** — the involved actors (`openPlayLayout`: catcher-as-carrier + tacklers) glide from their kick positions to their return spots while the rest hold where the kick left them. CSS animates from each dot's live position, so the one path covers every kick predecessor without per-predecessor data (a fuller return would author target positions so the held dots also drift to support/chase spots). `keepTmo` holds the predecessor formation **frozen** through a TMO review (`event.phase === TmoReview`): the review beats are announcement-only (choreograph returns `[]`), so without it every dot would fade — instead they stay exactly in place and fade/reposition normally when the review resolves (try / penalty / scrum). Unlike `keepKickFormation` it does **not** enable `dot-transitioning` (nothing repositions during the hold). `keepPhasePlay` (`event.phase === PhasePlay`) holds the predecessor formation (usually the breakdown's full 30) on entry and enables `dot-transitioning` **every phase-play beat** (not just the transition), so only the involved actors `openPlayLayout` repositions glide to their ball-relative spots while the other ~27 hold their predecessor positions; the carrier still rides the ball via the follower (its `transition:none` guard stops the glide fighting it). The held dots lag a long unbroken carry, but each breakdown re-forms all 30, so staleness resets every ruck. `keepTryScored` (`event.phase === TryScored`) does the same on a try: it holds the predecessor (the scoring carry) and enables `dot-transitioning` so only the involved actors `openPlayLayout` places (the scorer + nearby defender) glide to the line while every other player stays where the carry left them. The scorer **tracks the grounded ball into the in-goal**: the display snapshot pushes the try ball `fwd*4` past the line, so the scorer is placed `fwd*2.5` past it via the wider `clampInGoalX` (the standard `clampX` [2,98] would strand them at the line while the ball renders in-goal). The try beat has no `movements`, so the scorer just glides — no follower ride. Finally, an **empty beat holds** (the fade is gated on `nextKeys.size > 0`): a pure-announcement beat — injury, fatigue, card, set-piece award — returns `[]` from choreograph, and rather than clearing the pitch the formation stays exactly as it was while the line is read, then the next real layout beat redraws. **Injury/fatigue/substitution glow:** on those announcement beats `glowsForBeat(event)` returns one-or-more `{ key, cls }` pairs and `applyBeat` adds the box-shadow class to each named dot (`event.side` is the player's own team, so the key derives directly). A plain injury / fatigue beat glows the one player — `glow-injury` (red) / `glow-fatigue` (amber); a **substitution** beat (`event.phase === Substitution`, both `primaryPlayer` = the incomer and `secondaryPlayer` = the outgoing) glows **both** — `glow-injury` on the player going off and `glow-substitution` on the one coming on. The fatigued/incoming player is still on the field (in the held formation); the injured/outgoing player was removed at the tackle, so their dot has faded — it's re-shown (`reshown`) at its last on-field position (the incident spot) for the announcement, then hidden again on the next beat by the cleanup at the top of `applyBeat`.

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
| Wiring an exported animation JSON into the game (recipe + kick-off precedent) | **`docs/phase-animator.md`** § 9 + CLAUDE.md § 8 |

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
| `docs/team-data.md` changes | Run `node scripts/generateTeamJsons.mjs` |
| `src/ui/pitchChoreography.ts` / `PitchView.ts` / `PitchPlayers.ts` — new animation seam, new layout function, or changed choreography behaviour | `CLAUDE.md § 8` (update the relevant seam description or between-beat state note) |

## Save schema

`SAVE_VERSION = 1`. The current version loads directly; a **lower, known** version is carried forward through the ordered `MIGRATIONS` pipeline in `SaveManager.ts` (empty at v1); a future/garbage version is rejected. Bump `SAVE_VERSION` whenever the serialised shape changes in a way that would corrupt an existing save on load — and in the **same commit** add the matching `MIGRATIONS[N]` step (vN→v(N+1)), update `ACCEPTED_VERSIONS`, update the pinned snapshot in `scripts/checkSaveSchema.ts`, and update `docs/game-engine.md` § "Save format" + `docs/transfer-system.md` §7. `npm run verify` runs `checkSaveSchema.ts`, which fails if the fresh-new-season `SavedSeason`/`SavedCareer` key set drifts without a bump. New additive-only optional fields do not require a bump (just update the snapshot) — e.g. `SavedSeason.board?: BoardState` and `SavedSeason.mediaStories?`.

**Backup & corruption resistance (storage-layer, no `SAVE_VERSION` bump).** Each slot keeps a last-known-good `rugby-manager-save-{id}-bak` copy in localStorage; `saveToSlot` rotates the current primary into it **before** overwriting, and `loadSlot`/`slotInfo` fall back to it when the primary won't parse. On native, `saveBackup.ts` mirrors the `.bak` to disk and keeps a capped, time-throttled rolling history (`saves/slot-{id}/{savedAt}.json`, 8 generations ≥20 min apart); `reconcileBackups` repairs a corrupt local primary from the disk `.bak` then the newest parseable generation, and the Saves screen's "Restore backup" surfaces `listBackups`/`restoreBackup`. Autosave (`saveGame` → boolean) is silent on success; `main.ts`'s `autosave()` helper emits a debounced `save:failed` warning on a failed write, and a `visibilitychange`/`pagehide` flush + global `error`/`unhandledrejection` net persist the live game on backgrounding / uncaught errors.

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
npm run probe     # headless-Chromium capture of the 2D pitch animation (scripts/pitchProbeDriver.mjs + pitch-probe.html + scripts/pitchProbe.ts). Mounts the REAL PitchView against a REAL match, screenshots set-piece / first-phase / kick-off beats mid-animation, and dumps a frame-by-frame ball/dot trace → `harness/` (gitignored). Reuses a running `npm run dev`, else spawns its own Vite. Use to sense-check ball/dot motion you can't see from static code. Browser = @sparticuz/chromium + puppeteer-core (registry-hosted; the Playwright CDN is blocked in cloud sandboxes). **Trace gotcha:** each sampled dot carries only its jersey number (`n`) — no side flag, no `isCarrier` flag — and both teams share numbers, so a trace shows two `#12`s etc. To identify the attacking carrier, cross-reference against `beats[].side` + the `movements[]` path (the carrier ends at the last `movements` entry); don't assume the dot nearest the ball is the carrier (it's often the passer or a defender). When in doubt, prefer the screenshots or a direct Node-level `choreograph` call over inferring identity from the trace. **Kill stale Vite before trusting a run:** the probe reuses *any* dev server already answering on its port, so after editing `src/` you MUST `pkill -9 -f vite` (kill ALL vite — not just the `--port 5179` one) *before* re-running, else it silently serves the OLD bundle and you debug a phantom (the tell-tale is identical, pre-fix numbers across consecutive runs). Run the kill as its **own** step — chaining it with `; pkill …` in the same command can exit non-zero and skip the rest.
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
