# Match Engine Reference

Documents the match engine — the per-match simulation: the tick loop, every phase, all resolver formulas, fatigue, commentary, and known gaps. Intended as the authoritative reference for anyone modifying match-engine behaviour.

For the season-scope sibling (`GameCoordinator`, `applySeasonEvent`, fixtures, league standings, save format) see **`docs/game-engine.md`**.

## Maintaining this doc

After any change to match-engine code, update this file in the same commit. Match-engine code is everything under `src/engine/`, plus the engine-facing types in `src/types/engine.ts` and `src/types/matchEvent.ts`. The commentary renderer (`src/commentary/`) is also covered here. Season code (`src/game/`) lives in `docs/game-engine.md`.

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
| `FatigueAccumulator.ts` | Owns the per-tick fatigue accumulator; drains in `FATIGUE_SCALING.computeIntervalMinutes` increments, computes home-then-away fatigue via `StaminaSystem.computeFatigue`, applies `FATIGUE_APPLIED` every tick, and **buffers** players crossing the tiredness threshold. The home-then-away order is determinism-critical (both calls consume the outcome RNG stream). The buffered commentary is emitted by `flush()`, which `MatchCoordinator` calls at a natural break in play (so a "tiring" line never interrupts open play); players who have left the field by then are dropped. `silent` suppresses the streamer enqueue at flush (the `FATIGUE_APPLIED` mutations + `COMMENTARY_LOGGED` still apply). |
| `Entry22Tracker.ts` | Pure `detectEntry22Changes(state)` — clears the non-possessor's active flag and registers the possessor's entry when in the opposition 22. |
| `PhaseRouter.ts` | `PHASE_HANDLERS` map, `resolvePhase(state, sm, kickOffStrategy)`, and the `draftEvent(state, phase)` template builder. |
| `PenaltyHandler.ts` | Penalty-decision modal pause and outcome application (`kick_for_goal`, `kick_to_touch`, `tap_and_kick_dead`, `tap_and_go`), plus the kick-off strategy modal (`awaitKickOffStrategy`, `handlePenaltyDecision`). Enriches the `PenaltyContext` it sends to the modal from `state.lastPenalty` (offence + offender + offending side), populated by the `PENALTY_AWARDED` reducer. **`CardHandler` runs before this** for every penalty — if it triggers a TMO review or a forced team-22 yellow, the penalty modal is deferred until the card sequence resolves. |
| `CardHandler.ts` | Owns the card pipeline: `evaluateNewPenalty()` (called by `MatchCoordinator.tick` after PENALTY_AWARDED enters Penalty — rolls TMO trigger / team-22 threshold, emits CARD_ISSUED), `advanceTmoReview()` (drives the 3-tick narrative when phase is `TmoReview`), `scanSinBinReturns()` (per-tick expiry check, fires SIN_BIN_RETURNED / RED_20_EXPIRED). Silent mode collapses the TMO narrative to a single inline application — RNG order is preserved so silent and live match outcomes are identical. Full breakdown in [Cards (Yellow / Red 20 / Red full)](#cards-yellow--red-20--red-full). |
| `FieldPosition.ts` | Pure helpers over `MatchState` that factor in `state.clock.halfTimeDone`: `attackDir`, `isTryScored`, `isTryScoredAt`, `inOpposition22`, `inOpposition22At`, `inOppositionHalf`, `inOwn22`, `inOwn22For` (any side), `inOwnHalf`. The `*At(ballX, possession, halfTimeDone)` variants keep a scalar signature — used for projecting not-yet-applied positions. Plus the card-availability filter family: `offFieldIds(state, side)`, `onFieldPlayers(team, state, side)`, `availableForwards`, `availableBacks` — used by every resolver and selector to exclude sin-binned / sent-off players from the contest. |
| `HomeAdvantage.ts` | One helper, `homeEdge(state, mod)` → `{ attack, defend }`. Splits a flat per-channel modifier (from `HOME_ADVANTAGE` in balance) into the attacker/defender pair the carry and breakdown resolvers expect, based on `state.possession`. See [Home Advantage](#home-advantage). |
| `AITacticalDirector.ts` | Pure (no-RNG) module owned by `MatchCoordinator`. Called once per tick before `resolvePhase()` to override AI-side `team.tactics` based on score gap + minutes remaining (7-dimension intent) plus a separate `pickEffort` that sets `intensity`/`discipline` from the live scoreboard + derby flag. Tuning in `balance/aiDirector.ts`; full breakdown in [Tactics: who picks what](#tactics-who-picks-what). |
| `AISubstitutionDirector.ts` | Pure (no-RNG) module owned by `MatchCoordinator`. Called once per tick after `AITacticalDirector`. From `AI_SUBS_VALUES.earliestSubMinute` (50') onwards, identifies AI starters at or below `fatigueThreshold` (60%) and queues a like-for-like bench replacement — exact position match first, then forward/back group. In live matches, subs are queued and flushed at the next natural break; in silent fixtures, subs apply immediately. Tuning in `balance/aiSubs.ts`; full breakdown in [Substitutions](#substitutions). |
| `applyMatchEvent.ts` | **The single mutation boundary.** A reducer over the `MatchEvent` discriminated union (`src/types/matchEvent.ts`). The only function permitted to write to `MatchState` or any `Player` field. |
| `invariants.ts` | `assertInvariants(state)` — runtime tripwire called after every `applyMatchEvent` mutation. Checks live numeric/structural ranges the type system can't express (score ≥ 0 + integer, ball in `[0,100]`, every player's fatigue/rating/currentStats in range). Always-on; the cost is O(matchday squad) per mutation. |
| `StaminaSystem.ts` | Pure `computeFatigue(team, elapsedMinutes)` — returns `{updates, newlyTired}` without writing to players; `FatigueAccumulator` emits the resulting `FATIGUE_APPLIED` events. |
| `RatingEngine.ts` | Pure `computeRating(player)` — called by `applyMatchEvent` when a `RATINGS_RECALCULATED` event is reduced. |
| `balance/` | **Single source of truth for every gameplay tuning number.** One file per concern (`scoring`, `kicking`, `kickDecision`, `openPlay`, `breakdown`, `scrum`, `lineout`, `fatigue`, `rating`, `tactics`, `clock`, `commentary`, `discipline`, `homeAdvantage`, `injuries`, `aiDirector`, `aiSubs`, `season`) re-exported through `balance/index.ts`. (`career` + `transfers` also live here but are consumed only by the game engine — see `docs/game-engine.md`.) Resolvers, events, and systems import from here; no tuning literals live elsewhere. |

All emit UI side-effects through the shared `src/utils/eventBus.ts` singleton; event IDs come from the monotonic counter in `src/engine/eventId.ts`. The current phase lives solely on `state.phase`; all transitions go through the `PHASE_CHANGED` `MatchEvent` (no separate state-machine class). `PhaseContext` (`src/engine/events/types.ts`) is the minimal closure passed to handlers — `{ state, attackTeam, defendTeam, randomPlayer, pickPlayer, draftEvent, kickOffStrategy }`. Field-position helpers (`attackDir`, `inOwn22`, `isTryScoredAt`, …) are pure functions in `FieldPosition.ts` that handlers import directly with `state`.

### Mutation boundary: `MatchEvent` and `applyMatchEvent`

All writes to `MatchState`, `player.matchStats`, `player.fatiguePct`, `player.currentStats`, and `player.rating` flow through one function: `applyMatchEvent(state, event)` in `src/engine/applyMatchEvent.ts`. The `MatchEvent` discriminated union (`src/types/matchEvent.ts`) defines every kind of mutation the engine performs — domain events like `TRY_SCORED`, `KNOCK_ON`, `CARRY_RESOLVED`, `INTERCEPTION`, `LINEOUT_RESOLVED`, `SCRUM_RESOLVED`, `MAUL_RESOLVED`, `BREAKDOWN_HIT`, `TURNOVER_AT_BREAKDOWN`, `PENALTY_AWARDED`, `CARD_ISSUED`, `SIN_BIN_RETURNED`, `RED_20_EXPIRED`, `TEAM_PENALTY_22_RECORDED`, `TEAM_22_WARNING_ISSUED`, `TMO_REVIEW_STARTED`/`TICK_ADVANCED`/`RESOLVED`, `OFFLOAD_ATTEMPTED`/`COMPLETED`, `FIFTY_22_ATTEMPTED`, `PLAYER_INJURED_IN_MATCH`, `TEAM_TALK_APPLIED`, `POSITION_SWAP` (mid-match positional switch — two on-field players, keyed by their stable `squadNumber`, trade their matchday slot `id` + field coords without consuming a substitution; each player's out-of-position familiarity scaling is recomputed for the slot they now fill via the `slotFamiliarity` ratio, mirroring the sub path, while their natural `position` is left intact; applied immediately via the `ui:positionSwap` bus event), plus structural events like `BALL_REPOSITIONED`, `POSSESSION_SWAPPED`, `PHASE_CHANGED`, `COMMENTARY_LOGGED`, `RATINGS_RECALCULATED`. Phase handlers in `src/engine/events/` are read-only over state: they read, compute, and return `PhaseResult { ..., events: MatchEvent[] }`. `PhaseRouter.resolvePhase()` applies the queue through `applyMatchEvent` before composing the outgoing `GameEvent`. Orchestrators (`MatchCoordinator`, `ClockController`, `PenaltyHandler`, `CardHandler`) apply events directly through `applyMatchEvent` for non-phase mutations (clock, half-time, penalty choice, cards, sub flow, tactics). UI bus emissions (`eventBus.emit('engine:event'|'engine:stateChange'|…)`) are pure side effects that fire alongside, and are **not** part of the `MatchEvent` boundary.

`applyMatchEvent` uses a `default: const _: never = event;` exhaustiveness check, so adding a new `MatchEvent` variant without a handling branch is a compile error.

**Runtime invariants.** After every event is applied, `assertInvariants(state)` (`src/engine/invariants.ts`) verifies the live numeric/structural ranges that the type system can't express: `score.home/away ≥ 0` and integer, `possession ∈ {'home','away'}`, `phase ∈ MatchPhase`, `ball.x/y ∈ [0,100]`, `clock.gameMinute ≥ 0`, and for every player on either roster (starters, bench, substituted-off) `fatiguePct ∈ [0,100]`, `rating ∈ [0,10]`, every `currentStats.X ∈ [1,100]`. A violation throws with the offending field, so the failure surfaces at the mutation that caused it rather than at some downstream render or save-load step. Cost is O(matchday squad) per mutation; runs in all environments — it's a tripwire for engine bugs, not defensive runtime handling.

**Sibling seam (season scope).** A parallel mutation boundary, `applySeasonEvent` in `src/game/applySeasonEvent.ts`, owns season state (calendar, fixtures, results, standings) and follows the same single-reducer / exhaustive-`never` contract. The match engine and the game engine only meet at `src/game/simulateFixture.ts`, which spawns silent `MatchCoordinator` instances to play out the non-player fixtures of a round. Full breakdown in **`docs/game-engine.md`**.

### Balance constants

Every number listed in the resolver formulas, tactic modifier tables, fatigue tiers, and rating weights below is defined under `src/engine/balance/` — one file per concern (`scoring`, `kicking`, `kickDecision`, `openPlay`, `breakdown`, `scrum`, `lineout`, `fatigue`, `rating`, `tactics`, `clock`, `commentary`, `discipline`, `homeAdvantage`, `injuries`, `aiDirector`, `aiSubs`, `season`), re-exported through `balance/index.ts`. (`career` + `transfers` also live in the same directory but are consumed only by the game engine.) The doc below shows the current values; the `balance/` directory is the canonical place to read or change them. `scoring.ts` holds the laws-of-the-game point values (try 5, conversion 2, penalty goal 3); `commentary.ts` also holds `COMMENTARY_BUFFER_CAP` (the soft cap on `state.events`).

### Tactics: who picks what

`TeamTactics` (`src/types/team.ts`) is a nine-dimension object: `attackingGamePlan`, `attackingStyle`, `attackingBreakdown`, `defendingBreakdown`, `backfieldDefence`, `defensiveLine`, `offloadStrategy`, `intensity`, `discipline`. Every resolver reads it from `attackTeam.tactics.X` / `defendTeam.tactics.X` directly — no separate "intent" layer.

- **`intensity`** (`high` / `balanced` / `light`) — a team-wide effort lever. `high` drains every player's fatigue faster (×1.08 in `StaminaSystem`, compounding with the forward/back multipliers) in exchange for a contest edge: `intensityContestMod` (±3 to breakdown ars/dts) plus a flat shove bonus at the set pieces (`intensityScrumMod` / `intensityMaulMod`, ±12 on the larger scrum/maul margin scale). `light` drains slower (×0.94) but cedes all of that, to protect condition when the game is decided.
- **`discipline`** (`risky` / `balanced` / `cautious`) — risk appetite at the contest. `risky` adds a turnover edge (`disciplineContestMod` ±4 to breakdown ars/dts) at the cost of higher penalty-concession rates (`disciplinePenaltyMod` ±3pp on the breakdown penalty rolls, `disciplineHighTackleMod` ±1.5pp on the high-tackle rate). At the set pieces it's the same gamble by a different mechanism: `disciplineScrumVarianceMult` (×1.4 / ×0.6) fattens/narrows the scrum margin tails (risky wins more dominant penalties **and** concedes more on its own ball), and `disciplineMaulCollapseMod` (±10pp) drives the defender's cynical-collapse rate (risky stops more drives illegally, conceding more penalties/yellows). `cautious` is the reverse throughout. Card risk is **emergent** — more penalties feed the existing TMO / team-22 path with no separate card multiplier. (Not to be confused with the per-player `discipline` stat on `PlayerStats`.)

At match init (`MatchCoordinator.initMatchState`):
- **Human side** uses `playerTactics` if supplied (the object passed from `PreMatchScreen.onStart`), otherwise falls back to the team's `suggestedTactics`.
- **AI side** uses the team's `suggestedTactics` from `RawTeamInput` — authored per club in `src/data/team-*.json`. Each side gets its own identity at kick-off (Bath two-back fullback cover, Saracens jackal-heavy defence, etc.) rather than a single league-wide `DEFAULT_TACTICS`.
- If neither input is present (e.g. legacy fixture data without `suggestedTactics`), `buildTeam` falls through to `DEFAULT_TACTICS`.

Mid-match the human can swap any dimension via the tactics modal (`ui:tacticsChange` bus event → `TACTICS_UPDATED` `MatchEvent`). The AI has no UI; in-match adjustments are written by `AITacticalDirector` (see below). Both paths share the same mutation seam — `applyMatchEvent` is the only writer of `team.tactics`.

**`AITacticalDirector`** (`src/engine/AITacticalDirector.ts`) is a pure (no RNG) module owned by `MatchCoordinator`. It's instantiated alongside `clock` / `fatigue` and called once per tick — `director.evaluate()` runs *before* `resolvePhase()`, so a tactic change applies to the same tick that triggered it. The director never proposes tactics for the human side; in silent (fully-headless) fixtures the constructor is given `humanSide: undefined` so both teams adapt. Tuning lives in `src/engine/balance/aiDirector.ts`: `scoreGapTrigger` (8 points) and `minutesRemainingTrigger` (15 minutes) gate the flip. Two named intent bundles overlay the team's baseline `suggestedTactics`: `AI_INTENT_CHASING` (possession + wide_wide + minimal_ruck + one_back — trailing late) and `AI_INTENT_PROTECTING` (kicking + keep_it_tight + commit_numbers + shadow + two_back — leading late). Outside the late-game window or within the score-gap dead band, the director reverts each side to its captured baseline.

`evaluate()` now returns a `TacticsChangeSignal | null` (exported from the module). A signal is emitted whenever the AI side transitions between intent categories (`baseline` | `chasing` | `protecting`). `MatchCoordinator.tickBody()` converts a non-null signal into a `GameEvent` with an `announcement` step (keys `ai_tactics_chasing`, `ai_tactics_protecting`, `ai_tactics_revert`) carrying `params.teamName`, `params.minutesLeft`, and `params.scoreGap` so the commentary line names the team and remaining time. Silent fixtures ignore the signal (no commentary rendered).

**Effort dimensions (`intensity` / `discipline`) are decided separately** by `pickEffort(side)` and merged over the 7-dimension intent (`{ ...pickIntent(side), ...pickEffort(side) }`), so they track the live scoreboard rather than club identity. Tuning in `AI_EFFORT_VALUES`: inside the final `lateGameMinutesRemaining` (20) minutes, a side that is behind by any margin flips to `{ high, risky }` (empty the tank), and a side leading by `largeLeadGap` (15) or more flips to `{ light, cautious }` (ease off, protect players). Otherwise, a derby (`state.engine.isDerby`) before `derbyEarlyMinute` (15) opens at `{ high, balanced }` to set the tone; failing all of that, `{ balanced, balanced }`. `pickEffort` is RNG-free (reads clock, score, and the derby flag). `tacticsEqual` compares all nine dimensions so an effort-only change still emits `TACTICS_UPDATED`.

### `MatchState` shape

`MatchState` (`src/types/match.ts`) groups three clusters into nested sub-objects; everything else is top-level:

```ts
state.clock  = { gameMinute, halfTimeDone, clockInTheRed, penaltyKickToTouchLineout }
state.ball   = { x, y }                              // renamed from ballX/ballY
state.engine = { isRunning, tickDelayMs, seed, firstHalfKicker, humanSide, humanCaptainRosterId? }
state.cards  = { sinBin, sentOff, teamPenalty22, teamWarned22 }   // per-side arrays + counters
state.tmoReview? = { step: 1|2|3, outcome, offender, offendingSide }   // mid-review only

// top-level: phase, possession, score, events, breakdownMod, kickReturnCarrier,
//            lastPenalty?, homeTeam, awayTeam, stats
```

`state.lastPenalty?: { offence, offender, offendingSide, preFlipPossession, gameMinute }` is set by the `PENALTY_AWARDED` reducer. `PenaltyHandler` reads `offence` + `offender` + `offendingSide` to enrich the `PenaltyContext` it sends to the modal; `CardHandler` reads `preFlipPossession` to compute `wasDefending` for the team-22 rule (snapshot of `state.possession` *before* PENALTY_AWARDED flipped it). Overwritten on every new award; never cleared.

`state.cards` is the card-system state cluster — see [Cards (Yellow / Red 20 / Red full)](#cards-yellow--red-20--red-full):
- `sinBin: { home, away }` — `SinBinEntry[]` for each side; entries carry `{ player, kind: 'yellow' | 'red_20', returnMinute }`. Resolvers filter `team.players` against these via `onFieldPlayers`.
- `sentOff: { home, away }` — permanently off (red_20 with no replacement available, or future red_full).
- `teamPenalty22: { home, away }` — cumulative count of defensive penalties given away in own 22; never resets within a match.
- `teamWarned22: { home, away }` — one-shot flag for the ref's captain warning at threshold 3.

`state.tmoReview` is the in-progress TMO review (only defined while phase === `TmoReview`). `outcome` is pre-rolled at TMO entry; the 3 narrative ticks are deterministic replay. Cleared by TMO_REVIEW_RESOLVED on step 3.

Snapshot DTOs intentionally **stay scalar** — they are frozen log rows, not live state:
- `GameEvent.ballX` / `GameEvent.ballY` (entries in `state.events[]`)
- `GameEvent.movements` — optional `ReadonlyArray<{ x; y }>`, the in-phase ball path (a frozen scalar snapshot, same lifetime rule as `ballX`/`ballY`; not range-checked by `assertInvariants`). Captured in `resolvePhase` by recording a keyframe whenever an applied event actually changed the ball position (observed, not matched by event type — any ball-moving event is captured automatically), present only when the phase moved the ball more than once. **Live only:** skipped for `silent` (headless/AI) fixtures, which nothing renders. Last entry equals `ballX`/`ballY`. Consumed by `PitchView` to animate the ball leg-by-leg.
- `PenaltyContext.ballX` / `ballY` / `clockInTheRed` / `halfTimeDone` (crosses the event-bus boundary to `ModalManager`)
- `MatchEvent` payload fields (`x`, `y`, `delta`, `value`) stay scalar — only the write *targets* in `applyMatchEvent` are nested
- `isTryScoredAt(ballX, possession, halfTimeDone)` and `inOpposition22At(ballX, possession, halfTimeDone)` keep scalar signatures — called on projected (not-yet-applied) positions

### UI Event Bus Contract

The engine emits the following UI-bound events through `src/utils/eventBus.ts`. UI modules subscribe to react; the engine never imports any UI module.

| Event | Payload | Subscribers |
|---|---|---|
| `engine:initialized` | `{}` | Scoreboard, PitchStrip, PitchView, StatsPanel, CommentaryFeed — reset per-match caches |
| `engine:stateChange` | `{ state: MatchState; display: DisplaySnapshot }` | Scoreboard + PitchStrip + PitchView (2D pitch ball/territory/cards) read `display` (the world frame, snapshot at event-production time); StatsPanel reads live `state` (per-player tables); CommentaryFeed (one-shot for team-colour cache) |
| `engine:event` | `{ event: GameEvent }` | CommentaryFeed (renders narration); PitchView (zone flash on try/penalty/card; animates the ball through `event.movements` leg-by-leg on its own speed-derived timer, decoupled from the commentary line cadence; open-field kick phases — `KickOff`/`BoxKick`/`TacticalKick`/`DropOut22` — lob the ball to the landing via a WAAPI scale-apex flight; PitchPlayers renders involved-player dots from `event.primaryPlayer`/`secondaryPlayer` + narration-step `primary`/`secondary` and full scrum/lineout packs, choreographed in the UI since the engine has no per-player coords) |
| `engine:paused` | `{ payload: ModalPayload }` | ModalManager (penalty_choice / kickoff_choice / forced_substitution_choice — red_20-expired sub picker — / tactics / sub modal), SimController (button gating) |
| `engine:resumed` | `{}` | ModalManager, SimController |
| `engine:autoPaused` | `{ reason: 'half_time' }` | SimController (re-enables Play, disables Pause). Fires once per match after the half-time line drains so the user has to press Play to start the second half. Skipped in silent mode. |
| `engine:finished` | `{ state: MatchState }` | `main.ts` (shows match-result overlay) |
| `engine:error` | `{ error: Error; context?: string }` | `main.ts` (renders a copy-pastable crash report; also caught by `simulateFixture` on the headless-fixture path). Fired from the `MatchCoordinator` tick's top-level `catch` block — surfaces unhandled throws that would otherwise be silently swallowed by `setTimeout`. |

**Tick ordering:** within a single tick, `engine:event` fires **before** `engine:stateChange`. UI subscribers that depend on cached state from the prior tick will always have a valid cache by the time an event arrives.

**Subscription lifetime:** `eventBus.on()` returns an unsubscribe function. UI subscriptions registered at startup are intentionally permanent for the page lifetime. One-shots (e.g. `CommentaryFeed` caching team colours on first `engine:stateChange`) call the returned unsub explicitly.

**Display snapshot.** `engine:stateChange` carries a `DisplaySnapshot` (`src/engine/displaySnapshot.ts`, type in `src/types/match.ts`) alongside the live `MatchState`. The snapshot is the "world frame" — `gameMinute`, `halfTimeDone`, `clockInTheRed`, `phase`, `possession`, `score`, flat `ballX`/`ballY`, the scoreboard card pips, plus the team-stats summary block (`stats`) and three player-derived totals (`aggregates`: run metres / kick metres / penalties conceded) — captured by `CommentaryStreamer.enqueue` at event-**production** time (not flush time). `Scoreboard`, `PitchStrip`, and `StatsPanel`'s summary rows read `display`, so each line's visible frame matches the line being narrated rather than the live (ahead-of-commentary) state — critical once the producer runs ahead (step 4). Per-player data (ratings, fatigue, per-player matchStats) is deliberately **not** snapshot (squad-sized allocation per beat) — `StatsPanel`'s player list + detail table read live `state`, accepting a small lead. Silent fixtures bypass the streamer entirely, so no snapshot is built and determinism is unaffected. **Phase override:** `GameEvent.displayPhase` (optional) allows a beat to advertise a different phase for the snapshot than what `state.phase` reflects at enqueue time. `CommentaryStreamer.enqueue` applies it after `buildDisplaySnapshot`. Currently used only by carry-to-try beats — see "Score-context commentary" in the Try Scored section.

**Presenter pacing & run-ahead (step 4).** `CommentaryStreamer` is the match presenter — a beat buffer (`Beat = { event, display }`). The **paced unit is the narration LINE, not the beat**: after draining a beat the presenter waits `lineGap × (steps in that beat)` before the next, where `lineGap = tickDelayMs × COMMENTARY_PACING.lineGapFraction` (`balance/commentary.ts`; default 0.46). `CommentaryFeed`'s multi-step reveal (try build-up, TMO, direct cards) staggers the lines *within* a multi-step beat at the same `lineGap` (refreshed on `ui:speedChange`), so the next beat lands exactly one `lineGap` after the last line of the current one — a quiet single-line beat and a five-line try sequence read out at one steady line rhythm rather than the old trickle-then-burst (where the streamer paced *beats* evenly but a beat was sometimes 1 line and sometimes 5, so the line cadence — the thing actually seen — wasn't paced at all). The gap is enforced via a `nextAllowedAt` timestamp that **carries across buffer-empty gaps and tick boundaries**: when the buffer drains empty the loop stops, but the gap owed by the last line still gates the next beat even if it's produced a tick or two later (the lineout after a penalty-to-touch, the set-piece award after a knock-on) — without this, a beat produced just after the buffer emptied fired back-to-back with the previous line. A genuinely idle stretch (e.g. modal think-time) leaves `nextAllowedAt` in the past, so the first beat after it still appears promptly. `lineGapFraction` (0.46) is calibrated so a beat still spans ≈ the old 0.6-tick window on average: `0.46 ≈ 0.6 / 1.30` (measured ~1.30 steps/beat), keeping total match duration ≈ the pre-decoupling wall-time. The producer (`MatchCoordinator.tickBody`) no longer waits `tickDelayMs` between ticks in live mode — it reschedules ASAP and is throttled only by a run-ahead gate at the top of `tickBody`: while `streamer.bufferDepth() ≥ COMMENTARY_PACING.lookaheadBeats` it re-checks at `beatGap` (= `tickDelayMs × beatGapFraction`, 0.6 — the coarse "typical beat drain time" reference, ≈ `lineGap × avg-steps`, used only for this poll / look-ahead lag, not the line cadence) instead of producing. This is a **poll**, never a wait on a presenter promise, so it cannot deadlock; silent fixtures skip it and run flat-out (keeping the existing `tickDelay` schedule, so determinism is untouched). The producer can never run past a human-decision tick — the penalty / kick-off / forced-sub modals `await streamer.flush(...)` (drain the cushion to the present) then block on the user inside the same tick, before the next tick is scheduled. Half-time and full-time drain-then-stop the same way. **Note:** live pacing is not exercised by `npm run verify` (silent path) — cadence feel and the run-ahead gate need a browser playtest.

UI→engine direction is one channel: `SimController` is the only UI module that calls engine methods (`start`, `pause`, `resume`, `setTickDelay`). Substitutions and tactics changes go through `ui:substitution` / `ui:tacticsChange` bus events; `MatchCoordinator` subscribes to these in its constructor and unsubscribes in `destroy()` (called from `main.ts` after the match-result overlay closes).

---

## Simulation Loop

`MatchCoordinator.tick()` is a self-rescheduling `async` function using `setTimeout`. It is not `setInterval` — pausing is simply not scheduling the next tick.

Each tick:
1. Captures `wasInRed = state.clock.clockInTheRed` and `previousPhase = state.phase` before any mutation.
2. Advances game time via `clock.advanceMinute(state)` (`src/engine/ClockController.ts`): if `state.clock.clockInTheRed`, adds `timeAdvance / 2` (clock crawls); otherwise advances normally and clamps to the half target (40 or 80). `timeAdvance = 0.2 + rng(0, 8) / 10` (0.2–1.0 per tick); the raw value is returned so the caller can drive the fatigue accumulator.
3. Drives `FatigueAccumulator.tick(timeAdvance)` (`src/engine/FatigueAccumulator.ts`): accumulates elapsed time and, once the accumulator reaches 5 game minutes, calls the pure `computeFatigue(team, elapsedMinutes)` on both teams (home first, then away — order matters because both consume the outcome RNG stream) and emits a `FATIGUE_APPLIED` event for every update. `computeFatigue` also returns newly-fatigued players (crossing below 50%); these are **buffered** and their commentary is emitted only at the next natural break (`flush()`), never mid-open-play.
4. Increments possession and territory counters.
5. For `KickOff` and `BoxKick` phases: emits a pre-phase announce `GameEvent` (naming the kicker before the outcome is resolved).
6. For `KickOff` phase: awaits kick-off strategy selection via `penaltyHandler.awaitKickOffStrategy()` (modal `kickoff_choice` pause) — **managed team only** (the side the human player chose at the team selector). The AI-controlled team always defaults to `high_ball` with no modal.
7. Calls `resolvePhase(state, kickOffStrategy)` (`src/engine/PhaseRouter.ts`) to produce the outcome `GameEvent`. The router owns the `PHASE_HANDLERS` map, builds the `PhaseContext`, dispatches to the matching event handler, applies the handler's `MatchEvent[]` queue, then applies `PHASE_CHANGED` to advance `state.phase`, and returns the resulting `GameEvent`.
8. Emits `engine:event` and `engine:stateChange`.
9. **Card pipeline** (`src/engine/CardHandler.ts`). For phase `Penalty`: calls `cardHandler.evaluateNewPenalty()` *before* `penaltyHandler.handlePenaltyDecision()`. If verdict is `'tmo'`, transitions phase to `TmoReview` and bails the tick (the next 3 ticks drive the narrative). If `'team22_card'` or `'none'`, runs the penalty modal normally. For phase `TmoReview`: calls `cardHandler.advanceTmoReview()` and bails (clock stays frozen via `ClockController.advanceMinute` returning 0 during TmoReview). Per non-TMO tick, `cardHandler.scanSinBinReturns()` fires `SIN_BIN_RETURNED` for expired yellows and `RED_20_EXPIRED` (+ the forced-sub flow in `MatchCoordinator.handleRed20Replacement`) for expired red_20s.
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
Penalty      → [CardHandler.evaluateNewPenalty] → TmoReview | Penalty[modal] → KickOff | Lineout | FirstPhase
TmoReview    → (3 narrative ticks, clock frozen) → Penalty
HalfTime     → KickOff
FullTime     → (terminal)
```

Three carry phases share an evasion/collision resolver but have distinct player selection and structure:
- **PhasePlay** — runs after Breakdown; optional pick-and-go branch (back row / prop drives 0-4m from the ruck base) rolls first, otherwise the hard-carry / out-the-back decision picks the carrier (weighted forward on the hard carry — back row + props heavy, locks second, hooker rare; fly-half → outside back on the wide path)
- **FirstPhase** — runs after Scrum or Lineout; carrier always #10; crash ball or wide play
- **KickReturn** — runs after KickOff, BoxKick, or TacticalKick; catcher fields the kick, then a tactics-keyed pod-pickup roll may swap the carrier to a back-row pod runner before the run step

The transition table above is documentary; the engine no longer enforces it at runtime. All transitions go through `PHASE_CHANGED` applied via `applyMatchEvent`.

### Player ratings

Ratings are computed from accumulated per-player statistics, not from event-by-event deltas. After every `resolvePhase()` call (and after penalty goal kicks inside `PenaltyHandler`), a `RATINGS_RECALCULATED` `MatchEvent` is emitted; `applyMatchEvent` calls `computeRating(player)` on all 30 players and writes the result to `player.rating`.

**`computeRating`** is a pure function in `src/engine/RatingEngine.ts`. It reads `player.matchStats` (a `PlayerMatchStats` object) and returns a value in [1.0, 10.0]:

```
baseScore = 6.0
score += tries × 7.0
score += lineBreaks × 1.2
score += defendersBeaten × 0.8
score += turnoversWon × 3.5
score += dominantTackles × 2.0
score += tacklesMade × 0.35
score += kicksMade × 1.0
score += metresCarried × 0.05
score -= knockOns × 1.5
score -= (tacklesAttempted − tacklesMade) × 0.5   // missed tackles
score -= penaltiesConceded × 1.2                  // breakdown penalties only
score -= kicksMissed × 0.75
score -= yellowCards × 5.0                         // 10-min sin-bin tanks the rating
score -= redCards × 15.0                           // sending-off is match-ruining
```

Position bonuses (stacked additively on top of universal):

| Player id | Bonus |
|---|---|
| 2 (hooker) | `(lineoutWins / lineoutThrows − 0.75) × 25` when lineoutThrows > 0 |
| 4, 5 (locks) | `lineoutCatches × 2.0` + `lineoutSteals × 4.5` |
| 1–3 (front row) | `scrumPenaltiesWon × 2.5` − `scrumPenaltiesConceded × 2.5` |
| 6–8 (back row) | `turnoversWon × 3.5` (extra, stacked on top of universal 3.5) + `carries × 0.5` |
| 9 (scrum-half) | `passes × 0.05` |
| 10 (fly-half) | `kicksFromHand × 0.25` |
| 11, 14, 15 (wings/fullback) | `lineBreaks × 0.5` (stacked) |

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

### Pre-match overall (0–100)

Distinct from the match-performance `computeRating` above, **`playerOverall(stats, position)`** in `src/engine/RatingEngine.ts` returns a 0–100 ability score from the 12 `baseStats`. It is a normalised position-weighted average — weights live in `PLAYER_OVERALL_WEIGHTS` (`src/engine/balance/rating.ts`), stats missing from a position's table default to 1.0. Read by `PreMatchScreen`, `TeamInfoScreen`, and `teamProfile.computeOverallRating` (top-23 mean). Never mutated in-match.

**Stats are authored, not transformed.** The `baseStats` in `src/data/team-*.json` are the final, play-ready values — authored in the squad tables of `docs/team-data.md` and copied verbatim by `scripts/generateTeamJsons.mjs`. `main.ts` loads the JSONs straight through to `teamProfile.init()` and the `RawTeamInput` cast that feeds `MatchCoordinator`; the determinism harnesses (`scripts/checkDeterminism.ts`, `scripts/checkSeasonDeterminism.ts`) and `scripts/telemetry.ts` import the same JSONs. There is **no spawn-time stat transform** — to change a player's ability, edit their row in `docs/team-data.md` and run `node scripts/generateTeamJsons.mjs`.

`IRRELEVANT_STATS` (forwards' `kicking`, backs' `setPiece`) carry weight 0 in `PLAYER_OVERALL_WEIGHTS`, so they never affect a player's OVR, but the engine still reads the raw value in rare fallback cases (e.g. a forward forced to take a drop-out when no specialist kicker is on the field). Author them as plausible low numbers; `PlayerProfileScreen` greys them out on the attribute radar.

*(Historical note: until v1.17b a runtime `applyStarBoost` pass — tier calibration `+10/+3/-5`, per-star floor + OVR iteration toward `suggestedRating + 3`, league ceilings, per-player pace overrides — transformed the authored numbers at app start. That output is now baked directly into `docs/team-data.md` and the JSONs, so the master file is the data the game runs. `src/team/applyStarBoost.ts` and the boost-only constants were deleted.)*

---

## Fatigue System

Called via `computeFatigue(team, elapsedMinutes)` approximately every 5 game minutes. The function is pure — it returns `{updates, newlyTired}` and the caller emits `FATIGUE_APPLIED` `MatchEvent`s for each update.

### Decay

Every cycle, a base decay rate between 4 and 12 is randomly determined. This rate is then reduced depending on the player's stamina — higher stamina means a slower fatigue drain. A player with a stamina rating of 90 will only suffer 40% of the base decay compared to a player with a stamina rating of 0.

`actualDecay = decayRate × (1 − stamina / 150)`

For forwards (player id ≤ 8), the decay is then multiplied by a tactic factor:

- `attackingBreakdown === 'commit_numbers'`: ×1.1
- `defendingBreakdown === 'counter_ruck'`: ×1.1
- Both active: ×1.21 (multiplicative, not additive)

Backs (id ≥ 9) are unaffected by these forward-only multipliers.

Then, for **every** player (forwards and backs), the decay is multiplied by the team-wide **intensity** factor `TACTIC_MODIFIERS.intensityFatigueMultiplier[team.tactics.intensity]` — `high: ×1.08`, `balanced: ×1.00`, `light: ×0.94`. This compounds with the forward multipliers above (e.g. a `high` + `commit_numbers` + `counter_ruck` forward reaches ×1.08 × 1.21 ≈ ×1.31). The multiply is applied to the already-computed decay and consumes no RNG, so determinism is unaffected.

Higher stamina reduces decay. A player with stamina 90 decays at 40% the rate of one with stamina 0. With 16 fatigue applications per 80-minute game, expected total fatigue loss at stamina 60 is ~77%, stamina 0 hits the floor well before full time, stamina 90 is ~51% — most players cross the 50% penalty tier during the match.

### Attribute penalties (applied to `currentStats` from `baseStats`)

Each `if` block overwrites the previous, so the final matching block wins.

| Fatigue threshold | Affected attributes | Multiplier |
|---|---|---|
| < 90% | strength | × 0.90 |
| < 80% | tackling | × 0.80 |
| < 70% | pace, agility | × 0.75 |
| < 70% | handling | × 0.95 |
| < 70% | discipline, composure, setPiece, breakdown | × 0.80 |
| < 70% | strength | × 0.70 |
| < 50% | pace, agility | × 0.55 |
| < 50% | handling | × 0.85 |
| < 50% | discipline, composure, setPiece, breakdown | × 0.60 |
| < 50% | strength | × 0.50 |
| < 30% | pace, agility | × 0.35 |
| < 30% | handling | × 0.70 |
| < 30% | discipline, composure | × 0.40 |
| < 30% | tackling | × 0.40 |
| < 30% | setPiece, breakdown | × 0.30 |
| < 30% | strength | × 0.30 |

**Not affected by fatigue at any threshold:** kicking, positioning.

`baseStats` is never modified. `currentStats` is rebuilt from `baseStats` on every fatigue application.

### Fatigue commentary

When `computeFatigue` detects a player crossing from ≥ 50% to < 50% fatiguePct, it returns that player in its `newlyTired` list. `FatigueAccumulator` **buffers** them and emits the commentary `GameEvent` only at the next natural break in play (`flush()`, called by `MatchCoordinator`) so the line never interrupts open play; a player subbed or injured off before the break is dropped. The line is a randomly chosen one of six variants: "starting to look tired", "looking leggy", "wear is showing", "running on empty", "looks worn out", "tank is emptying" — stamped with the break's phase/possession context. The commentary feed colorises the player name normally.

### Occasion commentary

Special matches inject extra atmosphere into the commentary feed via four hooks, each reading `state.engine` flags (`isDerby`, `neutralVenue`, `isPlayoffSemi`) to decide whether to fire:

| Hook | Trigger | Mechanism | Chance |
|---|---|---|---|
| **Coin toss** | Any occasion match | `announcement` step appended to the coin-toss narration | 100% (always fires once) |
| **Knock-on pressure** | Any occasion match, knock-on in PhasePlay | `tactic_note` (`occasion_error_pressure`) appended to knock-on narration | 25% (`COMMENTARY_CHANCES.occasionErrorPressure`) |
| **Line break** | Any occasion match, line break in PhasePlay (non-try) | `tactic_note` (`occasion_rising_to_occasion`) appended after line-break narration | 25% (`COMMENTARY_CHANCES.occasionRisingToOccasion`) |
| **Clock in red (2nd half)** | Any occasion match, second-half clock-in-red | `tactic_note` (`occasion_clock_in_red`) appended to clock-in-red narration | 40% (`COMMENTARY_CHANCES.occasionClockInRed`) |

The coin-toss announcement key varies by match type: `occasion_kickoff_derby` / `occasion_kickoff_playoff_semi` / `occasion_kickoff_final`. All three `tactic_note` causes (`occasion_error_pressure`, `occasion_rising_to_occasion`, `occasion_clock_in_red`) live in `src/commentary/banks/en-GB/tacticNotes.ts`; the coin-toss lines live in `src/commentary/banks/en-GB/announcements.ts`. Occasion tactic notes use the commentary RNG stream (as all tactic notes do) so they cannot shift in-play outcomes.

`state.engine.isPlayoffSemi` is set to `true` by `main.ts` for playoff semi-final fixtures; the playoff final uses the existing `neutralVenue = true` flag; derbies use the existing `isDerby = true` flag.

---

## Determinism (Seeded RNG)

Match-scope randomness flows through four isolated mulberry32 streams in `src/utils/rng.ts`:

| Stream | Backing function | Consumers |
|---|---|---|
| `outcome` | `rng(min, max)` | Every in-play roll: resolvers, phase handlers, `ClockController.advanceMinute`, coin toss, substitution template selection |
| `form` | `rngFormRaw()` | Random perturbation of the player form modifier in `initPlayer()` |
| `commentary` | `pickRandom(arr)` | Commentary template selection in `CommentaryEngine.pick()` |
| `positioning` | `rngPosition(min, max)` | Every lateral (Y-axis) draw: open-play sweep pass distances, kick launch angles, kick-off side bias — see "Lateral / Y-axis model" below |

A fifth stream — `transfer`, backed by `rngTransferRaw()` and seeded via `setCareerSeed(seed)` — covers season-scope randomness (contract seeding, age-curve jitter, retirement rolls). It lives in `src/utils/rng.ts` alongside the others but is consumed only by `src/game/` code; see **`docs/game-engine.md`** § Determinism. Match-engine code never touches it.

The `positioning` stream is isolated so that adding realistic lateral ball movement cannot perturb any in-play outcome roll. The one deliberate exception where Y feeds an outcome is the goal-kick angle term (see below): a penalty taken from a wide swept position is harder, and a try grounded out wide is harder to convert. The try-landing jitter itself stays on the `outcome` stream (one `rng()` draw per try) so its stream offset is unchanged across this feature.

Each stream is seeded with its master seed XORed against a fixed constant, so adding new commentary lines (or any new flavour roll) cannot shift outcome rolls.

The master seed is a 32-bit unsigned integer stored on `state.engine.seed`. It is set in the `MatchCoordinator` constructor — either passed via `opts.seed` or auto-generated via `Math.floor(Math.random() * 0x100000000)`. `setMatchSeed(seed)` is called **before** `initMatchState()` so player form initialisation is deterministic. Once set, the only `Math.random()` call in the engine is the seed-generation line itself.

A match with a given seed is fully reproducible: identical event sequence, identical scores, identical fatigue trajectories.

**The `verify` check is self-consistency, not a frozen golden hash.** `checkDeterminism.ts` runs each fixture **twice** with the same seed and asserts the two snapshots (`state.events` + per-player matchStats) hash identically. So a *deterministic* change to event timing or ordering — e.g. deferring fatigue/injury commentary to the next break — passes fine: it just yields a new (still stable) hash. The printed hash is informational, not compared against a stored value. (The pinned snapshot in `checkSaveSchema.ts` is the separate save-shape guard.)

---

## Lateral / Y-axis model

`state.ball.y` is the lateral position across the pitch width: `0`/`100` are the two touchlines, `50` the centre. Y is a 0–100 proportion of the 70m width, so 1m ≈ 1.43 Y-units (`metresToY` in `src/engine/Lateral.ts`). All lateral logic lives in `Lateral.ts` (pure helpers, mirroring `FieldPosition.ts`) with tuning in `src/engine/balance/lateral.ts`; every helper clamps its result to `[0,100]`, and all new randomness draws on the `positioning` stream.

**Sweep direction.** `state.ball.lateralDir` (`-1` toward y=0, `+1` toward y=100) is the remembered direction open play is moving across the field. It is **not** a coordinate, so `assertInvariants` does not range-check it. It resets toward the **open side** — the touchline with more space, i.e. away from the nearer one (`openSideDir(y) = y <= 50 ? +1 : -1`) — whenever possession changes: the `POSSESSION_SWAPPED` / `POSSESSION_SET` reducers set it inline from `ball.y`. `BALL_REPOSITIONED` carries an optional `lateralDir` so phase handlers can update it alongside `y`.

**Open-play sweep.** A ball-in-hand phase shifts the ball laterally **one hop per backline pass** — the ball steps across the field pass-by-pass, then the carrier drives forward. The three carry handlers share one seam, `emitSweepHops(events, state, style, hopCount, orient, attackTeamName, perPass, scrumHalfFirst, dist)` in `Lateral.ts`: it runs `sweepPath` (`hopCount` floored at 1) and emits the hops **before** `CARRY_RESOLVED` so the keyframe path reads "across the line, then upfield". Each hop draws a pass distance from a `PassDist` config (`dist`), scaled by attacking style (`SWEEP_STYLE_MULT`: tight 0.7 / balanced 1.0 / wide 1.4); reaching the 15m edge band (`EDGE_Y_LOW = 21` / `EDGE_Y_HIGH = 79`) clamps Y to the edge and flips `lateralDir`. Two pass-distance configs exist: **`PASS_DISTANCE_M`** (open play, kick return, penalty tap-and-go): 70% short 2–5m, 25% mid 5–12m, 5% long 12–20m — weighted avg ~5.4m; **`FIRST_PHASE_PASS_DISTANCE_M`** (first-phase backline hops 2+, passed explicitly by `FirstPhaseEvent`): 5% short 2–5m, 70% mid 5–12m, 25% long 12–20m — weighted avg ~10m, so the backs spread wider across the field off set pieces. The scrum-half's first hop always uses `SCRUM_HALF_PASS_M` (10–20m, avg 15m) regardless of `dist`. `FirstPhaseEvent` (2–3 hops) and `KickReturnEvent` (1 hop) orient the first hop to the open side (`orient = true`); `OpenPlayEvent.handlePhasePlay` (1–2 hops) continues the current direction. A pick-and-go uses a single `sweepStep` forced to `keep_it_tight` with `PASS_DISTANCE_M`; penalty tap-and-go uses `openSweepStep`. All gated on `!tryScored`. **`perPass` (`= !silent`) is a presentation switch:** live UI emits every hop (so `PitchView` walks them); headless/silent sims collapse to a single `BALL_REPOSITIONED` at the final position — identical final `ball.y`/`lateralDir` and identical `rngPosition` draws (`sweepPath` runs the same either way), so outcomes are untouched while the headless path skips the intermediate per-pass events. Because the edge band caps the spread, raising the hop count makes the ball traverse the width more often without widening its average `|y−50|` — telemetry confirmed goal-kicking accuracy and scoring held at baseline (no kicking retune needed).

**Try landing.** A grounded try lands at the swept position plus a small style-scaled jitter (`tryLandingY(state, style)` in `TryLocationResolver.ts`, `TRY_LANDING_JITTER`: tight 6 / balanced 10 / wide 16). This supersedes the old centre-spread and feeds conversion difficulty through `state.ball.y` — a try finished out wide after a sweep is harder to convert. One `outcome`-stream draw.

**Lateral commentary.** Each sweep site optionally appends a lateral-flavour `tactic_note` via `lateralNote(sweep, attackTeamName, orienting, preDir)` (`Lateral.ts`), classified purely from the sweep geometry: a continuing sweep that hit the edge band and reversed → `worked_back_blind`; a sweep that lands in the edge band → `pinned_on_touchline`; an `openSweepStep` (set-piece / kick-return exit) that swung to the open side → `switch_to_open_side`. Chances live in `COMMENTARY_CHANCES` (`switchToOpenSide` 18 / `workedBackBlind` 25 / `pinnedOnTouchline` 20); phrases in `tacticNotes.ts`. The note is appended only on a normal continuation (`nextPhase === Breakdown`), never after a penalty/try, and (like all tactic notes) rolls on the commentary stream so it cannot shift outcomes.

**Kicks** (distance is already in scope in each handler; lateral landing = `currentY + dir × metresToY(distance × tan(angle))` for in-field kicks, or a touchline snap for kicks to touch):

| Kick | Helper | Lateral behaviour |
|---|---|---|
| Kick-off (high/grubber) | `kickOffLandingY` | Aims the 15m line (`KICKOFF_TARGET_INSET = 21`) on the kicker's left 75% of the time (`KICKOFF_LEFT_BIAS_PCT`), ± `KICKOFF_JITTER` (6) — right-foot bias |
| Kick-off (short) | `kickOffLandingY` | Nearly straight (centre ± `KICKOFF_STRAIGHT_JITTER` 3) |
| Box kick | `boxKickLandingY` | Nearly straight, ±`BOX_KICK_ANGLE_DEG` (5°), so the chaser competes; to-touch branch snaps to `lineoutFormationY` |
| Tactical clearing / 50:22 / out-on-full to touch | `lineoutFormationY` | Lineout forms on the nearer touchline, `LINEOUT_TOUCHLINE_INSET` (6) in |
| Tactical kept in field / 50:22 caught in field | `kickForTouchMissY` | Touch-finder that came up short — lands ~5m short of the near touchline (`LINEOUT_TOUCHLINE_INSET` 6 + `rng(3,7)`). A 50:22 is aimed at the corner, so a miss lands near touch, not mid-pitch. |
| Cross-field kick | `crossKickCornerY` | Flat to the far corner, `CROSS_KICK_INSET` (6) in ± `CROSS_KICK_JITTER` (4) |
| Grubber | `grubberLandingY` | Diagonal into space toward the open side, `GRUBBER_ANGLE_DEG` (8–18°) |
| Drop-out | `dropOutLandingY` | Diagonal toward the open side, `DROPOUT_ANGLE_DEG` (10–20°) |
| Penalty to touch | `lineoutFormationY` | Found touch → lineout snap; missed touch → `clearingKickLandingY` in field |

**Goal-kick angle coupling.** `resolveGoalKick` reads `state.ball.y`: `score = kicking + composure×0.2 − angle×GOAL_KICK_VALUES.angleWeight(0.3) + rng(1,100) ≥ successThreshold`, where the penalty `angle` term includes `|ball.y−50| × PENALTY_VALUES.goalKickDistanceFromPostsWeight(0.3)` and the conversion term uses `CONVERSION_VALUES.distanceFromPostsWeight(0.4)`. Once lateral movement went live, penalties are taken from realistic (wider) positions and tries land at the swept Y, so the mean make-rate fell ~2pp; `GOAL_KICK_VALUES.successThreshold` was re-centred 135→133 to restore the league average (~75% conversions / ~75% penalties, `points/match ≈ 34.9`) while keeping the new wide-harder / central-easier variance.

---

## Per-Match Form Modifier

**Source:** the deterministic part is computed in `computeFormInputs()` (`src/game/playerForm.ts`); the random part is `rngFormRaw()` (`src/utils/rng.ts`, form stream). Combined in `initPlayer()` in `src/engine/MatchCoordinator.ts`. Constants live in `src/engine/balance/form.ts` (`FORM_MODEL`).

At match start every player (starters and bench) receives a `formModifier` — a signed integer clamped to `[−10, +10]` — built from a **deterministic bias** plus a **single random perturbation**:

```
formModifier = clamp(round(rngFormRaw() * baseSpread * volatility + bias), −10, +10)
current[stat] = clamp(baseStats[stat] + formModifier, 1, 100)
```

`rngFormRaw()` is one standard-normal draw (mean 0, σ 1). `baseSpread = 3`. The deterministic `bias` and `volatility` are precomputed by `computeFormInputs(state, player)` and threaded onto the matchday `RawPlayer` (`formBias` / `formVolatility`) by `rosterTeamBuilder` — so the engine itself does exactly one form draw per player and the form RNG stream order is unchanged. On the legacy/JSON path (no roster context) `bias = 0`, `volatility = 1`, collapsing to a pure random roll.

**Bias** (additive, deterministic — `FORM_MODEL`). The two steady-state factors are symmetric (±5 and ±3), so an in-form, fresh player reaches +8 and a poor, tired player −8; the return penalty is transient and one-directional:
- **Recent form:** mean of the player's last-3 match ratings (`Player.recentRatings`) vs `ratingBaseline 6.5`, scaled by `ratingSlope 4`, clamped to `[−5, +5]`. Needs ≥`minApps 2` logged ratings.
- **Condition:** bidirectional around a neutral freshness point — `(condition − conditionNeutral 90) × conditionSlope 0.3`, clamped to `±conditionCap 3` (peak-fresh 100 → +3, 70 or below → −3). Neutral sits near the typical match-day condition so the league-wide mean form stays ~0.
- **Return rustiness:** a fading penalty after returning from absence (`Player.formReturn`) — `injuryReturnPenalty −3` (injury) / `intlReturnPenalty −2` (international duty), fading linearly to 0 over `returnFadeRounds 3`.

**Volatility** (σ multiplier on the random draw): age — `youngVolatility 1.3` (≤22), `veteranVolatility 0.7` (≥31), else 1 — times `marqueeVolatility 0.85` for marquee players.

`baseStats` is untouched. Fatigue then degrades `currentStats` from this form-adjusted base throughout the match.

**UI:** `formModifier` (and, out of match, the deterministic `bias` trend) is surfaced as a 1–5 star + label rating via `src/ui/formDisplay.ts` (StatsPanel in-match; PreMatch + Contracts show the trend).

---

## Position Familiarity (out-of-position penalty)

**Source:** `src/engine/balance/positionFamiliarity.ts`; applied in `initPlayer()` (`src/engine/MatchCoordinator.ts`) and the `SUBSTITUTION_APPLIED` branch of `applyMatchEvent`.

A player filling a jersey slot that isn't their natural position takes an **effective-stat penalty**. Pure, RNG-free, deterministic — so silent AI fixtures and the determinism harnesses see the identical penalty as live play.

**Mechanism.** The penalty is a multiplier applied to the player's **per-match `baseStats` clone** (the roster record is never touched). It lives on `baseStats` — not just the initial `currentStats` — because `StaminaSystem.computeFatigue` re-derives `currentStats` from `baseStats` every tick; a penalty baked only into the initial `currentStats` would be wiped on tick one. With the clone scaled, the penalty flows automatically into every resolver (which all read `currentStats`) with **zero resolver edits** and no new `MatchEvent` variant.

- **Starters (slots 1–15):** scaled in `initPlayer` by `slotFamiliarity(naturalPosition, slotId)`.
- **Bench (slots 16–23):** left unscaled at `initPlayer` — they aren't on the field. When a sub comes on, the `SUBSTITUTION_APPLIED` branch scales the incoming player's `baseStats` + `currentStats` by `positionFamiliarity(on.position [natural], off.position [the slot's role])`, computed **before** `on.position = off.position` overwrites the natural label. This is the sub's first and only scale.

**Familiarity table.** `SLOT_POSITION` maps each jersey to its target role (1/3→Prop, 2→Hooker, 4/5→Lock, 6/7→Flanker, 8→Number 8, 9→Scrum-Half, 10→Fly-Half, 11/14→Wing, 12/13→Centre, 15→Fullback). `POSITION_FAMILIARITY[natural][target]` gives the multiplier; a self-match is `1.0`, any unlisted pair is **makeshift** (`MAKESHIFT_MULT = 0.72`). Highlights:

- **Front row** is near-immovable: `Prop↔Hooker = 0.78`, everything else makeshift (`0.72`) — a back in the front row is a liability, so the SUM-based scrum/lineout pack scores collapse naturally.
- **Locks** cover blindside/№8 at `0.88`.
- **Back row** is interchangeable: `Flanker↔Number 8 = 0.96`. The versatile **`Back Row`** label is **natural (1.0)** at flanker/№8 — it represents a loose forward at home anywhere in 6/7/8 (used by authored XVs).
- **Backs:** `Centre↔Wing = 0.92`, `Wing↔Fullback = 0.93`, `Fly-Half→Centre = 0.90`, `Scrum-Half↔Fly-Half = 0.88`. The **`Utility Back`** label is **natural (1.0)** across 10/12/13/11/14/15, with only the specialist scrum-half role penalised (`0.90`).

`oopSeverity(natural, slotId)` (mild `≥ 0.90` / moderate `≥ 0.84` / severe `< 0.84`, or `null` at `1.0`) drives the **OOP** chip on the player's own starting XV in `SquadManagementScreen` and `PreMatchScreen`, colour-coded amber → orange → red so the manager can read the cost at a glance; `oopPenaltyPct(...)` adds the magnitude (e.g. `−22%`) to the tooltip. Tying the chip to the penalty means a versatile cluster player (Back Row at flanker, Utility Back at fullback) is never flagged. The warning is non-blocking — the manager may still field the player.

The penalty stacks with the existing position-weighted OVR (a centre at fly-half is doubly disadvantaged: low base kicking *and* the familiarity hit) and with the form modifier and fatigue, since all three operate on the same `currentStats` path.

---

## Home Advantage

**Source:** `HOME_ADVANTAGE` constants in `src/engine/balance/homeAdvantage.ts`; resolved per call site via `homeEdge(state, mod)` in `src/engine/HomeAdvantage.ts`.

A flat per-match tilt toward the side currently occupying the `homeTeam` slot in `MatchState`. The engine consumes it through two channels — open-play carries (`carryMod`) and the breakdown (`breakdownMod`) — and the pre-match SPREAD tile reads the same `spreadPts` headline so prediction and simulation agree.

**Channels:**

| channel | call site | how it flows |
|---|---|---|
| Open-play carry | `FirstPhaseEvent`, `OpenPlayEvent`, `KickReturnEvent` | `homeEdge` is added to the `attackMod` / `defendMod` passed into `resolveOpenPlay`. Bumps evasion / defence rolls on the home side. |
| Breakdown | `BreakdownEvent` | `homeEdge` is added to the `attackBonus` / `defendBonus` passed into `resolveBreakdown`. Bumps `ars` (when home is attacking the ruck) or `dts` (when home is defending). |

**Calibration:** tuned via `npm run telemetry` against the real-rugby League home win-rate of ~57%. Current values produce **57.8% home wins · 37.8% away wins · 4.4% draws** across the 90-fixture pass, with an average home margin of 5.5 points. The headline `spreadPts: 3` is the betting-market-style baseline for a typical matchup; the larger simulated margin reflects the compounding effect of two channels across an 80-minute match.

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

## Team Talk Modifier

**Source:** `TEAM_TALK` constants in `src/engine/balance/teamTalk.ts`.

Pre-match and half-time team talks apply a time-decaying attack/defend modifier to each side. The modifier is stored on `state.teamTalkMod` and consumed read-only in the carry resolvers.

### How it flows

1. **Pre-match (in `MatchCoordinator.initialize()`):** The manager picks a tone via the Team Talk screen; the AI side gets a deterministic tone based on OVR-sum delta. Both emit a `TEAM_TALK_APPLIED` MatchEvent that sets `state.teamTalkMod[side]`.
2. **Half-time (in `MatchCoordinator.runHalfTimeTalks()`):** Same pattern — the manager gets a modal pause (`team_talk_choice`); the AI gets a deterministic tone based on score delta. Both emit `TEAM_TALK_APPLIED`. This shared helper is called by **both** paths that can end the first half: the normal end-of-period (`handleEndOfPeriod()`) and a goal kick — conversion or penalty — resolved while the clock is in the red (`tickKickAtGoal()`). Routing both through one helper guarantees the dressing-room panel (and the AI talk) appears regardless of how the half ends. Silent mode applies both AI talks deterministically and plays straight on, in both paths.
3. **Carry resolvers (`OpenPlayEvent`, `resolvePickAndGo`):** At each carry, the active fraction is computed: `max(0, 1 − (gameMinute − startMinute) / decayMinutes)`. The resulting bonus is added to `attackMod` and `defendMod` before rolling the carry outcome.

### Tones and values

| Tone | `attack` | `defend` | `decayMinutes` | Notes |
|---|---|---|---|---|
| `calm` | 2 | 4 | 15 | Safe defensive shape; reliable on any squad |
| `encourage` | 5 | 2 | 12 | Halved (×0.5) if squad avg morale < 50 |
| `demand` | 8 | 2 | 10 | If avg morale < 50: attack −8, defend −8 (backfires) |
| `single_out` | 3 | 1 | 12 | Plus a +8 carrier bonus applied only when the named player carries |

Threshold constants: `flatThreshold: 50` (morale < 50 = "Flat"), `flyingThreshold: 75` (morale ≥ 75 = "Flying").

### AI tone selection

- **Pre-match:** OVR-sum delta (human squad − AI squad). If delta ≥ `aiCalmMinDelta` (75), AI picks `calm`; if delta ≤ −75, AI picks `demand`; otherwise `encourage`.
- **Half-time:** Score gap (human score − AI score). If gap ≥ `aiScoreCalmMin` (7), AI picks `calm`; if gap ≤ `aiScoreDemandMax` (−7), AI picks `demand`; otherwise `encourage`.

Both paths are deterministic — no RNG consumed.

### Decay formula

```
fraction = max(0, 1 - (gameMinute - startMinute) / decayMinutes)
bonus    = storedValue × fraction
```

A pre-match `calm` talk (attack 2, decay 15) at kick-off (minute 0) contributes +2 at minute 0, +1 at minute 7.5, and 0 from minute 15 onward. Values are stored unchanged in `state.teamTalkMod`; the fraction is computed fresh at each carry and never written back, so there's no GC churn.

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

## 22m Drop-Out

`MatchPhase.DropOut22`, handler `src/engine/events/DropOutEvent.ts`, resolver `src/engine/resolvers/DropOutResolver.ts`. Reached only after a missed penalty kick at goal — `KickAtGoalHandler.advance()` swaps possession to the defending team, repositions the ball to that team's own 22m line via `ownTwentyTwoX(state)`, and transitions to `DropOut22`. World Rugby rule: defending team restarts with a 22 drop-out, not a halfway kick-off.

Mirrors `KickOff` exactly except:

- **No strategy choice.** Drop-outs are a single fixed drop-kick model — no `awaitKickOffStrategy` modal in `MatchCoordinator`.
- **Kicker stands at own 22**, not halfway. Ball-position math uses `state.ball.x + attackDir(state) * distance` (kick-off uses `50 + ...`).
- **Receiver pool is the back three + scrum-half** (forwards chase, backs catch the aerial drop-kick).
- **`poor_kick`** = drop-kick failed to clear the 22m line (distance < `DROP_OUT_VALUES.distance.autoPoorIfUnder` = 22). Scrum to receiving team at the spot of the kick.

Outcome family is identical to kick-off (`KickOffResult` union; `short_kick_retain` is unreachable today because the resolver has no short-kick branch). Commentary lives in `DROP_OUT_22` bank in `src/commentary/banks/en-GB/phases.ts` keyed by the same `PhaseOutcomeKey` values (`announce`, `clean_receive`, `knock_on`, `poor_kick`).

### Outcome summary

| Result | Possession | ballX | Next phase |
|---|---|---|---|
| `poor_kick` | flip to receiving team | unchanged (kicker's 22) | Scrum |
| `knock_on` | stays with kicking team | landing position | Scrum |
| `clean_receive` | flip to receiving team | landing position | KickReturn |

### Stat increments

| Outcome | Player | Stat |
|---|---|---|
| every drop-out | kicker | `kicksFromHand++` |

Tuning constants: `DROP_OUT_VALUES` in `src/engine/balance/dropOut.ts`.

---

## Carry Phases (PhasePlay / FirstPhase / KickReturn)

Three phases share a common evasion/collision resolver but have distinct player selection, play-structure, and preliminary steps. Each is a separate handler in its own file, routing to the matching `MatchPhase` enum for commentary.

### Step 0 — Kick or carry decision (all three phases)

Unified across the three carry phases via `KickDecisionDirector.decide()` (src/engine/KickDecisionDirector.ts). Replaces the three independent inline gates that lived here pre-v2.83a, plus the Breakdown slow_ball → BoxKick gate that lived in BreakdownEvent. See [Kick Decision Director](#kick-decision-director) below for the full tree.

If a kick is decided, the phase transitions to `BoxKick` (#9 kicker) or `TacticalKick` (#10 kicker). The remaining carry steps do not run.

---

### PhasePlay

Runs after `Breakdown` (recycled possession).

**Step 0b — Pick and Go**

Rolled BEFORE the hard-carry / wide decision. On hit, a back-row or prop picks the ball at the base of the ruck and drives 1-4m into contact. No pass (no scrum-half pop, no interception, no carrier handling gate), no offload chain, no line break. A dominant carry from close range can score a try; otherwise lands at Breakdown.

| `attackingStyle` | Pick & Go |
|---|---|
| `keep_it_tight` | 30% |
| `balanced` | 12% |
| `wide_wide` | 3% |

Carrier pool (`PICK_AND_GO_WEIGHTS` in `src/engine/balance/carrying.ts`): back row 18/18/15 + props 8/8 only — hooker is at the ruck and locks usually bind / cleanout, so neither is eligible. Resolves via `resolvePickAndGo(...)` in `OpenPlayEvent.ts`: reuses `resolveOpenPlay` for outcome generation (carrier stats still drive quality), then downgrades any `line_break` outcome to `dominant_carry` and clamps `gainMetres` to `[1, 4]` (1m floor — even a stuffed pick-and-go drives a metre at the base). Emits `CARRY_RESOLVED` with one of `pick_and_go_play_on` / `pick_and_go_dominant_carry` / `pick_and_go_dominant_tackle`. Returns `nextPhase: TryScored` when a `dominant_carry` crosses the try line (`isTryScoredAt` check, identical to a regular carry — narrates as `dominant_carry_try`); otherwise `Breakdown` (or `Penalty` on a high-tackle infringement). The high-tackle check and injury roll are gated on `!tryScored`. Assist tackler is credited via `pickAssistTackler` exactly as for a regular hard carry.

If the pick-and-go gate fires but no eligible forward is on the field (rare — every back-row + prop binned / sent off), the handler falls through to the regular hard-carry / wide decision below.

**Step 1 — Hard Carry / Out the Back decision**

| `attackingStyle` | Hard Carry | Out the Back |
|---|---|---|
| `keep_it_tight` | 85% | 15% |
| `balanced` | 70% | 30% |
| `wide_wide` | 50% | 50% |

The decision picks the carrier:

- **Hard Carry:** carrier is a forward (ids 1–8) chosen via `pickHardCarrier(attackTeam, state, attackSide)` — weighted pick over `availableForwards` using `HARD_CARRIER_WEIGHTS` (back row 18/18/15 + props 12/12 + locks 8/8 + hooker 4). Back row + props dominate the carry leaderboard; locks second; hooker rare. Scrum-half → forward, then straight into contact.
- **Out the Back:** carrier is the fly-half (id 10). Scrum-half → fly-half → outside back (random from ids 11, 13, 14, 15); `ballCarrier = outsideBack`.

```typescript
carrier  = goWide ? pickPlayer(attackTeam, 10) : pickHardCarrier(attackTeam, state, attackSide)
defender = randomPlayer(defendTeam)
```

Tuning: `HARD_CARRY_THRESHOLDS` in `src/engine/balance/openPlay.ts` (shared with FirstPhase's crash-ball / wide-play split); `HARD_CARRIER_WEIGHTS` in `src/engine/balance/carrying.ts`. The forward pool falls through `availableForwards` first → any on-field player → `team.players[0]` if every weighted slot is binned / sent off.

**Step 2 — Carrier handling gate**

`handling + rng(1,100) < 85` → knock-on on the scrum-half pass: possession flips, scrum awarded, carrier −0.45. This gives ~5% for handling 80, ~10% for handling 75, ~20% for handling 65, 0% for handling ≥ 85.

On the wide path, a second handling gate (same threshold) fires on the outside back receiving the fly-half pass; knock-on flips possession to a scrum.

**Steps 3–4 — Evasion → Collision** — see [Shared Evasion/Collision](#shared-evasioncollision) below.

**Step 4b — Hard-carry line-break upgrade (post-resolve, hard-carry path only)**

Forwards rarely clear the standard `lineBreakMargin` of 20 on raw stats (low pace / agility), so the line-break + try-scorer leaderboards used to be all-back. A small post-roll upgrade on the hard-carry path lets a back-row or prop occasionally puncture the gain line off a ruck: if `outcome === 'dominant_carry'` (the carrier already won the contact) and a `rng(1, 100) <= HARD_CARRY_LINE_BREAK_UPGRADE_PCT` (12%) check passes, the outcome flips to `line_break` with `gainMetres` re-rolled into `HARD_CARRY_LINE_BREAK_METRES` (10-15m — smaller than the wide-line-break 10-25m range because close-channel cover tracks back faster than a fullback in the 15m channel). If the upgrade doesn't fire, the standard dominant carry pushes the line back `HARD_CARRY_DOMINANT_METRES` (5-10m). The existing line-break gain bonus (defensive line + backfield) then stacks on top. Tuning: constants in `src/engine/balance/openPlay.ts`. Wide path is unaffected (wide carriers already produce line-breaks through the standard margin check).

---

### FirstPhase

Runs after `Scrum` or `Lineout`. The carrier is **always #10 (fly-half)**.

```typescript
carrier  = pickPlayer(attackTeam, 10)
```

**Step 1 — Carrier handling gate**

Same threshold as PhasePlay (`handling + rng(1,100) < 85` → knock-on; defender is `randomPlayer(defendTeam)` for commentary).

**Step 2 — Crash Ball / Wide Play decision**

Driven by `attackingStyle` using the same thresholds as the Hard Carry / Out the Back split:

| `attackingStyle` | Crash Ball | Wide Play |
|---|---|---|
| `keep_it_tight` | 75% | 25% |
| `balanced` | 50% | 50% |
| `wide_wide` | 30% | 70% |

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

**Authored choreography (Phase Animator JSONs)**

If a Phase Animator JSON is registered for the play type, `applyChoreography()` overlays it onto the `PhaseResult` before it is returned. The registry key is `"prevPhase:outcomeKey"` (e.g. `"SCRUM:crash_ball"`, `"LINEOUT:out_the_back"`), stored in `FIRST_PHASE_CHOREOGRAPHIES` in `src/engine/balance/firstPhaseChoreography.ts`.

`applyChoreography` does the following:
1. **Parses the authored anchor** — the ball's `t = 0` keyframe position (`authoredAnchorX`, `authoredAnchorY`) plus the attack direction inferred from the attacking #10's depth relative to the ball (`authoredAttacksTop`). Also computes `authoredNearTop = authoredAnchorY >= 50`.
2. **Computes flip flags** — `flipX = authoredAttacksTop !== attacksTop`, `flipY = authoredNearTop !== nearTop`. Both can fire independently.
3. **Computes the live offset** — `dx = state.ball.x − anchorX`, `dy = state.ball.y − anchorY` (after applying flips to the anchor). Every authored coordinate is shifted by this delta so the entire move slides to wherever the engine's ball actually started, anchored to the real set-piece position rather than the authored canvas origin.
4. **Injects authored ball keyframes** — replaces any procedural `BALL_REPOSITIONED` events before `CARRY_RESOLVED` with the authored keyframe sequence (flipped + offset). The ball follows the exact authored path instead of the procedural `emitSweepHops` lateral hops.
5. **Emits per-player choreography entries** — for each non-forward entity (slots 9–15), records `{ side, id, movements[] }` on `PhaseResult.choreography`. Forwards (slots 1–8) are explicitly **skipped** — the UI keeps them at their predecessor set-piece positions (scrum/lineout/maul via `keepLineout`). Animating them from the JSON would fight the formation-hold and displace them to wrong coordinates.
6. **Swaps laterally-paired jerseys when `flipX !== flipY`** — `11↔14`, `1↔3`, `6↔7` — so a right-touchline sweep authored for the right wing correctly becomes a left-wing sweep when mirrored, without players crossing each other.

Narration outcome keys for authored first-phase plays:
- `crash_ball` — Crash Ball path (existing key)
- `out_the_back` — Out the Back / wide play path (existing key)
- `wide_pass` — Wide Play intro variant (added to `PhaseOutcomeKey` to support the wide backs move narration step)
- `kick_decision` — If the kick gate fires and a `kick_decision` choreography is registered, the authored animation is applied to the kick transition.

The authored ball path **replaces** the procedural `emitSweepHops` lateral movement for that play. The engine still resolves the outcome (dominant tackle / line break / play on / etc.) and the `CARRY_RESOLVED` event is preserved — the choreography system only replaces the in-phase ball-path keyframes, never the final ball position or outcome logic.

**Lookup key.** `FIRST_PHASE_CHOREOGRAPHIES` is keyed by the exact string its consumer looks up — NOT a uniform `prevPhase:outcomeKey` scheme. First-phase plays are looked up by the **bare `playType`** (`FirstPhaseEvent.applyChoreography` sets `choreoKey = playType`), so they register under bare keys. The scrum **wheel** is looked up by `ScrumEvent` under the literal `'SCRUM:wheel'`. A prefixed key for a bare-key consumer never resolves and silently leaves the play on procedural animation.

Currently registered choreographies:

| Key | Consumer | Description |
|---|---|---|
| `crash_ball` | `FirstPhaseEvent` | #10 → #12 crash ball |
| `out_the_back` | `FirstPhaseEvent` | Backs sweep |
| `kick_decision` | `FirstPhaseEvent` | Kick play off the first phase |
| `SCRUM:wheel` | `ScrumEvent` | Scrum wheel |

---

### KickReturn

Runs after `KickOff`, `BoxKick`, or `TacticalKick`. The carrier is **whoever caught the kick** in the prior phase, tracked via `state.kickReturnCarrier` (set by each kick handler before transitioning to `KickReturn`, cleared at the start of this handler). Falls back to `randomPlayer(attackTeam)` if unset.

**Pod pickup.** After the catcher is identified, a tactics-keyed roll may swap the carrier to a trailing back-row pod runner — the catcher pops the ball off rather than running it themselves. Probability is `POD_PICKUP_PCT[attackingStyle]` (`keep_it_tight` 50% / `balanced` 30% / `wide_wide` 15%); on hit, `pickPodCarrier(attackTeam, state, attackSide, catcher)` picks a weighted forward over back-row + locks only (`POD_PICKUP_WEIGHTS`: back row 18/18/15, locks 6/6 — props + hooker excluded, they're trailing in midfield). Falls through to the catcher when no eligible pod runner is on the field. The swap is silent — no extra commentary line; downstream phase outcome commentary (`line_break` / `dominant_tackle` / `play_on` / `dominant_carry`) names the pod runner automatically via `primary: carrier`. The pop **is** a real pass, so a `PASS_COMPLETED` is credited to the catcher when the swap fires (the catcher's only action this phase; mirrors the offload-chain pass credit). No extra RNG draw.

```typescript
carrier  = state.kickReturnCarrier ?? randomPlayer(attackTeam)
if (rng(1, 100) <= POD_PICKUP_PCT[attackTeam.tactics.attackingStyle]) {
  const pod = pickPodCarrier(attackTeam, state, attackSide, carrier)
  if (pod) { podPop = carrier; carrier = pod }   // PASS_COMPLETED credited to podPop (the catcher)
}
defender = pickKickReturnDefender(defendTeam, state, defSide)   // chase pack
```

`runMetres` (Step 2) uses the swapped carrier's pace/agility — the pod runner is the one running into contact, so their stats drive the kick-return run. The catcher's brief return-and-pop isn't modelled separately beyond the `PASS_COMPLETED` credit (consistent with the per-phase abstraction elsewhere). Tuning: `POD_PICKUP_PCT` + `POD_PICKUP_WEIGHTS` in `src/engine/balance/carrying.ts`.

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

**Try-Line Defence proximity penalty (`TRY_LINE_DEFENCE` in `src/engine/balance/carrying.ts`):**

Inside the opposition 22, compressed space penalises attacker evasion and rewards defender collision-resistance. Applied via `tryLineDefenceBonus()` in `FieldPosition.ts`; consumed by `OpenPlayEvent`, `FirstPhaseEvent`, and the `PenaltyHandler` tap-and-go path.

| Zone | Outer edge | Evasion penalty (attacker) | Collision resist (defender) |
|---|---|---|---|
| Opposition 22 (outer) | 22m from try line | −2 | +3 |
| Red zone | 10m from try line | −3 | +6 |
| Goal-line defence | 5m from try line | −6 | +10 |

The modifiers are applied additively on top of `attackMod` / `defendMod` before the evasion roll; the collision-resist bump is added to `defendMod` in the collision step.

**Step 3 — Evasion:**

```
evasionScore = (ballCarrier.agility + ballCarrier.pace) / 2 + rng(1,20) + attackMod
defenseScore = (defender.positioning + defender.pace) / 2 + rng(1,20) + (defendMod + backfieldPenalty)
```

| Margin | Result | Gain |
|---|---|---|
| ≥ 20 | `line_break` → Breakdown (or TryScored if `isTryScoredAt(ballX + dir × gain)`) | `rng(10, 25)` m × pace factor, floored at 5m (`OPEN_PLAY_VALUES.lineBreakMetres` + `LINE_BREAK_PACE`) |
| < 20 | Proceed to Step 4 | — |

**Pace-scaled gain (v2.196a).** The carrier's `currentStats.pace` scales the random 10-25m range multiplicatively. Linear interpolation between two anchors lives in `OPEN_PLAY_VALUES.LINE_BREAK_PACE`: `pace 90 → factor 1.0` (wings keep the full range), `pace 40 → factor 0.25` (a prop's break collapses to ~5-11m as defenders chase back). Below the floor the factor clamps to `paceFactorMin = 0.25`; above the ceiling the factor clamps to `paceFactorMax = 1.0`. The result is then floored at `minGainMetres = 5`. Tactic mods (`defensiveLineBreakBonus`, `backfieldLineBreakGainBonus`) stack additively on top in the event handlers — they model defensive positional failure, not attacker speed, so even a prop benefits when the cover is out of position. Fatigue feeds in naturally because `currentStats.pace` already drops with stamina decay.

Predicted gain ranges by carrier (before tactic mods, validated v2.196a):

| Carrier (typical pace) | Factor | Range |
|---|---:|---|
| Wing pace 95 | 1.00 | 10-25m |
| Centre pace 80 | 0.80 | 8-20m |
| Back-rower pace 70 | 0.60 | 6-15m |
| Lock pace 60 | 0.40 | 5-10m |
| Prop pace 50 | 0.20 | 5m |
| Prop pace 40 | 0.00 | 5m |

**Line break chain.** A line break that doesn't score on the first carry hands a sustained-attack edge to the next phase. The `BreakdownEvent` that follows reads `lastEvent.outcome === 'line_break'` and folds `CARRY_HANDOFF_BONUSES.lineBreak` (15) into both the current breakdown's `attackBonus` (cleaner ball) and the post-breakdown `state.breakdownMod.attack` (the very next carry runs with attack +15). The same fork point's `dominant_carry` case adds only `CARRY_HANDOFF_BONUSES.dominantCarry` (6) and only to the current breakdown — no next-phase boost. See [Carry → breakdown handoff constants](#carry--breakdown-handoff-constants) below.

**Step 3.5 — Offload.** A carrier heading into contact (evasion didn't break the line) may unload the ball to a position-matched supporting teammate. Lives in `src/engine/events/offloadChain.ts`; tuning in `src/engine/balance/offload.ts`. All three carry phases call `tryOffloadChain(...)` between the initial `resolveOpenPlay` and the final `CARRY_RESOLVED`.

The trigger rate is the attacking team's `tactics.offloadStrategy` dimension on `TeamTactics` — `cautious` (8%), `balanced` (20%), `offload_freely` (35%). The manager picks via the tactics modal (`OFFLOAD_STRATEGY_OPTIONS` in `TacticsMenu.ts`); the AI sits on the team's authored `suggestedTactics.offloadStrategy` baseline, flipping to `offload_freely` inside `AI_INTENT_CHASING` (trailing late) or `cautious` inside `AI_INTENT_PROTECTING` (leading late) via the standard `AITacticalDirector` overlay.

Each chain link consumes the outcome RNG stream as follows (always — never short-circuited on pool checks, for determinism):
1. `rng(1, 100)` trigger roll vs `OFFLOAD_VALUES.attemptPctByStrategy[attackTeam.tactics.offloadStrategy]`.
2. Receiver pool: `availableForwards` if carrier is a forward (id ≤ 8), else `availableBacks`, excluding the current carrier. If empty, the link exits.
3. `rng(0, pool-1)` picks the receiver.
4. New defender pool: `onFieldPlayers(defendTeam)` excluding the current defender. If empty, the link exits.
5. `rng(0, defPool-1)` picks the new defender.
6. Catch gate: `rng(1, 100) <= knockOnPct(catcher.handling, clockInRed) + OFFLOAD_VALUES.catchHandlingPenalty` (catch is +10 harder than a normal pass — under-pressure unload). On knock-on, the chain terminates and the phase short-circuits to a scrum (possession flips via the existing `KNOCK_ON` reducer); catcher gets the `knockOns++` attribution.
7. On catch: fresh `resolveOpenPlay(catcher, newDefender, baseAttackMod + OFFLOAD_VALUES.secondCarryAttackBonus (10), baseDefendMod, dlCollision)`. The +10 attack bonus on evasion reflects the defensive line scrambling. If the new carry is a line break, the chain exits. Otherwise loops (up to `OFFLOAD_VALUES.maxChain` = 2).

Original carrier stat credit on every chain link (caught or knocked on) lands via an intermediate `CARRY_RESOLVED { metres: 0, outcome: 'play_on' }` — credits the prev carrier `carries++` and the prev defender `tacklesAttempted++` / `tacklesMade++` (the tackle was made; the ball just got away). The intermediate event also carries an `assistTackler` drawn from the forward-weighted assist pool (back row + locks heavy, hooker occasional), so each chain link credits two defenders per the standard made-tackle accounting. Telemetry implication: per chain link the primary defender gets an extra `tacklesAttempted++` plus the assist gets `tacklesAttempted++` and `tacklesMade++`, so offload-heavy matches show slightly inflated tackle-attempted counts. The new-link defender (next iteration's `currentDefender`) is drawn via `pickPrimaryDefender(defendTeam, state, defSide, catcher, currentDefender)` — channel-aware on the new carrier's slot, excluding the just-picked defender.

Stat fields on `PlayerMatchStats`: `offloadsAttempted` (bumped on every offload roll that completes a pool pick — i.e. an actual attempt, not a no-pool skip) and `offloadsCompleted` (bumped on successful catch). A separate `PASS_COMPLETED` rides alongside `OFFLOAD_COMPLETED` to credit the pass — same accounting as every other completed pass.

New narration outcome keys: `offload_attempt` (intro step naming offloader + catcher) and `offload_knock_on` (terminal step on failed catch). Successful chains use the existing collision-outcome keys (`line_break`, `dominant_carry`, `play_on`, `dominant_tackle`) on the final carrier's resolution.

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

**Tackle statistics:** `tackles.attempted` is incremented for `dominant_tackle`, `dominant_carry`, `play_on`, and `line_break` — credited to the **primary** defender (picked via `pickPrimaryDefender` — channel-aware, see below). `tackles.made` is incremented for `dominant_tackle`, `dominant_carry`, and `play_on` (same primary defender). On a `line_break` that **does not** reach the try line, a cover tackler is selected via `pickCoverDefender(defendTeam, state, defSide)` (`src/engine/FieldPosition.ts`) — weighted pick over the on-field back three (fullback 60%, each wing 20%, degrading to any on-field back) — and credited with `tacklesMade++` plus the team-level `tackles[defSide].made++`. The initial defender keeps the missed tackle.

**Channel-aware primary defender** (`pickPrimaryDefender(team, state, side, carrier)`). The defender on every `CARRY_RESOLVED`-emitting carry path is drawn from a weighted pool chosen by the carrier's matchday slot — replacing the historical uniform-random pick that biased tackle leaderboards toward backs. Three channels (tables in `src/engine/balance/tackling.ts`):
- **Hard channel** (carrier slot 1-9 — forward carry or scrum-half pickup): back row × 18/18/15, locks × 14/14, front row × 7/8/7, plus token close-channel centres × 4/3.
- **Midfield channel** (carrier #10 or #12): centres × 18/12, back row × 12/12/8, fly-half × 3, locks × 4/4.
- **Wide channel** (carrier #11/#13/#14/#15): wings × 18/18, fullback × 14, centre 13 × 12, back row × 3/3.

KickReturn uses a **flat forward-weighted** chase-pack table (`pickKickReturnDefender`) — back row × 18/18/14, hookers × 10, locks × 10/10, props × 6/6, wings × 4/4, fullback × 3 — with no carrier awareness. The offload chain calls `pickPrimaryDefender` per chain link using the new catcher as the channel input, with the previous defender excluded via the optional `exclude` parameter.

**Assist tackler.** Every made outcome (`dominant_carry`, `play_on`, `dominant_tackle`) credits a second defender — the support player arriving at contact. Drawn via `pickAssistTackler(team, state, side, primary)` from a forward-heavy table (back row × 20/20/15, locks × 10/10, hooker × 5) excluding the primary. The reducer bumps `tacklesAttempted++` AND `tacklesMade++` on both player and team scope, keeping the team-level `made ≤ attempted` invariant balanced. Line breaks credit no assist (cover tackler already handles the non-try finisher). Assists are stat-only — no commentary fires for them, since they happen on the majority of carries and would flood the feed.

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
| all four collision outcomes | primary defender (channel-aware pick) | `tacklesAttempted++` |
| `line_break` | ballCarrier | `lineBreaks++`, `defendersBeaten++` |
| `line_break` (non-try only) | coverTackler (FB 60% / wing 20% each) | `tacklesMade++` |
| `dominant_carry` | ballCarrier | `defendersBeaten++` |
| `dominant_tackle` | primary defender | `tacklesMade++`, `dominantTackles++` |
| `dominant_carry` or `play_on` | primary defender | `tacklesMade++` |
| `dominant_carry` / `play_on` / `dominant_tackle` | assist tackler (forward-weighted) | `tacklesAttempted++`, `tacklesMade++` |
| Offload attempt (chain link, pool non-empty) | offloader | `offloadsAttempted++` |
| Offload caught | offloader | `offloadsCompleted++`, `passes++` (via separate PASS_COMPLETED) |
| Offload knocked on | catcher | `knockOns++` (via existing KNOCK_ON reducer) |
| Offload chain link (intermediate CARRY_RESOLVED) | prev carrier | `carries++` (metres 0) |
| Offload chain link (intermediate CARRY_RESOLVED) | prev defender | `tacklesAttempted++`, `tacklesMade++` |

KickReturn: total metres = `runMetres + res.gainMetres` (combined into `metresCarried`) — but when an offload fires, the new carrier picks up the ball at the contact point and `runMetres` is dropped (only the chain's final-carry metres are credited).

---

## Breakdown

### Player selection

```typescript
forwardPool = attackTeam.players.filter(p => p.id <= 8 && p.id !== carrierId)
backRow     = defendTeam.players.filter(p => p.id >= 6 && p.id <= 8)
defendPack  = defendTeam.players.filter(p => p.id <= 8)
```

Attacking supporters are sampled at random (without replacement) from the forward pool. The count is set by `attackingBreakdown`: `commit_numbers` = 4, `balanced` = 3, `minimal_ruck` = 2. The defending jackal is chosen at random from the back row (ids 6–8). The full defending pack (ids 1–8) is also passed for use by the `counter_ruck` branch.

**Tactical Breakdown Commitment (`AttackingBreakdown` & `DefendingBreakdown`):**
- **Attacking:** Supporter count is driven by `attackTeam.tactics.attackingBreakdown`: `commit_numbers` commits 4 forwards; `balanced` commits 3 forwards; `minimal_ruck` commits 2 forwards. Body count directly drives ARS via the stacked-score formula — no separate flat bonus.
- **Defending:** Strategy is driven by `defendTeam.tactics.defendingBreakdown`:
  - `jackal`: Relies on a single back-row specialist's breakdown stat.
  - `counter_ruck`: The 4 strongest defenders (by `strength×0.6 + breakdown×0.4`) contest the ruck using the stacked-score formula.
  - `shadow`: Concedes ruck ball (DTS = rng(1,10)) to maintain a perfectly aligned defensive line.

**Next-phase carry-over (`state.breakdownMod`):** Committing players to the ruck leaves fewer available for the next phase. After every breakdown the engine sets `state.breakdownMod.attack` and `state.breakdownMod.defend` which are consumed (and reset to zero) by the very next carry phase (PhasePlay after Breakdown, or FirstPhase/KickReturn in other contexts), where they are applied as modifiers to the evasion and defence scores respectively.
- **Defending (`breakdownMod.defend`)**: The tactic-driven value is passed generically to the next phase.
- **Attacking (`breakdownMod.attack`)**: Only the momentum bonus (`lineBreakHandoff`) is passed generically in state. The tactical modifier (`TACTIC_MODIFIERS.breakdownAttack`) represents the presence/absence of supporting runners in the backline, and therefore **only applies conditionally in OpenPlayEvent if the team attempts to go wide**. If the team keeps it tight (!goWide), this modifier is ignored, creating a direct rock-paper-scissors synergy with `attackingStyle`.
- **On a line break carry**: `breakdownMod.attack` receives `CARRY_HANDOFF_BONUSES.lineBreak` (15) — the next carry runs on the front foot, modelling the sustained-attack effect that turns a line break into a try over the next 1-2 phases.

| Tactic | Effect on next carry phase |
|---|---|
| `commit_numbers` | attack −20 evasion (ONLY on wide plays; forwards still arriving) |
| `balanced` | 0 |
| `minimal_ruck` | attack +35 evasion (ONLY on wide plays; extra players on feet outside) |
| `counter_ruck` | defend −8 (pack committed to ruck) |
| `jackal` | 0 (one player, line intact) |
| `shadow` | defend +10 (full defensive line set) |

On turnover or penalty, `breakdownMod` is reset to `{0, 0}` immediately — possession changes reset the context. On Scrum, `breakdownMod` is also reset so stale mods from the BoxKick → Scrum → OpenPlay path don't carry through.

### Resolution

Both attack and defense use a **diminishing-return stacked score** (`stackedScore`). Players are sorted best-first (by their two primary stats), then each contributes their weighted score with the weights `[1.0, 0.5, 0.25, 0.2]` for positions 1–4. The raw weighted sum is divided by 2 to keep the stacked score roughly on the scale of a single player's contribution (3 supporters / balanced sum to 1.75, ≈ 0.875× after halving).

```
stackedScore(players, leadStat, supportStat):
  sort players descending by (leadStat×0.6 + supportStat×0.4)
  sum = Σ (leadStat×0.6 + supportStat×0.4 + (discipline−50)×0.15) × WEIGHTS[i]
  return sum / 2
```

**ARS (Attack Ruck Score):**
```
ARS = stackedScore(supporters, breakdown, strength) + rng(1,20) + attackBonus
    + ruckRetentionBonus (9)                  ← carrying team's own-ruck edge / penalty-rate calibration
    + (fastestBackRowPace − 50) × 0.3         ← first-to-arrive pace edge
attackBonus = (CARRY_HANDOFF_BONUSES.lineBreak (15)    if previous play was line_break,
               CARRY_HANDOFF_BONUSES.dominantCarry (6)  if previous play was dominant_carry,
               0 otherwise)
            + homeEdge.attack
```

**Ruck retention bonus.** A flat `+9` to ARS in `BREAKDOWN_VALUES` — the ball-carrying team's inherent advantage securing its own ruck. It is also the league penalty-rate calibration knob against the current ruck-score scale: it shifts the whole margin distribution up, pulling **both** holding-on penalties and breakdown turnovers down together (vs lowering the turnover margin, which would convert penalties into an unrealistic turnover glut). Tuned to land holding-on ≈ 10% of attacking breakdowns (clean 40.6% / slow 37.6% / turnover 9.6% / penalty 12.1% of contests).

**Pace arrival edge.** The fastest loose forward (back row) on each side races to the ball. Each side adds `(fastestBackRowPace − paceArrivalPivot) × paceArrivalWeight` (pivot 50, weight 0.3) to its score — attack → ARS, the contesting defender → DTS (jackal and counter_ruck; shadow gets none, those defenders retreat into the line). The pace rep is measured **symmetrically** on both sides (same pool: back row; same aggregation: max, computed in `BreakdownEvent` and passed into the resolver), so the **net** margin effect is a pure pack-pace differential — a faster pack reaches the breakdown first and secures it (or jackals it) — not an artefact of which random supporters were committed. A 15-pt pace edge ≈ 4.5 margin points. Constants in `BREAKDOWN_VALUES` (`src/engine/balance/breakdown.ts`).

Constants live in `CARRY_HANDOFF_BONUSES` in `src/engine/balance/breakdown.ts`. They're outcome-driven (look at the previous CARRY_RESOLVED), not tactic-driven — kept out of `TACTIC_MODIFIERS` so that lookup table stays a pure tactic-keyed Record. On a line break the same bonus is also folded into `state.breakdownMod.attack` so the very next carry phase runs on the front foot (see [Next-phase carry-over](#next-phase-carry-over-statebreakdownmod) above).

**DTS (Defensive Turnover Score):**
- **jackal**: `breakdown×0.7 + strength×0.3 + (discipline−50)×0.15 + (fastestBackRowPace−50)×0.3 + rng(1,20)`
- **counter_ruck**: `stackedScore(top4defenders, strength, breakdown) + (fastestBackRowPace−50)×0.3 + rng(1,20)`
- **shadow**: `rng(1,90)` (no pace term — shadow defenders retreat into the line rather than contest)

After the active branch resolves, `DTS += defendBonus` (currently sourced from `homeEdge.defend` only). Together with the `attackBonus` addition above this is the breakdown channel of [Home Advantage](#home-advantage): when the home team has possession, `homeEdge` bumps ARS; when they're defending the ruck, it bumps DTS.

The top 4 defenders for `counter_ruck` are the 4 forwards with the highest `strength×0.6 + breakdown×0.4` score.

Effect of player count on ARS (same-quality supporters, typical stats):

| Tactic | Supporters | Weight sum | ARS multiplier vs balanced |
|---|---|---|---|
| `minimal_ruck` | 2 | 1.5 | ×0.86 |
| `balanced` | 3 | 1.75 | ×1.00 (baseline) |
| `commit_numbers` | 4 | 1.95 | ×1.11 |

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
attackForwards  = onFieldPlayers(attackTeam, state, attackSide).filter(p => p.id <= 8)   // props, hooker, locks, flankers, no. 8
defendForwards  = onFieldPlayers(defendTeam, state, flipSide).filter(p => p.id <= 8)
attackFrontRow  = attackForwards.filter(p => p.id <= 3)   // loosehead, hooker, tighthead
defendFrontRow  = defendForwards.filter(p => p.id <= 3)
attackHooker    = attackForwards.find(p => p.id === 2) ?? attackForwards[0] ?? attackOnField[0]   // fallback chain
defendHooker    = defendForwards.find(p => p.id === 2) ?? defendForwards[0] ?? defendOnField[0]
```

All eight forwards contribute to the pack score. The front rows (ids 1–3) get the per-player penalty stat credits. When a scrum penalty fires the cited offender is **picked uniformly at random** from the offending side's front row via `pickFrontRowOffender(frontRow, hookerFallback)` — a prop or hooker can be named. The hooker is the fallback when the front row is empty (multiple cards have taken it apart), and it chains further to `forwards[0]` and then any on-field player.

### Resolution

```
packScore      = sum(setPiece×0.6 + strength×0.4) across the on-field forwards
packDiscipline = avg(discipline) across the on-field forwards
noise          = 25.5 + (rng(1,50) − 25.5) × disciplineVarianceMult   // mean-preserving
finalScore     = packScore + (packDiscipline − 50)×1.2 + intensityScrumMod + noise
```

`packScore` is a **sum**, not an average — so a pack a man down (forward in the sin-bin or sent off) loses ~12% of its score (~72 from a ~576 base) and is materially weaker at the scrum. `onFieldPlayers(team, state, side)` filters out sin-binned / sent-off forwards before the pack is assembled. `packDiscipline` stays as an average (per-player attribute, not a pack aggregate). `rng(1,50)` per side gives a margin distribution that's triangular on `[-49, +49]` with peak at 0; tuned with the bucket thresholds below to land scrum penalty rates inside the real-League 10-15%-per-scrum band.

**Tactic hooks (intensity + discipline).** `intensityScrumMod` (`TACTIC_MODIFIERS`, `high: +12 / balanced: 0 / light: −12`) is a flat shove edge added to each side's `finalScore` — push harder for the team-wide fatigue cost. `disciplineScrumVarianceMult` (`risky: 1.4 / balanced: 1.0 / cautious: 0.6`) scales each side's noise **around its mean** (`(rngSpan+1)/2 = 25.5`), so it fattens or narrows the margin tails without shifting the mean — `balanced` packs are byte-identical to the pre-tactic resolver. The effect is "chancing the hit": a `risky` pack on even terms wins ~12.8% attacking penalties (vs 7.4% balanced) **but** concedes ~1.0% on its own put-in (vs 0.5%); `cautious` is the reverse (~3.3% won, ~0.1% conceded). When one pack badly out-muscles the other the downside is muted (the losing tail can't reach the defending-penalty bucket on the dominant side's ball) — a realistic property, not a separate rule.

The defending pack's final score is subtracted from the attacking pack's final score to determine the margin:

| Margin | Result | Probability (equal packs) |
|---|---|---:|
| > +30 | `attacking_dominant_penalty` → Penalty (attacking team keeps possession) | **7.6%** |
| −15 to +30 | `stable_win` → FirstPhase | **68.6%** |
| −35 to −16 | `wheel` → Scrum | **19.6%** |
| ≤ −36 | `defending_dominant_penalty` → Penalty (possession flips to defending team) | **4.2%** |

Attacker:defender penalty ratio ~1.8:1 — reflects the real-rugby put-in advantage. Effective per-scrum-sequence penalty rate (accounting for wheel re-rolls): `0.118 / (1 − 0.196) ≈ 14.7%`. All thresholds in `SCRUM_VALUES` (`balance/scrum.ts`).

**Wheel cap.** Consecutive wheels in a single scrum sequence are bounded by `SCRUM_VALUES.wheelCap` (currently `2`). The counter lives at `state.consecutiveWheels` — incremented by the `SCRUM_RESOLVED` reducer when `outcome === 'wheel'`, reset to 0 on any other scrum outcome, so a fresh scrum sequence always starts at 0. Once the counter has hit the cap, the next wheel-band resolution is promoted to a penalty: `attacking_dominant_penalty` when the 3rd-contest `margin >= 0`, `defending_dominant_penalty` otherwise. The natural penalty branches stay untouched; the promoted branch prepends a `scrum_reset_cap` announcement step so the commentary flags why the penalty fired ("Three resets — the referee's lost patience. Penalty awarded.").

### Ball movement

None.

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| `attacking_dominant_penalty` | attacking front row (ids 1–3), each | `scrumPenaltiesWon++` |
| `attacking_dominant_penalty` | defending front row (ids 1–3), each | `scrumPenaltiesConceded++` |
| `attacking_dominant_penalty` | the cited offender (random from defending front row) | `penaltiesConceded++` via the `PENALTY_AWARDED` reducer |
| `defending_dominant_penalty` | defending front row (ids 1–3), each | `scrumPenaltiesWon++` |
| `defending_dominant_penalty` | attacking front row (ids 1–3), each | `scrumPenaltiesConceded++` |
| `defending_dominant_penalty` | the cited offender (random from attacking front row) | `penaltiesConceded++` via the `PENALTY_AWARDED` reducer |

The front-row aggregate stats credit every prop / hooker on the dominated side, so team-level scrum-strength data stays consistent regardless of which front-rower the referee cited. The general `penaltiesConceded` counter only moves for the picked offender.

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
| ≥ −10 | `clean_catch` → OpenPlay |
| < −10 | `steal` → OpenPlay (possession flips) |

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

## Kick Decision Director

Unified kick-or-carry decision module (src/engine/KickDecisionDirector.ts) — runs at the top of every carry-phase entry (`PhasePlay`, `FirstPhase`, `KickReturn`) and replaces both the per-phase inline gates that lived in those handlers pre-v2.83a AND the dedicated Breakdown slow_ball → BoxKick gate. One decision tree, one set of inputs, one routing table.

### Decision tree

```
1. Compute base kick probability from KICK_PROBABILITIES[plan][zone].
     - possession: own22 66%, ownHalf 40%, oppHalf/opp22 15%
     - kicking: own22 90%, ownHalf 65%, oppHalf/opp22 15%
     - balanced: own22 75%, ownHalf 50%, oppHalf/opp22 10%
2. If state.lastBallQuality === 'slow': base += SLOW_BALL_KICK_BONUS (10pp).
3. Roll rng(1, 100). Miss → return { kick: false } (carry path).
4. Pick FAMILY from FAMILY_WEIGHTS[zone][plan]:
     - clearance: get out of trouble (own 5m / own 22 dominant)
     - territory: contestable kick to gain ground (own half)
     - fifty_22:  deliberate corner attempt (own half outside 22)
     - attacking: cross-field / grubber for regather (opposition half)
5. Pick KICKER per family (SCRUM_HALF_KICKER_PCT):
     - clearance:  50% #9 box kick / 50% #10 touch-finder
     - territory:  40% #9 box kick / 60% #10
     - fifty_22:   40% #9 / 60% #10
     - attacking:    0% #9 / 100% #10
6. Clearance only — pick clearanceStyle (LONG_AND_OFF_PCT):
     - in own 22:   85% long_and_off (find touch — opposition lineout)
     - in own half: 25% long_and_off (risk of giving up the lineout)
7. Attacking only — pick attackingSubType:
     - 65% cross_field / 35% grubber
```

Outputs `{ kick: true, family, kicker, clearanceStyle?, attackingSubType? }` (or `{ kick: false }`). `buildKickTransition()` then composes the PhaseResult: `nextPhase = BoxKick (#9)` or `TacticalKick (#10)`, emits `KICK_INTENT_SET` so the kick handler reads the family + sub-choice from `state.pendingKick` and branches resolver math.

### Advanced (numeric) kicking override

When the manager has opted into advanced tactics, `attackTeam.tactics.advanced` is present and its `kicking[zone]` profile **replaces** the preset-keyed tables for the human team only (the AI and old saves never carry `advanced`, so they always take the preset path):

- **Step 1 base probability** reads `advanced.kicking[zone].frequency` directly instead of `KICK_PROBABILITIES[plan][zone]`. The four zones are addressed individually here, so `oppHalf` and `opp22` are no longer collapsed to one value as they are in the preset table.
- **Step 4 family selection** reads `advanced.kicking[zone].types` (raw relative weights across `clearance / territory / fifty_22 / attacking`) instead of `FAMILY_WEIGHTS[zone][plan]`. `pickFamily()` normalises by the weight sum, so advanced weights need not total 100; when they do (every preset cell) the comparison is the exact pre-advanced integer `roll <= cum`, so **preset determinism is byte-identical**.

The advanced UI (`AdvancedTacticsPanel.ts`, opened from `TacticsMenu`) is **zone-major**: one card per zone holds the kicking game plus a "with ball" group (attacking-style + offload sliders, attacking-breakdown pick) and a "defending here" group (defending-breakdown, backfield, defensive-line picks); two single sliders (intensity, discipline) sit outside the cards. It labels `territory` as **"Kick to Compete"** and `attacking` as **"Cross Field/Grubber"** (data keys unchanged) and exposes only the kick-type dials relevant to each zone: `own22` / `ownHalf` show all four, while `oppHalf` / `opp22` expose only `territory` + `attacking` (clearance and 50:22 stay at their seeded weight of 0). Entering advanced mode seeds every dimension from the current preset via `seedAdvancedTactics()`; picking any preset pill drops the override and reverts.

Steps 2–3 and 5–7 are unchanged — the slow-ball bonus, the `rng(1,100)` rolls, the kicker pick, and the red-clock closeout all still layer on top of the advanced baseline (a manager's slider sets the *tendency*; match state still bends it). Types: `AdvancedTactics` / `AdvancedKicking` / `ZoneKickProfile` in `src/types/team.ts`; the preset→advanced seed (used when the UI enters advanced mode) is `seedAdvancedTactics()` in `src/engine/advancedTactics.ts`, built from the same `KICK_PROBABILITIES` / `FAMILY_WEIGHTS` tables so the handoff is lossless.

### Zone-aware tactics seam (other dimensions)

The same per-zone idea extends to the non-kicking dimensions via `src/engine/tacticsResolve.ts`. The discrete defensive/breakdown dims — `defensiveLine`, `backfieldDefence`, `attackingBreakdown`, `defendingBreakdown` — are read through `eff<Dim>(state, team)` accessors instead of `team.tactics.<dim>` directly. Each resolves the dimension for the team's **current zone** via `zoneForSide(state, side)` (the ball's zone relative to that team's own try line — so attacking dims read the carrier's zone, defensive dims the defending team's own-end zone). When the team has no advanced override the accessor short-circuits to the preset enum **without reading the ball**, so preset matches are byte-identical and cost nothing extra. The per-zone slider dims (attackingStyle, offloadStrategy) and the single-slider dims (intensity, discipline) live on the same `AdvancedTactics` shape (`src/types/team.ts`) and resolve through the same module via `effStyleScalar` / `effOffloadScalar` / `effIntensityScalar` / `effDisciplineScalar`, each interpolating piecewise through the preset bucket values.

**`attackingGamePlan` residuals (no advanced slider).** Beyond kick frequency/type, the preset Game Plan also carried four small execution effects. Rather than a standalone slider, advanced mode **folds each into its adjacent control** (and preset matches keep the flat gameplan tables, so they stay byte-identical):
- **50:22 accuracy** → derived from the zone's 50:22 kick-type weight via `effFiftyTwoBonus(state, team, table)` (commit more of your mix to 50:22 → execute it better; `FIFTY_22_COMMITMENT`, `weight·0.12` clamped to +8pp).
- **kick distance** → `0` in advanced (kicker `kicking` stat governs distance).
- **handling pressure** → `0` in advanced (the Offload slider owns handling risk).
- **forward fatigue** → `×1` in advanced (the Attacking-breakdown `commit_numbers` pick already owns forward fatigue).

The three fixed-value residuals route through `effGamePlanResidual(team, presetTable, advancedValue)` (advanced → `advancedValue`; preset → `presetTable[attackingGamePlan]`).

### Red-clock game management

Before the territory tree runs, `decideKick` checks `redClockCloseout()` — a full-time-only override (`state.clock.clockInTheRed && state.clock.halfTimeDone`, so it never fires before half time). When the next stoppage will end the match, kick-or-carry becomes a game-management call keyed off the score margin of the team in possession:

```
margin = score[possession] − score[opponent]
- margin <= 0 (trailing or level): return { kick: false } — keep the ball
  alive, never kick it to the opposition (a draw is treated like a loss).
- margin > 0 (leading):
    - in opp 22 with margin <= keepAttackingMaxMargin (7): defer to the
      normal tree — keep attacking for the try / bonus / bigger margin.
    - otherwise roll closeOutPct = min(closeOutMaxPct,
      closeOutBasePct + margin·marginStepPct + (own half ? ownHalfBonusPct : 0)):
        - hit  → force { family: 'clearance', clearanceStyle: 'long_and_off' }
                 → kick to touch → Lineout stoppage → endMatch.
        - miss → defer to the normal tree (variety; a botched touch-finder
                 just continues play).
```

The closeout is probabilistic and scales with the lead (bigger lead / deeper position = more eager to kick out). It applies to **both sides** — open-play kicks are already auto-decided here for the human team too (the manager sets the game plan, not individual kicks). Constants live in `RED_CLOCK_CLOSEOUT` (`balance/kickDecision.ts`). Mirrors the `PenaltyHandler` `tap_and_kick_dead` precedent for late penalties.

### State carriers

- **`state.lastBallQuality: BallQuality`** — set by Breakdown clean/slow outcomes; reset to 'clean' on any `PHASE_CHANGED` that doesn't transition to `PhasePlay`. Feeds the slow-ball bonus in step 2.
- **`state.pendingKick: PendingKick`** — set by `KICK_INTENT_SET` from `buildKickTransition`; cleared by any `PHASE_CHANGED` that leaves a kick phase. Read by `BoxKickEvent` and `TacticalKickEvent` to branch resolver math.

### Resolver routing by family

| Family | Kicker | Phase | Resolver branch |
|---|---|---|---|
| `clearance` long-and-off | #9 | `BoxKick` | `resolveBoxKick(style: 'long_and_off')` → `goes_to_touch` → Lineout (opp throw) |
| `clearance` long-and-on  | #9 | `BoxKick` | `resolveBoxKick()` → standard contestable |
| `clearance` (any)        | #10 | `TacticalKick` | `resolveTacticalKick()` — existing touch-finder math |
| `territory`              | #9  | `BoxKick` | `resolveBoxKick()` — standard contestable |
| `territory`              | #10 | `TacticalKick` | `resolveTacticalKick()` — existing path |
| `fifty_22`               | #10 | `TacticalKick` | `resolveFiftyTwentyTwo(defenderBackfield)` — defender-backfield-gated deliberate attempt |
| `attacking` cross-field  | #10 | `TacticalKick` | `resolveAttackingKick('cross_field')` — aerial contest, chaser is back-three #11/13/14 |
| `attacking` grubber      | #10 | `TacticalKick` | `resolveAttackingKick('grubber')` — bounce-and-chase |

Tuning constants live in `src/engine/balance/kickDecision.ts` (`FAMILY_WEIGHTS`, `SCRUM_HALF_KICKER_PCT`, `LONG_AND_OFF_PCT`, `CROSS_FIELD_VS_GRUBBER_PCT`, `SLOW_BALL_KICK_BONUS`) and `src/engine/balance/kicking.ts` (`FIFTY_22_VALUES`, `ATTACKING_KICK_VALUES`).

---

## Box Kick

Routed to from `KickDecisionDirector` (see [Kick Decision Director](#kick-decision-director-stage-a-e)) when `family ∈ {clearance, territory, fifty_22}` and `kicker.id === 9`. The director's decision is made at the top of `PhasePlay` / `FirstPhase` / `KickReturn`; the dedicated Breakdown slow-ball → BoxKick gate that lived here pre-v2.83a is gone — slow ball now feeds a probabilistic `SLOW_BALL_KICK_BONUS` into the unified decision instead.

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

## Maul

A driving-maul phase reachable only from a clean lineout catch (`LineoutEvent.ts` clean_catch branch). Eight available attacking forwards push against eight available defending forwards; a successful drive advances the ball, can score a try if it crosses the line, and ends either with the ball going to the backs (FirstPhase), the defenders winning the contest cleanly (turnover scrum), or the defenders illegally collapsing the drive (penalty, often a yellow card near their own try line).

### When this phase happens

The maul gate (`MAUL_GATE` in `balance/maul.ts`) is rolled inside `handleLineout` after `resolveLineout` returns `clean_catch`. Probability is zone-driven (distance to the opposition try line) with an attacking-style modifier:

| Zone (metres to opp try line) | Base | `keep_it_tight` (+20pp) | `wide_wide` (-20pp) |
|---|---:|---:|---:|
| Own half (> 50m) | 0% | 0% | 0% |
| Opposition half (22–50m) | 5% | 25% | 0% |
| Opposition 22 (10–22m) | 35% | 55% | 15% |
| Inside opp 10m | 60% | 80% | 40% |

Same gate fires for human and AI — no modal.

### Resolution

Mirrors the scrum's pack-score formula. `MaulResolver.packScore` is a **sum** of `(strength × 0.55 + setPiece × 0.45)` per forward, so a pack down a man (sin-binned, sent off, in-match injured) loses ~12% of its score and is materially weaker. Discipline doesn't enter the score directly — it shows up in stage 2 as a collapse bias.

Two-stage outcome:

1. **Strength margin** (`attackScore + intensityMaulMod + rng(1, 50)` vs `defendScore + intensityMaulMod + rng(1, 50)`):
   - `margin > 0` → attackers winning the push → continue to stage 2.
   - `margin ≤ 0` → defenders stop the maul cleanly → `maul_held` (turnover scrum to defenders, no ground gained).
2. **Cynical-collapse roll** (only on positive margin):
   - `collapsePct = clamp((margin × 0.30) + (max(0, 50 − defendDiscipline) × 0.50) + disciplineMaulCollapseMod, 0, 60)`
   - On hit → `maul_collapse_penalty` (defending side cited, attacking team gets the penalty).
   - On miss → `maul_won` (attacking team gains ground).

**Tactic hooks (intensity + discipline).** `intensityMaulMod` (`TACTIC_MODIFIERS`, `high: +12 / balanced: 0 / light: −12`) is a flat drive edge on each side's stage-1 score: a `high`-intensity attacker wins more mauls and is held (turned over) less; a `high` defender stops more. `disciplineMaulCollapseMod` (`risky: +10 / balanced: 0 / cautious: −8`, pp) biases the **defender's** collapse roll: a `risky` defence cracks more often — collapsing the maul to stop a drive/try illegally, conceding more penalties and yellows (via `MAUL_COLLAPSE_YELLOW`), but yielding fewer clean maul gains; a `cautious` defence rarely collapses and lets the drive go. Both default to 0 so `balanced` mauls are unchanged.

On `maul_won`, the gain distribution is:
- 90% chance: `rng(5, 10)` metres (the normal driving-maul band).
- 10% chance: `rng(15, 25)` metres (the highlight-reel long drive).

The handler then projects the new ball position (`state.ball.x + attackDir(state) * gainMetres`) and checks `isTryScoredAt`. If true → `nextPhase: TryScored` with the hooker as `primaryPlayer` (so `handleTryScored` credits the try to the hooker). Otherwise → `nextPhase: FirstPhase`.

**Maul try narration** is a 3-step event: `maul_drive_strong` announcement (the build), `maul_try` phase_outcome (the grounding — hooker credited), then `try_referee_signal` announcement (ref signal). `CommentaryFeed` stagger-reveals the trio as paced hero beats.

### Outcome table (equal packs, calibration target)

| Outcome | Probability | Next phase | Possession |
|---|---:|---|---|
| `maul_won` | ~45% | FirstPhase (or TryScored if it crossed the line) | attacking side retains |
| `maul_held` | ~50% | Scrum | flips to defending side |
| `maul_collapse_penalty` | ~5% | Penalty | attacking side keeps (and gets the penalty) |

Mismatched packs skew sharply: a strong pack mauling a weak defender drives `maul_won` to ~70%+ and lifts collapse to ~20-25%; a weak pack mauling a strong defender lands mostly in `maul_held`.

### Cards

`maul_collapse` is in `OFFENCE_SPEC` (`balance/discipline.ts`) with `tmoTriggerPct: 0` — TMO is bypassed. `CardHandler.evaluateNewPenalty` has a dedicated `maul_collapse` branch that runs a **direct** zone-scaled yellow check (`MAUL_COLLAPSE_YELLOW`) before falling through to the standard penalty modal:

| Zone (defender's distance to own try line) | Direct yellow % |
|---|---:|
| Inside 5m | 70% |
| Inside 22m | 30% |
| Opposition half | 5% |
| Own half | 0% |

The team-22 cumulative rule still applies on top (a maul_collapse inside the defender's own 22 also bumps the team-22 counter and can trigger a forced yellow on a 4th defensive penalty).

### Ball movement

On `maul_won`: `BALL_REPOSITIONED { x: clamp(state.ball.x + attackDir(state) * gainMetres, 0, 100) }`. On the other two outcomes: ball stays where the lineout was.

### Stat increments

| Outcome | Stats |
|---|---|
| `maul_won` | `state.stats.mauls[attackSide]++`, `state.stats.maulMetres[attackSide] += gainMetres` |
| `maul_collapse_penalty` | `state.stats.mauls[attackSide]++` (counted as a completed maul attempt); penalty offender's `penaltiesConceded++` via the `PENALTY_AWARDED` reducer |
| `maul_held` | none — held mauls become turnover scrums and aren't counted as completed mauls |

No per-player maul stats today (see CLAUDE.md "Maul phase" future-work bullet for the deferred fields).

---

## Penalty

### How a penalty arises

Every penalty flows through one MatchEvent — `PENALTY_AWARDED { offence, offender, offendingSide }` — emitted by the resolver that detected the infringement. Its reducer (`applyMatchEvent.ts`) is the single seam that:
- flips `state.possession` to the non-offending side (`offendingSide === 'home' ? 'away' : 'home'`),
- bumps `offender.matchStats.penaltiesConceded++`,
- resets `state.breakdownMod` to `{0,0}`,
- snapshots the cause onto `state.lastPenalty` so the next tick's `PenaltyHandler` (and the manager-facing modal) knows *why* the whistle blew.

The `PenaltyOffence` taxonomy (`src/types/engine.ts`) covers seven offences. Adding another is a 4-step extension: add the union variant in `engine.ts`, give it a row in `OFFENCE_SPEC` (`balance/discipline.ts`), emit `PENALTY_AWARDED` from the appropriate phase event, and add a `PhaseOutcomeKey` + commentary templates. The `CardHandler` TMO gate is registry-driven so it picks up the new offence automatically.

| `offence` | Emitted by | Offender | Trigger | TMO? |
|---|---|---|---|---|
| `breakdown_infringement` | `BreakdownEvent` (post-resolve `penalty_defending` branch) | `supporters[0]` from the attacking team | breakdown margin ≤ −15 (attacker infringes at the ruck) | no |
| `scrum_infringement` (attacking_dominant_penalty) | `ScrumEvent` | defending hooker | scrum margin > 15 (defending pack collapses) | no |
| `scrum_infringement` (defending_dominant_penalty) | `ScrumEvent` | attacking hooker | scrum margin ≤ −15 (attacking pack collapses) | no |
| `high_tackle` | `OpenPlayEvent` / `FirstPhaseEvent` / `KickReturnEvent` | the defender who attempted the tackle | `tackleInfringement(defender)` returns `'high_tackle'`, gated to non-line-break collisions | **90 %** |
| `dangerous_cleanout` | `BreakdownEvent` (pre-resolve) | random `supporter` from the attacking team | `rng(1,100) ≤ BREAKDOWN_PENALTIES.dangerousCleanoutBasePct + TACTIC_MODIFIERS.dangerousCleanoutAttackMod[attPlan] + TACTIC_MODIFIERS.disciplinePenaltyMod[attDiscipline]` | **90 %** |
| `not_rolling_away` | `BreakdownEvent` (pre-resolve) | the jackal (defending back-row over the ball) | `rng(1,100) ≤ BREAKDOWN_PENALTIES.notRollingAwayBasePct + TACTIC_MODIFIERS.notRollingAwayDefendMod[defPlan] + TACTIC_MODIFIERS.disciplinePenaltyMod[defDiscipline]` | no |
| `offside_at_ruck` | `BreakdownEvent` (post-resolve, on `clean_ball` or `slow_ball` only) | random on-field defender | `rng(1,100) ≤ BREAKDOWN_PENALTIES.offsideAtRuckBasePct + TACTIC_MODIFIERS.offsideAtRuckDefendMod[defLine] + TACTIC_MODIFIERS.disciplinePenaltyMod[defDiscipline]` | no |
| `obstruction` | `OpenPlayEvent` / `FirstPhaseEvent` (in the out-the-back branch) | random attacking forward (the screening forward) | `rng(1,100) ≤ OBSTRUCTION_BASE_PCT + TACTIC_MODIFIERS.obstructionStyleMod[attackingStyle]` | no |

**Breakdown roll order (deterministic):** `dangerous_cleanout` → `not_rolling_away` → `resolveBreakdown` (existing 4-way split) → `offside_at_ruck` (only on clean/slow). Each rolls exactly one `rng(1,100)` when reached. The first pre-resolve hit short-circuits to `Penalty`; the post-resolve `offside_at_ruck` check only fires when the ball was about to enter phase play (no point pinning offside on a turnover or an already-penalty contest).

**Obstruction roll order:** one `rng(1,100)` per out-the-back attempt, fired at the *start* of the wide branch (before any handling gate). The narration step (`obstruction_penalty`) replaces the would-be out-the-back + carry sequence.

**`offside_at_ruck` is tactic-modulated by `defensiveLine`** via `TACTIC_MODIFIERS.offsideAtRuckDefendMod` (`blitz: +6`, `hybrid: +2`, `drift: −2`) — blitz lines push up harder and concede more offside calls.

`SCRUM_RESOLVED` still owns the scrum-specific front-row stat increments (`scrumPenaltiesWon++` / `scrumPenaltiesConceded++` on every player in the dominated/dominant front row). The follow-up `PENALTY_AWARDED` adds the general `penaltiesConceded++` on the picked hooker; that's why a scrum-penalty hooker now carries both counters (the previous shape only bumped `penaltiesConceded` for breakdown penalties — the new shape is symmetric).

### High tackle

`tackleInfringement(defender)` (`src/engine/resolvers/TackleInfringementResolver.ts`) is a pure helper called from the three carry handlers after `resolveOpenPlay` returns, but only when the carry didn't produce a line break (no completed tackle on a line break). It combines the defender's `tackling` + `discipline` (pivoting around 50) with one `rng(1,100)` roll against `HIGH_TACKLE` (`src/engine/balance/discipline.ts`):

```
pct = max(minPct, basePct
                + (50 − tackling)   × tacklingWeight
                + (50 − discipline) × disciplineWeight
                + disciplineMod)
high_tackle if rng(1,100) ≤ pct
```

Current values: `basePct=8`, `tacklingWeight=0.1`, `disciplineWeight=0.1`, `minPct=2.5`. A 50/50 defender sits at 8% per tackle; a 80/75 elite defender drops to the 2.5% floor; a 30/30 weak defender rises to 12%. Realistic match output: ~0.5–1 high tackles per team per match, scaling slightly with squad quality. `disciplineMod` is `TACTIC_MODIFIERS.disciplineHighTackleMod[defendTeam.tactics.discipline]` (`risky: +1.5`, `balanced: 0`, `cautious: −1`), passed in by the carry handler so a risky defence concedes slightly more high tackles.

When fired, the carry handler emits `CARRY_RESOLVED` first (so the carrier still earns the metres — advantage law) and then `PENALTY_AWARDED { offence: 'high_tackle', offender: defender, offendingSide: defSide }`, overriding `nextPhase` to `Penalty`. The narration appends a `high_tackle_penalty` `phase_outcome` step after the carry-outcome step, so the commentary reads "dominant tackle on Smith... high! Penalty against the tackler."

### Interactive pause decision

After `resolvePhase()` sets the phase to `Penalty`, `tick()` first calls `cardHandler.evaluateNewPenalty()` (see [Cards](#cards-yellow--red-20--red-full)). If that defers (TMO triggered → phase transitions to `TmoReview`), the modal is deferred until the card sequence completes 3 ticks later. Otherwise — or for any penalty that's not a TMO trigger — `penaltyHandler.handlePenaltyDecision()` (`src/engine/PenaltyHandler.ts`) runs:

**Silent mode (headless AI fixtures / telemetry / determinism harness):** both sides resolve symmetrically — tap zone (5–10m from try line) + `rng` → `tap_and_go`; `clockInTheRed` + winning → `tap_and_kick_dead`; otherwise → `kick_to_touch`.

**Live mode:**
```
if possession !== humanSide OR NOT inOppositionHalf():
  if clockInTheRed AND possession === aiSide AND score[aiSide] > score[humanSide] → auto-select tap_and_kick_dead
  else if possession === aiSide AND inOppositionHalf() AND tap zone → probabilistic tap_and_go
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
On miss: no score, possession flips to defending team, ballX resets to **defending team's own 22m line**, → **DropOut22** (World Rugby rule — defending team restarts with a 22 drop-out, not a halfway kick-off).

Stat increments: `kicker.kicksAtGoal++`; on success `kicksMade++`; on miss `kicksMissed++`.

### Choice: kick_to_touch

`resolvePenaltyKickToTouch(kicker)` rolls `kickScore = kicker.currentStats.kicking + rng(1, 20)`. A good kick (score ≥ 25) travels 25–45m and finds touch 90% of the time; a poor kick travels 10–20m and finds touch 40% of the time. `BALL_REPOSITIONED` moves `state.ball.x` by `attackDir × distance` (clamped to [5, 95]); `ball.y` snaps to `lineoutFormationY` when touch is found, else an in-field `clearingKickLandingY` (see "Lateral / Y-axis model").

**Finds touch:** possession retained; phase transitions to `Lineout`. Commentary key is distance-aware when the penalty was awarded in the opposition half: `kick_to_touch_close` (landing ≤10m from the try line) or `kick_to_touch_long` (>10m). Own-half penalties that find touch use the plain `kick_to_touch` key. Both distance keys interpolate `{metres}` from the `NarrationStep.metres` field (the exact landing distance from `metresFromOppositionTryLine` at emission time).

**Misses touch:** `POSSESSION_SWAPPED`, `KICK_RETURN_CARRIER_SET` (fullback), phase → `KickReturn`. Commentary key: `kick_to_touch_missed`.

### Choice: tap_and_go

Resolved as a forward hard carry (defence retreating 10m — no breakdown mod on the carry itself). Picks the carrier via `pickHardCarrier`, resolves a collision via `resolveOpenPlay` with defensive-line tactic mods and `tryLineDefenceBonus`. `CARRY_RESOLVED` + `BALL_REPOSITIONED` update stats and field position. The `GameEvent` carries the carry `outcome` so `BreakdownEvent` can apply the standard `CARRY_HANDOFF_BONUSES.dominantCarry` bonus if the carry was dominant. Because this runs in `PenaltyHandler` (outside `PhaseRouter`, which builds `movements` for every other carry phase), the `GameEvent` is hand-given a `[tap-mark, final]` `movements` path so the 2D pitch walks the ball and the carrier-dot follower rides it — presentation-only and deterministic. If the carry scores a try → `TryScored` (carrier threaded via `PENDING_TRY_SCORER_SET`; `handleTryScored` generates the try commentary then → `ConversionKick`); otherwise → `Breakdown` (then normal `PhasePlay` cycle).

### Choice: tap_and_kick_dead *(clock-in-the-red only)*

Available only when `clockInTheRed` is true. The attacking team taps the ball then immediately kicks it into touch, ending the period.

The phase transitions to `Lineout` without setting `penaltyKickToTouchLineout`, so `shouldEndPeriod` returns true and triggers half-time or full-time on the same tick.

Home team: shown as a 4th option in the modal when `clockInTheRed`. Away team AI: auto-selected when `clockInTheRed && score.away > score.home`.

---

## Cards (Yellow / Red 20 / Red full)

The card system layers on top of the penalty seam. Whenever `PENALTY_AWARDED` fires and the phase becomes `Penalty`, `MatchCoordinator.tick` calls `cardHandler.evaluateNewPenalty()` (`src/engine/CardHandler.ts`) **before** running `PenaltyHandler.handlePenaltyDecision`. CardHandler decides whether a card should follow.

### Two trigger paths

1. **Team-22 rule.** Each penalty where the offender's team was *defending* in their own 22 increments `state.cards.teamPenalty22[offendingSide]`. The 3rd-in-22 (`TEAM_22.warnAt`) emits a `team_22_warning` announcement (once per match per side). When the warned side is the human side, `CardHandler.emitAnnouncement` looks up `state.engine.humanCaptainRosterId` in that team's `players[]` and passes the captain's name through `buildAnnounce`'s `captainName` param — the `team_22_warning` bank substitutes `{captainName}` (falling back to "the captain" for the AI side / unset captain). Narrative only; the warning fires identically regardless. The 4th-in-22 (`TEAM_22.cardAt`) issues an immediate yellow on the offender — TMO is skipped — subject to **referee leniency** (see below). The counter is not reset; the 5th–8th in-22 add no further cards (per spec "the fourth penalty triggers the yellow").

2. **Per-offence TMO.** If the team-22 rule didn't already card, CardHandler looks up `OFFENCE_SPEC[last.offence].tmoTriggerPct` and rolls `rng(1,100) <= triggerPct`. Two offences carry a non-zero trigger today: `high_tackle` (90 %) and `dangerous_cleanout` (90 %). On a hit, a single `rng(1,100)` is bucketed by the leniency-adjusted `noCardPct / yellowPct / red20Pct` weights to pre-roll the outcome (see **referee leniency** below). In live mode this enters `MatchPhase.TmoReview` for 3 narrative ticks; in silent mode the narrative is collapsed and the card is applied inline — RNG order is identical so determinism is preserved. **Adding a TMO-eligible offence is a one-line edit** to the `OFFENCE_SPEC` registry — no `CardHandler` change.

**Referee leniency (`SIN_BIN_LENIENCY`).** All three yellow-card routes (team-22 auto-card, TMO yellow outcome, maul-collapse direct yellow) are scaled back when the offending team already has players in the sin bin, reflecting real-referee behaviour. `sinBinLeniencyScale(n)` returns 1.0 / 0.45 / 0.0 for 0 / 1 / 2+ players in the bin. For the team-22 path the scale is applied as a probability (a 1-in-bin team has a 45 % chance the auto-card still fires; 2+ suppressed entirely — one extra `rng(1,100)` call only when the scale is < 1). For the TMO path, `yellowPct` is multiplied by the scale and the reduction moves into `noCardPct`; `red20Pct` is unchanged (a genuinely dangerous high tackle can still earn a red regardless). For maul-collapse, `pct` is multiplied by the scale before the roll — the RNG call always fires, keeping the stream position stable.

**Direct cards** (team-22 rule path, maul-collapse path) issue a two-step narration event: a `card_ref_summons` announcement prepended before the `card_yellow` / `card_red_20` / `card_red_full` line, so `CommentaryFeed` stagger-reveals "ref calls player over → card shown" as two paced beats. TMO-triggered cards are deliberately left as single-step — the 3-tick TMO review (`tmo_intervenes` → `tmo_reviewing` → `tmo_decision_*`) is itself the build-up. `buildAnnounce` accepts an optional `prependKey` arg; `issueCard` passes `summons: true` from the team-22 / maul-collapse paths and `false` from the TMO paths.

### TMO review tick anatomy

| Tick | What happens | Clock |
|---|---|---|
| N | Phase event emits PENALTY_AWARDED + commentary (e.g. "High tackle! Penalty!" from the carry handler, or "Reckless clear-out!" from BreakdownEvent). Phase → Penalty. CardHandler.evaluateNewPenalty looks up `OFFENCE_SPEC[offence].tmoTriggerPct`, rolls TMO, pre-rolls outcome, applies TMO_REVIEW_STARTED + phase → TmoReview, emits `tmo_intervenes`. | Running until this tick |
| N+1 | CardHandler.advanceTmoReview emits `tmo_reviewing`, applies TMO_REVIEW_TICK_ADVANCED (step 1 → 2). | **Stopped** (ClockController.advanceMinute returns 0 when phase === TmoReview) |
| N+2 | Emits a 2-step `[tmo_ref_returns, tmo_decision_<outcome>]` announcement (CommentaryFeed stagger-reveals "official back on pitch → verdict"); applies TMO_REVIEW_TICK_ADVANCED (step 2 → 3). | Stopped |
| N+3 | If outcome ≠ no_card: emits CARD_ISSUED + `card_<kind>` announcement. Applies TMO_REVIEW_RESOLVED + phase → Penalty. | Stopped |
| N+4 | PenaltyHandler shows the existing penalty modal (kick for goal / kick to touch / tap). Play resumes. | Resumes |

### Card lifecycle

**Double-yellow rule.** `CardHandler.issueCard` checks `player.matchStats.yellowCards > 0` before applying any yellow card. If the player already holds a yellow this match, the kind is silently escalated to `red_20` (standard rugby union rule — two yellows = automatic sending-off). The escalation happens before `CARD_ISSUED` fires, so the event carries the final `effectiveKind` and commentary uses the `card_red_20` narration key.

`CARD_ISSUED { player, side, kind }` (reducer in `applyMatchEvent`):
- Yellow → `player.matchStats.yellowCards++`, push `{ player, kind, returnMinute: gameMinute + SIN_BIN_DURATION.yellow }` into `state.cards.sinBin[side]`.
- Red_20 → `player.matchStats.redCards++`, push entry with `returnMinute: gameMinute + SIN_BIN_DURATION.red_20`.
- Red_full → `player.matchStats.redCards++`, push to `state.cards.sentOff[side]`. No trigger exists today.

`ClockController.advanceMinute` is short-circuited to 0 during `TmoReview`. Each non-TMO tick, `MatchCoordinator.tick` calls `cardHandler.scanSinBinReturns()`, which:
- For each `kind: 'yellow'` entry with `returnMinute <= gameMinute` → emits `SIN_BIN_RETURNED` + `sin_bin_returned` announcement. Player is back on the field (`onFieldPlayers` no longer excludes them).
- For each `kind: 'red_20'` entry expired → emits `RED_20_EXPIRED` (moves player from sinBin to sentOff). Returns the entry; the coordinator then runs the forced-sub flow.

### Forced substitution after red_20 expires

`MatchCoordinator.handleRed20Replacement(off, side)`:
- Empty bench → emits `red_20_no_replacement` announcement, team plays a man down for the rest of the match.
- Human side + bench available → emits `engine:paused` with `forced_substitution_choice` payload; awaits the manager's pick via the existing modal infrastructure.
- AI side / silent → `pickAutoReplacement` walks a like-for-like fallback chain (e.g. Wing → Fullback → Utility Back → Centre) before relaxing to position group (forward/back) and finally the first bench player. Keeps a Scrum-Half off the wing when a more-natural option is available.
- On choice: applies `SUBSTITUTION_APPLIED` (existing event). The reducer extension removes the sent-off player from `state.cards.sentOff`, restoring the team to full strength.

### On-field availability

`onFieldPlayers(team, state, side)` (`src/engine/FieldPosition.ts`) filters `team.players` against the union of `state.cards.sinBin[side]` and `state.cards.sentOff[side]`. All carry handlers, scrum, lineout, and breakdown selectors call through this helper.

**Forward weakening** is automatic via:
- `ScrumResolver.packScore` is a **sum** — losing a forward removes ~12% of the pack's contribution.
- `LineoutResolver` jumper selection falls back from #4/#5 to other on-field forwards if a lock is binned — weaker jumper score.
- `BreakdownResolver` supporter pool shrinks naturally.

**Back weakening** is a `defendMod` term: each carry handler computes `missingBacks = 7 - availableBacks(...).length` and folds `missingBacks * SHORT_HANDED.missingBackDefendPenalty` (currently `-8` per missing back) into the `defendMod` passed to `resolveOpenPlay`. Mirrors the existing `backfieldLineBreakPenalty` precedent.

### Rating impact

`RATING_WEIGHTS.universal.yellowCards = -5.0` and `redCards = -15.0` (in `src/engine/balance/rating.ts`) are aggregated through the existing `computeRating` formula. A yellow drops the rating by ~0.5; a red by ~1.5.

### Stat additions

`PlayerMatchStats` extends with `yellowCards` + `redCards` (both bounded `[0, 3]` in `assertInvariants` as a paranoia ceiling). Red_20 bumps `redCards++` only — total cards = `yellowCards + redCards`.

**Discipline counselling (`Player.disciplineAdvice`).** When a manager counsels a player about their discipline (via the inbox), `PLAYER_DISCIPLINE_COUNSELLED` sets `Player.disciplineAdvice = { mode: 'ease_off', expiresAfterRound }` on the persistent roster player. `rosterTeamBuilder.rawFromRosterPlayer` checks this field at match-build time: if the advice is still active (`calendar.week <= expiresAfterRound`), it applies `DISCIPLINE_COUNSEL.disciplineBoost (+15)` and `DISCIPLINE_COUNSEL.tacklingPenalty (−5)` to the **baseStats clone** before returning it to `MatchCoordinator.initPlayer`. Modifying the clone (not `currentStats`) is critical — `StaminaSystem` re-derives `currentStats` from `baseStats` on every fatigue tick, so a `currentStats`-only patch would be overwritten at the first clock advance. The net effect: counselled players give fewer high tackles (discipline governs `HIGH_TACKLE` formula) but are marginally less effective at winning physical duels (tackling stat reduced). Advice lasts `DISCIPLINE_COUNSEL.durationRounds (3)` rounds.

### Balance constants

**Discipline / cards (`src/engine/balance/discipline.ts`)** — global outcome weights + per-offence registry:
```ts
TMO              = { outcomeNoCardPct: 25, outcomeYellowPct: 65, outcomeRed20Pct: 10 }
OFFENCE_SPEC     = {
  breakdown_infringement: { tmoTriggerPct:  0 },
  scrum_infringement:     { tmoTriggerPct:  0 },
  high_tackle:            { tmoTriggerPct: 90 },
  offside_at_ruck:        { tmoTriggerPct:  0 },
  obstruction:            { tmoTriggerPct:  0 },
  dangerous_cleanout:     { tmoTriggerPct: 90 },
  not_rolling_away:       { tmoTriggerPct:  0 },
}
SIN_BIN_DURATION   = { yellow: 10, red_20: 20 }
TEAM_22            = { warnAt: 3, cardAt: 4 }
SHORT_HANDED       = { missingBackDefendPenalty: -8 }
SIN_BIN_LENIENCY   = { scaleOne: 0.45, scaleTwoPlus: 0.0 }
```

**Per-offence base trigger rates** — pct per phase-event for the new offences:
```ts
// src/engine/balance/breakdown.ts
BREAKDOWN_PENALTIES = {
  dangerousCleanoutBasePct: 1.5,   // pre-resolve roll; pct per breakdown event
  notRollingAwayBasePct:    4,     // pre-resolve roll; pct per breakdown event
  offsideAtRuckBasePct:     8,     // post-resolve roll; pct per clean_ball / slow_ball outcome
}

// src/engine/balance/openPlay.ts
OBSTRUCTION_BASE_PCT = 4   // pct per out-the-back attempt (PhasePlay + FirstPhase)
```

**Tactic modifiers** — pct-point shifts on the base trigger rate (`src/engine/balance/tactics.ts`, inside `TACTIC_MODIFIERS`):
```ts
notRollingAwayDefendMod:    { jackal: 1,         counter_ruck: 0, shadow: -2 }
dangerousCleanoutAttackMod: { commit_numbers: 2, balanced: 0,    minimal_ruck: -1 }
obstructionStyleMod:        { keep_it_tight: -2, balanced: 0,    wide_wide: 3 }
offsideAtRuckDefendMod:     { blitz: 6,          hybrid: 2,      drift: -2 }
// Discipline (the offending side's tactic) adds to dangerous_cleanout (attacker),
// not_rolling_away + offside_at_ruck (defender), and the high-tackle rate.
disciplinePenaltyMod:       { risky: 3,          balanced: 0,    cautious: -2 }
disciplineHighTackleMod:    { risky: 1.5,        balanced: 0,    cautious: -1 }
```

**Breakdown contest edge** — `intensity` and `discipline` also shift the breakdown contest score itself (added to `ars` for the attacking side, `dts` for the defending side, at the `resolveBreakdown` call site in `BreakdownEvent`): `intensityContestMod` (`high: +3`, `balanced: 0`, `light: −3`) and `disciplineContestMod` (`risky: +4`, `balanced: 0`, `cautious: −4`). So a high-intensity / risky side wins marginally more turnovers and cleaner ball — the trade-off for the extra fatigue and penalties.

### Carry → breakdown handoff constants

Outcome-driven bonuses applied by `BreakdownEvent` based on the previous `CARRY_RESOLVED` outcome (NOT tactic-driven; live in their own group so `TACTIC_MODIFIERS` stays a pure tactic lookup). Two-way effect on a line break: cleaner breakdown ball PLUS next-phase carry runs on the front foot. Detailed in [Shared Evasion/Collision → Next-phase carry-over](#shared-evasioncollision).

```ts
// src/engine/balance/breakdown.ts
CARRY_HANDOFF_BONUSES = {
  dominantCarry:  6,    // applied to breakdown attackScore only
  lineBreak:     15,    // applied to BOTH breakdown attackScore and next-phase attackMod
}

// src/engine/balance/openPlay.ts
OPEN_PLAY_VALUES.lineBreakMetres = [20, 45]   // gain on a line_break carry; was [10, 25] pre-v2.62a
```

**Try-rate calibration (v2.62a, 5 seeds × 90 fixtures):** Combined tries / match: 1.1 → 3.0 (+170 %). Combined points / match: 21.9 → 33.4 (+52 %). The two dials above are the entire mechanism. Lifting `CARRY_HANDOFF_BONUSES.lineBreak` shortens the line-break → try gap; lowering it lengthens it.

**Telemetry calibration (v2.61a, 5 seeds × 90 fixtures = 450 matches):**

| Offence | Per match | Share |
|---|---:|---:|
| breakdown_infringement | 4.78 | 38.4 % |
| scrum_infringement | 3.00 | 24.1 % |
| offside_at_ruck | 1.70 | 13.6 % |
| not_rolling_away | 1.41 | 11.3 % |
| high_tackle | 0.71 | 5.7 % |
| obstruction | 0.44 | 3.5 % |
| dangerous_cleanout | 0.41 | 3.3 % |
| **Total** | **12.45** | 100 % |

Yellow cards: 0.32 / match · Red_20: 0.10 / match · TMO triggers: 0.71 / match. Real League is ~18-22 pens/match — the new constants are dials if a tighter realism target is wanted.

---

## Injuries

Contact injuries that take a player off for the rest of the match and persist into the career layer as multi-week unavailability. Card-system twin: same on-field unavailability mechanism (`state.cards.injured`), same shared forced-sub plumbing, same RNG ordering.

### Where the roll fires

End of `handlePhasePlay` in `src/engine/events/OpenPlayEvent.ts`, after the tackle outcome is decided and any high-tackle penalty has been queued. Skipped on line-break outcomes (no completed tackle). Three rolls in fixed order whenever the trigger passes:

1. `rng(1, 10000)` — trigger. Compared to `INJURY.basePctPerTackle × dominantTackleMult? × positionVuln × fatigueBoost × 100`.
2. `rng(1, 100)` — kind. Weighted pick from `INJURY_KIND_WEIGHTS` (muscle_strain 22%, ligament_sprain 20%, concussion 15%, knock 12%, knee_cartilage 10%, shoulder 9%, fracture 7%, laceration 5%).
3. `rng(1, 100)` — victim selector (dominant_tackle only). Below `tacklerVictimPct` → tackler is the victim; otherwise carrier.

Skipped rolls don't shift the RNG stream — the trigger gate short-circuits before any further `rng()` calls.

### In-match flow

- `PLAYER_INJURED_IN_MATCH { player, side, kind }` pushes the victim onto `state.cards.injured[side]` and sets `player.pendingInjuryKind = kind`. The mutation fires on the tackle beat (the player leaves the field at once), but **no `injury_off` line is emitted there** — both the commentary and the replacement are deferred to the next break in play (`OpenPlayEvent` only pushes the mutation now).
- `offFieldIds(state, side)` in `FieldPosition.ts` now merges `sinBin ∪ sentOff ∪ injured`. Every resolver that selects through `onFieldPlayers()` weakens automatically — pack score drops, backline thins, no separate flag needed.
- `MatchCoordinator` defers the injury replacement to a **natural break in play** (`processPendingInjuries`, called from the tick's natural-break block): it emits the held `injury_off` line via `emitInjuryOff`, then runs `runForcedSubstitution(player, side, 'injury')` for any injured player still occupying a field slot. Human side gets the existing `forced_substitution_choice` modal; AI and silent matches auto-pick by position group via `pickAutoReplacement`. (red_20 sin-bin returns stay immediate — `processForcedSubstitutions` every tick.)
- `runForcedSubstitution` is the shared red_20 / injury function — same modal payload shape, same auto-pick fallback. The `reason` param picks the announcement key (`red_20_replacement_done` vs `injury_replacement_done`).
- `SUBSTITUTION_APPLIED` removes from `cards.injured` (same as `cards.sentOff`) so the new on-field player at the slot isn't filtered out.
- Bench-empty case: the injured player stays in `cards.injured` for the rest of the match, the team plays short, and the `injury_no_replacement` announcement fires.

### Match-teardown severity roll

Severity + duration are NOT rolled in-match. The matchday Player's `pendingInjuryKind` is read at teardown via `snapshotMatch` (`src/game/seasonStatsCollector.ts`) and surfaces as an optional `injuryKind` on each `PlayerStatsSnapshot`. `GameCoordinator.recordPlayerMatchResult` then calls `rollNewInjuryEvents(state, snapshots)` (`src/game/injuryEffects.ts`) which uses `rngTransfer` (career stream, independent of match outcome stream) to:

1. Pick severity (`mild` | `moderate` | `severe`) from the kind's `INJURY_SEVERITY[kind].weights`.
2. Pick weeksRemaining uniformly from `INJURY_SEVERITY[kind].bands[severity]`.
3. Emit `PLAYER_INJURED { rosterId, kind, severity, weeksRemaining, injuredOn, isRecurrence: false }`.

Snapshots are sorted rosterId-ascending so the `rngTransfer` call order is stable across runs.

### Recovery tick

`GameCoordinator.recordPlayerMatchResult` calls `tickInjuryEvents(state)` (`src/game/injuryEffects.ts`) at the very start (after the re-entry guard, before any new fixture is recorded). It walks `state.career.roster` in rosterId-ascending order; for each player with `injury`:

- `weeksRemaining > 1` → emit `INJURY_TICK_ADVANCED`.
- `weeksRemaining ≤ 1` → emit `INJURY_TICK_ADVANCED` (if 1) then `PLAYER_RECOVERED` which clears `Player.injury`.

The tick happens **before** new injuries are added, so a player injured this round retains their full weeksRemaining at the next round and ticks down from there.

### Career-roster persistence

The persistent injury sits on `Player.injury?` (in `state.career.roster[rosterId]`). Absent ⇔ fit. The save format (v9+) round-trips it via the standard roster serialise / restore path; no migration shim — the field is purely additive.

`buildTeamFromRoster` (`src/game/rosterTeamBuilder.ts`) stable-partitions the club's squad so injured players sink to the wider squad (slot 24+) when constructing the matchday RawTeamInput. The auto-built starting XV + bench therefore only contain fit players (assuming the club has ≥23 fit).

`applyMatchdaySquad` (`src/game/playerSquad.ts`) accepts an optional `isInjured(ref)` predicate. When the saved squad references an injured player, the function returns the underlying team unchanged (same fallback path as "player no longer rostered"). PreMatchScreen + SquadManagementScreen use `makeInjuredPredicate(roster, clubSquad)` to build the predicate from career state.

### Forced-sub flow under the determinism harness

`scripts/checkDeterminism.ts` handles the `forced_substitution_choice` payload by mirroring `pickAutoReplacement`: walk the `POSITION_FALLBACK` chain, then position-group, else the first bench player. This keeps red_20 and injury-driven subs deterministic.

### Balance constants (`src/engine/balance/injuries.ts`)

```ts
INJURY = {
  basePctPerTackle:    8.0,
  dominantTackleMult:  2.5,
  fatigueWeight:       0.6,
  recurrenceMult:      1.4,        // scaffolding for future recurrence path
  recurrenceWindowWeeks: 8,        // scaffolding
  tacklerVictimPct:    30,
  positionVuln: { Prop: 1.20, Hooker: 1.15, Lock: 1.10, Flanker: 1.10,
                  'Number 8': 1.10, 'Back Row': 1.10, 'Scrum-Half': 0.90,
                  'Fly-Half': 0.85, Centre: 1.00, Wing: 0.85,
                  Fullback: 0.90, 'Utility Back': 0.95 },
}

INJURY_KIND_WEIGHTS = { muscle_strain: 22, ligament_sprain: 20, concussion: 15,
                       knock: 12, knee_cartilage: 10, shoulder: 9,
                       fracture: 7, laceration: 5 }

INJURY_SEVERITY[kind] = { weights: { mild, moderate, severe }, bands: { … } }
INJURY_RECURRENCE_TIME_LOSS_MULT = 1.5   // scaffolding
```

Calibration target: ~2 injuries / match across both teams. Telemetry at 8.0% baseline lands ~1.87/match across the 90-fixture league pass.

### Known gaps / future work

- **Recurrence detection** is scaffolded only — `isRecurrence` is always `false` in v1, and the related multiplier constants are unused. A future iteration adds a `lastInjuredOn` field on the roster Player so the recurrence window can be checked.
- **HIA protocol** (12-minute concussion check then return) is not modelled. Concussions in v1 are full-off only.
- **Set-piece injuries** (scrum collapse, lineout lift gone wrong) don't trigger rolls today. Only `handlePhasePlay` calls `rollMatchInjury`. Easy extension when wanted — a `0.5%` roll on `defending_dominant_penalty` scrum outcomes for a prop is the lowest-hanging future addition.

---

## Try Scored

### How a try arises

`TryScored` is set inside the `OpenPlay` handler when a `line_break` result causes `isTryScored()` to return true — i.e. the ball has crossed the attacking try line after `gainMetres` are applied. The same branch runs in `FirstPhase` and `KickReturn` for tries scored from set-piece strike plays and broken-field returns respectively.

### Lateral landing position

When a carry crosses the try line each of the three carry handlers (`OpenPlay`, `FirstPhase`, `KickReturn`) calls `tryLandingY(state, attackTeam.tactics.attackingStyle)` from `src/engine/resolvers/TryLocationResolver.ts` and emits a `BALL_REPOSITIONED` with the resulting y. The try grounds at the **swept position** (`state.ball.y`, where open play had moved the ball — see "Lateral / Y-axis model") plus a style-scaled jitter for the angle in to the line: `keep_it_tight` ±6, `balanced` ±10, `wide_wide` ±16 (`TRY_LANDING_JITTER`). One `outcome`-stream draw, clamped to `[0,100]`. The same y then drives `ConversionKickEvent`'s difficulty calculation (which already read `|ballY − 50|`) and the post-try narration band: central (≤ 7), close (≤ 17), wide (≤ 32), corner (otherwise). Phrases live in the `try_location_*` keys of `src/commentary/banks/en-GB/announcements.ts`.

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

### Score-context commentary

`TryScoredEvent` emits two steps (three in the bonus-point case): (1) a `phase_outcome` step keyed off the lead the try produces — `try_lead` (newly ahead, was level or trailing) / `try_extend_lead` (already ahead) / `try_level` (draws level) / `try_trail` (still behind) — then (2) an `announcement` step with key `try_aftermath` (crowd / momentum reaction), and optionally (3) a `try_bonus_point` announcement when the try is the fourth for the scoring side in a regular league fixture (not a playoff semi or final). The bonus-point step fires because `state.stats.tries[possession]` is still the pre-try count (the handler is read-only), so the condition is `count === LEAGUE_POINTS.tryBonusThreshold − 1 && !isPlayoffSemi && !neutralVenue`. The handler is read-only (`TRY_SCORED` is applied by `PhaseRouter` after it returns), so `state.score` is still the pre-try score; `tryLeadKey` projects the 5 try points forward to classify the lead (the conversion hasn't happened yet, so only the try counts). The carry phases (`OpenPlayEvent`, `FirstPhaseEvent`, `KickReturnEvent`, `MaulEvent`) carry the grounding lines, appending a `try_referee_signal` announcement after the try-location step on their try branches — so a full try unfolds across two events as `[line_break_try | dominant_carry_try | maul_try, try_location_*, try_referee_signal]` then `[try_lead | try_extend_lead | try_level | try_trail, try_aftermath]`. **Score timing:** the carry beat is enqueued before `TRY_SCORED` applies, so its display snapshot still shows the pre-try score ("he's over!"); `TRY_SCORED` (+5) applies when the `TryScored` phase resolves the following tick, so the score lands on the lead-line beat — one beat after the grounding, reading like the referee awarding it. **Phase-badge timing:** `PHASE_CHANGED` (→ `TryScored`) is applied before the carry beat is enqueued, so without correction the phase badge would flash "TRY SCORED" on the carry beat, before any confirming commentary has appeared. `PhaseRouter` sets `GameEvent.displayPhase = phaseAtStart` on carry-to-try events; `CommentaryStreamer.enqueue` overrides the snapshot's `phase` field with this value when present. The result: the badge stays on the carry phase (e.g. "PHASE PLAY") during the grounding lines, then transitions to "TRY SCORED" only when the `TryScored` handler's beat fires alongside the `try_lead`/`try_level`/etc. confirmation. `CommentaryFeed` detects these as hero events and stagger-reveals the steps at the steady per-line gap (`tickDelayMs × COMMENTARY_PACING.lineGapFraction` — the same `lineGap` the presenter paces beats by) with team-colour hero treatment on the `#latest-commentary` strap. Templates live in `src/commentary/banks/en-GB/phases.ts` (`TryScored` block) and `announcements.ts` (`try_referee_signal`, `try_aftermath` arrays).

**`try_aftermath` is context-aware.** The handler attaches a `TryAftermathContext` (`src/types/narration.ts`) to the announcement step's `params.tryAftermath`, computed from the pre-try state: `scoringSideIsHome` (`state.possession === 'home'`), `neutralVenue` (`state.engine.neutralVenue`), `isSwing` (`leadKey !== 'try_extend_lead'`), `isBlowout` (post-try absolute margin ≥ `TRY_AFTERMATH_CONTEXT.blowoutMargin`), and `isLateDrama` (not a blowout, `gameMinute ≥ lateGameMinute`, margin ≤ `lateDramaMargin`). `getAnnouncementTemplate` routes these through `pickTryAftermath` to one of nine pools: blowout (subdued, beyond doubt — wins precedence) → neutral / neutral-late → home / home-swing / home-late → away / away-swing / away-late. This fixes the old single-pool bug where a home-crowd roar could fire for an away try, an away try drew the same "huge roar" as a home try, and the momentum-shift line fired even on `try_extend_lead`. Away pools deliberately read quieter (travelling-support pocket, hushed home crowd); momentum phrasing only lives in `_swing` / `_late` pools. The selection happens at render time on the commentary RNG stream — no effect on engine determinism. Thresholds live in `src/engine/balance/commentary.ts` (`TRY_AFTERMATH_CONTEXT`).

---

## Conversion Kick

### Player selection

```typescript
kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0]
```

Always the fly-half.

### Narration and the KickAtGoal micro-phase

Goal kicks (conversions + penalty goal kicks) resolve through a 2-tick micro-phase that mirrors the TMO frozen-clock pattern:

| Tick | Action | Clock |
|---|---|---|
| A | Entry handler (`ConversionKickEvent.handleConversionKick` or `PenaltyHandler.applyPenaltyChoice`'s `kick_for_goal` branch) picks the kicker, computes `distFromPosts`, applies `KICK_AT_GOAL_STARTED`, transitions phase to `KickAtGoal`. Emits a single-step `kicker_steps_up` announcement event. **No kick resolution yet.** For conversions only, a `BALL_REPOSITIONED { x: kickX }` is emitted first (the kicker runs back 20–30 m from the try line on the x-axis via `rngPosition(20,30)` on the `positioning` stream; `y` stays at the try-landing value so the angle into the posts is preserved). | Running |
| B | `MatchCoordinator.tick` sees `phase === KickAtGoal`, calls `KickAtGoalHandler.advance()`. Rolls the goal kick (`resolveGoalKick`), then enqueues **two beats** with the score mutation between them: a `[kicker_compose]` beat (enqueued first, so its display snapshot shows the pre-kick score), then `CONVERSION_KICKED` / `PENALTY_GOAL_KICKED` (+ `RATINGS_RECALCULATED`), then a `[success | miss | kick_for_goal]` beat (snapshot shows the new score). Splitting at the score boundary lands the scoreboard tick on the result line — were it one 2-step beat, the single per-beat snapshot would carry the new score onto the "lines it up…" line, a full `lineGap` early (and pre-reveal make/miss). The two beats drain one `lineGap` apart, so visible pacing is unchanged. Applies `POSSESSION_SWAPPED` + `BALL_REPOSITIONED { x: 50, y: 50 }` + `KICK_AT_GOAL_RESOLVED` + `PHASE_CHANGED` to `KickOff`. | **Frozen** (`ClockController.advanceMinute` returns 0 when `phase === KickAtGoal`) |

The inter-tick delay between A and B is shorter than `tickDelayMs` so the build-up doesn't burn a full sim tick. `MatchCoordinator.nextTickDelay()` returns `clamp(300, 1200, tickDelayMs × 0.6)` when `phase === KickAtGoal`. At 1× (2500 ms tick) the build-up is 1500 ms; at 4× (400 ms tick) it floors at 300 ms; at ½× (5000 ms tick) it caps at 1200 ms. The compose and result beats then drain one `lineGap` apart (`tickDelayMs × 0.46`).

Hero detection: every beat here is single-step, so none qualifies via the "2+ steps" path. `kicker_steps_up` (entry) and `kicker_compose` (resolve) are in `HERO_ANNOUNCEMENT_KEYS`, and `success` / `miss` / `kick_for_goal` (result) are in `HERO_PHASE_OUTCOME_KEYS`, so all three beats glow on the strap. Neither tick auto-pauses — the goal-kick `phase` is `ConversionKick` / `Penalty` (not in `KEY_PHASES`) and none of these keys are in `KEY_ANNOUNCEMENT_KEYS`.

State lives at `state.kickAtGoal: KickAtGoalState | undefined` (`{ kicker, kind: 'conversion' | 'penalty', distFromPosts }`). `assertInvariants` validates the optional block when present. The same `KickAtGoalHandler.advance()` resolves both conversion and penalty goal kicks, branching on `kind`.

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

**KickAtGoal short-circuit:** `MatchCoordinator.tickBody` checks `state.clock.clockInTheRed` immediately after `kickAtGoalHandler.advance()` runs and ends the period there — bypassing `shouldEndPeriod` entirely. World Rugby rule: any goal kick (conversion or penalty, success or miss) resolved while the clock is in the red ends the period without a restart kick-off (or drop-out, for a missed penalty). The handler still transitions phase to `KickOff` / `DropOut22` first, but `triggerHalfTime` / `endMatch` immediately overrides it.

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

**Scope:** The managed (human) team substitutes via the UI. AI-controlled teams are driven by `AISubstitutionDirector` (`src/engine/AISubstitutionDirector.ts`), a pure (no-RNG) sibling of `AITacticalDirector` called once per tick after `fatigue.tick()` and before `resolvePhase()`. From `AI_SUBS_VALUES.earliestSubMinute` (50') onwards it loops over each AI side and identifies starters whose `fatiguePct` sits at or below `AI_SUBS_VALUES.fatigueThreshold` (60%), picking the most-fatigued candidate per iteration. Replacement preference is exact position match → forward/back group; no "any bench" fallback (a wing on for a prop weakens the scrum more than a 60% prop staying on).

**Natural-break delay.** Several interruptions are held back from open play and flushed only at a natural break — `MatchCoordinator.isNaturalBreak()` is true for `Penalty`, `Scrum`, `Lineout`, `KickOff`, `DropOut22`, `ConversionKick`, or `TryScored`. At each tick, if that gate is met:
- **Substitutions** (manager- and AI-director-initiated; live matches only) — queued on `pendingSubQueue` (`{ side, benchSquadNum, fieldSquadNum }`) and flushed via `substitute()` in order, emitting `SUBSTITUTION_APPLIED` + commentary. A sub requested mid-open-play appears only once the next set piece/restart begins — matching real rugby's substitution window.
- **Fatigue tiredness commentary** (`FatigueAccumulator.flush()`; both modes) — players crossing the threshold are buffered each tick and announced here; any dropped off the field before the break are skipped.
- **Deferred injury subs** (`processPendingInjuries`) — emits the held `injury_off` line then runs the forced replacement.

The underlying mutations still run every tick — the fatigue drain (`FATIGUE_APPLIED`) and the injury (`PLAYER_INJURED_IN_MATCH`, player off the field immediately); only their commentary/replacement is gated to the break. (red_20 sin-bin returns are *not* gated — immediate every tick.)

Cross-tick deduplication in `queueSubstitute()` prevents a player from being double-queued (the AI director's loop adds the same fatigued player to a local `queuedThisTick` set on each `evaluate()` call, and `queueSubstitute()` rejects a re-entry for the same `(side, fieldSquadNum)` across ticks). Bulk subs still accumulate in the queue across successive ticks and all flush together at the next break — real coaches do clear the bench in a single window around 50–55'.

In silent (headless) fixtures both sides adapt and subs apply immediately (no queue, `substitute()` called directly) so the silent-mode call sequence and RNG ordering are unchanged. Forced subs (red_20 / injury) also bypass the queue and apply immediately via `runForcedSubstitution()` — these are structural necessities. In a live match the human side is never touched by the director.

---

## Tactical Commentary

When a tactic directly influences a key outcome, the phase handler pushes a `{ kind: 'tactic_note', cause, chancePct, params? }` step into the `NarrationDescriptor` it returns. The renderer rolls `commentaryChance(chancePct)` (commentary stream) and, on pass, picks a line from `getTacticNoteLines(cause, params)` in `src/commentary/banks/en-GB/tacticNotes.ts`. Notes fire symmetrically — whichever team's tactic produced the outcome, the corresponding note may trigger. The note text names the relevant team via the `params: { attackTeamName, defendTeamName }` so it reads correctly regardless of which side the player is managing.

Notes cover both the upside and the downside of a tactic choice — a player should see their good decisions rewarded *and* their poor decisions highlighted.

| Handler | Trigger | Cause | Chance |
|---|---|---|---|
| `BreakdownEvent` | `commit_numbers` + `clean_ball` | `breakdown_commit_numbers_clean` | 30% |
| `BreakdownEvent` | `shadow` + `clean_ball` conceded | `breakdown_shadow_clean` | 30% |
| `BreakdownEvent` | `jackal` + `clean_ball` conceded | `breakdown_jackal_clean` | 25% |
| `BreakdownEvent` | `minimal_ruck` + `slow_ball` | `breakdown_minimal_ruck_slow` | 30% |
| `BreakdownEvent` | `counter_ruck` + `slow_ball` | `breakdown_counter_ruck_slow` | 30% |
| `BreakdownEvent` | `jackal` + `turnover` | `breakdown_jackal_turnover` | 35% |
| `BreakdownEvent` | `counter_ruck` + `turnover` | `breakdown_counter_ruck_turnover` | 30% |
| `BreakdownEvent` | `minimal_ruck` + `turnover` | `breakdown_minimal_ruck_turnover` | 25% |
| `BreakdownEvent` | `commit_numbers` + `penalty_defending` | `breakdown_commit_numbers_penalty` | 25% |
| `BreakdownEvent` | `minimal_ruck` + `penalty_defending` | `breakdown_minimal_ruck_penalty` | 25% |
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

- `{ kind: 'phase_outcome', phase, key, primary?, secondary?, metres? }` — the dominant variant. `key` is a `PhaseOutcomeKey` (e.g. `knock_on`, `line_break`, `crash_ball`, `clean_ball`, `wheel`, `defend_catch_contested`, `fifty_twenty_two`, `tap_and_go`, …). `metres` is an optional integer used by distance-aware keys such as `kick_to_touch_close` / `kick_to_touch_long`.
- `{ kind: 'tactic_note', cause, chancePct, params? }` — flavour text gated by a `pickRandom`-driven chance roll. `cause` is a `TacticNoteCause` (e.g. `line_break_backfield_thin`, `breakdown_jackal_turnover`, `boxkick_backfield_caught`).
- `{ kind: 'announcement', key, primary?, secondary?, params? }` — non-phase commentary (substitutions, fatigue, clock-in-red, half-time, full-time, set-piece-award).

Composite commentary (e.g. PhasePlay's "out the back" prefix + outcome + tactic note) is expressed as multiple steps in order; the renderer joins their rendered strings with a single space.

### Renderer (`src/commentary/CommentaryRenderer.ts`)

`renderNarration(event)` walks `event.narration.steps[]` and renders each step:
- `phase_outcome` → look up `PHASE_BANKS[step.phase][step.key]`, pick a template via `pickRandom` (commentary stream), interpolate `{primary}`/`{secondary}`/`{side}`/`{defside}`/`{metres}` tokens. `{metres}` is populated from `NarrationStep.metres` (an optional integer on the `phase_outcome` variant); currently set only by the `kick_to_touch_close` / `kick_to_touch_long` penalty keys, where it holds the exact landing distance from the opposition try line in metres.
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
| `kicking`, `positioning` not degraded by fatigue | `StaminaSystem` | These stats remain at full base value for the entire 80 minutes. |
| Home advantage only flows through carries + breakdown | `HOME_ADVANTAGE` in `balance/` | Referee tilt on marginal penalties, kicker accuracy at home, and travel fatigue for the away side are all plausible extra channels — each would need its own `HOME_ADVANTAGE.*` knob and a telemetry re-tune. |
| Head-to-head is single-season only | `headToHead` in `src/game/teamStats.ts` | Pre-match H2H tile resets each season; multi-season aggregation would need a persisted slice on `GameState` and a `SEASON_ROLLED_OVER` event. |
