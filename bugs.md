# Bugs, Architecture Issues & Inefficiencies

Full-codebase review (branch `claude/rugby-game-review-whg1fa`). Baseline at review time: clean tree, `npm run verify` passes (match determinism, season determinism, save schema), `npx tsc --noEmit` clean. Every finding below was verified against the source — several empirically (the fixture-generator bug was reproduced over 2,000 seeds).

Each item is written to be handed to an implementing agent as a standalone task. **Cross-cutting rules for the implementer** (from CLAUDE.md):

- Any `src/engine/` change must update `docs/match-engine.md` in the same commit; `src/game/` changes update `docs/game-engine.md` (and `docs/transfer-system.md` where noted).
- Fixes marked **[RNG]** change the consumption order/count of a seeded RNG stream. They are still correct fixes, but the determinism hashes in `npm run verify` will change once — re-run `verify` and accept the new behaviour deliberately, one such fix per commit.
- Fixes marked **[TELEMETRY]** will shift balance baselines — re-run `npm run telemetry` after and sanity-check the report (do not hand-edit `telemetry/latest.md`).
- `npm run build` and `npm run verify` must pass before every commit.

---

## CRITICAL

### BUG-01 — Year-2+ fixture generator silently drops fixtures; teams play fewer than 18 games **[RNG] [season]**

**File:** `src/game/fixtures.ts:80-109`

The non-derby rounds are filled with a *greedy* matching pass over a shuffled pool. Greedy per-round matching frequently deadlocks (the fixtures remaining for a round share teams), the round is left short (`round.length < 5`), and whatever is left in `remaining` after the 16-slot loop is **silently discarded** — there is no `remaining.length === 0` check:

```ts
for (const slot of nonDerbySlots) {
  ...
  for (let i = 0; i < remaining.length && round.length < 5; i++) { ... }
  allFixtures.push(...round);
}
return allFixtures;   // leftover `remaining` fixtures are dropped
```

**Evidence:** reproducing the algorithm byte-for-byte (mulberry32 + same shuffle/greedy) over 2,000 seeds: **1,997/2,000 seasons drop 4–12 fixtures** (83–86 instead of 90), and in all of those at least one team plays fewer than 18 games. Year 1 is unaffected (hand-authored `PREMIERSHIP_2025_26`); **every rolled-over season is corrupted**: unequal `played` in standings, wrong `playoffRaceStatus` math (`gamesRemaining` assumes 18), budget/position outcomes derived from a malformed table. Invisible to `npm run verify` because the corruption is deterministic.

**Fix:** replace the greedy fill with a real circle-method double round-robin — a correct circle implementation already exists in `src/game/cupScheduler.ts::roundRobinRounds` to model from. Simplest correct shape: generate the full 18-round circle schedule over the 10 teams, then swap whole rounds so the rivalry fixtures land in rounds 3/12 (swapping whole rounds preserves the perfect matching). Add a hard `if (remaining.length > 0) throw` style assertion (e.g. assert 90 fixtures, each team 18 games, 9H/9A) so any future regression is loud. Also fix the file header + `docs/game-engine.md` §`fixtures.ts`, which both claim a "standard 'circle' method" that the current code is not.

### BUG-02 — Out-of-bounds Fisher–Yates in year-2+ European pool draw → `undefined` team ids; European competition silently dies **[season]**

**File:** `src/game/europeanScheduler.ts:172-179`

```ts
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rngTransfer(0, i + 1));   // BUG
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

`rngTransfer(min, max)` (`src/utils/rng.ts:96-99`) returns an integer in **[min, max] inclusive**, so `rngTransfer(0, i + 1)` yields `j ∈ [0, i+1]` — `j === i+1` indexes one **past** the range, swapping `a[i]` with `undefined` and growing the array. P(corruption) ≈ 78% per 8-element shuffle. The two other shuffles in the repo use the correct idiom (`fixtures.ts:67`, `cupScheduler.ts:171`).

**Impact:** `buildYear2EuropeanSeed` (called from `computeRollover` every rollover) builds pools with `undefined` slots and excludes real teams. Downstream `EuropeanCoordinator.simulatePoolFixture` → `teamsById.get(undefined)` → fixture skipped forever → `allPoolFixturesDone` never true → knockout never seeds → European competition silently dead from year 2 on.

**Fix:** `const j = Math.floor(rngTransferRaw() * (i + 1));` (matches the two correct shuffles, same one-draw-per-step cost). Additionally extend `assertSeasonInvariants` to assert no `undefined`/unknown teamIds in pool standings when European state exists.

---

## HIGH

### BUG-03 — Penalty tap-and-go applies the carry distance twice **[TELEMETRY] [engine]**

**File:** `src/engine/PenaltyHandler.ts:299-313`

`CARRY_RESOLVED` already moves the ball (`applyMatchEvent.ts:92`). The next statement builds a `BALL_REPOSITIONED` whose `x` is computed from the **already-moved** `state.ball.x`:

```ts
applyMatchEvent(state, { type: 'CARRY_RESOLVED', …, metres: Math.max(0, gainMetres), direction, … });
applyMatchEvent(state, { type: 'BALL_REPOSITIONED',
  x: clamp(state.ball.x + direction * gainMetres, 0, 100) });   // ball.x already includes the carry
