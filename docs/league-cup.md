# League Cup

The **League Cup** is a parallel, lower-stakes competition that starts before
the league season and continues during the two international breaks. Each cup
matchday is an **ordinary game week** (like a league round): the manager can
**play their own matches live** (pick the squad, watch them in the live match
view, with a per-matchday training week) or **hand each block to the assistant**
(simulated, steered by rest-the-XV vs best-available). The choice is a
remembered preference (`state.player.cupManageLive`), flippable per block on the
decision screen; the cup weeks are driven from the **Hub's cup CTA**, returning
to the Hub between matchdays. Called-up internationals are away for the cup
weeks throughout the break (the rotation challenge).

For the season/career engine internals this sits inside, see
**`docs/game-engine.md`**.

## Format

- **2 pools of 5.** Real 2025-26 groupings (`CUP_POOLS_2025_26` in
  `src/game/cupScheduler.ts`):
  - **Pool A:** Bath, Bristol, Exeter, Gloucester, Sale
  - **Pool B:** Harlequins, Leicester, Newcastle, Northampton, Saracens
- **Full home-&-away double round-robin** within each pool — 8 games/team,
  20 fixtures per pool, 40 total. Split across **3 blocks**:
  - **Leg 0 (Pre-season):** 4 fixtures/pool — Sep, before league R1
  - **Leg 1 (Autumn block):** 8 fixtures/pool — Autumn Nations break
  - **Leg 2 (Six Nations block):** 8 fixtures/pool + knockouts
- **Points:** identical to the league — 4 win / 2 draw / 0 loss + try bonus
  (≥ 4 tries) + losing bonus (≤ 7), applied via the shared `applyResultToStanding` (`leagueTable.ts`)
  helper in `src/game/applySeasonEvent.ts`. Cup standings are scoped per pool
  and live on `state.league.premCup`, **never** on `state.league.standings`.
- **Knockouts** (Six Nations block, after the leg-2 pool stage): top two per
  pool → **SF1 = winner(A) v runner-up(B)**, **SF2 = winner(B) v runner-up(A)**
  → **Final** (neutral venue). SF winners cascade into the final's slots; the
  final winner is crowned `championTeamId` and archived onto `ArchivedSeason`.

## Calendar mapping

The three blocks map to the real 2025-26 Premiership Rugby Cup schedule:

| Block | Leg | When | Fixtures/pool |
|---|---|---|---|
| Pre-season | 0 | Sep 12–20, before league R1 | 4 |
| Autumn break | 1 | Autumn Nations break (after R5) | 6 |
| Six Nations break | 2 | Six Nations break (after R10) + knockouts | 10 |

Fixture dates are synthetic (spaced inside the gap from the league schedule).
As the manager plays through the cup weeks `calendar.date` steps to each
matchday (`MATCHDAY_ADVANCED`, display + training-gap only); `calendar.week`
(the league-round cursor) stays parked until the break ends. Cup match seeds use
reserved pseudo-rounds (`CUP_SEED_ROUND`: preseason 100, leg1 101, leg2 102,
SFs 141/142, final 143) clear of the league (1-18) and playoffs (19-20).

### Year-1 fixture schedule

For the 2025/26 season, `buildCupSeed` receives `CUP_FIXTURES_2025_26` — a
hardcoded list of all 40 real-world matchups with their actual calendar dates.
This ensures the specific pairings and dates match the authentic Premiership
Rugby Cup schedule (e.g. Harlequins play in both pre-season rounds; Bath and
Northampton have byes in Round 1; Sale and Newcastle have byes in Round 2).

### Year-2+ algorithmic assignment

For season 2 onward (pools redrawn), `buildCupSeed` falls back to the
circle-method round-robin. For each round `ri` (0–4), legs are assigned as:

| ri | Home leg | Away leg |
|---|---|---|
| 0–1 | 0 (pre-season) | ri=0: 1 (autumn); ri=1: 2 (six-nations) |
| 2–3 | 1 (autumn) | 2 (six-nations) |
| 4 | 2 (six-nations) | 2 (six-nations) |

This yields exactly 4+6+10 per pool.

## Season start

