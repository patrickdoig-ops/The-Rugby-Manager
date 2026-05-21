# Engine Reference

Documents the complete game engine: the simulation loop, every match phase, all resolver formulas, and known gaps. Intended as the authoritative reference for anyone modifying engine behaviour.

## Maintaining this doc

After any change to engine code, update this file in the same commit. Engine code is everything under `src/engine/`, plus the engine-facing types in `src/types/engine.ts` and `src/types/matchEvent.ts`. The commentary renderer (`src/commentary/`) is also covered here.

When updating, document:
1. Which players are selected (exact `find`/`filter` conditions from `PhaseRouter.resolvePhase()` and the relevant event handler).
2. The resolver formula with actual numbers from the resolver file.
3. All outcome thresholds.
4. Ball position changes and possession swaps.
5. Stat increments per phase (which player, which `matchStats` field).
6. Any known gaps or approximations (add to § Known Gaps).

Do not paraphrase — if the code changes, the doc must reflect the new code exactly.

---

## Architecture

The engine is split across files in `src/engine/`. `MatchCoordinator` owns the public API, the tick loop, and the long-lived state; it delegates the cohesive responsibilities to dedicated modules:

| Module | Responsibility |
|---|---|
| `MatchCoordinator.ts` | Public API (`initialize`, `start`, `pause`, `resume`, `setTickDelay`, `getState`, `substitute`), tick loop, possession/territory stats, substitution. |
| `ClockController.ts` | Minute advance (clamped to half target, halved while in the red), clock-in-red entry, half-time and full-time triggers (`advanceMinute`, `checkClockInRed`, `shouldEndPeriod`, `triggerHalfTime`, `endMatch`). |
| `FatigueAccumulator.ts` | Owns the per-tick fatigue accumulator; drains in `FATIGUE_SCALING.computeIntervalMinutes` increments, computes home-then-away fatigue via `StaminaSystem.computeFatigue`, applies `FATIGUE_APPLIED`, and emits the newly-tired commentary `GameEvent`. The home-then-away order is determinism-critical (both calls consume the outcome RNG stream). Accepts the same `silent` flag as `ClockController` — when true, the newly-tired commentary emit is suppressed (mutations still apply through the boundary). |
| `Entry22Tracker.ts` | Pure `detectEntry22Changes(state)` — clears the non-possessor's active flag and registers the possessor's entry when in the opposition 22. |
| `PhaseRouter.ts` | `PHASE_HANDLERS` map, `resolvePhase(state, sm, kickOffStrategy)`, and the `draftEvent(state, phase)` template builder. |
| `PenaltyHandler.ts` | Penalty-decision modal pause and outcome application (`kick_for_goal`, `kick_to_touch`, `tap_and_kick_dead`, `tap_and_go`), plus the kick-off strategy modal (`awaitKickOffStrategy`, `handlePenaltyDecision`). |
| `FieldPosition.ts` | Pure helpers over `MatchState` that factor in `state.clock.halfTimeDone`: `attackDir`, `isTryScored`, `isTryScoredAt`, `inOpposition22`, `inOpposition22At`, `inOppositionHalf`, `inOwn22`, `inOwnHalf`. The `*At(ballX, possession, halfTimeDone)` variants keep a scalar signature — used for projecting not-yet-applied positions. |
| `applyMatchEvent.ts` | **The single mutation boundary.** A reducer over the `MatchEvent` discriminated union (`src/types/matchEvent.ts`). The only function permitted to write to `MatchState` or any `Player` field. |
| `StaminaSystem.ts` | Pure `computeFatigue(team, elapsedMinutes)` — returns `{updates, newlyTired}` without writing to players; `FatigueAccumulator` emits the resulting `FATIGUE_APPLIED` events. |
| `RatingEngine.ts` | Pure `computeRating(player)` — called by `applyMatchEvent` when a `RATINGS_RECALCULATED` event is reduced. |
| `balance/` | **Single source of truth for every gameplay tuning number.** One file per concern (scoring, kicking, openPlay, breakdown, scrum, lineout, fatigue, rating, tactics, clock, commentary, season) re-exported through `balance/index.ts`. Resolvers, events, and systems import from here; no tuning literals live elsewhere. |

All emit UI side-effects through the shared `src/utils/eventBus.ts` singleton; event IDs come from the monotonic counter in `src/engine/eventId.ts`. The current phase lives solely on `state.phase`; all transitions go through the `PHASE_CHANGED` `MatchEvent` (no separate state-machine class). `PhaseContext` (`src/engine/events/types.ts`) is the minimal closure passed to handlers — `{ state, attackTeam, defendTeam, randomPlayer, pickPlayer, draftEvent, kickOffStrategy }`. Field-position helpers (`attackDir`, `inOwn22`, `isTryScoredAt`, …) are pure functions in `FieldPosition.ts` that handlers import directly with `state`.

### Mutation boundary: `MatchEvent` and `applyMatchEvent`

All writes to `MatchState`, `player.matchStats`, `player.fatiguePct`, `player.currentStats`, and `player.rating` flow through one function: `applyMatchEvent(state, event)` in `src/engine/applyMatchEvent.ts`. The `MatchEvent` discriminated union (`src/types/matchEvent.ts`) defines every kind of mutation the engine performs — domain events like `TRY_SCORED`, `KNOCK_ON`, `CARRY_RESOLVED`, `LINEOUT_RESOLVED`, `SCRUM_RESOLVED`, `BREAKDOWN_HIT`, `TURNOVER_AT_BREAKDOWN`, `PENALTY_AWARDED`, plus structural events like `BALL_REPOSITIONED`, `POSSESSION_SWAPPED`, `PHASE_CHANGED`, `COMMENTARY_LOGGED`, `RATINGS_RECALCULATED`. Phase handlers in `src/engine/events/` are read-only over state: they read, compute, and return `PhaseResult { ..., events: MatchEvent[] }`. `PhaseRouter.resolvePhase()` applies the queue through `applyMatchEvent` before composing the outgoing `GameEvent`. Orchestrators (`MatchCoordinator`, `ClockController`, `PenaltyHandler`) apply events directly through `applyMatchEvent` for non-phase mutations (clock, half-time, penalty choice, substitutions, tactics). UI bus emissions (`eventBus.emit('engine:event'|'engine:stateChange'|…)`) are pure side effects that fire alongside, and are **not** part of the `MatchEvent` boundary.

`applyMatchEvent` uses a `default: const _: never = event;` exhaustiveness check, so adding a new `MatchEvent` variant without a handling branch is a compile error.

**Runtime invariants.** After every event is applied, `assertInvariants(state)` (`src/engine/invariants.ts`) verifies the live numeric/structural ranges that the type system can't express: `score.home/away ≥ 0` and integer, `possession ∈ {'home','away'}`, `phase ∈ MatchPhase`, `ball.x/y ∈ [0,100]`, `clock.gameMinute ≥ 0`, and for every player on either roster (starters, bench, substituted-off) `fatiguePct ∈ [0,100]`, `rating ∈ [0,10]`, every `currentStats.X ∈ [1,100]`. A violation throws with the offending field, so the failure surfaces at the mutation that caused it rather than at some downstream render or save-load step. Cost is O(matchday squad) per mutation; runs in all environments — it's a tripwire for engine bugs, not defensive runtime handling.

### Season-scope mutation seam: `GameCoordinator` + `applySeasonEvent`

Match-scope writes flow through `applyMatchEvent`; **season-scope writes flow through `applySeasonEvent`** in `src/game/applySeasonEvent.ts`. The game engine (`src/game/`) is a sibling to the match engine (`src/engine/`) and owns one `GameState` per session — calendar (`date`, `week`, `seasonLabel`), league (`fixtures`, `results`, `standings`), `player.teamId` + `player.tactics` + `player.matchdaySquad` (the last two persist pre-match choices across matches), and the root `seed`.

