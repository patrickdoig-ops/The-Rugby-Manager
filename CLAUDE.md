# CLAUDE.md

Architectural invariants and ways of working for this repo. Lean by design. Read in full at session start. For engine internals see **`docs/match-engine.md`**; for visual design see **`docs/DESIGN.md`**.

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

**Restructuring a live type doesn't restructure its snapshots.** A frozen log row, an event-bus payload, or a replay event has schema lifetime independent of the live state it was copied from. `GameEvent.ballX/ballY`, `PenaltyContext.*`, and `MatchEvent` payload fields stay scalar even when their source moved into `state.ball`/`state.clock`. The test: would renaming break replay, an existing log entry, or a downstream consumer that already serialised the old shape? If yes, leave it alone.

**Namespacing is not decoupling.** `state.phase.breakdownMod` has identical coupling properties to `state.breakdownMod`. Before drafting a "decouple" refactor, name the specific coupling smell and verify the proposed shape actually removes it.

## 4. Module Boundaries

**Split before god objects form. Don't wrap clean primitives.**

- Split a file when it accumulates multiple unrelated responsibilities. Name each piece by what it does (Coordinator, Controller, Router, Handler). Don't wait for thousands of lines.
- Push back on abstractions that wrap already-clean primitives. Don't wrap a typed state object in a "store"; don't wrap a typed pub/sub singleton in a "dispatcher".
- Prefer pure functions over methods when state can be passed directly. `FieldPosition` helpers take `state: MatchState` as an argument; they are not closures threaded through a deps interface.
- Use constructor DI for classes whose methods share the same deps (`PenaltyHandler`, `ClockController`). Use module-level functions for pure helpers (`FieldPosition`, `PhaseRouter`).
- Extract a shared utility the moment a second module needs it, not before.
- Refactor incrementally. One cohesive split per commit; each commit must build clean and preserve behaviour.
- A module-boundary change is an engine change — update the matching engine doc in the same commit (`docs/match-engine.md` for `src/engine/` work, `docs/game-engine.md` for `src/game/` work).
- **Navigation goes through `screenRouter.show(id)`** (`src/ui/ScreenRouter.ts`). Screen modules never poke `document.getElementById('…').style.display` directly; they accept `onForward`/`onBack` callbacks from `main.ts`. Adding a screen: (1) add the id to the `SCREENS` map in `ScreenRouter.ts`, (2) add a `<div id="…">` to `index.html`, (3) add a flat navigation handler in `main.ts`.
- **In-season screens (`HubScreen`, `FixtureListScreen`, `LeagueTableScreen`, `RoundResultsScreen`) are initialised once per page lifetime, not per game and not per navigation.** `initInSeasonScreens()` in `main.ts` is gated by an `inSeasonInited` closure flag, so the second call (e.g. New Game → Home → Continue) is a no-op. This is load-bearing: each screen registers `eventBus.on('game:*')` subscriptions at init time without an unsub, so without the gate every back/forward (or game switch) would duplicate handlers and leak. Subsequent visits use bare `screenRouter.show(id)`. Each screen reads through `opts.gameEngine.getState()` on every render, so the underlying engine reference can be swapped (New Game ↔ Continue) without re-initialising the screens. **Hub is the top of the in-season stack** — no back arrow; the Settings cog is the exit route to Home. Fixture-list and league-table back-buttons both return to Hub.
- **Dual-mode in-season screens (post-match Continue flow).** `RoundResultsScreen` and `LeagueTableScreen` each expose a module-level setter — `showRoundResults(round, onContinue)`, `showLeagueTablePostMatch(onContinue)` — that the navigation handler calls *before* `screenRouter.show(id)`. The setter updates closure state and invokes a stored `renderImpl` so the forward "Continue → next" CTA is visible immediately, replacing the back arrow. The hub-entry path doesn't call the setter and gets the back-arrow render. Mode is cleared on the forward click. New dual-mode screens should follow the same pattern; don't reach for a global store and don't re-init the screen.
- **`MatchCoordinator` owns its event-bus subscriptions and must be destroyed.** Constructor captures unsubs in `busUnsubs[]`; `destroy()` runs them, cancels the tick timer, and clears the run flag. `main.ts` calls `engine.destroy()` after the match-result overlay is dismissed. The **`silent: true`** constructor option (used by `src/game/simulateFixture.ts` for headless AI fixtures inside `recordPlayerMatchResult`) suppresses every `engine:*` emit except `engine:finished`, skips the constructor's UI-event subscriptions, and short-circuits `PenaltyHandler` modal prompts to `high_ball` / `kick_for_goal` defaults. `ClockController` and `FatigueAccumulator` take the same flag — every engine orchestrator that emits to the bus must gate on it.
- **`AITacticalDirector` is a pure, RNG-free module owned by `MatchCoordinator`** (`src/engine/AITacticalDirector.ts`). Called once per tick from `tick()` *before* `resolvePhase()` so the new tactics affect the same tick that triggered them. Constructor takes `humanSide: TeamSide | undefined`; in a live match `MatchCoordinator` passes the player's side (the director never touches it), in silent fixtures it passes `undefined` (both teams adapt). All tactic changes flow through `TACTICS_UPDATED` via `applyMatchEvent` — same mutation boundary as the in-match tactics modal. Tuning constants live in `src/engine/balance/aiDirector.ts`.

