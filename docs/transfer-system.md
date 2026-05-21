# Transfer System & Career Mode — Roadmap

Roadmap for multi-season career mode and the transfer market, with phase status. **Phases 1 + 2 shipped on main (v2.23a)** — multi-season rollover with aging/retirements/fixture regen, plus read-only contract data with marquee designations. **Phases 3-7 still ahead** — cap enforcement, end-of-season renewals, free-agent signings, cross-Prem poaching (Reg 7), generated player supply.

This started as a forward-looking plan and is partially live; the data shapes and mutation seams in §3–§5 are now grounded in shipped code (with `// ✅ live` / `// 🚧 future` annotations). UI / balance / phase scope for the remaining phases is still firm only at the architectural level — concrete numbers and UI copy land as each phase opens.

---

## 1. Scope

Two intertwined features delivered in sequence:

1. **Multi-season rollover** ✅ — the league restarts, ages tick, stats develop, retirements happen, fixtures regenerate, save persists across seasons. No market. *(Phase 1, shipped v2.22a.)*
2. **Transfer market** 🚧 — contracts (read-only ✅ v2.23a), salary cap with one marquee slot, end-of-season window, AI-driven cross-club movement, generated player supply.

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

### `Player` ✅ live (`src/types/player.ts`)

```ts
interface Player {
  // ... existing fields ...
  rosterId: number;           // ✅ globally unique persistent identity (separate from `id`, the 1–23 matchday slot)
  seasonStats: PlayerSeasonStats; // ✅ per-season aggregator, reset on SEASON_ROLLED_OVER
  reputation: number;         // ✅ 0–100, seeded from rating + marquee bonus
  contract: PlayerContract;   // ✅ read-only in Phase 2
}

interface PlayerContract {    // ✅ live
  clubId: string;
  expiresOn: string;          // ISO yyyy-06-30
  annualWage: number;         // £ per year, gross
  isMarquee: boolean;
}
```

`reputation` is currently seeded purely from overall rating × `REPUTATION_SEED.ratingMultiplier` + `marqueeBonus` (no `baseStats` average yet). Drift across seasons with form / silverware is Phase 3+ work.

### `Team` runtime state (`src/types/team.ts`)

The matchday `Team` doesn't carry transfer data. Career-scope club state lives on `GameState.career`, not the per-match `Team`. The matchday team is *built* from the roster on every fixture via `src/game/rosterTeamBuilder.ts::buildTeamFromRoster(state, teamJson)` — team identity from JSON, player data from roster.

### Career-scope state ✅ shipped + 🚧 future (`src/types/gameState.ts`)

```ts
// ✅ live
interface ClubState {
  id: string;
  squad: number[];           // rosterIds of every player signed to the club
}

interface CareerState {
  seasonsCompleted: number;
  archive: ArchivedSeason[]; // standings + top scorer + MVP per past season
  clubs: ClubState[];
  roster: Record<number, Player>;  // key: rosterId
  nextRosterId: number;
}

interface GameState {
  // ... existing ...
  career: CareerState;
}

// 🚧 future (Phases 3-6)
//
// ClubState gains: capUsed (derived), marqueePlayerId, budgetRemaining,
// reputation, ambition.
//
// GameState gains: freeAgents (rosterId[]), market (MarketState | null).
//
// interface MarketState {
//   windowOpen: boolean;
//   openedAt: string;
//   closesAt: string;
//   pendingOffers: TransferOffer[];
// }
//
// interface TransferOffer {
//   id: string;              // deterministic from (round, fromClubId, rosterId, attempt)
//   fromClubId: string;
//   rosterId: number;
//   annualWage: number;
//   lengthYears: number;
//   isMarquee: boolean;
//   status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
//   rejectionReason?: 'wage' | 'ambition' | 'cap_overcommit';
// }
```