| Module | Responsibility |
|---|---|
| `GameCoordinator.ts` | Public API (`newSeason`, `fromSave`, `getState`, `getCurrentFixture`, `recordPlayerMatchResult`, `toSavePayload`). Owns the `GameState`. The "tick" of the game engine is a player match completing: `recordPlayerMatchResult` applies the player's score, headlessly simulates the other fixtures of the round, then advances the week. |
| `applySeasonEvent.ts` | Single mutation seam. Reducer over `SeasonEvent` (`src/types/gameState.ts`): `SEASON_INITIALIZED`, `FIXTURE_RESULT_RECORDED`, `WEEK_ADVANCED`, `PLAYER_TACTICS_SET`, `PLAYER_MATCHDAY_SQUAD_SET`. Same `default: const _: never = event;` exhaustiveness contract as `applyMatchEvent`. |
| `playerSquad.ts` | Pure helpers: `extractMatchdaySquad` (snapshot the 23-man matchday roster as stable name refs) and `applyMatchdaySquad` (inverse — rearrange a fresh-from-JSON `RawTeamInput` so the saved 23 occupy slots 1-23). Returns the team unchanged when the saved list is empty, the wrong length, or references a player no longer rostered. |
| `fixtures.ts` | Pure double round-robin generator using the standard "circle" method. Player's team is placed at position 0 so its match is always the first pairing per round. |
| `simulateFixture.ts` | Headless wrapper around `MatchCoordinator` with `silent: true` — suppresses every `engine:event`/`engine:stateChange`/`engine:initialized`/`engine:resumed` emit and replaces modal prompts with `high_ball`/`kick_for_goal` defaults. `engine:finished` still fires for completion detection. |
| `leagueTable.ts` | Pure helpers: `sortStandings` (league points → points diff → points for), `findStanding`. |
| `teamStats.ts` | Pure derivations from `FixtureResult[]` + overall ratings: `recentForm` (rolling W/L/D pins padded with null on the left), `headToHead` (W/D/L record from one team's POV across every meeting so far), `matchSpread` (rating-derived handicap, favored side negative). Read by `PreMatchScreen`; no module state, no bus subscriptions. |
| `derive.ts` | `deriveFixtureSeed(rootSeed, round, homeId, awayId)` — hashes the inputs so each headless AI fixture has a stable, derivable seed. |
| `age.ts` | Pure `getAge(dobIso, currentDateIso)` — returns null when `dob` is missing. Used by `TeamInfoScreen` to derive ages from `calendar.date`. |
| `balance/season.ts` | Season tuning constants — `SEASON_VALUES` (start date, season label, week length) and `LEAGUE_POINTS` (Premiership 4/2/0 + losing bonus when margin ≤ 7). |

`TeamProfile` (`src/team/teamProfile.ts`) was previously the season-scope mutation seam; that role has moved into `GameState.league.standings`. The module now only exposes identity/narrative/star data + roster lookups (`computeOverallRating`).

#### Game-engine UI events

| Event | Payload | Subscribers |
|---|---|---|
| `game:initialized` | `{ state: GameState }` | `FixtureListScreen` (initial render after `newSeason` / `fromSave`) |
| `game:fixtureRecorded` | `{ result: FixtureResult; state: GameState }` | `FixtureListScreen` (re-render fixtures + standings as each headless sim resolves) |
| `game:weekAdvanced` | `{ state: GameState }` | `FixtureListScreen` (calendar header) |

`SavedGame` in `src/ui/SaveManager.ts` is a thin serialiser for `GameCoordinator.toSavePayload()`: `playerTeamId`, `seed`, `currentWeek`, every `FixtureResult` (player's + AI), (v3+) the `seasonLabel` + `fixtures` snapshot the user saw at save time, and (v4+) the persisted pre-match `tactics` + `matchdaySquad` so the next match opens with the manager's last commit as the default. `fromSave` re-runs `SEASON_INITIALIZED` against the saved schedule when present (otherwise falls back to the canonical one for legacy v2 saves), replays results to rebuild standings + calendar deterministically, then replays the saved `PLAYER_TACTICS_SET` / `PLAYER_MATCHDAY_SQUAD_SET` events if present. `SAVE_VERSION` is now 4; v2 and v3 saves load via the legacy path (no tactics/squad snapshot) and v1 saves are discarded.

Season-level determinism: `(playerTeamId, rootSeed)` plus the player's series of results produces an identical final league table on every run. Verified by `scripts/checkSeasonDeterminism.ts`; `npm run verify` runs both the match-level and season-level harnesses.

### Balance constants

Every number listed in the resolver formulas, tactic modifier tables, fatigue tiers, and rating weights below is defined under `src/engine/balance/` — one file per concern (`scoring`, `kicking`, `openPlay`, `breakdown`, `scrum`, `lineout`, `fatigue`, `rating`, `tactics`, `clock`, `commentary`, `season`), re-exported through `balance/index.ts`. The doc below shows the current values; the `balance/` directory is the canonical place to read or change them. `scoring.ts` holds the laws-of-the-game point values (try 5, conversion 2, penalty goal 3); `commentary.ts` also holds `COMMENTARY_BUFFER_CAP` (the soft cap on `state.events`).

### Tactics: who picks what

`TeamTactics` (`src/types/team.ts`) is a five-dimension object: `attackingGamePlan`, `attackingStyle`, `attackingBreakdown`, `defendingBreakdown`, `backfieldDefence`. Every resolver reads it from `attackTeam.tactics.X` / `defendTeam.tactics.X` directly — no separate "intent" layer.

At match init (`MatchCoordinator.initMatchState`):
- **Human side** uses `playerTactics` if supplied (the object passed from `PreMatchScreen.onStart`), otherwise falls back to the team's `suggestedTactics`.
- **AI side** uses the team's `suggestedTactics` from `RawTeamInput` — authored per club in `src/data/team-*.json`. Each side gets its own identity at kick-off (Bath two-back fullback cover, Saracens jackal-heavy defence, etc.) rather than a single league-wide `DEFAULT_TACTICS`.
- If neither input is present (e.g. legacy fixture data without `suggestedTactics`), `buildTeam` falls through to `DEFAULT_TACTICS`.

Mid-match the human can swap any dimension via the tactics modal (`ui:tacticsChange` bus event → `TACTICS_UPDATED` `MatchEvent`). The AI has no UI; in-match adjustments are written by `AITacticalDirector` (see below). Both paths share the same mutation seam — `applyMatchEvent` is the only writer of `team.tactics`.

**`AITacticalDirector`** (`src/engine/AITacticalDirector.ts`) is a pure (no RNG) module owned by `MatchCoordinator`. It's instantiated alongside `clock` / `fatigue` and called once per tick — `director.evaluate()` runs *before* `resolvePhase()`, so a tactic change applies to the same tick that triggered it. The director never proposes tactics for the human side; in silent (fully-headless) fixtures the constructor is given `humanSide: undefined` so both teams adapt. Tuning lives in `src/engine/balance/aiDirector.ts`: `scoreGapTrigger` (8 points) and `minutesRemainingTrigger` (15 minutes) gate the flip. Two named intent bundles overlay the team's baseline `suggestedTactics`: `AI_INTENT_CHASING` (possession + wide_wide + wide_play + one_back — trailing late) and `AI_INTENT_PROTECTING` (kicking + keep_it_tight + pick_and_drive + shadow + two_back — leading late). Outside the late-game window or within the score-gap dead band, the director reverts each side to its captured baseline.

### `MatchState` shape

`MatchState` (`src/types/match.ts`) groups three clusters into nested sub-objects; everything else is top-level:

```ts
state.clock  = { gameMinute, halfTimeDone, clockInTheRed, penaltyKickToTouchLineout }
state.ball   = { x, y }                              // renamed from ballX/ballY
state.engine = { isRunning, tickDelayMs, seed, firstHalfKicker, humanSide }

// top-level: phase, possession, score, events, breakdownMod, kickReturnCarrier,
//            homeTeam, awayTeam, stats
```

Snapshot DTOs intentionally **stay scalar** — they are frozen log rows, not live state:
- `GameEvent.ballX` / `GameEvent.ballY` (entries in `state.events[]`)
- `PenaltyContext.ballX` / `ballY` / `clockInTheRed` / `halfTimeDone` (crosses the event-bus boundary to `ModalManager`)
- `MatchEvent` payload fields (`x`, `y`, `delta`, `value`) stay scalar — only the write *targets* in `applyMatchEvent` are nested
- `isTryScoredAt(ballX, possession, halfTimeDone)` and `inOpposition22At(ballX, possession, halfTimeDone)` keep scalar signatures — called on projected (not-yet-applied) positions

### UI Event Bus Contract

The engine emits five UI-bound events through `src/utils/eventBus.ts`. UI modules subscribe to react; the engine never imports any UI module.

| Event | Payload | Subscribers |
|---|---|---|
| `engine:initialized` | `{}` | Scoreboard, PitchStrip, StatsPanel, CommentaryFeed — reset per-match caches |
| `engine:stateChange` | `{ state: MatchState }` | Scoreboard, StatsPanel, PitchStrip; CommentaryFeed (one-shot for team-colour cache) |
| `engine:event` | `{ event: GameEvent }` | CommentaryFeed (renders narration) |
| `engine:paused` | `{ payload: ModalPayload }` | ModalManager (penalty / kick-off / tactics / sub modal), SimController (button gating) |
| `engine:resumed` | `{}` | ModalManager, SimController |
| `engine:finished` | `{ state: MatchState }` | `main.ts` (shows match-result overlay) |

**Tick ordering:** within a single tick, `engine:event` fires **before** `engine:stateChange`. UI subscribers that depend on cached state from the prior tick will always have a valid cache by the time an event arrives.

**Subscription lifetime:** `eventBus.on()` returns an unsubscribe function. UI subscriptions registered at startup are intentionally permanent for the page lifetime. One-shots (e.g. `CommentaryFeed` caching team colours on first `engine:stateChange`) call the returned unsub explicitly.

UI→engine direction is one channel: `SimController` is the only UI module that calls engine methods (`start`, `pause`, `resume`, `setTickDelay`). Substitutions and tactics changes go through `ui:substitution` / `ui:tacticsChange` bus events; `MatchCoordinator` subscribes to these in its constructor and unsubscribes in `destroy()` (called from `main.ts` after the match-result overlay closes).

---

## Simulation Loop

`MatchCoordinator.tick()` is a self-rescheduling `async` function using `setTimeout`. It is not `setInterval` — pausing is simply not scheduling the next tick.

Each tick:
1. Captures `wasInRed = state.clock.clockInTheRed` and `previousPhase = state.phase` before any mutation.
2. Advances game time via `clock.advanceMinute(state)` (`src/engine/ClockController.ts`): if `state.clock.clockInTheRed`, adds `timeAdvance / 2` (clock crawls); otherwise advances normally and clamps to the half target (40 or 80). `timeAdvance = 0.2 + rng(0, 8) / 10` (0.2–1.0 per tick); the raw value is returned so the caller can drive the fatigue accumulator.
3. Drives `FatigueAccumulator.tick(timeAdvance)` (`src/engine/FatigueAccumulator.ts`): accumulates elapsed time and, once the accumulator reaches 5 game minutes, calls the pure `computeFatigue(team, elapsedMinutes)` on both teams (home first, then away — order matters because both consume the outcome RNG stream) and emits a `FATIGUE_APPLIED` event for every update. `computeFatigue` also returns newly-fatigued players (crossing below 50%); a fatigue commentary event is logged for each.
4. Increments possession and territory counters.
5. For `KickOff` and `BoxKick` phases: emits a pre-phase announce `GameEvent` (naming the kicker before the outcome is resolved).
6. For `KickOff` phase: awaits kick-off strategy selection via `penaltyHandler.awaitKickOffStrategy()` (modal `kickoff_choice` pause) — **managed team only** (the side the human player chose at the team selector). The AI-controlled team always defaults to `high_ball` with no modal.
7. Calls `resolvePhase(state, kickOffStrategy)` (`src/engine/PhaseRouter.ts`) to produce the outcome `GameEvent`. The router owns the `PHASE_HANDLERS` map, builds the `PhaseContext`, dispatches to the matching event handler, applies the handler's `MatchEvent[]` queue, then applies `PHASE_CHANGED` to advance `state.phase`, and returns the resulting `GameEvent`.
8. Emits `engine:event` and `engine:stateChange`.
9. Checks for penalty interactive pause via `penaltyHandler.handlePenaltyDecision()` (if phase is `Penalty`).
10. **Clock-in-the-red check:** If `!state.clock.clockInTheRed`, calls `clock.checkClockInRed(state)` (sets flag and emits announcement when `gameMinute >= halfTarget`). Else if `wasInRed && clock.shouldEndPeriod(state, previousPhase)`, calls `clock.triggerHalfTime(state)` or `clock.endMatch(state)`.
11. Schedules next tick at `state.engine.tickDelayMs`.

### Attack direction

Home attacks toward `ball.x = 100` in the first half, toward `ball.x = 0` in the second. **Teams swap ends only at half-time, never on turnovers.** All ball movement uses pure helpers in `src/engine/FieldPosition.ts` that factor in `state.clock.halfTimeDone`:

- `attackDir(state)` → `+1` or `-1` for the possession team's attacking direction
- `isTryScored(state)` → true if `ballX` has crossed the possessing team's attacking try line
- `inOpposition22(state)` → true if `ballX` is inside the defending team's 22m zone

Never compute ball direction or territory logic outside these helpers.

### Phase state machine

```
KickOff      → KickReturn | Scrum
PhasePlay    → Breakdown | TacticalKick | TryScored | Penalty | Scrum | HalfTime | FullTime
FirstPhase   → Breakdown | TacticalKick | TryScored | Penalty | Scrum | HalfTime | FullTime
KickReturn   → Breakdown | TacticalKick | TryScored | Penalty | Scrum | HalfTime | FullTime
Breakdown    → PhasePlay | BoxKick | Scrum | Lineout | Penalty
BoxKick      → KickReturn | Scrum
Scrum        → FirstPhase | Penalty | Scrum
Lineout      → FirstPhase | Scrum
TacticalKick → KickReturn | Lineout | Scrum
TryScored    → ConversionKick → KickOff
Penalty      → [modal] → KickOff | Lineout | FirstPhase
HalfTime     → KickOff
FullTime     → (terminal)
```

Three carry phases share an evasion/collision resolver but have distinct player selection and structure:
- **PhasePlay** — runs after Breakdown; random carrier; hard carry or out-the-back split
- **FirstPhase** — runs after Scrum, Lineout, or a tap-and-go penalty; carrier always #10; crash ball or wide play
- **KickReturn** — runs after KickOff, BoxKick, or TacticalKick; carrier is whoever caught the kick; run step before evasion/collision

The transition table above is documentary; the engine no longer enforces it at runtime. All transitions go through `PHASE_CHANGED` applied via `applyMatchEvent`.

### Player ratings

Ratings are computed from accumulated per-player statistics, not from event-by-event deltas. After every `resolvePhase()` call (and after penalty goal kicks inside `PenaltyHandler`), a `RATINGS_RECALCULATED` `MatchEvent` is emitted; `applyMatchEvent` calls `computeRating(player)` on all 30 players and writes the result to `player.rating`.

**`computeRating`** is a pure function in `src/engine/RatingEngine.ts`. It reads `player.matchStats` (a `PlayerMatchStats` object) and returns a value in [1.0, 10.0]:

```
baseScore = 6.0
score += tries × 7.0
score += lineBreaks × 2.5
score += defendersBeaten × 0.8
score += turnoversWon × 2.5
score += dominantTackles × 1.0
score += tacklesMade × 0.35
score += kicksMade × 1.0
score += metresCarried × 0.05
score -= knockOns × 1.5
score -= (tacklesAttempted − tacklesMade) × 0.5   // missed tackles
score -= penaltiesConceded × 1.2                  // breakdown penalties only
score -= kicksMissed × 0.75
```

Position bonuses (stacked additively on top of universal):

| Player id | Bonus |
|---|---|
| 2 (hooker) | `(lineoutWins / lineoutThrows − 0.75) × 20` when lineoutThrows > 0 |
| 4, 5 (locks) | `lineoutCatches × 1.5` + `lineoutSteals × 3.0` |
| 1–3 (front row) | `scrumPenaltiesWon × 2.5` − `scrumPenaltiesConceded × 2.5` |
| 6–8 (back row) | `turnoversWon × 1.5` (stacked) + `carries × 0.3` |
| 9 (scrum-half) | `passes × 0.05` |
| 10 (fly-half) | `kicksFromHand × 0.25` |
| 11, 14, 15 (wings/fullback) | `lineBreaks × 1.5` (stacked) |

```
rating = clamp(6.0 + score / 10.0, 1.0, 10.0)
```

**`PlayerMatchStats`** is declared in `src/types/player.ts` and initialised to all zeros in `zeroMatchStats()` which is called by `initPlayer()` for every player (starters and bench). Fields:

```typescript
carries, metresCarried, lineBreaks, defendersBeaten, knockOns, passes,
tacklesAttempted, tacklesMade, dominantTackles, turnoversWon, penaltiesConceded,
tries, kicksFromHand, kicksAtGoal, kicksMade, kicksMissed,
lineoutThrows, lineoutWins, lineoutCatches, lineoutSteals,
scrumPenaltiesWon, scrumPenaltiesConceded,
kickMetres, rucksHit
```

To add a new stat: add one field to `PlayerMatchStats`, one `field: 0` in `zeroMatchStats()`, increment it in the relevant event file(s), and optionally add a weight in `computeRating()`.

Ratings are displayed in the Player Stats panel and update once per game minute. Bench players who never came on retain their initial rating of 6.0.

### Pre-match overall (0–100) and spawn-time star boost

Distinct from the match-performance `computeRating` above, **`playerOverall(stats, position)`** in `src/engine/RatingEngine.ts` returns a 0–100 ability score from the 12 `baseStats`. It is a normalised position-weighted average — weights live in `PLAYER_OVERALL_WEIGHTS` (`src/engine/balance/rating.ts`), stats missing from a position's table default to 1.0. Read by `PreMatchScreen`, `TeamInfoScreen`, and `teamProfile.computeOverallRating` (top-23 mean). Never mutated in-match.

**`applyStarBoost(team)`** in `src/team/applyStarBoost.ts` is the spawn-time transform that lifts authored baseStats so elite real-world players compute to ~95 OVR rather than the high-70s a hand-authored "realistic" line produces under the weighted-average formula. Called once at app start from `main.ts` against each `TeamJson` before either `teamProfile.init()` or any `RawTeamInput` cast that feeds `MatchCoordinator`. Two deterministic, RNG-free passes per team:

1. **League-wide floor.** Every player on the matchday roster (players + bench, *excluding* the data-only `squad[]`) gets each baseStat raised to `STAR_BOOST.leagueMin`. Stats already above the floor are untouched.
2. **Per-star boost.** For each `team.stars[i]`, find the matching roster player by full name and lift their `indexHigh` stats to a high floor (97 for top stars with `suggestedRating ≥ 90`, 95 otherwise) and non-`indexHigh` stats to `otherStatMin`. Then iteratively pick the highest-position-weighted non-capped stat and bump it +1 until the computed OVR meets `suggestedRating + targetOffset` (or all stats cap at 99).

`STAR_BOOST` lives next to the OVR weights in `src/engine/balance/rating.ts`. The boost runs against the local `TeamJson` shape and returns a new object — the on-disk JSONs are unchanged. The determinism harnesses (`scripts/checkDeterminism.ts`, `scripts/checkSeasonDeterminism.ts`) and the telemetry script apply the same boost so the verification chain sees the same league the player does.

---

## Fatigue System

Called via `computeFatigue(team, elapsedMinutes)` approximately every 5 game minutes. The function is pure — it returns `{updates, newlyTired}` and the caller emits `FATIGUE_APPLIED` `MatchEvent`s for each update.

### Decay

Every cycle, a base decay rate between 4 and 12 is randomly determined. This rate is then reduced depending on the player's stamina — higher stamina means a slower fatigue drain. A player with a stamina rating of 90 will only suffer 40% of the base decay compared to a player with a stamina rating of 0.

`actualDecay = decayRate × (1 − stamina / 150)`

For forwards (player id ≤ 8), the decay is then multiplied by a tactic factor:

- `attackingBreakdown === 'pick_and_drive'`: ×1.1
- `defendingBreakdown === 'counter_ruck'`: ×1.1
- Both active: ×1.21 (multiplicative, not additive)

Backs (id ≥ 9) are unaffected by the tactic multiplier.

Higher stamina reduces decay. A player with stamina 90 decays at 40% the rate of one with stamina 0. With 16 fatigue applications per 80-minute game, expected total fatigue loss at stamina 60 is ~77%, stamina 0 hits the floor well before full time, stamina 90 is ~51% — most players cross the 50% penalty tier during the match.

### Attribute penalties (applied to `currentStats` from `baseStats`)

Each `if` block overwrites the previous, so the final matching block wins.

| Fatigue threshold | Affected attributes | Multiplier |
|---|---|---|
| < 90% | strength | × 0.90 |
| < 80% | tackling | × 0.80 |
| < 70% | pace, agility | × 0.75 |
| < 70% | handling, discipline, composure, setPiece, breakdown | × 0.80 |
| < 70% | strength | × 0.70 |
| < 50% | pace, agility | × 0.55 |
| < 50% | handling, discipline, composure, setPiece, breakdown | × 0.60 |
| < 50% | strength | × 0.50 |
| < 30% | pace, agility | × 0.35 |
| < 30% | handling, discipline, composure | × 0.40 |
| < 30% | tackling | × 0.40 |
| < 30% | setPiece, breakdown | × 0.30 |
| < 30% | strength | × 0.30 |

**Not affected by fatigue at any threshold:** kicking, positioning.

`baseStats` is never modified. `currentStats` is rebuilt from `baseStats` on every fatigue application.

### Fatigue commentary

When `computeFatigue` detects a player crossing from ≥ 50% to < 50% fatiguePct, it returns that player in its `newlyTired` list. `FatigueAccumulator` emits a commentary `GameEvent` (using the current phase/possession context) with a randomly chosen line from six variants: "starting to look tired", "looking leggy", "wear is showing", "running on empty", "looks worn out", "tank is emptying". The commentary feed colorises the player name normally.

---

## Determinism (Seeded RNG)

All randomness flows through three isolated mulberry32 streams in `src/utils/rng.ts`:

| Stream | Backing function | Consumers |
|---|---|---|
| `outcome` | `rng(min, max)` | Every in-play roll: resolvers, phase handlers, `ClockController.advanceMinute`, coin toss, substitution template selection |
| `form` | `rngForm()` | Player form modifier in `initPlayer()` |
| `commentary` | `pickRandom(arr)` | Commentary template selection in `CommentaryEngine.pick()` |

Each stream is seeded with the master seed XORed against a fixed constant, so adding new commentary lines (or any new flavour roll) cannot shift outcome rolls.

The master seed is a 32-bit unsigned integer stored on `state.engine.seed`. It is set in the `MatchCoordinator` constructor — either passed via `opts.seed` or auto-generated via `Math.floor(Math.random() * 0x100000000)`. `setMatchSeed(seed)` is called **before** `initMatchState()` so player form initialisation is deterministic. Once set, the only `Math.random()` call in the engine is the seed-generation line itself.

A match with a given seed is fully reproducible: identical event sequence, identical scores, identical fatigue trajectories.

---

## Per-Match Form Modifier

**Source:** `rngForm()` in `src/utils/rng.ts` (form stream), applied in `initPlayer()` in `src/engine/MatchCoordinator.ts`.

At match start, every player (starters and bench) receives a `formModifier` — a signed integer drawn from a normal distribution (mean 0, std dev 5, clamped to [−10, +10]). It is applied additively to every stat in `currentStats` before the first tick:

```
current[stat] = clamp(baseStats[stat] + formModifier, 1, 100)
```

`baseStats` is untouched. Fatigue then degrades `currentStats` from this form-adjusted base throughout the match. A player with `formModifier = +8` starts with all attributes elevated by 8 points; one with `formModifier = −6` starts 6 points below baseline in every stat.

`formModifier` is hidden from the UI — it is stored on `Player` for engine purposes but no UI module reads it.

---

## Home Advantage

**Source:** `HOME_ADVANTAGE` constants in `src/engine/balance/homeAdvantage.ts`; resolved per call site via `homeEdge(state, mod)` in `src/engine/HomeAdvantage.ts`.

A flat per-match tilt toward the side currently occupying the `homeTeam` slot in `MatchState`. The engine consumes it through two channels — open-play carries (`carryMod`) and the breakdown (`breakdownMod`) — and the pre-match SPREAD tile reads the same `spreadPts` headline so prediction and simulation agree.

**Channels:**

| channel | call site | how it flows |
|---|---|---|
| Open-play carry | `FirstPhaseEvent`, `OpenPlayEvent`, `KickReturnEvent` | `homeEdge` is added to the `attackMod` / `defendMod` passed into `resolveOpenPlay`. Bumps evasion / defence rolls on the home side. |
| Breakdown | `BreakdownEvent` | `homeEdge` is added to the `attackBonus` / `defendBonus` passed into `resolveBreakdown`. Bumps `ars` (when home is attacking the ruck) or `dts` (when home is defending). |

**Calibration:** tuned via `npm run telemetry` against the real-rugby Premiership home win-rate of ~57%. Current values produce **57.8% home wins · 37.8% away wins · 4.4% draws** across the 90-fixture pass, with an average home margin of 5.5 points. The headline `spreadPts: 3` is the betting-market-style baseline for a typical matchup; the larger simulated margin reflects the compounding effect of two channels across an 80-minute match.

What's **not** modelled today: referee tilt on marginal penalties, kicker accuracy bump at home, travel fatigue for the away side. Each could be added as an extra channel with its own `HOME_ADVANTAGE.*` knob and re-tuning pass.

---

## Coin Toss

Resolved inside `MatchCoordinator.initialize()` before the first tick.

```
winner = rng(0, 1) === 0 ? 'home' : 'away'
state.possession = winner                       // POSSESSION_SET
state.engine.firstHalfKicker = winner           // FIRST_HALF_KICKER_SET
```

A 50/50 coin flip. The winning team kicks off in the first half. `state.engine.firstHalfKicker` is the persisted record of who took the 1H kick-off; `ClockController.triggerHalfTime()` reads it and sets `state.possession = the complement` so the other team always kicks off the second half — regardless of who happens to hold possession at the dead-ball moment that triggers HT.

`initialize()` first emits an `engine:initialized` UI-bus event (zero payload) so UI modules holding per-match caches (`Scoreboard` crests, `PitchStrip` end labels, `CommentaryFeed` team roster + DOM, `StatsPanel` cached render keys + DOM) can reset before the new match's first `engine:stateChange`. This is what makes back-to-back matches in the same page session work — each `new MatchCoordinator(...).initialize()` call resets all UI caches.

A `GameEvent` with phase `KickOff` and key `coin_toss` is emitted immediately so the result appears in the commentary feed before the first tick runs.

---

## Kick-Off

### Strategy selection

Before the resolver runs, the kicking team's strategy is determined:

- **Managed team kicking:** A modal pause (`kickoff_choice`) is presented. Three options: Kick Short (`short_kick`), Grubber Kick (`grubber`), Kick Deep (`high_ball`). The engine awaits the selection before proceeding.
- **AI-controlled team kicking:** Always defaults to `high_ball` (Kick Deep), no modal shown.

### Player selection

The fly-half (id 10) of the kicking team always takes the kick. Receiver and chaser are drawn based on strategy:

| Strategy | Receiver pool | Chaser pool |
|---|---|---|
| `high_ball` (Kick Deep) | ids 9, 11, 14, 15 (backs) | any |
| `short_kick` (Kick Short) | ids 1–8 (forwards) | ids 7, 11, 14 |
| `grubber` (Grubber Kick) | ids 1–8 (forwards) | any (not used in resolver) |

Falls back to `randomPlayer` if the filtered pool is empty.

### Step 1 — Kick quality and distance

```
kickScore = kicker.kicking + rng(1, 20)
goodKick  = kickScore >= 35
```

| Strategy | Good kick distance | Bad kick distance |
|---|---|---|
| `high_ball` | 25–40m | 15–25m (no poor-kick threshold) |
| `short_kick` | 10–20m | 4–9m → `poor_kick` |
| `grubber` | 15–25m | 4–9m → `poor_kick` |

**10-metre rule (`short_kick` and `grubber`):** If `distance < 10`, the resolver returns `poor_kick` immediately. The receiving team is awarded a scrum at halfway (possession flips) and the kicker receives a rating penalty.

The ball is placed at the kick's landing position before outcome resolution (so a `knock_on` scrum is at the landing spot, not at halfway). `poor_kick` resets `ballX` to 50.

### Step 2 — Outcome resolution

**Kick Deep (`high_ball`) — catching gate only:**
```
catchScore = (receiver.handling + receiver.composure) / 2 + rng(1, 20)
catchScore < 30 → knock_on
else            → clean_receive
```
No chase contest. The result is solely whether the receiver holds the ball.

**Kick Short (`short_kick`) — catch vs chase contest:**
```
catchScore = (receiver.handling + receiver.composure) / 2 + rng(1, 20)
chaseScore = (chaser.pace + chaser.agility) / 2 + rng(1, 20)
margin     = catchScore − chaseScore
margin > 10  → clean_receive
margin > −5  → 30% short_kick_retain, else clean_receive
margin ≤ −5  → knock_on
```

**Grubber (`grubber`) — catching gate only:**
```
catchScore = (receiver.handling + receiver.composure) / 2 + rng(1, 20)
catchScore < 30 → knock_on
else            → clean_receive
```

### Outcome summary

| Result | Possession | ballX | Next phase |
|---|---|---|---|
| `poor_kick` | flip to receiving team | 50 (halfway) | Scrum |
| `knock_on` | stays with kicking team | landing position | Scrum |
| `clean_receive` | flip to receiving team | landing position | KickReturn |
| `short_kick_retain` | stays with kicking team | landing position | KickReturn |

### Stat increments

| Outcome | Player | Stat |
|---|---|---|
| every kick-off | kicker | `kicksFromHand++` |

---

## Carry Phases (PhasePlay / FirstPhase / KickReturn)

Three phases share a common evasion/collision resolver but have distinct player selection, play-structure, and preliminary steps. Each is a separate handler in its own file, routing to the matching `MatchPhase` enum for commentary.

### Step 0 — Kick or carry decision (all three phases)

The probability of kicking rather than carrying is driven by `attackTeam.tactics.attackingGamePlan` and pitch location:
- `possession`: 50% inside own 22; 15% in own half; 0% in opposition half.
- `balanced`: 75% inside own 22; 50% in own half; 10% in opposition half.
- `kicking`: 90% inside own 22; 65% in own half; 15% in opposition half.

If it fires, the fly-half (id=10) is logged as `primaryPlayer` for commentary and the phase transitions to `TacticalKick`. The remaining steps do not run.

---

### PhasePlay

Runs after `Breakdown` (recycled possession). The carrier is a random player from the attacking team.

```typescript
carrier  = randomPlayer(attackTeam)
defender = randomPlayer(defendTeam)
```

**Step 1 — Carrier handling gate**

`handling + rng(1,100) < 85` → knock-on: possession flips, scrum awarded, carrier −0.45. This gives ~5% for handling 80, ~10% for handling 75, ~20% for handling 65, 0% for handling ≥ 85.

**Step 2 — Hard Carry / Out the Back decision**

| `attackingStyle` | Hard Carry | Out the Back |
|---|---|---|
| `keep_it_tight` | 90% | 10% |
| `balanced` | 70% | 30% |
| `wide_wide` | 50% | 50% |

If the carrier is the fly-half (id 10), **always Out the Back**.

**Hard Carry:** carrier proceeds directly to evasion (Step 3).

**Out the Back:** ball is worked through the fly half (id 10) to an outside back (random from ids 11, 13, 14, 15) via two additional handling gates (same `handling + rng(1,100) < 85` threshold). Knock-on at either gate: possession flips, scrum awarded. If both pass, `ballCarrier = outsideBack`.

**Steps 3–4 — Evasion → Collision** — see [Shared Evasion/Collision](#shared-evasioncollision) below.

---

### FirstPhase

Runs after `Scrum`, `Lineout`, or a tap-and-go penalty. The carrier is **always #10 (fly-half)**.

```typescript
carrier  = pickPlayer(attackTeam, 10)
```

**Step 1 — Carrier handling gate**

Same threshold as PhasePlay (`handling + rng(1,100) < 85` → knock-on; defender is `randomPlayer(defendTeam)` for commentary).

**Step 2 — Crash Ball / Wide Play decision**

Driven by `attackingStyle` using the same thresholds as the Hard Carry / Out the Back split:

| `attackingStyle` | Crash Ball | Wide Play |
|---|---|---|
| `keep_it_tight` | 90% | 10% |
| `balanced` | 70% | 30% |
| `wide_wide` | 50% | 50% |

**Crash Ball path** (#10 → #12):
1. `#10` passes to `insideCentre` (id 12)
2. `insideCentre` handling gate (`handling + rng(1,100) < 85`; red-clock variant: `< Math.min(99, 85 + Math.round(Math.max(0, 85 − handling) × 0.4))`) → knock-on if failed
3. `ballCarrier = insideCentre`; `defender = pickPlayer(defendTeam, 12)`

**Wide Play path** (#10 → #13 → #11 or #14):
1. `#10` passes to `outsideCentre` (id 13)
2. `outsideCentre` handling gate (same formula as above) → knock-on if failed
3. `outsideCentre` passes to `wing` (random from ids 11, 14)
4. `wing` handling gate (same formula) → knock-on if failed
5. `ballCarrier = wing`; `defender = random from defendTeam.players where id ∈ {11, 14}`

On any knock-on: possession flips, scrum awarded, dropping player −0.45. The `out_the_back` commentary intro is prepended before the knock-on line.

**Steps 3–4 — Evasion → Collision** — see [Shared Evasion/Collision](#shared-evasioncollision) below.

---

### KickReturn

Runs after `KickOff`, `BoxKick`, or `TacticalKick`. The carrier is **whoever caught the kick** in the prior phase, tracked via `state.kickReturnCarrier` (set by each kick handler before transitioning to `KickReturn`, cleared at the start of this handler). Falls back to `randomPlayer(attackTeam)` if unset.

```typescript
carrier  = state.kickReturnCarrier ?? randomPlayer(attackTeam)
defender = randomPlayer(defendTeam)   // any of the 15
```

`kickReturnCarrier` sources by prior phase:

| Prior phase | Outcome | Carrier set to |
|---|---|---|
| `KickOff` | `clean_receive` | `receiver` |
| `KickOff` | `short_kick_retain` | `chaser` |
| `BoxKick` | `attack_retain` | `winger` |
| `BoxKick` | `defend_catch_contested` | `fullback` |
| `BoxKick` | `defend_catch` | `fullback` |
| `TacticalKick` | `kick_caught` | `defender` (the fullback) |

**No carrier handling gate** — the catch was already resolved in the kick phase.

**Step 2 — Run**

The returner runs back before meeting the defensive line. Uses pace and agility against the chasers' pace and tackling:

```
runAttack = (carrier.pace + carrier.agility) / 2 + rng(1, 20)
runDefend = (defender.pace + defender.tackling) / 2 + rng(1, 20)
runMetres = runAttack >= runDefend ? rng(3, 10) : rng(0, 3)
```

`runMetres` is added to the evasion/collision gain at the end.

**Steps 3–4 — Evasion → Collision** — see [Shared Evasion/Collision](#shared-evasioncollision) below.

Total ball movement = `runMetres + res.gainMetres`.

---

### Shared Evasion/Collision

All three phases call `resolveOpenPlay(ballCarrier, defender, attackMod, defendMod + backfieldPenalty)` after completing their phase-specific steps. Both modifier arguments additionally receive a **home-advantage edge** computed via `homeEdge(state, HOME_ADVANTAGE.carryMod)` — when the home team has possession the bump lands on `attackMod`, when they're defending it lands on `defendMod`. See [Home Advantage](#home-advantage) below.

**Backfield Defence front-line penalty:**

| `backfieldDefence` | `defendMod` adjustment |
|---|---|
| `one_back` | 0 |
| `two_back` | −5 |
| `three_back` | −10 |

**Step 3 — Evasion:**

```
evasionScore = (ballCarrier.agility + ballCarrier.pace) / 2 + rng(1,20) + attackMod
defenseScore = (defender.positioning + defender.pace) / 2 + rng(1,20) + (defendMod + backfieldPenalty)
```

| Margin | Result |
|---|---|
| ≥ 15 | `line_break` → Breakdown (or TryScored) |
| < 15 | Proceed to Step 4 |

**Step 4 — Collision:**

```
collisionAttack = (ballCarrier.strength + ballCarrier.pace) / 2 + rng(1,20)
collisionDefend = (defender.tackling + defender.strength) / 2 + rng(1,20)
```

| Margin | Result | Gain |
|---|---|---|
| ≥ +5 | `dominant_carry` | 3–8m |
| −4 to +4 | `play_on` | 1–4m |
| ≤ −5 | `dominant_tackle` | −2 to +1m |

All outcomes → Breakdown.

**Tackle statistics:** `tackles.attempted` is incremented for `dominant_tackle`, `dominant_carry`, `play_on`, and `line_break`. `tackles.made` is only incremented for `dominant_tackle`, `dominant_carry`, and `play_on`. Line breaks therefore count as a missed tackle, lowering the tackle % displayed in the stats panel.

### Commentary

When Out the Back (PhasePlay), Crash Ball, or Wide Play (FirstPhase) paths are taken, `out_the_back` commentary lines are prepended naming the passer and receiver. These fire at each pass in the sequence and are prepended to all downstream outcomes including knock-ons.

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| knock-on at any handling gate | dropping player | `knockOns++` |
| PhasePlay carry phase (carrier ≠ #9) | scrumHalf (#9) | `passes++` |
| FirstPhase carry phase (after scrum/lineout) | scrumHalf (#9) | `passes++` |
| Out the Back path clears outsideBack gate | flyHalf | `passes++` |
| Crash Ball path clears insideCentre gate | carrier (#10) | `passes++` |
| Wide Play path clears outsideCentre gate | carrier (#10) | `passes++` |
| Wide Play path clears wing gate | outsideCentre | `passes++` |
| all four collision outcomes | ballCarrier | `carries++`, `metresCarried += gainMetres` |
| all four collision outcomes | defender | `tacklesAttempted++` |
| `line_break` | ballCarrier | `lineBreaks++`, `defendersBeaten++` |
| `dominant_carry` | ballCarrier | `defendersBeaten++` |
| `dominant_tackle` | defender | `tacklesMade++`, `dominantTackles++` |
| `dominant_carry` or `play_on` | defender | `tacklesMade++` |

KickReturn: total metres = `runMetres + res.gainMetres` (combined into `metresCarried`).

---

## Breakdown

### Player selection

```typescript
forwardPool = attackTeam.players.filter(p => p.id <= 8 && p.id !== carrierId)
backRow     = defendTeam.players.filter(p => p.id >= 6 && p.id <= 8)
defendPack  = defendTeam.players.filter(p => p.id <= 8)
```

Attacking supporters are sampled at random (without replacement) from the forward pool. The count is set by `attackingBreakdown`: `pick_and_drive` = 4, `balanced` = 3, `wide_play` = 2. The defending jackal is chosen at random from the back row (ids 6–8). The full defending pack (ids 1–8) is also passed for use by the `counter_ruck` branch.

**Tactical Breakdown Commitment (`AttackingBreakdown` & `DefendingBreakdown`):**
- **Attacking:** Supporter count is driven by `attackTeam.tactics.attackingBreakdown`: `pick_and_drive` commits 4 forwards; `balanced` commits 3 forwards; `wide_play` commits 2 forwards. Body count directly drives ARS via the stacked-score formula — no separate flat bonus.
- **Defending:** Strategy is driven by `defendTeam.tactics.defendingBreakdown`:
  - `jackal`: Relies on a single back-row specialist's breakdown stat.
  - `counter_ruck`: The 4 strongest defenders (by `strength×0.6 + breakdown×0.4`) contest the ruck using the stacked-score formula.
  - `shadow`: Concedes ruck ball (DTS = rng(1,10)) to maintain a perfectly aligned defensive line.

**Next-phase carry-over (`state.breakdownMod`):** Committing more players to the ruck leaves fewer available for the next phase. After every breakdown the engine sets `state.breakdownMod.attack` and `state.breakdownMod.defend` which are consumed (and reset to zero) by the very next carry phase (PhasePlay after Breakdown, or FirstPhase/KickReturn in other contexts), where they are applied as modifiers to the evasion and defence scores respectively.

| Tactic | Effect on next carry phase |
|---|---|
| `pick_and_drive` | attack −8 evasion (forwards still arriving) |
| `balanced` | 0 |
| `wide_play` | attack +8 evasion (extra players on feet outside) |
| `counter_ruck` | defend −8 (pack committed to ruck) |
| `jackal` | 0 (one player, line intact) |
| `shadow` | defend +10 (full defensive line set) |

On turnover or penalty, `breakdownMod` is reset to `{0, 0}` immediately — possession changes reset the context. On Scrum, `breakdownMod` is also reset so stale mods from the BoxKick → Scrum → OpenPlay path don't carry through.

### Resolution

Both attack and defense use a **diminishing-return stacked score** (`stackedScore`). Players are sorted best-first (by their two primary stats), then each contributes their weighted score with the weights `[1.0, 0.6, 0.4, 0.3]` for positions 1–4. The raw weighted sum is divided by 2, which calibrates 3 supporters (balanced) to the same base as a simple average.

```
stackedScore(players, leadStat, supportStat):
  sort players descending by (leadStat×0.6 + supportStat×0.4)
  sum = Σ (leadStat×0.6 + supportStat×0.4 + (discipline−50)×0.15) × WEIGHTS[i]
  return sum / 2
```

**ARS (Attack Ruck Score):**
```
ARS = stackedScore(supporters, breakdown, strength) + rng(1,20) + attackBonus
attackBonus = 6 if previous play was dominant_carry, else 0
```

**DTS (Defensive Turnover Score):**
- **jackal**: `breakdown×0.7 + strength×0.3 + (discipline−50)×0.15 + rng(1,20)`
- **counter_ruck**: `stackedScore(top4defenders, strength, breakdown) + rng(1,20)`
- **shadow**: `rng(1,10)`

The top 4 defenders for `counter_ruck` are the 4 forwards with the highest `strength×0.6 + breakdown×0.4` score.

Effect of player count on ARS (same-quality supporters, typical stats):

| Tactic | Supporters | Weight sum | ARS multiplier vs average |
|---|---|---|---|
| `wide_play` | 2 | 1.6 | ×0.80 |
| `balanced` | 3 | 2.0 | ×1.00 (baseline) |
| `pick_and_drive` | 4 | 2.3 | ×1.15 |

Both quality (stat values) and quantity (number of bodies) now independently influence the score. A team with specialist breakdown forwards benefits more from committing them to the ruck.

**Margin and outcomes:**

| Margin | Result |
|---|---|
| ≥ 10 | `clean_ball` → PhasePlay |
| ≥ −8 | `slow_ball` → PhasePlay / BoxKick |
| ≥ −14 | `turnover` → PhasePlay (possession flips) |
| < −14 | `penalty_defending` → Penalty (possession flips to defending team) |

### Ball movement

None. `ballX` does not change during a breakdown.

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| every breakdown | all supporters | `rucksHit++` (attacking ruck involvements) |
| `turnover` | jackal | `turnoversWon++` |
| `penalty_defending` | supporters[0] | `penaltiesConceded++` |

`supporters[0]` is the first randomly selected forward and serves as the `primaryPlayer` for commentary purposes.

---

## Scrum

### Player selection

```typescript
attackForwards  = attackTeam.players.filter(p => p.id <= 8)   // props, hooker, locks, flankers, no. 8
defendForwards  = defendTeam.players.filter(p => p.id <= 8)
attackFrontRow  = attackTeam.players.filter(p => p.id <= 3)   // loosehead, hooker, tighthead
defendFrontRow  = defendTeam.players.filter(p => p.id <= 3)
attackHooker    = attackTeam.players.find(p => p.id === 2)     // commentary only
defendHooker    = defendTeam.players.find(p => p.id === 2)     // commentary only
```

All eight forwards contribute to the pack score. The hooker is used for commentary only. Rating adjustments apply to the entire front row (ids 1–3) on both sides.

### Resolution

```
packScore      = avg(setPiece×0.6 + strength×0.4) across all 8 forwards
packDiscipline = avg(discipline) across all 8 forwards
finalScore     = packScore + (packDiscipline − 50)×0.15 + rng(1,20)
```

The defending pack's final score is subtracted from the attacking pack's final score to determine the margin:

| Margin | Result |
|---|---|
| > 15 | `attacking_dominant_penalty` → Penalty (attacking team keeps possession) |
| > 0 | `stable_win` → FirstPhase |
| −8 to 0 | `wheel` → Scrum |
| ≤ −8 | `defending_dominant_penalty` → Penalty (possession flips to defending team) |

### Ball movement

None.

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| `attacking_dominant_penalty` | attacking front row (ids 1–3), each | `scrumPenaltiesWon++` |
| `attacking_dominant_penalty` | defending front row (ids 1–3), each | `scrumPenaltiesConceded++` |
| `defending_dominant_penalty` | defending front row (ids 1–3), each | `scrumPenaltiesWon++` |
| `defending_dominant_penalty` | attacking front row (ids 1–3), each | `scrumPenaltiesConceded++` |

Team-level scrum count: `stats.scrums[possessionSideAfter]++` for `stable_win`, `attacking_dominant_penalty`, and `defending_dominant_penalty`. `wheel` does not count (the scrum resets, no possession decided).

---

## Lineout

### Player selection

```typescript
hooker       = pickPlayer(attackTeam, 2)                          // hooker (id 2)
attackJumper = attackTeam.players.find(p => p.id === [4,5,7][rng(0,2)])  // random from Left Lock, Right Lock, Openside Flanker
defendJumper = pickPlayer(defendTeam, 4, 5, 6)                    // always id 4 (Left Lock)
```

The attacking jumper is chosen at random from ids 4 (Left Lock), 5 (Right Lock), and 7 (Openside Flanker). The defending jumper is selected via `Array.find`, which always returns id 4.

### Step 1 — Throw quality gate

```
throwScore = hooker.setPiece + rng(1, 100)
if throwScore < 95 → crooked_throw
```

`rng(1, 100)` is used here (not the usual 1–20) to allow fine probability calibration. For the hookers in the current squads (setPiece 88–90), this gives a ~4–6% crooked-throw rate. A hooker with setPiece 75 would fail ~19% of the time; setPiece 60 fails ~34% of the time.

On a crooked throw: possession flips, scrum awarded to the defending team. `attackJumpScore` and `defendJumpScore` are both 0.

### Step 2 — Jump contest

If the throw is good, both jumpers compete in the air using set-piece and agility, plus a random dice roll. The defending jumper's score is subtracted from the attacking jumper's score:

```
attackJumpScore = (setPiece×0.5 + agility×0.5) + rng(1,20)
defendJumpScore = (setPiece×0.5 + agility×0.5) + rng(1,20)
margin = attackJumpScore − defendJumpScore
```

| Margin | Result |
|---|---|
| ≥ −5 | `clean_catch` → OpenPlay |
| −15 to −6 | `scrappy_knock_on` → Scrum (possession flips) |
| < −15 | `steal` → OpenPlay (possession flips) |

The attack team has a significant advantage at the jump; clean catch is the expected outcome unless the defending jumper is markedly superior.

### Ball movement

None.

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| every lineout | hooker | `lineoutThrows++` |
| `clean_catch` | hooker | `lineoutWins++` |
| `clean_catch` | attackJumper | `lineoutCatches++` |
| `steal` | defendJumper | `lineoutSteals++` |

---

## Box Kick

Triggered from a `slow_ball` Breakdown result. The decision to box kick is dynamically gated by `attackTeam.tactics.attackingGamePlan` and pitch location:
- `possession`: Never box kick; retain possession in hand (`OpenPlay`).
- `kicking`: Box kick on slow ball from anywhere outside opposition 22 and outside own deep 22.
- `balanced`: Box kick on slow ball primarily when in own half (outside own 22).

### Player selection

```typescript
scrumHalf  = attackTeam.players.find(p => p.id === 9)
wingerPool = attackTeam.players.filter(p => p.id === 11 || p.id === 14)   // left and right wings
winger     = wingerPool[rng(0, wingerPool.length - 1)]   // random winger
fullback   = defendTeam.players.find(p => p.id === 15)
```

The scrum half always takes the kick. One attacking winger is selected at random to contest the aerial ball. The defending fullback always receives.

**Backfield Defence modifier (`fullbackMod`):** The defending team's `backfieldDefence` tactic determines how much support the fullback has under the high ball. This is applied as a flat bonus to both the fullback's contested score and the uncontested catch score:

| `backfieldDefence` | `fullbackMod` |
|---|---|
| `one_back` | 0 |
| `two_back` | +8 |
| `three_back` | +15 |

### Resolution

**Step 1 — Kick quality gate**

The scrum-half's kicking stat, combined with a random factor, determines the kick's quality. A high score results in a very good, hang-time kick, while a lower score results in a poor kick.

| Threshold | Quality |
|---|---|
| kickScore ≥ 75 | very_good → contested catch |
| kickScore < 75 | poor → uncontested catch |

**Step 2a — Very good kick: contested catch** (ball moves 20m up the pitch)

The attacking winger races to contest the ball, relying on their handling and pace. The defending fullback relies on their handling and positioning. Both scores include a random factor, and the fullback's score is subtracted from the winger's score to determine the margin:

| Margin | Outcome | Next Phase |
|---|---|---|
| ≥ 10 | `attack_retain` — attacker wins contest clearly | OpenPlay (possession kept) |
| 0–9 | `defend_knock_on` — defender fumbles under pressure | Scrum (attacking put-in) |
| < 0 | `defend_catch_contested` — fullback claims cleanly | OpenPlay (possession flips) |

**Step 2b — Poor kick: uncontested catch** (ball moves 30m or 8m, 50-50)

Because the kick lacked hang-time or distance (or is over-hit), the fullback has time to set themselves under the ball. They rely entirely on their handling and positioning, plus a random factor, to catch the ball cleanly. A high score results in a clean catch, while a low score results in a knock-on.

| Threshold | Outcome | Next Phase |
|---|---|---|
| catchScore ≥ 35 | `defend_catch` — fullback collects | OpenPlay (possession flips) |
| catchScore < 35 | `knock_on` — fullback drops | Scrum (attacking put-in) |

### Ball movement

- Very good kick: `ballX += attackDir() × 20`
- Poor kick: `ballX += attackDir() × 30` or `× 8` (50-50, resolved in resolver)

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| every box kick | scrumHalf | `kicksFromHand++`, `kickMetres += res.distance` |

---

## Tactical Kick

Triggered by the 15% kick-or-carry check at the start of `OpenPlay` (Step 0, before any player is selected for a carry).

### Player selection

```typescript
kicker   = attackTeam.players.find(p => p.id === 10 || p.id === 9) ?? attackTeam.players[0]
defender = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam)
```

Fly-half kicks first, scrum-half if fly-half is unavailable. The fullback receives.

### Step 1 — Kick quality and distance

The kicker relies on their kicking stat and a random factor to generate a kick score (`kickScore = kicking + rng(1, 20)`). A good kick (`kickScore >= 25`) travels further (30 to 50 metres), has a 0% chance of going out on the full, and a 75% chance of bouncing into touch. A poor kick (`kickScore < 25`) is shorter (10 to 20 metres), has a 30% chance of going directly out on the full, and a 30% chance of bouncing into touch.

The ball position is clamped to 5–95 after the kick — the ball can never land within 5m of either try line.

The ball's position on the pitch is updated immediately based on the calculated distance.

**Backfield Defence touch reduction:** The defending team's `backfieldDefence` tactic reduces the effective touch probability — more backfield players mean better kick coverage and a lower chance of the kick finding touch:

| `backfieldDefence` | Touch probability reduction |
|---|---|
| `one_back` | 0 |
| `two_back` | −15 |
| `three_back` | −25 |

The reduction is applied as `Math.max(0, touchProbability - touchReduction)` so the probability never goes below zero.

### Step 2 — Out on the full, touch, or caught

The game first rolls a percentage chance against the `outOnTheFullProbability` determined in Step 1.
- **Out on the Full:** If the roll succeeds and the kick was taken from *outside* the kicking team's own 22m line, it goes straight out on the full. The ball is brought all the way back to the original kicking position (no ground gained) and the defending team gets the lineout. (If taken from *inside* the own 22m line, gaining ground directly into touch is legal, so it acts as a Standard Touch).

If the ball does not go out on the full, the game rolls against `touchProbability` to see if the ball bounces into touch.
- **50:22 Rule:** If the kick bounces into touch, was taken from *inside* the kicking team's own half, and lands *inside* the opposition's 22m line, the kicking team is rewarded for a 50:22! The kicking team **retains possession** and gets the throw-in at the resulting lineout.
- **Standard Touch:** In all other bouncing touch scenarios (or direct touch from inside own 22), the distance is gained and the defending team gets the throw-in at the lineout.

If the ball **does not** go into touch at all, the defending fullback catches the ball in the field of play. The phase becomes Open Play, and possession flips to the defending team.

**Backfield return momentum:** When the kick is caught in the field, the defending team's backfield players support the counter-attack. A `breakdownMod.attack` bonus is set to give the receiving team an advantage in the next open play phase:

| `backfieldDefence` | `breakdownMod.attack` on catch |
|---|---|
| `one_back` | 0 (no bonus) |
| `two_back` | +5 |
| `three_back` | +10 |

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| every tactical kick | kicker | `kicksFromHand++`, `kickMetres += res.distance` |

---

## Penalty

### How a penalty arises

Every penalty flows through one MatchEvent — `PENALTY_AWARDED { offence, offender, offendingSide }` — emitted by the resolver that detected the infringement. Its reducer (`applyMatchEvent.ts`) is the single seam that:
- flips `state.possession` to the non-offending side (`offendingSide === 'home' ? 'away' : 'home'`),
- bumps `offender.matchStats.penaltiesConceded++`,
- resets `state.breakdownMod` to `{0,0}`,
- snapshots the cause onto `state.lastPenalty` so the next tick's `PenaltyHandler` (and the manager-facing modal) knows *why* the whistle blew.

The `PenaltyOffence` taxonomy (`src/types/engine.ts`) starts narrow and grows as new offence types are added:

| `offence` | Emitted by | Offender | Trigger |
|---|---|---|---|
| `breakdown_infringement` | `BreakdownEvent` | `supporters[0]` from the attacking team | breakdown margin ≤ −15 (attacker infringes at the ruck) |
| `scrum_infringement` (attacking_dominant_penalty) | `ScrumEvent` | defending hooker | scrum margin > 15 (defending pack collapses) |
| `scrum_infringement` (defending_dominant_penalty) | `ScrumEvent` | attacking hooker | scrum margin ≤ −15 (attacking pack collapses) |
| `high_tackle` | `OpenPlayEvent` / `FirstPhaseEvent` / `KickReturnEvent` | the defender who attempted the tackle | `tackleInfringement(defender)` returns `'high_tackle'`, gated to non-line-break collisions |

`SCRUM_RESOLVED` still owns the scrum-specific front-row stat increments (`scrumPenaltiesWon++` / `scrumPenaltiesConceded++` on every player in the dominated/dominant front row). The follow-up `PENALTY_AWARDED` adds the general `penaltiesConceded++` on the picked hooker; that's why a scrum-penalty hooker now carries both counters (the previous shape only bumped `penaltiesConceded` for breakdown penalties — the new shape is symmetric).

### High tackle

`tackleInfringement(defender)` (`src/engine/resolvers/TackleInfringementResolver.ts`) is a pure helper called from the three carry handlers after `resolveOpenPlay` returns, but only when the carry didn't produce a line break (no completed tackle on a line break). It combines the defender's `tackling` + `discipline` (pivoting around 50) with one `rng(1,100)` roll against `HIGH_TACKLE` (`src/engine/balance/discipline.ts`):

```
pct = max(minPct, basePct
                + (50 − tackling)   × tacklingWeight
                + (50 − discipline) × disciplineWeight)
high_tackle if rng(1,100) ≤ pct
```

Current values: `basePct=8`, `tacklingWeight=0.1`, `disciplineWeight=0.1`, `minPct=2.5`. A 50/50 defender sits at 8% per tackle; a 80/75 elite defender drops to the 2.5% floor; a 30/30 weak defender rises to 12%. Realistic match output: ~0.5–1 high tackles per team per match, scaling slightly with squad quality.

When fired, the carry handler emits `CARRY_RESOLVED` first (so the carrier still earns the metres — advantage law) and then `PENALTY_AWARDED { offence: 'high_tackle', offender: defender, offendingSide: defSide }`, overriding `nextPhase` to `Penalty`. The narration appends a `high_tackle_penalty` `phase_outcome` step after the carry-outcome step, so the commentary reads "dominant tackle on Smith... high! Penalty against the tackler."

### Interactive pause decision

After `resolvePhase()` sets the phase to `Penalty`, `tick()` calls `penaltyHandler.handlePenaltyDecision()` (`src/engine/PenaltyHandler.ts`):

```
if possession !== humanSide OR NOT inOppositionHalf():
  if clockInTheRed AND possession === aiSide AND score[aiSide] > score[humanSide] → auto-select tap_and_kick_dead
  else → auto-select kick_to_touch
if possession === humanSide AND inOppositionHalf() → emit engine:paused → await Promise<PenaltyChoice>
```

`inOppositionHalf()` returns true when `ballX > 50` for home in the first half (attacking right) or `ballX < 50` in the second half (attacking left). The modal is only shown when the managed (human) team has the penalty. `humanSide` is set at match start from the team the player chose; `aiSide` is the other side.

The engine loop is suspended mid-tick at the `await`. It resumes when the `onChoice(choice)` callback (provided in the `engine:paused` payload) is called by `ModalManager`.

### Choice: kick_for_goal

```
tryLine        = attacking try line (100 or 0 depending on half and possession)
distFromPosts  = |ballY − 50| × 0.3 + |ballX − tryLine| × 0.2
anglePenalty   = distFromPosts × 0.3
score          = kicking + composure×0.2 − anglePenalty + rng(1,100)
success        = score ≥ 120
```

Both lateral angle (`ballY`) and distance from the try line (`ballX`) contribute to difficulty. A central kick close to the posts has `distFromPosts ≈ 0`; a wide kick from distance can push `distFromPosts` to 30+, adding ~9 points of penalty.

On success: +3 points, possession flips, ballX resets to 50, → KickOff.
On miss: no score, possession flips, ballX resets to 50, → KickOff.

Stat increments: `kicker.kicksAtGoal++`; on success `kicksMade++`; on miss `kicksMissed++`.

### Choice: kick_to_touch

The ball is moved 20 metres down the pitch towards the opposition try line.

Possession is retained. The lineout is awarded to the kicking team 20 units further up the pitch.

**Future development:** the metres gained from kicking to touch should be variable, driven by the kicker's kicking stat, composure, and pitch location.

### Choice: tap_and_go

No ball movement. Possession is retained. Resumes open play from current position.

### Choice: tap_and_kick_dead *(clock-in-the-red only)*

Available only when `clockInTheRed` is true. The attacking team taps the ball then immediately kicks it into touch, ending the period.

The phase transitions to `Lineout` without setting `penaltyKickToTouchLineout`, so `shouldEndPeriod` returns true and triggers half-time or full-time on the same tick.

Home team: shown as a 4th option in the modal when `clockInTheRed`. Away team AI: auto-selected when `clockInTheRed && score.away > score.home`.

---

## Try Scored

### How a try arises

`TryScored` is set inside the `OpenPlay` handler when a `line_break` result causes `isTryScored()` to return true — i.e. the ball has crossed the attacking try line after `gainMetres` are applied. The same branch runs in `FirstPhase` and `KickReturn` for tries scored from set-piece strike plays and broken-field returns respectively.

### Lateral landing position

When a carry crosses the try line each of the three carry handlers (`OpenPlay`, `FirstPhase`, `KickReturn`) calls `tryLandingY(attackTeam.tactics.attackingStyle)` from `src/engine/resolvers/TryLocationResolver.ts` and emits a `BALL_REPOSITIONED` with the resulting y. Spread is uniform around the midline with a half-spread keyed off `attackingStyle`: `keep_it_tight` ±12, `balanced` ±25, `wide_wide` ±45. The same y then drives `ConversionKickEvent`'s difficulty calculation (which already read `|ballY − 50|`) and the post-try narration band: central (≤ 7), close (≤ 17), wide (≤ 32), corner (otherwise). Phrases live in the `try_location_*` keys of `src/commentary/banks/en-GB/announcements.ts`.

### Resolution

```typescript
scorer = lastEvent.primaryPlayer ?? randomPlayer(attackTeam)
```

The scorer is assigned to the player who carried the ball over the line from the previous phase.

```
score[possession] += 5
stats.tries[possession]++
→ ConversionKick
```

### Stat increments

`scorer.matchStats.tries++`

---

## Conversion Kick

### Player selection

```typescript
kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0]
```

Always the fly-half.

### Resolution

```
distFromPosts = |ballY − 50| × 0.4
anglePenalty  = distFromPosts × 0.3
score         = kicking + composure×0.2 − anglePenalty + rng(1,100)
success       = score ≥ 120
```

Only the lateral angle (`ballY`) affects difficulty for conversions — unlike the penalty kick, distance from the try line is not factored in. A central conversion has `distFromPosts = 0`; a conversion from the touchline adds up to ~6 points of penalty.

On success: +2 points.

After resolution (regardless of outcome): possession flips, ballX resets to 50, → KickOff.

### Stat increments

`kicker.matchStats.kicksAtGoal++`; on success `kicksMade++`; on miss `kicksMissed++`.

---

## Clock In The Red

When `gameMinute` reaches the half target (40 first half, 80 second half), the engine enters the **clock-in-the-red** state. The ball is still live; the half does not end immediately.

### Entering the red

`enterClockInTheRed()` is called on the tick when `!state.clock.clockInTheRed && state.clock.gameMinute >= halfTarget`:

```typescript
state.clock.clockInTheRed = true
// emits GameEvent with a randomly chosen announcement line (3 variants per half)
```

From this point, clock time advances at `timeAdvance / 2` per tick — effectively crawling — so that many more phases can occur before the game ends.

The knock-on threshold in all carry phases is raised from 85 to `Math.min(99, 85 + Math.round(Math.max(0, 85 − handling) × 0.4))`, giving approximately a 40% increase in knock-on probability for players with handling below 85.

### Ending the period: `shouldEndPeriod(prevPhase)`

The period ends only when the ball goes dead. `shouldEndPeriod` returns `true` on these transitions:

| Condition | Description |
|---|---|
| `state.phase === Scrum && prevPhase !== Scrum` | Knock-on or crooked lineout throw (not a wheel reset — those have prevPhase === Scrum) |
| `state.phase === Lineout && !state.clock.penaltyKickToTouchLineout` | Ball in touch (except after a penalty kick-to-touch — see exception below) |
| `state.phase === KickOff && prevPhase === ConversionKick` | Try scored and conversion taken |
| `state.phase === KickOff && prevPhase === Penalty` | Penalty goal kick attempt (success or miss) |

**Penalty kick-to-touch exception:** When the home team chooses `kick_to_touch` on a penalty during the red, `state.clock.penaltyKickToTouchLineout` is set to `true`. `shouldEndPeriod` detects this, clears the flag, and returns `false` — the subsequent lineout does not end the period. This allows the attacking team to take the lineout and keep playing.

### Triggering half-time / full-time

When `wasInRed && shouldEndPeriod(previousPhase)`:
- **First half:** calls `triggerHalfTime()`, which resets `state.clock.clockInTheRed = false` and `state.clock.penaltyKickToTouchLineout = false` for the second half.
- **Second half:** calls `endMatch()`.

---

## Half-Time

Triggered by `triggerHalfTime()` inside `tick()` after `shouldEndPeriod()` returns true during the first-half red.

```typescript
state.clock.halfTimeDone              = true
state.clock.clockInTheRed             = false
state.clock.penaltyKickToTouchLineout = false
state.possession                       = complement(state.engine.firstHalfKicker)
state.ball.x                           = 50
state.ball.y                           = 50
state.phase                            = KickOff
```

All mutations apply first; **then** a single `HalfTime` `COMMENTARY_LOGGED` is dispatched and the bus emits `engine:event` followed by one `engine:stateChange`. This ordering ensures UI subscribers (`PitchStrip` ball marker + attack arrow, `Scoreboard` clock) render the post-HT frame in one paint with no mid-transition glitch.

The 2H kicker is set explicitly from `state.engine.firstHalfKicker` (recorded at coin toss) — not from the dead-ball possession — so the rugby rule "the team that didn't kick off in the first half kicks off the second" holds regardless of who had possession when the period ended. The `halfTimeDone = true` flag is what reverses the output of `attackDir()`, `isTryScored()`, `inOpposition22()`, `inOppositionHalf()`, `inOwn22()`, and `inOwnHalf()` for the rest of the match.

---

## Full-Time

Triggered by `endMatch()` inside `tick()` after `shouldEndPeriod()` returns true during the second-half red.

```typescript
state.engine.isRunning = false
```

Forces phase to `FullTime`. Emits `engine:event`, `engine:stateChange`, and `engine:finished`. No further ticks are scheduled.

---

## Substitutions

Triggered by the UI via `eventBus.emit('ui:substitution', { benchSquadNum, fieldSquadNum })`. The engine listens and calls `substitute('home', benchSquadNum, fieldSquadNum)` immediately (mid-tick if in progress).

```typescript
sub.id = off.id     // sub inherits the field jersey position (id) of the player coming off
team.players[fieldIdx] = sub
team.bench.splice(benchIdx, 1)
team.substitutedOff.push(off)
```

The substitute takes the squad position (`id`) of the player they replace, so they slot into the same formation role and will be selected by phase handlers using that id. A commentary event (`MatchPhase.Substitution`) is emitted immediately so the change appears in the feed.

No rating adjustment is applied on substitution. The incoming player's `formModifier` and `fatiguePct` are as initialised at match start — they are not reset on sub.

**Scope:** Only the managed (human) team can substitute via the UI. The AI-controlled team does not substitute.

---

## Tactical Commentary

When a tactic directly influences a key outcome, the phase handler pushes a `{ kind: 'tactic_note', cause, chancePct, params? }` step into the `NarrationDescriptor` it returns. The renderer rolls `commentaryChance(chancePct)` (commentary stream) and, on pass, picks a line from `getTacticNoteLines(cause, params)` in `src/commentary/banks/en-GB/tacticNotes.ts`. Notes fire symmetrically — whichever team's tactic produced the outcome, the corresponding note may trigger. The note text names the relevant team via the `params: { attackTeamName, defendTeamName }` so it reads correctly regardless of which side the player is managing.

Notes cover both the upside and the downside of a tactic choice — a player should see their good decisions rewarded *and* their poor decisions highlighted.

| Handler | Trigger | Cause | Chance |
|---|---|---|---|
| `BreakdownEvent` | `pick_and_drive` + `clean_ball` | `breakdown_pick_and_drive_clean` | 30% |
| `BreakdownEvent` | `shadow` + `clean_ball` conceded | `breakdown_shadow_clean` | 30% |
| `BreakdownEvent` | `jackal` + `clean_ball` conceded | `breakdown_jackal_clean` | 25% |
| `BreakdownEvent` | `wide_play` + `slow_ball` | `breakdown_wide_play_slow` | 30% |
| `BreakdownEvent` | `counter_ruck` + `slow_ball` | `breakdown_counter_ruck_slow` | 30% |
| `BreakdownEvent` | `jackal` + `turnover` | `breakdown_jackal_turnover` | 35% |
| `BreakdownEvent` | `counter_ruck` + `turnover` | `breakdown_counter_ruck_turnover` | 30% |
| `BreakdownEvent` | `wide_play` + `turnover` | `breakdown_wide_play_turnover` | 25% |
| `BreakdownEvent` | `pick_and_drive` + `penalty_defending` | `breakdown_pick_and_drive_penalty` | 25% |
| `BreakdownEvent` | `wide_play` + `penalty_defending` | `breakdown_wide_play_penalty` | 25% |
| `BreakdownEvent` | `jackal` + `penalty_defending` | `breakdown_jackal_penalty` | 25% |
| `OpenPlayEvent` / `FirstPhaseEvent` / `KickReturnEvent` | `line_break` + `two_back`/`three_back` defending | `line_break_backfield_thin` | 30% |
| `TacticalKickEvent` | kick caught + `two_back`/`three_back` | `kick_caught_return_bonus` | 35% |
| `TacticalKickEvent` | `fifty_twenty_two` + `one_back` | `fifty_twenty_two_one_back` | 25% |
| `BoxKickEvent` | `defend_catch` + `two_back`/`three_back` | `boxkick_backfield_caught` | 30% |

Structural pass commentary (`out_the_back`, `crash_ball`) is expressed as a separate `phase_outcome` step pushed onto `descriptor.steps[]` before the outcome step. The renderer joins them with a single space, reproducing the prefix+outcome composition the previous inline-string assembly produced.

---

## Commentary Engine

Commentary text is produced by `src/commentary/CommentaryRenderer.ts` from the structured `NarrationDescriptor` carried on every `GameEvent`. The engine never produces text — phase handlers, `PhaseRouter`, and inline orchestrator sites (`ClockController`, `MatchCoordinator`, `PenaltyHandler`) populate `narration.steps[]` only. `GameEvent` has no `commentary` field. The text renderer runs in the UI subscriber `src/ui/CommentaryFeed.ts`, which calls `renderNarration(event)` once per `engine:event` and writes the rendered string into the DOM. Silent simulation, replay narration, localisation, and analytics consumers all attach to `engine:event` and decide for themselves whether to render text — the engine doesn't care.

### `NarrationDescriptor` and steps

`src/types/narration.ts` defines `NarrationDescriptor { steps: NarrationStep[] }`. Each `NarrationStep` is one of:

- `{ kind: 'phase_outcome', phase, key, primary?, secondary? }` — the dominant variant. `key` is a `PhaseOutcomeKey` (e.g. `knock_on`, `line_break`, `crash_ball`, `clean_ball`, `wheel`, `defend_catch_contested`, `fifty_twenty_two`, `tap_and_go`, …).
- `{ kind: 'tactic_note', cause, chancePct, params? }` — flavour text gated by a `pickRandom`-driven chance roll. `cause` is a `TacticNoteCause` (e.g. `line_break_backfield_thin`, `breakdown_jackal_turnover`, `boxkick_backfield_caught`).
- `{ kind: 'announcement', key, primary?, secondary?, params? }` — non-phase commentary (substitutions, fatigue, clock-in-red, half-time, full-time, set-piece-award).

Composite commentary (e.g. PhasePlay's "out the back" prefix + outcome + tactic note) is expressed as multiple steps in order; the renderer joins their rendered strings with a single space.

### Renderer (`src/commentary/CommentaryRenderer.ts`)

`renderNarration(event)` walks `event.narration.steps[]` and renders each step:
- `phase_outcome` → look up `PHASE_BANKS[step.phase][step.key]`, pick a template via `pickRandom` (commentary stream), interpolate `{primary}`/`{secondary}`/`{side}`/`{defside}` tokens.
- `tactic_note` → roll `commentaryChance(step.chancePct)`. On pass, look up lines via `getTacticNoteLines(cause, params)` and `pickRandom` one.
- `announcement` → look up the template via `getAnnouncementTemplate(key, params)`, interpolate.

The renderer takes only `sideName` / `defSideName` / `narration` from the event — `GameEvent` satisfies the `RenderableEvent` interface naturally.

### Template banks (`src/commentary/banks/en-GB/`)

- `phases.ts` — `PHASE_BANKS: Partial<Record<MatchPhase, Partial<Record<PhaseOutcomeKey, readonly string[]>>>>`. Copied verbatim from the previous `CommentaryEngine.TEMPLATES` map.
- `tacticNotes.ts` — `getTacticNoteLines(cause, params)` function. Each `cause` returns the string array from the old inline `tacticNote(...)` calls.
- `announcements.ts` — `getAnnouncementTemplate(key, params)` function. Used by inline orchestrators for substitution lines, fatigue lines, clock-in-red warnings, half-time and full-time announcements, and set-piece awards.

### Template variables

| Token | Resolved value |
|---|---|
| `{primary}` | step's `primary` formatted as `"Surname (#N)"`, or `"the player"` if absent |
| `{secondary}` | step's `secondary` formatted as `"Surname (#N)"`, or `"the defender"` if absent |
| `{side}` | `event.sideName` (attacking team name) |
| `{defside}` | `event.defSideName` (defending team name), or `"the opposition"` if absent |

### Plain-text contract

The renderer always returns a plain-text string. `CommentaryFeed.ts` post-processes it to:
1. Wrap all `"Name (#N)"` player mentions in team-coloured `<span>` elements (scans all 30 squad members)
2. Wrap team name strings ("Gloucester", "Bristol") in their respective team-coloured `<span>` elements

If the renderer ever emits HTML, the span injection will double-encode or break. Tactic-note lines in `tacticNotes.ts` embed team names via template literals (from `params.attackTeamName` / `params.defendTeamName`) and go through the same `CommentaryFeed` colourisation pass.

---

## Known Gaps

| Gap | Location | Effect |
|---|---|---|
| kicking, positioning not degraded by fatigue | StaminaSystem | These stats remain at full base value for the entire 80 minutes |
| pre-match form pins (`WWLWD` / `WWWLW`) are hardcoded | `PreMatchScreen.ts` | Needs a per-team match-result history store; only the player team's per-round scores are persisted today (`FixtureListScreen`) |
| pre-match stake row (`LEAGUE 2nd · 4 pts`, `H2H 1W · 2L last 3`, `ODDS +3.5`) is hardcoded | `PreMatchScreen.ts` | Needs a season table and a fixture/odds system |
| pre-match kick-off time (`20:00`) is hardcoded | `PreMatchScreen.ts` | Needs scheduled match times |