## 5. Mutation Boundaries

**State mutation flows through one function. Don't sneak in a direct write.**

- All writes to `MatchState`, `player.matchStats`, `player.fatiguePct`, `player.currentStats`, and `player.rating` go through `applyMatchEvent(state, event)` in `src/engine/applyMatchEvent.ts`. No exceptions, including `state.events.push(...)`.
- **`applyMatchEvent` runs `assertInvariants(state)` after every event** (`src/engine/invariants.ts`). It throws if score/possession/phase/ball/clock or any player's `fatiguePct`/`rating`/`currentStats` strays outside its legal range. Always-on, not env-gated — cost is O(matchday squad) per mutation, negligible against the per-tick work already done. Adding a new mutation kind that touches one of these fields: extend the invariant check too if it could push a value off the asserted range.
- Phase handlers in `src/engine/events/` are read-only over state: they read, compute, build a `MatchEvent[]`, and return it on `PhaseResult.events`. `PhaseRouter.resolvePhase()` applies the queue then composes the outgoing `GameEvent`.
- Orchestrators (`MatchCoordinator`, `ClockController`, `PenaltyHandler`) call `applyMatchEvent` directly for non-phase mutations (clock, half-time, penalty choices, substitutions, tactics, fatigue, commentary log).
- Use **domain-meaningful** event names (`TRY_SCORED`, `KNOCK_ON`, `CARRY_RESOLVED`, `LINEOUT_RESOLVED`) — not primitive setters. Narrow exception: structural setters (`BALL_REPOSITIONED`, `PHASE_CHANGED`, `BREAKDOWN_MOD_SET`, `POSSESSION_SWAPPED`, `POSSESSION_SET`) where the domain has no single name.
- **`state.phase` is the sole source of truth for the current phase.** All transitions go through `PHASE_CHANGED` via `applyMatchEvent`; there is no separate state-machine class. The valid-transition table in `docs/match-engine.md` is documentary, not enforced at runtime.
- **`PhaseContext` is the minimal closure passed to handlers** — `{ state, attackTeam, defendTeam, randomPlayer, pickPlayer, draftEvent, kickOffStrategy }`. Field-position helpers (`attackDir`, `inOwn22`, `isTryScoredAt`, …) are pure functions in `src/engine/FieldPosition.ts` and take `state` as an argument — handlers import them directly rather than threading them through the context.
- Adding a new mutation kind: one variant in the `MatchEvent` union (`src/types/matchEvent.ts`), one branch in `applyMatchEvent`. The exhaustive `default: const _: never = event;` catches missing branches at compile time.
- Adding a new player stat: extend `PlayerMatchStats` + `zeroMatchStats()` (both in `src/types/player.ts`, co-located) + the relevant domain event's apply branch — never push a raw `player.matchStats.X++` into a handler.
- `eventBus.emit` calls are **pure UI side effects** and are NOT part of the mutation boundary. They live in orchestrators alongside `applyMatchEvent` calls, not inside `applyMatchEvent` itself.
- Derived state (`computeRating`, `computeFatigue`) lives in pure helpers; writes still flow through dedicated `MatchEvent` variants (`RATINGS_RECALCULATED`, `FATIGUE_APPLIED`).
- **Pre-match jersey assignment vs in-game substitution are different operations.** Pre-match (`PreMatchScreen.assignStartingJersey`) reassigns `squadNumber` AND `id` by slot — starting XV wears 1–15, bench wears 16–23. In-game substitution (`SUBSTITUTION_APPLIED`) reassigns ONLY `id`/`position`/`x`/`y`; the substituting player keeps their bench `squadNumber`. Both flows assume `squadNumber` is unique across `team.players ∪ team.bench`.
- **Season-scope mutations have their own boundary: `applySeasonEvent(state, event)`** in `src/game/applySeasonEvent.ts`, operating on `GameState` (`src/types/gameState.ts`). `GameCoordinator` is the only caller. `SeasonEvent` variants are domain-meaningful (`SEASON_INITIALIZED`, `FIXTURE_RESULT_RECORDED`, `WEEK_ADVANCED`, `PLAYER_TACTICS_SET`, `PLAYER_MATCHDAY_SQUAD_SET`) and the same `default: const _: never = event;` exhaustiveness contract applies. Adding training/transfers/youth-academy systems later means adding new variants — not new mutation seams.
- **Persisted pre-match choices (`state.player.tactics`, `state.player.matchdaySquad`) are saved on Kick Off, not after the match.** `main.ts`'s pre-match `onStart` callback calls `gameEngine.setPlayerTactics(...)` + `gameEngine.setPlayerMatchdaySquad(extractMatchdaySquad(playerTeam))` + `saveGame(...)` before navigating to the match, so even if the player closes the tab mid-match their chosen line-up carries forward. `PreMatchScreen` reads these on init and falls back to `DEFAULT_TACTICS` / the raw team JSON order when undefined; the screen never mutates the engine, only the `onStart` callback does. Squad reconciliation is handled by `applyMatchdaySquad` (`src/game/playerSquad.ts`) which returns the team unchanged if the saved snapshot references a player no longer rostered.
- **`GameCoordinator.recordPlayerMatchResult` is idempotent per round.** The match-result screen's async Continue handler kicks off the player's result + four headless AI sims + `WEEK_ADVANCED`; the button itself shows a spinner state but the engine is the actual safety net. The re-entry guard at the top of the function returns early when the player's fixture for the round is already in `state.league.results`. **Any new mutations added to this function must go AFTER the guard** — the player-result-recorded-first ordering is the signal the guard relies on.

