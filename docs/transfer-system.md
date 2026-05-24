# Transfer System & Career Mode — Roadmap

Roadmap for multi-season career mode and the transfer market, with phase status. **Phases 1–7 shipped on main (v2.43a)** — multi-season rollover, read-only contracts with marquee designations, interactive marquee + salary-cap pill, end-of-season renewals, free-agent signings, Reg 7 cross-Prem poaching, and generated player supply (academy + foreign imports). **Phase 8 shipped at v2.114a** — Squad Builder pre-season mode (unwind the 2025-26 inbound transfers, signing window, marquee step) selectable from a new Mode Picker between Team Selector and Hub.

The data shapes and mutation seams in §3–§5 are now fully grounded in shipped code. Remaining open work is refinement, not roadmap (§9).

---

## 1. Scope

Two intertwined features delivered in sequence:

1. **Multi-season rollover** ✅ — the league restarts, ages tick, stats develop, retirements happen, fixtures regenerate, save persists across seasons. *(Phase 1, shipped v2.22a.)*
2. **Transfer market** ✅ — contracts + reputation (Phase 2, v2.23a), salary cap with one marquee slot (Phase 3, v2.36a), end-of-season renewal window (Phase 4, v2.36a), free-agent signings + Reg 7 poaching (Phases 5+6, v2.43a), generated player supply via academy + foreign imports (Phase 7, v2.43a).

Career mode is the umbrella; rollover is the prerequisite.

### Decisions locked

| Decision | Choice |
|---|---|
| Rollover order | Standalone milestone first — then transfers on top |
| Cap fidelity | £6.4M senior cap + £1.4M flat dispensation pool (HG/EPS/injury credits, modelled flat per-club) + 1 excluded marquee player ✅ |
| Player supply | Closed system + free-agent pool + generated stream (academy graduates + foreign imports) each summer ✅ |
| Player agency model | Wage-driven with current-club loyalty discount on renewals. Ambition / silverware response deferred |
| Rollover scope | Stat development by age curve + age-based retirements. **No** injuries in v1 |
| Future fixtures | Year 1 = `PREMIERSHIP_2025_26` verbatim. Year 2+ = regenerate via `src/game/fixtures.ts::generateFixtures` |
| Doc location | This file, source of truth for the feature |

### Explicitly out of scope (v1)

- **Per-player HG/EPS cap-credit tagging** — credit pools are modelled flat per-club in v1 (`CAP_CREDITS` in `balance/transfers.ts` sums to `EFFECTIVE_CAP_CREDITS = £1.4M`, applied flat to every club). The real PRL rules tag specific players as HG / EPS internationals and apply credits on their wages individually. The flat model gets the league inside its effective cap; per-player tagging is a refinement.
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

### Career-scope state ✅ live (`src/types/gameState.ts`)

```ts
interface ClubState {
  id: string;
  squad: number[];           // rosterIds of every player signed to the club
}

interface PreAgreement {
  rosterId: number;
  fromClubId: string;        // current club (player still plays the season at)
  toClubId: string;          // new club at next rollover
  annualWage: number;
  lengthYears: number;       // 1-3
}

interface MarketState {
  phase: 'renewals' | 'signings';
  openedAfterSeason: string;
  expiringRosterIds: number[];  // empty during signings phase
  offers: TransferOffer[];
}

interface TransferOffer {
  id: string;                // deterministic from (seasonsCompleted, fromClubId|'fa'|'pc', rosterId)
  fromClubId: string;        // '' for free-agent signings
  rosterId: number;
  annualWage: number;
  lengthYears: number;       // 1-3
  isMarquee: boolean;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  rejectionReason?: 'wage' | 'ambition' | 'cap_overcommit';
}

interface CareerState {
  seasonsCompleted: number;
  archive: ArchivedSeason[]; // standings + top scorer + MVP per past season
  clubs: ClubState[];
  roster: Record<number, Player>;  // key: rosterId
  nextRosterId: number;
  freeAgents: number[];            // unsigned rosterIds — populated by Phase 4 expiries + Phase 7 imports; consumed by Phase 5 signings
  market: MarketState | null;      // live during renewal or signing window
  pendingMoves: PreAgreement[];    // Phase 6 — activated at next rollover via TRANSFER_ACTIVATED
}

interface GameState {
  // ... existing ...
  career: CareerState;
}
```