**Identity note.** During planning the doc proposed `playerId` as the persistent identity. Shipped reality: a separate `rosterId` field keeps `Player.id` as the 1–23 matchday slot (preserves the match-engine contract — every event/system reads `id` as a jersey number). All career-scope event variants use `rosterId`. `PlayerRef` (firstName + lastName) remains the cross-save key for persisted matchday-squad snapshots.

### Player roster — where do `Player` objects live? ✅ resolved

Pre-career: `Player` objects lived nested inside `RawTeamInput.players` / `bench` / `squad` (JSON files); `MatchCoordinator` hydrated a fresh in-memory team per match.

Post-Phase-1 (shipped): canonical `Player` records live in `state.career.roster`, allocated once by `src/game/rosterSeeder.ts` at first-ever new-game start (or v4-save migration). `RawTeamInput` is now seed-only data, plus a per-fixture team-identity carrier consumed by `buildTeamFromRoster`. The matchday `Team` is still built fresh per match by `MatchCoordinator.initPlayer`, but its inputs are roster-sourced (with `rosterId` threaded through so post-match `seasonStatsCollector.snapshotMatch(state)` can route stats back to the persistent record).

---

## 4. Mutation-boundary additions (`SeasonEvent`)

All season-scope writes continue to flow through `applySeasonEvent` (see CLAUDE.md §5). The `SeasonEvent` union grows with strictly domain-meaningful variants — no generic setters.

### Rollover-phase variants ✅ live (Phase 1)

```ts
| { type: 'ROSTER_SEEDED';            // ✅ one-shot at newSeason / v4-save migration
    roster: Record<number, Player>;
    clubs: ClubState[];
    nextRosterId: number; }
| { type: 'PLAYER_SEASON_STATS_ACCUMULATED';   // ✅ post-fixture aggregator
    rosterId: number;
    statsDelta: { /* every PlayerSeasonStats field */ }; }
| { type: 'PLAYER_AGED';              // ✅ rosterId-keyed (not playerId)
    rosterId: number;
    statDeltas: Partial<PlayerStats>; }       // dob unchanged — age derived from calendar
| { type: 'PLAYER_RETIRED';           // ✅ rosterId removed from ClubState.squad; Player record retained
    rosterId: number;
    clubId: string; }
| { type: 'SEASON_ROLLED_OVER';       // ✅ composite — archives standings, regenerates fixtures, resets seasonStats
    newSeasonLabel: string;
    newFixtures: Fixture[];
    archivedStandings: TeamStanding[];
    topScorerRosterId: number | null;
    mvpRosterId: number | null; }
```

`SEASON_ROLLED_OVER` is the one big event; the aging and retirement events fire in a loop inside `careerRollover.computeRollover` before it. `GameCoordinator.rollSeason()` applies them then returns the events list so the UI can render the diff.

### Contract-phase variants 🚧 future (Phases 3–4)

Phase 2 shipped read-only contracts via `ROSTER_SEEDED` (with `contract` embedded on each Player) — no contract-specific events yet. The renewal / designation / termination flow adds:

```ts
| { type: 'CONTRACT_SIGNED';
    rosterId: number;
    clubId: string;
    contract: PlayerContract; }
| { type: 'CONTRACT_EXTENDED';
    rosterId: number;
    newExpiresOn: string;
    newAnnualWage: number; }
| { type: 'CONTRACT_TERMINATED';
    rosterId: number;            // → goes to freeAgents
    reason: 'released' | 'expired' | 'retired'; }
| { type: 'MARQUEE_DESIGNATED';
    clubId: string;
    rosterId: number | null; }
```

### Market-phase variants 🚧 future (Phases 5–6)

```ts
| { type: 'MARKET_OPENED'; closesAt: string; }
| { type: 'MARKET_CLOSED'; }
| { type: 'OFFER_SENT';      offer: TransferOffer; }
| { type: 'OFFER_RESPONDED'; offerId: string; accept: boolean; reason?: string; }
| { type: 'OFFER_WITHDRAWN'; offerId: string; }
```

### Supply-phase variants 🚧 future (Phase 7)

