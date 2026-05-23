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
| `GameCoordinator.ts` | Public API (`newSeason`, `fromSave`, `getState`, `getCurrentFixture`, `recordPlayerMatchResult`, `rollSeason`, `toSavePayload`, plus the market-window methods listed below). Owns the `GameState`. The "tick" of the game engine is a player match completing: `recordPlayerMatchResult` applies the player's score, headlessly simulates the other fixtures of the round, runs `seasonStatsCollector` over each, then advances the week. Emits `game:seasonComplete` when the final round resolves. |
| `TransferCoordinator.ts` | Off-season market collaborator owned by `GameCoordinator`. Holds the same `GameState` reference; implements `designateMarquee`, `openRenewalWindow`, `closeRenewalWindow`, `openSigningWindow`, `signFreeAgent`, `unsignFreeAgent`, `preAgreePoach`, `cancelPreAgreement`, `closeSigningWindow`. `GameCoordinator` exposes thin delegating methods of the same names so the `getGameEngine: () => GameCoordinator` getter contract (CLAUDE.md § 4) is preserved — screens never see the collaborator directly. All writes flow through `applySeasonEvent`. |
| `applySeasonEvent.ts` | **Single mutation seam.** Reducer over `SeasonEvent` (`src/types/gameState.ts`); see the full variant list in the next section. Same `default: const _: never = event;` exhaustiveness contract as `applyMatchEvent`. |
| `rosterSeeder.ts` | `seedRoster(allTeams, seasonStartYear)` — one-shot at `newSeason` / v4-save migration. Walks every `RawTeamInput`, allocates a globally-unique `rosterId` per player, builds `state.career.roster` + `ClubState[]`. Defers wage/expiry/reputation to `contractSeeder.seedContractFields`. |
| `rosterTeamBuilder.ts` | `buildTeamFromRoster(state, teamJson)` — the seam between persistent roster and matchday `Team`. Team identity (color / name / stadium / `suggestedTactics`) comes from the JSON; player data (current `baseStats`, position, dob, contract, `rosterId`) comes from the roster. Result fed to `MatchCoordinator` for live matches and to `simulateFixture` for AI sims. |
| `seasonStatsCollector.ts` | `snapshotMatch(state)` extracts `{ rosterId, tries, tacklesMade, tacklesAttempted, turnoversWon, yellowCards, redCards, rating }` per player who took the field (rosterId > 0 filter skips non-career test contexts). `collectSeasonEvents(snapshots)` converts to `PLAYER_SEASON_STATS_ACCUMULATED` events. Run by `GameCoordinator.recordPlayerMatchResult` for live + silent fixtures. |
| `careerRollover.ts` | `computeRollover(state, allTeamIds)` — pure module; given current GameState, produces the SeasonEvent stream for a rollover, in this order: (0) `TRANSFER_ACTIVATED` for every pending Reg 7 pre-agreement (stable rosterId-ascending), (1+2) per-roster aging via `AGE_CURVES` + `STAT_NOISE` Gaussian noise + retirement check against `RETIREMENT_CURVE`, (3) Phase 7 supply — `ACADEMY_GRADUATED` 2-4 per club (stable alpha club id order) + `FOREIGN_IMPORT_ARRIVED` 5-10 single batch, both consuming `generatePersona`, (4) awards (top tries, MVP by avg rating with `mvpMinAppearances` floor) + composite `SEASON_ROLLED_OVER` with regenerated fixtures (Sept-May synthetic weekly dates, skips Nov + Feb). |
| `personaGenerator.ts` | Phase 7 — `generatePersona(seed, calendarDate)` produces a deterministic `Player` from `rngTransfer`: name from `NAME_POOLS` per nationality (English / Welsh / Scottish / Irish / French / South Africa / NZ / Australia / Fiji / Argentina, ~15-20 first + last names each); nationality biased by `NATIONALITY_BY_CLUB` for academy grads, uniform for foreign imports; position uniform across 12 generic positions; dob anchored to season-open year ± `ageBand`; stats `targetOverall + N(0, ±12)` clamped 1-99; wage £20k fixed for academy (RPA rookie rate) or `WAGE_BY_RATING × POSITION_SCARCITY` rounded to £5k for imports; 2-year deal default. |
| `contractSeeder.ts` | `seedContractFields(raw, clubId, seasonStartYear)` — wage = `WAGE_BY_RATING` piecewise-linear × `POSITION_SCARCITY` × `WAGE_NOISE`, rounded to £5k. Length age-banded via `CONTRACT_LENGTH`. Expiry `${seasonStartYear + lengthYears}-06-30`. Reputation = `round(overall × ratingMultiplier) + (marquee ? bonus : 0)`. Honours JSON `Partial<PlayerContract>` overrides (the hand-authored `Marquee: yes.` annotations). Two `rngTransfer` calls per player, order-stable. Also called inside `aiTransferDirector` to derive fresh-market wages for renewals + signings + poach offers. |
| `aiTransferDirector.ts` | Phases 4-6 module. **Renewals (Phase 4)**: `expiringRosterIds(state)`, `generateRenewalOffers(state)` (one offer per expiring player league-wide, wage = market × `1 - loyaltyDiscount`), `decideAIOffers(state, clubId)` (pure / RNG-free greedy: marquee + OVR floor + effective-cap-target sorting against `SENIOR_CAP + EFFECTIVE_CAP_CREDITS`), `expiryAfterYears(state, lengthYears)`. **Signings (Phase 5)**: `decideAISignings(state, humanClubId?)` (greedy by `overall + position-need × 10`, capped at `AI_SIGNINGS_PER_CLUB_LIMIT = 4` per club, `AI_SIGN_CAP_TARGET = 0.92` of effective cap, no OVR floor since the pool is largely sub-70), `signingTermsFor(state, rosterId, clubId)` (user-side pure helper matching what the AI director will compute). **Reg 7 poaching (Phase 6)**: `isPoachEligible(player, currentDate)` (final 12 months of contract), `poachCandidates(state)` (league-wide, marquee + own-club filtered), `decideAIPoaches(state, humanClubId?)` (max 1 per non-human AI club per window, OVR ≥ `aiReleaseRatingFloor`). All consumed by `GameCoordinator`'s window methods. |
| `playerSquad.ts` | Pure helpers: `extractMatchdaySquad` (snapshot the 23-man matchday roster as stable `PlayerRef` name refs) and `applyMatchdaySquad` (inverse — rearrange a `RawTeamInput` so the saved 23 occupy slots 1-23). Returns the team unchanged when the saved list is empty, the wrong length, or references a player no longer rostered. |
| `fixtures.ts` | Pure double round-robin generator using the standard "circle" method. Used by `careerRollover` for year-2+ fixture regeneration. Year-1 default is the hand-authored `PREMIERSHIP_2025_26` schedule. Player's team is placed at position 0 so its match is always the first pairing per round. |
| `simulateFixture.ts` | Headless wrapper around `MatchCoordinator` with `silent: true` — suppresses every `engine:event` / `engine:stateChange` / `engine:initialized` / `engine:resumed` emit and replaces modal prompts with `high_ball` / `kick_for_goal` defaults. `engine:finished` still fires. Returns `{ homeScore, awayScore, playerSnapshots }` so the caller can route stats through `seasonStatsCollector`. **The match engine and the game engine only meet here.** |
| `leagueTable.ts` | Pure helpers: `sortStandings` (league points → points diff → points for), `findStanding`. |
| `teamStats.ts` | Pure derivations from `FixtureResult[]` + overall ratings: `recentForm` (rolling W/L/D pins padded with null on the left), `headToHead` (W/D/L record from one team's POV across every meeting so far), `matchSpread` (rating-derived handicap, favored side negative). Read by `PreMatchScreen`; no module state, no bus subscriptions. |
| `derive.ts` | `deriveFixtureSeed(rootSeed, round, homeId, awayId)` — hashes the inputs so each headless AI fixture has a stable, derivable seed independent of the round in which it was simulated. |
| `age.ts` | Pure `getAge(dobIso, currentDateIso)` — returns null when `dob` is missing. Plus `parseSeasonStartYear(seasonLabel)` and `seasonOpenIso(year)` helpers used by `contractSeeder`, `careerRollover`, `personaGenerator`, and `aiTransferDirector` to anchor age + expiry calculations to the current calendar. |
| `balance/season.ts` | Season tuning constants — `SEASON_VALUES` (start date, season label, week length, season-open anchor month/day, international skip windows) and `LEAGUE_POINTS` (Premiership 4/2/0 + losing bonus when margin ≤ 7). |
| `balance/career.ts` | Rollover tuning — `AGE_CURVES` per stat (peakAge / growth / decline), `STAT_NOISE` (Gaussian std-dev + clamp), `RETIREMENT_CURVE` (forwards / backs cumulative probabilities), `SEASON_AWARDS.mvpMinAppearances`. |
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

**Career layer (Phase 1 of the transfer-system roadmap):**

| Variant | When fired | What it does |
|---|---|---|
| `ROSTER_SEEDED` | One-shot at `newSeason` / v4-save migration | Populates `state.career.roster` keyed by `rosterId`, `ClubState[]`, `nextRosterId`. Source data is the JSON-loaded `RawTeamInput[]` post-`applyStarBoost`. |
| `PLAYER_SEASON_STATS_ACCUMULATED` | Per player per fixture (live + silent AI) | Adds the per-match delta to `roster[rosterId].seasonStats`. Drives top-scorer / MVP cards in `EndOfSeasonScreen`. |
| `PLAYER_AGED` | Per player per rollover | Applies `Partial<PlayerStats>` deltas to `baseStats` (clamped 1-99). Driven by `AGE_CURVES` + `STAT_NOISE` Gaussian noise from `rngTransfer`. |
| `PLAYER_RETIRED` | Per retiring player per rollover | Removes `rosterId` from `ClubState.squad`. The `Player` record stays in `state.career.roster` for archive references. |
| `PLAYER_INJURED` | Per in-match injury at match teardown (player + every AI fixture) | Writes `state.career.roster[rosterId].injury` with kind / severity / weeksRemaining / injuredOn / isRecurrence. Severity + weeks rolled via `rngTransfer` from `INJURY_SEVERITY[kind]`. Snapshots are walked rosterId-ascending so the RNG call order is stable. |
| `INJURY_TICK_ADVANCED` | Per injured roster player at the start of `recordPlayerMatchResult` (before the round's new injuries are added) | Decrements `roster[rosterId].injury.weeksRemaining` by one (floor 0). No RNG. |
| `PLAYER_RECOVERED` | When an injury's `weeksRemaining` would hit 0 after the tick | Clears `roster[rosterId].injury`. Fired in the same pass as the final `INJURY_TICK_ADVANCED`. |
| `CAREER_ARCHIVE_RESTORED` | `fromSave` only | Restores `seasonsCompleted`, `archive`, plus the v7+ optional `freeAgents` + `market` fields and the v8+ optional `pendingMoves`. Keeps every `state.career.*` write inside `applySeasonEvent` so the mutation seam holds across the load path. |
| `SEASON_ROLLED_OVER` | One per rollover, after all `TRANSFER_ACTIVATED` / `PLAYER_AGED` / `PLAYER_RETIRED` / `ACADEMY_GRADUATED` / `FOREIGN_IMPORT_ARRIVED` events for that rollover | Composite: archives just-completed standings + top scorer + MVP into `state.career.archive`, resets `league.results` / `league.standings` / per-player `seasonStats`, replaces `league.fixtures` with the regenerated round-robin, sets the new `seasonLabel`, increments `seasonsCompleted`. Clears `state.career.pendingMoves` as a safety net (they were already drained by the preceding `TRANSFER_ACTIVATED` events). |

`GameCoordinator.rollSeason()` returns the applied `SeasonEvent[]` so `main.ts` can hand it to `RolloverScreen` for the post-apply diff render.

**Market layer (Phases 2-4 of the transfer-system roadmap):**

| Variant | When fired | What it does |
|---|---|---|
| `MARQUEE_DESIGNATED` | User taps the star on `ContractsScreen` (or AI auto-pick in future phases) | Clears `contract.isMarquee` on the prior marquee in the named club's squad, then sets it on the new `rosterId` (or leaves cleared when `rosterId === null`). |
| `MARKET_OPENED` | `GameCoordinator.openRenewalWindow` (phase: `'renewals'`) and `openSigningWindow` (phase: `'signings'`) | Populates `state.career.market` with the discriminated phase + relevant rosterId list + one cached `TransferOffer` per relevant player (expiring players for renewals; free agents + Reg 7 poach candidates for signings), each `status: 'pending'`. |
| `OFFER_SENT` | Reserved for proactive offers; the open-window flows seed offers via `MARKET_OPENED` directly | Idempotent on duplicate IDs — appends to `market.offers`. |
| `OFFER_RESPONDED` | Per offer in `closeRenewalWindow` (one for every pending offer, in stable order) | Flips the offer's `status` to `'accepted'` or `'rejected'`, with optional `rejectionReason`. |
| `CONTRACT_EXTENDED` | Per accepted renewal in `closeRenewalWindow` | Updates the player's `contract.expiresOn` + `contract.annualWage` in place. `clubId` unchanged (renewal stays with current club). |
| `CONTRACT_TERMINATED` | Per rejected renewal (`reason: 'expired'`); proactive releases use `'released'`; `PLAYER_RETIRED` is a separate path | Removes the rosterId from `ClubState.squad`, clears any `isMarquee` flag, appends to `state.career.freeAgents` (unless `reason: 'retired'`), and clears `contract.clubId` so downstream lookups don't show the player as still attached. |
| `MARKET_CLOSED` | `GameCoordinator.closeRenewalWindow` and `closeSigningWindow` — fires after all per-window contract events | Clears `state.career.market` (sets to null). |

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

The game engine emits four `game:*` events through `src/utils/eventBus.ts`. UI modules subscribe and re-render; the game engine never imports any UI module.

| Event | Payload | Subscribers |
|---|---|---|
| `game:initialized` | `{ state: GameState }` | `FixtureListScreen` (initial render after `newSeason` / `fromSave`) |
| `game:fixtureRecorded` | `{ result: FixtureResult; state: GameState }` | `FixtureListScreen`, `RoundResultsScreen` (re-render as each headless AI fixture resolves) |
| `game:weekAdvanced` | `{ state: GameState }` | `FixtureListScreen` (calendar header) |
| `game:seasonComplete` | `{ state: GameState }` | `main.ts` latches a flag; the post-match Continue chain reroutes through `EndOfSeasonScreen` → optional `RenewalsScreen` → optional `TransferMarketScreen` → `RolloverScreen` |

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

**Length + expiry.** Age-banded via `CONTRACT_LENGTH` (under-25s skew to 3-year deals, 30+ to 1-year). Expiry = 30 June of (`seasonStartYear` + `lengthYears`). Initial distribution staggers ~22/38/42 across +1/+2/+3 years so the first rollover doesn't dump every player as a free agent at once.

**Marquees.** One per club, hand-authored via a `Marquee: yes.` annotation on the star player's bullet in `docs/team-data.md`. The annotation translates (via `scripts/generateTeamJsons.mjs`) into a `contract: { isMarquee: true }` partial override in the JSON, which `contractSeeder` honours by copying through. Reputation gets a `+8` bump for marquees. The 6 teams not currently regenerated by the script (those without `*(in game)*` tags) have the override applied by hand-edit to the JSON; both paths produce the same Player shape on the roster.

**Effective cap.** Headline `SENIOR_CAP = £6.4M` + `EFFECTIVE_CAP_CREDITS = £1.4M` (sum of `CAP_CREDITS.homeGrownPool` £600k + `epsPool` £400k + `injuryPool` £400k) = £7.8M. Modelled flat per-club in v1 — every club enjoys the full credit pool without per-player HG/EPS tagging. Brings seeded squads inside their effective cap; tightens the upper wage anchors in lockstep so ordinary stars no longer demand marquee-tier wages outside the marquee slot.

**UI surface.** `src/ui/ContractsScreen.ts` (Hub → Contracts tile) is a sortable squad list with wage / expiry / OVR / age / marquee badge. Interactive as of Phase 3:
- **Marquee toggle**: tap the star column on any row. Going through `MARQUEE_DESIGNATED` so the previous marquee on the same club has their flag cleared automatically.
- **Cap pill**: 3-state colour-coded against the effective cap — `ok` (≤ 95%, green), `tight` (95–100%, amber), `over` (red, with the `CAP` label highlighted). Cap = Σ non-marquee wages; the marquee slot is genuinely cap-excluded.

Expiring-within-10-months rows get a warning chip — a passive signal heading into the renewal window.

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

## Free-agent signings + Reg 7 poaching (Phases 5 + 6)

After the renewal window closes, the signing window opens. Architecture:

1. **`GameCoordinator.openSigningWindow()`** — emits `MARKET_OPENED(phase: 'signings')` with **one cached `TransferOffer` per free agent and per Reg 7 poach candidate**, in a single stable-rosterId order: free agents first (every rosterId in `state.career.freeAgents`), then poach candidates (`aiTransferDirector.poachCandidates(state)` filtered to exclude the player's own club). Each offer's wage is `signingTermsFor(state, rosterId, playerClubId)`, which calls `contractSeeder.seedContractFields` and so advances `rngTransfer` twice per candidate. Caching the offers on `state.career.market.offers` is load-bearing: subsequent UI re-renders + `signFreeAgent` / `preAgreePoach` reads + the AI close pass all see identical terms, so the `rngTransfer` stream is never replayed mid-window.
2. **`TransferMarketScreen`** — splits offers into two sections by `offer.fromClubId` (`''` = free-agent, else poach). Sortable by name / pos / age / OVR / wage with a live projected-cap pill (includes wages of pending poach pre-agreements that haven't yet activated on the squad). Committed rows flip their button to "Undo Sign" / "Undo Pre-Agree" — calling `unsignFreeAgent` / `cancelPreAgreement` — so the user can revise any decision until they Continue. No cap-affordability gate — the user can deliberately overspend.
3. **`GameCoordinator.signFreeAgent(rosterId)`** fires `CONTRACT_SIGNED` at the cached terms — the player joins the user's club immediately. **`preAgreePoach(rosterId)`** fires `PRE_AGREEMENT_SIGNED` which pushes a `PreAgreement` onto `state.career.pendingMoves`; the player completes the current season at their existing club, then `careerRollover.computeRollover` fires `TRANSFER_ACTIVATED` on rollover (atomic squad swap, no `freeAgents` touch).
4. **`GameCoordinator.closeSigningWindow()`** runs `decideAISignings(state, humanClubId)` (greedy by `overall + position-need × 10`, capped at `AI_SIGNINGS_PER_CLUB_LIMIT = 4` per club, `AI_SIGN_CAP_TARGET = 0.92` of effective cap, no OVR floor since the pool is largely sub-70 — score keeps quality ahead of squad-filler) firing `CONTRACT_SIGNED` per accepted, then `decideAIPoaches(state, humanClubId)` (max 1 per non-human AI club, OVR ≥ `aiReleaseRatingFloor`) firing `PRE_AGREEMENT_SIGNED` per accepted. Finally `MARKET_CLOSED`.
5. **`rollSeason()`** runs next, processing `TRANSFER_ACTIVATED` events for every pending move before aging / retirement.

Determinism: every wage decision flows through cached offers seeded once at `openSigningWindow`; the AI close pass reads the same cache. The 3-season `checkSeasonDeterminism` harness exercises both windows between each pair of seasons and hashes the combined offer list + post-window free-agents pool.

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

## Injuries

Persistent contact injuries on the career roster, in-match-triggered and decremented round-by-round until recovery. Match-engine internals (the in-match `cards.injured` bucket, the per-tackle roll, the shared forced-sub flow) live in `docs/match-engine.md` § Injuries. Season-scope mechanics:

- **State**: `Player.injury?: { kind, severity, weeksRemaining, injuredOn, isRecurrence }` on the career-roster Player (absent ⇔ fit).
- **Severity roll**: `GameCoordinator.rollNewInjuryEvents(snapshots)` reads `snapshot.injuryKind` (surfaced by `snapshotMatch`) and rolls severity + weeks via `rngTransfer`. Walks snapshots rosterId-ascending so the career-stream consumption is stable.
- **Recovery tick**: `GameCoordinator.tickInjuryEvents()` runs at the start of `recordPlayerMatchResult` (after the re-entry guard, before any new fixture is recorded). Pure RNG-free walk over `state.career.roster`; emits `INJURY_TICK_ADVANCED` for every injured player and `PLAYER_RECOVERED` for any whose counter hits zero. Order: tick → record fixtures → roll new injuries → `WEEK_ADVANCED`. A player injured at round N retains full `weeksRemaining` into round N+1.
- **Persistence**: injuries survive saves (v9+) and season rollovers (a 26-week ACL in May continues counting down through summer). `careerRollover` doesn't touch the injury field; `SEASON_ROLLED_OVER` resets `seasonStats` but not `injury`.
- **Roster build / squad selection**: `buildTeamFromRoster` partitions `club.squad` so fit players occupy slots 1-23 and injured sink to the wider squad. `applyMatchdaySquad(team, savedSquad, isInjured)` falls back to the underlying team unchanged when a saved squad references an injured player — same shape as the existing "no longer rostered" fallback. PreMatchScreen surfaces a banner; SquadManagementScreen shows the injury badge + rejects swaps that would move an injured player into starters / bench.
- **Calibration**: ~1.87 injuries / match across both teams at `INJURY.basePctPerTackle = 8.0`. Tuning in `src/engine/balance/injuries.ts`; calibration target band is 1.8-2.2.

## Save format

`SAVE_VERSION = 9` (as of v2.56a). `SavedGame` in `src/ui/SaveManager.ts` is a thin serialiser for `GameCoordinator.toSavePayload()`.

| Version | Added |
|---|---|
| v2 | Minimal slice: `playerTeamId`, `seed`, `currentWeek`, `results[]` |
| v3 | `seasonLabel` + `fixtures` snapshot — the schedule as the user saw it at save time, reconstructed verbatim on load |
| v4 | Pre-match preferences: `tactics` + `matchdaySquad` (23 PlayerRefs) |
| v5 | Career snapshot: `career.roster` (Player keyed by rosterId), `career.clubs` (per-club squad pointers), `career.archive` (past standings + awards), `seasonsCompleted`, `nextRosterId` |
| v6 | Each persisted Player carries `contract` + `reputation` (Phase 2) |
| v7 | `career.freeAgents` (rosterIds of players whose contracts expired without renewal) + optional `career.market` (MarketState — live offers when a market window is open mid-save, null otherwise). MarketState gains `phase: 'renewals' \| 'signings'`. Lets the player resume on the same offers after a tab close mid-window. |
| v8 | `career.pendingMoves` (PreAgreement[]) for Phase 6 Reg 7 cross-Prem poaching. The pre-agreed moves persist across saves until activated at the next rollover. |
| v9 | Each persisted Player gains the optional `injury` field (PlayerInjury — `kind`, `severity`, `weeksRemaining`, `injuredOn`, `isRecurrence`). Absent ⇔ fit. Purely additive — older saves load with `injury` undefined on every player. |

**Migration on load** (`GameCoordinator.fromSave`):

- v8 → v9: no-op shim. `injury` is optional; older saves just have it absent on every roster Player.
- v7 → v8: `parseCareer` defaults `pendingMoves` to `[]`. No data loss — pre-v8 there was no Reg 7 flow so no pending moves existed.
- v6 → v7: `parseCareer` defaults `freeAgents` to `[]` and `market` to `null` when the older save omits them. v7 saves loaded by v8 code with `market.phase` missing default the phase to `'renewals'` for backward compat.
- v5 → v6: walk the persisted roster; for any Player missing `contract` or `reputation`, call `contractSeeder.seedContractFields` to backfill. Lossless — the `rngTransfer` stream advances but produces deterministic results for the same root seed.
- v4 → v5: synthesise a fresh roster from JSONs via `rosterSeeder` (lossless — pre-v5 had zero per-player evolution to preserve).
- v3 → v4 → v5: cascades. Schedule restored from the saved snapshot if present; falls back to `PREMIERSHIP_2025_26`.
- v2 → v3: legacy path, no schedule snapshot — falls back to current canonical schedule.
- v1: discarded (predates AI-vs-AI results, league table can't be reconstructed).

The persisted career state always flows through `CAREER_ARCHIVE_RESTORED` (with optional `freeAgents` + `market` + `pendingMoves` fields) so every `state.career.*` write stays inside `applySeasonEvent` — the mutation seam holds even across the load path.

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