```

Every positive gain applies twice: a 3–8m dominant carry moves 6–16m; a tap-and-go line break (5–30m) moves 10–60m — from the 5–10m tap zone that's effectively an automatic try. The `isTryScoredAt` check and the `movements` path both reflect the doubled position. Inconsistent bonus quirk: negative `dominant_tackle` gains are zeroed by `Math.max(0, g)` and applied once — every other carry handler passes raw negative metres.

**Fix:** drop the second `BALL_REPOSITIONED` x-advance entirely and let `CARRY_RESOLVED` own the move, passing raw `gainMetres` like the other carry handlers. Keep the `movements` snapshot consistent (it should end at the single-applied final position). Update `docs/match-engine.md` § "Choice: tap_and_go". Re-run telemetry — tap-and-go try rate will drop.

### BUG-04 — Authored first-phase choreography teleports the ball past an obstruction penalty mark **[TELEMETRY] [engine]**

**File:** `src/engine/events/FirstPhaseEvent.ts:114-134` (event surgery) and `:563-577` (obstruction return)

`applyChoreography` runs on every return path for registered play types (`out_the_back`, `crash_ball`). The dynamic truncation only handles `KNOCK_ON` / `INTERCEPTION` / `CARRY_RESOLVED`. The **obstruction penalty** return has none of those, so `truncateT` stays 1.0 and the *entire* authored ball path (20–40m of travel) is appended **after** `PENALTY_AWARDED`. The penalty is then adjudicated and taken from the authored end-of-move position, not the mark: `CardHandler.evaluateNewPenalty()` reads `inOwn22For`, `PenaltyHandler` reads `inOppositionHalf`/`metresFromOppositionTryLine`/kick origin — all off the wrong spot. It also bypasses `PENALTY_AWARDED`'s `[5,95]` clamp. At `OBSTRUCTION_BASE_PCT = 4` per out-the-back attempt this fires ~0.6×/match, in both live and silent modes (state-affecting, so it also feeds telemetry).

**Fix:** in `applyChoreography`, when `res.events` contains a `PENALTY_AWARDED` and no `CARRY_RESOLVED`/`KNOCK_ON`/`INTERCEPTION`, skip appending `authoredBallEvents` (fall back to the procedural path). Update `docs/match-engine.md` § FirstPhase.

### BUG-05 — `TRANSFER_ACTIVATED` contract expiry is one year short — 1-year pre-agreements arrive already expired **[season]**

**File:** `src/game/careerRollover.ts:63`

```ts
expiresOn: `${newSeasonStartYear + move.lengthYears - 1}-06-30`,
```

Every other contract-granting path uses `expiryAfterYears(state, L)` = `${newSeasonStartYear + L}-06-30` (`src/game/aiTransferDirector.ts:161-171`). The pre-agreement the user/AI agreed to was quoted with that expiry; activation writes one year less. Rolling 2025/26 → 2026/27 with `lengthYears: 1` writes `2026-06-30` — expired **before the season it covers starts**. A 2-year deal lasts one season. Knock-ons: an already-expired contract is invisible to `isContractExpiringSoon` and `isPoachEligible` (both require `monthsAhead >= 0`) — no "Expiring" tag, not poachable, dumps into the renewal window a year early.

**Fix:** `expiresOn: \`${newSeasonStartYear + move.lengthYears}-06-30\``. Also fix the self-contradicting example comment in `expiryAfterYears` (says "→ 2028-06-30"; its own formula gives 2029-06-30).

### BUG-06 — SimController leaks a click listener on each speed button every match **[ui]**

**File:** `src/ui/SimController.ts:98-100`

`initSimController(engine)` runs once per match. It unsubs the previous match's eventBus handlers and uses `onclick =` assignment for the other buttons, but the speed buttons use `addEventListener` on **persistent** DOM (`.speed-btn` in the permanently-mounted `#app` shell, `index.html:140-143`):

```ts
speedBtns.forEach(btn => {
  btn.addEventListener('click', () => applySpeed(Number(btn.dataset.ms)));
});
```

After N matches, one tap runs `applySpeed` N times — N−1 of them closing over **destroyed** `MatchCoordinator` instances (`engine.setTickDelay(ms)` mutates dead match state and pokes the dead streamer), plus N duplicate `ui:speedChange` emits and N `saveTickDelayMs` writes. Unbounded growth per session.

**Fix:** register via `btn.onclick = () => applySpeed(...)` like the other buttons, or push `removeEventListener` closures into the existing `unsubs` array (the `settingsOverlay` backdrop handler at lines 203-204 already shows the pattern).

### BUG-07 — SaveManager backup rotation can overwrite the good `.bak` with a corrupt primary **[ui/save]**

**File:** `src/ui/SaveManager.ts:734-736`

```ts
const prev = getRawSlot(id);
if (prev) setRawBak(id, prev);          // rotates WITHOUT validating prev parses
localStorage.setItem(SLOT_KEY[id], raw);
```

The exact scenario `.bak` exists for — primary corrupt, `.bak` holds the last good save, `loadSlot` (lines 675-682) booted the career from `.bak` — is destroyed on the next autosave: the corrupt primary is copied over the good `.bak`. If the subsequent primary write then throws (quota — the very failure mode the comment block says rotation protects against), the slot has corrupt primary **and** corrupt `.bak`: career lost on web (no disk history; web `listBackups` also reads only this `.bak`, `saveBackup.ts:186-188`).

**Fix:** gate the rotation on parseability: `if (prev && parseRawSave(prev)) setRawBak(id, prev);`.

---

## MEDIUM

### BUG-08 — Breakdown carry-handoff read off the commentary-log tail is corrupted by same-tick announcements — includes a live/silent determinism divergence **[RNG] [engine]**

**Files:** `src/engine/events/BreakdownEvent.ts:35-58`; producer `src/engine/MatchCoordinator.ts:905-931`

`handleBreakdown` reads `state.events[state.events.length - 1]` for `carrierId` and the previous carry `outcome` (drives `CARRY_HANDOFF_BONUSES.lineBreak`/`dominantCarry`). But other orchestrators log `COMMENTARY_LOGGED` events between the carry tick and the breakdown resolve within the same tick:

- The AI-tactics announcement (`tickBody`, gated `!this.silent`) is logged before `resolvePhase()` — **only in live mode**, so a live match and a silent match with the same seed read different log tails and produce **different breakdown modifiers**, contradicting the documented invariant that silent and live outcomes are identical.
- Silent-mode AI subs and red_20 forced-sub announcements land at the tail in both modes — silently zeroing the handoff bonus.

This is the same failure mode the `pendingTryScorer` comment warns about (`PhaseRouter.ts:106-114`); the try scorer was fixed, the breakdown read wasn't.

**Fix:** thread the previous carry through state like `pendingTryScorer`: add a `LAST_CARRY_SET { outcome, carrierId }` MatchEvent variant (+ `applyMatchEvent` branch + `docs/match-engine.md` § "Mutation boundary" list), emitted by the carry handlers / `PhaseRouter`; have `handleBreakdown` read `state.lastCarry` instead of the log tail.

### BUG-09 — Try projection ignores offload-chain metres — legitimately scored tries are denied **[engine]**

**Files:** `src/engine/events/OpenPlayEvent.ts:315-317`, `src/engine/events/FirstPhaseEvent.ts:740-742`, `src/engine/events/KickReturnEvent.ts:110-116`

When `tryOffloadChain` fires, each completed link already queued its own `CARRY_RESOLVED` (`offloadChain.ts:99-108`). The handler's try check projects only the **final** link's gain from the *pre-phase* ball position:

```ts
const projectedBallX = clamp(state.ball.x + direction * res.gainMetres, 0, 100);
```

The actual applied position includes all chain links' gains and can cross 95 while `tryScored` computes false — the try is denied and play restarts at a breakdown parked at x ≥ 95.

**Fix:** have `tryOffloadChain` return the summed metres of the link `CARRY_RESOLVED`s it emitted (`chainMetres`); project `state.ball.x + direction * (chainMetres + res.gainMetres)` at all three call sites (KickReturn: `+ totalMetres`).

### BUG-10 — Stale `penaltyKickToTouchLineout` flag after a missed penalty kick to touch in the red — grants an extra possession past full time **[engine]**

**Files:** `src/engine/PenaltyHandler.ts:205-207`; consumer `src/engine/ClockController.ts:78-84`

The flag is set whenever `state.clock.clockInTheRed`, *before* the touch roll resolves. If `res.findsTouch === false` the phase goes to `KickReturn` and the flag is never consumed. The **next** lineout in the red (opposition clearance, or a `tap_and_kick_dead` which deliberately relies on the flag being unset) hits `shouldEndPeriod`'s Lineout branch, which resets the flag and returns `false` — wrongly granting one extra possession past the final whistle.

**Fix:** move the `PENALTY_KICK_TO_TOUCH_FLAG_SET` emit inside the `if (res.findsTouch)` branch (or clear it in the miss branch).

### BUG-11 — Substitute familiarity scaled against the outgoing player's *natural position*, not the slot **[engine]**

**File:** `src/engine/applyMatchEvent.ts:532-537` (`SUBSTITUTION_APPLIED`)

```ts
const subMult = positionFamiliarity(on.position, off.position);
```