## 6. Randomness Boundary

**All randomness flows through `src/utils/rng.ts`. Never call `Math.random()` directly in engine code.**

Three isolated mulberry32 streams seeded from `state.engine.seed`:
- `rng(min, max)` — outcome stream; every in-play roll.
- `rngForm()` — form stream; player form modifier at `initPlayer()`.
- `pickRandom(arr)` / `commentaryChance(pct)` — commentary stream; flavour-text sampling.

Streams are independent — adding a commentary line cannot shift outcome rolls. Pick the matching stream when adding a randomness consumer. Seed is set once in the `MatchCoordinator` constructor via `setMatchSeed(seed)` **before** `initMatchState()` runs. A match with a given seed is fully reproducible. Full breakdown in `docs/match-engine.md` "Determinism (Seeded RNG)".

---

## Where to look

| Topic | Source of truth |
|---|---|
| Match-engine internals — phases, resolvers, formulas, RNG, tactics effects, commentary, UI event-bus contract | **`docs/match-engine.md`** |
| Game-engine internals — `GameCoordinator`, season state, fixtures, headless AI sims, league standings, save format | **`docs/game-engine.md`** |
| 2025/26 Premiership fixture list — authoritative schedule, breaks, broadcast notes | **`docs/prem-fixtures-2025-26.md`** ↔ `src/data/fixtures-2025-26.ts` |
| Visual design — colours, fonts, spacing, components, live-match shell HTML, screen notes | **`docs/DESIGN.md`** |
| Architectural invariants & ways of working | this file |

