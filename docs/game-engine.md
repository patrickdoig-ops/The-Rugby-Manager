# Game Engine Reference

Source of truth for the season + career engine — the sibling to the match engine. Where the match engine (`src/engine/`) owns a single match's state machine through `applyMatchEvent`, the **game engine** (`src/game/`) owns everything outside that: the calendar / fixtures / results / standings for the live season, the persistent roster carried across seasons, contracts, rollover (aging, retirement, transfer activations, academy + import intake, fixture regen), and the save schema. Its single mutation seam is `applySeasonEvent`, mirroring the architectural pattern of its match-engine sibling.

For match-engine internals (simulation loop, phase resolvers, fatigue, commentary) see `docs/match-engine.md`. For the transfer system roadmap (all seven phases now live; remaining open questions) see `docs/transfer-system.md`.

## Maintaining this doc

After any change to season code, update this file in the same commit. Season code is everything under `src/game/`, plus `src/types/gameState.ts`, `src/ui/SaveManager.ts`, and the career-scope screens (`EndOfSeasonScreen`, `RenewalsScreen`, `TransferMarketScreen`, `RolloverScreen`, `ContractsScreen`, `SquadManagementScreen`).

---

## Architecture

Match-scope writes flow through `applyMatchEvent`; **season-scope writes flow through `applySeasonEvent`** in `src/game/applySeasonEvent.ts`. The game engine owns one `GameState` per session — calendar (`date`, `week`, `seasonLabel`), league (`fixtures`, `results`, `standings`), `player` (teamId + persisted pre-match tactics + matchdaySquad), the root `seed`, and the multi-season `career` block (roster + clubs + archive + freeAgents + market + pendingMoves).