The **season now begins at the pre-season cup block**, not at league R1.
After starting a new game (or on first load), the pre-season chain fires:

1. **League Cup Fixtures** (`cup-fixtures`) — pre-season fixtures + pool
   tables + direction toggle.
2. **Training** (`training`) — the block's training plan.
3. *[block plays out headless: cup fixtures + dev nudge + training]*
4. **League Cup Results** (`cup-results`) — pre-season results + pools.
5. **Training impact** (`training-results`) → **Hub** (R1 upcoming).

Detected via `isPreSeasonCupPending()` / `beginPreSeasonBlock()` /
`runPreSeasonBlock()` on `InternationalBreakCoordinator`.

## Future seasons

Pools are **redrawn each season** via the career RNG (`redrawCupPools`,
deterministic Fisher-Yates over the sorted team-id list). The redraw is the
only new `rngTransfer` consumer and is appended **last** in
`computeRollover` so it can't shift any prior career draw (aging /
retirements / academy / imports). Year 1 uses the fixed real pools (RNG-free).

## Manage live vs assistant

The decision screen (`CupFixturesScreen` pre_block mode) offers two choices,
shown once at the start of each block (`isCupBlockStart()`):

- **I'll manage them** (`cupManageLive = true`, `PLAYER_CUP_MANAGE_LIVE_SET`) —
  each of the manager's cup fixtures is played live: PreMatch squad selection →
  team talk → live match → result → a per-matchday training week (`runCupMatchdayTraining`,
  gap-scoped to the next matchday) → back to the Hub. The selectable XV excludes
  on-duty internationals (`selectionUnavailableIds` includes `internationalDuty`,
  which is only set during a break) + injured + suspended players. The picked 23
  persists as the league default (`PLAYER_MATCHDAY_SQUAD_SET`).
- **Assistant manages** (`cupManageLive = false`) — the manager's fixtures are
  simulated headless (`runPlayerCupFixtureHeadless`), steered by the remembered
  `cupDirection` (`PLAYER_CUP_DIRECTION_SET`):
  - **Best available** — `buildCupTeamFromRoster` picks the strongest 23.
  - **Rest the starters** — the user's first-choice league XV (slots 1-15 of the
    persisted matchday squad) are held out so they stay fresh; dropped
    automatically if it would leave a short squad.

Every other club's cup fixtures are always simulated headless (`simRestOfCupLeg`
/ `simDueCupKnockouts`, skipping the player's team). All cup teams exclude
players on international duty and injured players.

## Weekly flow + cursor (`getCupBreakStep`)

The cup break is no longer a single headless block — it is a sequence of game
weeks driven from the Hub. `GameCoordinator.getCupBreakStep()` returns the next
action, in priority order:

- `play_fixture` — the manager has a due cup fixture (`getCurrentCupFixture`,
  pool or knockout). Played live or assistant-simmed per `cupManageLive`.
- `advance_round` — sim the rest of the active leg's fixtures / knockout matches
  (`simDueCupFixtures`), then show the completed leg / KO round (`getCurrentCupRound`
  → `CupResultsScreen` → `PREM_CUP_ROUND_SHOWN`).
- `resolve_returns` — the cup is done and internationals are still away; process
  returns (`resolveInternationalWindow`) and restore the calendar to the league
  round.

The active leg is scoped by **which break the calendar is in** (`activeCupLeg`:
leg 0 = pre-season before any league result; leg 1 = Autumn break; leg 2 = Six
Nations break) — not by fixture dates, so the synthetic year-2+ schedule can't
mis-scope it. Resume is cursor-based: `CupFixture.result.playerSide` (+ the KO
equivalent) and the per-leg `legFeatured` accumulator are persisted, so an
interrupted break re-enters cleanly from the Hub cup CTA — exactly like the
European weekly flow.

## Player impact (self-contained)

- **Condition:** cup minutes drain `Player.condition` via the existing
  `PLAYER_CONDITION_UPDATED` writeback (per fixture), so resting the starters
  genuinely keeps them fresher for Round 6 / Round 11 than fielding them.
  The training block runs *after* the cup sims, so a player who featured ends
  the break at their post-match fatigue + training recovery; a rested player
  recovers from a high base.