```ts
| { type: 'ACADEMY_GRADUATED';
    clubId: string;
    player: Player; }            // generated persona — rosterId allocated from nextRosterId
| { type: 'FOREIGN_IMPORT_ARRIVED';
    player: Player;              // unsigned → joins free-agent pool
    askingWage: number; }
```

The exhaustive `default: const _: never = event` contract is preserved at every step.

---

## 5. Determinism ✅ live

A fourth seeded RNG stream `rngTransfer(min, max)` / `rngTransferRaw()` lives in `src/utils/rng.ts` alongside the existing three (outcome / form / commentary). Seeded via `setCareerSeed(seed)` from `GameCoordinator.newSeason` / `fromSave` with constant `0x27D4EB2F` — independent of `setMatchSeed`, so per-fixture seed derivation cannot perturb career-scope outcomes.

All stat-development RNG (Phase 1 — `clampedNormal` in `careerRollover.ts`), retirement rolls (Phase 1), contract-length and wage-noise rolls (Phase 2 — `contractSeeder.ts`) already flow through this stream. **Future**: AI offer construction, free-agent selection, persona generation (Phases 3-7).

`scripts/checkSeasonDeterminism.ts` runs a 3-season career with fixed seed, snapshots per-season standings + results + the full SeasonEvent stream (retirements + aging deltas) + final-state roster baseStats + seasonsCompleted, and asserts byte-equal hash on a second run. A career with a given seed produces an identical final league table + roster + retirement list every run.

---

## 6. UI surface

| Screen | Status | Triggered from | Purpose |
|---|---|---|---|
| **EndOfSeasonScreen** | ✅ live (v2.22a) | Auto, after final-round result | Final table + your-season summary + top scorer + MVP cards |
| **RolloverScreen** | ✅ live (v2.22a) | After EndOfSeason "Continue" | Retirements list + your-squad stat-changes; "Begin {next season}" CTA |
| **ContractsScreen** | ✅ live (v2.23a) | Hub → Contracts tile | Sortable squad list — name / pos / age / OVR / wage / expiry / marquee badge. Dimmed cap pill (no enforcement yet) |
| **CapDashboard** | 🚧 Phase 3 | Hub → Contracts → "Cap" pill | Interactive cap usage, marquee designation, projected impact |
| **TransferMarketScreen** | 🚧 Phase 5 | Hub → Transfers tile | List of approachable players (expiring contracts + free agents), filter by position, sort by wage/reputation/age |
| **OfferModal** | 🚧 Phase 4 | TransferMarket / Contracts → row click | Compose an offer: wage, length, marquee flag. Shows cap impact preview |

### Existing screens that need updates

- **HubScreen** — Contracts tile live (v2.23a). Cap usage chip in the header + badge on Transfers tile when offers need response: 🚧 Phase 3+.
- **TeamInfoScreen** — contract expiry on each player row: 🚧 (Phase 2 surfaced it on ContractsScreen only).
- **PreMatchScreen** — no change v1; matchday selection is unaffected.
- **MatchResultScreen** — unchanged; rollover triggers from EndOfSeasonScreen, not from each match result.

### Navigation flow

```
Match → MatchResult → RoundResults → LeagueTable → Hub             (mid-season, unchanged)

Final-round result →
  RoundResults → LeagueTable → EndOfSeasonScreen ✅ →
    RolloverScreen ✅ → Hub (new season)                            (✅ shipped v2.22a)

Hub → Contracts tile → ContractsScreen ✅ → Hub                     (✅ shipped v2.23a, read-only)

Hub → Transfers tile → TransferMarketScreen → OfferModal → Hub      🚧 Phase 5+
```

Hub remains the top of the in-season stack. Settings is still the exit route.

---

## 7. Save schema

Each landing milestone bumps `SAVE_VERSION` in `src/ui/SaveManager.ts`. The original plan slotted rollover at v4 / contracts at v5 / market at v6, but pre-Phase-1 saves were already at v4 (pre-match tactics + matchday squad), so each shipped phase took the next number up:

| Version | Status | Adds |
|---|---|---|
| v5 | ✅ shipped v2.22a | Rollover: `state.career` snapshot — every `Player` keyed by `rosterId`, `ClubState[]`, `archive[]`, `seasonsCompleted`, `nextRosterId` |
| v6 | ✅ shipped v2.23a | Contracts: `PlayerContract` + `reputation` embedded on each persisted Player |
| v7 | 🚧 Phase 4+ | Market: `freeAgents[]` (rosterId[]), `MarketState` if window is open, pending offers |

Migrations are auto on load. v4 → v5 seeds a fresh roster from JSONs (lossless — pre-v5 had zero per-player evolution). v5 → v6 walks the persisted roster and runs `contractSeeder.seedContractFields` for any Player missing contract / reputation fields. v2 → v3 → v4 cascades use earlier-version restore paths. v1 saves are discarded.

---

## 8. Phased implementation plan

Each phase is **independently shippable** and **builds clean / `npm run verify` green** on its own. One cohesive split per commit; per CLAUDE.md, a module-boundary change is an engine change and updates the corresponding engine doc (`docs/match-engine.md` for `src/engine/` work, `docs/game-engine.md` for `src/game/` work) in the same commit.

### Phase 1 — Multi-season rollover (no market) ✅ shipped v2.22a

Player completes a season → EndOfSeasonScreen (final standings + your-season summary + top scorer + MVP) → RolloverScreen (retirements + your-squad stat changes) → Hub for the new season. Saves persist across the boundary. `npm run verify` covers a deterministic 3-season career.

**Shipped:**
1. ✅ `state.career.roster` (keyed by `rosterId: number`) populated once by `src/game/rosterSeeder.ts` at first-ever new-game start. `RawTeamInput` is now seed-only — matchday teams built per fixture by `src/game/rosterTeamBuilder.ts::buildTeamFromRoster`.
2. ✅ `ClubState[]` on `GameState.career`. Each club's `squad: number[]` is starters + bench + wider squad of rosterIds in canonical order.
3. ✅ `src/engine/balance/career.ts` — `AGE_CURVES` (per-stat peakAge / growth / decline), `STAT_NOISE` (Gaussian std-dev + clamp), `RETIREMENT_CURVE` (forwards/backs cumulative probabilities), `SEASON_AWARDS.mvpMinAppearances`.
4. ✅ `src/game/careerRollover.ts::computeRollover` — pure, emits PLAYER_AGED + PLAYER_RETIRED + SEASON_ROLLED_OVER stream with synthesized Sept-May weekly fixture dates (skips Nov + Feb).
5. ✅ `src/ui/EndOfSeasonScreen.ts` + `src/ui/RolloverScreen.ts` wired into `main.ts`. Post-match Continue chain reroutes via `game:seasonComplete` latch.
6. ✅ Save v5 — `state.career` round-trips via `SavedCareer`.
7. ✅ `scripts/checkSeasonDeterminism.ts` extended to 3 seasons with rollSeason between each.
8. ✅ `docs/game-engine.md` updated with Career-scope mutation seam.

### Phase 2 — Read-only contract data ✅ shipped v2.23a

Every player carries `PlayerContract` + `reputation`. Hub's Contracts tile opens a sortable squad list with wage / expiry / marquee badge / OVR / age. Cap pill shown but dimmed (no enforcement yet).