When code changes, update the corresponding doc in the same commit.

## Commands

```bash
npm run dev       # start Vite dev server (hot reload)
npm run build     # tsc type-check then Vite production build → dist/
npm run preview   # serve the dist/ folder locally
npm run verify    # match determinism (scripts/checkDeterminism.ts) AND season determinism (scripts/checkSeasonDeterminism.ts) — both must pass
npm run telemetry # balance tuning report (scripts/telemetry.ts) — 90-fixture league pass, markdown to stdout. Not part of `verify`; run on demand when tuning. Also runs in CI on every push to main via `.github/workflows/telemetry.yml`, which commits the output to `telemetry/latest.md`. **Don't edit `telemetry/latest.md` by hand — it's regenerated by the workflow.**
```

No tests or linters. TypeScript strict mode is the primary correctness check. Both `npm run build` and `npm run verify` must pass cleanly before every commit.

**Deploy:** push to `main`. GitHub Actions builds and deploys to GitHub Pages. The Vite base path is `/Rugby-Simulator-/` — do not change it or asset URLs break in production.

## Versioning

**After every committed update, bump `src/version.ts` and push to `main`.** Pattern `1.XXa` (e.g. `1.40a`); increment by 1. The version renders on the Home Screen.

## Balance constants

**Every gameplay tuning number — probability, threshold, modifier, weight, fatigue multiplier, rating point value — lives in `src/engine/balance/`.** One file per concern (kicking, openPlay, breakdown, scrum, lineout, fatigue, rating, tactics, clock, commentary), barrel re-export from `balance/index.ts`. Importers read from `'./balance'` and don't need to know which sub-file holds which constant. Do not introduce new tuning literals in resolvers, events, or systems. Exempt: rugby pitch geometry (`FieldPosition.ts`), jersey-number position checks, and RNG shape values inside resolver formulas (e.g. `rng(1, 20)`).

## Architecture

**Engine ↔ UI contract.** The engine never imports from UI; UI never calls engine methods directly **except** `SimController` (Play/Pause/Speed). All communication goes through the typed pub/sub singleton at `src/utils/eventBus.ts`. Within a single tick, `engine:event` is emitted **before** `engine:stateChange` — UI state caches from the prior tick are always valid by the time an event arrives. Engine event table and subscribers: `docs/match-engine.md` § "UI Event Bus Contract". UI subscriptions registered at startup are permanent; one-shots are explicitly unsub'd (e.g. `CommentaryFeed`'s team-colour cache).

