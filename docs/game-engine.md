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

The game engine emits three `game:*` events through the same `src/utils/eventBus.ts` singleton the match engine uses. UI modules subscribe to react; the game engine never imports any UI module.

| Event | Payload | Subscribers |
|---|---|---|
| `game:initialized` | `{ state: GameState }` | `FixtureListScreen` (initial render after `newSeason` / `fromSave`) |
| `game:fixtureRecorded` | `{ result: FixtureResult; state: GameState }` | `FixtureListScreen` (re-render fixtures + standings as each headless sim resolves) |
| `game:weekAdvanced` | `{ state: GameState }` | `FixtureListScreen` (calendar header) |

## Save format

`SavedGame` in `src/ui/SaveManager.ts` is a thin serialiser for `GameCoordinator.toSavePayload()`: `playerTeamId`, `seed`, `currentWeek`, every `FixtureResult` (player's + AI), (v3+) the `seasonLabel` + `fixtures` snapshot the user saw at save time, and (v4+) the persisted pre-match `tactics` + `matchdaySquad` so the next match opens with the manager's last commit as the default. `fromSave` re-runs `SEASON_INITIALIZED` against the saved schedule when present (otherwise falls back to the canonical one for legacy v2 saves), replays results to rebuild standings + calendar deterministically, then replays the saved `PLAYER_TACTICS_SET` / `PLAYER_MATCHDAY_SQUAD_SET` events if present. `SAVE_VERSION` is now 4; v2 and v3 saves load via the legacy path (no tactics/squad snapshot) and v1 saves are discarded.

## Determinism

Season-level determinism: `(playerTeamId, rootSeed)` plus the player's series of results produces an identical final league table on every run. Verified by `scripts/checkSeasonDeterminism.ts`; `npm run verify` runs both the match-level and season-level harnesses.
