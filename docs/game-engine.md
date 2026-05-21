# Game Engine Reference

Source of truth for the season + career engine — the sibling to the match engine. Where the match engine (`src/engine/`) owns a single match's state machine through `applyMatchEvent`, the **game engine** (`src/game/`) owns everything outside that: the calendar / fixtures / results / standings for the live season, the persistent roster carried across seasons, contracts, rollover (aging, retirement, fixture regen), and the save schema. Its single mutation seam is `applySeasonEvent`, mirroring the architectural pattern of its match-engine sibling.

For match-engine internals (simulation loop, phase resolvers, fatigue, commentary) see `docs/match-engine.md`. For the broader career / transfer roadmap (Phases 3-7 — cap enforcement, renewals, free agents, poaching, generated supply) see `docs/transfer-system.md`.

## Maintaining this doc

After any change to season code, update this file in the same commit. Season code is everything under `src/game/`, plus `src/types/gameState.ts`, `src/ui/SaveManager.ts`, and the career-scope screens (`EndOfSeasonScreen`, `RolloverScreen`, `ContractsScreen`).

---

## Architecture

Match-scope writes flow through `applyMatchEvent`; **season-scope writes flow through `applySeasonEvent`** in `src/game/applySeasonEvent.ts`. The game engine owns one `GameState` per session — calendar (`date`, `week`, `seasonLabel`), league (`fixtures`, `results`, `standings`), `player` (teamId + persisted pre-match tactics + matchdaySquad), the root `seed`, and the multi-season `career` block (roster + clubs + archive).