**Game engine ↔ UI contract.** Analogous, season-scope. `GameCoordinator` (`src/game/`) emits three `game:*` events on the same bus: `game:initialized` (after `newSeason` / `fromSave`), `game:fixtureRecorded` (once per result — the player's match plus every headless AI fixture of that round), and `game:weekAdvanced` (after the round completes and the calendar steps forward). Hub, FixtureList, LeagueTable, and RoundResults subscribe to these and re-render reactively. Headless AI fixtures inside `recordPlayerMatchResult` run silent `MatchCoordinator` instances, so they emit no `engine:*` UI noise — but they still emit `game:fixtureRecorded` so the league table updates live.

**`state.engine.humanSide` is the canonical source for which side the manager picked.** Set once in `initMatchState` from `MatchCoordinator`'s `humanSide` opt; never mutated. UI surfaces that order team-specific data "player first" — `StatsPanel`'s live player rows and detailed table, `MatchResultScreen`'s ratings cards, `PreMatchScreen`'s versus header and tabs — read it from state rather than threading the side through closures or props. Silent fixtures default it to `'home'`; the UI never sees those.

**PreMatchScreen leads with the player's team visually** — left versus slot + first/active tab — regardless of home/away. Engine identity (home team is still home) is preserved; only the on-screen order changes. The screen takes `gameEngine` and reads `league.results` + `league.standings` at render time for its form pins, H2H, league-position and odds tiles. No `game:*` subscriptions — it's a one-shot per match. Derivation helpers live in `src/game/teamStats.ts` (`recentForm`, `headToHead`, `matchSpread`); the screen consumes them as pure functions.

**Home advantage is engine-level, not display-only.** `HOME_ADVANTAGE` (`src/engine/balance/homeAdvantage.ts`) is consumed in two places: the carry resolvers (`OpenPlay`/`FirstPhase`/`KickReturn`) and `BreakdownEvent`, via the `homeEdge(state, mod)` helper that splits a flat `mod` into `{ attack, defend }` based on `state.possession`. The pre-match SPREAD tile re-exports the same `HOME_ADVANTAGE.spreadPts` through `src/game/teamStats.ts` so the prediction and the simulation share one constant — moving the dial in balance shifts both. Calibration target is ~57% home win-rate, validated via `npm run telemetry` (which now reports a Home Advantage section).

**Navigation flow.** Home → Team Selector → Hub → PreMatch → Match → Result → Round Results → League Table → Hub. The Hub (`src/ui/HubScreen.ts`) is the in-season control centre: six tiles route to Fixtures (`fixture-list`), League (`league-table`), and four placeholder destinations (Squad / Training / Contracts / Transfers — no-op handlers until those screens exist), plus a Settings cog and a "Go to next match" CTA. The post-match chain walks the manager through Round Results (`RoundResultsScreen` — every fixture of the just-completed round, player's match highlighted) then League Table (in a forward "Continue → Hub" mode set via `showLeagueTablePostMatch(onContinue)`) before landing on Hub. PreMatch back and the in-season sub-screen back-buttons all return to Hub. Settings has two entry points with different back targets — `goSettingsFromHome` (back → Home) and `goSettingsFromHub` (back → Hub) in `main.ts`.

**Commentary is data, not text.** The engine populates `NarrationDescriptor` on every `GameEvent`; `CommentaryFeed.ts` calls `renderNarration(event)` to produce strings. CommentaryFeed is initialised once at startup and listens permanently; **silencing during a headless AI fixture is the engine's job, not the UI's** — set `silent: true` on the `MatchCoordinator` (see Section 4).

**Attack direction.** Home attacks toward x=100 in the first half, toward x=0 in the second. Teams swap ends only at half-time, never on turnovers. All `ball.x` reasoning must go through the pure helpers in `src/engine/FieldPosition.ts` — they factor in `state.clock.halfTimeDone`. Snapshot DTOs (`GameEvent`, `PenaltyContext`, `MatchEvent` payloads) keep flat `ballX`/`ballY` scalars; see Section 3.

**Tactics.** Five dimensions in `TeamTactics` (`src/types/team.ts`). The managed team can change all five mid-match via the tactics modal. The AI side opens each match on its team's authored `suggestedTactics` (from `src/data/team-*.json`, surfaced on `RawTeamInput.suggestedTactics`) — *not* `DEFAULT_TACTICS`, which is now only the fallback when no authored value exists. Mid-match the AI is adapted by `AITacticalDirector` (see Section 4): inside the final 15 minutes a score gap of ≥ 8 flips it into `AI_INTENT_CHASING` (trailing) or `AI_INTENT_PROTECTING` (leading); otherwise it sits on the baseline. The director never proposes tactics for the human side. Kick-off strategy is per-kick (not a standing tactic) — managed team picks via modal, AI defaults to `high_ball`. Effects, probability tables, and tactic-note triggers: `docs/match-engine.md` "Tactics: who picks what" + "Carry Phases" + "Tactical Commentary".

**Design system.** `docs/DESIGN.md` is the single source of truth for every colour, font, spacing, and component pattern. CSS custom properties in `style/main.css` `:root` — no hardcoded hex except primary CTA green (`#007a2a` / `#009434` active / `#006622` pressed) and team identity colours injected inline from team JSON.

**Team data.** `src/data/team-*.json` — all 10 Gallagher Premiership clubs (Bath, Bristol, Exeter, Gloucester, Harlequins, Leicester, Newcastle, Northampton, Sale, Saracens). The JSON shape is typed as `RawTeamInput` in `src/types/teamData.ts` (deliberately neutral — both the match engine and the game engine import it from there; nothing engine-internal owns the data contract). Each file has `players` (15 starters, id 1-15), `bench` (8 matchday subs, id 16-23), and `squad` (the rest of the senior roster, id 24+). Each player carries `firstName`, `lastName`, `dob` (nullable ISO), `nationality`, `position` (generic — `Prop`, `Hooker`, `Lock`, `Flanker`, `Number 8`, `Back Row`, `Scrum-Half`, `Fly-Half`, `Centre`, `Wing`, `Fullback`, `Utility Back` — see `Position` in `src/types/player.ts`), and 12 `baseStats` on a 1–100 scale. `MatchCoordinator.initPlayer` copies `baseStats` to `currentStats` at match start; `StaminaSystem.computeFatigue` drives `currentStats` over the match via `FATIGUE_APPLIED`. `baseStats` is never modified **in-match** (but see the spawn pipeline below). Player full names are unique league-wide — `CommentaryFeed`'s colourisation pass relies on this. **Source of truth is `docs/team-data.md`** — to regenerate the JSONs deterministically after editing team-data.md, run `node scripts/generateTeamJsons.mjs`.

**Position is generic, not split.** The engine never branches on `player.position` for match logic — scrum/lineout/breakdown/first-phase/fatigue/rating-bonuses all key off `player.id` (jersey 1-15). `position` is read only by `PLAYER_OVERALL_WEIGHTS` / `IRRELEVANT_STATS` lookups, UI display, and the substitution position-copy. Don't reintroduce Loosehead/Tighthead, Left/Right Lock, Blindside/Openside Flanker, Inside/Outside Centre, Left/Right Wing splits — the generic form is the data contract.

**Spawn-time stat pipeline.** `applyStarBoost(team)` in `src/team/applyStarBoost.ts` runs once at app start (single ingest point: `src/main.ts:59-62`, before `teamProfile.init()` or any `RawTeamInput` consumer). The determinism harnesses (`scripts/checkDeterminism.ts`, `scripts/checkSeasonDeterminism.ts`) and `scripts/telemetry.ts` apply the same boost so the verification chain sees the same league the player does. Three deterministic, RNG-free passes per team, in order:

1. **Tier calibration** (`applyTierCalibration`). Each non-star, non-irrelevant baseStat gets an additive shift from `TIER_CALIBRATION` (`src/engine/balance/rating.ts`): starting XV `+10`, bench `+3`, wider `squad` `-5`. Stars get `shift = 0`. Irrelevant stats — `IRRELEVANT_STATS[position]` (forwards' kicking, backs' setPiece) — are clamped to `STAR_BOOST.irrelevantStatMax` (15). Per-stat ceilings (`LEAGUE_STAT_CEILINGS`, currently `pace: 95`) and per-player overrides (`PLAYER_STAT_OVERRIDES` — e.g. Arundell 99, Slade 85) bound the shift via `statCap()`.
2. **Per-star boost** (`boostStar`). For each entry in `team.stars[]`, match by full name and floor `indexHigh` stats to `indexHighMin` (95) or `topIndexHighMin` (97 when `suggestedRating ≥ topThreshold` of 90), floor others to `otherStatMin` (78), then iterate the highest-position-weighted non-capped stat by +1 until OVR ≥ `suggestedRating + targetOffset` (3). Stars supersede tier calibration because every star floor is above any non-star tier value.
3. **Per-player overrides** (`applyPlayerOverrides`). `PLAYER_STAT_OVERRIDES` applied verbatim across `players` + `bench` + `squad`. Final word — can exceed `LEAGUE_STAT_CEILINGS` (the Arundell-99 lever).

Adding a new star, league-wide stat cap, or per-player exception is a one-line edit to the relevant constant in `balance/rating.ts` plus (for stars) an entry in `docs/team-data.md` and a regenerate. The on-disk JSONs are never mutated — the boost transforms an in-memory copy at startup. Per-stat caps from steps 1 and 3 are honoured by the boost iteration in step 2 too, so a star with a pace override of 85 has those weight points redistributed to other stats by the iteration loop rather than being clobbered at the end.

**Known limitation:** stars with low `suggestedRating` (≤ 87) can overshoot their target OVR by 1-5 points because the floor pass alone produces an OVR above target and the iteration loop only lifts up. Affects ~9 stars today (Ludlow, Dombrandt, Reffell, etc.) — documented; not a regression. Adding a "scale down to target" step would fix it but the deviation is small enough to defer.

**Season schedule.** `src/data/fixtures-2025-26.ts` exports `PREMIERSHIP_2025_26: SeasonSchedule` — the canonical 90-fixture list for the 2025/26 Premiership (5 fixtures × 18 rounds, full double round-robin). Each `Fixture` carries its real ISO `date`. `GameCoordinator.newSeason()` and `fromSave()` default to this schedule; `applySeasonEvent`'s `SEASON_INITIALIZED` ingests it directly. `WEEK_ADVANCED` jumps `calendar.date` to the next round's earliest fixture date (so the Autumn Nations and Six Nations breaks appear without special-casing); falls back to `+SEASON_VALUES.weekLengthDays` when no per-round date is present. `calendar.week` is the upcoming round number, not a wall-clock week. **Source of truth is `docs/prem-fixtures-2025-26.md`** — the doc and the TS module must stay in sync when fixtures change. `src/game/fixtures.ts::generateFixtures` (circle-method round-robin) is retained for future random-gen seasons — it produces fixtures with no `date`, so the +7-day fallback applies; not called at season init today, do not delete as dead code.

---

## Future development (intentionally out of scope today)

Deliberate gaps. The architecture is ready for each; no refactor needed when adding.

### Card system extensions
- **More card-issuing offences.** `PenaltyOffence` (`src/types/engine.ts`) currently fires TMO only for `high_tackle`. Add `'dangerous_cleanout'`, `'offside'`, `'not_rolling_away'`, etc. as one-line additions to the union plus a CardHandler branch in `evaluateNewPenalty`. The TMO + team-22 infrastructure is reusable as-is.

### Maul phase
- **No `MatchPhase.Maul` exists today.** Driving mauls are folded into the lineout / breakdown abstraction. When added, the card system's forward-availability filter (`onFieldPlayers` in `src/engine/FieldPosition.ts`) plus the `SHORT_HANDED` constants in `src/engine/balance/discipline.ts` should be extended to apply the same "missing forward = weaker pack" weakening to the maul resolver. A `missingForwardMaulPenalty` constant slots into `SHORT_HANDED`.

### AITacticalDirector card-awareness
- **`AITacticalDirector` (`src/engine/AITacticalDirector.ts`) does not read `state.cards`.** A team a man down (yellow / red_20 / red_full for a back) should arguably flip the AI more defensive (`AI_INTENT_PROTECTING`-style overlay) regardless of score gap. Extension: add a `playerCountTrigger` block to `src/engine/balance/aiDirector.ts` and a card-count check inside `director.evaluate()`. Pure additive — no breaking change to the baseline-vs-intent bundle architecture.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
