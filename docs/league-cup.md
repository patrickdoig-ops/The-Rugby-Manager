# League Cup

The **League Cup** is a parallel, lower-stakes competition that starts before
the league season and continues during the two international breaks. The
**Assistant Manager (AI) runs every cup match headless** — the user never
plays one live; they only steer it (rest the first-choice XV vs field the best
available) and pick the training plan for the block.

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
  (≥ 4 tries) + losing bonus (≤ 7), applied via the shared `applyToSide`
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
| Autumn break | 1 | Autumn Nations break (after R5) | 8 |
| Six Nations break | 2 | Six Nations break (after R10) + knockouts | 8 |

Fixture dates are synthetic (spaced inside the gap from the league schedule)
and **display-only** — they never drive calendar advance. Cup match seeds use
reserved pseudo-rounds (`CUP_SEED_ROUND`: preseason 100, leg1 101, leg2 102,
SFs 141/142, final 143) clear of the league (1-18) and playoffs (19-20).

### Round-robin leg assignment

`buildCupSeed` generates 5 rounds (circle-method) for each pool. For each
round `ri` (0–4), the home and away fixture legs are assigned as:

| ri | Home leg | Away leg |
|---|---|---|
| 0–1 | 0 (pre-season) | 1 (autumn) |
| 2–3 | 1 (autumn) | 2 (six-nations) |
| 4 | 2 (six-nations) | 2 (six-nations) |

This yields exactly 4+8+8 per pool. Each team plays in all 3 blocks (byes
fall on different teams per round, as expected in a 5-team round-robin).

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

## Assistant-Manager direction

Per block (with a remembered default on `state.player.cupDirection`, set via
`PLAYER_CUP_DIRECTION_SET`):

- **Best available** — `buildCupTeamFromRoster` picks the strongest 23.
- **Rest the starters** — the user's first-choice league XV (slots 1-15 of the
  persisted matchday squad) are held out so they stay fresh for the resumed
  league; dropped automatically if it would leave a short squad.

All cup teams exclude players on international duty and injured players.

## Player impact (self-contained)

- **Condition:** cup minutes drain `Player.condition` via the existing
  `PLAYER_CONDITION_UPDATED` writeback (per fixture), so resting the starters
  genuinely keeps them fresher for Round 6 / Round 11 than fielding them.
  The training block runs *after* the cup sims, so a player who featured ends
  the break at their post-match fatigue + training recovery; a rested player
  recovers from a high base.
- **Development:** one RNG-free `PLAYER_TRAINED` nudge per *featured* player
  per block (`cupDevelopment.ts`, `CUP_DEVELOPMENT` constants) — youth get the
  most, veterans nothing — added to the player's weakest baseStats. Bounded:
  one nudge per block regardless of how many cup games.
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

**Pre-season block** (season start):

1. **League Cup Fixtures** (`cup-fixtures`) — pre-season fixtures + pool
   tables + direction toggle.
2. **Training** (`training`) — the block's training plan.
3. *[block plays out headless: cup fixtures + dev nudge + training (13 days)]*
4. **League Cup Results** (`cup-results`) — pre-season results + pools.
5. **Training impact** (`training-results`) → **Hub** (R1 upcoming).

**International break blocks** (Autumn / Six Nations):

1. **RoundResults → LeagueTable** (the league round just played).
2. **International Call-Ups** (`intl-callups`) — who's away.
3. **League Cup Fixtures** (`cup-fixtures`) — this block's fixtures + pool
   tables + the best-vs-rest direction toggle.
4. **Training** (`training`) — the block's training plan.
5. *[block plays out headless: cup fixtures + knockouts + training + returns]*
6. **League Cup Results** (`cup-results`) — block results + pools + bracket.
7. **Training impact** (`training-results`) → **International returns**
   (`international-break`) → **Hub**.

## Code map

| Concern | File |
|---|---|
| State shape (`PremCupState` / `CupPool` / `CupFixture` / `CupKnockout`) | `src/types/gameState.ts` |
| Mutation seam (`PREM_CUP_*`, `PLAYER_CUP_DIRECTION_SET`) | `src/game/applySeasonEvent.ts` |
| Invariants | `src/game/seasonInvariants.ts` |
| Scheduler (pools, fixtures, redraw, KO seed) | `src/game/cupScheduler.ts` |
| Break orchestration (begin / run split, pre-season block) | `src/game/InternationalBreakCoordinator.ts` → `src/game/GameCoordinator.ts` |
| Cup team building | `src/game/rosterTeamBuilder.ts` (`buildCupTeamFromRoster`) |
| Development nudge | `src/game/cupDevelopment.ts` |
| Tuning | `src/engine/balance/premCup.ts` (`CUP_DEVELOPMENT`) |
| Screens | `src/ui/{CupFixturesScreen,CupResultsScreen}.ts` (+ intl-callups for break blocks), `src/ui/components/cupViews.ts` |
| Save | `SavedSeason.premCup` / `.cupDirection` (additive, no version bump) |