| Module | Responsibility |
|---|---|
| `GameCoordinator.ts` | Public API (`newSeason`, `fromSave`, `getState`, `getCurrentFixture`, `recordPlayerMatchResult`, `seedPlayoffBracket`, `getPlayerPlayoffMatch`, `recordPlayerPlayoffResult`, `simulatePendingPlayoffMatches`, `rollSeason`, `toSavePayload`, plus the market-window methods listed below). Owns the `GameState`. The "tick" of the game engine is a player match completing: `recordPlayerMatchResult` applies the player's score, headlessly simulates the other fixtures of the round, runs `seasonStatsCollector` over each, then advances the week. Once the last R18 fixture is recorded it also seeds the playoff bracket and emits `game:bracketSeeded`; `game:seasonComplete` then fires later, after the League final resolves. |
| `TransferCoordinator.ts` | Off-season market collaborator owned by `GameCoordinator`. Holds the same `GameState` reference; implements `designateMarquee`, `openRenewalWindow`, `closeRenewalWindow`, `openSigningWindow`, `signFreeAgent`, `unsignFreeAgent`, `preAgreePoach`, `cancelPreAgreement`, `closeSigningWindow`. `GameCoordinator` exposes thin delegating methods of the same names so the `getGameEngine: () => GameCoordinator` getter contract (CLAUDE.md § 4) is preserved — screens never see the collaborator directly. All writes flow through `applySeasonEvent`. |
| `applySeasonEvent.ts` | **Single mutation seam.** Reducer over `SeasonEvent` (`src/types/gameState.ts`); see the full variant list in the next section. Same `default: const _: never = event;` exhaustiveness contract as `applyMatchEvent`. |
| `rosterSeeder.ts` | `seedRoster(allTeams, seasonStartYear)` — one-shot at `newSeason` / v4-save migration. Walks every `RawTeamInput`, allocates a globally-unique `rosterId` per player, builds `state.career.roster` + `ClubState[]`. Defers wage/expiry/reputation to `contractSeeder.seedContractFields`. |
| `rosterTeamBuilder.ts` | Two exports — the seam between persistent roster and matchday `Team`. Team identity (color / name / stadium / `suggestedTactics`) comes from the JSON; player data (current `baseStats`, position, dob, contract, `rosterId`) comes from the roster. `buildTeamFromRoster` partitions `club.squad` fit-first then injured-last (used for the human side so `applyMatchdaySquad` can layer the manager's curated lineup on top). `buildAutoSelectedTeamFromRoster` orders the matchday 23 by best-OVR-per-position via `selectBestMatchdaySquad` from `autoSelect.ts` (used for every AI fixture — silent sims in `GameCoordinator.recordPlayerMatchResult` and the AI opponent in `PreMatchScreen` / live human match). |
| `autoSelect.ts` | Pure matchday-squad selection. `SLOT_SPECS` maps each of the 23 jersey slots to a primary `Position` + fallback chain (e.g. slot 6 → Flanker → Back Row; slot 22 → Fly-Half → Utility Back → Centre; bench is 5 forwards / 3 backs). `selectBestMatchdaySquad(roster, clubSquadIds)` greedily picks the highest-OVR fit player per slot, dropping through the fallback chain when no specialist is available (last-resort: any remaining player by OVR; ties broken by lower rosterId). `repairInjuredMatchdaySquad(currentRosterIds, roster, clubSquadIds)` locks fit slots and surgically swaps injured slots for best same-position replacements using the same SLOT_SPECS table. Both are pure, RNG-free, return rosterId arrays in slot order. |
| `seasonStatsCollector.ts` | `snapshotMatch(state)` extracts `{ rosterId, tries, tacklesMade, tacklesAttempted, turnoversWon, yellowCards, redCards, rating }` per player who took the field (rosterId > 0 filter skips non-career test contexts). `collectSeasonEvents(snapshots)` converts to `PLAYER_SEASON_STATS_ACCUMULATED` events. Run by `GameCoordinator.recordPlayerMatchResult` for live + silent fixtures. |
| `careerRollover.ts` | `computeRollover(state, allTeamIds)` — pure module; given current GameState, produces the SeasonEvent stream for a rollover, in this order: (0) `TRANSFER_ACTIVATED` for every pending Reg 7 pre-agreement (stable rosterId-ascending), (1+2) per-roster aging via `AGE_CURVES` + `STAT_NOISE` Gaussian noise + retirement check against `RETIREMENT_CURVE` (growth is scaled by `proximityMultiplier × appearancesMultiplier`; decline fires at full rate regardless), (3) Phase 7 supply — `ACADEMY_GRADUATED` 2-4 per club (stable alpha club id order) + `FOREIGN_IMPORT_ARRIVED` 5-10 single batch, both consuming `generatePersona`, (4) awards (top tries, MVP by avg rating with `mvpMinAppearances` floor) + composite `SEASON_ROLLED_OVER` with regenerated fixtures (Sept-May synthetic weekly dates, skips Nov + Feb). |
| `personaGenerator.ts` | Phase 7 — `generatePersona(seed, calendarDate)` produces a deterministic `Player` from `rngTransfer`: name from `NAME_POOLS` per nationality (English / Welsh / Scottish / Irish / French / South Africa / NZ / Australia / Fiji / Argentina, ~15-20 first + last names each); nationality biased by `NATIONALITY_BY_CLUB` for academy grads, uniform for foreign imports; position uniform across 12 generic positions; dob anchored to season-open year ± `ageBand`; stats `targetOverall + N(0, ±12)` clamped 1-99; wage £20k fixed for academy (RPA rookie rate) or `WAGE_BY_RATING × POSITION_SCARCITY` rounded to £5k for imports; 2-year deal default. |
| `contractSeeder.ts` | `seedContractFields(raw, clubId, seasonStartYear)` — wage = `WAGE_BY_RATING` piecewise-linear × `POSITION_SCARCITY` × `WAGE_NOISE`, rounded to £5k. Length age-banded via `CONTRACT_LENGTH`. Expiry `${seasonStartYear + lengthYears}-06-30`. Reputation = `round(overall × ratingMultiplier) + (marquee ? bonus : 0)`. Honours JSON `Partial<PlayerContract>` overrides (the hand-authored `Marquee: yes.` annotations). Two `rngTransfer` calls per player, order-stable. Also called inside `aiTransferDirector` to derive fresh-market wages for renewals + signings + poach offers. |
| `aiTransferDirector.ts` | Phases 4-6 module. **Renewals (Phase 4)**: `expiringRosterIds(state)`, `generateRenewalOffers(state)` (one offer per expiring player league-wide, wage = market × `1 - loyaltyDiscount`), `decideAIOffers(state, clubId)` (pure / RNG-free greedy: marquee + OVR floor + effective-cap-target sorting against `SENIOR_CAP + EFFECTIVE_CAP_CREDITS`), `expiryAfterYears(state, lengthYears)`. **Signings (Phase 5)**: `decideAISignings(state, humanClubId?)` (greedy by `overall + position-need × 10`, capped at `AI_SIGNINGS_PER_CLUB_LIMIT = 4` per club, `AI_SIGN_CAP_TARGET = 0.92` of effective cap, no OVR floor since the pool is largely sub-70), `signingTermsFor(state, rosterId, clubId)` (user-side pure helper matching what the AI director will compute). **Reg 7 poaching (Phase 6)**: `isPoachEligible(player, currentDate)` (final 12 months of contract), `poachCandidates(state)` (league-wide, marquee + own-club filtered), `decideAIPoaches(state, humanClubId?)` (max 1 per non-human AI club per window, OVR ≥ `aiReleaseRatingFloor`). All consumed by `GameCoordinator`'s window methods. |
| `playerSquad.ts` | Pure helpers: `extractMatchdaySquad` (snapshot the 23-man matchday roster as stable `PlayerRef` name refs) and `applyMatchdaySquad` (inverse — rearrange a `RawTeamInput` so the saved 23 occupy slots 1-23). When called with the optional `repair: { roster, clubSquadIds }` arg, runs the saved squad through `repairInjuredMatchdaySquad` (from `autoSelect.ts`) first — fit slots locked, injured slots surgically swapped for best same-position replacements. Returns the team unchanged when the saved list is empty, the wrong length, or references a player no longer rostered. |
| `fixtures.ts` | Pure double round-robin generator using the standard "circle" method. Used by `careerRollover` for year-2+ fixture regeneration. Year-1 default is the hand-authored `PREMIERSHIP_2025_26` schedule. Player's team is placed at position 0 so its match is always the first pairing per round. |
| `simulateFixture.ts` | Headless wrapper around `MatchCoordinator` with `silent: true` — suppresses every `engine:event` / `engine:stateChange` / `engine:initialized` / `engine:resumed` emit and replaces modal prompts with `high_ball` / `kick_for_goal` defaults. `engine:finished` still fires. Returns `{ homeScore, awayScore, playerSnapshots }` so the caller can route stats through `seasonStatsCollector`. **The match engine and the game engine only meet here.** |
| `leagueTable.ts` | Pure helpers: `sortStandings` (league points → points diff → points for), `findStanding`. |
| `teamStats.ts` | Pure derivations from `FixtureResult[]` + overall ratings: `recentForm` (rolling W/L/D pins padded with null on the left), `headToHead` (W/D/L record from one team's POV across every meeting so far), `matchSpread` (rating-derived handicap, favored side negative). Read by `PreMatchScreen`; no module state, no bus subscriptions. |
| `derive.ts` | `deriveFixtureSeed(rootSeed, round, homeId, awayId)` — hashes the inputs so each headless AI fixture has a stable, derivable seed independent of the round in which it was simulated. |
| `age.ts` | Pure `getAge(dobIso, currentDateIso)` — returns null when `dob` is missing. Plus `parseSeasonStartYear(seasonLabel)` and `seasonOpenIso(year)` helpers used by `contractSeeder`, `careerRollover`, `personaGenerator`, and `aiTransferDirector` to anchor age + expiry calculations to the current calendar. |
| `balance/season.ts` | Season tuning constants — `SEASON_VALUES` (start date, season label, week length, season-open anchor month/day, international skip windows) and `LEAGUE_POINTS` (League 4/2/0 + losing bonus when margin ≤ 7). |
| `balance/career.ts` | Rollover tuning — `AGE_CURVES` per stat (peakAge / growth / decline — growth rates halved vs v1, physical decline steepened, mental decline flattened), `STAT_NOISE` (Gaussian std-dev + clamp), `RETIREMENT_CURVE` (forwards / backs cumulative probabilities), `SEASON_AWARDS.mvpMinAppearances`. Also holds the development-ceiling constants: `POTENTIAL_HEADROOM` (age-banded OVR headroom ranges seeded once at game-start), `PROXIMITY_CURVE` (piecewise-linear headroom→multiplier table, applied to growth only), `APPEARANCES_CURVE` (step function of season appearances applied to rollover growth). Exports `proximityMultiplier(potential, ovr)` and `appearancesMultiplier(apps)` helpers consumed by both `careerRollover` and `trainingWeek`. |
| `balance/transfers.ts` | Contract + market tuning — `SENIOR_CAP` (£6.4M), `CAP_CREDITS` (£600k HG + £400k EPS + £400k injury = £1.4M `EFFECTIVE_CAP_CREDITS` widening effective cap to £7.8M), `WAGE_BY_RATING` anchor table (capped at £560k @ rating 96 so ordinary stars compress into £350-550k band), `POSITION_SCARCITY`, `WAGE_NOISE`, `CONTRACT_LENGTH` age-band weights, `REPUTATION_SEED`, plus the Phase 4 `RENEWAL` block (`loyaltyDiscount`, `aiTargetCapUtilisation`, `aiReleaseRatingFloor`). |

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
| `PLAYER_MATCHDAY_SQUAD_SET` | `PreMatchScreen` Kick Off; `SquadManagementScreen` Save Squad | Persists the matchday 23 as `PlayerRef[]` (firstName + lastName pairs) so squad selection survives mid-match tab close. Both callers round-trip through the same `state.player.matchdaySquad` field. |
| `PRE_SEASON_STEP_SET` | Each step of the Squad Builder pre-season flow (overview → signings → marquee), before `saveGame` | Sets / clears `state.career.preSeasonStep` (`'overview' \| 'signings' \| 'marquee' \| undefined`) so `continueGame` can route back to the in-flight screen after a mid-pre-season tab close. Cleared once the marquee Continue completes; outside Squad Builder the field stays undefined and is omitted from the save payload. |

**Career layer (Phase 1 of the transfer-system roadmap):**

| Variant | When fired | What it does |
|---|---|---|
| `ROSTER_SEEDED` | One-shot at `newSeason` / v4-save migration | Populates `state.career.roster` keyed by `rosterId`, `ClubState[]`, `nextRosterId`. Source data is the JSON-loaded `RawTeamInput[]` post-`applyStarBoost`. |
| `PLAYER_SEASON_STATS_ACCUMULATED` | Per player per fixture (live + silent AI) | Adds the per-match delta to `roster[rosterId].seasonStats`. Drives top-scorer / MVP cards in `EndOfSeasonScreen`. |
| `TEAM_SEASON_STATS_ACCUMULATED` | Two events per fixture (home + away side) in `recordPlayerMatchResult` and every silent AI fixture | Adds the per-match delta to `state.league.teamSeasonStats[teamId]` — possession / territory / set-piece win rates / attack / defence / kicking / discipline buckets keyed by teamId. Read by `seasonLeaderboards.teamLeaderboard` for per-club season aggregates. Lazy-initialised: the map starts empty and gets a `zeroTeamSeasonStats()` entry on first write per team. |
| `PLAYER_AGED` | Per player per rollover | Applies `Partial<PlayerStats>` deltas to `baseStats` (clamped 1-99). Driven by `AGE_CURVES` + `STAT_NOISE` Gaussian noise from `rngTransfer`. Growth (pre-peak) is scaled by `proximityMultiplier × appearancesMultiplier`; decline fires at full rate regardless. |
| `PLAYER_RETIRED` | Per retiring player per rollover | Removes `rosterId` from `ClubState.squad`. The `Player` record stays in `state.career.roster` for archive references. |
| `PLAYER_INJURED` | Per in-match injury at match teardown (player + every AI fixture) | Writes `state.career.roster[rosterId].injury` with kind / severity / weeksRemaining / injuredOn / isRecurrence. Severity + weeks rolled via `rngTransfer` from `INJURY_SEVERITY[kind]`. Snapshots are walked rosterId-ascending so the RNG call order is stable. |
| `INJURY_TICK_ADVANCED` | Per injured roster player at the start of `recordPlayerMatchResult` (before the round's new injuries are added) | Decrements `roster[rosterId].injury.weeksRemaining` by one (floor 0). No RNG. |
| `PLAYER_RECOVERED` | When an injury's `weeksRemaining` would hit 0 after the tick | Clears `roster[rosterId].injury`. Fired in the same pass as the final `INJURY_TICK_ADVANCED`. |
| `CAREER_ARCHIVE_RESTORED` | `fromSave` only | Restores `seasonsCompleted`, `archive`, plus the v7+ optional `freeAgents` + `market` fields and the v8+ optional `pendingMoves`. Keeps every `state.career.*` write inside `applySeasonEvent` so the mutation seam holds across the load path. |
| `SEASON_ROLLED_OVER` | One per rollover, after all `TRANSFER_ACTIVATED` / `PLAYER_AGED` / `PLAYER_RETIRED` / `ACADEMY_GRADUATED` / `FOREIGN_IMPORT_ARRIVED` events for that rollover | Composite: archives just-completed standings + top scorer + MVP + `championTeamId` into `state.career.archive`, resets `league.results` / `league.standings` / `league.playoffs` / per-player `seasonStats`, replaces `league.fixtures` with the regenerated round-robin, sets the new `seasonLabel`, increments `seasonsCompleted`. Clears `state.career.pendingMoves` as a safety net (they were already drained by the preceding `TRANSFER_ACTIVATED` events). |
| `PLAYOFF_BRACKET_SEEDED` | Once after the last R18 fixture is recorded (via `seedPlayoffBracket`) | Writes `state.league.playoffs` with the two semi-finals (1 v 4, 2 v 3) seeded from `sortStandings(top 4)` and a Final entry with `homeId`/`awayId` null. Idempotent — exits early if the bracket already exists. |
| `PLAYOFF_RESULT_RECORDED` | One per playoff match — player (via `recordPlayerPlayoffResult`) or AI sim (via `simulatePendingPlayoffMatches`) | Sets `result` on the named match. Cascades: on a SF result, populates the Final's matching slot from the SF winner (SF1 → home, SF2 → away). On the Final's result, sets `championTeamId`. Does NOT touch `league.standings` — playoffs are independent of league points. |
| `CLUB_BUDGET_SET` | Once per club at the start of the off-season chain (via `prepareBudgetsForNextSeason`) | Sets `state.career.clubs[clubId].salaryBudget` to the post-clamp new value (performance-derived base, floored from year 2 onwards, ceilinged at the effective cap). `delta` + `reasons` carry display payload for the BudgetRevealScreen. |
| `CLUB_TAKEOVER` | After all `CLUB_BUDGET_SET` events when a club hits the takeover trigger — Newcastle Red Bull at year-1 → year-2 (hardcoded), random investor takeovers from year 3+ (`rngTransfer` rolls) | Adds `boostAmount` (£1m) to the named club's `salaryBudget`, clamped at the effective cap. Pushes the clubId onto `state.career.takeoverHistory` so the club is excluded from future random rolls. |
| `PLAYER_TRAINING_PLAN_SET` | TrainingScreen Continue (post-match) and TrainingScreen Back (Hub mid-week) | Clones the chosen `TrainingPlan` (`intensity` + `forwardsFocus` + `backsFocus`) into `state.player.training` so the next training week opens with it as the default. |
| `PLAYER_TRAINED` | Per non-injured roster player league-wide, once per training week of the gap (post-match TrainingScreen Continue → `applyTrainingBlock`) | Applies `conditionDelta` to `Player.condition` (clamped 0-100) plus `Partial<PlayerStats>` deltas to `baseStats` (clamped 1-99). `conditionDelta = conditionPerDay × the period's day-span` (condition recovers daily). Shape mirrors `PLAYER_AGED` for the stats half. RNG via `rngTransfer`; iteration is club id-ascending → roster id-ascending. |
| `PLAYER_CONDITION_UPDATED` | Per player who took the field, once per fixture (live + silent AI + playoffs) | Snapshots that player's final in-match fatigue back to `Player.condition` (set, not add). MatchCoordinator.initPlayer then reads it as the starting `fatiguePct` for the next match. Bench players who didn't appear get no event and keep their accumulated condition. |

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

**Signing + poaching + supply layer (Phases 5-7 of the transfer-system roadmap):**

| Variant | When fired | What it does |
|---|---|---|
| `CONTRACT_SIGNED` | User-side via `signFreeAgent`; AI side via `closeSigningWindow` → `decideAISignings` | Removes rosterId from `state.career.freeAgents`, adds to the new club's `ClubState.squad`, rewrites the player's `contract` ({ `clubId`, `expiresOn`, `annualWage`, `isMarquee: false` }). |
| `PRE_AGREEMENT_SIGNED` | User-side via `preAgreePoach`; AI side via `closeSigningWindow` → `decideAIPoaches` | Pushes a `PreAgreement` onto `state.career.pendingMoves`. Idempotent per rosterId — any prior pending move for that player is dropped first. The move activates at the next rollover via `TRANSFER_ACTIVATED`; until then the player completes the season at their current club. |
| `PRE_AGREEMENT_CANCELLED` | User-side via `cancelPreAgreement` (UI undo on TransferMarketScreen) | Drops the pending move for the given rosterId — no rollover-time activation. Only valid while the signing window is open. |
| `TRANSFER_ACTIVATED` | Per pending move in `careerRollover.computeRollover` (stable rosterId-ascending) | Atomic squad swap — removes rosterId from the old club's `ClubState.squad` (sourced from `event.fromClubId` so a future rollover-batch reordering can't desync), adds to the new club's, rewrites `contract` with the agreed terms (clears `isMarquee` on departure). Does NOT touch `freeAgents`. |
| `ACADEMY_GRADUATED` | 2-4 per club per rollover in `careerRollover.computeRollover`, persona via `generatePersona` | Inserts the new persona into `state.career.roster` at the freshly allocated `rosterId`, adds to the academy club's `ClubState.squad`, bumps `state.career.nextRosterId`. Wage + length come from the persona generator (fixed £20k rookie + 2-year). |
| `FOREIGN_IMPORT_ARRIVED` | 5-10 per rollover in `careerRollover.computeRollover`, persona via `generatePersona` | Inserts the unsigned persona into `state.career.roster`, appends to `state.career.freeAgents`, bumps `nextRosterId`. The next signing window's `decideAISignings` / user `signFreeAgent` flow consumes them. |

## UI events

The game engine emits six `game:*` events through `src/utils/eventBus.ts`. UI modules subscribe and re-render; the game engine never imports any UI module.

| Event | Payload | Subscribers |
|---|---|---|
| `game:initialized` | `{ state: GameState }` | `FixtureListScreen` (initial render after `newSeason` / `fromSave`) |
| `game:fixtureRecorded` | `{ result: FixtureResult; state: GameState }` | `FixtureListScreen`, `RoundResultsScreen`, `HubScreen`, `LeagueTableScreen`, `TeamStatsScreen`, `PlayerStatsScreen` (re-render as each headless AI fixture resolves; stats screens pick up the fresh per-team / per-player aggregates from `state.league.teamSeasonStats` + `state.career.roster[*].seasonStats`) |
| `game:weekAdvanced` | `{ state: GameState }` | `FixtureListScreen` (calendar header), `HubScreen` (expiring-contracts badge refresh as deals tick into the 6-month window), `LeagueTableScreen` / `TeamStatsScreen` / `PlayerStatsScreen` (re-derive season-position eyebrow) |
| `game:bracketSeeded` | `{ state: GameState }` | `main.ts` latches `bracketSeededPending`; `HubScreen` + `PlayoffBracketScreen` re-render. Fires once after the final R18 fixture is recorded (via `seedPlayoffBracket`). |
| `game:playoffsUpdated` | `{ state: GameState }` | `HubScreen` + `PlayoffBracketScreen` re-render. Fires after every `PLAYOFF_RESULT_RECORDED` (player or AI) so the bracket UI shows the cascade fill in. |
| `game:seasonComplete` | `{ state: GameState }` | `main.ts` latches `seasonCompletePending`; the post-match Continue chain reroutes through `EndOfSeasonScreen` → optional `RenewalsScreen` → optional `TransferMarketScreen` → `RolloverScreen`. Now fires only after the League final resolves (no longer the end of the last regular round). |

## Career: roster + identity model

Three load-bearing distinctions:

- **`Player.rosterId` is the persistent identity** (globally unique, allocated once by `rosterSeeder`). **`Player.id` remains the matchday slot 1-23** — every match-engine event variant, `RatingEngine`, `StaminaSystem` etc. continue to read it as a slot. Season-scope `SeasonEvent` variants carry `rosterId`; match-scope `MatchEvent` variants carry `id`. Don't conflate them.
- **The matchday `Team` is built fresh per fixture from the roster**, not loaded from JSON. `rosterTeamBuilder.buildTeamFromRoster(state, teamJson)` resolves `ClubState.squad` rosterIds → `Player` records (current `baseStats` reflecting accumulated aging), assigns slot ids 1-N, threads `rosterId` through on each `RawPlayer`. `MatchCoordinator.initPlayer` re-attaches it.
- **`applyStarBoost` runs exactly once per session**, on the JSON ingest path in `main.ts` (it's *not* idempotent — re-applying would compound the tier shift). The roster carries the post-boost `baseStats`; aging mutates the roster's `baseStats` in place via `PLAYER_AGED`. A v5+ save bypasses the seeder entirely and restores the saved (already-boosted, already-aged) roster on load.

## Determinism + RNG

A fourth seeded `mulberry32` stream `rngTransfer` (`src/utils/rng.ts`, constant `0x27D4EB2F`, reset by `setCareerSeed(seed)` on `newSeason` / `fromSave`) services all career-scope randomness — contract seeding, stat-development noise, retirement rolls, renewal offer wages, signing-window offer wages (cached on `state.career.market.offers` so subsequent renders + sign calls don't re-advance the stream), persona generation (name + nationality + position + dob + 12 baseStats per persona). Stays isolated from `rng` / `rngForm` / `pickRandom` so career mutations cannot perturb match outcomes; per-fixture seed derivation cannot perturb career-scope outcomes.

`(playerTeamId, rootSeed)` plus the player's series of results produces an identical final league table + roster `baseStats` + retirement list on every run, across multiple seasons. Verified by `scripts/checkSeasonDeterminism.ts` — runs three full seasons with `rollSeason()` between each, exercises both the renewal and signing windows (AI-only, no user decisions) between each pair, snapshots per-season standings + results hash + the full SeasonEvent stream + the renewal + signing offer hashes + post-window free-agents pool + final-state roster baseStats + seasonsCompleted, asserts byte-equal SHA-256 on a second run. `npm run verify` runs both the match-level and career-level harnesses; both must pass before commit.

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
    + (5.5 − finalLeaguePosition) × BUDGET_VALUES.positionDelta   // ±£100k/position
    + (semiFinalist ? BUDGET_VALUES.semiFinalBonus : 0)            // +£100k
    + (champion    ? BUDGET_VALUES.championBonus  : 0),            // +£200k
  BUDGET_VALUES.floor (year ≥ 2),                                  // £5.4m
  SENIOR_CAP + EFFECTIVE_CAP_CREDITS,                              // £7.8m
)
```

Rounded to the nearest £50k for clean display. `BudgetReason[]` chips on `CLUB_BUDGET_SET` carry the position number, SF / champion flags, and floor / cap-applied markers so the reveal screen can render the breakdown without re-deriving from standings.

**Takeovers.** A `CLUB_TAKEOVER` event lifts a single club's `salaryBudget` by `TAKEOVER_VALUES.boostAmount` (£1m), clamped at the effective cap, and adds the clubId to `state.career.takeoverHistory` so each club can only be taken over once. Two pathways:
- **Hardcoded year-2 (Newcastle Red Bull).** Fires deterministically at the year-1 → year-2 rollover. Flavor `'red_bull'`. With the £5.4m floor + £1m boost, Newcastle lands at £6.4m for 2026/27.
- **Random year-3+.** Each club not already in `takeoverHistory` rolls `rngTransfer(1, 100) <= TAKEOVER_VALUES.randomChancePct` (4%). Independent per club, stable alpha-by-clubId iteration so the rngTransfer sequence is reproducible. Multiple takeovers in a single off-season are possible but rare (expected ~0.4/year). Flavor `'investor'`.

**AI behaviour.** `aiTransferDirector`'s three decision paths (`decideAIOffers`, `decideAISignings`, `decideAIPoaches`) all target `club.salaryBudget × RENEWAL.aiTargetCapUtilisation` (or `AI_SIGNING_POLICY.capTarget` for signings/poaches). Big spenders like Bath continue to fill toward £7.8m; budget-constrained clubs like Newcastle stay well under and shop accordingly.

**UI surface.**
- `BudgetRevealScreen` — "Owner's Budget" card. Two entry points: (1) at the start of Squad Builder mode showing the year-1 seeded budget (no delta / reasons), (2) between EndOfSeason and Renewals each year showing the new budget + delta chip (+/−£Xm) + reason chips ("Finished 4th", "Reached the semi-finals", "League champions", "League minimum applied"). Reads `clubBudgetUsage` to surface "headroom for signings" inline.
- `TakeoverRevealScreen` — Fires after BudgetReveal when one or more `CLUB_TAKEOVER` events landed this rollover. Player's own club gets a hero card with flavour blurb ("Newcastle Falcons taken over by Red Bull"); other clubs render as a "Around the league" list below.
- Existing pills on `ContractsScreen`, `RenewalsScreen`, `TransferMarketScreen` now compare against `club.salaryBudget` instead of the league-wide effective cap. The `CAP` label is relabelled `BUDGET` in those three locations.

## End-of-season renewals (Phase 4)

A renewal window opens between `EndOfSeasonScreen`'s Continue and the rollover. Architecture:

1. **`GameCoordinator.openRenewalWindow()`** — emits `MARKET_OPENED` with `expiringRosterIds` (every Player whose `contract.expiresOn` ≤ 30 Jun of the just-completed season's end year) and `offers` (one `TransferOffer` per expiring player league-wide, generated by `aiTransferDirector.generateRenewalOffers`). Each offer's wage is `contractSeeder.seedContractFields(player, ...).annualWage × (1 - loyaltyDiscount)`, rounded to £5k; length is re-derived from current age. `rngTransfer` advances in stable rosterId-ascending order. Idempotent — no-op if there are no expiring contracts or if a window is already open. Skipping the screen entirely when there are no expiring contracts is the caller's responsibility (it reads `state.career.market` after the call).
2. **`RenewalsScreen`** — user toggles Renew/Release per row on their own club's offers. Default is Renew. Live projected-cap pill mirrors the `ContractsScreen` 3-state.
3. **`GameCoordinator.closeRenewalWindow(userDecisions)`** — one event-batched call resolves every pending offer in stable list order:
   - User decisions for the player's club override the AI default for those offers.
   - `aiTransferDirector.decideAIOffers(state, clubId)` (pure / RNG-free greedy) generates the AI default for every other club: marquees always renew, players under `aiReleaseRatingFloor` always release, the rest renew in OVR-desc order until the cap target (`max(SENIOR_CAP × aiTargetCapUtilisation, preWindowCap)`) is hit. Over-cap clubs use their pre-window cap as the ceiling so they don't shed their entire expiring cohort in one window.
   - Accepted offers fire `OFFER_RESPONDED(accept=true)` then `CONTRACT_EXTENDED`. Rejected offers fire `OFFER_RESPONDED(accept=false, reason='cap_overcommit')` then `CONTRACT_TERMINATED(reason='expired')` — the player moves to `state.career.freeAgents`.
   - Finally fires `MARKET_CLOSED`, clearing `state.career.market`.
4. **`rollSeason()`** runs next (unchanged Phase 1 path), then `RolloverScreen`.

Determinism: `openRenewalWindow` is the only consumer of `rngTransfer` in the market path (via `contractSeeder` during offer generation); `decideAIOffers` itself is fully deterministic from the offer inputs + state. The 3-season `checkSeasonDeterminism` harness exercises the window between each pair of seasons (AI-only, no user decisions) and hashes the offer list + post-window free-agents pool.

Tuning constants live in `RENEWAL` (`src/engine/balance/transfers.ts`): `loyaltyDiscount` (current club discount on demanded wage), `aiTargetCapUtilisation` (under-cap clubs aim for this fraction of effective cap), `aiReleaseRatingFloor` (below this OVR, expiring players are at risk regardless of cap headroom).

## Competitive signings (Phases 5 + 6 + 10)

After the renewal window closes, the signing window opens. Multi-round competitive bidding — every Make Offer + AI bid pass creates `TransferBid`s that resolve by appeal score (squad OVR + position need + ambition + loyalty), not first-come-first-served. The window loops until the user clicks Finish.

**Bid layer.** `MarketState.bids: TransferBid[]` (v15+) carries every bid in the active window — pending, won, lost, or withdrawn. `TransferBid.kind` discriminates `'free_agent'` / `'poach'` / `'retention'`. All bids for a player share the same `annualWage` (cached on `market.offers` at window open); appeal decides the winner, not wage size.

**Per-round flow** — one Submit press in the TransferMarketScreen:

1. **User submits offers.** `submitBid(rosterId)` adds a `TransferBid` for the user's club (kind inferred from FA pool vs poach eligibility). Hard budget gate: pending bid wages count toward `clubBudgetUsage`, so the user can't make offers that would breach budget. Withdraw → `BID_WITHDRAWN`, wage refunded.
2. **AI bid pass.** `decideAIBids(state, humanClubId)` walks non-human clubs in alpha order, each picks its top remaining targets (score = `overall + position-need × 10`, OVR ≥ `aiReleaseRatingFloor`, budget-headroom-gated). Per-round re-evaluation: if a club lost their preferred player to a rival last round, this round they bid on the next-best.
3. **AI auto-retention pass.** `decideAIRetentions(state, humanClubId)` walks every AI club whose own final-year player is under poach attack. Retention wage = `freshMarket × (1 - loyaltyDiscount)` (mirrors renewal terms). Headroom-gated against the retaining club's own budget.
4. **User retention prompt** *(if any of the user's players is being poached)*. The `RetentionDecisionScreen` lists at-risk players with a per-row Retain toggle. `submitRetentionBid(rosterId)` adds a retention `TransferBid` for the user's club; budget gate uses `(newWage - oldWage)` as the delta since the retention replaces (not stacks on) the existing wage.
5. **Resolution.** `signingResolver.resolveSigningRound(state)` walks rosterIds in ascending order; for each player with ≥1 pending bid, computes `appealScore(state, bid, player)` for each bidder, picks the highest, fires `BID_RESOLVED` per bid + the appropriate contract event for the winner (`CONTRACT_SIGNED` / `PRE_AGREEMENT_SIGNED` / `CONTRACT_EXTENDED`). Ties break by lower `clubId`.
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

Determinism: every wage decision flows through cached offers seeded once at `openSigningWindow`; the AI bid passes read those cached terms. Appeal scoring is fully deterministic (no RNG). The 3-season `checkSeasonDeterminism` harness now exercises a user-bid round + a Finish-pass per season and hashes the resolved outcomes.

## Mid-season free-agent signings

Free agents aren't contractually restricted, so the user can sign them at any point during the season — Hub → Transfers opens an interactive signings market. Separate lifecycle from the off-season window; no AI competition (free agents are looking for work, not playing one club off against another).

**Starter FA pool.** `GameCoordinator.newSeason` seeds `STARTER_FA_POOL.count` free agents (default 12-18) via `personaGenerator.generatePersona`, applied as `FOREIGN_IMPORT_ARRIVED` events. This runs once per new game (Quick Start AND Squad Builder); fromSave skips it since the saved career already carries whatever pool has accumulated. Without this seed, a fresh Quick Start save has zero free agents on the books until the first end-of-season cycle, and Hub → Transfers would land on an empty-state screen. The Squad Builder flow then layers `unwindPreSeasonTransfers` on top, growing the pool with the curated 2025-26 inbound transfers.

**Lifecycle** (`TransferCoordinator`):

- `openMidseasonSigningWindow()` — builds `TransferOffer[]` from `state.career.freeAgents` minus any rosterIds on `state.career.midseasonRejections` cooldown. Skips Reg 7 candidates entirely. Fires `MARKET_OPENED({ phase: 'signings-midseason', ... })`. Idempotent on a market that's already open. Empty FA pool → no-op, the navigation handler still routes to TransferMarketScreen which falls through to its empty-state render with a Continue button back to the Hub.
- `closeMidseasonSigningWindow()` — fires `MARKET_CLOSED`. No AI pass — mid-season has no competing bidders, so any user bids that didn't get submitted just vanish with the market.
- `runMidseasonSigning(): SigningOutcome[]` — walks the user's pending bids rosterId-ascending. For each: roll a `rngTransfer()` against the appeal-based acceptance probability. Accept → `BID_RESOLVED({ won })` + `CONTRACT_SIGNED`. Decline → `BID_RESOLVED({ lost })` + `MIDSEASON_OFFER_REJECTED({ weekUntilClear: currentWeek + 1 })`. Returns `SigningOutcome[]` for `SigningResultsScreen`.

**Acceptance probability** (`src/game/midseasonSigningResolver.ts::midseasonAcceptanceProbability`). Pure function over the same `appealScore` the off-season uses:

```
t = clamp01((appealScore − appealFloor) / (appealCeiling − appealFloor))
probability = acceptanceFloor + t × (acceptanceCeiling − acceptanceFloor)
```

Tuned via `balance/transfers.ts::MIDSEASON_SIGNING`. Default range: a weak club has at least a 30% chance with any FA; even a top club caps at 90% (no FA is a sure thing). The four constants (`acceptanceFloor`, `acceptanceCeiling`, `appealFloor`, `appealCeiling`) can be dialled independently.

**Cooldown**. `state.career.midseasonRejections: Record<rosterId, weekUntilClear>`. A declined player is locked until `state.calendar.week` reaches the stored value. WEEK_ADVANCED prunes aged-out entries; SEASON_ROLLED_OVER clears the whole map (the FA pool reshuffles, so per-rosterId locks become stale). The UI renders cooldowned rows with a disabled "Not interested" chip in the action column.

**Navigation**. `main.ts::goTransfersMidseason` — open → show TransferMarket (mode `'signings-midseason'`) → Submit → resolve + close + SigningResults → Hub. Finish closes the market without submitting. `continueGame` resumption: if the loaded save has `state.career.market.phase === 'signings-midseason'`, route straight back to `goTransfersMidseason` (the `openMidseasonSigningWindow` no-op preserves the existing market).

**Determinism**. Mid-season signings consume `rngTransfer` (one roll per submitted bid in rosterId-ascending order). The match + season determinism harnesses don't exercise mid-season signings — they remain off-season-only — so adding this surface left both hashes unchanged.

**Out of scope (v1).** AI clubs don't sign free agents mid-season — keeps the FA pool stable enough for the user to plan around. Mid-season Reg 7 / cross-Prem poaching stays deliberately closed (final-12-month rules are off-season-only). Mid-season marquee re-designation is handled via the existing Contracts screen toggle.

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
- **Severity roll**: `GameCoordinator.rollNewInjuryEvents(snapshots)` reads `snapshot.injuryKind` (surfaced by `snapshotMatch`) and rolls severity + weeks via `rngTransfer`. Walks snapshots rosterId-ascending so the career-stream consumption is stable.
- **Recovery tick**: `GameCoordinator.tickInjuryEvents()` runs at the start of `recordPlayerMatchResult` (after the re-entry guard, before any new fixture is recorded). Pure RNG-free walk over `state.career.roster`; emits `INJURY_TICK_ADVANCED` for every injured player and `PLAYER_RECOVERED` for any whose counter hits zero. It's looped `upcomingGap(state).weeks` times — the number of whole weeks between the player's previous and upcoming match (`src/game/trainingCalendar.ts`), so a long international window (≈8 weeks across the Six Nations break) heals proportionally more than a normal 1-week turnaround. A 6-day and 8-day gap both round to one week. Order: tick × N → record fixtures → roll new injuries → `WEEK_ADVANCED`.
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

- **The four intensities** (`src/engine/balance/training.ts::INTENSITY_EFFECTS`). Condition is **per day**; development + injury are per training week. v1 baseline:
  - **Rest** — `+13` condition/day, 0% development, 0% injury risk.
  - **Light** — `+9` condition/day, 8% base development chance per stat per week, 0.1% injury risk per player per week.
  - **Medium** — `+6` condition/day, 18% development chance, 0.4% injury risk.
  - **High** — `+3` condition/day, 32% development chance, 1.2% injury risk.

- **The eight focuses.** Each focus picks two `PlayerStats` keys to develop faster. `FORWARDS_FOCUS_STATS` and `BACKS_FOCUS_STATS` in `balance/training.ts` hold the mapping:
  - Forwards: `set_piece` → setPiece + strength, `strength` → strength + tackling, `stamina` → stamina + handling, `handling` → handling + composure.
  - Backs: `tackling` → tackling + positioning, `defensive_organisation` → positioning + discipline, `attacking_skills` → pace + agility, `kicking` → kicking + composure.
  - Forwards focus applies to players with `isForward(position) === true`; backs focus to the rest. Split is by `Player.position` (stable across substitutions / matchday curation).

- **Development math** (`src/game/trainingWeek.ts::computeTrainingWeek`). Per non-injured roster player per training week, per stat:
  - `chance = INTENSITY_EFFECTS[intensity].developmentChance × multiplier × ageMul × proxMul`
  - `multiplier = DEVELOPMENT.focusMultiplier (3.0)` when the stat is one of the player's group focus pair; `DEVELOPMENT.unfocusedMultiplier (0.25)` otherwise. So unfocused stats still drift slowly.
  - `ageMul`: 1.6× under 23, 1.0× at 24-28, 0.6× at 29-32, 0.25× at 33+. Mirrors the `AGE_CURVES` shape — younger players gain more from training.
  - `proxMul = proximityMultiplier(player.potential, playerOverall(player.baseStats, player.position))` — a player near their ceiling barely responds to training; see **Soft potential ceiling** below.
  - A successful roll = `+1` to that stat (`TRAINING_STAT_DELTA`). The apply-event branch clamps to `[1, 99]` — same as `PLAYER_AGED`.

- **Training injuries.** Per player per week, after the development pass, one `rngTransfer` roll against `injuryChance = INTENSITY_EFFECTS[intensity].injuryRisk × conditionRiskMultiplier(condition)`. On a hit, `rngTransfer` picks one of `muscle_strain` / `ligament_sprain` / `knock` (no concussions / fractures from training), reads `INJURY_SEVERITY[kind]` for severity weights + week bands, and emits a `PLAYER_INJURED` event — the same shape used by in-match injuries, so the existing `INJURY_TICK_ADVANCED` / `PLAYER_RECOVERED` loop handles recovery identically. `INJURY_RISK.conditionMultiplier (1.5)` means a player at 0% condition is 1.5× more injury-prone than one at 100%; linear interpolation in between.

- **AI training director** (`src/game/aiTrainingDirector.ts::pickPlan`). Pure, RNG-driven via `rngTransfer`. For each AI club (id-ascending), picks an intensity weighted by:
  - Squad average condition below `AI_TRAINING.squadConditionTiredThreshold (70%)` → rest/light bias.
  - Recent 3-match win rate below `AI_TRAINING.poorFormWinRateThreshold (0.34)` → high bias (chasing form).
  - Else → balanced (medium-biased) baseline.
  - Forwards + backs focuses are then picked uniformly across their respective sets via two more `rngTransfer` calls. A third throwaway roll keeps the per-club call count fixed at 3 regardless of which intensity branch was hit.

- **Coordinator surface.** `GameCoordinator.applyTrainingBlock(weeks: TrainingPlan[])` is the entry point. It derives the per-period day-spans from `upcomingGap` + `splitGapIntoPeriods`, then for each period calls `computeTrainingWeek(state, plan, periodDays)` (pure), applies each returned event through `applySeasonEvent`, and accumulates per-player results (summed stat gains, condition before/after, newly-injured latch). Emits `game:trainingApplied` once at the end and returns a `TrainingWeekResult { plan, players, weeks }` for `PostTrainingResultsScreen`. Called by `TrainingScreen`'s Continue button. Determinism: clubs iterated id-ascending, roster ids numeric-ascending — same stable order as `careerRollover.computeRollover`. Training is UI-only (not exercised by `checkSeasonDeterminism`), so the block loop is additive to the harness; the engine-side multi-week injury tick *is* covered and stays deterministic because the week count comes from fixed fixture dates.

- **`setPlayerTrainingPlan(plan)`** is the lighter-weight setter used by the Hub mid-week edit path. Single `PLAYER_TRAINING_PLAN_SET` event, no execution, no `rngTransfer` consumption — the plan just becomes next round's default.

- **Determinism + RNG**. All training rolls flow through `rngTransfer` (the career stream), independent of match outcomes. Adding a training week to a season does NOT shift match RNG. Stable iteration order (clubs id-ascending → roster ids numeric-ascending → stats in `ALL_STAT_KEYS` insertion order) keeps the call sequence reproducible.

- **Soft potential ceiling.** Every roster Player carries `potential?: number` — a hidden OVR ceiling seeded once at game-start. Seeding: `potential = min(99, OVR + rngTransfer(band.min, band.max))` where the headroom band is age-gated (`POTENTIAL_HEADROOM` in `balance/career.ts`). Young players (≤21) get 8–20 OVR of headroom; experienced players (29+) get 0–3. The ceiling is back-filled conservatively on pre-v21 saves (1–8 OVR headroom, no RNG — see Save format). `proximityMultiplier(potential, ovr)` returns a value on `[0.10, 1.00]` via piecewise-linear interpolation over `PROXIMITY_CURVE` (headroom 0 → 0.10×; headroom ≥15 → 1.00×). This multiplier is applied to growth only, in both training and rollover. Decline fires at full rate regardless — a player near their ceiling still ages. The `potential` field is intentionally hidden from the UI (no display, no editing), mirroring FM's CA/PA philosophy.

- **Why baseStats and not a sharpness layer?** FC Career Mode keeps attribute growth separate from per-week sharpness; FM blends both with hidden CA/PA caps. We chose the FM-style blend — `baseStats` drift directly under training (clamped by the existing `[1, 99]` invariant + per-player overrides in `PLAYER_STAT_OVERRIDES`), with `potential` acting as the soft PA ceiling. The result: a young player on focused training noticeably outgrows their cohort over a season, while older players who've hit their ceiling plateau and begin to decline.

## Playoffs

A three-match knockout follows the 18-round League regular season: two semi-finals (1 v 4 and 2 v 3) the week after R18, and a Final at Twickenham one week later. Top 4 by `sortStandings` (league points → diff → for, identical to the league-table sort).

- **State.** Lives on `state.league.playoffs` as `PlayoffState { semifinals: [PlayoffMatch, PlayoffMatch], final: PlayoffMatch, championTeamId: string | null }`. Null while the regular season is still in flight; seeded by `PLAYOFF_BRACKET_SEEDED` when the last R18 fixture is recorded; cleared by `SEASON_ROLLED_OVER` after the champion has been archived. The reducer for `PLAYOFF_BRACKET_SEEDED` is idempotent — a second call is a no-op.
- **Reducer cascade.** `PLAYOFF_RESULT_RECORDED { kind, ... }` writes the result on the named match. When a SF resolves, the reducer also populates the final's matching slot from the SF winner (SF1 → home, SF2 → away). When the Final resolves, `championTeamId` is set. Ties fall to the home side — no extra time / golden point in v1.
- **Coordinator surface.** `seedPlayoffBracket()` (auto-called from `recordPlayerMatchResult` after the last R18 fixture; idempotent). `getPlayerPlayoffMatch()` returns the player's next unresolved playoff match or null. `recordPlayerPlayoffResult(kind, homeScore, awayScore, snapshot)` is the playoff analogue of `recordPlayerMatchResult` — same idempotency guard + injury tick + per-player + per-team stats accumulation, but writes through `PLAYOFF_RESULT_RECORDED` so league standings are untouched. `simulatePendingPlayoffMatches(stage)` runs (silent) every pending AI-vs-AI match in the named stage (`'sf'` or `'final'`).
- **Determinism.** Each playoff match derives its match seed from `deriveFixtureSeed(rootSeed, pseudoRound, homeId, awayId)` with pseudo-round 19 for SFs and 20 for the Final — same hashing pipeline as regular fixtures, so a given root seed produces an identical bracket every run. Verified by `scripts/checkSeasonDeterminism.ts` which now walks each season through to the Final.
- **Neutral venue.** The Final is played at Twickenham — `state.engine.neutralVenue` is set by `MatchCoordinator` (constructor opt) when the kind is `'final'`. `homeEdge(state, mod)` short-circuits to `{ attack: 0, defend: 0 }` so the `HOME_ADVANTAGE` carry / breakdown bump zeroes out. `teamStats.homeAdvantagePts(neutral)` mirrors this for the PreMatch SPREAD tile so prediction and simulation agree.
- **UI surface.** `PlayoffBracketScreen` (`src/ui/PlayoffBracketScreen.ts`) renders the live bracket — two SF cards + a centred Final card + a champion banner once crowned. CTA label adapts: "Continue" → play the player's next match or enter EndOfSeason; "Watch the Semi-Finals" / "Watch the Final" → silent-sim the pending AI matches and re-render. `main.ts::runPlayoffStage()` is the state-driven orchestrator that decides what to show next on every entry. `HubScreen` re-routes the "Go to next match" tile to `runPlayoffStage` whenever the bracket is active.
- **Per-player + per-team stats.** Playoff matches contribute to `Player.seasonStats` and `state.league.teamSeasonStats` exactly like regular matches — `seasonStatsCollector.snapshotMatch` runs over every playoff fixture (live + silent). Top scorer / MVP / leaderboards in `EndOfSeasonScreen` include playoff contributions.
- **Archive.** `ArchivedSeason.championTeamId` records the winner. Older archives (pre-v13 saves with no playoff history) load as `null`.

## Save format

`SAVE_VERSION = 21`. `SavedGame` in `src/ui/SaveManager.ts` is a thin serialiser for `GameCoordinator.toSavePayload()`. **`ACCEPTED_VERSIONS` must always include `SAVE_VERSION`** — it's seeded as `new Set([SAVE_VERSION, 20, … 2])`; the older entries are the migratable past. (Omitting the current version silently rejects every freshly-written save on the next load — the regression this guard prevents.)

**Slot storage layout.** Saves live in three fixed, renameable slots —
`rugby-manager-save-{1,2,3}` in `localStorage` — plus an active-slot pointer
`rugby-manager-active-slot`. Each slot envelope is the flat `SavedGame` plus
`slotName` + `savedAt` (a storage concern, **not** a game-schema bump, so
`SAVE_VERSION` is unaffected). Autosave (the ~15 `saveGame` call sites) and the
Home Continue card target the **active** slot via thin wrappers
(`loadSave`/`saveGame`/`clearSave` → `loadSlot`/`saveToSlot`/`clearSlot` of the
active id). The pre-slot single-save key (`rugby-manager-save`) is folded into
slot 1 once at boot by `migrateLegacySave()`. The Saves screen
(`src/ui/SavesScreen.ts`, reachable from Home and Settings) manages slots: load
(switches active), Save here (manual snapshot into any slot), rename, delete,
and export / import. **Native iCloud backup** lives in `src/ui/saveBackup.ts`
(Capacitor-only, no-op on web): every slot write mirrors to the iOS Documents
directory (`saves/slot-{id}.json`, included in the device's iCloud Backup and
not OS-evicted), `reconcileBackups()` restores from disk at boot when a slot is
missing locally (reinstall / eviction), and `exportSlot` / `importToSlot` hand a
slot's JSON to the iOS Share Sheet / file picker (Blob download / `<input
type=file>` on web). SaveManager has no Capacitor dependency — the mirror hooks
in via `setSlotWriteHook`.

| Version | Added |
|---|---|
| v2 | Minimal slice: `playerTeamId`, `seed`, `currentWeek`, `results[]` |
| v3 | `seasonLabel` + `fixtures` snapshot — the schedule as the user saw it at save time, reconstructed verbatim on load |
| v4 | Pre-match preferences: `tactics` + `matchdaySquad` (23 PlayerRefs) |
| v5 | Career snapshot: `career.roster` (Player keyed by rosterId), `career.clubs` (per-club squad pointers), `career.archive` (past standings + awards), `seasonsCompleted`, `nextRosterId` |
| v6 | Each persisted Player carries `contract` + `reputation` (Phase 2) |
| v7 | `career.freeAgents` (rosterIds of players whose contracts expired without renewal) + optional `career.market` (MarketState — live offers when a market window is open mid-save, null otherwise). MarketState gains `phase: 'renewals' \| 'signings'`. Lets the player resume on the same offers after a tab close mid-window. |
| v8 | `career.pendingMoves` (PreAgreement[]) for Phase 6 Reg 7 cross-Prem poaching. The pre-agreed moves persist across saves until activated at the next rollover. |
| v9 | Per-team season aggregates: top-level `teamSeasonStats` map (keyed by teamId — possession / territory / set-piece / attack / defence buckets); each persisted Player gains the optional `injury` field (PlayerInjury — `kind`, `severity`, `weeksRemaining`, `injuredOn`, `isRecurrence`); Player gains `seasonStats` (per-player aggregator backfilled with zeros on older saves). |
| v10 | `TeamTactics` gains `defensiveLine` (`'blitz' \| 'hybrid' \| 'drift'`). Pre-v10 saves backfill `'hybrid'` (numerically neutral) so the engine never sees undefined. |
| v11 | `SavedSeasonResult` gains `homeTries` + `awayTries` for the bonus-points system. Pre-v11 rounds were played without try-bonus tracking, so older saves default to 0 — no fabricated retroactive bonuses. |
| v12 | `career.preSeasonStep` (`'overview' \| 'signings' \| 'marquee' \| undefined`) — Squad Builder resumption flag. Set during the pre-season flow at game start (Phase 8), cleared after marquee Continue. Outside Squad Builder this is always undefined and the field is omitted from the payload, so existing in-season saves stay byte-equivalent. The `'overview'` value was added v2.120a alongside SquadOverviewScreen — `SAVE_VERSION` stays at 12 since the field is purely additive within its optional value range. |
| v13 | Top-level `playoffs` (`PlayoffState \| undefined`) — the active knockout bracket. Omitted when no bracket is active (mid-regular-season). Each `ArchivedSeason` gains `championTeamId: string \| null`; pre-v13 archive entries load as `null`. Stays at v13 since both additions are purely additive within their optional / nullable shapes. |
| v14 | `ClubState.salaryBudget` — per-club owner-set budget for cap-relevant wages. Seeded from `CLUB_SALARY_BUDGETS_2025_26` at game start, adjusted each rollover by `prepareBudgetsForNextSeason`. `career.takeoverHistory: string[]` — clubIds taken over (Newcastle Red Bull at year 2 + random investors year 3+); excluded from future random rolls. |
| v15 | `MarketState.bids: TransferBid[]` — competing bids in the active signing window (Phase 10 competitive signings). Pre-v15 saves load with `bids: []` and any prior in-window signings are already committed via `CONTRACT_SIGNED`. |
| v16 | `MarketState.phase` gains `'signings-midseason'`. `career.midseasonRejections: Record<rosterId, weekUntilClear>` — per-player one-round cooldown after a mid-season free-agent declines. WEEK_ADVANCED prunes aged-out entries; SEASON_ROLLED_OVER clears them all. Pre-v16 saves migrate as `{}`. |
| v17 | `TeamTactics` gains `offloadStrategy` (`'cautious' \| 'balanced' \| 'offload_freely'`). Pre-v17 saves backfill `'balanced'` (numerically neutral) so the engine never sees undefined — same shape as the v9 → v10 `defensiveLine` migration. |
| v18 | Training system. Each persisted Player gains `condition: number` (0-100, inter-match freshness — snapshotted from final in-match fatigue, modulated weekly by training). Top-level `training?: TrainingPlan` carries the manager's last chosen plan. Pre-v18 saves back-fill `condition: 100` on every roster entry and load with `training: undefined` (TrainingScreen falls back to `DEFAULT_TRAINING_PLAN`). |
| v19 | `ArchivedSeason.playerSeasonHistory?: Record<rosterId, ArchivedPlayerSeason>` — per-player end-of-season snapshot (clubId at the time, apps, ratingSum, tries, carries, metres, line breaks, tackles, turnovers, kicksMade/At, yellow / red cards). Drives `PlayerProfileScreen`'s Career History table. Pre-v19 archive entries load with the field undefined; the profile renders an em-dash row for those historical seasons. New rollovers always populate it. |
| v20 | `FixtureResult.homeStats?: TeamSeasonStats` + `awayStats?: TeamSeasonStats` — per-fixture snapshot of `MatchSnapshot.homeSummary` / `awaySummary` taken at the moment the result is recorded (possession seconds, territory seconds, lineouts thrown / won, scrums put in / won, attack + defence + kicking + discipline counters). Drives RoundResultsScreen's tap-to-expand match-stats panel. Pre-v20 results load with both fields undefined — the expand panel renders "Detailed stats not recorded for this fixture" for those rounds. New rounds always populate the fields via `recordPlayerMatchResult` + the silent-fixture path in the same function. |
| v21 | `Player.potential?: number` — soft OVR ceiling seeded once at game-start via `rosterSeeder` (using `rngTransfer`). Pre-v21 saves back-fill conservatively in `backfillRosterSeasonStats` using a deterministic formula (no RNG): headroom = 8 for ≤21yo, 5 for ≤24yo, 2 for ≤28yo, 1 for 29+. The field drives `proximityMultiplier` in both `careerRollover.developStats` and `trainingWeek.pushClubTrainingEvents`. The ceiling is hidden from the UI. |

**Migration on load** (`GameCoordinator.fromSave`). The version-ladder
back-fill computation — schedule resolution, the v5→v6 contract synthesis,
the pre-v14 budget default, and the optional market/playoff layer
inclusion — lives in `src/game/saveMigration.ts` as pure functions
(`resolveSchedule`, `backfillCareerContracts`, `buildRosterSeededEvent`,
`buildCareerArchiveRestoredEvent`). `fromSave` calls them to produce the
event payloads, then replays those through `applySeasonEvent`, so the
deserialisation concern stays out of the orchestrator while the season
mutation boundary (GameCoordinator as the sole `applySeasonEvent` caller)
is preserved.

- v20 → v21: `backfillRosterSeasonStats` back-fills `potential` on every roster Player that lacks it, using a deterministic formula (age today → conservative headroom, no `rngTransfer`). Existing seasons continue uninterrupted with the soft ceiling in place from the first post-load training week or rollover.
- v19 → v20: no-op shim. `homeStats` / `awayStats` are optional on every persisted `FixtureResult`. Pre-v20 results load with both fields undefined and the RoundResults expand panel falls back to the placeholder copy. New fixtures recorded after the migration populate the fields the same way as a fresh game.
- v18 → v19: no-op shim. `playerSeasonHistory` is optional on every `ArchivedSeason` entry. Pre-v19 archives load with the field undefined — the next rollover populates it for the season just completed; older historical seasons stay sparse and the profile screen surfaces an em-dash placeholder for them. The same `cloneLeaders`-style defensive copy in `SaveManager.parseCareer` ferries the field through.
- v17 → v18: `backfillRosterSeasonStats` also writes `condition: 100` on every roster Player that lacks the field. The top-level `training` field is optional — pre-v18 saves load with it undefined and `TrainingScreen` resolves to `DEFAULT_TRAINING_PLAN`. No retroactive condition state is fabricated: a v17 save mid-season resumes with everyone at full freshness, and the next post-match training week begins evolving condition.
- v16 → v17: `parseSave` backfills `tactics.offloadStrategy = 'balanced'` when absent on the persisted tactics blob.
- v15 → v16: `parseCareer` defaults `midseasonRejections` to `{}`. `parseMarket` accepts the new `'signings-midseason'` phase value; pre-v16 saves never wrote it. No retroactive cooldowns — the player can immediately re-approach anyone after a v15→v16 load.
- v13 → v14: pre-v14 clubs default `salaryBudget` to the effective cap (no retroactive constraint — the next rollover then recomputes via `computeBudgetEvents` and the per-club budget kicks in from then on). `takeoverHistory` defaults to `[]` — pre-v14 saves never had a takeover, so a v13 save loaded mid-year-1 still fires the Newcastle Red Bull takeover at the next rollover.
- v12 → v13: no-op shim. `playoffs` is optional; pre-v13 archives gain `championTeamId: null`. After restoration `continueGame` calls `seedPlayoffBracket()` so a v12 save stuck at "all 18 played, no playoffs" auto-seeds and enters the playoff stage chain.
- v11 → v12: no-op shim. `preSeasonStep` is optional; older saves load with the field absent and `continueGame` routes straight to Hub.
- v10 → v11: pre-v11 results default `homeTries` / `awayTries` to 0.
- v9 → v10: `parseSave` backfills `tactics.defensiveLine = 'hybrid'` when absent.
- v8 → v9: `parseCareer` defaults `teamSeasonStats` to `{}` and back-fills each player's `seasonStats` with zeroes. `injury` is optional and older saves just have it absent on every roster Player.
- v7 → v8: `parseCareer` defaults `pendingMoves` to `[]`. No data loss — pre-v8 there was no Reg 7 flow so no pending moves existed.
- v6 → v7: `parseCareer` defaults `freeAgents` to `[]` and `market` to `null` when the older save omits them. v7 saves loaded by v8 code with `market.phase` missing default the phase to `'renewals'` for backward compat.
- v5 → v6: walk the persisted roster; for any Player missing `contract` or `reputation`, call `contractSeeder.seedContractFields` to backfill. Lossless — the `rngTransfer` stream advances but produces deterministic results for the same root seed.
- v4 → v5: synthesise a fresh roster from JSONs via `rosterSeeder` (lossless — pre-v5 had zero per-player evolution to preserve).
- v3 → v4 → v5: cascades. Schedule restored from the saved snapshot if present; falls back to `PREMIERSHIP_2025_26`.
- v2 → v3: legacy path, no schedule snapshot — falls back to current canonical schedule.
- v1: discarded (predates AI-vs-AI results, league table can't be reconstructed).

The persisted career state always flows through `CAREER_ARCHIVE_RESTORED` (with optional `freeAgents` + `market` + `pendingMoves` + `teamSeasonStats` + `preSeasonStep` + `playoffs` + `takeoverHistory` + `midseasonRejections` fields) so every `state.career.*` write stays inside `applySeasonEvent` — the mutation seam holds even across the load path. The v18 `training` field lives on `state.player` (not under `career`); it's restored via a separate `PLAYER_TRAINING_PLAN_SET` event during `fromSave`, mirroring the existing `PLAYER_TACTICS_SET` / `PLAYER_MATCHDAY_SQUAD_SET` restore path.

## New-game flow: Quick Start vs Squad Builder

`main.ts` routes the user through a Mode Picker after team selection (`src/ui/ModePickerScreen.ts`). The picker has two CTAs:

**Quick Start** — `GameCoordinator.newSeason(teamId, seed, allTeams)` → `saveGame` → Hub. Authored rosters / contracts / marquees stand exactly as seeded. This is the pre-Phase-8 behaviour.

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
  → Hub → Round 1
```

**Save resumption.** `state.career.preSeasonStep` is set before every `saveGame` during the flow. `continueGame` reads it and routes back to the in-flight screen (`runPreSeasonOverview()` for `'overview'`, `runPreSeasonSignings()` for `'signings'`, `runPreSeasonMarquee()` for `'marquee'`, Hub otherwise). The flag is only ever set between team-selection and Round 1; once the marquee Continue completes the engine clears it. `SAVE_VERSION = 12` accommodates the optional field; older saves load with `preSeasonStep === undefined` and skip straight to Hub.

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
                       ├── (last R18 fixture just resolved: game:bracketSeeded latched)
                       │     → runPlayoffStage() — state-driven orchestrator that:
                       │       · shows PlayoffBracketScreen on every entry (CTA label adapts)
                       │       · if player has a pending match → PreMatchScreen (with
                       │         contextLabel + neutralVenue for the Final) → MatchResult
                       │         → recordPlayerPlayoffResult → runPlayoffStage()
                       │       · else simulatePendingPlayoffMatches('sf' | 'final') silently
                       │         → game:playoffsUpdated → runPlayoffStage()
                       │       · once championTeamId is set, falls through to the chain below
                       │
                       └── (champion crowned: game:seasonComplete latched)
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

## Roadmap

All seven transfer-system phases are live on main: 1 (rollover, v2.22a), 2 (read-only contracts, v2.23a), 3 (interactive marquee + cap, v2.36a), 4 (end-of-season renewals, v2.36a), 5 (free-agent signings), 6 (Reg 7 cross-Prem poaching), and 7 (generated player supply — academy + foreign imports) (5/6/7 all v2.43a). Remaining work is refinement, not roadmap: per-player HG/EPS cap tagging (replacing the flat `CAP_CREDITS` pool), reputation drift from silverware, transfer budgets distinct from cap, squad size limits, mid-season transfers / loans / buyouts. See **`docs/transfer-system.md`** § "Open implementation questions" for the running list.

### Future: human-side "Auto-Select" button

`selectBestMatchdaySquad(roster, clubSquadIds)` in `src/game/autoSelect.ts` is the engine. The AI fixture path already uses it every match week. The human UI doesn't expose it yet — the manager always curates their 23 manually (with surgical injury repair filling unavailable slots).

A future "Auto-Select" button on `PreMatchScreen` (or `SquadManagementScreen`) would:

1. Call `selectBestMatchdaySquad(state.career.roster, club.squad)` → returns 23 rosterIds in slot order.
2. Convert to `PlayerRef[]` (lookup `firstName + lastName` from the roster — same shape as `extractMatchdaySquad`).
3. Fire `PLAYER_MATCHDAY_SQUAD_SET { squad }` (existing event — no schema change) so the selection persists.
4. Re-render the lineup grid with the new 23.

No new SeasonEvent, no save-format change, no engine refactor — the underlying function already ships as the AI's auto-pick. Drop-in UI work whenever it's prioritised.