`ClubState` deliberately stays minimal — derivations like cap usage and marquee identity live on the roster (`Player.contract.annualWage`, `Player.contract.isMarquee`) rather than denormalised onto the club. Future ambition / reputation drift would slot onto either the club or the roster as separate fields.

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

### Contract-phase variants ✅ live (Phases 3–4)

```ts
| { type: 'MARQUEE_DESIGNATED';
    clubId: string;
    rosterId: number | null; }    // null clears the slot without re-designating
| { type: 'CONTRACT_EXTENDED';    // ✅ renewal — clubId unchanged
    rosterId: number;
    newExpiresOn: string;
    newAnnualWage: number; }
| { type: 'CONTRACT_TERMINATED';
    rosterId: number;             // → joins freeAgents (unless reason === 'retired')
    reason: 'released' | 'expired' | 'retired'; }
```

### Market-phase variants ✅ live (Phases 4–5)

```ts
| { type: 'MARKET_OPENED';
    phase: 'renewals' | 'signings'; // discriminates the two off-season windows
    expiringRosterIds: number[];    // empty during signings phase
    offers: TransferOffer[]; }
| { type: 'MARKET_CLOSED'; }
| { type: 'OFFER_SENT';      offer: TransferOffer; }  // idempotent on duplicate IDs
| { type: 'OFFER_RESPONDED'; offerId: string; accept: boolean;
    reason?: 'wage' | 'ambition' | 'cap_overcommit'; }
```

### Signing-phase variants ✅ live (Phases 5–6)

```ts
| { type: 'CONTRACT_SIGNED';                    // free-agent inbound (user or AI)
    rosterId: number;
    clubId: string;
    expiresOn: string;
    annualWage: number; }
| { type: 'PRE_AGREEMENT_SIGNED';               // Reg 7 — deferred activation
    agreement: PreAgreement; }
| { type: 'TRANSFER_ACTIVATED';                 // rollover-time activation of a pending move
    rosterId: number;
    toClubId: string;
    annualWage: number;
    expiresOn: string; }
```

### Supply-phase variants ✅ live (Phase 7)

```ts
| { type: 'ACADEMY_GRADUATED';
    clubId: string;
    player: Player; }              // generated persona — rosterId allocated from nextRosterId
| { type: 'FOREIGN_IMPORT_ARRIVED';
    player: Player; }              // unsigned → joins freeAgents pool
```

The exhaustive `default: const _: never = event` contract is preserved at every step.

---

## 5. Determinism ✅ live

A fourth seeded RNG stream `rngTransfer(min, max)` / `rngTransferRaw()` lives in `src/utils/rng.ts` alongside the existing three (outcome / form / commentary). Seeded via `setCareerSeed(seed)` from `GameCoordinator.newSeason` / `fromSave` with constant `0x27D4EB2F` — independent of `setMatchSeed`, so per-fixture seed derivation cannot perturb career-scope outcomes.

