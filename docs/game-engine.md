# Game Engine Reference

Source of truth for the season + career engine — the sibling to the match engine. Where the match engine (`src/engine/`) owns a single match's state machine through `applyMatchEvent`, the **game engine** (`src/game/`) owns everything outside that: the calendar / fixtures / results / standings for the live season, the persistent roster carried across seasons, contracts, rollover (aging, retirement, transfer activations, academy + import intake, fixture regen), and the save schema. Its single mutation seam is `applySeasonEvent`, mirroring the architectural pattern of its match-engine sibling.

For match-engine internals (simulation loop, phase resolvers, fatigue, commentary) see `docs/match-engine.md`. For the transfer system roadmap (all ten phases now live; remaining open questions) see `docs/transfer-system.md`.

## Maintaining this doc

After any change to season code, update this file in the same commit. Season code is everything under `src/game/`, plus `src/types/gameState.ts`, `src/ui/SaveManager.ts`, and the career-scope screens (`EndOfSeasonScreen`, `RenewalsScreen`, `TransferMarketScreen`, `RolloverScreen`, `ContractsScreen`, `SquadManagementScreen`).

---

## Architecture

Match-scope writes flow through `applyMatchEvent`; **season-scope writes flow through `applySeasonEvent`** in `src/game/applySeasonEvent.ts`. The game engine owns one `GameState` per session — calendar (`date`, `week`, `seasonLabel`), league (`fixtures`, `results`, `standings`), `player` (teamId + persisted pre-match tactics + matchdaySquad + captainRosterId), the root `seed`, and the multi-season `career` block (roster + clubs + archive + freeAgents + market + pendingMoves).

