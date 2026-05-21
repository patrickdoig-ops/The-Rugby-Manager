# Game Engine Reference

Documents the season-scope sibling to the match engine. Where the match engine (`src/engine/`) owns a single match's state machine through `applyMatchEvent`, the **game engine** (`src/game/`) owns the season: calendar, fixtures, results, standings, and the persisted pre-match preferences that carry from one match to the next. Its single mutation seam is `applySeasonEvent`, mirroring the architectural pattern of its match-engine sibling.

For match-engine internals (simulation loop, phase resolvers, fatigue, commentary) see `docs/match-engine.md`.

## Maintaining this doc

After any change to season code, update this file in the same commit. Season code is everything under `src/game/`, plus `src/types/gameState.ts` and `src/ui/SaveManager.ts`.

---

## Architecture

Match-scope writes flow through `applyMatchEvent`; **season-scope writes flow through `applySeasonEvent`** in `src/game/applySeasonEvent.ts`. The game engine (`src/game/`) owns one `GameState` per session — calendar (`date`, `week`, `seasonLabel`), league (`fixtures`, `results`, `standings`), `player.teamId` + `player.tactics` + `player.matchdaySquad` (the last two persist pre-match choices across matches), and the root `seed`.

| Module | Responsibility |
|---|---|
| `GameCoordinator.ts` | Public API (`newSeason`, `fromSave`, `getState`, `getCurrentFixture`, `recordPlayerMatchResult`, `toSavePayload`). Owns the `GameState`. The "tick" of the game engine is a player match completing: `recordPlayerMatchResult` applies the player's score, headlessly simulates the other fixtures of the round, then advances the week. |
| `applySeasonEvent.ts` | Single mutation seam. Reducer over `SeasonEvent` (`src/types/gameState.ts`): `SEASON_INITIALIZED`, `FIXTURE_RESULT_RECORDED`, `WEEK_ADVANCED`, `PLAYER_TACTICS_SET`, `PLAYER_MATCHDAY_SQUAD_SET`. Same `default: const _: never = event;` exhaustiveness contract as `applyMatchEvent`. |
| `playerSquad.ts` | Pure helpers: `extractMatchdaySquad` (snapshot the 23-man matchday roster as stable name refs) and `applyMatchdaySquad` (inverse — rearrange a fresh-from-JSON `RawTeamInput` so the saved 23 occupy slots 1-23). Returns the team unchanged when the saved list is empty, the wrong length, or references a player no longer rostered. |
| `fixtures.ts` | Pure double round-robin generator using the standard "circle" method. Player's team is placed at position 0 so its match is always the first pairing per round. |
| `simulateFixture.ts` | Headless wrapper around `MatchCoordinator` with `silent: true` — suppresses every `engine:event`/`engine:stateChange`/`engine:initialized`/`engine:resumed` emit and replaces modal prompts with `high_ball`/`kick_for_goal` defaults. `engine:finished` still fires for completion detection. The match engine and the game engine only meet here. |
| `leagueTable.ts` | Pure helpers: `sortStandings` (league points → points diff → points for), `findStanding`. |
| `teamStats.ts` | Pure derivations from `FixtureResult[]` + overall ratings: `recentForm` (rolling W/L/D pins padded with null on the left), `headToHead` (W/D/L record from one team's POV across every meeting so far), `matchSpread` (rating-derived handicap, favored side negative). Read by `PreMatchScreen`; no module state, no bus subscriptions. |
| `derive.ts` | `deriveFixtureSeed(rootSeed, round, homeId, awayId)` — hashes the inputs so each headless AI fixture has a stable, derivable seed. |
| `age.ts` | Pure `getAge(dobIso, currentDateIso)` — returns null when `dob` is missing. Used by `TeamInfoScreen` to derive ages from `calendar.date`. |
| `balance/season.ts` | Season tuning constants — `SEASON_VALUES` (start date, season label, week length) and `LEAGUE_POINTS` (Premiership 4/2/0 + losing bonus when margin ≤ 7). |

`TeamProfile` (`src/team/teamProfile.ts`) was previously the season-scope mutation seam; that role has moved into `GameState.league.standings`. The module now only exposes identity/narrative/star data + roster lookups (`computeOverallRating`).

## UI events

The game engine emits five `game:*` events through the same `src/utils/eventBus.ts` singleton the match engine uses. UI modules subscribe to react; the game engine never imports any UI module.

| Event | Payload | Subscribers |
|---|---|---|
| `game:initialized` | `{ state: GameState }` | `FixtureListScreen` (initial render after `newSeason` / `fromSave`) |
| `game:fixtureRecorded` | `{ result: FixtureResult; state: GameState }` | `FixtureListScreen` (re-render fixtures + standings as each headless sim resolves) |
| `game:weekAdvanced` | `{ state: GameState }` | `FixtureListScreen` (calendar header) |
| `game:seasonComplete` | `{ state: GameState }` | `main.ts` latches a flag; the post-match Continue chain reroutes through `EndOfSeasonScreen` → `RolloverScreen` |
| `game:seasonRolledOver` | `{ state: GameState }` | (none yet — emitted after `rollSeason()` applies its events; reserved for future watchers) |

## Career-scope mutation seam

Layered on top of `applySeasonEvent`: `GameState.career` (`src/types/gameState.ts`) holds the persistent senior-squad roster + per-club squad pointers + archived season standings, so the league can span multiple years. Five additional `SeasonEvent` variants (still routed through `applySeasonEvent`, same exhaustive `never` contract):

- `ROSTER_SEEDED` — fired once on `newSeason` (and on `fromSave` when `save.career` is absent, i.e. v4 saves). Walks every `RawTeamInput`, allocates a globally-unique `rosterId` per player via `src/game/rosterSeeder.ts`, and populates `state.career.roster` + `ClubState[]`.
- `PLAYER_SEASON_STATS_ACCUMULATED` — fired post-fixture (player + silent AI) by `GameCoordinator.recordPlayerMatchResult` via `src/game/seasonStatsCollector.ts`. Adds the per-match delta to `roster[rosterId].seasonStats` — the per-season accumulator that drives top-scorer / MVP cards in EndOfSeasonScreen.
- `PLAYER_AGED` — emitted per player per rollover from `src/game/careerRollover.ts`. Applies the age-curve-driven stat delta (`AGE_CURVES` in `balance/career.ts`) plus Gaussian noise (`STAT_NOISE`, sampled via `rngTransfer`).
- `PLAYER_RETIRED` — emitted per retiring player per rollover. Probabilistic check against `RETIREMENT_CURVE` (split by `forwards` / `backs` position class). Removes the rosterId from `ClubState.squad`; the `Player` record itself is retained for archive references.
- `SEASON_ROLLED_OVER` — the composite. Archives the just-completed season's standings + top scorer + MVP, resets `league.results` / `league.standings` / per-player `seasonStats`, replaces `league.fixtures` with a freshly generated round-robin (with synthetic Sept–May weekly dates skipping November + February), sets the new `seasonLabel`, increments `seasonsCompleted`.

The two ends of the rollover are wired through the post-match nav chain in `main.ts`: a `game:seasonComplete` emit from `GameCoordinator.recordPlayerMatchResult` after the final round latches a flag; the LeagueTable Continue handler then routes through `EndOfSeasonScreen` (recap render, with state still at the just-completed season) and `RolloverScreen` (renders the `SeasonEvent[]` returned by `rollSeason()` — retirements + per-player stat deltas). `rollSeason()` returns the events list so the diff can be rendered post-apply.

The matchday `Player.id` is **still a slot number 1–23** — every match-engine event variant, `RatingEngine`, `StaminaSystem`, etc. continue to read it as a slot. The persistent identity is `Player.rosterId`. The matchday team is built from the roster by `src/game/rosterTeamBuilder.ts::buildTeamFromRoster(state, teamJson)` which carries `rosterId` through on each `RawPlayer` so `MatchCoordinator.initPlayer` can re-attach it.

A fourth seeded RNG stream `rngTransfer` (`src/utils/rng.ts`, constant `0x27D4EB2F`, reset by `setCareerSeed(seed)` on `newSeason`/`fromSave`) services all career-scope randomness — stat noise, retirement rolls, future transfer / persona generation. Stays isolated from `rng` / `rngForm` / `pickRandom` so career mutations cannot perturb match outcomes.

## Save format

`SavedGame` in `src/ui/SaveManager.ts` is a thin serialiser for `GameCoordinator.toSavePayload()`: `playerTeamId`, `seed`, `currentWeek`, every `FixtureResult` (player's + AI), (v3+) the `seasonLabel` + `fixtures` snapshot the user saw at save time, (v4+) the persisted pre-match `tactics` + `matchdaySquad`, and (v5+) the full `career` snapshot — `roster` (every player keyed by rosterId), `clubs` (per-club squad pointers), `archive` (past-season standings + awards), `seasonsCompleted`, `nextRosterId`. `fromSave` restores the career when present; v4 and older trigger a fresh roster seed from JSONs (lossless — pre-v5 there was zero per-player evolution). `SAVE_VERSION` is now 5; v2–v4 saves load via the legacy path and v1 saves are discarded.

## Determinism

Season + career determinism: `(playerTeamId, rootSeed)` plus the player's series of results produces an identical final league table + roster baseStats + retirement list on every run, across multiple seasons. Verified by `scripts/checkSeasonDeterminism.ts` (extended to a 3-season career); `npm run verify` runs both the match-level and career-level harnesses.