All stat-development RNG (Phase 1 — `clampedNormal` in `careerRollover.ts`), retirement rolls (Phase 1), contract-length + wage-noise rolls (Phase 2 — `contractSeeder.ts`), renewal offer wages (Phase 4 — `generateRenewalOffers`), signing-window offer wages (Phase 5 — cached on `state.career.market.offers` so re-renders don't re-advance the stream), and persona generation (Phase 7 — `generatePersona` advances `rngTransfer` for nationality + name + position + dob + 12 baseStats per persona) all flow through this stream.

`scripts/checkSeasonDeterminism.ts` runs a 3-season career with fixed seed, exercises both `openRenewalWindow` + `closeRenewalWindow` and `openSigningWindow` + `closeSigningWindow` between each pair of seasons (AI-only, no user decisions), snapshots per-season standings + results + the full SeasonEvent stream + renewal + signing offer hashes + post-window free-agents pool + final-state roster baseStats + seasonsCompleted, and asserts byte-equal hash on a second run. A career with a given seed produces an identical final league table + roster + retirement list + transfer activity every run.

---

## 6. UI surface

| Screen | Status | Triggered from | Purpose |
|---|---|---|---|
| **EndOfSeasonScreen** | ✅ live (v2.22a) | Auto, after final-round result | Final table + your-season summary + top scorer + MVP cards |
| **RenewalsScreen** | ✅ live (v2.36a) | After EndOfSeason if expiring contracts exist | Per-row Renew/Release toggle on the player's expiring squad with live projected-cap pill |
| **TransferMarketScreen** | ✅ live (v2.43a) | After Renewals if free agents or Reg 7 poach candidates exist | Two sections — free agents (Sign) + final-12-month contracted (Pre-Agree). Sortable by name/pos/age/OVR/wage, live cap pill |
| **RolloverScreen** | ✅ live (v2.22a) | After TransferMarket (or directly after Renewals/EndOfSeason if windows skipped) | Retirements + per-player aging deltas + inbound transfers + academy graduates; "Begin {next season}" CTA |
| **ContractsScreen** | ✅ live (v2.36a) | Hub → Contracts tile | Sortable squad list — name / pos / age / OVR / wage / expiry / marquee badge. Interactive marquee toggle + 3-state cap pill |

### Existing screens that need updates

- **HubScreen** — Contracts tile live. Cap usage chip in header + badge on Transfers tile when offers need response: not yet wired (the Transfers tile remains a placeholder; the signing window today is reachable only via the post-EndOfSeason chain).
- **TeamInfoScreen** — contract expiry on each player row: not yet surfaced (lives on ContractsScreen only).
- **PreMatchScreen** — no change; matchday selection is unaffected.
- **MatchResultScreen** — unchanged; rollover triggers from EndOfSeasonScreen, not from each match result.

### Navigation flow

```
Match → MatchResult → RoundResults → LeagueTable → Hub             (mid-season, unchanged)

Final-round result →
  RoundResults → LeagueTable → EndOfSeasonScreen
                             → RenewalsScreen        (if any expiring contracts)
                             → TransferMarketScreen  (if any free agents or poach candidates)
                             → RolloverScreen
                             → Hub (new season)

Hub → Contracts tile → ContractsScreen → Hub
```

The Transfers tile on Hub remains a no-op placeholder — the signing window is only reachable via the post-EndOfSeason chain. Mid-season transfer activity is out of scope (deferred indefinitely per §1). Hub remains the top of the in-season stack. Settings is still the exit route.

---

## 7. Save schema

Each landing milestone bumps `SAVE_VERSION` in `src/ui/SaveManager.ts`. The original plan slotted rollover at v4 / contracts at v5 / market at v6, but pre-Phase-1 saves were already at v4 (pre-match tactics + matchday squad), so each shipped phase took the next number up:

| Version | Status | Adds |
|---|---|---|
| v5 | ✅ shipped v2.22a | Rollover: `state.career` snapshot — every `Player` keyed by `rosterId`, `ClubState[]`, `archive[]`, `seasonsCompleted`, `nextRosterId` |
| v6 | ✅ shipped v2.23a | Contracts: `PlayerContract` + `reputation` embedded on each persisted Player |
| v7 | ✅ shipped v2.36a | Market: `freeAgents[]` (rosterId[]) + optional `MarketState` if a renewal window is open mid-save. `MarketState.phase` discriminates renewals from signings (defaults to `'renewals'` on older v7 loads) |
| v8 | ✅ shipped v2.43a | Reg 7: `pendingMoves[]` (PreAgreement[]) for cross-Prem pre-agreements that activate at the next rollover |

Migrations are auto on load. v7 → v8 defaults `pendingMoves` to `[]`. v6 → v7 defaults `freeAgents` to `[]` and `market` to `null`. v5 → v6 walks the persisted roster and runs `contractSeeder.seedContractFields` for any Player missing contract / reputation fields. v4 → v5 seeds a fresh roster from JSONs (lossless — pre-v5 had zero per-player evolution). v2 → v3 → v4 cascades use earlier-version restore paths. v1 saves are discarded. Every restore flows through `CAREER_ARCHIVE_RESTORED` (with optional `freeAgents` + `market` + `pendingMoves`) so the `applySeasonEvent` seam holds across the load path.

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

### Phase 3 — Salary cap + marquee ✅ shipped v2.36a

Every club has a visible 3-state cap pill. The user designates one marquee player via tap-to-toggle on `ContractsScreen`; AI clubs retain their JSON-authored marquee (no AI marquee auto-pick — kept simple, the renewal+signing layer handles AI cap management).

**Shipped:**
1. ✅ `MARQUEE_DESIGNATED` event + apply branch — clears the prior marquee on the named club's squad before setting the new one. Idempotent on `rosterId: null` (clears without re-designating).
2. ✅ Cap = Σ non-marquee wages, computed live in `ContractsScreen`. Cap pill (`ok` / `tight` ≥ 95% / `over`).
3. ✅ Marquee toggle on ContractsScreen (no separate CapDashboard — the cap pill in the header is the dashboard).

### Phase 4 — End-of-season renewals ✅ shipped v2.36a

Between the final-round `EndOfSeasonScreen` and rollover, every expiring contract gets a `TransferOffer`. The user toggles Renew/Release on their own club's offers in `RenewalsScreen`; AI clubs auto-resolve via `aiTransferDirector.decideAIOffers` (greedy by OVR with marquee + effective-cap-target + OVR-floor rules).

**Shipped:**
1. ✅ `MARKET_OPENED(phase: 'renewals')` / `MARKET_CLOSED` events firing from EndOfSeason → Rollover.
2. ✅ `OFFER_SENT` (reserved — open-window flow seeds via `MARKET_OPENED` directly) + `OFFER_RESPONDED` per offer.
3. ✅ `RenewalsScreen` with per-row toggle + live projected cap pill.
4. ✅ Loyalty-discount model: current-club offer = market wage × `1 - RENEWAL.loyaltyDiscount`.
5. ✅ Rejected → `CONTRACT_TERMINATED('expired')` → joins `state.career.freeAgents`.
6. ✅ `src/game/aiTransferDirector.ts` — pure / RNG-free greedy AI decisions.

### Phase 5 — Free-agent signings ✅ shipped v2.43a

After renewals close, the user + every AI club can sign any player in `state.career.freeAgents`.

**Cap-fidelity prerequisites (landed first as part of Phase 5):**
1. ✅ `CAP_CREDITS` in `src/engine/balance/transfers.ts` — flat per-club HG £600k + EPS £400k + injury £400k = `EFFECTIVE_CAP_CREDITS = £1.4M` widening effective cap to £7.8M.
2. ✅ Tightened `WAGE_BY_RATING` upper anchors — rating 96 anchor dropped from £780k to £560k so ordinary stars compress into the £350-550k band; marquee-tier wages only via the excluded marquee slot.
3. ✅ Bath marquee moved from du Toit to Russell (matches the real-world published marquee list).

**Phase 5 work items proper:**
1. ✅ `TransferMarketScreen` lists free agents sortable by name / pos / age / OVR / wage, with live projected-cap pill.
2. ✅ `aiTransferDirector.decideAISignings` — greedy by `overall + position-need × 10`, no OVR floor (the pool is largely sub-70 — score keeps quality ahead of squad-filler), capped at 4 signings per club per window against `AI_SIGN_CAP_TARGET = 0.92` of effective cap.
3. ✅ Cached offers on `state.career.market.offers` (seeded once at `openSigningWindow`, read by re-renders + sign calls + AI close pass — keeps `rngTransfer` stable).
4. ✅ User-side `signFreeAgent(rosterId)` fires `CONTRACT_SIGNED` immediately at the cached terms.

**Deferred:** per-player HG/EPS cap-credit tagging.

### Phase 6 — Cross-Prem poaching (Reg 7) ✅ shipped v2.43a

Approach players at other clubs whose contract enters its final 12 months. The move activates at the next rollover, not immediately — the player completes the current season at their existing club.

**Shipped:**
1. ✅ `aiTransferDirector.isPoachEligible(player, currentDate)` — final-12-month check.
2. ✅ Surfaced in `TransferMarketScreen` as a second section ("Final-12-Month Contracts (Reg 7 Pre-Agreement)") alongside free agents — the same screen serves both flows.
3. ✅ `PRE_AGREEMENT_SIGNED` pushes onto `state.career.pendingMoves`; `careerRollover` fires `TRANSFER_ACTIVATED` per pending move on rollover (atomic squad swap, no `freeAgents` touch).
4. ✅ `aiTransferDirector.decideAIPoaches` — max 1 per non-human AI club per window, OVR ≥ `aiReleaseRatingFloor`, position-need bonus.

**Deferred:** mid-season activation, buyouts, loan deals.

### Phase 7 — Generated supply (academy + foreign) ✅ shipped v2.43a

The league no longer feels closed. Each rollover, every club graduates 2-4 academy players and 5-10 foreign imports enter the free-agent pool.

**Shipped:**
1. ✅ `src/game/personaGenerator.ts::generatePersona(seed, calendarDate)` — deterministic from `rngTransfer`. Inputs: clubId (drives nationality bias), ageBand, ratingBand. Outputs: full `Player` shape with name, dob, baseStats, position, nationality, reputation, contract.
2. ✅ `NAME_POOLS` per 10 nationalities (English, Welsh, Scottish, Irish, French, South Africa, NZ, Australia, Fiji, Argentina), ~15-20 first + last names each.
3. ✅ `ACADEMY_GRADUATED` fired in `careerRollover`: 2-4 per club, ages 18-20, ratingBand 55-75, £20k fixed RPA rookie wage, 2-year deal.
4. ✅ `FOREIGN_IMPORT_ARRIVED` fired in `careerRollover`: 5-10 single batch, ages 23-30, ratingBand 65-88, `WAGE_BY_RATING × POSITION_SCARCITY` wage, joins `freeAgents`.
5. ✅ Surfaced in `RolloverScreen` (Inbound Transfers + Academy Graduates sections, conditional on event presence).

**Deferred:** rugby league converts, Championship promotions, retiring international stars joining from URC mid-career (individually scriptable later).

### Phase 8 — Squad Builder (pre-season mode) ✅ shipped v2.114a, Overview step added v2.120a

A new-game branch sitting between Team Selector and Hub. Selecting **Squad Builder** instead of **Quick Start** unwinds every 2025-26 inbound transfer that's present in the seeded roster (releasing those players into `state.career.freeAgents`), surfaces a **Squad Overview** depth chart so the user can see which positions are now thin, opens a pre-season signing window so the user — and every AI club — can rebuild their squad, then routes the user to a marquee-selection step before Round 1. Quick Start lands on Hub with the authored rosters / contracts / marquee, identical to the pre-Phase-8 behaviour.

**Shipped:**
1. ✅ `src/ui/ModePickerScreen.ts` (v2.111a, Phase A) — two-CTA screen after Team Selector. Back arrow returns to the team grid; either CTA seeds a new `GameCoordinator` for the picked club.
2. ✅ `src/data/transfers-2025-26.ts` (v2.112a, Phase B) — 99 curated `PreSeasonTransfer` entries from the Wikipedia 2025-26 transfer list, name-matched against the seeded roster via `scripts/auditTransfers2025_26.ts` (94 exact + 1 diacritic + 6 last-name-fuzzy with first-name verification; 1 reject — Bryn vs Bryce Gordon — and 1 dedupe — Cammy Hutchison's permanent move + later loan). 31 Wikipedia entries are deliberately skipped (foreign / lower-league / short-term-loan arrivals not carried in the seed roster).
3. ✅ `CONTRACT_TERMINATED.reason` extended with `'pre_season_unwind'` (v2.113a, Phase C) — no handler change needed; same FA-pool semantics as `'released'`.
4. ✅ `TransferCoordinator.unwindPreSeasonTransfers(transfers)` — name-indexed walk, emits one `CONTRACT_TERMINATED` per match, returns `{matched, skipped}`. RNG-free (the match is name-driven; unwind order is fixed by the input list).
5. ✅ `openSigningWindow({ skipPoaches?: boolean })` + `closeSigningWindow({ skipPoaches?: boolean })` — pre-season passes `true` so the Reg 7 section is suppressed in both the offer set and the AI close pass. At game start ~22% of contracts are in their final 12 months; surfacing those as approachable pre-agreements would be noise.
6. ✅ `TransferMarketScreen` `signings-preseason` mode (v2.111a) — FA-only render; "Pre-Season Signings" title; otherwise reuses the off-season Sign/Undo flow, cap pill, sort dropdown.
7. ✅ `ContractsScreen` `marquee-edit` mode via `showContractsMarqueeEdit(onContinue)` (v2.113a) — same list + interactive star toggle, Continue CTA in place of the back arrow, retitled "Choose Your Marquee".
8. ✅ `CareerState.preSeasonStep?: 'overview' | 'signings' | 'marquee'` + `PRE_SEASON_STEP_SET` season event (v2.113a, `'overview'` added v2.120a) — set before each `saveGame` so a closed-tab mid-pre-season resumes at the right screen via `continueGame`. `SAVE_VERSION` bumped to 12; field is optional, so older saves load unchanged.
9. ✅ `TransferCoordinator.repairAIMarquees()` (v2.114a, Phase D) — re-designates the top-wage player as marquee on any AI club whose authored marquee was unwound (skips the user's club — they pick theirs in the marquee step). Called once at the end of `closeSigningWindow`, plus the no-FAs short-circuit path.
10. ✅ `SquadOverviewScreen` (v2.120a) — read-only depth chart between unwind and signings. Iterates the 9 user-facing position groups from `src/game/positionGroups.ts` (Loose Forwards combined; Utility Back rolled into Centres), shows count + top-2 OVR-banded players per group, flags positions with `count < 2` as "thin" with an amber section accent and a "No depth" placeholder slot. RNG-free read of `state.career.clubs[playerTeamId].squad` post-unwind. Mirrors `RolloverScreen`'s `.app-header` + `.cta-pulse` "Move to Transfer Market" footer per `docs/DESIGN.md`. Shared `positionGroups.ts` module also feeds `SquadManagementScreen`'s filter chips so both screens stay in lockstep.

**Determinism:** Squad Builder consumes more `rngTransfer` budget than Quick Start (one extra signing window) so the two modes hash differently, but each is individually deterministic given the same root seed. The unwind itself is RNG-free.

**Smoke test** (`scripts/smokeTestSquadBuilder.ts`, deterministic seed): 99/99 unwinds matched, Bath squad 42 → 37 (Finn Russell marquee preserved — he wasn't an in-signing), market opens with 99 FA offers + 0 poach offers, ~36 AI signings after close pass, all 10 clubs above the matchday-23 minimum (smallest Gloucester at 25), AI-marquee repair takes 9/10 → 10/10 (Newcastle's authored marquee was an in-signing and got re-designated to the top-wage post-signings player).

**Deferred:** OUT-transfer unwinding (players who left the league for 2025-26 aren't carried in the seed roster, so reinjecting them would require fabricating personas); per-position force-fill (no club drops below the 23-player floor in the current data, and matchday auto-select fallback chains handle thin specialist positions); the matching Squad Builder flow at later season rollovers (this is a v1 one-shot at game start only — subsequent off-seasons use the standard end-of-season chain).

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