| Module | Responsibility |
|---|---|
| `GameCoordinator.ts` | Public API (`newSeason`, `fromSave`, `getState`, `getCurrentFixture`, `recordPlayerMatchResult`, `rollSeason`, `toSavePayload`). Owns the `GameState`. The "tick" of the game engine is a player match completing: `recordPlayerMatchResult` applies the player's score, headlessly simulates the other fixtures of the round, runs `seasonStatsCollector` over each, then advances the week. Emits `game:seasonComplete` when the final round resolves. |
| `applySeasonEvent.ts` | **Single mutation seam.** Reducer over `SeasonEvent` (`src/types/gameState.ts`); see the full variant list in the next section. Same `default: const _: never = event;` exhaustiveness contract as `applyMatchEvent`. |
| `rosterSeeder.ts` | `seedRoster(allTeams, seasonStartYear)` — one-shot at `newSeason` / v4-save migration. Walks every `RawTeamInput`, allocates a globally-unique `rosterId` per player, builds `state.career.roster` + `ClubState[]`. Defers wage/expiry/reputation to `contractSeeder.seedContractFields`. |
| `rosterTeamBuilder.ts` | `buildTeamFromRoster(state, teamJson)` — the seam between persistent roster and matchday `Team`. Team identity (color / name / stadium / `suggestedTactics`) comes from the JSON; player data (current `baseStats`, position, dob, contract, `rosterId`) comes from the roster. Result fed to `MatchCoordinator` for live matches and to `simulateFixture` for AI sims. |
| `seasonStatsCollector.ts` | `snapshotMatch(state)` extracts `{ rosterId, tries, tacklesMade, tacklesAttempted, turnoversWon, yellowCards, redCards, rating }` per player who took the field (rosterId > 0 filter skips non-career test contexts). `collectSeasonEvents(snapshots)` converts to `PLAYER_SEASON_STATS_ACCUMULATED` events. Run by `GameCoordinator.recordPlayerMatchResult` for live + silent fixtures. |
| `careerRollover.ts` | `computeRollover(state, allTeamIds)` — pure module; given current GameState, produces the SeasonEvent stream for a rollover. Iterates the roster in `rosterId`-ascending order so `rngTransfer` calls are deterministic: per-stat aging via `AGE_CURVES` + `STAT_NOISE` Gaussian noise; retirement check against `RETIREMENT_CURVE`; awards (top tries, MVP by avg rating with `mvpMinAppearances` floor); fixture regen via `generateFixtures` with synthetic Sept-May weekly dates (skips Nov + Feb). |
| `contractSeeder.ts` | `seedContractFields(raw, clubId, seasonStartYear)` — wage = `WAGE_BY_RATING` piecewise-linear × `POSITION_SCARCITY` × `WAGE_NOISE`, rounded to £5k. Length age-banded via `CONTRACT_LENGTH`. Expiry `${seasonStartYear + lengthYears}-06-30`. Reputation = `round(overall × ratingMultiplier) + (marquee ? bonus : 0)`. Honours JSON `Partial<PlayerContract>` overrides (the hand-authored `Marquee: yes.` annotations). Two `rngTransfer` calls per player, order-stable. |
| `playerSquad.ts` | Pure helpers: `extractMatchdaySquad` (snapshot the 23-man matchday roster as stable `PlayerRef` name refs) and `applyMatchdaySquad` (inverse — rearrange a `RawTeamInput` so the saved 23 occupy slots 1-23). Returns the team unchanged when the saved list is empty, the wrong length, or references a player no longer rostered. |
| `fixtures.ts` | Pure double round-robin generator using the standard "circle" method. Used by `careerRollover` for year-2+ fixture regeneration. Year-1 default is the hand-authored `PREMIERSHIP_2025_26` schedule. Player's team is placed at position 0 so its match is always the first pairing per round. |
| `simulateFixture.ts` | Headless wrapper around `MatchCoordinator` with `silent: true` — suppresses every `engine:event` / `engine:stateChange` / `engine:initialized` / `engine:resumed` emit and replaces modal prompts with `high_ball` / `kick_for_goal` defaults. `engine:finished` still fires. Returns `{ homeScore, awayScore, playerSnapshots }` so the caller can route stats through `seasonStatsCollector`. **The match engine and the game engine only meet here.** |
| `leagueTable.ts` | Pure helpers: `sortStandings` (league points → points diff → points for), `findStanding`. |
| `teamStats.ts` | Pure derivations from `FixtureResult[]` + overall ratings: `recentForm` (rolling W/L/D pins padded with null on the left), `headToHead` (W/D/L record from one team's POV across every meeting so far), `matchSpread` (rating-derived handicap, favored side negative). Read by `PreMatchScreen`; no module state, no bus subscriptions. |
| `derive.ts` | `deriveFixtureSeed(rootSeed, round, homeId, awayId)` — hashes the inputs so each headless AI fixture has a stable, derivable seed independent of the round in which it was simulated. |
| `age.ts` | Pure `getAge(dobIso, currentDateIso)` — returns null when `dob` is missing. Used by `TeamInfoScreen` and `ContractsScreen` to derive ages from `calendar.date`. |
| `balance/season.ts` | Season tuning constants — `SEASON_VALUES` (start date, season label, week length) and `LEAGUE_POINTS` (Premiership 4/2/0 + losing bonus when margin ≤ 7). |
| `balance/career.ts` | Rollover tuning — `AGE_CURVES` per stat (peakAge / growth / decline), `STAT_NOISE` (Gaussian std-dev + clamp), `RETIREMENT_CURVE` (forwards / backs cumulative probabilities), `SEASON_AWARDS.mvpMinAppearances`. |
| `balance/transfers.ts` | Contract + market tuning — `SENIOR_CAP` (£6.4M, dimmed display only in Phase 2), `WAGE_BY_RATING` anchor table, `POSITION_SCARCITY`, `WAGE_NOISE`, `CONTRACT_LENGTH` age-band weights, `REPUTATION_SEED`. |

`TeamProfile` (`src/team/teamProfile.ts`) was previously the season-scope mutation seam; that role has moved into `GameState.league.standings` + `GameState.career.roster`. The module now only exposes identity/narrative/star data + roster lookups (`computeOverallRating`).

## Mutation seam: `SeasonEvent` variants

All season-scope state writes go through `applySeasonEvent(state, event)`. The discriminated union and its branches are co-located. Exhaustive `default: const _: never = event` catches a missing branch at compile time.

**Season-basics layer:**

| Variant | When fired | What it does |
|---|---|---|
| `SEASON_INITIALIZED` | `newSeason` / `fromSave` | Sets `playerTeamId`, `seed`, `calendar.week = 1`, `seasonLabel`, copies `league.fixtures` from the schedule, resets `league.results` / `standings`. |
| `FIXTURE_RESULT_RECORDED` | Per player + AI fixture in `recordPlayerMatchResult` | Pushes the `FixtureResult` onto `league.results` and updates both teams' standings (with losing bonus per `LEAGUE_POINTS`). |
| `WEEK_ADVANCED` | After all fixtures of a round are applied | `calendar.week += 1`; `calendar.date` jumps to the earliest date in the new round (falls back to `+SEASON_VALUES.weekLengthDays` for generated schedules). |
| `PLAYER_TACTICS_SET` | `PreMatchScreen` Kick Off | Clones the chosen `TeamTactics` into `state.player.tactics` so the next match opens with them as the default. |
| `PLAYER_MATCHDAY_SQUAD_SET` | `PreMatchScreen` Kick Off | Persists the matchday 23 as `PlayerRef[]` (firstName + lastName pairs) so squad selection survives mid-match tab close. |

**Career layer (Phase 1 + 2 of the transfer-system roadmap):**

| Variant | When fired | What it does |
|---|---|---|
| `ROSTER_SEEDED` | One-shot at `newSeason` / v4-save migration | Populates `state.career.roster` keyed by `rosterId`, `ClubState[]`, `nextRosterId`. Source data is the JSON-loaded `RawTeamInput[]` post-`applyStarBoost`. |
| `PLAYER_SEASON_STATS_ACCUMULATED` | Per player per fixture (live + silent AI) | Adds the per-match delta to `roster[rosterId].seasonStats`. Drives top-scorer / MVP cards in `EndOfSeasonScreen`. |
| `PLAYER_AGED` | Per player per rollover | Applies `Partial<PlayerStats>` deltas to `baseStats` (clamped 1-99). Driven by `AGE_CURVES` + `STAT_NOISE` Gaussian noise from `rngTransfer`. |
| `PLAYER_RETIRED` | Per retiring player per rollover | Removes `rosterId` from `ClubState.squad`. The `Player` record stays in `state.career.roster` for archive references. |
| `SEASON_ROLLED_OVER` | One per rollover, after all `PLAYER_AGED` / `PLAYER_RETIRED` events for that rollover | Composite: archives just-completed standings + top scorer + MVP into `state.career.archive`, resets `league.results` / `league.standings` / per-player `seasonStats`, replaces `league.fixtures` with the regenerated round-robin, sets the new `seasonLabel`, increments `seasonsCompleted`. |

`GameCoordinator.rollSeason()` returns the applied `SeasonEvent[]` so `main.ts` can hand it to `RolloverScreen` for the post-apply diff render. Future career-scope variants (contract renewals, transfer offers, persona generation) hang off the same union — no new mutation seams.

## UI events

The game engine emits five `game:*` events through `src/utils/eventBus.ts`. UI modules subscribe and re-render; the game engine never imports any UI module.

| Event | Payload | Subscribers |
|---|---|---|
| `game:initialized` | `{ state: GameState }` | `FixtureListScreen` (initial render after `newSeason` / `fromSave`) |
| `game:fixtureRecorded` | `{ result: FixtureResult; state: GameState }` | `FixtureListScreen`, `RoundResultsScreen` (re-render as each headless AI fixture resolves) |
| `game:weekAdvanced` | `{ state: GameState }` | `FixtureListScreen` (calendar header) |
| `game:seasonComplete` | `{ state: GameState }` | `main.ts` latches a flag; the post-match Continue chain reroutes through `EndOfSeasonScreen` → `RolloverScreen` |
| `game:seasonRolledOver` | `{ state: GameState }` | (none yet — emitted after `rollSeason()` applies its events; reserved for future watchers like a "league restart" toast) |

## Career: roster + identity model

Three load-bearing distinctions:

- **`Player.rosterId` is the persistent identity** (globally unique, allocated once by `rosterSeeder`). **`Player.id` remains the matchday slot 1-23** — every match-engine event variant, `RatingEngine`, `StaminaSystem` etc. continue to read it as a slot. Season-scope `SeasonEvent` variants carry `rosterId`; match-scope `MatchEvent` variants carry `id`. Don't conflate them.
- **The matchday `Team` is built fresh per fixture from the roster**, not loaded from JSON. `rosterTeamBuilder.buildTeamFromRoster(state, teamJson)` resolves `ClubState.squad` rosterIds → `Player` records (current `baseStats` reflecting accumulated aging), assigns slot ids 1-N, threads `rosterId` through on each `RawPlayer`. `MatchCoordinator.initPlayer` re-attaches it.
- **`applyStarBoost` runs exactly once per session**, on the JSON ingest path in `main.ts` (it's *not* idempotent — re-applying would compound the tier shift). The roster carries the post-boost `baseStats`; aging mutates the roster's `baseStats` in place via `PLAYER_AGED`. A v5+ save bypasses the seeder entirely and restores the saved (already-boosted, already-aged) roster on load.

## Determinism + RNG

A fourth seeded `mulberry32` stream `rngTransfer` (`src/utils/rng.ts`, constant `0x27D4EB2F`, reset by `setCareerSeed(seed)` on `newSeason` / `fromSave`) services all career-scope randomness — contract seeding, stat-development noise, retirement rolls, future transfer / persona generation. Stays isolated from `rng` / `rngForm` / `pickRandom` so career mutations cannot perturb match outcomes; per-fixture seed derivation cannot perturb career-scope outcomes.

`(playerTeamId, rootSeed)` plus the player's series of results produces an identical final league table + roster `baseStats` + retirement list on every run, across multiple seasons. Verified by `scripts/checkSeasonDeterminism.ts` — runs three full seasons with `rollSeason()` between each, snapshots per-season standings + results hash + the full SeasonEvent stream + final-state roster baseStats + seasonsCompleted, asserts byte-equal SHA-256 on a second run. `npm run verify` runs both the match-level and career-level harnesses; both must pass before commit.

## Contracts (Phase 2 — read-only)

Every persistent roster Player carries a `PlayerContract { clubId, expiresOn, annualWage, isMarquee }` plus a `reputation: number` (0–100). Seeded once at roster creation via `contractSeeder.seedContractFields`, which keys two `rngTransfer` calls per player (length, wage-noise) so the same root seed produces identical contracts.

**Wage formula.** Piecewise-linear interpolation from `WAGE_BY_RATING` (anchored £30k @ rating 60 up to £780k @ rating 96) × `POSITION_SCARCITY` (10s, 9s, hookers and props bumped 1.10–1.20×) × `WAGE_NOISE` (uniform [0.88, 1.12]), rounded to the nearest £5k. Tuning in `src/engine/balance/transfers.ts`.

**Length + expiry.** Age-banded via `CONTRACT_LENGTH` (under-25s skew to 3-year deals, 30+ to 1-year). Expiry = 30 June of (`seasonStartYear` + `lengthYears`). Initial distribution staggers ~22/38/42 across +1/+2/+3 years so the first rollover doesn't dump every player as a free agent at once.

**Marquees.** One per club, hand-authored via a `Marquee: yes.` annotation on the star player's bullet in `docs/team-data.md`. The annotation translates (via `scripts/generateTeamJsons.mjs`) into a `contract: { isMarquee: true }` partial override in the JSON, which `contractSeeder` honours by copying through. Reputation gets a `+8` bump for marquees. The 6 teams not currently regenerated by the script (those without `*(in game)*` tags) have the override applied by hand-edit to the JSON; both paths produce the same Player shape on the roster.

**UI surface.** `src/ui/ContractsScreen.ts` (Hub → Contracts tile) — sortable squad list with wage / expiry / OVR / age / marquee badge, plus a dimmed cap pill (Σ non-marquee wages / `SENIOR_CAP`). Expiring-within-10-months rows get a warning chip. No enforcement until Phase 3.

## Save format

`SAVE_VERSION = 6` (as of v2.23a). `SavedGame` in `src/ui/SaveManager.ts` is a thin serialiser for `GameCoordinator.toSavePayload()`.

| Version | Added |
|---|---|
| v2 | Minimal slice: `playerTeamId`, `seed`, `currentWeek`, `results[]` |
| v3 | `seasonLabel` + `fixtures` snapshot — the schedule as the user saw it at save time, reconstructed verbatim on load |
| v4 | Pre-match preferences: `tactics` + `matchdaySquad` (23 PlayerRefs) |
| v5 | Career snapshot: `career.roster` (Player keyed by rosterId), `career.clubs` (per-club squad pointers), `career.archive` (past standings + awards), `seasonsCompleted`, `nextRosterId` |
| v6 | Each persisted Player now carries `contract` + `reputation` (Phase 2) |

**Migration on load** (`GameCoordinator.fromSave`):

- v5 → v6: walk the persisted roster; for any Player missing `contract` or `reputation`, call `contractSeeder.seedContractFields` to backfill. Lossless — the `rngTransfer` stream advances but produces deterministic results for the same root seed.
- v4 → v5: synthesise a fresh roster from JSONs via `rosterSeeder` (lossless — pre-v5 had zero per-player evolution to preserve).
- v3 → v4 → v5: cascades. Schedule restored from the saved snapshot if present; falls back to `PREMIERSHIP_2025_26`.
- v2 → v3: legacy path, no schedule snapshot — falls back to current canonical schedule.
- v1: discarded (predates AI-vs-AI results, league table can't be reconstructed).

## Post-match / end-of-season flow

The post-match Continue chain in `main.ts`:

```
Match → MatchResult → recordPlayerMatchResult + snapshotMatch + saveGame
                     → RoundResults → LeagueTable (post-match mode) →
                       │
                       ├── (season ongoing) → Hub
                       │
                       └── (season complete: game:seasonComplete latched)
                             → EndOfSeasonScreen [recap]
                             → rollSeason() returns SeasonEvent[]
                             → RolloverScreen [retirements + aging deltas]
                             → Hub (new season, regenerated fixtures)
```

`game:seasonComplete` fires from `recordPlayerMatchResult` after the final round's `WEEK_ADVANCED` when `getCurrentFixture() === null`. `main.ts` latches it; the LeagueTable Continue handler checks and routes accordingly. `rollSeason()` is the one and only caller of `careerRollover.computeRollover` in production; the headless `checkSeasonDeterminism` harness calls it directly between season simulations.

## Roadmap

Phases 1 (rollover) and 2 (read-only contracts) are live as of v2.23a. Phases 3-7 — cap enforcement, end-of-season renewals, free-agent signings, cross-Prem poaching with Reg 7, generated player supply — are sketched at file-by-file level in **`docs/transfer-system.md`** with the SeasonEvent variants each will add to the same `applySeasonEvent` seam.