`off.position` is the outgoing player's natural role, not the slot's role. If the starter was already out of position (natural Wing started at #12), a natural Centre subbing into slot 12 is scaled by `positionFamiliarity('Centre','Wing') = 0.92` instead of `slotFamiliarity('Centre', 12) = 1.0`. It also breaks the invariant the `POSITION_SWAP` rescale depends on (`applyMatchEvent.ts:574-578`: "baseStats ≈ roster × slotFamiliarity(position, id)"), so a later swap rescales from a false baseline. Related: line 540 `on.position = off.position` propagates the wrong role onward (next sub at this slot, injury `positionVuln`, AI like-for-like pickers).

**Fix:** `subMult = slotFamiliarity(on.position, off.id)` (slot's nominal role via `SLOT_POSITION`), and set `on.position = SLOT_POSITION[off.id]`.

### BUG-12 — European elimination wrappers are not idempotent — double-click double-applies board confidence and duplicates media stories **[season]**

**File:** `src/game/GameCoordinator.ts:906-976` (`recordPlayerEuropeanPoolResult`, `recordPlayerEuropeanKnockoutResult`)

The inner `EuropeanCoordinator.recordPlayerEuropean*Result` calls are idempotent (`if (!fx || fx.result) return;`), but the wrappers then unconditionally run `getEliminationStage(...)` → `board.applyEuropeanElimination(...)` + `MEDIA_STORY_PUBLISHED`. On a repeat call (the same un-debounced Continue-button race that `recordPlayerMatchResult`'s re-entry guard exists for) the board delta (−5/−10) applies twice and the story duplicates (the `MEDIA_STORY_PUBLISHED` reducer has no duplicate-id guard, `applySeasonEvent.ts:66-68`).

**Fix:** have the EuropeanCoordinator methods return a boolean "recorded this call" (or check `fx.result`/`match.result` before calling); early-return from the wrapper when it was already recorded, before any side effects.

### BUG-13 — Retired players are never culled; retired loan-pool players remain signable **[RNG] [season]**

**Files:** `src/game/careerRollover.ts:70-97`; `src/game/applySeasonEvent.ts:201-210` (`PLAYER_RETIRED`)

(a) **Bug proper:** the `PLAYER_RETIRED` reducer removes the id from `club.squad`, `freeAgents`, `pendingMoves` — but **not** `state.career.loanPool`. A retired loan-pool player remains listed on the Loan screen and `signLoanPlayer` (`TransferCoordinator.ts:1180-1188`) will add them to the user's squad.
(b) **Unbounded growth:** there is no `retired` flag; the rollover loop iterates every roster entry forever. Each retired player keeps consuming ~26 rngTransfer draws/season (aging noise + retirement roll), keeps emitting `PLAYER_AGED`, re-emits `PLAYER_RETIRED { clubId: '' }` on later hits, and is walked weekly by `computeMoraleDecayEvents` (`moraleEffects.ts:68-82`). With ~32 new players/season and zero removal, rollover cost grows unboundedly.

**Fix:** (a) add `state.career.loanPool = state.career.loanPool?.filter(id => id !== event.rosterId)` to the `PLAYER_RETIRED` branch — safe, no RNG impact. (b) add an additive-optional `retired?: true` flag to `Player` (no SAVE_VERSION bump; update the `checkSaveSchema` snapshot only if it serialises on a fresh save) and skip retired players in `computeRollover`'s aging loop and `computeMoraleDecayEvents` — this changes the rngTransfer sequence, so land it as a deliberate **[RNG]** commit.

### BUG-14 — Crashed match never destroys the MatchCoordinator; stale `engine:finished` subscription survives **[ui]**

**Files:** `src/main.ts:1302-1308, 1426-1429, 1693-1696`; `src/engine/MatchCoordinator.ts:815-840`

Each match start registers `const unsub = eventBus.on('engine:finished', ...)` and only unsubs inside that handler; `engine.destroy()` is only called from the result screen's Continue. On a tick crash, `reportTickCrash` emits `engine:error` and never `engine:finished`, so: (a) the stale `engine:finished` listener fires when the *next* match finishes, calling `showMatchResult(oldEngine, oldState, oldRound)` alongside the live handler; (b) the crashed coordinator's constructor-registered `busUnsubs` (ui:substitution, ui:tacticsChange, …) are never released, so subsequent matches' UI emits also mutate the dead match's state. Violates the documented "MatchCoordinator must be destroyed" invariant.

**Fix:** in each of `onMatchStart`/`onPlayoffMatchStart`/`onEuropeanMatchStart`, also register `const unsubErr = eventBus.on('engine:error', () => { unsub(); unsubErr(); engine.destroy(); });` and have the finished handler clear `unsubErr` too.

### BUG-15 — `flushActiveGame` resurrects a cleared save after a sack **[ui]**

**Files:** `src/main.ts:541-549` (`runSackScreen`), `:1748-1755` (`flushActiveGame`)

`runSackScreen` calls `clearSave()` but leaves `gameEngine` set and `inSeasonInited` true. The `visibilitychange`/`pagehide` flush then rewrites the sacked career into the active slot when the user backgrounds the app on the Sack screen. Home shows a Continue card again; tapping it bounces back to the Sack screen, in a loop.

**Fix:** set `gameEngine = null` in `runSackScreen` after `clearSave()` (so both `flushActiveGame` and the Saves screen's `gameLive` treat the career as over).

### BUG-16 — Save-slot bleed: "Start new game here" switches the active slot while the old engine is still live **[ui]**

**Files:** `src/ui/SavesScreen.ts:191-194`; `src/main.ts:1748-1755`

`case 'new': setActiveSlot(slot); deps.onNewGame();` routes to Team Selector, but `gameEngine` still holds the previous career from another slot. Until a new engine replaces it, any background flush writes career A's payload into the slot the user designated for a *new* game; same if the user backs out of Team Selector and backgrounds later — the "empty" slot silently becomes a copy of career A.

**Fix:** clear `gameEngine` (or set a `pendingNewGame` flag checked by `flushActiveGame`) when the new-game path is entered from the Saves screen. The 'load' path is safe (engine replaced synchronously).

### BUG-17 — Per-player `offloadsCompleted` is collected but silently dropped by the season-stats seam **[season/types]**

**Files:** `src/game/seasonStatsCollector.ts:138` (supplies it), `src/types/gameState.ts:782-814` (the `statsDelta` shape omits it), `src/game/applySeasonEvent.ts:122-150` (reducer never accumulates it)

`PlayerSeasonStats.offloadsCompleted` (`src/types/player.ts:109`) stays 0 for every player forever. Excess-property checking didn't catch the collector's extra field because the outer literal contains a conditional spread (`...(competition ? { competition } : {})`, `seasonStatsCollector.ts:162`), which suppresses the check.

**Fix:** (a) add `offloadsCompleted: number;` to the `statsDelta` block in `gameState.ts` (after `defendersBeaten`); (b) add `s.offloadsCompleted += d.offloadsCompleted;` in `applySeasonEvent.ts` after line 128. No save bump (shape unchanged), no RNG impact. Optionally restructure `collectSeasonEvents` to avoid the spread (build the object, then `if (competition) ev.competition = competition;`) so excess-property checking is restored.

### BUG-18 — European qualification/elimination verdicts use a different sort than the actual R16 seeding **[season]**

**Files:** `src/game/GameCoordinator.ts:886-889` (`getEliminationStage` sorts by `leaguePoints` only), `src/game/BoardCoordinator.ts:108` (`seedEuropeanObjective` archive rank)

The actual bracket is seeded with `sortStandings` (points → diff → for) in `EuropeanCoordinator.seedR16` (lines 193-196). On level points the two sorts can rank the player's club on opposite sides of the top-4 cut: the player is told they're eliminated (board −5/−10 + media story) while actually appearing in the R16, or vice versa.

**Fix:** use `sortStandings(pool.standings)` (from `./leagueTable`) in both `getEliminationStage` and `seedEuropeanObjective`.

### BUG-19 — `SEASON_ROLLED_OVER` doesn't clear `career.activePoachedIds` (doc says it does) **[season]**

**File:** `src/game/applySeasonEvent.ts:469-550`

The branch resets `pendingMoves`, `midseasonRejections`, `staffBudgetBoost`, etc. but never `activePoachedIds`. Stale ids (including players who just transferred away) drive the Hub Transfers badge and inbox `poach:` items through the off-season until the first `updatePoachThreats()` after round 1. `docs/game-engine.md` (`POACH_THREATS_SET` row) says it's cleared at rollover.

**Fix:** add `state.career.activePoachedIds = [];` to the `SEASON_ROLLED_OVER` branch.

### BUG-20 — `toSavePayload` deep-clones the entire save graph before `JSON.stringify` — explicitly banned pattern **[season/perf]**

**File:** `src/game/GameCoordinator.ts:1366-1536` (+ helpers `cloneCupForSave`, `cloneEuropeanForSave`, `clonePlayoffs`, `clonePlayerHistoryForSave`)

CLAUDE.md §2 bans deep-cloning just to stringify. Every consumer of `toSavePayload` (~45 `autosave(...)` sites) immediately stringifies it (`SaveManager.ts:733`). The method clones `results`, `fixtures`, the whole archive **including per-season `playerSeasonHistory` maps (grows every season)**, media stories, teamSeasonStats (via `Object.fromEntries(Object.entries(...).map(...))`), playoffs, cup and both European trees — on every post-match autosave. GC churn grows with career length.

**Fix:** return references for everything that's only ever stringified (mirroring how `roster: this.state.career.roster` already does it); delete the orphaned clone helpers. Also delete the dangling truncated comment at lines 167-169. No behaviour change; verify save/load still round-trips.

### BUG-21 — Hidden screens fully re-render `innerHTML` on every `game:*` event **[ui/perf]**

**Files:** `HubScreen.ts:565-571`, `InboxScreen.ts:284-289`, `PlayerProfileScreen.ts:634-636`, `LeagueTableScreen.ts:324-327`, `FixtureListScreen.ts:231-234`, `TeamStatsScreen.ts:287-289`, `PlayerStatsScreen.ts:243-245`, `TrainingScreen.ts:152-153`, `RoundResultsScreen.ts:136`, `PlayoffBracketScreen.ts:211-212`

`game:fixtureRecorded` fires once per AI fixture (`GameCoordinator.ts:1121`), so completing one round triggers ~5 full rebuilds each of the Hub (including a `buildAssistantReport` walk over the whole league), Inbox, league table, fixture list, both stats screens, etc. Worst: `PlayerProfileScreen` — once any profile has been opened, `activeRosterId` never clears (`PlayerProfileScreen.ts:308-316`), so the radar SVG + bars + history re-render into a hidden div on every fixture/week event for the rest of the session. `EuropeanCupScreen.ts:37-39` shows the correct pattern: `if (el.offsetParent !== null) render();`.

**Fix:** adopt the `offsetParent !== null` guard in each subscription, plus a dirty flag consumed by the screen's `show*` entry (all these screens already re-render on navigation; Hub needs a `needsRender` flag consumed via its existing `refresh()`).

### BUG-22 — StatsPanel rebuilds the full 46-row player table nearly every tick **[ui/perf]**

**File:** `src/ui/StatsPanel.ts:323-336, 429-433`

`playerTableKey(state)` concatenates 13 stats × 46 players into a ~2 KB string on every `engine:stateChange` (every beat); since carry/metre counters change almost every beat, `renderPlayerTable` rebuilds the whole `<table>` via innerHTML per beat — even when the players view is hidden (one of five mutually exclusive views, `SimController.ts:233-246`). Same for the per-minute `updatePlayerStatsDOM` writing 30+ `.sp-expand-body` innerHTMLs for collapsed panels.

**Fix:** gate the key-build and render on view visibility (`offsetParent !== null`), mark dirty otherwise, re-render once when the view button activates.

### BUG-23 — `PitchPlayers.applyBeat` glide catch-all contradicts CLAUDE.md §8 and shadows dead conditionals **[ui]**

**File:** `src/ui/PitchPlayers.ts:145-204`

The catch-all at lines 193-204 schedules `dot-transitioning` on **every** phase change except the three `snapPhases`. Consequences: (a) the documented `keepTmo` contract ("does **not** enable `dot-transitioning`") is no longer true; (b) the earlier targeted blocks (lines 148-150, 160-164) are fully shadowed — dead code that misleads; (c) `dot-snap-transition`, `keepBoxKickAnnounce` (line 212), `keepSubstitution` (line 189) are undocumented in CLAUDE.md §8 despite the doc-sync rule. Also `reset()` (line 356) removes `dot-transitioning` but not `dot-snap-transition`.

**Fix:** decide the intended rule — either restore selectivity (drop the catch-all) or delete the shadowed blocks and update CLAUDE.md §8 to describe "glide everywhere except snap phases" + the two new hold flags. Either way add `dot-snap-transition` to `reset()`'s class removal.

### BUG-24 — Loan pool is never re-seeded after season 1 (comment claims it is) **[season]**

**Files:** `src/game/loanPoolGenerator.ts:4-10` (header comment) vs `src/game/careerRollover.ts`

`buildLoanPoolEvents` is only invoked from `GameCoordinator.newSeason` (line 287), which is never called again within a career — yet the comment says the pool is "replaced at the next newSeason call". The pool only shrinks and ages across a long career, compounding BUG-13.

**Fix:** either append a fresh `LOAN_POOL_SEEDED` (+ `FOREIGN_IMPORT_ARRIVED`s) in `computeRollover` — placed carefully relative to the documented "redrawCupPools stays last" RNG-ordering constraint (**[RNG]**) — or correct the comment and accept the static pool as design. Update `docs/transfer-system.md` either way.

### BUG-25 — Determinism/schema harness blind spots **[scripts]**

**Files:** `scripts/checkSeasonDeterminism.ts`, `scripts/checkSaveSchema.ts`, `scripts/checkDeterminism.ts`

1. **European coverage = zero.** The season harness hashes league/premCup/playoffs/market/roster but never European pool standings, fixture results, knockout cascade, or champion. A determinism regression confined to European sims passes `verify`. Fix: add a `europeanSummary` (mirroring `premCupSummary` ~lines 240-250) built from `preRolloverState.league.europeanCup`/`europeanShield` into `seasonSnapshots`.
2. **No save/load round-trip leg.** CLAUDE.md's claim that `careerRngOffset` snapshotting makes load/reload deterministic is never exercised. Fix: at end of season 2, `toSavePayload()` → rebuild via `GameCoordinator.fromSave` → finish season 3 on the restored coordinator → assert final hash matches the uninterrupted run.
3. **Schema check pins only two key sets** (`Object.keys(payload)` and `payload.career`). Nested shape drift (a `Player`, `FixtureResult`, `MarketState` field rename) corrupts old saves and trips nothing. Fix: extend `EXPECTED` with sorted key sets of representative nested records (one roster Player, `clubs[0]`, `fixtures[0]`).
4. **Match determinism = one seed, one pairing, one process.** Fix: loop 2-3 seeds × 2 pairings (each runs at `tickDelayMs: 0`; cheap).

---

## LOW

### BUG-26 — `PhaseContext.randomPlayer` ignores cards/injuries: off-field players can be picked as chasers/scorers **[RNG] [engine]**

**Files:** `src/engine/PhaseRouter.ts:70`; call sites `KickOffEvent.ts:22-32`, `DropOutEvent.ts:28-29`, `TryScoredEvent.ts:24`, plus empty-pool fallbacks in OpenPlay/FirstPhase/KickReturn/BoxKick/TacticalKick

`randomPlayer: (team) => team.players[rng(0, team.players.length - 1)]` — a sin-binned player can be the named kick-off chaser, and on the `short_kick` fallback path can become the retained `KICK_RETURN_CARRIER`. Violates the documented "never chosen" invariant; impact mostly narrative. **Fix:** filter through `onFieldPlayers` (the context knows the sides), keeping RNG call counts per path consistent where practical.

### BUG-27 — A just-substituted player can still run the kick return (silent mode) **[engine]**

**Files:** `src/engine/events/KickReturnEvent.ts:36`; `src/engine/MatchCoordinator.ts:357-363, 933`

Silent-mode AI subs apply immediately in `tickBody` before `resolvePhase()`; `state.kickReturnCarrier` set on the previous tick may now be substituted off, yet `handleKickReturn` still uses them (stats accrue on a player whose rating is frozen). **Fix:** validate `state.kickReturnCarrier` against `attackOnField` and fall back to the existing random on-field pick when stale.

### BUG-28 — Every scrum wheel counts as an own-scrum "won" **[engine]**

**File:** `src/engine/applyMatchEvent.ts:372-385` (`SCRUM_RESOLVED`)

For `outcome: 'wheel'`, `possessionSideAfter === attackSide`, so `ownScrums[attackSide].putIn++` **and** `won++` run on every reset — a scrum that wheels twice then is lost records putIn 3 / won 2. **Fix:** skip the `ownScrums` block when `event.outcome === 'wheel'`, mirroring how `stats.scrums` is already skipped for wheels.

### BUG-29 — Live-mode AI sub queue can assign one bench player to two starters **[engine]**

**File:** `src/engine/AISubstitutionDirector.ts:63-71`

In queued (live) mode, `pickReplacement` doesn't exclude bench players already queued this tick — two tired props both queue the single bench prop; the second `substitute()` silently no-ops and the second starter never gets the other eligible bench player. **Fix:** track queued bench `squadNumber`s in a Set and pass to `pickReplacement` as an exclusion.

### BUG-30 — Wide-receiver pick disagrees with sweep orientation at exactly y = 50 **[engine]**

**File:** `src/engine/events/FirstPhaseEvent.ts:553` — `state.ball.y < 50` vs `openSideDir` (`Lateral.ts:46`) using `y <= 50`. At a dead-centre set piece the first hop sweeps toward 100 but the chosen wing is the y=0-side one. **Fix:** change `<` to `<=`.

### BUG-31 — Invariant tripwire looser than the rating domain **[engine]**

**File:** `src/engine/invariants.ts:24` checks `rating ∈ [0,10]`, but `computeRating` clamps to `[1,10]`. **Fix:** tighten to `>= 1` and fix `docs/match-engine.md` § Runtime invariants (says `[0,10]`).

### BUG-32 — Dead/stale branches in `shouldEndPeriod` **[engine]**

**File:** `src/engine/ClockController.ts:86-93` — three unreachable branches with comments describing transitions that no longer exist (`ConversionKick→KickOff`, `Penalty→KickOff` via tap_and_kick_dead which actually goes to Lineout, `prevPhase === KickAtGoal` which never reaches `handleEndOfPeriod`). **Fix:** delete the dead branches; update `docs/match-engine.md`'s ClockController row.

### BUG-33 — `prevTickStartPhase` not updated on TMO / KickAtGoal early-return ticks **[engine]**

**File:** `src/engine/MatchCoordinator.ts:949-952` + `tickTmoReview`/`tickKickAtGoal` — early returns skip `this.prevTickStartPhase = phaseAtTickStart`, so the cross-tick `set_piece_award` commentary detector compares against a stale phase (duplicate/missing "scrum awarded" line). **Fix:** set `prevTickStartPhase` before each early return (or at the top of `tickBody`).

### BUG-34 — Two `as any` casts in `FirstPhaseEvent.ts` defeat the MatchEvent/Narration unions **[types]**

**File:** `src/engine/events/FirstPhaseEvent.ts:396, 402-404` — the only `as any` in `src/`. Behaviourally safe today; removes the compiler's ability to catch a key/field rename at the post-hoc-mutation spot most likely to drift. **Fix:** replace with a type-guard find (`(e): e is Extract<MatchEvent, { type: 'BALL_REPOSITIONED' }> => …`) and narrow the narration step on `kind === 'announcement'`.

### BUG-35 — `pickRandom` is unsound on an empty array **[utils]**

**File:** `src/utils/rng.ts:83-85` — declared `T`, returns `undefined` on empty input. Banks are non-empty today; a future filtered pool would propagate `undefined` into rendered text silently. **Fix:** dev-time throw on empty input (or `T | undefined` + fix call sites).

### BUG-36 — `tsc` in the build emits JS into `dist/` that Vite immediately wipes **[build]**

**Files:** `tsconfig.json:9` (`"outDir": "dist"`, no `noEmit`), `package.json:7-8` (`"build": "tsc && vite build"`). Wasted compile-and-write per build; a standalone `tsc` run leaves stale non-bundled JS in `dist/`. **Fix:** add `"noEmit": true` (verify scripts run via `tsx`, unaffected).

### BUG-37 — `openMidseasonSigningWindow` comment claims "RNG-free" but FA offers consume the career stream **[season]**

**File:** `src/game/TransferCoordinator.ts:718-756` — the FA loop calls `signingTermsFor` → `seedContractFields` → 2 `rngTransfer` draws per free agent per window-open. Determinism survives (user-triggered + `careerRngOffset` snapshot, same precedent as `boostPlayerMorale`) but the comment is false. **Fix:** seed FA offers with `estimateMarketWage` (truly RNG-free, consistent asking-wage UX), or correct the comment + `docs/game-engine.md`.

### BUG-38 — `SEASON_INITIALIZED` doesn't reset `europeanCup`/`europeanShield` **[season]**

**File:** `src/game/applySeasonEvent.ts:42-56` — resets `playoffs`, `premCup`, `mediaStories` but not the two European trees. Harmless today (only fires on fresh `emptyState()`); add the two `= null` lines for symmetry/defence.

### BUG-39 — `TACTICAL_KICK_FROZEN` drops the defending #15 for one beat **[ui]**

**File:** `src/ui/pitchChoreography.ts:787-800` — `TACTICAL_KICK_FROZEN.def` is built from `defFrom`, which intentionally omits slot 15 (from-tables only list movers). Used as a *resting* table, `placeFormation`'s fill skips slot 15 — 29 dots instead of 30 on the kick-to-touch frame. **Fix:** overlay: `def: { ...TACTICAL_KICK_BASE.def, ...TACTICAL_KICK_BASE.defFrom }` (likewise `atk`).

### BUG-40 — TrainingScreen's synchronous "Apply Training" has no double-click guard **[ui]**

**File:** `src/ui/TrainingScreen.ts:244-278` — the async branch disables the button; the plain post-match path (line 275-277) calls `engine.applyTrainingBlock(weeks)` unguarded — a queued second click applies the block twice. **Fix:** mirror `MatchResultScreen.ts:477-479`: `if (btn.disabled) return; btn.disabled = true;` at the top of the handler.

### BUG-41 — `triggerKickFlight`'s 700ms timeout is untracked **[ui]**

**File:** `src/ui/PitchView.ts:138` — a second flight within 700ms (or across a match restart) has its transition killed mid-animation by the stale timer. **Fix:** store the timer id module-level, `clearTimeout` at the top of `triggerKickFlight` and in the `engine:initialized` reset.

### BUG-42 — Concurrent confetti launches fight over one canvas **[ui]**

**File:** `src/ui/Confetti.ts:22-28, 89-95` — two rAF loops both `clearRect` the shared canvas (flicker); first to finish removes the canvas, detaching the survivor. Reachable via EndOfSeason → TakeoverReveal. **Fix:** module-level particle array + single loop; `launchConfetti` appends and starts the loop only if not running; remove the canvas when the array empties.

### BUG-43 — European round/final screens shown before they render **[ui]**

**File:** `src/main.ts:583-591, 1598-1611` — `screenRouter.show('european-final'); showEuropeanFinal(...)` reverses the render-then-show order every other `go*` helper uses, flashing the previous round's DOM for the entry-animation frame. **Fix:** call the `show*` setter before `screenRouter.show(...)` in all four sites.

### BUG-44 — Tuning literals outside `src/engine/balance/` **[season]**

- `TransferCoordinator.ts:1162-1163` — loan-out cap literal `5` (docs reference a `MAX_LOANS_OUT` constant that doesn't exist).
- `TransferCoordinator.ts:1127-1128` — promise window `week + 5` and `startsRequired = 3` literals (doc says `week + 4` — code/doc disagree).
- `loanPoolGenerator.ts:16-19` — pool size/age/rating bands.
- `BoardCoordinator.ts:125` — European elimination deltas `3 / -5 / -10` inline.
- `GameCoordinator.ts:1167` — AI early-renewal cadence `% 4 === 1`.
- `personaGenerator.ts:167` — `morale: 65` literal (should be `MORALE.baseline`).

**Fix:** move to `balance/transfers.ts` / `balance/morale.ts`; update docs with the real numbers; resolve the promise-window code/doc disagreement explicitly.

### BUG-45 — Dead code: `decideAISignings` / `decideAIPoaches` **[season]**

`TransferCoordinator.ts:22` imports both; nothing calls them (superseded by `decideAIBids`/`decideAIFinalSignings`). ~120 lines in `aiTransferDirector.ts:203-267, 368-426`. **Fix:** remove both functions + imports in a dedicated commit (unreachable, so no RNG impact).

### BUG-46 — Duplicated helpers (extract-on-second-use rule) **[season]**

- `pickSeverity` ×3: `injuryEffects.ts:83-91`, `internationalDutyEngine.ts:134-139`, `trainingWeek.ts:217-225`.
- `wageFromRating` ×2: `contractSeeder.ts:87-99`, `personaGenerator.ts:207-219`.
- League-points application ×3: `applySeasonEvent.ts::applyToSide`, `leagueTable.ts::applyResult`, `teamStats.ts::formPoints` — any bonus-rule change must touch all three.

**Fix:** one shared helper each, no behaviour change.

### BUG-47 — Minor inefficiencies **[season/ui]**

- `recordPlayerMatchResult` computes `computeAttendance` twice per AI fixture with identical inputs (`GameCoordinator.ts:1089-1091`, `:1104-1106`). Compute once.
- `resolveSigningRound`'s `appealScore`/`weightedLeaguePosition` re-sorts archived standings per bid evaluation — memo `weightedLeaguePosition(clubId)` per round.
- Coordinators do `state.career.clubs.find(c => c.id === …)` in loops — a `clubsById` map alongside `teamsById` would tidy these.
- `SaveManager.ts:510-513, 541` — `parseCupResult(f.result)` called twice per fixture; hoist to a const.

### BUG-48 — eventBus re-entrancy semantics (document or normalise) **[utils]**

**File:** `src/utils/eventBus.ts:8-30` — no leak (verified: all subscribers are once-per-page singletons or properly unsubscribed). Edge: `on()` during an `emit()` of the same event pushes into the array being iterated, so the new handler fires for the in-flight emit — inconsistent with unsubscribe-during-emit (which doesn't take effect until the next emit). **Fix (optional):** snapshot in emit (`for (const h of [...handlers])`).

### BUG-49 — `applyMatchEvent` exhaustiveness defaults are inconsistent **[engine]**

**File:** `src/engine/applyMatchEvent.ts:198-201` vs `:649-653` — the nested `CardKind` default throws at runtime; the top-level `MatchEvent` default is compile-time-only. **Fix (optional):** make the outer default throw too — it would catch malformed events from a future replay/migration path.

### BUG-50 — Documentation/comment drift (each is "documentation drift is a bug" per CLAUDE.md) **[docs]**

- `docs/game-engine.md` claims `fixtures.ts` uses the circle method (see BUG-01).
- CLAUDE.md §6 names `rngForm()`; the actual export is `rngFormRaw()` (`src/utils/rng.ts:79`).
- CLAUDE.md `PREM_CUP_SEEDED` row says pool legs split 4/8/8; actual is 4/6/10 (`cupScheduler.ts` header).
- `docs/match-engine.md` (~line 1775) says `INJURY.basePctPerTackle: 8.0`; code is **6.0** (`balance/injuries.ts:30`). `docs/game-engine.md` also cites 8.0.
- `balance/openPlay.ts:41` comment "KO probability = gap² / 100"; code is `gap² / 20`.
- `balance/kicking.ts:117` comment says threshold 25; constant is **75**.
- `src/types/matchEvent.ts:23` `metres: number; // positive` — dominant-tackle carries pass negative metres.
- `FieldPosition.ts:49-53` `metresFromOppositionTryLine` comment claims a clamp the `Math.abs` makes a no-op.
- `balance/injuries.ts:43-47` — `recurrenceMult`/`recurrenceWindowWeeks` consumed nowhere; comment describes an in-match recurrence boost that doesn't exist. Mark "not yet wired".
- `aiTrainingDirector.ts:24-31` comment says 3 rngTransfer calls per club; code always consumes 4.
- `personaGenerator` header claims Gaussian stat noise (it's uniform ±12) and caller-side name dedupe (doesn't exist).
- `saveSummary.ts:21-24` claims `SavedSeasonResult` carries no tries — it carries `homeTries/awayTries`, so the teaser standings omit try bonuses unnecessarily.
- `docs/game-engine.md` §renewals describes the AI cap target as `SENIOR_CAP × aiTargetCapUtilisation`; code uses `club.salaryBudget × …`.
- `src/ui/HubScreen.ts:4-7` header says the module "is NOT wired into main.ts's flow" — it fully is.
- `~30` screens duplicate the app-header/back-button boilerplate (`TacticsHubScreen.ts:58-67`, `FinancesScreen.ts:71-80`, …) — extract `appHeaderHtml({ title, backLabel })` + `wireBack(el, onBack)` into `src/ui/components/` next time several are touched together.

---

## Suggested fix order

| Wave | Items | Rationale |
|---|---|---|
| 1 — career-breaking | BUG-01, BUG-02 | Every year-2+ season is structurally broken; both invisible to `verify` |
| 2 — gameplay correctness | BUG-03, BUG-04, BUG-05, BUG-08, BUG-09, BUG-10 | Wrong match outcomes / contracts; 03+04+08 shift telemetry |
| 3 — data-loss & leaks | BUG-06, BUG-07, BUG-14, BUG-15, BUG-16 | Save-corruption and session-leak paths |
| 4 — consistency & stats | BUG-11, BUG-12, BUG-13, BUG-17, BUG-18, BUG-19, BUG-28 | |
| 5 — perf | BUG-20, BUG-21, BUG-22, BUG-47 | |
| 6 — harness hardening | BUG-25 | Do after waves 1–2 so new hashes are baselined once |
| 7 — hygiene | everything else | Batch the doc-drift items (BUG-50) into one commit |
