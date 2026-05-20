# Transfer System & Career Mode — Plan

Future-feature plan for multi-season career mode and the transfer market. Not yet implemented; this doc is the source of truth for the agreed shape so the work can be split across many small commits.

This is a **plan**, not a spec. Phase scope, balance constants, and UI copy will firm up as we build. The data shapes and mutation-seam additions in §6–§8 are firm — those are the parts that need to be right before any code lands.

---

## 1. Scope

Two intertwined features delivered in sequence:

1. **Multi-season rollover** — the league restarts, ages tick, stats develop, retirements happen, fixtures regenerate, save persists across seasons. No market.
2. **Transfer market** — contracts, salary cap with one marquee slot, end-of-season window, AI-driven cross-club movement, generated player supply.

Career mode is the umbrella; rollover is the prerequisite.

### Decisions locked

| Decision | Choice |
|---|---|
| Rollover order | First, as standalone milestone — then transfers on top |
| Cap fidelity | £6.4M senior cap + 1 excluded marquee player. **No** HG / EPS credit pools in v1 |
| Player supply | Closed system + free-agent pool + generated stream (academy graduates + foreign imports) each summer |
| Player agency model | Wage + ambition (league position / silverware). Current-club loyalty bonus |
| Rollover scope | Stat development by age curve + age-based retirements. **No** injuries in v1 |
| Future fixtures | Year 1 = `PREMIERSHIP_2025_26` verbatim. Year 2+ = regenerate via `src/game/fixtures.ts::generateFixtures` |
| Doc location | This file, source of truth for the feature |

### Explicitly out of scope (v1)

- **Salary-cap credits** (Home Grown £600k pool, EPS/International £400k pool, £80k per-player ceiling). Documented in §3 for future addition.
- **PGP / hybrid RFU contracts** — modelled as a flat top-up later, if at all.
- **EQP quota** (15 EQP avg in matchday 23). A real Premiership rule but adds compositional constraint; defer.
- **Long-term injury system** and injury-dispensation cap relief.
- **Mid-season transfers / buyouts** (Farrell-from-Racing style). Rare in reality; defer.
- **Loan system** (max 3 loanees per matchday squad). Defer.
- **Championship promotion pipeline** — league ringfenced for 2025/26 anyway.

---

## 2. Research summary

Condensed reference of the rules being modelled. Full citations in the research notes attached to the planning conversation; key facts only here.

### Salary cap

- **Headline cap: £6.4m per club** for 2025/26 (returned to this level after the Covid-era cut to £5m). Covers the **Senior Squad**, distinct from Academy.
- **Cap year runs 1 July – 30 June** — aligns with the rugby season.
- **Marquee / excluded player:** 1 per club (down from 2, post-grandfathering). Salary is outside the cap and confidential.
- **Enforcement:** salary-cap manager with audit powers; sanctions escalate from fines (4-point deduction up to £75k breach) to **40-point deduction** for breaches over £250k, up to relegation. Modelled as a hard constraint: offers that breach cap cannot be submitted.

### Contract timing

