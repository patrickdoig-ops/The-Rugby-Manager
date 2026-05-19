# CLAUDE.md

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
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

**Resolve constant arithmetic at write-time, not runtime.**

If a formula applies a fixed multiplier or offset to a literal or random range, collapse the algebra into the value directly:
- `rng(0.5, 1.5) * 8` → `rng(4, 12)`
- `delta * 1.5` applied uniformly → multiply each literal by 1.5 and remove the multiplier
- `(a + rng(...) / n) * k` → fold `k` into the range and the constant

The result should express the actual value used, not the derivation of it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Module Boundaries

**Split before god objects form. Don't wrap clean primitives.**

- When one file accumulates multiple unrelated responsibilities, split — name each piece by what it does (Coordinator, Controller, Router, Handler). Don't wait for thousands of lines.
- Push back on proposed abstractions that wrap already-clean primitives. Don't wrap a typed state object in a "store". Don't wrap a typed pub/sub singleton in a "dispatcher". Both add ceremony without isolation benefit.
- Prefer pure functions over methods when state can be passed directly. `FieldPosition` helpers take `state: MatchState` as an argument; they are not closures threaded through a deps interface.
- Use constructor dependency injection for classes whose methods share the same deps (`PenaltyHandler`, `ClockController`). Use module-level functions for pure helpers (`FieldPosition`, `PhaseRouter`).
- Extract a shared utility the moment a second module needs it, not before. `eventId.ts` was extracted only when both `PenaltyHandler` and `ClockController` needed `makeId()`.
- Refactor incrementally. One cohesive split per commit; each commit must build clean and preserve behaviour. Big-bang refactors are unreviewable.
- A module-boundary change is an engine change — update `engine.md` in the same commit.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start Vite dev server (hot reload)
npm run build    # tsc type-check then Vite production build → dist/
npm run preview  # serve the dist/ folder locally
```

There are no tests or linters configured. TypeScript strict mode is the primary correctness check — `npm run build` must pass cleanly before every commit.

**Deploy:** Push to `main`. GitHub Actions builds and deploys to GitHub Pages automatically. The Vite base path is `/Rugby-Simulator-/` — do not change it or asset URLs break in production.

## Versioning

**After every committed update, bump the version in `src/version.ts` and push to `main`.**

The version string follows the pattern `0.XXa` (e.g. `0.01a`, `0.02a`). Increment the two-digit numeric part by 1 for each update. The version is displayed on the Home Screen; `src/version.ts` is the single source of truth.

## Maintaining engine.md

**After any change to engine code, update `engine.md` to match. This is not optional — engine.md must be updated in the same commit as the engine change.**

`engine.md` is a plain-English reference for the entire game engine. It must stay in sync with the code. This includes:
- `src/engine/MatchCoordinator.ts` — public API, tick loop, fatigue accumulator, possession/territory stats, substitution, rating recalculation
- `src/engine/ClockController.ts` — minute advance, clock-in-red, half-time, full-time
- `src/engine/PhaseRouter.ts` — `PHASE_HANDLERS` map, `resolvePhase`, `draftEvent`
- `src/engine/PenaltyHandler.ts` — penalty modal pause + outcome branches, kick-off strategy modal
- `src/engine/FieldPosition.ts` — pure field-position helpers (`attackDir`, `isTryScored`, `inOpposition22`, etc.)
- `src/engine/StaminaSystem.ts` — fatigue decay formula, attribute penalty tiers
- `src/engine/StateMachine.ts` — allowed phase transitions
- `src/engine/resolvers/*.ts` — all resolver formulas, thresholds, return types
- `src/engine/events/*.ts` — stat increments, possession swaps, next-phase routing
- `src/engine/CommentaryEngine.ts` — commentary template keys
- `src/types/engine.ts` — result type unions (LineoutResult, ScrumResult, etc.)

When updating `engine.md`, document:
1. Which players are selected (exact `find`/`filter` conditions from `PhaseRouter.resolvePhase()` and the relevant event handler)
2. The resolver formula with actual numbers from the resolver file
3. All outcome thresholds
4. Ball position changes and possession swaps
5. Stat increments per phase (which player, which `matchStats` field)
6. Any known gaps or approximations

Do not paraphrase — if the code changes, the doc must reflect the new code exactly.

---

## Architecture

### Engine ↔ UI contract

The single most important architectural rule: **the engine never imports from UI; UI modules never call engine methods directly** (except `SimController`, which wires the Play/Pause/Speed controls). All communication goes through the typed pub/sub singleton at `src/utils/eventBus.ts`.

Engine emits → UI subscribes:

| Event | Payload | Subscribers |
|---|---|---|
| `engine:stateChange` | `{ state: MatchState }` | Scoreboard, StatsPanel, PitchStrip, CommentaryFeed (one-shot) |
| `engine:event` | `{ event: GameEvent }` | CommentaryFeed |
| `engine:paused` | `{ payload: ModalPayload }` | ModalManager, SimController |
| `engine:resumed` | `{}` | ModalManager, SimController |
| `engine:finished` | `{ state: MatchState }` | (available for end-screen) |

`eventBus.on()` returns an unsubscribe function. All UI init subscriptions are intentionally permanent — the app is a single session per page load and no module is ever torn down. The unsubscribe function should be called when you need a **one-shot** listener, i.e. one that fires once and then removes itself. `CommentaryFeed.ts` uses this pattern to cache team colours on the first `engine:stateChange` then unsubscribe.

Within a single tick, `engine:event` is emitted **before** `engine:stateChange`. This means UI modules that depend on state cached from a previous `stateChange` (e.g. `CommentaryFeed`) will always have a valid cache from the prior tick by the time an event arrives.

### Simulation loop

`MatchCoordinator.tick()` is a self-rescheduling `async` function using `setTimeout` — **not** `setInterval`. Pausing is simply not scheduling the next tick. Resuming calls `scheduleTick(0)`. The tick loop delegates to `ClockController` for time advancement and period transitions, to `PhaseRouter.resolvePhase` for phase dispatch, and to `PenaltyHandler` for penalty/kick-off modal pauses; it owns only the fatigue accumulator, possession/territory stats, the announce/award events, and rating recalculation.

Time advances `0.2 + rng(0,8)/10` game minutes per tick (0.2–1.0 min). Fatigue is applied every ~5 accumulated game minutes via `fatigueAccumulator`. Clock is clamped to 40 (first half) or 80 (second half) until `clockInTheRed` is set, then advances at 1/2 normal speed.

The penalty interactive pause is a `Promise` that resolves when the `onChoice(choice)` callback is called from the UI payload. The loop `await`s it mid-tick; `handlePenaltyDecision()` emits `engine:paused` which triggers the modal.

### Phase flow

```
KickOff → KickReturn → Breakdown → PhasePlay (loop)
                                  → BoxKick (slow ball; propensity driven by attackingGamePlan + pitch zone) → KickReturn / Scrum
                      → TacticalKick (propensity driven by attackingGamePlan + pitch zone) → KickReturn / Lineout / Scrum
                      → Scrum / Lineout → FirstPhase
                      → TryScored → ConversionKick → KickOff
                      → Penalty → [modal if home team in opposition half] → KickOff / Lineout / FirstPhase
Clock reaches 40 min (first half) or 80 min (second half) → clockInTheRed = true, commentary emitted, clock slows to 1/2 speed.
  While in the red, game ends only when ball goes dead:
    Scrum awarded (knock-on or crooked throw, NOT wheel reset) → HalfTime / FullTime
    Lineout awarded (ball to touch, NOT from penalty kick-to-touch) → HalfTime / FullTime
    ConversionKick → KickOff (try scored + conversion taken) → HalfTime / FullTime
  Exception: penalty kick-to-touch in the red sets penaltyKickToTouchLineout flag; that one lineout does NOT end the game.
  Exception 2: penalty kick-to-touch via tap_and_kick_dead does NOT set the flag, so that lineout DOES end the game.
  Penalty goal kick (kick_for_goal) in the red → KickOff with prevPhase=Penalty → always ends the period (success or miss).
  Knock-on threshold increases ~40% in the red: Math.min(99, 85 + Math.round(Math.max(0, 85 − handling) × 0.4)).
  triggerHalfTime() resets clockInTheRed = false for the second half.
```

Three carry phases share the same evasion/collision resolver (`resolveOpenPlay`) but have distinct player selection, play structure, and commentary template sets (`PHASE_PLAY_TEMPLATES`, `FIRST_PHASE_TEMPLATES`, `KICK_RETURN_TEMPLATES`):
- **PhasePlay** — after Breakdown; random carrier; hard carry or out-the-back split driven by `attackingStyle`; if carrier is #10 the out-the-back path is always taken (skipping the separate carrier→flyHalf step)
- **FirstPhase** — after Scrum, Lineout, or tap-and-go penalty; carrier always #10; crash ball (#10→#12) or wide play (#10→#13→wing) split driven by `attackingStyle`
- **KickReturn** — after KickOff, BoxKick, or TacticalKick; carrier = `state.kickReturnCarrier` (whoever caught the kick, set by the prior kick handler); run step (pace/agility vs pace/tackling) before evasion/collision; no handling gate

`StateMachine` validates transitions; `forceTransition()` bypasses validation for HalfTime/FullTime/penalty resolution.

### Attack direction

Home attacks toward x=100 in the first half, toward x=0 in the second half. **Teams only swap ends at half-time, never on turnovers.** All `ballX` reasoning must go through the pure helpers in `src/engine/FieldPosition.ts` (`attackDir(state)`, `isTryScored(state)`, `inOpposition22(state)`, `inOppositionHalf(state)`, `inOwn22(state)`, `inOwnHalf(state)`) — these are the authoritative helpers that factor in `state.halfTimeDone`.

- Try scored: `ballX >= 95` (home attacking right) or `ballX <= 5` (home attacking left)
- In opposition 22: `ballX >= 78` / `ballX <= 22` depending on half and possession

### Resolvers

Each resolver in `src/engine/resolvers/` is a pure function (no side effects, no imports from engine). They receive player objects and return a typed result. `PhaseRouter.resolvePhase()` builds the `PhaseContext`, dispatches to the matching event handler (which calls the resolver), runs the `StateMachine` transition, and returns the resulting `GameEvent`. State mutations and stat increments live inside the event handlers in `src/engine/events/`.

Resolver formulas at a glance:

| Phase | Key formula | Outcome thresholds |
|---|---|---|
| **KickOff** | `kickScore = kicking + rng(1,20)` ≥ 35 = goodKick. **Kick Deep:** distance 25–40m / 15–25m; catching gate `(handling+composure)/2 + rng(1,20) < 30` → `knock_on`. **Kick Short:** distance 10–20m / 4–9m; < 10m → `poor_kick`; catch vs chase margin > 10 → `clean_receive`; > -5 → 30% `short_kick_retain`; else → `knock_on`. **Grubber:** distance 15–25m / 4–9m; < 10m → `poor_kick`; catching gate < 30 → `knock_on`. | `poor_kick`: scrum halfway, receiving team puts in. `knock_on`: scrum at landing, kicking team puts in. `clean_receive` / `short_kick_retain`: KickReturn (possession flips only on `clean_receive`) |
| **PhasePlay** | Random carrier; handling gate (`handling + rng(1,100) < 85` = knock_on; ~5% for handling 80, ~20% for handling 65). If carrier is #10 or `rng` > hard-carry threshold: Out the Back (#10 → random outside back from ids 11/13/14/15) via up to two handling gates; if carrier IS #10, the carrier→flyHalf step is skipped and only the flyHalf→outsideBack step runs. Hard Carry: evasion + collision with original carrier. Evasion: `evasionScore = (agility+pace)/2 + rng(1,20) + attackMod`; `defenseScore = (defender.positioning+defender.pace)/2 + rng(1,20) + defendMod`; margin ≥ 15 = line_break. Collision: `(strength+pace)/2` vs `(tackling+strength)/2`. `backfieldPenalty`: `three_back` −10, `two_back` −5. Consumes `state.breakdownMod` | knock_on (gate); evasion ≥ 15 = line_break (tackles.attempted++); collision ±5 = dominant |
| **FirstPhase** | Carrier always #10; handling gate (same `handling + rng(1,100) < 85` formula). Crash Ball (90/70/50% driven by `attackingStyle`): #10 → #12 (inside centre) handling gate → collision vs opp #12. Wide Play: #10 → #13 (outside centre) → random wing (11/14) two handling gates; collision vs random opp wing. `backfieldPenalty` and `breakdownMod` consumed | same thresholds |
| **KickReturn** | Carrier = `state.kickReturnCarrier` ?? `randomPlayer`. No handling gate. Run step: `(carrier.pace+agility)/2 + rng(1,20)` vs `(defender.pace+tackling)/2 + rng(1,20)` → `runMetres` 3–10 (win) or 0–3 (lose). Evasion + collision; ball gains `runMetres + res.gainMetres`. `backfieldPenalty` and `breakdownMod` consumed | evasion ≥ 15 = line_break; collision ±5 = dominant |
| **Breakdown** | `ARS = stackedScore(supporters, breakdown, strength) + rng(1,20) + attackBonus` (attackBonus = 6 if previous play was `dominant_carry`, else 0). `stackedScore` sorts players best-first and applies weights [1.0, 0.6, 0.4, 0.3], inner formula per player is `(leadStat×0.6 + supportStat×0.4 + (discipline−50)×0.15) × weight`, summed and divided by 2 — so body count, quality, AND discipline all matter, with diminishing returns. DTS varies by `defendingBreakdown`: **jackal** = `breakdown×0.7 + strength×0.3 + (discipline−50)×0.15 + rng(1,20)`; **counter_ruck** = `stackedScore(top4defenders, strength, breakdown) + rng(1,20)` (top 4 defenders by `strength×0.6 + breakdown×0.4`; discipline term also applies per player inside stackedScore); **shadow** = `rng(1,10)` (concedes ball to set line) | margin ≥ 10 clean_ball; ≥ -8 slow_ball; ≥ -14 turnover; else penalty_defending |
| **Scrum** | `avg(setPiece×0.6 + strength×0.4) + (avg(discipline)−50)×0.15 + rng(1,20)` per pack (all 8 forwards) | attack margin > 15 attacking_dominant_penalty; > 0 stable_win; > -8 wheel; else defending_dominant_penalty |
| **Lineout** | `throwScore = hookerSetPiece + rng(1,100)` < 95 → `crooked_throw` (scrum, possession flips); then `(setPiece×0.5 + agility×0.5) + rng(1,20)` each jumper | margin ≥ −5 clean_catch; ≥ −15 scrappy_knock_on; else steal |
| **BoxKick** | `kickScore = kicking + rng(1,20)` ≥ 75 → very_good (contested, 20m); else poor (uncontested, 50-50 30m or 8m; `catchScore = (handling+positioning)/2 + rng(1,20) + fullbackMod` ≥ 35). `fullbackMod`: `three_back` +15, `two_back` +8, `one_back` 0 | contested: margin ≥ 10 attack_retain; ≥ 0 defend_knock_on; else defend_catch_contested. Uncontested: catchScore ≥ 35 defend_catch; else knock_on |
| **TacticalKick** | `kickScore = kicking + rng(1, 20)` < 25 → poor_kick. Touch probability reduced by backfield: `three_back` −25, `two_back` −15. If kick caught: `breakdownMod.attack` = `three_back` +10, `two_back` +5 | goodKick: 30–50m, outOnTheFull 0%, touch 75% (minus reduction); poorKick: 10–20m, outOnTheFull 30%, touch 30% → Lineout / OpenPlay. Ball clamped to 5–95 (never within 5m of try line) |
| **GoalKick** | `kicking + composure×0.2 − anglePenalty + rng(1,100)` | ≥ 120 = success (~80% for kicking 85, composure 80, central kick) |

### Player selection per phase

| Phase | Attacker | Defender |
|---|---|---|
| KickOff | id=10 (fly-half) as kicker; chaser: any (`high_ball`/`grubber`) or from ids 7,11,14 (`short_kick`) | receiver: ids 9,11,14,15 (`high_ball`) or ids 1–8 forwards (`short_kick`/`grubber`) |
| PhasePlay | `randomPlayer(attackTeam)` as carrier; Out the Back adds id=10 (fly-half, skipped if carrier IS #10) then random from ids 11/13/14/15 | `randomPlayer(defendTeam)` |
| FirstPhase | id=10 (fly-half) always; Crash Ball → id=12 (inside centre); Wide Play → id=13 (outside centre) → random from ids 11/14 (wings) | Crash Ball: id=12; Wide Play: random from ids 11/14 |
| KickReturn | `state.kickReturnCarrier` (set by prior kick phase) ?? `randomPlayer(attackTeam)` | `randomPlayer(defendTeam)` |
| Breakdown | 2–4 forwards sampled at random without replacement from `players.filter(p.id <= 8 && p.id !== carrierId)` — count = 4 (`pick_and_drive`), 3 (`balanced`), 2 (`wide_play`) per `attackingBreakdown` tactic | 1 back-row player sampled at random from `players.filter(p.id >= 6 && p.id <= 8)`; full pack (`p.id <= 8`) passed for `counter_ruck` |
| BoxKick | id=9 (scrum half) as kicker; random from id=11\|14 (wingers) as chaser | id=15 (fullback) |
| Scrum | `players.filter(p => p.id <= 8)` (all 8 forwards) for pack score; `filter(p => p.id <= 3)` for front-row rating adjustments | same filters on defend team |
| Lineout | hooker=id 2; jumper=random from `[4, 5, 7]` (Left Lock / Right Lock / Openside Flanker) | `find(id===4\|5\|6)` → always id 4 (Left Lock) |
| TacticalKick | id=10 or id=9 (fly-half/scrum-half) | id=15 (fullback) |
| ConversionKick | id=10 (fly-half) | — |
| TryScored | last event primaryPlayer (carrier) | — |

### Tactics system

Five tactic dimensions are defined in `TeamTactics` (see `src/types/team.ts`). The UI (`TacticsMenu.ts`) lets the **home team** change all five mid-match. Away team uses engine defaults and cannot be changed through the UI.

Kick-off strategy is **not** a standing tactic. It is chosen per kick-off via an interactive modal (home team only). Away team always defaults to `high_ball`. `KickOffStrategy` is defined in `src/types/engine.ts`.

| Tactic | Values | Engine effect |
|---|---|---|
| `attackingGamePlan` | `possession` / `balanced` / `kicking` | Kick-or-carry probability in OpenPlay (per pitch zone); box kick propensity in Breakdown |
| `attackingStyle` | `keep_it_tight` / `balanced` / `wide_wide` | Hard Carry vs Out the Back split in OpenPlay (90/10, 70/30, 50/50) |
| `attackingBreakdown` | `pick_and_drive` / `balanced` / `wide_play` | Supporter count (4 / 3 / 2) in `BreakdownEvent`; `pick_and_drive` adds ×1.1 fatigue decay to all forwards |
| `defendingBreakdown` | `jackal` / `counter_ruck` / `shadow` | DTS formula branch in `BreakdownResolver`; `counter_ruck` adds ×1.1 fatigue decay to all forwards |
| `backfieldDefence` | `one_back` / `two_back` / `three_back` | Touch probability reduction in TacticalKick; `fullbackMod` bonus in BoxKick; front-line penalty in OpenPlay carry; return momentum bonus when kick is caught |

Kick-or-carry probabilities by `attackingGamePlan` and pitch zone:

| Plan | Own 22 | Own half | Opp half |
|---|---|---|---|
| `possession` | 50% | 15% | 0% |
| `balanced` | 75% | 50% | 10% |
| `kicking` | 90% | 65% | 15% |

Box kick propensity by `attackingGamePlan` (triggered from slow ball in Breakdown):

| Plan | Condition |
|---|---|
| `possession` | Never |
| `balanced` | In own half and not in own 22 |
| `kicking` | Not in opposition 22 and not in own 22 |

### Tactical commentary

Event handlers append tactic-aware commentary notes to the standard `getCommentary(...)` string using a local `tacticNote(chancePct, ...lines)` helper (defined at the top of each event file). The helper returns `' ' + randomLine` at the given probability, or `''`. Notes are only appended when the **home team** is the relevant party (attacker or defender, depending on context). Probabilities are 25–35% so notes appear often enough to be noticed without saturating the feed.

| Event file | Trigger condition | Home team role | Probability |
|---|---|---|---|
| `BreakdownEvent` | `pick_and_drive` + `clean_ball` | attacking | 30% |
| `BreakdownEvent` | `wide_play` + `slow_ball` or turnover conceded | attacking | 30% |
| `BreakdownEvent` | `pick_and_drive` or `wide_play` + `penalty_defending` | attacking | 25% |
| `BreakdownEvent` | `jackal` + `turnover` | defending | 35% |
| `BreakdownEvent` | `counter_ruck` + `slow_ball` or `turnover` | defending | 30% |
| `BreakdownEvent` | `shadow` + `clean_ball` conceded | defending | 30% |
| `BreakdownEvent` | `jackal` + `penalty_defending` | defending | 25% |
| `OpenPlayEvent` / `FirstPhaseEvent` / `KickReturnEvent` | `line_break` + `backfieldPenalty < 0` (two/three_back) | defending | 30% |
| `TacticalKickEvent` | kick caught + `returnBonus > 0` (two/three_back) | defending (just flipped to attacking) | 35% |
| `TacticalKickEvent` | `fifty_twenty_two` + `one_back` defending | defending | 25% |
| `BoxKickEvent` | `defend_catch` + `fullbackMod > 0` (two/three_back) | defending | 30% |

`OpenPlayEvent` and `FirstPhaseEvent` prepend structural commentary lines (always-on, not probabilistic) for the Out the Back / Crash Ball / Wide Play paths, naming the passer and receiver before the outcome commentary.

Commentary templates support four interpolation tokens: `{primary}` (`primaryPlayer` formatted as `"Surname (#N)"`, or "the player"), `{secondary}` (`secondaryPlayer` formatted as `"Surname (#N)"`, or "the defender"), `{side}` (attacking team name), and `{defside}` (defending team name — sourced from `GameEvent.defSideName`). Tactic notes in event handlers use template literals with `attackTeam.name` / `defendTeam.name` directly rather than going through `getCommentary()`.

### Player attributes — known gaps

One attribute does not currently influence in-play resolution:

- **`stamina`** — controls fatigue decay rate via `rng(4,12) * (1 − staminaBase/150)` but never appears in a resolver formula directly. For forwards (id ≤ 8), decay is further multiplied by 1.1 per tactic: `pick_and_drive` (attacking) and `counter_ruck` (defending) each add 10%, cumulative (both = ×1.21 total).

Two attributes (`kicking`, `positioning`) are never degraded by fatigue. Full fatigue attribute degradation table:

| Attribute | <90% | <80% | <70% | <50% | <30% |
|---|---|---|---|---|---|
| pace | — | — | ×0.75 | ×0.55 | ×0.35 |
| agility | — | — | ×0.75 | ×0.55 | ×0.35 |
| handling | — | — | ×0.80 | ×0.60 | ×0.40 |
| discipline | — | — | ×0.80 | ×0.60 | ×0.40 |
| composure | — | — | ×0.80 | ×0.60 | ×0.40 |
| setPiece | — | — | ×0.80 | ×0.60 | ×0.30 |
| breakdown | — | — | ×0.80 | ×0.60 | ×0.30 |
| tackling | — | ×0.80 | — | — | ×0.40 |
| strength | ×0.90 | — | ×0.70 | ×0.50 | ×0.30 |
| kicking, positioning | unchanged | unchanged | unchanged | unchanged | unchanged |

When a player's fatiguePct drops below 50% for the first time, `applyFatigue` returns that player in a list; `MatchCoordinator` emits a commentary event with a randomised "looking tired/leggy/worn out" line.

### Player rating system

Ratings are stat-driven, not delta-driven. There is no `adjustRating()` method. Instead, event handlers increment named counters on `player.matchStats`, and after every `resolvePhase()` call (and after penalty goal kicks), `recalculateRatings()` runs `computeRating(player)` on all 30 players and writes the result to `player.rating`.

**`computeRating`** is a pure function in `src/engine/RatingEngine.ts`. Returns `clamp(6.0 + score / 10.0, 1.0, 10.0)` where `score` is built from universal weights plus position-aware bonuses:

Universal: `tries×7.0`, `lineBreaks×2.5`, `defendersBeaten×0.8`, `turnoversWon×2.5`, `dominantTackles×1.0`, `tacklesMade×0.35`, `kicksMade×1.0`, `metresCarried×0.05`, minus `knockOns×1.5`, `missedTackles×0.5`, `penaltiesConceded×1.2`, `kicksMissed×0.75`.

Position bonuses: hooker (#2) lineout accuracy; locks (#4,5) lineout catches/steals; front row (#1–3) scrum penalty differential; back row (#6–8) extra turnover + carry weight; scrum half (#9) `passes×0.05`; fly-half (#10) `kicksFromHand×0.25`; wings/fullback (#11,14,15) extra line break weight.

**`PlayerMatchStats`** is declared in `src/types/player.ts`, initialised by `zeroMatchStats()` in `initPlayer()`. Fields: `carries`, `metresCarried`, `lineBreaks`, `defendersBeaten`, `knockOns`, `passes`, `tacklesAttempted`, `tacklesMade`, `dominantTackles`, `turnoversWon`, `penaltiesConceded`, `tries`, `kicksFromHand`, `kicksAtGoal`, `kicksMade`, `kicksMissed`, `lineoutThrows`, `lineoutWins`, `lineoutCatches`, `lineoutSteals`, `scrumPenaltiesWon`, `scrumPenaltiesConceded`, `kickMetres`, `rucksHit`.

**Extending:** add one field to `PlayerMatchStats` + one `field: 0` in `zeroMatchStats()` + increment site(s) in the relevant event file(s) + optional weight in `computeRating()`.

**Pass tracking:** `scrumHalf.matchStats.passes++` fires in `FirstPhaseEvent` (always — #9 distributes after every scrum/lineout) and in `OpenPlayEvent` (when `scrumHalf !== carrier` — #9 distributes after every breakdown unless #9 is the random carrier).

Note: `tackles.attempted` is incremented for `dominant_tackle`, `dominant_carry`, `play_on`, and `line_break` outcomes. `tackles.made` is only incremented for `dominant_tackle`, `dominant_carry`, and `play_on`. Line breaks count as a missed tackle, so tackle % correctly reflects evasion.

### UI module responsibilities

| Module | Sole responsibility |
|---|---|
| `Scoreboard.ts` | Team names, scores, clock, phase badge |
| `StatsPanel.ts` | Stats table (cached by stat-value key, re-renders on change) + player stats panel (DOM-patched once per game minute) |
| `PitchStrip.ts` | Ball marker position + attack direction label + end-label swap at half-time |
| `CommentaryFeed.ts` | Appending commentary entries (max 30, prepend-scrolls); one-shot `stateChange` subscription caches team colours, names, and full squad rosters; colorizes all player name mentions in their team colour; colorizes team name mentions (The Lions, The Eagles) in their team colour |
| `ModalManager.ts` | Penalty choice bottom sheet / centred dialog |
| `PreMatchScreen.ts` | Pre-match player attribute table; calls `onStart()` callback to trigger `engine.initialize()` |
| `SimController.ts` | Play / Pause / Speed controls (the only UI module that calls engine methods) + view toggle button handlers that switch `#panel-bottom` between `view-dashboard`, `view-commentary`, `view-stats`, `view-players` |

`AppShell.ts` injects the static HTML skeleton. All UI modules are initialised before `engine.initialize()` fires — they are purely reactive and have no internal state beyond DOM references, render caches, and one-shot initialisation values. Player objects are created once in `MatchCoordinator` and mutated in-place throughout the match; their identity (name, id, team membership) never changes. Commentary colourisation scans commentary text for `"Name (#N)"` patterns from a cached roster of all 30 players (both squads) and team name strings, wrapping matches in inline-coloured spans. Player names are unique across both squads.

### Live match screen layout

```
#scoreboard                      — score grid (3 columns) + pitch strip (spans all 3)
  #score-home / #match-clock / #score-away
  #pitch-wrapper (grid-column: 1/-1)
    .end-label#home-end-label
    #pitch-field                 — striped pitch; lines at 8%/24%/50%/76%/92%
      #ball-marker               — SVG rugby ball (amber, drop-shadow); left set by PitchStrip
      #attack-label              — overlaid at bottom of pitch; shows shortName e.g. "LNS attacking →"
    .end-label#away-end-label
#view-toggle-bar                 — 4 icon-only Heroicon buttons; active one gets class "active"
  #btn-view-dashboard            — Squares2X2 icon
  #btn-view-commentary           — ChatBubbleLeftEllipsis icon
  #btn-view-stats                — ChartBar icon
  #btn-view-players              — UserGroup icon
#panel-bottom.view-{mode}        — class drives layout; switched by SimController
  #panel-commentary              — commentary feed (always present in DOM)
  #panel-stats                   — match stats only (#stats-content inside)
  #panel-players                 — player stats only (#player-stats-content inside)
#sim-controls / #ctrl-bar        — unchanged
```

`#panel-bottom` layout modes (class on the element):
- `view-dashboard` — CSS grid 3fr/2fr; commentary left, stats+players stacked right (1fr/1fr rows)
- `view-commentary` — flex column; stats and players `display:none`
- `view-stats` — flex column; commentary and players `display:none`
- `view-players` — flex column; commentary and stats `display:none`

`StatsPanel.ts` writes to `#stats-content` and `#player-stats-content` regardless of active view — live data always flows, only visibility changes. **Do not merge `#panel-stats` and `#panel-players` back into one element** — the separate IDs enable independent view modes.

Two key fields carry state between phases:
- `MatchState.kickReturnCarrier?: Player` — set by each kick handler before transitioning to `KickReturn`; consumed and cleared at the start of `KickReturnEvent`. Sources: `KickOffEvent` (clean_receive, short_kick_retain), `BoxKickEvent` (attack_retain, defend_catch_contested, defend_catch), `TacticalKickEvent` (kick_caught).
- `GameEvent.defSideName?: string` — the defending team's name, set by `draftEvent()` from `state.possession`. Used via the `{defside}` interpolation token in commentary templates to name the defending team explicitly (e.g. "The Eagles hold at the gain line").

### Design system

**`DESIGN.md` is the single source of truth for all visual decisions.** Read it before touching any UI code. Every colour, font, spacing, and component pattern is documented there. When in doubt, consult `DESIGN.md` first — do not invent visual decisions.

CSS custom properties are defined in `style/main.css` `:root` and must be used for every colour — no hardcoded hex except: primary CTA green (`#007a2a` / `#009434` active / `#006622` pressed) and team identity colours injected inline from team JSON data.

Key token prefixes from the `--rm-*` system: `--rm-bg`, `--rm-surface`, `--rm-surface-2`, `--rm-surface-3`, `--rm-border-soft`, `--rm-border`, `--rm-hairline`, `--rm-chalk`, `--rm-text`, `--rm-text-muted`, `--rm-text-dim`, `--rm-pitch`, `--rm-amber`, `--rm-coral`, `--rm-font-display` (Anton), `--rm-font-editor` (Instrument Serif), `--rm-font-body` (Geist), `--rm-font-mono` (JetBrains Mono).

Font roles — apply consistently:
- `--rm-font-display`: impact headings, CTA button labels, scoreboard scores
- `--rm-font-editor`: editorial moments, subtitles, choice descriptions, try commentary
- `--rm-font-body`: body copy, UI labels, tab text
- `--rm-font-mono`: all live numbers, stats, clocks, ratings

**All live numeric values** must use `font-family: var(--rm-font-mono); font-variant-numeric: tabular-nums` to prevent digit-width jitter.

### Team data

`src/data/team-home.json` (The Lions, `#c8102e`) and `src/data/team-away.json` (The Eagles, `#003087`). Each has 15 players with 12 base stats on a 1–100 integer scale. `initPlayer()` in `MatchCoordinator` copies `baseStats` to `currentStats` at match start, then `StaminaSystem.applyFatigue()` mutates `currentStats` over the course of the match. `baseStats` is never modified.

## Placeholder Data in Pre-Match Screen

The pre-match header contains several elements that display hardcoded placeholder values because the underlying data systems do not exist yet. These must be replaced when the relevant systems are built:

- **Round number** (`"Round 1"` in the match context label) — needs a season/match progression system.
- **Form pins** (e.g. `WWLWD`) — needs a match result history store per team.
- **Stake row** (League position, Head-to-Head record, Odds) — needs season table data and a fixture/odds system.
- **Match kick-off time** (`20:00`) — needs scheduled match times.