**Shipped:**
1. ✅ `Player.contract` + `Player.reputation` (`src/types/player.ts`); partial-override path on `RawPlayer`.
2. ✅ `docs/team-data.md` annotated with `Marquee: yes.` on one star per club (du Toit, Genge, Slade, T. Williams, M. Smith, Chessum, L. Williams, F. Smith, T. Curry, Itoje).
3. ✅ `scripts/generateTeamJsons.mjs` parses the annotation, emits `contract: { isMarquee: true }` JSON override. The 6 teams not currently regenerated (no `*(in game)*` tag) got the override by hand-edit.
4. ✅ `src/game/contractSeeder.ts` — `seedContractFields` synthesises wage (rating tier × position scarcity × noise, rounded to £5k), length (age-banded), expiry (staggered ~22/38/42 across +1/+2/+3 years), reputation (rating × 0.9 + marquee bump). Tuning in `src/engine/balance/transfers.ts`.
5. ✅ `src/ui/ContractsScreen.ts` — sortable, marquee badge, expiring-soon chip, dimmed cap pill.
6. ✅ Save v6 — Player.contract + reputation persisted; v5 saves auto-migrate via in-place backfill in `GameCoordinator.fromSave`.

**Deferred to Phase 3+:** any market activity, cap enforcement, interactive marquee designation (current marquees are immutable from JSON).

### Phase 3 — Salary cap + marquee 🚧

**Goal:** every club has a visible cap usage. Each club designates one marquee player (free choice for the human; AI auto-picks the highest-paid).

**Work items:**
1. `MARQUEE_DESIGNATED` event + handler. Current marquees from JSON become the initial assignment but can be re-pointed.
2. Derived `capUsed = Σ(squad wages) - marqueeWage`. (Already computed read-only in `ContractsScreen` cap pill; Phase 3 makes it interactive.)
3. New `CapDashboard` screen showing cap usage, marquee, projected impact.
4. ✅ `src/engine/balance/transfers.ts` already shipped with Phase 2 — `SENIOR_CAP = 6_400_000`, `WAGE_BY_RATING`, `POSITION_SCARCITY`, etc.

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

Resolved during Phases 1 + 2:

1. ✅ **Wage formula calibration.** Shipped as `WAGE_BY_RATING` (piecewise-linear anchor table) × `POSITION_SCARCITY` × `WAGE_NOISE` in `src/engine/balance/transfers.ts`. No age multiplier in the formula yet — length distribution is age-banded instead. Numbers will retune once Phase 4 telemetry exists.
3. ✅ **Retirement curve shape.** Shipped as `RETIREMENT_CURVE` in `src/engine/balance/career.ts` — forwards skew one year later than backs at every age bucket, 100% retirement at 38 (forwards) / 37 (backs).
4. ✅ **Stat development curve per stat.** Shipped as `AGE_CURVES` in `src/engine/balance/career.ts` — pace/agility peak 25-26 with the steepest decline, composure/kicking/positioning hold to 31-33 with the shallowest.

Still open:

2. **Reputation drift.** Phase 2 seeded reputation from rating + marquee bonus only. Silverware-driven drift across seasons — probably +N for squads finishing top 4 or winning the title, scaled by appearances — lands in Phase 3+ alongside the `MARQUEE_DESIGNATED` flow.
5. **Squad size limits.** Premiership senior squad is ~40. v1: no enforcement — trust the cap to bound the AI implicitly. Revisit if AI builds 60-man squads under Phase 5's free-agent flow.
6. **Human-team affordability warning.** Pre-window warning UI for when projected next-season cap exceeds limit at current renewal offers. Phase 4 work alongside the renewal modal.
7. **Owner cash / transfer budget.** Distinct from cap. v1 sketch: flat seasonal budget per club, reset each year. Could later layer gate receipts / sponsor income. Phase 5+.

---

## 10. References

Sources for §2 research are recorded in the planning conversation transcript and cited inline there. Key official references:

- RFU Regulation 7 (player approaches, contracts, movement) — englandrugby.com
- PRL Salary Regulations (2021/22 board-approved version, post-Covid recalibration) — premiershiprugby.com
- RPA × PRB Rookie Fixed Academy Wage agreement (Feb 2025) — therpa.co.uk
- Lord Myners review (post-Saracens; 52 recommendations adopted)

When implementing, re-verify current-season cap figures against the latest PRL handbook before hardcoding any constant in `balance/transfers.ts`.