- **No formal transfer window.** Deals can be agreed year-round.
- **RFU Regulation 7:** a contracted player may only be **approached by another club in the final 12 months of their deal** (or with their current club's written consent). This is the core market gating mechanic.
- **Contracts run on the cap year.** New deals take effect **1 July**.
- **Gentleman's agreement** that new signings aren't announced before 1 January of the season they take effect — increasingly honoured in the breach in real life; we ignore this in v1 (announcements are immediate on accept).

### Wage tier anchors (for balance constants)

| Tier | Indicative wage |
|---|---|
| Marquee international | £600k–£800k+ |
| Established Test starter | £200k–£400k |
| Premiership regular starter | £120k–£200k |
| Senior squad / rotation | £60k–£120k |
| 2020/21 senior average | £171k (adjust up; sets a sanity check) |
| Academy graduate (rookie fixed) | £18.2k–£20.2k (RPA agreement, 2-year deals) |

These anchor `src/engine/balance/transfers.ts` — they are not hardcoded into resolvers (see CLAUDE.md "Balance constants").

### Contract length

- Senior pros: **1–3 years** typical. Marquee deals occasionally longer.
- Academy rookie: **2-year fixed** under the 2025/26 RPA agreement.

### Player supply (real-world)

- Cross-Prem moves (most common).
- Foreign imports: South Africans, Pacific Islanders, Australians/Kiwis. Modelled as part of the generated stream.
- Academy graduates: typical first senior contract age 18–20.
- Championship: closed pipeline for 2025/26; cherry-picks only.

---

## 3. Data model additions

### `Player` (extend in `src/types/player.ts`)

```ts
interface Player {
  // ... existing fields ...
  contract: PlayerContract;
  reputation: number;        // 0–100, drives appeal to other clubs and wage demands
}

interface PlayerContract {
  clubId: string;            // current club; same as the team that owns this Player
  expiresOn: string;         // ISO yyyy-mm-dd, always 30 June of the season-end year
  annualWage: number;        // £ per year, gross
  isMarquee: boolean;        // true ⇔ this player occupies the club's one marquee slot
}
```

`reputation` is a derived-ish stat we'll seed from `baseStats` average + a manual nudge for known stars in the team JSON (so Russell, Itoje etc. start as obviously elite). It then drifts up/down across seasons with form and silverware.

### `Team` runtime state (extend in `src/types/team.ts`)

The matchday `Team` doesn't need transfer data — the matchday 23 is a snapshot of one game. Career-scope club state belongs on `GameState`, not the per-match `Team`.

### Career-scope club state (new in `src/types/gameState.ts`)

```ts
interface ClubState {
  id: string;
  squad: PlayerRef[];        // all senior-squad player ids
  capUsed: number;           // derived from squad contracts + marquee exclusion
  marqueePlayerId: number | null;
  budgetRemaining: number;   // separate from cap; owner-cash for one-off costs
  reputation: number;        // 0–100; affects who signs for the club
  ambition: number;          // 0–100; derived from recent league finish + silverware
}

interface GameState {
  // ... existing fields ...
  clubs: ClubState[];
  freeAgents: PlayerRef[];   // unsigned players in the supply pool
  market: MarketState | null;  // populated during the end-of-season window
}

interface MarketState {
  windowOpen: boolean;
  openedAt: string;          // ISO
  closesAt: string;          // ISO; end-of-window snapshot
  pendingOffers: TransferOffer[];
}

interface TransferOffer {
  id: string;                // deterministic from (round, fromClubId, playerId, attempt)
  fromClubId: string;
  playerId: number;
  annualWage: number;
  lengthYears: number;       // 1–4
  isMarquee: boolean;        // whether the offering club intends this signing as their marquee
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  rejectionReason?: 'wage' | 'ambition' | 'cap_overcommit';
}
```

`PlayerRef` is a thin `{ clubId, playerId }` so we don't denormalise full `Player` objects across the state tree. Lookups happen through a helper.

### Player roster — where do `Player` objects actually live?

Currently `Player` objects live nested inside `RawTeamInput.players` / `bench` / `squad` (JSON files), and `MatchCoordinator` hydrates a fresh in-memory team per match. **Career mode breaks that assumption.** The senior squad needs to persist across matches and seasons with stable identity (stats, age, contract, form trajectory).

Proposed split:
- **Roster** (mutable, owned by `GameCoordinator`): canonical `Player` records for every senior player at every club + free agents. Keyed by `playerId`.
- **`RawTeamInput`** (immutable JSON): only used to **seed** the roster at the first-ever new-game start. After that, the roster is what matters.
- **Matchday `Team`** (existing): built fresh per match by `MatchCoordinator` from current roster state + matchday selection.

This is the single biggest architectural change in the rollover work, separate from any transfer logic. It must land in Phase 1.

---

## 4. Mutation-boundary additions (`SeasonEvent`)

All season-scope writes continue to flow through `applySeasonEvent` (see CLAUDE.md §5). The `SeasonEvent` union grows with strictly domain-meaningful variants — no generic setters.

### Rollover-phase variants (Phase 1)

```ts
| { type: 'SEASON_ROLLED_OVER';
    newSeasonLabel: string;
    newFixtures: Fixture[];
    archivedStandings: TeamStanding[]; }
| { type: 'PLAYER_AGED';
    playerId: number;
    newDob: string;              // unchanged; aging derives from calendar
    statDeltas: Partial<PlayerStats>;  }
| { type: 'PLAYER_RETIRED';
    playerId: number;
    clubId: string;              }
```

`SEASON_ROLLED_OVER` is the one big event; the aging and retirement events are fired in a loop inside `GameCoordinator.rollSeason()` before it. This keeps each event narrow and the determinism log replayable.

### Contract-phase variants (Phases 2–4)

```ts
| { type: 'CONTRACT_SIGNED';
    playerId: number;
    clubId: string;
    contract: PlayerContract; }
| { type: 'CONTRACT_EXTENDED';
    playerId: number;
    newExpiresOn: string;
    newAnnualWage: number; }
| { type: 'CONTRACT_TERMINATED';
    playerId: number;            // → goes to freeAgents
    reason: 'released' | 'expired' | 'retired'; }
| { type: 'MARQUEE_DESIGNATED';
    clubId: string;
    playerId: number | null;     }
```

### Market-phase variants (Phases 5–6)

```ts
| { type: 'MARKET_OPENED'; closesAt: string; }
| { type: 'MARKET_CLOSED'; }
| { type: 'OFFER_SENT';      offer: TransferOffer; }
| { type: 'OFFER_RESPONDED'; offerId: string; accept: boolean; reason?: string; }
| { type: 'OFFER_WITHDRAWN'; offerId: string; }
```

### Supply-phase variants (Phase 7)

```ts
| { type: 'ACADEMY_GRADUATED';
    clubId: string;
    player: Player; }            // generated persona
| { type: 'FOREIGN_IMPORT_ARRIVED';
    player: Player;              // unsigned → joins free-agent pool
    askingWage: number; }
```

The exhaustive `default: const _: never = event` contract is preserved at every step.

---

## 5. Determinism

A fourth seeded RNG stream joins the three in `src/utils/rng.ts`:

```ts
rngTransfer(min?: number, max?: number): number  // mulberry32, seeded once per
                                                   // session from state.seed
```

All AI offer construction, free-agent selection, persona generation, and stat-development RNG must flow through this stream. **None of them touch `rng()` / `rngForm()` / `pickRandom()`** — adding a transfer line cannot perturb a match outcome or a commentary draw.

`scripts/checkSeasonDeterminism.ts` is extended to:
1. Run a 3-season career with fixed seed.
2. Snapshot: every contract, every offer, every free-agent transition, every generated persona.
3. Re-run from the same seed; assert byte-equal snapshots.

A career with a given seed is **fully reproducible**, including who signs where in year 3.

---

## 6. UI surface

Hub already has placeholder tiles for `Contracts` and `Transfers` (`src/ui/HubScreen.ts:68-69`). Both become live destinations.

### New screens

| Screen | Triggered from | Purpose |
|---|---|---|
| **EndOfSeasonScreen** | Auto, after final-round result | Show final table, club season summary (W/D/L, top scorer, ratings), then advance to rollover |
| **RolloverScreen** | After EndOfSeason "Continue" | Animate: ages tick, retirements announced, stat changes, academy graduates, free-agent pool populated. One-screen recap |
| **ContractsScreen** | Hub → Contracts tile | Squad list with contract status, expiry, wage, marquee badge. Approach to renew |
| **TransferMarketScreen** | Hub → Transfers tile | List of approachable players (expiring contracts + free agents), filter by position, sort by wage/reputation/age |
| **OfferModal** | TransferMarket → row click | Compose an offer: wage, length, marquee flag. Shows cap impact preview |
| **CapDashboard** | Hub → Contracts → "Cap" pill | Current cap usage, marquee designation, projected next-season cap given pending offers |

### Existing screens that need updates

- **HubScreen** — Cap usage chip in the header (read-only), badge on Transfers tile when offers need response or window is open.
- **TeamInfoScreen** — show contract expiry on each player row.
- **PreMatchScreen** — no change v1; matchday selection is unaffected.
- **MatchResultScreen** — unchanged; rollover triggers from EndOfSeasonScreen, not from each match result.

### Navigation flow (unchanged philosophy)

```
Match → MatchResult → Hub                       (mid-season, unchanged)
Final-round result → EndOfSeasonScreen
                  → RolloverScreen
                  → Hub (new season, market open)
Hub → Transfers tile → TransferMarketScreen → OfferModal → Hub
Hub → Contracts tile → ContractsScreen → OfferModal → Hub
```

Hub remains the top of the stack. Settings is still the exit route.

---

## 7. Save schema

Each landing milestone bumps `SAVE_VERSION` in `src/ui/SaveManager.ts`:

| Version | Adds |
|---|---|
| v4 | Rollover: roster snapshot (all `Player` records), `seasonsCompleted`, archived per-season standings |
| v5 | Contracts: every player's `contract` field + `clubs[]` with marquee designation |
| v6 | Market: pending offers, free-agent pool, `MarketState` if window is open |

Saves older than current are best-effort migrated where the missing data has sensible defaults (e.g. v3 → v4: synthesise a roster from `RawTeamInput`; assume current season is season 1). v1 saves are still discarded.

---

## 8. Phased implementation plan

Each phase is **independently shippable** and **builds clean / `npm run verify` green** on its own. One cohesive split per commit; per CLAUDE.md, a module-boundary change is an engine change and updates `docs/engine.md` in the same commit.

### Phase 1 — Multi-season rollover (no market)

**Goal:** the player can complete season 1 and click "Next Season" to play season 2 with the same squad, one year older, possibly with some retirements, on regenerated fixtures.

**Work items:**
1. Extract `Player` records out of `RawTeamInput` and into a `GameState.roster` map keyed by `playerId`. `RawTeamInput` becomes a one-time seed source for new games.
2. Add `clubs[]: ClubState[]` to `GameState`. Initially each club's `squad` is just the union of `players + bench + squad` from its JSON.
3. New `src/engine/balance/career.ts` — age curves, retirement thresholds, stat-development per stat.
4. New `src/game/careerRollover.ts` — pure module that, given `GameState`, produces the `SeasonEvent[]` for a rollover (aging, retirements, fixture regen, standings archive).
5. Wire `EndOfSeasonScreen` + `RolloverScreen` into `main.ts` and `ScreenRouter`.
6. Save v4: persist the roster snapshot + season counter.
7. Extend `checkSeasonDeterminism.ts` to cover a 3-season career.
8. Update `docs/engine.md` "Season-scope mutation seam" section to document the new variants and the roster ownership change.

**Out of scope:** any contracts, any market, generated personas.

### Phase 2 — Read-only contract data

**Goal:** every player has a contract; you can see expiry and wage; nothing changes behaviour-wise.

**Work items:**
1. Add `contract` and `reputation` fields to `Player` (`src/types/player.ts`).
2. Update `docs/team-data.md` (source of truth) with seeded contract data per player — varied expiry years (so not all expire at once), wages anchored to reputation tier.
3. Regenerate JSONs via `scripts/generateTeamJsons.mjs`.
4. New `ContractsScreen` shows squad with contract column.
5. Hub Contracts tile becomes live.
6. Save v5.

**Out of scope:** any market activity, cap enforcement, marquee designation.

### Phase 3 — Salary cap + marquee

**Goal:** every club has a visible cap usage. Each club designates one marquee player (free choice for the human; AI auto-picks the highest-paid).

**Work items:**
1. `MARQUEE_DESIGNATED` event + handler.
2. Derived `capUsed = Σ(squad wages) - marqueeWage`.
3. New `CapDashboard` screen showing cap usage, marquee, projected impact.
4. `src/engine/balance/transfers.ts` — `SENIOR_CAP = 6_400_000`, wage anchors, etc.

**Out of scope:** any active market. Cap is decorative until Phase 4.

### Phase 4 — End-of-season renewals only

**Goal:** at end of season, expiring contracts trigger an offer screen. Human can renew their own expiring players within cap. AI auto-renews theirs.

**Work items:**
1. `MARKET_OPENED` / `MARKET_CLOSED` events firing from `EndOfSeasonScreen` → `RolloverScreen` transition.
2. `OFFER_SENT` / `OFFER_RESPONDED` events (only own-club renewals).
3. `OfferModal` UI.
4. Rejection model: wage-driven; current club has a loyalty discount on demanded wage.
5. Unrenewed players → `CONTRACT_TERMINATED reason: 'expired'` → `freeAgents`.
6. New `src/engine/AITransferDirector.ts` — pure RNG-only module, called for each AI club to decide renewals. Constructor analogous to `AITacticalDirector`.

**Out of scope:** signing other clubs' players, free-agent signings, generated supply.

### Phase 5 — Free-agent pool, both sides can sign

**Goal:** human and AI can sign any free agent during the end-of-season window.

**Work items:**
1. `TransferMarketScreen` lists free agents.
2. AI scoring function for free agents: position need × reputation × wage affordability.
3. Multi-offer handling — if multiple clubs offer same player, deterministic resolution by `(wage, ambition, rngTransfer tiebreak)`.
4. Window "tick": player advances time by clicking "Continue Window". Each tick, AI sends new offers and resolves any matured ones.

**Out of scope:** cross-Prem poaching of contracted players.

### Phase 6 — Cross-Prem poaching (Reg 7)

**Goal:** approach players at other clubs whose contract enters its final 12 months. Effective 1 July of next season.

**Work items:**
1. `OFFER_SENT` from non-current club allowed iff `contract.expiresOn` is within 12 months of current calendar date.
2. Offer takes effect on `SEASON_ROLLED_OVER` for the relevant season — the player's `clubId` changes only then.
3. Visible "Approaching expiry" badge in `TransferMarketScreen`.
4. AI poaching logic in `AITransferDirector` (target position-of-need + reputation gap they can afford).

**Out of scope:** mid-season activation, buyouts, loan deals.

### Phase 7 — Generated supply (academy + foreign)

**Goal:** the league no longer feels closed. Each summer, every club graduates some academy players and a handful of foreign imports enter the free-agent pool.

**Work items:**
1. Persona generator (`src/game/personaGenerator.ts`): deterministic from `rngTransfer`. Inputs: nationality bias for club, target position, target rating band. Outputs: a `Player` with name, dob, baseStats, position, nationality, starting reputation.
2. Name pools by nationality (English, Welsh, Scottish, Irish, French, South African, NZ/Australian, Pacific Islander, Argentinian).
3. `ACADEMY_GRADUATED` fired during `SEASON_ROLLED_OVER`: 2–4 graduates per club, ages 18–20, starting reputation 25–50, fixed rookie wage.
4. `FOREIGN_IMPORT_ARRIVED` fired before market opens: 5–10 imports per summer, ages 23–30, varied tier.
5. Match-engine compatibility check: any code that assumed `player.id ≤ 23` or used `Player.id` as a stable cross-team index must be audited.

**Out of scope:** rugby league converts, Championship promotions, retiring international stars joining from URC mid-career (these are individually scriptable later).

---

## 9. Open implementation questions

These are deferred to the moment each phase actually starts — recorded so they don't get lost.

1. **Wage formula calibration.** Proposed: `wage = base(rating) × ageMultiplier(age) × positionScarcity(position)`. Anchors in `balance/transfers.ts`. Numbers TBD; tune via telemetry once Phase 4 ships.
2. **Reputation drift.** Does winning silverware bump everyone in the squad by +N reputation? Probably yes, scaled by appearances. Confirm at Phase 2.
3. **Retirement curve shape.** Probability of retirement at end of season — proposed: 0% under 32, ramping to ~50% at 35, 100% at 38. Position-dependent (props/locks last longer than 9/15). Confirm at Phase 1.
4. **Stat development curve per stat.** Pace/agility decline earliest; kicking/composure/positioning hold longest. Concrete coefficients at Phase 1.
5. **Squad size limits.** Premiership senior squad is ~40. Do we enforce a max squad size, or trust the cap to do it implicitly? Trusting the cap is simpler; revisit if AI builds 60-man squads.
6. **What happens when the human team can't afford their renewals?** Pre-window warning. UI: red badge on Contracts tile if projected next-season cap exceeds limit at current renewal offers.
7. **Owner cash / transfer budget.** Distinct from cap. v1 sketch: every club gets a flat seasonal budget that resets each year; no clever finance modelling. Could later add gate receipts / sponsor income.

---

## 10. References

Sources for §2 research are recorded in the planning conversation transcript and cited inline there. Key official references:

- RFU Regulation 7 (player approaches, contracts, movement) — englandrugby.com
- PRL Salary Regulations (2021/22 board-approved version, post-Covid recalibration) — premiershiprugby.com
- RPA × PRB Rookie Fixed Academy Wage agreement (Feb 2025) — therpa.co.uk
- Lord Myners review (post-Saracens; 52 recommendations adopted)

When implementing, re-verify current-season cap figures against the latest PRL handbook before hardcoding any constant in `balance/transfers.ts`.