- **Development:** one RNG-free `PLAYER_TRAINED` nudge per *featured* player
  per leg (`cupDevelopment.ts`, `CUP_DEVELOPMENT` constants) — youth get the
  most, veterans nothing — added to the player's weakest baseStats. Bounded:
  one nudge per leg regardless of how many cup games. Featured players are
  accumulated across the leg's matchdays in the persisted `PremCupState.legFeatured`
  (`PREM_CUP_FEATURED_ADDED`) so the nudge is reload-safe, and fired when the
  leg's last fixture resolves (`maybeFireCupLegDevelopment`).
- **Injuries:** applied identically to league matches — severity and duration
  rolled via `rngTransfer`, the player's `injury` record set. An injured player
  counts as unavailable for subsequent cup fixtures in the same break block
  (and for league fixtures until recovered). `buildCupTeamFromRoster` already
  filters injured players, so a player hurt in fixture 1 of a block is
  automatically excluded from fixture 2.
- **No** effect on transfer budgets, salary cap, or reputation. Cup stats are
  **not** accumulated into the league season-stat leaderboards (the cup sims
  deliberately skip `collectSeasonEvents`).

## Break flow (UI)

The cup is driven from the **Hub's cup CTA** (`onPlayCup` → `onPlayCupStep` in
`main.ts`), one matchday per tap, returning to the Hub between.

**Pre-season block** (season start): the Hub shows the cup CTA before R1.

1. *(first tap)* **League Cup decision** (`cup-fixtures`) — manage-live vs
   assistant (+ direction when assistant), seeded from the saved prefs.
2. **Cup matchday** — live (PreMatch → team talk → match → result) or
   assistant-simmed, then a **Training** week → **Hub**.
3. *(repeat per matchday)*; an `advance_round` step shows **Cup Results**
   (`cup-results`) when a leg completes.
4. Once leg 0 is done the cup CTA disappears → Hub shows the R1 league CTA.

**International break blocks** (Autumn / Six Nations):

1. **RoundResults → LeagueTable** (the pre-break league round), then straight
   to the **Hub** (the league round skips its own training week).
2. *(first cup tap)* **International Call-Ups** (`intl-callups`) → **League Cup
   decision** (`cup-fixtures`).
3. **Cup matchdays** as above (live / assistant + per-matchday training),
   knockouts played live when the manager qualifies.
4. When the leg + knockouts are done, the `resolve_returns` step shows
   **International returns** (`international-break`) and restores the calendar →
   **Hub** → next league round.

## Code map

| Concern | File |
|---|---|
| State shape (`PremCupState` incl. `shownRounds`/`legFeatured`, `CupFixture.result.playerSide`, `CupRoundRef`) | `src/types/gameState.ts` |
| Mutation seam (`PREM_CUP_*`, `PLAYER_CUP_DIRECTION_SET`, `PLAYER_CUP_MANAGE_LIVE_SET`, `MATCHDAY_ADVANCED`) | `src/game/applySeasonEvent.ts` |
| Invariants | `src/game/seasonInvariants.ts` |
| Scheduler (pools, fixtures, redraw, KO seed) | `src/game/cupScheduler.ts` |
| Live weekly flow (cursor, record, sim-rest, dev nudge, returns bracketing) | `src/game/InternationalBreakCoordinator.ts` → `src/game/GameCoordinator.ts` |
| Cup team building | `src/game/rosterTeamBuilder.ts` (`buildCupTeamFromRoster`) |
| Development nudge | `src/game/cupDevelopment.ts` |
| Tuning | `src/engine/balance/premCup.ts` (`CUP_DEVELOPMENT`) |
| Driver + match flow | `src/main.ts` (`onPlayCupStep` / `onPlayCupMatch` / `afterCupMatch`) |
| Screens | `src/ui/{CupFixturesScreen,CupResultsScreen}.ts`, `src/ui/HubScreen.ts` (cup CTA), `src/ui/components/cupViews.ts` |
| Save | `SavedSeason.premCup` / `.cupDirection` / `.cupManageLive` (additive, no version bump) |