| Module | Responsibility |
|---|---|
| `GameCoordinator.ts` | Public API (`newSeason`, `fromSave`, `getState`, `getCurrentFixture`, `recordPlayerMatchResult`, `seedPlayoffBracket`, `getPlayerPlayoffMatch`, `recordPlayerPlayoffResult`, `simulatePendingPlayoffMatches`, `rollSeason`, `toSavePayload`, `setSquadStatus`, plus the market-window methods listed below, plus the loan/transfer-request methods: `makePlayingTimePromise`, `grantTransferRequest`, `rejectTransferRequest`, `loanOutPlayer`, `recallLoanedPlayer`, `signLoanPlayer`, `releaseLoanPlayer`). Owns the `GameState`. The "tick" of the game engine is a player match completing: `recordPlayerMatchResult` applies the player's score, headlessly simulates the other fixtures of the round, runs `seasonStatsCollector` over each, then advances the week. Once the last R18 fixture is recorded it also seeds the playoff bracket and emits `game:bracketSeeded`; `game:seasonComplete` then fires later, after the League final resolves. |
| `TransferCoordinator.ts` | Off-season market collaborator owned by `GameCoordinator`. Holds the same `GameState` reference; implements `designateMarquee`, `openRenewalWindow`, `closeRenewalWindow`, `openSigningWindow`, `signFreeAgent`, `unsignFreeAgent`, `preAgreePoach`, `cancelPreAgreement`, `closeSigningWindow`, plus the in-season transfer-request + loan cluster (Features 1.4 / 2.3): `checkTransferRequestsAndPromises` (called from the match tick), `makePlayingTimePromise`, `grantTransferRequest`, `rejectTransferRequest`, `loanOutPlayer`, `recallLoanedPlayer`, `signLoanPlayer`, `releaseLoanPlayer`. `GameCoordinator` exposes thin delegating methods of the same names so the `getGameEngine: () => GameCoordinator` getter contract (CLAUDE.md § 4) is preserved — screens never see the collaborator directly. All writes flow through `applySeasonEvent`. |
| `applySeasonEvent.ts` | **Single mutation seam.** Reducer over `SeasonEvent` (`src/types/gameState.ts`); see the full variant list in the next section. Same `default: const _: never = event;` exhaustiveness contract as `applyMatchEvent`. |
| `rosterSeeder.ts` | `seedRoster(allTeams, seasonStartYear)` — one-shot at `newSeason` / v4-save migration. Walks every `RawTeamInput`, allocates a globally-unique `rosterId` per player, builds `state.career.roster` + `ClubState[]`. Defers wage/expiry/reputation to `contractSeeder.seedContractFields`. |
| `rosterTeamBuilder.ts` | Two exports — the seam between persistent roster and matchday `Team`. Team identity (color / name / stadium / `suggestedTactics`) comes from the JSON; player data (current `baseStats`, position, dob, contract, `rosterId`) comes from the roster. Both builders call `playerForm.computeFormInputs(state, player)` and thread `formBias` / `formVolatility` onto each matchday `RawPlayer` for the engine's form roll. `buildTeamFromRoster` partitions `club.squad` fit-first then injured-last (used for the human side so `applyMatchdaySquad` can layer the manager's curated lineup on top). `buildAutoSelectedTeamFromRoster` orders the matchday 23 by best-OVR-per-position via `selectBestMatchdaySquad` from `autoSelect.ts` (used for every AI fixture — silent sims in `GameCoordinator.recordPlayerMatchResult` and the AI opponent in `PreMatchScreen` / live human match). |
| `playerForm.ts` | `computeFormInputs(state, player)` — pure, RNG-free. Returns the deterministic `{ bias, volatility }` driving the match-day form modifier (recent-rating + condition + return-rustiness bias; age + marquee volatility). Reads `FORM_MODEL` from `balance/form.ts`; consumed by `rosterTeamBuilder`, and by PreMatch / Contracts UI to show the out-of-match form trend. The random perturbation + final clamp live in `MatchCoordinator.initPlayer` — see `docs/match-engine.md` § Per-Match Form Modifier. |
| `autoSelect.ts` | Pure matchday-squad selection. `SLOT_SPECS` maps each of the 23 jersey slots to a primary `Position` + fallback chain (e.g. slot 6 → Flanker → Back Row; slot 22 → Fly-Half → Utility Back → Centre; bench is 5 forwards / 3 backs). `selectBestMatchdaySquad(roster, clubSquadIds)` greedily picks the highest-OVR fit player per slot, dropping through the fallback chain when no specialist is available (last-resort: any remaining player by OVR; ties broken by lower rosterId). `repairInjuredMatchdaySquad(currentRosterIds, roster, clubSquadIds)` locks fit slots and surgically swaps injured slots for best same-position replacements using the same SLOT_SPECS table. Both are pure, RNG-free, return rosterId arrays in slot order. |
| `seasonStatsCollector.ts` | `snapshotMatch(state)` extracts `{ rosterId, tries, tacklesMade, tacklesAttempted, turnoversWon, yellowCards, redCards, rating, isStarter }` per player who took the field (rosterId > 0 filter skips non-career test contexts; `isStarter = id >= 1 && id <= 15`). `collectSeasonEvents(snapshots)` converts to `PLAYER_SEASON_STATS_ACCUMULATED` events including `starts: isStarter ? 1 : 0` for playing-time promise tracking. Run by `GameCoordinator.recordPlayerMatchResult` for live + silent fixtures. |
| `loanPoolGenerator.ts` | `buildLoanPoolEvents(state)` — called by `GameCoordinator.newSeason` after staff seeding, then at the end of every `rollSeason()` (the pool is replaced each season; the previous pool's players persist in the roster as orphaned records). Generates 15–20 loan-pool players via `generatePersona` (ages 19-26, OVR 55-72 — `LOAN_POOL` in `balance/transfers.ts`), fires one `FOREIGN_IMPORT_ARRIVED` per player + one `LOAN_POOL_SEEDED` to register them and remove them from `freeAgents`. |
| `careerRollover.ts` | `computeRollover(state, allTeamIds)` — pure module; given current GameState, produces the SeasonEvent stream for a rollover, in this order: (0) `TRANSFER_ACTIVATED` for every pending Reg 7 pre-agreement (stable rosterId-ascending), (1+2) per-roster aging via `AGE_CURVES` + `STAT_NOISE` Gaussian noise + retirement check against `RETIREMENT_CURVE` (growth is scaled by `proximityMultiplier × appearancesMultiplier` and floored at 0; decline fires at full rate regardless), (3) Phase 7 supply — `ACADEMY_GRADUATED` 2-4 per club (stable alpha club id order) + `FOREIGN_IMPORT_ARRIVED` 5-10 single batch, both consuming `generatePersona`, (4) awards (top tries, MVP by avg rating with `mvpMinAppearances` floor) + composite `SEASON_ROLLED_OVER` with regenerated fixtures (Sept-May synthetic weekly dates, skips Nov + Feb). |
| `personaGenerator.ts` | Phase 7 — `generatePersona(seed, calendarDate)` produces a deterministic `Player` from `rngTransfer`: name from `NAME_POOLS` per nationality (English / Welsh / Scottish / Irish / French / South Africa / NZ / Australia / Fiji / Argentina, ~15-20 first + last names each); nationality biased by `NATIONALITY_BY_CLUB` for academy grads, uniform for foreign imports; position uniform across 12 generic positions; dob anchored to season-open year ± `ageBand`; stats `targetOverall + N(0, ±12)` clamped 1-99; wage £20k fixed for academy (RPA rookie rate) or `WAGE_BY_RATING × POSITION_SCARCITY` rounded to £5k for imports; 2-year deal default. |
| `contractSeeder.ts` | `seedContractFields(raw, clubId, seasonStartYear)` — wage = `WAGE_BY_RATING` piecewise-linear × `POSITION_SCARCITY` × `WAGE_NOISE`, rounded to £5k. Length age-banded via `CONTRACT_LENGTH`. Expiry `${seasonStartYear + lengthYears}-06-30`. Reputation = `round(overall × ratingMultiplier) + (marquee ? bonus : 0)`. Honours JSON `Partial<PlayerContract>` overrides (the hand-authored `Marquee: yes.` annotations). Two `rngTransfer` calls per player, order-stable. Also called inside `aiTransferDirector` to derive fresh-market wages for renewals + signings + poach offers. |
| `aiTransferDirector.ts` | Phases 4-6 module. **Renewals (Phase 4)**: `expiringRosterIds(state)`, `generateRenewalOffers(state)` (one offer per expiring player league-wide, wage = market × `1 - loyaltyDiscount`), `decideAIOffers(state, clubId)` (pure / RNG-free greedy: marquee + OVR floor + effective-cap-target sorting against `SENIOR_CAP + EFFECTIVE_CAP_CREDITS`), `expiryAfterYears(state, lengthYears)`. **Signings (Phase 5)**: `signingTermsFor(state, rosterId, clubId)` (user-side pure helper matching what the AI director will compute); AI signings go through the Phase-10 bid-then-resolve passes `decideAIBids` / `decideAIFinalSignings` (the older direct `decideAISignings` greedy pass was removed). **Reg 7 poaching (Phase 6)**: `isPoachEligible(player, currentDate)` (final 12 months of contract), `poachCandidates(state)` (league-wide, marquee-filtered); AI poach bids also flow through `decideAIBids` (the older direct `decideAIPoaches` pass was removed). All consumed by `GameCoordinator`'s window methods. |
| `playerSquad.ts` | Pure helpers: `extractMatchdaySquad` (snapshot the 23-man matchday roster as stable `PlayerRef` name refs) and `applyMatchdaySquad` (inverse — rearrange a `RawTeamInput` so the saved 23 occupy slots 1-23). When called with the optional `repair: { roster, clubSquadIds }` arg, runs the saved squad through `repairInjuredMatchdaySquad` (from `autoSelect.ts`) first — fit slots locked, injured slots surgically swapped for best same-position replacements. Returns the team unchanged when the saved list is empty, the wrong length, or references a player no longer rostered. |
| `fixtures.ts` | Pure double round-robin generator using the standard circle method (`circleMethodRounds`). Teams are ordered so all 5 rivalry pairs fall in circle round 0 (the two derby weekends); the remaining 8 rounds cover the 40 non-rivalry undirected pairs. Each non-rivalry pair is directed by one `rngTransferRaw` H/A flip, giving a first-half round and a return round. Derby H/A is biased by season parity (65%/35% flip). Produces exactly 90 fixtures; an assertion throws on mismatch. Used by `careerRollover` for year-2+ regeneration. Year-1 default is the hand-authored `PREMIERSHIP_2025_26` schedule. |
| `simulateFixture.ts` | Headless wrapper around `MatchCoordinator` with `silent: true` — suppresses every `engine:event` / `engine:stateChange` / `engine:initialized` / `engine:resumed` emit and replaces modal prompts with `high_ball` / `kick_for_goal` defaults. `engine:finished` still fires. Returns `{ homeScore, awayScore, playerSnapshots }` so the caller can route stats through `seasonStatsCollector`. Accepts an `isDerby?` opt (threaded through to `state.engine.isDerby`, mirroring `neutralVenue` / `homeFillRate`); `GameCoordinator` passes the fixture's `isDerby` flag for league AI sims so `AITacticalDirector.pickEffort` opens derbies at high intensity. The live player-match path passes the same flag from `MatchCoordinator`'s `isDerby` opt in `main.ts`. **The match engine and the game engine only meet here.** |
| `leagueTable.ts` | Pure helpers: `sortStandings` (league points → points diff → points for), `findStanding`. |
| `teamStats.ts` | Pure derivations from `FixtureResult[]` + overall ratings: `recentForm` (rolling W/L/D pins padded with null on the left), `headToHead` (W/D/L record from one team's POV across every meeting so far), `matchSpread` (rating-derived handicap, favored side negative). Read by `PreMatchScreen`; no module state, no bus subscriptions. |
| `derive.ts` | `deriveFixtureSeed(rootSeed, round, homeId, awayId)` — hashes the inputs so each headless AI fixture has a stable, derivable seed independent of the round in which it was simulated. |
| `age.ts` | Pure `getAge(dobIso, currentDateIso)` — returns null when `dob` is missing. Plus `parseSeasonStartYear(seasonLabel)` and `seasonOpenIso(year)` helpers used by `contractSeeder`, `careerRollover`, `personaGenerator`, and `aiTransferDirector` to anchor age + expiry calculations to the current calendar. |
| `balance/season.ts` | Season tuning constants — `SEASON_VALUES` (start date, season label, week length, season-open anchor month/day, international skip windows) and `LEAGUE_POINTS` (League 4/2/0 + losing bonus when margin ≤ 7). |
| `balance/career.ts` | Rollover tuning — `AGE_CURVES` per stat (peakAge / growth / decline — growth rates halved vs v1, physical decline steepened, mental decline flattened), `STAT_NOISE` (Gaussian std-dev + clamp), `RETIREMENT_CURVE` (forwards / backs cumulative probabilities), `SEASON_AWARDS.mvpMinAppearances`. Also holds the development-ceiling constants: `POTENTIAL_HEADROOM` (age-banded OVR headroom ranges seeded once at game-start), `PROXIMITY_CURVE` (piecewise-linear headroom→multiplier table, applied to growth only), `APPEARANCES_CURVE` (step function of season appearances applied to rollover growth). Exports `proximityMultiplier(potential, ovr)` and `appearancesMultiplier(apps)` helpers consumed by both `careerRollover` and `trainingWeek`. |
| `balance/transfers.ts` | Contract + market tuning — `SENIOR_CAP` (£6.4M), `CAP_CREDITS` (£600k HG + £400k EPS + £400k injury = £1.4M `EFFECTIVE_CAP_CREDITS` widening effective cap to £7.8M), `WAGE_BY_RATING` anchor table (capped at £560k @ rating 96 so ordinary stars compress into £350-550k band), `POSITION_SCARCITY`, `WAGE_NOISE`, `CONTRACT_LENGTH` age-band weights, `REPUTATION_SEED`, plus the Phase 4 `RENEWAL` block (`loyaltyDiscount`, `aiTargetCapUtilisation`, `aiReleaseRatingFloor`). |

`TeamProfile` (`src/team/teamProfile.ts`) was previously the season-scope mutation seam; that role has moved into `GameState.league.standings` + `GameState.career.roster`. The module now only exposes identity/narrative/star data + roster lookups (`computeOverallRating`).

## Mutation seam: `SeasonEvent` variants

All season-scope state writes go through `applySeasonEvent(state, event)`, called by `GameCoordinator` **and its season sub-coordinators** (`TransferCoordinator`, `StaffCoordinator`, `BoardCoordinator`, `PlayoffCoordinator`, `InternationalBreakCoordinator`) plus the pure helpers `injuryEffects` / `moraleEffects` / `trainingRunner` — all sharing the one `GameState`. The discriminated union and its branches are co-located. Exhaustive `default: const _: never = event` catches a missing branch at compile time.

**Season-basics layer:**

| Variant | When fired | What it does |
|---|---|---|
| `SEASON_INITIALIZED` | `newSeason` / `fromSave` | Sets `playerTeamId`, `seed`, `calendar.week = 1`, `seasonLabel`, copies `league.fixtures` from the schedule, resets `league.results` / `standings`. |
| `FIXTURE_RESULT_RECORDED` | Per player + AI fixture in `recordPlayerMatchResult` | Pushes the `FixtureResult` onto `league.results` and updates both teams' standings (with losing bonus per `LEAGUE_POINTS`). |
| `MEDIA_STORY_PUBLISHED` | Player fixture in `recordPlayerMatchResult` (`publishMediaStory`); also per saved story in `fromSave` | Pushes a generated `MediaStory` onto `league.mediaStories`. Pure flavour — the inbox surfaces the latest round only. See **[media-manager.md](media-manager.md)**. |
| `WEEK_ADVANCED` | After all fixtures of a round are applied | `calendar.week += 1`; `calendar.date` jumps to the earliest date in the new round (falls back to `+SEASON_VALUES.weekLengthDays` for generated schedules). |
| `PLAYER_TACTICS_SET` | `PreMatchScreen` Kick Off | Clones the chosen `TeamTactics` into `state.player.tactics` so the next match opens with them as the default. |
| `PLAYER_MATCHDAY_SQUAD_SET` | `PreMatchScreen` Kick Off; `SquadManagementScreen` Save Squad | Persists the matchday 23 as `PlayerRef[]` (firstName + lastName pairs) so squad selection survives mid-match tab close. Both callers round-trip through the same `state.player.matchdaySquad` field. |
| `PRE_SEASON_STEP_SET` | Each step of the Squad Builder pre-season flow (overview → signings → marquee), before `saveGame` | Sets / clears `state.career.preSeasonStep` (`'overview' \| 'signings' \| 'marquee' \| undefined`) so `continueGame` can route back to the in-flight screen after a mid-pre-season tab close. Cleared once the marquee Continue completes; outside Squad Builder the field stays undefined and is omitted from the save payload. |

**Career layer (Phase 1 of the transfer-system roadmap):**

| Variant | When fired | What it does |
|---|---|---|
| `ROSTER_SEEDED` | One-shot at `newSeason` / v4-save migration | Populates `state.career.roster` keyed by `rosterId`, `ClubState[]`, `nextRosterId`. Source data is the JSON-loaded `RawTeamInput[]` (authored, play-ready `baseStats` — no spawn transform). |
| `PLAYER_SEASON_STATS_ACCUMULATED` | Per player per fixture (live + silent AI) | Adds the per-match delta to `roster[rosterId].seasonStats` — including `starts` (1 if `id <= 15`, else 0) for playing-time promise tracking. Drives top-scorer / MVP cards in `EndOfSeasonScreen`. Also pushes the match rating onto `Player.recentRatings` (rolling last-3, most-recent-first) — the recent-form signal read by `playerForm.computeFormInputs`. |
| `TEAM_SEASON_STATS_ACCUMULATED` | Two events per fixture (home + away side) in `recordPlayerMatchResult` and every silent AI fixture | Adds the per-match delta to `state.league.teamSeasonStats[teamId]` — possession / territory / set-piece win rates / attack / defence / kicking / discipline buckets keyed by teamId. Read by `seasonLeaderboards.teamLeaderboard` for per-club season aggregates. Lazy-initialised: the map starts empty and gets a `zeroTeamSeasonStats()` entry on first write per team. |
| `PLAYER_AGED` | Per player per rollover | Applies `Partial<PlayerStats>` deltas to `baseStats` (clamped 1-99). Driven by `AGE_CURVES` + `STAT_NOISE` (stddev 0.25, clamp ±1.5) Gaussian noise from `rngTransfer`. Growth (pre-peak) is scaled by `proximityMultiplier × appearancesMultiplier` and floored at 0 — a growing stat cannot go backwards from noise variance. Decline fires at full rate regardless of either multiplier. |
| `PLAYER_RETIRED` | Per retiring player per rollover | Removes `rosterId` from `ClubState.squad`, `career.freeAgents`, `career.pendingMoves`, and `career.loanPool`, and sets `Player.retired = true` (the rollover aging loop and weekly morale decay skip flagged players). The `Player` record stays in `state.career.roster` for archive references. |
| `PLAYER_INJURED` | Per in-match injury at match teardown (player + every AI fixture) | Writes `state.career.roster[rosterId].injury` with kind / severity / weeksRemaining / injuredOn / isRecurrence. Severity + weeks rolled via `rngTransfer` from `INJURY_SEVERITY[kind]`. Snapshots are walked rosterId-ascending so the RNG call order is stable. |
| `INJURY_TICK_ADVANCED` | Per injured roster player at the start of `recordPlayerMatchResult` (before the round's new injuries are added) | Decrements `roster[rosterId].injury.weeksRemaining` by one (floor 0). No RNG. |
| `PLAYER_RECOVERED` | When an injury's `weeksRemaining` would hit 0 after the tick | Clears `roster[rosterId].injury` and sets `Player.formReturn = { round, penalty: −3 }` — a fading form penalty (rustiness) read by `playerForm.computeFormInputs`. Fired in the same pass as the final `INJURY_TICK_ADVANCED`. |
| `CAREER_ARCHIVE_RESTORED` | `fromSave` only | Restores `seasonsCompleted`, `archive`, plus optional `freeAgents` / `market` / `pendingMoves` / `activePoachedIds` etc. Keeps every `state.career.*` write inside `applySeasonEvent` so the mutation seam holds across the load path. |
| `SEASON_ROLLED_OVER` | One per rollover, after all `TRANSFER_ACTIVATED` / `PLAYER_AGED` / `PLAYER_RETIRED` / `ACADEMY_GRADUATED` / `FOREIGN_IMPORT_ARRIVED` events for that rollover | Composite: archives just-completed standings + top scorer + MVP + `championTeamId` into `state.career.archive`, resets `league.results` / `league.standings` / `league.playoffs` / per-player `seasonStats` (and clears each player's `recentRatings` / `formReturn`), replaces `league.fixtures` with the regenerated round-robin, sets the new `seasonLabel`, increments `seasonsCompleted`. Clears `state.career.pendingMoves` as a safety net (they were already drained by the preceding `TRANSFER_ACTIVATED` events) and `state.career.activePoachedIds` (poach threats are season-scoped). Also releases all active loan arrangements: loan-in players are removed from their club's squad and returned to `career.loanPool`; clears `player.loanOut`, `player.loanIn`, `player.wantsTransfer`, `player.playingTimePromise`, `player.consecutiveVeryUnhappyRounds` on every roster player. |
| `PLAYOFF_BRACKET_SEEDED` | Once after the last R18 fixture is recorded (via `seedPlayoffBracket`) | Writes `state.league.playoffs` with the two semi-finals (1 v 4, 2 v 3) seeded from `sortStandings(top 4)` and a Final entry with `homeId`/`awayId` null. Idempotent — exits early if the bracket already exists. |
| `PLAYOFF_RESULT_RECORDED` | One per playoff match — player (via `recordPlayerPlayoffResult`) or AI sim (via `simulatePendingPlayoffMatches`) | Sets `result` on the named match. Cascades: on a SF result, populates the Final's matching slot from the SF winner (SF1 → home, SF2 → away). On the Final's result, sets `championTeamId`. Does NOT touch `league.standings` — playoffs are independent of league points. |
| `CLUB_BUDGET_SET` | Once per club at the start of the off-season chain (via `prepareBudgetsForNextSeason`) | Sets `state.career.clubs[clubId].salaryBudget` to the post-clamp new value (performance-derived base, floored from year 2 onwards, ceilinged at the effective cap). `delta` + `reasons` carry display payload for the BudgetRevealScreen. |
| `CLUB_TAKEOVER` | After all `CLUB_BUDGET_SET` events when a club hits the takeover trigger — Newcastle Red Bull at year-1 → year-2 (hardcoded), random investor takeovers from year 3+ (`rngTransfer` rolls) | Adds `boostAmount` (£1m) to the named club's `salaryBudget`, clamped at the effective cap. Pushes the clubId onto `state.career.takeoverHistory` so the club is excluded from future random rolls. |
| `PLAYER_TRAINING_PLAN_SET` | TrainingScreen Continue (post-match) and TrainingScreen Back (Hub mid-week) | Clones the chosen `TrainingPlan` (`intensity` + `forwardsFocus` + `backsFocus`) into `state.player.training` so the next training week opens with it as the default. |
| `PLAYER_TRAINED` | Per non-injured roster player league-wide, once per training week of the gap (post-match TrainingScreen Continue → `applyTrainingBlock`) | Applies `conditionDelta` to `Player.condition` (clamped 0-100) plus `Partial<PlayerStats>` deltas to `baseStats` (clamped 1-99). `conditionDelta = conditionPerDay × the period's day-span` (condition recovers daily). Shape mirrors `PLAYER_AGED` for the stats half. RNG via `rngTransfer`; iteration is club id-ascending → roster id-ascending. |
| `PLAYER_CONDITION_UPDATED` | Per player who took the field, once per fixture (live + silent AI + playoffs) | Snapshots that player's final in-match fatigue back to `Player.condition` (set, not add). MatchCoordinator.initPlayer then reads it as the starting `fatiguePct` for the next match. Bench players who didn't appear get no event and keep their accumulated condition. |
| `LIONS_RETURN_SET` | Per matched 2025 B&I Lions tourist at the 2025/26 `newSeason` | Sets `Player.lionsReturnRound` (post-tour stand-down end) + the reduced return `condition`. |
| `SUMMER_TOUR_RETURN_SET` | Per summer-tour player at every `newSeason` (fired unconditionally from year 1 onwards) | Sets `Player.summerTourReturn = true` + the reduced return `condition` (centred on 83, ±7). 2025/26: name-matches the curated `ENGLAND_SUMMER_2025_TOURISTS` / `WALES_SUMMER_2025_TOURISTS` lists. Year 2026+: dynamically selects the top-OVR Premiership-based England (cap 28) and Wales (cap 10) players via `dynamicSummerTourIds()`. All flagged players are excluded from the pre-season cup (leg-0) via `getSummerTourRosterIds()` → `buildSummerTourExclusionMap()` in `runPreSeasonBlock`; `getSummerTourRosterIds` reads the `summerTourReturn` flag directly so it works for both the hardcoded and dynamic selection paths. Cleared at `SEASON_ROLLED_OVER`. |
| `PLAYER_CALLED_UP` | Per selected player league-wide at an international break, inside `applyTrainingBlock` | Sets the transient `Player.internationalDuty = { window }` flag (so the break's training block skips them) and bumps `Player.internationalCaps`. Window-specific nations: Autumn = England/Wales/Scotland/South Africa; Six Nations = England/Wales/Scotland. |
| `PLAYER_RETURNED_FROM_DUTY` | Per call-up after the break's training block, inside `applyTrainingBlock` | Clears `internationalDuty`, sets the reduced return `condition` (set, not add), sets `Player.formReturn = { round, penalty: −2 }` (fading return rustiness), and — when `restEligibleRounds` is present (England heavy-load only) — sets `Player.restObligation`. Any return injury fires as a separate `PLAYER_INJURED`. Camp stat gains fire as `PLAYER_TRAINED` (conditionDelta: 0) immediately before this event. |
| `REST_OBLIGATION_RESOLVED` | Per obligated player who didn't feature in an in-window round, in `recordPlayerMatchResult` (before `WEEK_ADVANCED`) | Clears `Player.restObligation` — the player has satisfied the PGA rest requirement (human: not in the matchday 23; AI: force-rested at the return round). |

**League Cup layer (v1.18b)** — see `docs/league-cup.md` for the full breakdown:

| Event | When | Effect |
|---|---|---|
| `PREM_CUP_SEEDED` | Once per season — `newSeason` (fixed 2025-26 pools) + appended **last** in `computeRollover` (year 2+, redrawn pools) | Builds `state.league.premCup` — two pools (each with `zeroStanding` rows) + 40 pool fixtures (3 legs: 4/pool pre-season, 8/pool autumn, 8/pool six-nations). Idempotent on a matching `seasonLabel`. |
| `PREM_CUP_FIXTURE_RECORDED` | Per pool fixture, inside `runInternationalBreakBlock` | Sets the fixture result + applies it to that pool's standings via the shared `applyResultToStanding` (`leagueTable.ts`) (same 4/2/0 + bonus rules as the league). |
| `PREM_CUP_KNOCKOUT_SEEDED` | Once, after the leg-2 pool stage | Seeds `premCup.knockout` — SF1 = winner(A) v runner-up(B), SF2 = winner(B) v runner-up(A). |
| `PREM_CUP_KNOCKOUT_RECORDED` | Per knockout match | Records the result; cascades SF winners → final slots (SF1→home, SF2→away), final winner → `championTeamId`. Mirrors `PLAYOFF_RESULT_RECORDED`. |
| `PLAYER_CUP_DIRECTION_SET` | When the user toggles the cup direction | Persists `state.player.cupDirection` (`'best'` \| `'rest_first_15'`). |
| `PLAYER_CAPTAIN_SET` | When the user taps a captain badge on the PreMatch 'mine' lineup | Persists `state.player.captainRosterId` (rosterId, or `undefined` to clear). Narrative-only — `resolveCaptainRosterId` (`src/game/captain.ts`) falls back to the highest-composure starter when unset, and the resolved id is threaded into the match as `state.engine.humanCaptainRosterId` so the referee names the captain in the team-22 warning. No mechanical effect. |
| `PLAYER_DISCIPLINE_COUNSELLED` | `GameCoordinator.counselPlayer(rosterId)` — fired when the manager clicks "Speak to Player" on an inbox discipline concern | Sets `Player.disciplineAdvice = { mode: 'ease_off', expiresAfterRound: calendar.week + 3 }`. `rosterTeamBuilder.rawFromRosterPlayer` reads this to boost effective discipline (+15) and reduce tackling (−5) on the baseStats clone for 3 rounds. Cleared at `SEASON_ROLLED_OVER`. |
| `PLAYER_SUSPENDED` | `GameCoordinator.recordPlayerMatchResult` — fired after `PLAYER_SEASON_STATS_ACCUMULATED` when a human squad player's `seasonStats.yellowCards` first reaches `YELLOW_BAN_THRESHOLD (5)` | Sets `Player.suspension = { forRound: calendar.week + 1 }`. `selectionUnavailableIds` blocks selection while `calendar.week === suspension.forRound`. One ban per season (re-guarded by `!p.suspension`). Cleared at `SEASON_ROLLED_OVER`. |
| `PLAYER_MORALE_ADJUSTED` | `computeFixtureMoraleEvents` (`src/game/moraleEffects.ts`, after every fixture — playing-time + result + standout), `computeMoraleDecayEvents` (`src/game/moraleEffects.ts`, once per `WEEK_ADVANCED`), `GameCoordinator.boostPlayerMorale` (inbox "Have a Chat" CTA), `applyStatusPacePenalty` (`src/game/TransferCoordinator.ts`, once per `WEEK_ADVANCED` for players behind their status pace threshold) | Clamps `Player.morale += delta` to [0, 100]. `Player.morale` is randomly seeded at new-game start by `rosterSeeder.seedMorale()`: ~60% OK (56–74), ~40% Happy (80–90) — bracket drawn from `rngTransfer(0,99)`, value from a second roll within the bracket. Pre-morale saves are back-filled to `MORALE.baseline` (65) in `ROSTER_SEEDED`. Drives a ±3 form-bias term in `playerForm.computeFormInputs` — formula: `clamp((morale − 65) × 0.086, −3, +3)`. **Chat boost (diminishing returns):** when `reason === 'manager_chat'`, `boostPlayerMorale` computes `delta = max(2, round(rngTransfer(6, 14) × 0.55^chatCount))` — first chat ≈ 6–14, second ≈ 3–8, third ≈ 2–4, fourth+ floored at 2. `Player.moraleChats` tracks the count; reset at `SEASON_ROLLED_OVER`. **Streak reset:** when morale rises above `veryUnhappyThreshold` the handler clears `player.consecutiveVeryUnhappyRounds` so a recovered player doesn't immediately re-trigger a transfer request. **Fixture omission:** `computeFixtureMoraleEvents` uses `resolveSquadStatus` (squad status or OVR-rank fallback) to look up `SQUAD_STATUS_OMIT_PENALTY[status]` — star omitted: −6, firstTeam: −4, impact: −2, squad: −1, backup: 0. Replaces the old top-15 OVR threshold. **Status pace:** `applyStatusPacePenalty` fires `delta = −3` (`statusMismatchWeeklyPenalty`) once per `WEEK_ADVANCED` after round 4 if a player's actual `appearances` is below the pro-rated `SQUAD_STATUS_THRESHOLDS[status].minApps`. **Inbox diagnosis:** the "unhappy player" item body is reason-aware — playing-time (behind status-based threshold after ≥4 games), bad run (≥2 losses in last 3), both, or neither. **moraleNote (`Player.moraleNote?: { reason: MoraleReason; week: number }`):** set by `applySeasonEvent` whenever a negative event fires while morale < 55; cleared when morale recovers to ≥ 55 or a manager chat fires. `MoraleReason` values (priority low→high): `bad_run`, `unused_bench`, `playing_time`, `loan`, `transfer_rejected`, `broken_promise` — higher-priority reasons are never overwritten by lower-priority ones. `TRANSFER_REQUEST_REJECTED` and `PROMISE_BROKEN` set `moraleNote` directly (they bypass `PLAYER_MORALE_ADJUSTED`); `PLAYER_LOANED_OUT` sets `moraleNote: 'loan'` when the delta is negative. Surfaced in two places: (1) player profile morale pip appends the reason as "Unsettled · Not in the starting XV"; (2) the inbox "Have a Chat" button opens a bespoke conversation modal (player opening line + manager response) keyed to the reason before firing the boost. Balance constants in `src/engine/balance/morale.ts`. |
| `SQUAD_STATUS_SET` | `GameCoordinator.setSquadStatus(rosterId, status)` — called from PlayerProfileScreen "Change" picker | Sets `Player.squadStatus` to the chosen `SquadStatusKey` (`'star' \| 'firstTeam' \| 'impact' \| 'squad' \| 'backup'`). Persists through `SEASON_ROLLED_OVER` (contract-level attribute). Legacy saves with `squadStatus === undefined` fall back to `inferSquadStatus` (top-2 OVR = star, top-15 = firstTeam, top-23 = impact, otherwise squad) in `resolveSquadStatus` (`src/game/squadStatus.ts`). |
| `STAFF_POOL_SEEDED` | `GameCoordinator.newSeason` (season 1 start, `generateStaffPool(1)`) and `careerRollover.computeRollover` (year 2+, carries forward hired staff + generates a fresh free pool). | Sets `career.staff = event.staff` and `career.nextStaffId = event.nextStaffId`. IDs use the `nextStaffId` counter (mirrors `nextRosterId`). Free-pool entries have `clubId: null`; hired entries carry the managed-club id. Both `staff?` and `nextStaffId?` are additive-optional — absent on legacy saves (treated as empty pool, no staff effects). |
| `STAFF_HIRED` | `GameCoordinator.hireStaff(staffId)` — called from StaffScreen hire button | Sets `StaffMember.clubId` to the managed-club id and `annualWage` to the listed wage. Guard: no-ops if the member is already hired. |
| `STAFF_RELEASED` | `GameCoordinator.releaseStaff(staffId)` — called from StaffScreen release button | Sets `StaffMember.clubId = null` (returns to pool). Also auto-unassigns any scouting targets the scout was tracking. Guard: no-ops if not hired by the managed club. |
**Transfer requests + playing-time promises (Feature 1.4):**

| Variant | When fired | What it does |
|---|---|---|
| `PLAYER_VERY_UNHAPPY_TICK` | `TransferCoordinator.checkTransferRequestsAndPromises()` — once per `WEEK_ADVANCED` (called from the match tick), for each squad player whose morale is below `veryUnhappyThreshold` | Increments `Player.consecutiveVeryUnhappyRounds` (initialises from 0). When the count reaches `MORALE.transferRequestStreak (2)`, the next tick fires `TRANSFER_REQUEST_SUBMITTED` instead. |
| `TRANSFER_REQUEST_SUBMITTED` | Same as above, when streak reaches threshold | Sets `Player.wantsTransfer = true`; resets `consecutiveVeryUnhappyRounds = 0`. Generates an inbox item (priority 70) with three CTAs. |
| `PLAYING_TIME_PROMISED` | `GameCoordinator.makePlayingTimePromise(rosterId)` — inbox "Promise game time" CTA | Sets `Player.playingTimePromise = { toRound: week + 5, startsRequired: 3, startsAtPromise: seasonStats.starts }` (`PLAYING_TIME_PROMISE` in `balance/transfers.ts`); clears `wantsTransfer`. Checked each `WEEK_ADVANCED` — if `toRound` is passed and the player hasn't accumulated `startsRequired` starts since the promise, fires `PROMISE_BROKEN`. |
| `TRANSFER_REQUEST_GRANTED` | `GameCoordinator.grantTransferRequest(rosterId)` — inbox "Grant request" CTA | Clears `Player.wantsTransfer`. (No mechanical effect in v1 — player stays on roster until normal contract expiry / rollover.) |
| `TRANSFER_REQUEST_REJECTED` | `GameCoordinator.rejectTransferRequest(rosterId)` — inbox "Reject" CTA | Clears `Player.wantsTransfer`; applies `delta = MORALE.transferRequestRejectPenalty (−8)` directly to `Player.morale`; sets `Player.moraleNote = { reason: 'transfer_rejected', week }` if morale drops below 55. |
| `PROMISE_BROKEN` | `TransferCoordinator.checkTransferRequestsAndPromises()` when `toRound` has passed with insufficient starts | Clears `Player.playingTimePromise`; applies `delta = MORALE.promiseBrokenPenalty (−15)` directly to `Player.morale`; sets `Player.moraleNote = { reason: 'broken_promise', week }` if morale drops below 55. No forced sale. |

**Loan system (Feature 2.3):**

| Variant | When fired | What it does |
|---|---|---|
| `LOAN_POOL_SEEDED` | `GameCoordinator.newSeason` (after staff seeding), the end of every `rollSeason()` (fresh pool per season, applied after the rollover events so the draws can't shift them), and `fromSave` (when `save.career.loanPool` is present) | Sets `state.career.loanPool` to the array of rosterIds; removes those ids from `state.career.freeAgents` so pool players don't appear in the transfer market. |
| `PLAYER_LOANED_OUT` | `GameCoordinator.loanOutPlayer(rosterId)` — LoanScreen "Send out" button | Sets `Player.loanOut = { partnerClub, fromRound: calendar.week }`. Player is excluded from matchday selection. Training effect: skip flat decay, high-stat decay, condition-delta, and injury rolls; apply `LOAN_DEV_MULTIPLIER = 1.5` dev-chance multiplier. Max 5 simultaneous (`MAX_LOANS_OUT`). |
| `PLAYER_RECALLED_FROM_LOAN` | `GameCoordinator.recallLoanedPlayer(rosterId)` — LoanScreen "Recall" button | Clears `Player.loanOut`. Player immediately becomes eligible for selection. |
| `LOAN_PLAYER_SIGNED` | `GameCoordinator.signLoanPlayer(rosterId)` — LoanScreen "Sign on loan" button | Adds `rosterId` to the managed club's `squad`; sets `Player.loanIn = { fromRound: calendar.week }`; removes from `career.loanPool`. Player is immediately available for selection and trains normally. |
| `LOAN_PLAYER_RELEASED` | `GameCoordinator.releaseLoanPlayer(rosterId)` — LoanScreen "Release" button | Removes `rosterId` from the club's `squad`; clears `Player.loanIn`; adds back to `career.loanPool`. |
| `STAFF_BUDGET_BOOSTED` | `GameCoordinator.setStaffBudgetBoost(boost)` — FinancesScreen transfer slider | Sets `ClubState.staffBudgetBoost` to the new absolute value. Season-only: cleared (set to 0) during `SEASON_ROLLED_OVER`. One-way — player salary headroom → staff budget only. |

| `PLAYER_SCOUT_ASSIGNED` | `GameCoordinator.assignScout(rosterId, scoutId)` — called from PlayerProfileScreen assign button | Creates or updates the `ScoutingRecord` for `rosterId` (preserving existing accuracy); sets `assignedScoutId`. The coordinator unassigns the scout from any prior target before calling this. |
| `PLAYER_SCOUT_UNASSIGNED` | `GameCoordinator.unassignScout(rosterId)` or inline before a reassignment | Removes `assignedScoutId` from the record (accuracy retained). |
| `SCOUTING_ACCURACY_ADVANCED` | `StaffCoordinator.advanceScoutingAccuracy()` — once per week per assigned-scout target | Adds `delta = scoutWeeklyGain(scout.rating)` pp to `accuracy`; clamped to 0–100. |
| `PLAYER_SCOUTING_RESTORED` | `GameCoordinator.fromSave` only | Bulk-replaces `state.player.scouting` verbatim. Absent on legacy saves — falls back to no entries (all targets at accuracy 0). |
| `PLAYER_SCOUTING_REMOVED` | `GameCoordinator.removeScouting(rosterId)` — called when the manager swipes a card off the Scouting screen | Deletes `state.player.scouting?.[rosterId]`. Implicitly releases any assigned scout since the record no longer exists. |

`SEASON_ROLLED_OVER` additionally carries `premCupChampionTeamId` (archived onto `ArchivedSeason`) and resets `state.league.premCup = null`; `CAREER_ARCHIVE_RESTORED` restores `premCup`.

**Board confidence layer (Tier 0 · 0.1)** — the career fail-state spine. A persistent `state.player.board: BoardState { confidence: 0–100; objective: BoardAmbition; warningIssued: boolean; sacked: boolean }` for the managed club. Confidence is fully deterministic from results (no RNG). Logic in `src/game/board.ts`, tuning in `src/engine/balance/board.ts`.

| Variant | When fired | What it does |
|---|---|---|
| `BOARD_STATE_SEEDED` | `newSeason` + `fromSave` (verbatim restore) + after `rollSeason()` (`BoardCoordinator.seedBoardState`) | Sets `state.player.board` wholesale. Seed confidence is the ambition baseline in year 1 (`title 58 / playoffs 55 / topHalf 55`), else mapped from the just-archived finish via `evaluateObjective` (`champion 72 / exceeded 65 / met 60 / missed 45`). `objective` copies the authored `boardAmbition`; `warningIssued` + `sacked` reset to `false` each season. Optional `europeanObjective` is set only on the `fromSave` path (verbatim restore — a fresh season seed leaves it for `EUROPEAN_OBJECTIVE_SET`). |
| `BOARD_CONFIDENCE_ADJUSTED` | Per human result in `recordPlayerMatchResult` (`applyBoardResult`) | `confidence = clamp(0, 100, confidence + delta)`. Per-result delta keyed on `expectedToWin`: win-as-favourite `+3`, win-as-underdog `+6`, draw `∓2`, loss-as-favourite `−6`, loss-as-underdog `−3`; a third straight league loss adds `−5`. |
| `MANAGER_WARNED` | `evaluateJobSecurity` when confidence ≤ `25` and no warning has been issued this season | Sets `warningIssued = true` (the one-per-season final-warning latch). The inbox surfaces a high-priority warning item while the latch holds and confidence stays low. |
| `MANAGER_SACKED` | `evaluateJobSecurity` when confidence ≤ `10` *with* a prior warning | Sets the persisted `sacked = true` latch (mid-season). Persisted — not a transient flag — so a reload between the result and the game-over screen can't escape it: `main.ts` reads `GameCoordinator.isManagerSacked()` on every continue / resume path and routes to the `SackScreen` (which clears the save slot). |

The **Club page** (`ClubMenuScreen`, reached from the Hub's Club tile) is the home of board confidence: a summary band + 0–100 meter and a live **"what's driving it"** breakdown from `boardConfidenceFactors(state)` (season objective vs current position, recent results, winning/losing runs, formal-warning latch). The recurring **owner's messages** in the inbox (`inbox.ts`: week-1 objectives + the round-6 / round-11 mid-season block reports) additionally close with an owner's-voice read-out of the confidence band (`ownerConfidenceLine` → `confidenceBand`), so the manager tracks their standing in narrative form too.

The **end-of-season** sack is decided by `judgeSeasonObjective()` — a **pure** projection (`confidence + eosSwing(verdict)`, `exceeded +25 / met +10 / missed −25`) checked against the season-end threshold (`≤ 20`). It mutates nothing: the swing is discarded at rollover anyway (next season reseeds from the archived finish, not carried confidence), and the end-of-season chain re-runs verbatim on a reload from the off-season, so a persisted additive swing would double-count. The caller routes to the `SackScreen` on the returned `sacked`; nothing is saved before that, so the EOS sack never persists.

`GameCoordinator.rollSeason()` returns the applied `SeasonEvent[]` so `main.ts` can hand it to `RolloverScreen` for the post-apply diff render.

**Market layer (Phases 2-4 of the transfer-system roadmap):**

| Variant | When fired | What it does |
|---|---|---|
| `MARQUEE_DESIGNATED` | User taps the star on `ContractsScreen` (or AI auto-pick in future phases) | Clears `contract.isMarquee` on the prior marquee in the named club's squad, then sets it on the new `rosterId` (or leaves cleared when `rosterId === null`). |
| `MARKET_OPENED` | `GameCoordinator.openRenewalWindow` (phase: `'renewals'`) and `openSigningWindow` (phase: `'signings'`) | Populates `state.career.market` with the discriminated phase + relevant rosterId list + one cached `TransferOffer` per relevant player (expiring players for renewals; free agents + Reg 7 poach candidates for signings), each `status: 'pending'`. v15+ also initialises `bids: []`. |
| `OFFER_SENT` | Reserved for proactive offers; the open-window flows seed offers via `MARKET_OPENED` directly | Idempotent on duplicate IDs — appends to `market.offers`. |
| `OFFER_RESPONDED` | Per offer in `closeRenewalWindow` (one for every pending offer, in stable order) | Flips the offer's `status` to `'accepted'` or `'rejected'`, with optional `rejectionReason`. |
| `BID_SUBMITTED` | User Make Offer / Retain on TransferMarketScreen / RetentionDecisionScreen; AI bid + auto-retention passes inside `resolveSigningRound` and the final `closeSigningWindow` | Appends a `TransferBid` to `market.bids`. Idempotent on duplicate IDs. |
| `BID_WITHDRAWN` | User Withdraw (any bid kind) | Marks the bid `status: 'withdrawn'`; the wage reservation lifts (no longer counted by `clubBudgetUsage`). |
| `BID_RESOLVED` | Per pending bid at the end of each Submit round | Flips the bid `status` to `'won'` / `'lost'`. The winning bid for each contested player is paired with a `CONTRACT_SIGNED` / `PRE_AGREEMENT_SIGNED` / `CONTRACT_EXTENDED` event in the same batch. |
| `CONTRACT_EXTENDED` | Per accepted renewal in `closeRenewalWindow`; per winning retention bid in `resolveSigningRound` | Updates the player's `contract.expiresOn` + `contract.annualWage` in place. `clubId` unchanged (player stays with current club). |
| `CONTRACT_TERMINATED` | Per rejected renewal (`reason: 'expired'`); proactive releases use `'released'`; `PLAYER_RETIRED` is a separate path | Removes the rosterId from `ClubState.squad`, clears any `isMarquee` flag, appends to `state.career.freeAgents` (unless `reason: 'retired'`), and clears `contract.clubId` so downstream lookups don't show the player as still attached. |
| `MARKET_CLOSED` | `GameCoordinator.closeRenewalWindow` and `closeSigningWindow` — fires after all per-window contract + bid events | Clears `state.career.market` (sets to null). |
| `POACH_THREATS_SET` | Each `WEEK_ADVANCED` tick, via background threat assessment in `TransferCoordinator` | Overwrites `state.career.activePoachedIds` with the rosterIds of the user's own players currently under active mid-season poach threat from other clubs. Drives the numeric badge on the Hub's Transfers tile. Set even mid-season when no market window is open — the badge is informational only. Cleared (empty array) when the season rolls over. |

**Signing + poaching + supply layer (Phases 5-7 of the transfer-system roadmap):**

| Variant | When fired | What it does |
|---|---|---|
| `CONTRACT_SIGNED` | User-side via `signFreeAgent`; AI side via the signing-round resolver (`resolveSigningRound`, AI bids from `decideAIBids`/`decideAIFinalSignings`) | Removes rosterId from `state.career.freeAgents`, adds to the new club's `ClubState.squad`, rewrites the player's `contract` ({ `clubId`, `expiresOn`, `annualWage`, `isMarquee: false` }). |
| `PRE_AGREEMENT_SIGNED` | User-side via `preAgreePoach`; AI side via the signing-round resolver (AI poach bids from `decideAIBids`) | Pushes a `PreAgreement` onto `state.career.pendingMoves`. Idempotent per rosterId — any prior pending move for that player is dropped first. The move activates at the next rollover via `TRANSFER_ACTIVATED`; until then the player completes the season at their current club. |
| `PRE_AGREEMENT_CANCELLED` | User-side via `cancelPreAgreement` (UI undo on TransferMarketScreen) | Drops the pending move for the given rosterId — no rollover-time activation. Only valid while the signing window is open. |
| `TRANSFER_ACTIVATED` | Per pending move in `careerRollover.computeRollover` (stable rosterId-ascending) | Atomic squad swap — removes rosterId from the old club's `ClubState.squad` (sourced from `event.fromClubId` so a future rollover-batch reordering can't desync), adds to the new club's, rewrites `contract` with the agreed terms (clears `isMarquee` on departure). Does NOT touch `freeAgents`. |
| `ACADEMY_GRADUATED` | 2-4 per club per rollover in `careerRollover.computeRollover`, persona via `generatePersona` | Inserts the new persona into `state.career.roster` at the freshly allocated `rosterId`, adds to the academy club's `ClubState.squad`, bumps `state.career.nextRosterId`. Wage + length come from the persona generator (fixed £20k rookie + 2-year). |
| `FOREIGN_IMPORT_ARRIVED` | 5-10 per rollover in `careerRollover.computeRollover`, persona via `generatePersona` | Inserts the unsigned persona into `state.career.roster`, appends to `state.career.freeAgents`, bumps `nextRosterId`. The next signing window's AI bid passes / user `signFreeAgent` flow consumes them. |

## UI events

The game engine emits eight `game:*` events through `src/utils/eventBus.ts`. UI modules subscribe and re-render; the game engine never imports any UI module.

| Event | Payload | Subscribers |
|---|---|---|
| `game:initialized` | `{ state: GameState }` | `FixtureListScreen` (initial render after `newSeason` / `fromSave`) |
| `game:fixtureRecorded` | `{ result: FixtureResult; state: GameState }` | `FixtureListScreen`, `RoundResultsScreen`, `HubScreen`, `LeagueTableScreen`, `TeamStatsScreen`, `PlayerStatsScreen`, `InboxScreen` (re-render as each headless AI fixture resolves; stats screens pick up the fresh per-team / per-player aggregates from `state.league.teamSeasonStats` + `state.career.roster[*].seasonStats`) |
| `game:weekAdvanced` | `{ state: GameState }` | `FixtureListScreen` (calendar header), `HubScreen` (expiring-contracts badge refresh as deals tick into the 6-month window), `LeagueTableScreen` / `TeamStatsScreen` / `PlayerStatsScreen` (re-derive season-position eyebrow), `InboxScreen` |
| `game:bracketSeeded` | `{ state: GameState }` | `HubScreen` + `PlayoffBracketScreen` + `InboxScreen` re-render. Fires once after the final R18 fixture is recorded (via `seedPlayoffBracket`). The Hub shows playoff fixture cards and the "Play Semi-Final" CTA; no flags set in `main.ts`. |
| `game:playoffsUpdated` | `{ state: GameState }` | `HubScreen` + `PlayoffBracketScreen` + `InboxScreen` re-render. Fires after every `PLAYOFF_RESULT_RECORDED` (player or AI) so the bracket UI shows the cascade fill in. |
| `game:seasonComplete` | `{ state: GameState }` | Fires after the League Final resolves. No flags set in `main.ts` — `runPlayoffWeek()` reads `playoff.championTeamId` directly to determine when to enter `runEndOfSeasonChain()`. |
| `game:trainingApplied` | `{ state: GameState }` | `TrainingScreen` (triggers the post-training results display after `applyTrainingBlock` completes); `AchievementEngine` (evaluates post-training achievement predicates). Fired once at the end of `GameCoordinator.applyTrainingBlock` after all per-player `PLAYER_TRAINED` events have been applied. |
| `game:seasonRolledOver` | `{ state: GameState }` | `HubScreen`, `FixtureListScreen`, `LeagueTableScreen` re-render with the new season's state (new fixtures, zeroed standings, updated season label). Fired at the end of `GameCoordinator.rollSeason()` after all `SEASON_ROLLED_OVER`-group events are applied, so state is fully consistent when subscribers read it. |

## Career: roster + identity model

Three load-bearing distinctions:

- **`Player.rosterId` is the persistent identity** (globally unique, allocated once by `rosterSeeder`). **`Player.id` remains the matchday slot 1-23** — every match-engine event variant, `RatingEngine`, `StaminaSystem` etc. continue to read it as a slot. Season-scope `SeasonEvent` variants carry `rosterId`; match-scope `MatchEvent` variants carry `id`. Don't conflate them.
- **The matchday `Team` is built fresh per fixture from the roster**, not loaded from JSON. `rosterTeamBuilder.buildTeamFromRoster(state, teamJson)` resolves `ClubState.squad` rosterIds → `Player` records (current `baseStats` reflecting accumulated aging), assigns slot ids 1-N, threads `rosterId` through on each `RawPlayer`. `MatchCoordinator.initPlayer` re-attaches it.
- **No spawn-time stat transform.** The team JSONs carry final, play-ready `baseStats` (authored in `docs/team-data.md`); `main.ts` loads them straight through on the JSON ingest path. The roster carries those `baseStats` verbatim; aging mutates the roster's `baseStats` in place via `PLAYER_AGED`. A v5+ save bypasses the seeder entirely and restores the saved (already-aged) roster on load.

## Determinism + RNG

A fourth seeded `mulberry32` stream `rngTransfer` (`src/utils/rng.ts`, constant `0x27D4EB2F`, reset by `setCareerSeed(seed)` on `newSeason` / `fromSave`) services all career-scope randomness — contract seeding, stat-development noise, retirement rolls, renewal offer wages, signing-window offer wages (cached on `state.career.market.offers` so subsequent renders + sign calls don't re-advance the stream), persona generation (name + nationality + position + dob + 12 baseStats per persona). Stays isolated from `rng` / `rngForm` / `pickRandom` so career mutations cannot perturb match outcomes; per-fixture seed derivation cannot perturb career-scope outcomes.

`(playerTeamId, rootSeed)` plus the player's series of results produces an identical final league table + roster `baseStats` + retirement list on every run, across multiple seasons. Verified by `scripts/checkSeasonDeterminism.ts` — runs three full seasons with `rollSeason()` between each, drives the international-break blocks (`beginInternationalBreak` + `runInternationalBreakBlock` at rounds 6 / 11 — training + Prem Cup), exercises both the renewal and signing windows (AI-only, no user decisions) between each pair, snapshots per-season standings + results hash + the full SeasonEvent stream + the renewal + signing offer hashes + the Prem Cup pools/fixtures/bracket + both European competitions (pools, fixture results, knockout cascade + champion) + post-window free-agents pool + final-state roster baseStats + seasonsCompleted, asserts byte-equal SHA-256 on a second run. A **third run** exercises the save/load contract: after the season-2 → season-3 rollover, the coordinator is serialised via `toSavePayload()`, JSON round-tripped, rebuilt via `GameCoordinator.fromSave`, and season 3 finishes on the restored coordinator — its hash must match the uninterrupted run (this is what enforces the `careerRngOffset` load/reload determinism claim). Season snapshots are frozen by value at capture time (live references would alias across the coordinator swap). `npm run verify` runs both the match-level harness (2 seeds × 2 pairings) and the career-level harness; both must pass before commit.

## Contracts + cap (Phases 2 + 3)

Every persistent roster Player carries a `PlayerContract { clubId, expiresOn, annualWage, isMarquee }` plus a `reputation: number` (0–100). Seeded once at roster creation via `contractSeeder.seedContractFields`, which keys two `rngTransfer` calls per player (length, wage-noise) so the same root seed produces identical contracts.

**Wage formula.** Piecewise-linear interpolation from `WAGE_BY_RATING` (anchored £30k @ rating 60 up to £560k @ rating 96 — capped here so ordinary stars compress into the £350-550k band; marquee-tier £600k+ wages are only reached via the excluded marquee slot) × `POSITION_SCARCITY` (10s, 9s, hookers and props bumped 1.10–1.20×) × `WAGE_NOISE` (uniform [0.88, 1.12]), rounded to the nearest £5k. Tuning in `src/engine/balance/transfers.ts`.

**Length + expiry.** Age-banded via `CONTRACT_LENGTH` — five bands tuned for realism: under-23 + 23-26 skew heavily to 3-year deals (5% / 25% / 70%), 27-29 balanced (15% / 40% / 45%), 30-32 tapers shorter (40% / 45% / 15%), 33+ almost exclusively 1-year (80% / 20% / 0%). Picked from `rngTransfer` via `contractSeeder::pickLength` and returned alongside the synthesized contract as `lengthYears`, so renewal / signing / poach / retention call sites read the value directly instead of re-deriving it from date arithmetic (the prior `yearsBetween(currentExpiry, freshExpiry)` was off-by-one because both ends anchored against the same season-end). Expiry = 30 June of (`seasonStartYear` + `lengthYears`).

**Marquees.** One per club, hand-authored via a `Marquee: yes.` annotation on the star player's bullet in `docs/team-data.md`. The annotation translates (via `scripts/generateTeamJsons.mjs`) into a `contract: { isMarquee: true }` partial override in the JSON, which `contractSeeder` honours by copying through. Reputation gets a `+8` bump for marquees.

**Effective cap.** Headline `SENIOR_CAP = £6.4M` + `EFFECTIVE_CAP_CREDITS = £1.4M` (sum of `CAP_CREDITS.homeGrownPool` £600k + `epsPool` £400k + `injuryPool` £400k) = £7.8M. Modelled flat per-club in v1 — every club enjoys the full credit pool without per-player HG/EPS tagging. Brings seeded squads inside their effective cap; tightens the upper wage anchors in lockstep so ordinary stars no longer demand marquee-tier wages outside the marquee slot.

**UI surface.** `src/ui/ContractsScreen.ts` (Hub → Contracts tile) is a sortable squad list with wage / expiry / OVR / age / marquee badge. Interactive as of Phase 3:
- **Marquee toggle**: tap the star column on any row. Going through `MARQUEE_DESIGNATED` so the previous marquee on the same club has their flag cleared automatically.
- **Cap pill**: 3-state colour-coded against the effective cap — `ok` (≤ 95%, green), `tight` (95–100%, amber), `over` (red, with the `CAP` label highlighted). Cap = Σ non-marquee wages; the marquee slot is genuinely cap-excluded.

Expiring-within-`EXPIRING_CONTRACT_WINDOW_MONTHS`-months rows get an "Expiring" chip — a passive signal heading into the renewal window. The same threshold (6 months, in `src/engine/balance/transfers.ts`) drives the red `.notification-badge` count on the Hub's Contracts tile (`HubScreen.countExpiringContracts`). Pre-agreed Reg 7 leavers (in `state.career.pendingMoves` with `toClubId !== userClubId`) are excluded from the badge count — there's nothing to act on for them.

## Club wage budgets (Phase 9)

Each club has its own `salaryBudget` (on `ClubState`) — the owner-set ceiling on cap-relevant wages, distinct from the league-wide effective cap. The cap (£7.8m) sits above as an absolute ceiling no club can exceed; the budget bites first. Seeded from `CLUB_SALARY_BUDGETS_2025_26` in `src/engine/balance/transfers.ts` (real-world reporting; Newcastle £4.15m at the bottom, Bath £7.75m at the top).

**Seeded wages consume the full budget.** After `contractSeeder` synthesises each player's rating-driven wage, `rosterSeeder::normalizeClubWagesToBudget` uniformly scales every club's non-marquee wages so their sum equals the club's `salaryBudget` exactly (rounding residual folded into the top earner). This preserves the relative wage structure but removes the free headroom an authored squad would otherwise have against a higher budget — so a full 2025/26 roster lands on budget with zero slack, and the user can't sign free agents (Quick Start or off-season) without selling or releasing first. Marquee wages are excluded (they sit outside the budget, same as `clubBudgetUsage` / the cap). Pure and RNG-free — runs after contract seeding so it never perturbs the `rngTransfer` stream.

**Hard constraint.** `TransferCoordinator.signFreeAgent` and `preAgreePoach` reject the move when it would push `clubBudgetUsage(state, clubId) + offer.annualWage` above `club.salaryBudget`. The UI mirrors this — both `TransferMarketScreen`'s sign / pre-agree buttons and the budget pill flip to `over` before the engine-side block fires. Marquee wages stay excluded from budget accounting (same rule as cap), so a marquee designation never breaches the budget.

**Year-on-year adjustment.** `budgetPlanner.computeBudgetEvents(state)` returns the SeasonEvent stream for the upcoming season — fired by `GameCoordinator.prepareBudgetsForNextSeason()` at the start of the off-season chain (after EndOfSeason, before Renewals). Formula:

```
nextBudget = clamp(
  prevBudget
    + (5.5 − finalLeaguePosition) × BUDGET_VALUES.positionDelta       // ±£100k/position
    + (finalist     ? BUDGET_VALUES.finalistBonus  :
       semiFinalist ? BUDGET_VALUES.semiFinalBonus : 0)               // +£150k finalist / +£100k SF exit
    + (champion     ? BUDGET_VALUES.championBonus  : 0),              // +£200k (on top of finalistBonus)
  BUDGET_VALUES.floor (year ≥ 2),                                     // £5.4m
  SENIOR_CAP + EFFECTIVE_CAP_CREDITS,                                 // £7.8m
)
```

Rounded to the nearest £50k for clean display. `BudgetReason[]` chips on `CLUB_BUDGET_SET` carry the position number, SF / champion flags, and floor / cap-applied markers so the reveal screen can render the breakdown without re-deriving from standings.

**Takeovers.** A `CLUB_TAKEOVER` event lifts a single club's `salaryBudget` by `TAKEOVER_VALUES.boostAmount` (£1m), clamped at the effective cap, and adds the clubId to `state.career.takeoverHistory` so each club can only be taken over once. Two pathways:
- **Hardcoded year-2 (Newcastle Red Bull).** Fires deterministically at the year-1 → year-2 rollover. Flavor `'red_bull'`. With the £5.4m floor + £1m boost, Newcastle lands at £6.4m for 2026/27.
- **Random year-3+.** Each club not already in `takeoverHistory` rolls `rngTransfer(1, 100) <= TAKEOVER_VALUES.randomChancePct` (4%). Independent per club, stable alpha-by-clubId iteration so the rngTransfer sequence is reproducible. Multiple takeovers in a single off-season are possible but rare (expected ~0.4/year). Flavor `'investor'`.

**AI behaviour.** `aiTransferDirector`'s decision paths (`decideAIOffers`, `decideAIBids`, `decideAIFinalSignings`) all target `club.salaryBudget × RENEWAL.aiTargetCapUtilisation` (or `AI_SIGNING_POLICY.capTarget` for signings/poaches). Big spenders like Bath continue to fill toward £7.8m; budget-constrained clubs like Newcastle stay well under and shop accordingly.

**UI surface.**
- `BudgetRevealScreen` — "Owner's Budget" card. Two entry points: (1) at the start of Squad Builder mode showing the year-1 seeded budget (no delta / reasons), (2) between EndOfSeason and Renewals each year showing the new budget + delta chip (+/−£Xm) + reason chips ("Finished 4th", "Reached the semi-finals", "League champions", "League minimum applied"). Reads `clubBudgetUsage` to surface "headroom for signings" inline.
- `TakeoverRevealScreen` — Fires after BudgetReveal when one or more `CLUB_TAKEOVER` events landed this rollover. Player's own club gets a hero card with flavour blurb ("Newcastle Falcons taken over by Red Bull"); other clubs render as a "Around the league" list below.
- Existing pills on `ContractsScreen`, `RenewalsScreen`, `TransferMarketScreen` now compare against `club.salaryBudget` instead of the league-wide effective cap. The `CAP` label is relabelled `BUDGET` in those three locations.

## End-of-season renewals (Phase 4)

A renewal window opens between `EndOfSeasonScreen`'s Continue and the rollover. Architecture:

1. **`GameCoordinator.openRenewalWindow()`** — emits `MARKET_OPENED` with `expiringRosterIds` (every Player whose `contract.expiresOn` ≤ 30 Jun of the just-completed season's end year) and `offers` (one `TransferOffer` per expiring player league-wide, generated by `aiTransferDirector.generateRenewalOffers`). Each offer's wage is `contractSeeder.seedContractFields(player, ...).annualWage × (1 - loyaltyDiscount)`, rounded to £5k; length is re-derived from current age. `rngTransfer` advances in stable rosterId-ascending order. Idempotent — no-op if there are no expiring contracts or if a window is already open. Skipping the screen entirely when there are no expiring contracts is the caller's responsibility (it reads `state.career.market` after the call).
2. **`RenewalsScreen`** — user toggles Renew/Release per row on their own club's offers. Default is Renew. Each renew row's wage is tap-to-negotiate (the wage modal); the chosen wage feeds the projected-cap pill and a per-offer `wages` map. Default = asking; lowballing saves cap but risks the player walking.
3. **`GameCoordinator.closeRenewalWindow(userDecisions, userWages)`** — one event-batched call resolves every pending offer in stable list order:
   - User decisions for the player's club override the AI default for those offers; `userWages` carries any negotiated figure per offer ID.
   - `aiTransferDirector.decideAIOffers(state, clubId)` (pure / RNG-free greedy) generates the AI default for every other club: marquees always renew, players under `aiReleaseRatingFloor` always release, the rest renew in OVR-desc order until the cap target (`max(SENIOR_CAP × aiTargetCapUtilisation, preWindowCap)`) is hit. Over-cap clubs use their pre-window cap as the ceiling so they don't shed their entire expiring cohort in one window.
   - Accepted offers fire `OFFER_RESPONDED(accept=true)` then `CONTRACT_EXTENDED` (at the negotiated wage). Rejected offers fire `OFFER_RESPONDED(accept=false, reason)` then `CONTRACT_TERMINATED(reason='expired')` — the player moves to `state.career.freeAgents`. A user 'renew' below asking is rolled via `renewalAcceptProbability` + `rngTransfer` (`reason='wage'` on a failed roll); at/above asking accepts with no roll. AI renewals never roll.
   - Finally fires `MARKET_CLOSED`, clearing `state.career.market`.
4. **`rollSeason()`** runs next (unchanged Phase 1 path), then `RolloverScreen`.

Determinism: `openRenewalWindow` consumes `rngTransfer` via `contractSeeder` during offer generation; `decideAIOffers` is fully deterministic from the offer inputs + state. The only other `rngTransfer` draw in `closeRenewalWindow` is the user-lowball roll, which fires solely when `userWages[id] < asking` is supplied — so the 3-season `checkSeasonDeterminism` harness (AI-only, `closeRenewalWindow()` with no wages) takes zero such rolls and stays byte-identical.

Tuning constants live in `RENEWAL` (`src/engine/balance/transfers.ts`): `loyaltyDiscount` (current club discount on demanded wage), `aiTargetCapUtilisation` (under-cap clubs aim for this fraction of effective cap), `aiReleaseRatingFloor` (below this OVR, expiring players are at risk regardless of cap headroom).

## Competitive signings (Phases 5 + 6 + 10)

After the renewal window closes, the signing window opens. Multi-round competitive bidding — every Make Offer + AI bid pass creates `TransferBid`s that resolve by appeal score (squad OVR + position need + ambition + loyalty), not first-come-first-served. The window loops until the user clicks Finish.

**Bid layer.** `MarketState.bids: TransferBid[]` (v15+) carries every bid in the active window — pending, won, lost, or withdrawn. `TransferBid.kind` discriminates `'free_agent'` / `'poach'` / `'retention'`. The cached `offer.annualWage` is the player's **asking wage**; each `TransferBid` carries its own `annualWage` (the bidder's negotiated offer — see "Salary negotiation" below), so both club appeal AND wage decide the winner.

**Per-round flow** — one Submit press in the TransferMarketScreen:

1. **User submits offers.** `submitBid(rosterId, offeredWage?)` adds a `TransferBid` for the user's club (kind inferred from FA pool vs poach eligibility; `offeredWage` defaults to the asking wage, set via the wage-offer modal). Hard budget gate uses the **offered** wage; pending bid wages count toward `clubBudgetUsage`. Withdraw → `BID_WITHDRAWN`, wage refunded.
2. **AI bid pass.** `decideAIBids(state, humanClubId)` walks non-human clubs in alpha order, each picks its top remaining targets (score = `overall + position-need × 10`, OVR ≥ `aiReleaseRatingFloor`, budget-headroom-gated). Each bid's wage is a deterministic premium over asking via `aiBidWage(asking, ovr, need, headroom)` (RNG-free — `+aiPremiumBase` + `aiPremiumPerNeed × need` + up to `aiPremiumRatingScale` for a top rating, capped at `aiPremiumMaxRatio = 1.30`, headroom-clamped, never below asking) so AI clubs out-bid lowballs. Per-round re-evaluation: if a club lost their preferred player to a rival last round, this round they bid on the next-best.
3. **AI auto-retention pass.** `decideAIRetentions(state, humanClubId)` walks every AI club whose own final-year player is under poach attack. Retention wage = the player's cached poach `offer.annualWage × (1 - loyaltyDiscount)` — derived from the SAME offer the resolver uses as the retention asking baseline (so a default retention is wage-neutral) and RNG-free (no `seedContractFields` call). Headroom-gated against the retaining club's own budget. (As of v1.11b the user's own players ARE in the poach pool — `openSigningWindow` no longer excludes them — so `RetentionDecisionScreen` is reachable: the user retains via the wage modal or lets them pre-agree to leave. The user's club is still skipped by `decideAIRetentions` — they decide for themselves on the screen.)
4. **User retention prompt** *(if any of the user's players is being poached)*. The `RetentionDecisionScreen` lists at-risk players with a per-row Retain toggle. `submitRetentionBid(rosterId)` adds a retention `TransferBid` for the user's club; budget gate uses `(newWage - oldWage)` as the delta since the retention replaces (not stacks on) the existing wage.
5. **Resolution.** `signingResolver.resolveSigningRound(state)` walks rosterIds in ascending order; for each player with ≥1 pending bid, computes `appealScore(state, bid, player) + wageSatisfaction(bid.annualWage, askFor(bid))` for each bidder, picks the highest, fires `BID_RESOLVED` per bid + the appropriate contract event for the winner (`CONTRACT_SIGNED` / `PRE_AGREEMENT_SIGNED` / `CONTRACT_EXTENDED`). Ties break by lower `clubId`. `askFor` is the offer wage for FA/poach bids and `offer × (1 - loyaltyDiscount)` for retention bids (so the loyalty discount the retention wage already carries isn't double-counted against the appeal). **Reservation gate:** if a FA/poach winning bid's wage is below `askingWage × WAGE_NEGOTIATION.reservationFloorRatio` (0.80) the player holds out — every bid is marked lost, no contract fires, and `SigningOutcome.heldOut` is set (rendered as a "Held out — wage too low" row). Retention winners are exempt (a current-club lowball loses the appeal contest to the poacher rather than triggering a holdout, and exemption avoids a false holdout from offer-vs-retention wage noise).
6. **Results screen.** `SigningResultsScreen` shows the user's outcomes — new signings, missed-out (lost-to-X), retained, lost-to-rival, players-let-go.
7. **Loop or finish.** Continue from results returns to `TransferMarketScreen` if the user still has budget headroom AND viable candidates (`hasViableSigningOptions()` is true); otherwise auto-advances to `closeSigningWindow()`.

**Appeal scoring** (`signingResolver.appealScore`):

```
appeal(club, player) =
    squadAvgOvr              × ovrWeight       (~65-80 → 65-80 pts)
  + positionShortage         × needWeight      (0-3 → 0-15 pts)
  + (5.5 - weightedPosition) × ambitionWeight  (±9 pts)
  + (isCurrentClub ? loyaltyBonus : 0)          (+8 pts)
```

`appealScore` stays **pure club appeal** — wage is a separate, deliberately decoupled term so the function never depends on market state (it's called from early-renewal too, where no market is open). Each decision site adds `wageSatisfaction(bid.annualWage, askingWage)` on top.

**Salary negotiation** (`signingResolver.wageSatisfaction` + `WAGE_NEGOTIATION` in `balance/transfers.ts`). The offered wage is weighed against the asking wage:

```
ratio = offered / asking
ratio ≥ 1 → min(slopeOver  × (ratio-1),  maxBonus)   // +40/ratio, cap +12
ratio < 1 → max(slopeUnder × (ratio-1), -maxPenalty)  // -60/ratio, cap -24
```

So +10% ≈ +4, +20% ≈ +8, +30%+ → +12 (capped); −10% ≈ −6, −25% ≈ −15, −40%+ → −24. A ~20% overpay can swing a contest decided by ≤ ~8 squad-OVR points, but not a large quality gap. Off-season is fully deterministic (the term + the reservation gate, no RNG). Mid-season FA and user renewals fold the same term into `appealScore` before the probability map (below). `aiBidWage` (step 2) is the AI's deterministic counter — it bids above asking so the user can't win every contest with a £5k overpay.

`weightedPosition` (`signingResolver.weightedLeaguePosition`) is a **2/3 + 1/3 weighted average** of the two most recent seasons' final league positions — recent season weighted 2/3, older 1/3. Season sources in recency order:

| Archive depth | Recent (2/3) | Older (1/3) |
|---|---|---|
| 0 in-game seasons | 2024-25 historical | 2023-24 historical |
| 1 in-game season | archived S1 | 2024-25 historical |
| 2+ in-game seasons | last archived | penultimate archived |

Historical positions stored in `HISTORICAL_POSITIONS` (`balance/transfers.ts`). Falls back to 5.5 (mid-table) only for clubs absent from all sources.

Constants in `balance/transfers.ts::APPEAL_WEIGHTS`. Squad OVR is the dominant signal — strong clubs win contested bids by default, but a desperate need at a mid-table club outweighs a small OVR edge, and the player's current club gets a loyalty edge on retention bids.

**Closing the window.** `closeSigningWindow()` runs one final AI bid + auto-retention + resolution pass so AI clubs that never had a chance to bid in any round still get to fill their squads, then flips offer statuses (accepted iff the rosterId left `freeAgents` / landed on `pendingMoves`) and fires `MARKET_CLOSED`. The bids array is reset at the next `MARKET_OPENED`.

**`rollSeason()`** runs next, processing `TRANSFER_ACTIVATED` events for every pending move before aging / retirement.

Determinism: every asking wage flows through cached offers seeded once at `openSigningWindow`; the AI bid passes read those cached terms and apply `aiBidWage` (a closed-form, RNG-free premium — it must never call `seedContractFields`/`rngTransfer`, since `decideAIBids` consumes zero RNG draws and any new draw would perturb the whole downstream career stream). Appeal scoring + the wage term + the reservation gate are all deterministic (no RNG). The 3-season `checkSeasonDeterminism` harness exercises a user-bid round + a Finish-pass per season and hashes the resolved outcomes.

## Mid-season free-agent signings

Free agents aren't contractually restricted, so the user can sign them at any point during the season — Hub → Transfers opens an interactive signings market. Separate lifecycle from the off-season window; no AI competition (free agents are looking for work, not playing one club off against another).

**Starter FA pool.** `GameCoordinator.newSeason` seeds `STARTER_FA_POOL.count` free agents (default 12-18) via `personaGenerator.generatePersona`, applied as `FOREIGN_IMPORT_ARRIVED` events. This runs once per new game (Quick Start AND Squad Builder); fromSave skips it since the saved career already carries whatever pool has accumulated. Without this seed, a fresh Quick Start save has zero free agents on the books until the first end-of-season cycle, and Hub → Transfers would land on an empty-state screen. The Squad Builder flow then layers `unwindPreSeasonTransfers` on top, growing the pool with the curated 2025-26 inbound transfers.

**Lifecycle** (`TransferCoordinator`):

- `openMidseasonSigningWindow()` — builds `TransferOffer[]` from `state.career.freeAgents` minus any rosterIds on `state.career.midseasonRejections` cooldown, plus league-wide Reg 7 candidates (final-12-month contracts, pending pre-agreements excluded). Reg 7 offers are seeded with the RNG-free `estimateMarketWage`; FA offers go through `signingTermsFor` → `seedContractFields`, consuming 2 `rngTransfer` draws per free agent — determinism survives because the window is user-triggered and `careerRngOffset` is snapshot at save time (the `boostPlayerMorale` precedent). Fires `MARKET_OPENED({ phase: 'signings-midseason', ... })`. Idempotent on a market that's already open. Both pools empty → no-op, the navigation handler still routes to TransferMarketScreen which falls through to its empty-state render with a Continue button back to the Hub.
- `closeMidseasonSigningWindow()` — fires `MARKET_CLOSED`. No AI pass — mid-season has no competing bidders, so any user bids that didn't get submitted just vanish with the market.
- `runMidseasonSigning(): SigningOutcome[]` — walks the user's pending bids rosterId-ascending. For each: roll a `rngTransfer()` against the appeal-based acceptance probability. Accept → `BID_RESOLVED({ won })` + `CONTRACT_SIGNED`. Decline → `BID_RESOLVED({ lost })` + `MIDSEASON_OFFER_REJECTED({ weekUntilClear: currentWeek + 1 })`. Returns `SigningOutcome[]` for `SigningResultsScreen`.

**Acceptance probability** (`src/game/midseasonSigningResolver.ts::midseasonAcceptanceProbability(state, bid, player, askingWage)`). Pure function over the same `appealScore` the off-season uses, plus the wage term:

```
score = appealScore(state, bid, player) + wageSatisfaction(bid.annualWage, askingWage)
t = clamp01((score − appealFloor) / (appealCeiling − appealFloor))
probability = acceptanceFloor + t × (acceptanceCeiling − acceptanceFloor)
```

So a higher offer lifts the score and the acceptance chance; a lowball lowers it. Tuned via `balance/transfers.ts::MIDSEASON_SIGNING`. Default range: a weak club has at least a 30% chance with any FA; even a top club caps at 90% (no FA is a sure thing). The four constants (`acceptanceFloor`, `acceptanceCeiling`, `appealFloor`, `appealCeiling`) can be dialled independently. `acceptanceLabel(probability)` buckets the result into Likely / Uncertain / Unlikely for the wage-modal read.

**Cooldown**. `state.career.midseasonRejections: Record<rosterId, weekUntilClear>`. A declined player is locked until `state.calendar.week` reaches the stored value. WEEK_ADVANCED prunes aged-out entries; SEASON_ROLLED_OVER clears the whole map (the FA pool reshuffles, so per-rosterId locks become stale). The UI renders cooldowned rows with a disabled "Not interested" chip in the action column.

**Navigation**. `main.ts::goTransfersMidseason` — open → show TransferMarket (mode `'signings-midseason'`) → Submit → resolve + close + SigningResults → Hub. Finish closes the market without submitting. `continueGame` resumption: if the loaded save has `state.career.market.phase === 'signings-midseason'`, route straight back to `goTransfersMidseason` (the `openMidseasonSigningWindow` no-op preserves the existing market).

**Determinism**. Mid-season signings consume `rngTransfer` (one roll per submitted bid in rosterId-ascending order). The match + season determinism harnesses don't exercise mid-season signings — they remain off-season-only — so adding this surface left both hashes unchanged.

**Out of scope (v1).** AI clubs don't sign free agents mid-season — keeps the FA pool stable enough for the user to plan around. Mid-season Reg 7 / cross-Prem poaching stays deliberately closed (final-12-month rules are off-season-only). Mid-season marquee re-designation is handled via the existing Contracts screen toggle.

## Mid-season early contract renewal

Reached inline from the Hub's **Contracts** tile — the same screen the expiring-contract alert routes to. Each expiring own-squad player's tap-to-expand panel carries an **Offer Renewal** button. Unlike every other market flow this is **not** a window: no `MARKET_OPENED`, no screen lifecycle, no AI competition. One click = one offer.

**Flow.** `ContractsScreen`'s button calls back into `main.ts`, which calls `gameEngine.offerEarlyRenewal(rosterId)` then `saveGame(...)` so a re-signing survives a closed tab. The method (`TransferCoordinator.offerEarlyRenewal`) returns an `EarlyRenewalResult` (`accepted` / `declined` / `ineligible`); the screen toasts the outcome and re-renders.

**Eligibility.** Player must be on the user's squad, inside the rolling `EXPIRING_CONTRACT_WINDOW_MONTHS` window (the shared `isContractExpiringSoon` helper in `age.ts` — same predicate the "Expiring" tag uses, so the button and the badge never disagree), and not on cooldown. No active market window may be open.

**Terms.** The asking wage is the **RNG-free** `estimateMarketWage(ovr, pos) × (1 - RENEWAL.loyaltyDiscount)` (noise-free wage curve). Both `ContractsScreen` (modal anchor + acceptance chip) AND `offerEarlyRenewal(rosterId, offeredWage?)` (the accept-threshold passed to `renewalAcceptProbability`) use this same figure, so the chip the user sees is a faithful predictor — using the noisy `retentionTermsFor` wage as the engine threshold would diverge from the estimate by up to the `WAGE_NOISE` spread and silently turn an at-asking default into a lowball. `retentionTermsFor` is still called for the contract length + expiry only. The user negotiates an `offeredWage` (default = asking); the applied `CONTRACT_EXTENDED.newAnnualWage` is the chosen wage.

**Budget.** Net gate: `clubBudgetUsage − currentWage + newWage ≤ salaryBudget` (the renewal replaces the existing wage). Marquee wages sit outside the budget and skip the check.

**Acceptance.** `renewalAcceptProbability(state, bid, player, askingWage, offeredWage)` — `midseasonAcceptanceProbability` (with the wage term) clamped: an offer at/above asking is near-certain (`renewalLoyaltyFloorProb = 0.97`), a lowball never below `renewalUnderpayFloorProb = 0.05`. The own-club loyalty bonus in `appealScore` applies via the synthetic `kind: 'retention'` bid — a star at a struggling club can still decline, and paying over asking locks them in. A `rngTransfer(1, 1000)/1000` roll below the probability fires `CONTRACT_EXTENDED` (at the offered wage); otherwise `MIDSEASON_OFFER_REJECTED` writes a cooldown of `calendar.week + RENEWAL.earlyRenewalCooldownWeeks` (4 rounds) onto `state.career.midseasonRejections`, pruned by `WEEK_ADVANCED`. The same `renewalAcceptProbability` drives the **end-of-season** RenewalsScreen lowballs: a user 'renew' below asking is rolled in `closeRenewalWindow(userDecisions, userWages)` (reject → `CONTRACT_TERMINATED('expired')` → free agent); at/above asking stays a certain accept with no roll, so the harness (no user wages) is byte-identical.

**Determinism / save.** Consumes `rngTransfer` draws (wage seed + acceptance roll) but is user-only — the harness never calls it, so `verify` is unaffected. No new `SeasonEvent` variant and no SAVE_VERSION bump (reuses `CONTRACT_EXTENDED`, `MIDSEASON_OFFER_REJECTED`, and the existing `midseasonRejections` map). AI clubs get no voluntary early renewals in v1 — they still renew at season's end and defend mid-deal poaches.

## Mid-season poaching of the user's players (v1.11b)

Rival AI clubs approach the user's final-year players during the season; a successful approach is a **pre-agreement** (the player finishes the season, leaves at the next rollover via `TRANSFER_ACTIVATED`), matching real Reg 7 rules and the off-season poach semantics.

**Lifecycle** (`TransferCoordinator`, new `MarketState.phase: 'poach-midseason'`):

- `openMidseasonPoachWindow()` — self-gates on cadence (`calendar.week % MIDSEASON_POACH.cadenceRounds === 0`, default every 4 rounds; `calendar.week` is the upcoming round, so this fires after rounds 3/7/11/15 — but R6/R11 are international breaks at different weeks, so no collision) and on `assessAIPoachThreats` (≥1 rival with appetite + budget). Seeds one poach `TransferOffer` per at-risk user player (`fromClubId` = the user's club, wage = RNG-free `estimateMarketWage`, length = `MIDSEASON_POACH.lengthYears`), opens the market, then submits the AI poach bids via `decideAIBids` (RNG-free `aiBidWage`). If no rival actually bid, closes the window immediately (no real approach).
- `closeMidseasonPoachWindow(): SigningOutcome[]` — `resolveSigningRound` (the user's retention bids, if any, compete with the poach bids by appeal) → poach winners fire `PRE_AGREEMENT_SIGNED`, retained players fire `CONTRACT_EXTENDED` — then `MARKET_CLOSED`. Returns outcomes for `SigningResultsScreen`.

**Orchestration** is **live-only** in `main.ts` (`maybeRunMidseasonPoach` slotted into the post-match chain after the training step, guarded off the playoff / season-end paths). The headless determinism harness drives `recordPlayerMatchResult` directly, never `main.ts`, so it never opens this window. **The whole flow is RNG-free** (offers via `estimateMarketWage`, AI bids via `aiBidWage`, resolution via the deterministic appeal contest), so even though the harness doesn't cover it, it cannot perturb the `rngTransfer` career stream — `verify` is byte-identical. `RetentionDecisionScreen` (shared with the off-season) lets the user retain via the wage modal (offer-derived asking) or let players go; `continueGame` resumes an open `poach-midseason` market straight back to the decision.

**Cross-cutting guards:** a pre-agreed player (`pendingMoves`) is excluded from `expiringRosterIds` (no double-handling in the end-of-season renewal window) and from `assessAIPoachThreats` (not re-poached). No new `SeasonEvent` variant and no SAVE_VERSION bump — additive `MarketState.phase` value, reuses `MARKET_OPENED` / `BID_SUBMITTED` / `PRE_AGREEMENT_SIGNED` / `CONTRACT_EXTENDED` / `MARKET_CLOSED`. Tuning: `MIDSEASON_POACH` (`balance/transfers.ts`).

## Generated supply (Phase 7)

`src/game/personaGenerator.ts::generatePersona(seed, calendarDate)` produces a deterministic `Player` from `rngTransfer`:

- **Nationality** — biased by `NATIONALITY_BY_CLUB` for academy grads (3/6 slots English, sprinkle of overseas), uniform across all 10 pools for foreign imports.
- **Name** — from `NAME_POOLS[nationality]` (English, Welsh, Scottish, Irish, French, South Africa, NZ, Australia, Fiji, Argentina; ~15-20 first + last names each).
- **Position** — uniform across the 12 generic positions.
- **DOB** — anchored to season-open year ± `ageBand`, with month/day randomised so birthdays are spread across the calendar.
- **Stats** — `targetOverall + N(0, ±12)` clamped 1-99 for each of the 12 baseStats.
- **Wage** — £20k fixed for academy (RPA rookie rate); imports use `WAGE_BY_RATING × POSITION_SCARCITY` rounded to £5k.
- **Length** — 2-year default for both.

Fired during `careerRollover.computeRollover` after retirement / aging passes, in stable iteration order so `rngTransfer` consumption is reproducible:

- `ACADEMY_GRADUATED` — 2-4 per club, ageBand 18-20, ratingBand 55-75.
- `FOREIGN_IMPORT_ARRIVED` — 5-10 single batch, ageBand 23-30, ratingBand 65-88. Lands in `freeAgents`; the next signing window consumes them.

Per-rollover roster growth ~32 players. Sustains the league population indefinitely against aging + retirement attrition.

## Statistics surface (League sub-menu)

Hub → League opens `LeagueMenuScreen` (`src/ui/LeagueMenuScreen.ts`) — a three-tile sub-menu that branches into the existing standings view plus two analytics screens added in v2.184a.

- **`LeagueTableScreen`** — standings + form view. Rows are clickable (since v2.180a) and open `TeamInfoScreen` for the tapped club via `goTeamInfoMidSeason(team, goLeagueTable)` in `main.ts`. Built from the live career roster + calendar date, so the squad list reflects current signings / aging / injuries (unlike the frozen-JSON Team Selector entry).
- **`TeamStatsScreen`** (`src/ui/TeamStatsScreen.ts`) — sortable per-team aggregates grouped into category chips (Attack / Defence / Kicking / Set Piece / Possession / Discipline). Each category renders a focused 3-5 column table over all 10 clubs. Default sort is descending on the headline column; clicking any column header re-sorts. Row click opens `TeamInfoScreen` with `goTeamStats` as the back target. Data flow: pure read from `state.league.teamSeasonStats` via `seasonLeaderboards.teamSeasonStat / teamPossessionPct / teamTerritoryPct`; derived percentages (tackle %, lineout %, scrum %, m/kick, pts per 22m entry) computed inline.
- **`PlayerStatsScreen`** (`src/ui/PlayerStatsScreen.ts`) — top-10 leaderboards across 10 categories (Tries, Carries, Metres, Line Breaks, Tackles, Turnovers, Kick Metres, Goal Kicking, Avg Rating, Yellow Cards). Category chips swap the visible list. Goal Kicking and Avg Rating both gate on `SEASON_AWARDS.mvpMinAppearances = 5` so a 1-app player can't shoot to the top; Goal Kicking additionally requires ≥5 attempts. Row click opens `TeamInfoScreen` for that player's club with `goPlayerStats` as the back target. Data flow: pure read via `seasonLeaderboards.playerLeaderboard(key, limit)` for the 9 counted categories + `leaderboardAvgRating(state, minApps, limit)` for the rating category; goal-kicking has its own inline reducer over `state.career.roster` since it surfaces a derived ratio.

Both stats screens re-render on `game:fixtureRecorded` + `game:weekAdvanced` + `game:initialized`, the same triggers used by `LeagueTableScreen`. Zero engine work was needed to ship this surface — all data is already accumulated post-fixture into `PlayerSeasonStats` + `TeamSeasonStats`. **Known gap (carried over):** the engine doesn't split goal-kicks by kind (conversion / penalty / drop) at the player level — `PlayerSeasonStats.conversions / penaltiesScored / dropGoals` remain reserved-but-zero. The Player Stats screen labels the Goal Kicking category as "Kicks made / attempted" rather than "Conversion %" to surface this honestly.

## Player profiles

Per-player detail screen reached by tapping any player name across the in-season surfaces (live as of v2.192a).

- **Click surface.** Player names render as `.player-link` (`src/ui/components/playerLink.ts` — `playerLinkHtml(name, rosterId)` + `wirePlayerLinks(root, onClick)`). Eight surfaces wired in v1: `TeamInfoScreen` (mid-season squad rows), `ContractsScreen`, `SquadManagementScreen`, `PlayerStatsScreen` leaderboards, `TransferMarketScreen` (FA + Reg 7), `RenewalsScreen`, `RetentionDecisionScreen`, `SigningResultsScreen`. Each surface threads an `onPlayerClick(rosterId)` from `main.ts` that routes through `goPlayerProfile(rosterId, onBack)`. The `onBack` callback is screen-specific so the profile's back arrow returns to wherever the user came from — mirrors the `goTeamInfoMidSeason(team, onBack)` origin-aware pattern from v2.180a. Defer surfaces (different lifecycle, follow-up): in-match `StatsPanel`, `CommentaryFeed`, `MatchResultScreen` ratings, `PreMatchScreen` lineup.
- **Screen.** `PlayerProfileScreen` (`src/ui/PlayerProfileScreen.ts`). Layout: header (name, position chip, age, nationality, club crest + name, big OVR badge) → identity row (contract expiry, annual wage, condition, reputation, optional injury chip) → attributes block (12-axis SVG hex radar + grouped attribute bars — Physical / Skill / Mental columns, position-irrelevant stats greyed out per `IRRELEVANT_STATS[position]`) → current-season counters (only rendered when `appearances > 0`) → Career History table.
- **Career History.** One row per past archived season from `state.career.archive[*].playerSeasonHistory[rosterId]`. Columns: Season / Club at the time (crest + short name) / Apps / Tries / Avg Rating. Plus the current season's live tally as an "In progress" pinned top-row when `appearances > 0`. Pre-v19 archive entries omit the map; the profile renders an em-dash row for those legacy seasons. Players with no recorded appearances in any archived season + no current-season apps get the "First season — history will appear after the first match" empty state.
- **Data source.** Pure reads from `state.career.roster[rosterId]` + `state.career.archive[*].playerSeasonHistory[rosterId]` + `state.career.clubs[*].squad` (for the current-club lookup). No engine extension beyond the new archive snapshot — current OVR through `playerOverall(baseStats, position)` from `RatingEngine`; age through `getAge(dob, calendar.date)`.
- **Snapshot pipeline.** `careerRollover.computeRollover` calls `snapshotPlayerHistory(state)` before `SEASON_ROLLED_OVER` fires. Iterates `state.career.roster` rosterId-ascending, skipping players with `appearances === 0`. Captures `contract.clubId` at the moment of the snapshot — so a player who moves clubs in subsequent seasons still shows the right crest on each historical row. The new payload field flows through `applySeasonEvent` (`SEASON_ROLLED_OVER` apply branch) and is restored via `CAREER_ARCHIVE_RESTORED` on load.
- **Live refresh.** Subscribes to `game:fixtureRecorded` + `game:weekAdvanced` + `game:initialized` so an in-progress current-season tally updates while the screen is open. No `game:seasonRolledOver` subscription — opening the profile post-rollover already re-runs `render()` via `showPlayerProfile`.

## Injuries

Persistent contact injuries on the career roster, in-match-triggered and decremented round-by-round until recovery. Match-engine internals (the in-match `cards.injured` bucket, the per-tackle roll, the shared forced-sub flow) live in `docs/match-engine.md` § Injuries. Season-scope mechanics:

- **State**: `Player.injury?: { kind, severity, weeksRemaining, injuredOn, isRecurrence }` on the career-roster Player (absent ⇔ fit).
- **Severity roll**: `rollNewInjuryEvents(state, snapshots)` (`src/game/injuryEffects.ts`) reads `snapshot.injuryKind` (surfaced by `snapshotMatch`) and rolls severity + weeks via `rngTransfer`. Walks snapshots rosterId-ascending so the career-stream consumption is stable. Shared by the match tick, playoff tick, and cup sims.
- **Recovery tick**: `tickInjuryEvents(state, gapStartIso?)` (`src/game/injuryEffects.ts`) runs at the start of `recordPlayerMatchResult` (after the re-entry guard, before any new fixture is recorded). Pure RNG-free walk over `state.career.roster`; emits `INJURY_TICK_ADVANCED` for every injured player and `PLAYER_RECOVERED` for any whose counter hits zero. It's looped `upcomingGap(state).weeks` times — the number of whole weeks between the player's previous and upcoming match (`src/game/trainingCalendar.ts`), so a long international window (≈8 weeks across the Six Nations break) heals proportionally more than a normal 1-week turnaround. A 6-day and 8-day gap both round to one week. Order: tick × N → record fixtures → roll new injuries → `WEEK_ADVANCED`.
- **Persistence**: injuries survive saves (v9+) and season rollovers (a 26-week ACL in May continues counting down through summer). `careerRollover` doesn't touch the injury field; `SEASON_ROLLED_OVER` resets `seasonStats` but not `injury`.
- **Roster build / squad selection**: split by side.
  - **AI side** (silent fixtures in `GameCoordinator.recordPlayerMatchResult`, AI opponent in `PreMatchScreen` + live human match): `buildAutoSelectedTeamFromRoster` (`src/game/rosterTeamBuilder.ts`) routes through `selectBestMatchdaySquad` (`src/game/autoSelect.ts`) every match week. The 23 are re-derived from the current roster by best-OVR-per-position using `SLOT_SPECS` — primary slot first (e.g. Lock at 4 / 5 / 19), then fallback chain (Back Row covers Flanker / Number 8; Utility Back covers any back slot). Ensures AI teams always field their strongest available 23 and the matchday lineup reflects the roster evolving across seasons. Falls back to `buildTeamFromRoster` if the club has fewer than 23 fit players.
  - **Human side** (`PreMatchScreen`, `SquadManagementScreen`): `buildTeamFromRoster` produces a fit-first partition; `applyMatchdaySquad(team, savedSquad, repair)` then layers the manager's curated lineup on top. When the saved squad contains an injured player, `repairInjuredMatchdaySquad` swaps just those slots for the best same-position replacement from the wider club roster — fit slots stay locked. PreMatchScreen surfaces a banner naming the players who were forced out; SquadManagementScreen shows the injury badge + rejects swaps that would move an injured player into starters / bench.
- **Calibration**: ~1.87 injuries / match across both teams at `INJURY.basePctPerTackle = 8.0`. Tuning in `src/engine/balance/injuries.ts`; calibration target band is 1.8-2.2.

## Training

A choice between matches: trades off short-term freshness for long-term attribute growth, with team-level forwards / backs focuses driving which stats develop. Sits in the post-match Continue chain between LeagueTable and the TrainingResults screen; the Hub's Training tile re-enters the same screen in mid-week mode for editing next round's plan without applying it.

**Week-at-a-time blocks.** The gap until the player's next match is rarely exactly 7 days — normal turnarounds run 6-9 days (Fri/Sat/Sun kick-offs) and the Autumn Nations / Six Nations breaks span 3-8 weeks. The post-match screen renders one card per *training week* of the gap (`upcomingGap(state).weeks = round(days/7)`, min 1), each with its own intensity; forwards/backs focus is shared across the block. The real day count is split into ~7-day periods by `splitGapIntoPeriods` (`src/game/trainingCalendar.ts`). **Condition recovers per day** (so an 8-day gap recovers more than a 6-day one at equal intensity), while development and injury rolls fire once per period (per week). A short single-week turnaround (≤6 days) defaults to Light with an advisory banner; a multi-week break flags the development window. These defaults are advisory only — the manager can override every week.

- **State.** Two surfaces:
  - `state.player.training?: TrainingPlan` — manager's last-saved plan (`intensity` + `forwardsFocus` + `backsFocus`). Undefined ⇔ `TrainingScreen` falls back to `DEFAULT_TRAINING_PLAN` (`'medium' / 'set_piece' / 'tackling'`). Set via `PLAYER_TRAINING_PLAN_SET`; persists across saves.
  - `Player.condition: number` — 0-100, persistent inter-match freshness, on every roster Player. Seeded at 100. Snapshotted from final in-match `fatiguePct` via `PLAYER_CONDITION_UPDATED` after every fixture (live + silent AI + playoffs). Recovers `conditionPerDay × rest days` each training period (lighter intensities recover more per day), so more rest = more freshness.

- **Match-engine integration.** `MatchCoordinator.initPlayer` reads `raw.condition ?? 100` as the starting `fatiguePct`, so a tired starter actually starts the next match tired. Fatigue then decays from that starting point as it did before. Fatigue tiers in `FATIGUE_SCALING` apply from minute zero — a player at 50% condition is already in the "<50%" tier and gets the corresponding stat penalties throughout the match. Bench substitutes who didn't appear in the prior match come on at their accumulated condition (no event emitted for them, so the value just sticks).

- **The four intensities** (`src/engine/balance/training.ts::INTENSITY_EFFECTS`). Condition is **per day**; development, injury, and decay are per training week. v1 baseline:
  - **Rest** — `+13` condition/day, 0% development, 0% injury risk, **0.4% decay chance** per unfocused stat per week.
  - **Light** — `+9` condition/day, 0.8% base development chance per stat per week, 0.1% injury risk per player per week, **0.2% decay chance** per unfocused stat per week.
  - **Medium** — `+6.5` condition/day, 1.8% development chance, 0.4% injury risk, no decay.
  - **High** — `+3` condition/day, 3.2% development chance, 1.2% injury risk, no decay.

- **The eight focuses.** Each focus picks two `PlayerStats` keys to develop faster. `FORWARDS_FOCUS_STATS` and `BACKS_FOCUS_STATS` in `balance/training.ts` hold the mapping:
  - Forwards: `set_piece` → setPiece + strength, `strength` → strength + tackling, `stamina` → stamina + handling, `handling` → handling + composure.
  - Backs: `tackling` → tackling + positioning, `defensive_organisation` → positioning + discipline, `attacking_skills` → pace + agility, `kicking` → kicking + composure.
  - Forwards focus applies to players with `isForward(position) === true`; backs focus to the rest. Split is by `Player.position` (stable across substitutions / matchday curation).

- **Development math** (`src/game/trainingWeek.ts::computeTrainingWeek`). Per non-injured roster player per training week, per stat:
  - `chance = INTENSITY_EFFECTS[intensity].developmentChance × condMult × multiplier × ageMul × proxMul`
  - `multiplier = DEVELOPMENT.focusMultiplier (3.0)` when the stat is one of the player's group focus pair; `DEVELOPMENT.unfocusedMultiplier (0.25)` otherwise. So unfocused stats still drift slowly.
  - `ageMul`: 1.6× under 23, 1.0× at 24-28, 0.6× at 29-32, 0.25× at 33+. Mirrors the `AGE_CURVES` shape — younger players gain more from training.
  - `proxMul = proximityMultiplier(player.potential, playerOverall(player.baseStats, player.position))` — a player near their ceiling barely responds to training; see **Soft potential ceiling** below.
  - `condMult = 1.0 + fitnessStaffRating × FITNESS_MULT_PER_POINT (0.002)` — only non-1.0 for the managed club when a fitness staff member is hired (rating 40 → ×1.08; rating 75 → ×1.15; rating 90 → ×1.18). AI clubs are unaffected. Also scales `conditionDelta`.
  - A successful roll = `+1` to that stat (`TRAINING_STAT_DELTA`). The apply-event branch clamps to `[1, 99]` — same as `PLAYER_AGED`.
  - **Flat decay pass** (after the development pass, rest/light only): per unfocused stat, one `rngTransferRaw()` roll against `INTENSITY_EFFECTS[intensity].decayChance (0.004 rest / 0.002 light)`. A hit writes `−1` to `statDeltas` unless a positive development roll already landed on that stat (gain takes precedence). Focused stats are immune.
  - **High-stat maintenance decay pass** (all intensities): per unfocused stat above `DEVELOPMENT.highStatDecayThreshold (70)`, one `rngTransferRaw()` roll against `(stat − 70)² / DEVELOPMENT.highStatDecayScale (10000)`. e.g. stat 80 → 1.0%, stat 90 → 4.0%, stat 99 → 8.4%. Fires after the flat decay pass; skips any stat that already has a delta. Focused stats immune. This creates rotation pressure at every intensity — the only way to protect a high stat from drift is to focus on it eventually. `PLAYER_TRAINED` apply-event clamps to `[1, 99]` so stats never fall below 1.

- **Training injuries.** Per player per week, after the development pass, one `rngTransfer` roll against `injuryChance = baseRisk × conditionRiskMultiplier(condition)`, where `baseRisk = INTENSITY_EFFECTS[intensity].injuryRisk × (1 − fitnessStaffRating × FITNESS_INJURY_REDUCTION_PER_POINT (0.003))` — fitness staff reduces the base risk fractionally (rating 40 → −12%; rating 75 → −22.5%; rating 90 → −27%) before the condition multiplier is applied. On a hit, `rngTransfer` picks one of `muscle_strain` / `ligament_sprain` / `knock` (no concussions / fractures from training), reads `INJURY_SEVERITY[kind]` for severity weights + week bands, and emits a `PLAYER_INJURED` event — the same shape used by in-match injuries, so the existing `INJURY_TICK_ADVANCED` / `PLAYER_RECOVERED` loop handles recovery identically. `INJURY_RISK.conditionMultiplier (1.5)` means a player at 0% condition is 1.5× more injury-prone than one at 100%; linear interpolation in between.

- **AI training director** (`src/game/aiTrainingDirector.ts`). Two exports:
  - `pickPlan(state, club)` — one `TrainingPlan` per non-user club per week, RNG-driven via `rngTransfer`. Picks an intensity weighted by: squad avg condition below `AI_TRAINING.squadConditionTiredThreshold (70%)` → rest/light bias; recent 3-match win rate below `AI_TRAINING.poorFormWinRateThreshold (0.34)` → high bias; else balanced (medium-biased) baseline. Forwards + backs focuses picked uniformly via two more `rngTransfer` calls; a third throwaway roll keeps the per-club call count fixed at 3 regardless of branch.
  - `suggestPlanForUser(state)` — advisory suggestion for the managed club shown in `TrainingScreen` when an assistant staff member is hired. Returns `null` if no assistant is hired. Computes the optimal intensity deterministically (same condition/form thresholds as `pickPlan`), then applies noise: `sub-optimal probability = ASSISTANT_NOISE_MAX (0.4) × (1 − assistantRating/100)` (rating 40 → 24%; rating 75 → 10%; rating 90 → 4%). Uses an FNV-1a hash of `seasonLabel:week` — not `rngTransfer` — so it cannot shift the career stream. Focuses are also deterministically seeded per-week. Advisory only: never auto-applies, never mutates state.

- **Coordinator surface.** `GameCoordinator.applyTrainingBlock(weeks: TrainingPlan[])` is the **non-break** entry point. It derives the per-period day-spans from `upcomingGap` + `splitGapIntoPeriods`, then runs the shared `runTrainingPeriods` loop (`src/game/trainingRunner.ts`) — per period calls `computeTrainingWeek(state, plan, periodDays)` (pure), applies each returned event through `applySeasonEvent`, and accumulates per-player results (summed stat gains, condition before/after, newly-injured latch). Emits `game:trainingApplied` and returns a `TrainingWeekResult { plan, players, weeks }` for `PostTrainingResultsScreen`. **International breaks go through `beginInternationalBreak` + `runInternationalBreakBlock` instead** (same `runTrainingPeriods` core, wrapped with the cup sims + international call-up/return handling — see § International Duty / `docs/league-cup.md`). Called by `TrainingScreen`'s Continue button (the break path via an injected async `runBlock`). Determinism: clubs iterated id-ascending, roster ids numeric-ascending — same stable order as `careerRollover.computeRollover`. `checkSeasonDeterminism` now drives the break blocks, so training + cup are covered (run1 == run2).

- **`setPlayerTrainingPlan(plan)`** is the lighter-weight setter used by the Hub mid-week edit path. Single `PLAYER_TRAINING_PLAN_SET` event, no execution, no `rngTransfer` consumption — the plan just becomes next round's default.

- **Determinism + RNG**. All training rolls flow through `rngTransfer` (the career stream), independent of match outcomes. Adding a training week to a season does NOT shift match RNG. Stable iteration order (clubs id-ascending → roster ids numeric-ascending → stats in `ALL_STAT_KEYS` insertion order) keeps the call sequence reproducible.

- **Soft potential ceiling.** Every roster Player carries `potential?: number` — a hidden OVR ceiling seeded once at game-start. Seeding: `potential = min(99, OVR + rngTransfer(band.min, band.max))` where the headroom band is age-gated (`POTENTIAL_HEADROOM` in `balance/career.ts`). Young players (≤21) get 8–20 OVR of headroom; experienced players (29+) get 0–3. The ceiling is back-filled conservatively on pre-v21 saves (1–8 OVR headroom, no RNG — see Save format). `proximityMultiplier(potential, ovr)` returns a value on `[0.10, 1.00]` via piecewise-linear interpolation over `PROXIMITY_CURVE` (headroom 0 → 0.10×; headroom ≥15 → 1.00×). This multiplier is applied to growth only, in both training and rollover. Decline fires at full rate regardless — a player near their ceiling still ages. The `potential` field is intentionally hidden from the UI (no display, no editing), mirroring FM's CA/PA philosophy.

- **Why baseStats and not a sharpness layer?** FC Career Mode keeps attribute growth separate from per-week sharpness; FM blends both with hidden CA/PA caps. We chose the FM-style blend — `baseStats` drift directly under training (clamped by the existing `[1, 99]` invariant), with `potential` acting as the soft PA ceiling. The result: a young player on focused training noticeably outgrows their cohort over a season, while older players who've hit their ceiling plateau and begin to decline.

## International Duty

The 2025/26 schedule pauses the Premiership during two international windows — the **Autumn Nations Series** (the 34-day gap between Round 5 and the Round 6 return) and the **Six Nations** (the 57-day gap between Round 10 and the Round 11 return). During each block a slice of every club's squad is away on national duty. Engine + tuning live in `src/game/internationalDutyEngine.ts` (pure builders, RNG via `rngTransfer`) and `src/engine/balance/international.ts`.

- **Windows + nations (`INTERNATIONAL_WINDOWS`).** `autumn` (returnRound 6, 4 Tests, nations England/Wales/Scotland/South Africa — the Springboks tour the north in November) and `six_nations` (returnRound 11, 5 Tests, England/Wales/Scotland — South Africa is absent; Ireland & France select from Irish provinces / the Top 14, not the Prem, so they're not modelled). `isInternationalBreak(state)` returns the window whose `returnRound === calendar.week` (checked at `applyTrainingBlock`, where `calendar.week` is the post-break round).

- **Selection (`selectInternationalSquads`, RNG-free).** For each modelled nation, every rostered player whose `nationality` matches (via `NATION_ALIASES` — accepts the authored country form `"England"` and the persona-generator demonym `"English"`) and clears the nation's `ovrThreshold` is ranked OVR-desc (tie-break rosterId-asc) and capped at `squadCap` (England 28; Wales/Scotland/SA 12). `selectionRank` (1 = first choice) drives the load model.

- **Effects (split across `beginInternationalBreak` + `runInternationalBreakBlock` on `InternationalBreakCoordinator`, `src/game/InternationalBreakCoordinator.ts` — GameCoordinator delegates).** `beginInternationalBreak` (RNG-free, called before the break screens) runs (1) `selectInternationalSquads` → emits `PLAYER_CALLED_UP` per player (sets the transient `internationalDuty` flag; idempotency-guarded against a re-call). `runInternationalBreakBlock` (the training Continue) then runs (2) the League Cup fixtures for the block (MATCH stream — see `docs/league-cup.md`), (3) the normal training block — `computeTrainingWeek` skips `internationalDuty` players exactly like injured ones, so internationals get **no** club condition recovery / development while everyone else recovers over the long gap; (4) `resolveInternationalBreak` → per call-up (rosterId-asc) rolls `minutesPct` from rank, a reduced return `condition` (moderate: full-load ~55-70), an injury chance (`~8-12%` × minutesPct, reusing `INJURY_SEVERITY`), **camp training stat boosts** (see below), and — England heavy-load only — a `restObligation`; emits `PLAYER_TRAINED` (camp gains) then `PLAYER_RETURNED_FROM_DUTY` (+ `PLAYER_INJURED`). Returns an `InternationalBreakSummary` riding on `TrainingWeekResult.international` for the **International Break screen** (`src/ui/InternationalBreakScreen.ts`, the returns recap shown after the League Cup results). The cup + training `rngTransfer` sequence is byte-identical to the old single-method path (cup sims use the independent MATCH stream).

- **Camp training (`resolveInternationalBreak`, inside step 4 above).** International camp is modelled as `spec.tests` high-intensity training sessions (4 for Autumn, 5 for Six Nations), all applied via the career (`rngTransfer`) stream inside the same `resolveInternationalBreak` call before the return event, so gains are deterministic and interleaved with the existing condition/injury rolls. Per session: one `rngTransferRaw()` picks a focus key uniformly from the player's position group (`FORWARDS_FOCUS_STATS` keys for forwards, `BACKS_FOCUS_STATS` keys for backs); then for each of the 12 `PLAYER_STAT_KEYS`: `chance = 0.032 × (3.0 if focused, 0.25 if unfocused) × ageMul × proxMul`. No injury risk (international match injuries already model that); no decay (every skill is exercised at elite level — there is no "unfocused penalty" in camp). Gains accumulate across all sessions into one `campStatDeltas` map, then emit as a single `PLAYER_TRAINED` (conditionDelta: 0) event. The accumulated `statDeltas` and `campTrainingWeeks` count are carried on `InternationalCallUpResult` for display on the International Break screen. Age and proximity multipliers are identical to club training (see § Training), so young players with headroom benefit proportionally more.

- **PGA rest rule (England only).** A player whose `minutesPct ≥ restMinutesThreshold` (0.65) gets `restObligation = { window, eligibleRounds }` — human clubs get the 3-round window `[returnRound, +1, +2]`, AI clubs a single `[returnRound]`. `mustRestThisRound(p, state)` is the forced-exclusion test (human: current round === `max(eligibleRounds)` — last chance; AI: === `min` — auto-rest at the return round); `selectionUnavailableIds(state, clubId)` collects must-rest players **and** Lions stand-down players (below) for the squad builders / repair / display predicates, which treat them exactly like an injured one. Surfaced to the manager via: the International Break screen ("Rest 1 of R6–R8" tag), a persistent inbox / Hub alert (`buildAssistantReport`), a `REST` badge on Squad Management, and on PreMatch — an advisory `REST` badge on the player's lineup row for every round of the window plus a dedicated rest banner on the forced round (separate from the injury banner so the wording is correct). `reconcileRestObligations` runs in `recordPlayerMatchResult` before `WEEK_ADVANCED`: a player who didn't feature in an in-window round (human: not in `state.player.matchdaySquad`; AI: force-rested) has satisfied the rule → `REST_OBLIGATION_RESOLVED`. Obligations also clear en masse at `SEASON_ROLLED_OVER`; `internationalCaps` accumulate across seasons.

- **B&I Lions 2025 (season-open, one-shot).** Models the real post-tour constraint: the 2025 Lions tour ended 2 Aug 2025 and tourists served the PGA's mandatory ~10-week rest, so they were unavailable for the opening two Premiership rounds and returned ~Round 3–4 at reduced match fitness. At the 2025/26 `newSeason` only, `lionsReturnEvents` name-matches the curated `LIONS_2025_TOURISTS` list (`src/data/lions-2025.ts`) against the seeded roster and emits a `LIONS_RETURN_SET` per match, setting `lionsReturnRound = LIONS_RETURN_ROUND` (3) and a per-tourist return condition centred on `LIONS_RETURN_CONDITION` (78) with ±`LIONS_RETURN_CONDITION_NOISE` (10) of `rngTransfer` spread → [68, 88]. RNG-free; gated on `seasonStartYear === 2025` so it never re-fires on rollover (the next Lions tour, 2029, is out of scope). Effects while `calendar.week < lionsReturnRound`: the tourist is **unavailable for selection** (via `lionsUnavailable` → `selectionUnavailableIds`) and **skips club training** (`computeTrainingWeek`, gated `week <= lionsReturnRound` so they're still rusty for their Round-3 return), then rejoins and recovers from Round 4. Surfaced by a season-open inbox / Hub alert (`buildAssistantReport`) listing the returnees, their reduced condition, and the round they're available from, plus the same amber `REST` pill on Squad Management (Lions-specific tooltip) used for the international-duty rest obligation. `lionsReturnRound` is cleared at `SEASON_ROLLED_OVER`.

- **Determinism.** All duty rolls flow through `rngTransfer`, consumed only at break weeks in `runInternationalBreakBlock` (no consumption on non-break weeks), so existing match/season RNG is undisturbed. `checkSeasonDeterminism` now drives the break blocks (`beginInternationalBreak` + `runInternationalBreakBlock` at rounds 6 / 11) and hashes the League Cup state, so the duty + cup paths are covered and stay green (run1 == run2).

## Scouting (Phase 1.1)

The scouting system is a per-target knowledge layer on the managed club: each unscouted outside player shows per-attribute **range bands** that narrow as scouting accuracy rises, rather than exact numbers. Own-squad players are always fully visible (exact values).

**Seam (`src/game/scouting.ts`).** Two pure helpers, no RNG, no state mutation:

- `scoutingBand(trueValue, accuracy)` → `[lo, hi]` — the displayed band for one attribute. At `accuracy === 100`, `lo === hi === trueValue` (exact). Band edges are clamped to `[1, 99]`. Half-width is linearly interpolated from `BAND_CURVE` (`src/engine/balance/scouting.ts`): accuracy 0 → ±10, 50 → ±4, 90 → ±1, 100 → ±0.
- `scoutWeeklyGain(rating)` → number — accuracy points added per week by one scout assigned to a single target. `= SCOUT_ACCURACY_BASE (6) + rating × SCOUT_ACCURACY_PER_POINT (0.3)` — rating 40 → 18 pp/week (~6 weeks to 100%); rating 75 → 28.5 pp/week (~4 weeks to 100%); rating 90 → 33 pp/week (~3 weeks to 100%). Scouts each advance their own assigned target independently (not pooled).

**State.** `ScoutingRecord { accuracy: number; assignedScoutId?: string }` lives on `GameState.player.scouting?: Record<number, ScoutingRecord>` (keyed by rosterId). Absent entry = accuracy 0. Own-squad players have no entry — the UI checks squad membership and always renders exact values.

**Events** (all five mutate `state.player.scouting`; first three are normal-flow; last two are special):
- `PLAYER_SCOUT_ASSIGNED { rosterId; scoutId }` — creates or updates the record (preserves existing accuracy); sets `assignedScoutId`.
- `PLAYER_SCOUT_UNASSIGNED { rosterId }` — removes `assignedScoutId` from the record; accuracy retained.
- `SCOUTING_ACCURACY_ADVANCED { rosterId; delta }` — adds `delta` pp to `accuracy`; clamped to 0–100.
- `PLAYER_SCOUTING_REMOVED { rosterId }` — deletes the whole record; implicitly frees any assigned scout.
- `PLAYER_SCOUTING_RESTORED { scouting: Record<number, ScoutingRecord> }` — bulk-replaces the scouting map; used only by `fromSave`.

**Weekly tick.** `StaffCoordinator.advanceScoutingAccuracy()` (`src/game/StaffCoordinator.ts`) runs after `WEEK_ADVANCED` each round, called from the match-result tick. For every entry with a live `assignedScoutId` pointing at a currently-hired scout, it emits `SCOUTING_ACCURACY_ADVANCED { rosterId, delta: scoutWeeklyGain(scout.rating) }`.

**Coordinator surface.** Staff & scouting live on `StaffCoordinator` (`src/game/StaffCoordinator.ts`); GameCoordinator keeps thin delegating methods (`hireStaff`, `releaseStaff`, `assignScout`, `unassignScout`, `removeScouting`) so screens keep talking to it.
- `assignScout(rosterId, scoutId)` — validates scout is hired + is a scout role; unassigns from any current target, then emits `PLAYER_SCOUT_ASSIGNED`.
- `unassignScout(rosterId)` — emits `PLAYER_SCOUT_UNASSIGNED`.
- `removeScouting(rosterId)` — emits `PLAYER_SCOUTING_REMOVED`; called from ScoutingScreen on card swipe-dismiss.
- `releaseStaff` auto-unassigns any targets a scout was tracking before emitting `STAFF_RELEASED`.

**UI.** `PlayerProfileScreen` checks squad membership to compute `scoutAccuracy: number | null` (null = own squad). Attribute bars show a `lo–hi` range band with a shaded fill from lo to hi when accuracy < 100; exact otherwise. The hex radar uses the midpoint for the polygon shape. A "Scouting" panel (hidden for own-squad players) shows the accuracy bar and lets the manager assign/unassign hired scouts — each scout can only track one target at a time.

**Save/load.** `scouting` is persisted directly in `SavedSeason` (additive optional field; no version bump). Absent on legacy saves → no entries, correct behaviour. `fromSave` restores via `PLAYER_SCOUTING_RESTORED`.

## Press conferences (Phase 1.4)

A post-match press conference overlay fires between the match-result dismissal and the round-results screen whenever a **newsworthy trigger** is active. All logic is pure (no engine RNG; no new `SeasonEvent` variants — it reuses existing ones).

**Trigger detection (`src/game/pressConference.ts · shouldFirePresser`).** Fires when at least one of the following holds after the result is recorded:

| Trigger | Threshold |
|---|---|
| Heavy result | \|margin\| ≥ 15 (win or loss) |
| Board heat | `board.confidence` ≤ 40 |
| Loss run | ≥ 2 losses in last 3 results |
| Win run | 3 wins in last 3 results |

Thresholds live in `src/engine/balance/press.ts` (`PRESS_TRIGGER`).

**Question builder (`buildPresser(state, getTeamName)`).** Selects 2 questions from a priority-ordered bank (`board_heat` → `heavy_loss` → `loss_run` → `heavy_win` → `win_run` → `generic`). Each question has 3 answer options with a `tone`:

| Tone | Board delta | Squad morale delta |
|---|---|---|
| `positive` | +2 | +1 |
| `measured` | 0 | 0 |
| `blunt` | −1 | +2 |

Effect constants in `PRESS_ANSWER_EFFECTS` (`balance/press.ts`).

**Skip penalty.** If the manager skips the conference entirely: `BOARD_CONFIDENCE_ADJUSTED { delta: −2 }` + a stub `MEDIA_STORY_PUBLISHED` ("manager silent after match"). Constant: `PRESS_SKIP_BOARD_PENALTY = −2`.

**Coordinator surface (`GameCoordinator.applyPressEffects(skipped, answers)`, implemented on `BoardCoordinator`).** Called from `main.ts` after the overlay resolves. Aggregates `boardDelta` across both answers and emits one `BOARD_CONFIDENCE_ADJUSTED`; aggregates `moraleDelta` and emits `PLAYER_MORALE_ADJUSTED` for every player in the managed club's squad. No new `SeasonEvent` variants — fully reuses the existing three.

**Save/load.** No state to persist — the press conference has no persistent record. After `applyPressEffects`, `saveGame` runs immediately so the board/morale changes are written.

**UI.** `src/ui/PressConferenceScreen.ts` renders a fullscreen overlay (`#press-conference`) with two stacked question blocks. Each question has 3 answer buttons (label + text + effect hint). "Publish" is enabled when both questions are answered. "Skip press conference" is always available. The overlay is not in `ScreenRouter` — it shows/hides via `classList.toggle('hidden')` directly. CSS: `style/press-conference.css`.

## League Cup

The League Cup runs headless during the two international breaks (the Assistant Manager picks the squad). Two pools of 5, full home-&-away double round-robin split into leg 1 (Autumn block) / leg 2 (Six Nations block), top two per pool → semis → final. Self-contained: drains condition + a featured-player development nudge, but no budget/cap/reputation effect and cup stats stay out of league leaderboards. State lives on `state.league.premCup` (`PremCupState`); the break is orchestrated by `InternationalBreakCoordinator` (`beginInternationalBreak` + `runInternationalBreakBlock`, reached via `GameCoordinator` delegations); scheduling + future-season pool redraw in `src/game/cupScheduler.ts`; tuning in `src/engine/balance/premCup.ts`. **Full breakdown in `docs/league-cup.md`.**

## European Competitions (v2.44b)

Two pan-European club competitions run alongside the Premiership season: the **European Cup** (Champions Cup equivalent, 24 teams) and the **European Shield** (Challenge Cup equivalent, 18 teams). Both are pool-stage → knockout events, played in December and April/May of the following year. The player's team participates in one of them (determined by their Premiership standing from the prior season; in Year 1 all 10 Prem clubs qualify for one of the two competitions via fixed pool seeding).

### State and types

- `GameState.league.europeanCup?: EuropeanCompState | null` — live Cup state (null until seeded).
- `GameState.league.europeanShield?: EuropeanCompState | null` — live Shield state.
- `EuropeanCompState { seasonLabel, competition, pools: EuropeanPool[], fixtures: EuropeanFixture[], knockout: EuropeanKnockout | null, shownRounds?: string[] }` — the single source of truth for a competition's pool standings, fixture list and knockout bracket. `shownRounds` tracks which round screens the player has already stepped through (round keys: `'pool:1'`–`'pool:4'`, `'r16'`, `'qf'`, `'sf'`, `'final'`).
- `EuropeanRoundRef { competition, roundKey, isFinal, label, compLabel }` — returned by `getCurrentEuropeanRound()`; identifies the next unshown round that has all fixtures resolved.
- `EuropeanPool { id, teamIds, standings: TeamStanding[] }` — 6 teams, 4 rounds of fixtures each. Pool standings use the same `TeamStanding` shape as the league table (leaguePoints, bonus points etc.).
- `EuropeanFixture { poolId, round, homeId, awayId, date?, result? }` — each fixture stores its own result once played.
- `EuropeanKnockout { r16, quarterfinals, semifinals, final, championTeamId }` — full bracket. R16 has 8 matches, QF 4, SF 2, Final 1. Seeded from pool positions (top 2 per pool).

### Scheduling

Fixtures are baked for 2025-26 in `src/game/europeanScheduler.ts`:
- **Cup**: 4 pools × 6 teams, 48 pool fixtures (rounds R1–R4 in December, one home+away per opponent), R16 → QF → SF → Final in April/May.
- **Shield**: 3 pools × 6 teams, 36 pool fixtures (same structure).
- Pseudo-round numbers keep fixture seeds distinct from league (200-213 for Cup, 220-233 for Shield).
- `europeanKnockoutDates(seasonStartYear)` returns approximate R16/QF/SF/Final dates (~04-Apr, 11-Apr, 26-Apr, 23-May of the following year).

### Seeding and headless pool simulation

`EuropeanCoordinator.seedEuropeanComps(seasonLabel)` (called from `newSeason()` and `rollSeason()`) emits `EUROPEAN_COMP_SEEDED` for both competitions, initialising `EuropeanCompState` with pools, zeroStandings, and all fixtures.

`runPoolStage(competition)` runs headless for all fixtures **except** the player's own fixtures (identified by `homeId === playerTeamId || awayId === playerTeamId`). Each AI fixture calls `simulateEuropeanFixture(fixture, rootSeed, teamsById)`, which derives a `MatchCoordinator` seed from `deriveFixtureSeed`, runs a silent match, and emits `EUROPEAN_FIXTURE_RECORDED { competition, poolId, round, homeId, awayId, homeScore, awayScore, homeTries, awayTries }`. The reducer updates pool standings via the standard bonus-point logic (4pts win / 2pts draw / 0pts loss + try bonus + losing bonus).

### Calendar gate and playability

After each `WEEK_ADVANCED` event `GameCoordinator.getCurrentEuropeanFixture(): EuropeanFixtureRef | null` scans both competitions for the player's first unplayed fixture whose `date <= calendar.date`. The Hub CTA surfaces this as the priority action (above the league fixture, below pre-season cup and playoffs).

`GameCoordinator.getCurrentEuropeanRound(): EuropeanRoundRef | null` scans both competitions (Cup first, then Shield) for the earliest unshown round where all fixtures for that round are resolved and `date <= calendar.date`. Returns `null` when no such round exists. Pool round keys are `'pool:1'`–`'pool:4'`; knockout round keys are `'r16'`, `'qf'`, `'sf'`, `'final'`.

`GameCoordinator.markEuropeanRoundShown(competition, roundKey)` emits `EUROPEAN_ROUND_SHOWN` to persist the key in `shownRounds`. Called from `main.ts` after the player dismisses the round screen. Autosave fires immediately after.

`EuropeanFixtureRef` is a discriminated union:
```typescript
type EuropeanFixtureRef =
  | { kind: 'pool'; competition: 'europeanCup' | 'europeanShield'; fixture: EuropeanFixture }
  | { kind: 'knockout'; competition: 'europeanCup' | 'europeanShield'; stage: 'r16' | 'quarterfinal' | 'semifinal' | 'final'; match: EuropeanKnockoutMatch };
```

When the player taps "Play European Cup match" the normal PreMatch → Match → MatchResult chain runs. After the result:
- `recordPlayerEuropeanPoolResult(competition, poolId, round, homeId, awayId, homeScore, awayScore, snapshot)` emits `EUROPEAN_FIXTURE_RECORDED`, then accumulates player stats via `collectSeasonEvents(snap, competition)` — stats route to `Player.europeanCupStats` / `Player.europeanShieldStats` (optional per-competition `PlayerSeasonStats` fields added in v2.44b, no SAVE_VERSION bump — additive optional). Condition and injury events are also emitted. If all four pool rounds for the player's pool are now complete, `runKnockoutStage` is called for the full bracket (skipping the player's matches). After the pool stage completes, if the player failed to qualify, `BoardCoordinator.applyEuropeanElimination` is called and an inbox story is published.
- `recordPlayerEuropeanKnockoutResult` is the knockout equivalent. After each KO loss, elimination is applied immediately; after a KO win, if the player progresses to the next round, the next AI round is simulated first (skipping the player's match).

Both methods emit `game:weekAdvanced` (not `game:fixtureRecorded`) to avoid polluting the achievements engine with non-league results; this triggers UI re-renders on all subscribers.

### Knockout simulation

`runKnockoutStage(competition)` is called **only** when `allPoolFixturesDone(competition)` returns true (i.e. all pool fixtures including the player's are done). `runKnockoutRound(competition, stage, skipTeamId?)` simulates all matches in a round, skipping the player's match if present. After seeding from pool standings, R16 → QF → SF → Final simulate in sequence, each advancing the bracket via `EUROPEAN_KNOCKOUT_RECORDED`.

### Player stats routing

`collectSeasonEvents(snap, competition?)` (in `src/game/seasonStatsCollector.ts`) accepts an optional `competition` parameter. When set:
- `PLAYER_SEASON_STATS_ACCUMULATED` events carry `competition`; `applySeasonEvent` routes the delta to `player.europeanCupStats` or `player.europeanShieldStats` (lazy-initialised with `zeroSeasonStats()`).
- `TEAM_SEASON_STATS_ACCUMULATED` events are **skipped** — European team stats are not tracked in league tables.
- `p.recentRatings` is updated for all competitions (European matches affect player form).

### UI screens

`EuropeanCupScreen` (`src/ui/EuropeanCupScreen.ts`) and `EuropeanShieldScreen` (`src/ui/EuropeanShieldScreen.ts`) render pool standings tables, per-pool fixture lists, and the knockout bracket. Both reuse the shared helpers in `src/ui/components/europeanViews.ts` (`euroPoolTableHtml`, `euroFixtureListHtml`, `euroKnockoutHtml`). The screens re-render on `game:weekAdvanced`. They are reached from the Competitions menu.

**European round viewer** (`src/ui/EuropeanRoundScreen.ts`) is shown in the weekly flow whenever a European pool or knockout round completes. It displays all fixtures for that round plus pool standings (pool rounds) or KO result cards (KO rounds), then lets the player tap Continue to return to the weekly flow. The screen is blocking — the weekly flow does not advance until dismissed. `showEuropeanRound(roundRef, onContinue)` / `initEuropeanRoundScreen(getGameEngine, allTeams)` follow the standard in-season screen pattern.

**European Final screen** (`src/ui/EuropeanFinalScreen.ts`) is a celebration/result screen shown after the European final is played, regardless of whether the player participated. It shows the finalists, the score, and crowns the champion. If the player won, `launchConfetti(champColor, 'storm')` fires (200ms delay to let the screen paint). The screen is blocking — the player must dismiss it before the weekly flow continues. `showEuropeanFinal(roundRef, onContinue)` / `initEuropeanFinalScreen(getGameEngine, allTeams)` follow the same pattern.

**Weekly flow integration.** `maybePlayEuropeanFixture(onDone)` in `main.ts` is the entry point. It first checks `getCurrentEuropeanFixture()` (plays match if present), then checks `getCurrentEuropeanRound()` (shows round/final screen if present), then calls `onDone`. Both branches recurse — so a week with both a player match and pending AI-only rounds fully drains before returning to the Hub. After each round screen is dismissed, `markEuropeanRoundShown` and autosave are called.

**Hub CTA.** When no active fixture is pending, the Hub checks `getCurrentEuropeanRound()` and renders a secondary European round CTA (`.hub-euro-round`) below the primary fixture button. This surfaces pending round screens the player hasn't stepped through even when no match is due.

### Board objective and elimination

`BoardCoordinator.seedEuropeanObjective(competition)` sets the board's expected European stage for the season. Called from `GameCoordinator.seedEuropeanObjectiveAndDrawStory()` after seeding comps. Calibration: Shield → always `'participate'`; Cup, Year 1 (no archive) → `boardAmbition` maps `'title'→'semifinal'`, `'playoffs'→'r16'`, others→`'participate'`; Cup, Year 2+ → prior season rank: 1st→`'semifinal'`, 2nd–4th→`'r16'`, 5th–10th→`'participate'`. The objective is persisted on `BoardState.europeanObjective` via `EUROPEAN_OBJECTIVE_SET`.

`BoardCoordinator.applyEuropeanElimination(competition, achievedStage)` applies an immediate board-confidence delta when the player is knocked out. `achievedStage` is the highest round they reached (`'participate'` = pool stage exit). Delta (`BOARD_EURO_ELIMINATION_DELTA` in `balance/board.ts`): +3 if achieved ≥ objective, −5 if behind by 1 stage, −10 if behind by 2+ stages. Triggers `evaluateJobSecurity()` so a dire European exit can issue a warning or sack mid-season.

`EuropeanObjective` type: `'participate' | 'r16' | 'quarterfinal' | 'semifinal' | 'final' | 'win'`.

### Media stories

`src/game/media/europeanStories.ts` exports two builders:
- `buildEuropeanDrawStory(competition, compLabel, seasonLabel, clubName, poolId, opponents)` — published at season start when pools are drawn; body names the opponents, `deepLink` points to the competition screen.
- `buildEuropeanEliminationStory(competition, compLabel, clubName, stage, round)` — published when the player is eliminated; explains the exit stage and round.

### Mutation seam additions

| Event | Key fields | Effect |
|---|---|---|
| `EUROPEAN_COMP_SEEDED` | `competition, seasonLabel, pools, fixtures` | Initialises `state.league.europeanCup` or `europeanShield` |
| `EUROPEAN_FIXTURE_RECORDED` | `competition, poolId, round, homeId, awayId, homeScore, awayScore, homeTries, awayTries` | Writes `result` on the matching fixture; updates pool standings |
| `EUROPEAN_KNOCKOUT_SEEDED` | `competition, bracket` | Sets `state.league.{competition}.knockout` |
| `EUROPEAN_KNOCKOUT_RECORDED` | `competition, stage, matchIndex, homeScore, awayScore, homeTries, awayTries` | Writes result on the bracket match; advances the bracket |
| `EUROPEAN_OBJECTIVE_SET` | `objective` | Sets `state.player.board.europeanObjective` |
| `EUROPEAN_ROUND_SHOWN` | `competition, roundKey` | Appends `roundKey` to `state.league[competition].shownRounds` |

## Playoffs

A three-match knockout follows the 18-round League regular season: two semi-finals (1 v 4 and 2 v 3) the week after R18, and a Final at Twickenham one week later. Top 4 by `sortStandings` (league points → diff → for, identical to the league-table sort).

- **State.** Lives on `state.league.playoffs` as `PlayoffState { semifinals: [PlayoffMatch, PlayoffMatch], final: PlayoffMatch, championTeamId: string | null }`. Null while the regular season is still in flight; seeded by `PLAYOFF_BRACKET_SEEDED` when the last R18 fixture is recorded; cleared by `SEASON_ROLLED_OVER` after the champion has been archived. The reducer for `PLAYOFF_BRACKET_SEEDED` is idempotent — a second call is a no-op.
- **Reducer cascade.** `PLAYOFF_RESULT_RECORDED { kind, ... }` writes the result on the named match. When a SF resolves, the reducer also populates the final's matching slot from the SF winner (SF1 → home, SF2 → away). When the Final resolves, `championTeamId` is set. Ties fall to the home side — no extra time / golden point in v1.
- **Coordinator surface.** Implemented on `PlayoffCoordinator` (`src/game/PlayoffCoordinator.ts`); GameCoordinator keeps thin public delegations + calls `this.playoffs.allRegularFixturesPlayed()`/`seedPlayoffBracket()` from the match tick. `seedPlayoffBracket()` (auto-called from `recordPlayerMatchResult` after the last R18 fixture; idempotent). `getPlayerPlayoffMatch()` returns the player's next unresolved playoff match or null. `recordPlayerPlayoffResult(kind, homeScore, awayScore, snapshot)` is the playoff analogue of `recordPlayerMatchResult` — same idempotency guard + injury tick + per-player + per-team stats accumulation, but writes through `PLAYOFF_RESULT_RECORDED` so league standings are untouched. `simulatePendingPlayoffMatches(stage)` runs (silent) every pending AI-vs-AI match in the named stage (`'sf'` or `'final'`).
- **Determinism.** Each playoff match derives its match seed from `deriveFixtureSeed(rootSeed, pseudoRound, homeId, awayId)` with pseudo-round 19 for SFs and 20 for the Final — same hashing pipeline as regular fixtures, so a given root seed produces an identical bracket every run. Verified by `scripts/checkSeasonDeterminism.ts` which now walks each season through to the Final.
- **Neutral venue.** The Final is played at Twickenham — `state.engine.neutralVenue` is set by `MatchCoordinator` (constructor opt) when the kind is `'final'`. `homeEdge(state, mod)` short-circuits to `{ attack: 0, defend: 0 }` so the `HOME_ADVANTAGE` carry / breakdown bump zeroes out. `teamStats.homeAdvantagePts(neutral)` mirrors this for the PreMatch SPREAD tile so prediction and simulation agree.
- **UI surface.** Playoffs run as rounds 19 (SFs) and 20 (Final) inside the normal weekly cycle. `main.ts::runPlayoffWeek()` is the async entry point: if the player has a match in the current stage it launches PreMatch → Match → MatchResult → `recordPlayerPlayoffResult` + `advancePlayoffWeekScouting`; then it silent-sims any remaining AI matches in the stage via `simulatePendingPlayoffMatches`; then shows `PlayoffBracketScreen` as the round-results view. After SFs the bracket Continue goes to Training → Hub; after the Final it goes straight to Hub (no training, season over). Hub's CTA reads "Play Semi-Final" / "Play Final" (player has match) or "Continue" (no match / champion decided); "Continue" on a crowned Hub enters `runEndOfSeasonChain`. Non-qualified or eliminated managers skip straight to the auto-sim + bracket round-results path with no pre/post-match screens. `PlayoffBracketScreen` (`src/ui/PlayoffBracketScreen.ts`) renders two SF cards + a centred Final card + a champion banner once crowned.
- **Per-player + per-team stats.** Playoff matches contribute to `Player.seasonStats` and `state.league.teamSeasonStats` exactly like regular matches — `seasonStatsCollector.snapshotMatch` runs over every playoff fixture (live + silent). Top scorer / MVP / leaderboards in `EndOfSeasonScreen` include playoff contributions.
- **Archive.** `ArchivedSeason.championTeamId` records the winner. Older archives (pre-v13 saves with no playoff history) load as `null`.

## Save format

`SAVE_VERSION = 2`. `SavedGame` in `src/ui/SaveManager.ts` is a thin serialiser for `GameCoordinator.toSavePayload()`. **`ACCEPTED_VERSIONS` must always include `SAVE_VERSION`** — currently `new Set([2])`; omitting the current version silently rejects every freshly-written save on the next load. Bump `SAVE_VERSION` and update `ACCEPTED_VERSIONS` whenever the serialised shape changes in a way that would corrupt an existing save on load. New additive-only optional fields don't require a bump.

**Forward compatibility.** `parseSavedGame` routes a **lower, known** version through an ordered `MIGRATIONS` pipeline (`MIGRATIONS[N]` upgrades vN→v(N+1); `MIGRATIONS[1]` regenerates corrupt year-2+ fixture lists) so a `SAVE_VERSION` bump carries existing careers forward instead of orphaning them. A future/garbage version (or a gap in the migration chain) is rejected cleanly. `ACCEPTED_VERSIONS` is the post-migration belt-and-braces check. `scripts/checkSaveSchema.ts` (run by `npm run verify`) boots a fresh deterministic career, serialises it, and fails if the `SavedSeason`/`SavedCareer` key set or `SAVE_VERSION` drifts from its pinned snapshot — so a shape change can't ship without a conscious bump (or a snapshot update for an additive-optional field).

**Robustness.** Autosave (`saveGame`) returns a boolean and is silent on success; `main.ts`'s `autosave()` helper emits a debounced `save:failed` warning toast on a failed write (storage full). A `visibilitychange`/`pagehide` flush persists the live game when the app is backgrounded (iOS WKWebView can kill it), and a global `error`/`unhandledrejection` net attempts an emergency save before warning the player — complementing the match-tick `engine:error` → CrashOverlay path.

`SavedSeason.mediaStories?: MediaStory[]` is one such additive field (no bump). Media stories aren't replayable from `results` (they need the per-match snapshot), so `toSavePayload` persists them directly and `fromSave` restores each via `MEDIA_STORY_PUBLISHED`. Absent on pre-media saves → no stories restored, regeneration resumes from the next fixture. See **[media-manager.md](media-manager.md)**.

`SavedSeason.board?: BoardState` is another additive field (no bump). Board confidence isn't replayable from `results` (the per-result delta depends on the human-match context), so `toSavePayload` persists it directly and `fromSave` restores it verbatim via `BOARD_STATE_SEEDED`. Absent on pre-0.1 saves → `fromSave` falls back to a fresh seed (`seedBoardState`).

**Slot storage layout.** Saves live in three fixed, renameable slots —
`rugby-manager-save-{1,2,3}` in `localStorage` — plus an active-slot pointer
`rugby-manager-active-slot`. Each slot envelope is the flat `SavedGame` plus
`slotName` + `savedAt` (a storage concern, **not** a game-schema bump, so
`SAVE_VERSION` is unaffected). Autosave (the ~15 `saveGame` call sites) and the
Home Continue card target the **active** slot via thin wrappers
(`loadSave`/`saveGame`/`clearSave` → `loadSlot`/`saveToSlot`/`clearSlot` of the
active id). The Saves screen (`src/ui/SavesScreen.ts`, reachable from Home and
Settings) manages slots: load (switches active), Save here (manual snapshot into
any slot), rename, delete, **Restore backup**, and export / import. Each slot
also keeps a last-known-good `rugby-manager-save-{id}-bak` copy: `saveToSlot`
rotates the current primary into it **before** overwriting, and
`loadSlot`/`slotInfo` fall back to it when the primary won't parse (corruption
resistance, web included). **Native iCloud backup** lives in
`src/ui/saveBackup.ts` (Capacitor-only, no-op on web): every slot write mirrors
the primary + the rotated `.bak` to the iOS Documents directory
(`saves/slot-{id}.json`, `saves/slot-{id}-bak.json`, included in the device's
iCloud Backup and not OS-evicted), and a capped, time-throttled rolling history
(`saves/slot-{id}/{savedAt}.json`, 8 generations ≥20 min apart) feeds the
Restore-backup picker. `reconcileBackups()` restores from disk at boot when a
slot is missing locally (reinstall / eviction) and **repairs** a corrupt local
primary from the disk `.bak` then the newest parseable history generation;
`listBackups`/`restoreBackup` back the Saves screen's restore UI; `exportSlot` /
`importToSlot` hand a slot's JSON to the iOS Share Sheet / file picker (Blob
download / `<input type=file>` on web). SaveManager has no Capacitor dependency
— the mirrors hook in via `setSlotWriteHook` / `setBakWriteHook`.

**On load** (`GameCoordinator.fromSave`). `src/game/saveMigration.ts` houses two event-payload builders (`buildRosterSeededEvent`, `buildCareerArchiveRestoredEvent`) that normalise a saved career into the `SeasonEvent` payloads replayed by `fromSave` through `applySeasonEvent`. The persisted career state always flows through `CAREER_ARCHIVE_RESTORED` (with optional `freeAgents` / `market` / `pendingMoves` / `teamSeasonStats` / `preSeasonStep` / `playoffs` / `takeoverHistory` / `midseasonRejections` / `activePoachedIds` fields) so every `state.career.*` write stays inside `applySeasonEvent`. The `training` field lives on `state.player`; it's restored via `PLAYER_TRAINING_PLAN_SET` during `fromSave`, mirroring the `PLAYER_TACTICS_SET` / `PLAYER_MATCHDAY_SQUAD_SET` restore path.

## New-game flow: Quick Start vs Squad Builder

`main.ts` routes the user through a Mode Picker after team selection (`src/ui/ModePickerScreen.ts`). The picker has two CTAs:

**Quick Start** — `GameCoordinator.newSeason(teamId, seed, allTeams)` → `saveGame` → pre-season cup block → Hub (R1 upcoming). Authored rosters / contracts / marquees stand exactly as seeded. This is the pre-Phase-8 behaviour.

**Squad Builder** (v2.114a, with Squad Overview added v2.120a) — one-shot pre-season flow at game start only:

```
ModePicker (Squad Builder)
  → newSeason()                                                (seeds roster + contracts as Quick Start does)
  → unwindPreSeasonTransfers(PRE_SEASON_TRANSFERS_2025_26)     (99 names, RNG-free name match, CONTRACT_TERMINATED(reason: 'pre_season_unwind') per hit)
  → setPreSeasonStep('overview') + saveGame
  → SquadOverviewScreen (read-only depth chart)
    [9 position-group sections; each renders 2 × starting-XV slots rows (4 props / 2 hookers / 4 locks / 6 loose forwards / 2 SH / 2 FH / 4 centres / 4 wings / 2 FBs), filled top-OVR-first with "No depth" placeholders for empty slots; amber "thin" flag when squad count < that depth target; right-aligned "TOTAL IN SQUAD" stacked badge shows the full count]
  → openSigningWindow({ skipPoaches: true })                   (market: 99 FA offers, 0 Reg 7 offers)
       │
       ├── market populated
       │     → setPreSeasonStep('signings') + saveGame
       │     → TransferMarketScreen (signings-preseason mode)
       │       [user signs FAs within cap; AI clubs skipped here]
       │     → closeSigningWindow({ skipPoaches: true })
       │         · CONTRACT_SIGNED per AI signing
       │         · MARKET_CLOSED
       │     → repairAIMarquees()                              (MARQUEE_DESIGNATED for any AI club whose authored marquee was unwound; top-wage pick)
       │
       └── (no FA pool) — skip signings, still run repairAIMarquees()
  → setPreSeasonStep('marquee') + saveGame
  → ContractsScreen (marquee-edit mode, showContractsMarqueeEdit)
    [user picks marquee from the post-signings squad; star toggle interactive, Continue CTA]
  → setPreSeasonStep(null) + saveGame
  → pre-season cup block (see below)
  → Hub → Round 1
```

**Save resumption.** `state.career.preSeasonStep` is set before every `saveGame` during the flow. `continueGame` reads it and routes back to the in-flight screen (`runPreSeasonOverview()` for `'overview'`, `runPreSeasonSignings()` for `'signings'`, `runPreSeasonMarquee()` for `'marquee'`, pre-season cup check otherwise). The flag is only ever set between team-selection and Round 1; once the marquee Continue completes the engine clears it. The field is optional — saves without it load with `preSeasonStep === undefined` and proceed to the pre-season cup check.

**Pre-season cup block** — both Quick Start and Squad Builder route through this after the new-game setup completes. Detected by `isPreSeasonCupPending()` (any unresolved leg-0 cup fixture). Screen chain:

```
CupFixturesScreen (pre-season fixtures + direction toggle)
  → TrainingScreen (runs runPreSeasonBlock on Continue — 13-day gap hardcoded)
  → CupResultsScreen (leg-0 results)
  → PostTrainingResultsScreen
  → Hub (R1: Sep 25 upcoming)
```

`continueGame` on reload also checks `isPreSeasonCupPending()` before `isBreakPending()`, so a tab close during the pre-season block resumes correctly.

**Determinism.** Squad Builder consumes an extra signing window's worth of `rngTransfer` (wages for the 99 FAs are seeded via `signingTermsFor`). Quick Start is byte-identical to the pre-Phase-8 behaviour. Both modes are individually deterministic given the same root seed; the existing `npm run verify` harnesses (which test the Quick Start path only) continue to pass unchanged.

The full transfer-system phase summary lives in `docs/transfer-system.md` § "Phase 8 — Squad Builder".

## Post-match / end-of-season flow

The post-match Continue chain in `main.ts`:

```
Match → MatchResult → recordPlayerMatchResult + snapshotMatch + saveGame
                     → RoundResults → LeagueTable (post-match mode) →
                       │
                       ├── (regular season ongoing)
                       │     → TrainingScreen (post-match block: 1 card per week of the gap)
                       │       Continue → applyTrainingBlock(weeks[]) — per period:
                       │         · PLAYER_TRAINING_PLAN_SET (persists default)
                       │         · PLAYER_TRAINED per non-injured player league-wide
                       │         · PLAYER_INJURED per training-injury roll
                       │       → game:trainingApplied → TrainingResults → saveGame → Hub
                       │
                       ├── (last R18 fixture just resolved: bracket seeded, Hub shows SF fixtures)
                       │     → TrainingScreen [eyebrow "Semi-Final" for qualifiers,
                       │         "Playoffs" for non-qualifiers] → TrainingResults → Hub
                       │
                       │     Hub CTA ("Play Semi-Final" / "Continue") → runPlayoffWeek():
                       │       R19 SEMI-FINAL WEEK
                       │       · if player has SF match: PreMatchScreen → TeamTalk
                       │         → Match → MatchResult → recordPlayerPlayoffResult
                       │         → advancePlayoffWeekScouting → simulatePendingPlayoffMatches('sf')
                       │       · else: simulatePendingPlayoffMatches('sf') silently
                       │       → PlayoffBracketScreen (SF results) → TrainingScreen
                       │         [eyebrow "Final"] → TrainingResults → Hub
                       │
                       │     Hub CTA ("Play Final" / "Continue") → runPlayoffWeek():
                       │       R20 FINAL WEEK
                       │       · if player has Final match: PreMatchScreen → TeamTalk
                       │         → Match → MatchResult → recordPlayerPlayoffResult
                       │         → advancePlayoffWeekScouting → simulatePendingPlayoffMatches('final')
                       │       · else: simulatePendingPlayoffMatches('final') silently
                       │       → PlayoffBracketScreen (Final results) → Hub
                       │
                       │     Hub CTA ("Continue") → runPlayoffWeek():
                       │
                       └── (champion crowned: championTeamId set → runEndOfSeasonChain)
                             → EndOfSeasonScreen [recap + champion banner]
                             → prepareBudgetsForNextSeason()                   (Phase 9)
                                  · CLUB_BUDGET_SET per club (performance-derived)
                                  · CLUB_TAKEOVER for Newcastle yr2 or random yr3+
                             → BudgetRevealScreen [owner's budget + delta]
                             → TakeoverRevealScreen (if any takeover fired)
                             → openRenewalWindow()                            (Phase 4)
                                  │
                                  ├── market populated (expiring offers)
                                  │     → RenewalsScreen [user toggles + cap pill]
                                  │     → closeRenewalWindow(decisions)
                                  │         · OFFER_RESPONDED + CONTRACT_EXTENDED
                                  │           or CONTRACT_TERMINATED('expired')
                                  │           per offer, then MARKET_CLOSED
                                  │
                                  └── (no expiring contracts) — skip
                             → openSigningWindow()                            (Phases 5+6)
                                  │
                                  ├── market populated (free agents + Reg 7 candidates)
                                  │     → TransferMarketScreen [Sign / Pre-Agree + cap pill]
                                  │     → closeSigningWindow()
                                  │         · CONTRACT_SIGNED per AI signing
                                  │         · PRE_AGREEMENT_SIGNED per AI poach
                                  │         · MARKET_CLOSED
                                  │
                                  └── (no free agents and no poach candidates) — skip
                             → rollSeason() returns SeasonEvent[]
                                  · TRANSFER_ACTIVATED per pending move        (Phase 6)
                                  · PLAYER_AGED + PLAYER_RETIRED per roster
                                  · ACADEMY_GRADUATED 2-4 per club              (Phase 7)
                                  · FOREIGN_IMPORT_ARRIVED 5-10 single batch    (Phase 7)
                                  · SEASON_ROLLED_OVER
                             → RolloverScreen
                             → Hub (new season)
```

`game:seasonComplete` fires from `recordPlayerMatchResult` after the final round's `WEEK_ADVANCED` when `getCurrentFixture() === null`. `main.ts` latches it; the LeagueTable Continue handler checks and routes accordingly. `rollSeason()` is the one and only caller of `careerRollover.computeRollover` in production; the headless `checkSeasonDeterminism` harness calls it directly between season simulations (and also exercises both `openRenewalWindow` + `closeRenewalWindow` and `openSigningWindow` + `closeSigningWindow` with AI-only decisions).

Save is committed at four points across the off-season: after `openRenewalWindow` (mid-window resume), after `closeRenewalWindow` (captures the renewal decisions), after `closeSigningWindow` (captures signings + pre-agreements), and after `rollSeason` (captures aging / retirements / activated transfers / academy + import intake / new fixtures).

## Assistant's Report / Inbox

A derived briefing surface that surfaces actionable alerts from the current `GameState` without any new state or persistence.

**Model.** `src/game/inbox.ts::buildAssistantReport(state, allTeams)` is a pure function. It walks the roster and league state and returns `InboxItem[]` sorted by `priority` (higher = more important). No `SeasonEvent`, no `SAVE_VERSION` bump, no `GameState` change.

**Message sources (v1):**

| Category | Trigger | `deepLink` |
|---|---|---|
| `medical` | Any squad player with `Player.injury` set | `squad` |
| `medical` | Any squad player still on a 2025 B&I Lions post-tour stand-down (`calendar.week < lionsReturnRound`) — lists returnees, reduced condition, and the round they're available from | `squad` |
| `medical` | Any squad player with `summerTourReturn === true` at week 1 — lists summer-tour returners and their return condition (excluded from pre-season cup; available for league R1 onwards) | `squad` |
| `squad` | Any squad player carrying a `restObligation` (international-duty PGA rest rule) | `squad` |
| `contracts` | Any squad player whose `contract.expiresOn` falls within `EXPIRING_CONTRACT_WINDOW_MONTHS` (6) of today (pre-agreed Reg 7 leavers excluded) | `contracts` |
| `transfers` | Any squad player in `state.career.activePoachedIds` | `transfers` |
| `match` | The next unplayed fixture has `isDerby: true` | `fixtures` |
| `league` | Playoff race clinch or elimination (via `src/game/playoffRace.ts::playoffRaceStatus`) — suppressed while `state.league.playoffs !== null` | `league` |

**Playoff race math.** `playoffRaceStatus(state, teamId)` computes each team's maximum achievable points (`currentPts + MAX_LP_PER_GAME × gamesRemaining`, where `MAX_LP_PER_GAME = 5 = win + tryBonus`). `securedTop4` fires when fewer than 4 opponents can match the player's current points. `securedTop2` fires when fewer than 2 can. `eliminated` fires when ≥ 4 opponents already exceed the player's best-case total.

**Read-set persistence.** `src/ui/inboxRead.ts` maintains a `ReadMap` in `localStorage` under `'rugby-manager-inbox-read'` keyed by `${teamId}:${seed}`. `markRead(key, ids)` runs on every render of `InboxScreen`, so items are marked read the moment the user opens the report. `countUnread(key, items)` drives the badge on the Hub teaser. The read-set survives `clearSave()` (like Game Centre achievements) but is naturally per-save because the key includes the root seed.

**Navigation.** The Hub `#hub-alert-banner` shows the top unread item (subject line + unread count badge). Clicking opens `InboxScreen` (`inbox`). Each `InboxItem` with a `deepLink` has a button (e.g. "Go to Contracts") that navigates directly to the relevant management screen. Items with a `counselAction: { rosterId }` field render a "Speak to Player" button instead; clicking it calls `engine.counselPlayer(rosterId)` and re-renders the inbox synchronously — no navigation required. `InboxScreen` is initialised once in `initInSeasonScreens` and re-renders on `game:initialized`, `game:fixtureRecorded`, `game:weekAdvanced`, `game:bracketSeeded`, and `game:playoffsUpdated`.

**Discipline escalation tiers.** `buildAssistantReport` emits three distinct discipline notification shapes (only one per player per render):

| Condition | Item ID | Priority | Action |
|---|---|---|---|
| `yellowCards >= 2` and no active counsel advice | `disc:{season}:{rid}` | 45 | "Speak to Player" counsel button |
| `yellowCards >= 4` and no active counsel advice | `disc:warn4:{season}:{rid}` | 65 | "Speak to Player" counsel button |
| `suspension.forRound === calendar.week` | `disc:suspended:{season}:{rid}` | 80 | "Go to Squad" deep-link |

Counsel advice is active while `calendar.week <= disciplineAdvice.expiresAfterRound`; once it expires the concern item re-appears and can be renewed.

## Roadmap

All ten transfer-system phases are live on main: 1 (rollover, v2.22a), 2 (read-only contracts, v2.23a), 3 (interactive marquee + cap, v2.36a), 4 (end-of-season renewals, v2.36a), 5 (free-agent signings), 6 (Reg 7 cross-Prem poaching), and 7 (generated player supply — academy + foreign imports) (5/6/7 all v2.43a), 8 (Squad Builder pre-season mode, v2.114a), 9 (club wage budgets + takeovers, v2.142a), 10 (competitive multi-round signing window, v2.144a). Remaining work is refinement, not roadmap: per-player HG/EPS cap tagging (replacing the flat `CAP_CREDITS` pool), reputation drift from silverware, transfer budgets distinct from cap, squad size limits, mid-season transfers / loans / buyouts. See **`docs/transfer-system.md`** § "Open implementation questions" for the running list.

### Future: human-side "Auto-Select" button

`selectBestMatchdaySquad(roster, clubSquadIds)` in `src/game/autoSelect.ts` is the engine. The AI fixture path already uses it every match week. The human UI doesn't expose it yet — the manager always curates their 23 manually (with surgical injury repair filling unavailable slots).

A future "Auto-Select" button on `PreMatchScreen` (or `SquadManagementScreen`) would:

1. Call `selectBestMatchdaySquad(state.career.roster, club.squad)` → returns 23 rosterIds in slot order.
2. Convert to `PlayerRef[]` (lookup `firstName + lastName` from the roster — same shape as `extractMatchdaySquad`).
3. Fire `PLAYER_MATCHDAY_SQUAD_SET { squad }` (existing event — no schema change) so the selection persists.
4. Re-render the lineup grid with the new 23.

## Achievements

`src/achievements/` is a self-contained, engine-independent module. It never touches engine RNG or `GameState` directly — it's a passive bus listener, so determinism is unaffected.

**`AchievementEngine.initAchievementEngine(getState)`** is called once in `initInSeasonScreens()`. It subscribes to the `game:*` bus and evaluates the predicate catalog in `achievementDefs.ts` (`ACHIEVEMENTS`) against live `GameState` on each event. Match predicates read `game:fixtureRecorded` and only fire when `playerSide !== null`. Season / career predicates derive from persisted state (playoffs bracket, `career.seasonsCompleted`, `career.archive`, squad peak OVR via `playerOverall`).

**Persistence.** Unlocks live in `achievementStore.ts` under `localStorage` key `'rugby-manager-achievements'` — app-wide, not per-save (mirrors the `uiPrefs.ts` pattern; survives `clearSave()` and team switch, matching Game Centre's per-account semantics).

**Unlock.** A genuine first unlock calls `showToast('🏆 …')` + `getGameCenter().reportAchievement(gcId, 100)`.

**`GameCenterBridge.ts`** is the cross-platform seam: a no-op bridge on web; a `registerPlugin('GameCenter')`-backed bridge on native. The native side requires adding the `GameCenter` Capacitor plugin under `ios/`, enabling the Game Centre capability in Xcode, and creating one App Store Connect achievement per `gcId`. No JS change needed.

**`AchievementsScreen.ts`** (Hub → Awards → Achievements) renders the catalog grouped by category with locked/unlocked state and an `earned / total` count. On native it surfaces a "View in Game Centre" button.

No new SeasonEvent, no save-format change, no engine refactor — the underlying function already ships as the AI's auto-pick. Drop-in UI work whenever it's prioritised.
