# Tier 1 — Detailed Roadmap: "FM-style depth (the management loop)"

Detailed implementation plan for the five Tier 1 features from `docs/roadmap.md`.
Where Tier 0 fixed **stakes** and **presentation**, Tier 1 is the bundle that earns
the "deep, obsessive sim" tagline: it makes recruitment a *skill* (scouting), gives
the budget a progression axis (staff), turns the passive media manager into a
two-way interaction (press), and closes the loop between the dressing room and the
market (transfer requests / playing-time promises).

This is grounded in the existing code seams (file:line references throughout) so it
can go straight to design/build. It is a plan, not a spec — exact balance numbers
are starting points to be tuned against the telemetry harness.

**Tier 0 is assumed built.** Two Tier 0 systems Tier 1 reads as *given*:

- **Player morale** — `Player.morale?` (`player.ts:230`), tuned in
  `src/engine/balance/morale.ts`, mutated only via `PLAYER_MORALE_ADJUSTED`
  (`gameState.ts:1184`), with a "Have a Chat" inbox CTA (`GameCoordinator.boostPlayerMorale`).
- **Board confidence / job security** — `BoardState` (`gameState.ts:21`,
  `player.board?` at `gameState.ts:558`), logic in `src/game/board.ts`, tuning in
  `src/engine/balance/board.ts`, seeded via `BOARD_STATE_SEEDED`.

## Contents

- [Dependency graph & sequencing](#dependency-graph--sequencing)
- [1.2 Staff hiring (core three)](#12-staff-hiring-core-three)
- [1.1 Scouting + attribute masking](#11-scouting--attribute-masking)
- [1.4 Press conferences (interactive media)](#14-press-conferences-interactive-media)
- [1.5 Transfer requests & playing-time promises](#15-transfer-requests--playing-time-promises)
- [1.3 Player roles (deferred — stub)](#13-player-roles-deferred--stub)
- [Cross-cutting: save, determinism, docs](#cross-cutting-save-determinism-docs)
- [Forward dependencies (back into roadmap.md)](#forward-dependencies-back-into-roadmapmd)

---

## Dependency graph & sequencing

```
1.2 Staff (scouts) ──► 1.1 Scouting (scout quality gates reveal speed/accuracy)
1.2 Staff (physio/S&C) ──► training quality + injury rate (reuses Tier-0-era training)

Tier 0 morale ──┬─► 1.4 Press (answers nudge morale + board confidence)
                └─► 1.5 Transfer requests (low morale + game-time triggers a request)

Tier 0 board ──► 1.4 Press (answers nudge board confidence)

1.3 Roles ──► (deferred to a later tier; thin stub only)
```

**Recommended build order:**

1. **1.2 (staff) first** — scouts *are* staff, so the staff entity + roster must
   exist before scouting can be gated on scout quality. Build the staff spine, then
   wire the physio/S&C modifiers into the existing training/injury flow.
2. **1.1 (scouting) next** — the largest UI change; sits on top of the scout staff
   role. Per `roadmap.md` §5, **1.1 and 1.2 are designed and built together.**
3. **1.4 (press)** — reads Tier 0 morale + board; reuses the media manager. Largely
   additive and independently shippable.
4. **1.5 (transfer requests)** — reads Tier 0 morale and the existing transfer
   market; lands last so its triggers are tuned against a stable morale base.

Each is independently shippable after 1.2; the order minimises rework.

**Design decisions locked for this plan** (from product review):

- **1.1 fog scope: targets only.** The manager's *own* squad stays fully visible
  (you see them train and play every week); only *other clubs' players and free
  agents* are masked until scouted.
- **1.1 presentation: range bands.** A masked attribute shows an uncertainty band
  (e.g. `tackling 12–16`) that narrows as scouting accuracy rises — not a star
  rating, not prose.
- **1.2 breadth: core three.** Assistant manager (AI suggestions), a
  fitness/medical role (training quality + injury rate), and scouts (gate 1.1). Not
  the full forwards/kicking/analyst org chart — that is a later expansion.
- **1.3 roles: deferred.** Kept as a thin stub here; full treatment lands with the
  set-piece-calls work (`roadmap.md` Tier 2.4).
- **Manager carousel after a sacking: out of scope.** Noted as a forward dependency
  for 1.4 (press at a new club) and 1.5; not built in Tier 1.

---

## 1.2 Staff hiring (core three)

**Effort: M.** Gives the budget a progression axis beyond wages and adds the scout
role that 1.1 is gated on. Scoped to **three roles**: assistant manager, fitness &
medical, and scouts.

### What already exists (build on, don't reinvent)

- **No staff system today.** The only references are flavour: `teamProfile.headCoach?`
  (display string) and `player.cupDirection` ("Assistant-Manager direction" for cup
  matches, `gameState.ts:544-548`).
- **Training is the hook for the fitness role.** `TrainingPlan`
  (`src/types/training.ts`: intensity + forwardsFocus + backsFocus) →
  `computeTrainingWeek(state, plan, periodDays)` (`trainingWeek.ts:41-67`) emits
  `PLAYER_TRAINED` (condition + stat deltas) and rolls injuries
  (`trainingWeek.ts:~147-160`), tuned by `INTENSITY_EFFECTS` / `FORWARDS_FOCUS_STATS`
  / `BACKS_FOCUS_STATS` in `src/engine/balance/training.ts` and `injuries.ts`.
- **The assistant role is the hook for AI suggestions.** `aiTrainingDirector.pickPlan()`
  already chooses a plan from squad condition + recent form with no staff input;
  `autoSelect`/`selectBestMatchdaySquad` already produce a suggested 23.
- **`CareerState`** (`emptyCareerState`, `gameState.ts:564-578`) is the natural home
  for a per-club staff roster, mirroring `clubs[]` / `roster`.

**The gap:** the budget only buys players; nothing feeds training quality, injury
rate, scouting accuracy, or suggestion quality.

### Design

**Three staff roles, hired against the wage budget, per managed club.**

| Role | Feeds | Mechanic |
|---|---|---|
| **Assistant manager** | AI suggestions | Higher rating ⇒ better suggested XV / training plan / "team report" sharpness. Pure advisory — never auto-applies. |
| **Fitness & medical** | training + injuries | Higher rating ⇒ a multiplier on `PLAYER_TRAINED` condition/stat gains and a reduction on the training injury-roll chance and severity. |
| **Scout(s)** | 1.1 scouting | Higher rating + more scouts ⇒ faster, more accurate reveal of masked targets (narrower range bands, sooner). |

- Each staff member has a **rating (0–100)** and an **annual wage** drawn from the
  same budget envelope as players (so hiring a top scout has an opportunity cost
  against a marquee).
- A small **hireable pool** of free staff is generated at season start (career RNG),
  refreshed at rollover — mirroring `freeAgents`.
- Staff are **deterministic in effect**: their rating scales an existing modifier;
  no new per-tick RNG in the match or season loop.

### Data model

On `CareerState` (`gameState.ts:471-511` / `emptyCareerState:564-578`):

```ts
type StaffRole = 'assistant' | 'fitness' | 'scout';

interface StaffMember {
  id: string;
  role: StaffRole;
  name: string;
  rating: number;          // 0–100
  annualWage: number;
  clubId: string | null;   // null ⇔ in the free pool, unhired
}

// on CareerState:
staff?: StaffMember[];     // hired + free pool; additive-optional for legacy saves
```

The managed club can hold one assistant, one fitness lead, and *N* scouts (cap the
scout count in balance). Other clubs do **not** need a modelled staff roster in Tier
1 — only the player's club consumes these modifiers (keep it minimal; AI clubs are
unaffected, exactly as morale's match-form contribution is player-club-meaningful).

### Events (`SeasonEvent` union — `gameState.ts:596+` + `applySeasonEvent.ts`)

Add variants (the `default: const _: never = event;` exhaustiveness check flags
missing branches):

- `STAFF_POOL_SEEDED` — `{ staff: StaffMember[] }`, set the free pool at season start
  / rollover.
- `STAFF_HIRED` — `{ staffId: string; annualWage: number }`, set `clubId` to the
  managed club.
- `STAFF_RELEASED` — `{ staffId: string }`, return to pool (or remove).

Emit points: `careerRollover.ts` `computeRollover` seeds/refreshes the pool at the
season boundary (alongside `FOREIGN_IMPORT_ARRIVED`); hire/release fire from a new
Staff screen action through `GameCoordinator`.

### Where the modifiers attach (no new mutation kinds needed)

- **Fitness → training:** in `computeTrainingWeek` (`trainingWeek.ts`), read the
  hired fitness rating and scale the `conditionDelta` / `statDeltas` and the injury
  chance *before* building the `PLAYER_TRAINED` / `PLAYER_INJURED` events. The
  mutation seam is unchanged — only the computed magnitudes shift.
- **Assistant → suggestions:** in `aiTrainingDirector` / `autoSelect`, gate the
  *quality* of the suggestion on assistant rating (e.g. a weak assistant occasionally
  suggests a sub-optimal plan). Advisory only — no state mutation.
- **Scout → scouting:** consumed by 1.1 (reveal speed/accuracy). See below.

### Invariants (`seasonInvariants.ts`)

Bound each staff `rating` and `annualWage` to legal ranges (mirror the `condition`
0–100 pattern, `seasonInvariants.ts:58-60`). Assert the managed club never holds two
of a singleton role (assistant/fitness) and no more than the scout cap.

### UI

- **New Staff screen** (`src/ui/StaffScreen.ts`) reached from the Hub — a hireable
  pool + your current staff, with hire/release respecting the wage budget (reuse the
  cap-pill visual language and the budget gate from the transfer screens).
- **Hub tile** for Staff → update `docs/DESIGN.md` §15.4 Hub tile list and §15.5
  navigation flow.
- Surface the fitness/assistant effect subtly (e.g. a training-screen line "S&C team
  rated 78").

### Balance (`src/engine/balance/`)

New `staff.ts` (barrel-exported via `balance/index.ts`): per-role wage curve by
rating, training multiplier mapping (fitness rating → ×condition/stat gain),
injury-chance reduction, scout-accuracy mapping (fed into 1.1's `scouting.ts`),
pool-size + scout-cap, and rating spread of the generated pool. No tuning literals
in `trainingWeek`/`aiTrainingDirector`.

### Determinism

Pool generation and any wage/rating noise use the **career stream**
(`rngTransfer` / `setCareerSeed`) so they cannot perturb match outcomes. The
fitness training multiplier stays in the **deterministic** half of
`computeTrainingWeek` — it scales the magnitude the existing single training roll
already produces; it must not add a new `rng()` draw to the season loop (keep
`npm run verify` green).

### Build milestones

1. `StaffMember` state + `STAFF_POOL_SEEDED`/`STAFF_HIRED`/`STAFF_RELEASED` +
   invariants + pool seeding at rollover (Staff screen lists/hires; no effects yet).
2. Fitness modifier into `computeTrainingWeek` (training + injury) + `staff.ts`;
   tune against telemetry.
3. Assistant modifier on suggestion quality.
4. Scout role exposed for 1.1 to consume.

### Open questions (product decision)

- Should AI clubs eventually model staff (affecting their development/recruitment), or
  stay player-club-only? (Tier 1: player-club-only — keep it minimal.)
- Do staff have contracts/expiry like players, or hire-at-will? (Tier 1: hire-at-will
  with an annual wage; contracts are a later refinement.)

### Acceptance criteria

- Hiring a strong fitness lead measurably lifts training gains and lowers training
  injuries; releasing them reverses it.
- Staff wages count against the same budget so they trade off against signings.
- `npm run build` + `npm run verify` green; match determinism unaffected.

---

## 1.1 Scouting + attribute masking

**Effort: L.** The single biggest depth-add to the transfer game: it turns
recruitment from "read the spreadsheet" into a skill. Built **with 1.2** (scouts are
staff). **Fog scope: targets only** (own squad fully visible); **presentation:
range bands** that narrow with accuracy.

### What already exists

- **`PlayerStats`** — the 12 authored attributes (`player.ts:18-31`), iterated in
  canonical order via `PLAYER_STAT_KEYS` (`player.ts:39-43`).
- **All stats are fully visible everywhere today** — `PlayerProfileScreen`,
  `SquadOverviewScreen`, `SquadManagementScreen`, the `PreMatchScreen` scout step,
  and `TransferMarketScreen` all render raw numbers. There is **no knowledge/fog
  layer**.
- **The transfer market** (`MarketState` phases renewals / signings /
  signings-midseason / poach-midseason; `TransferOffer` / `TransferBid`) and
  `TransferMarketScreen` are where masked targets are evaluated.
- **`Player.reputation` (0–100)** already exists (seeded from rating + marquee) — a
  ready-made *public* signal that can be shown un-masked as the "headline" while the
  true attributes are fogged.

**The gap:** there is nothing between "you see a player" and "you know a player".

### Design

**A per-target knowledge layer on the managed club, keyed by `rosterId`.** Only
players *not* on your club are masked; your own squad is always fully revealed
(targets-only fog).

- Each unscouted outside player shows, per attribute, a **range band** derived from
  the true value ± an uncertainty that depends on **scouting accuracy**:
  `displayedBand = [trueValue − w, trueValue + w]`, where `w` shrinks as accuracy
  rises (fully scouted ⇒ `w = 0`, exact number shown).
- **Reputation and visible match output** (caps, age, position, reputation) are shown
  un-masked from day one as the public-domain signal — you always know *roughly* how
  good a player is; scouting tells you *specifically why*.
- **Scout assignments** (1.2): assign a scout to a player / a position / a club.
  Accuracy accrues over weeks; better scouts (higher rating, more of them) narrow the
  band faster. Knowledge **decays slowly** if a player goes unwatched for a long time
  (optional; keep simple in v1 — no decay).
- The band must be **deterministic** given (true stats, accuracy) so the same target
  shows the same band on reload — accuracy is the only state, the band is derived.

### Data model

On the managed-club slice (`GameState.player`, `gameState.ts:532-559`) — knowledge is
a property of *the manager's* view, not a global, so it sits beside `board`:

```ts
interface ScoutingRecord {
  accuracy: number;        // 0–100; 0 = name only, 100 = exact stats
  assignedScoutId?: string;
}

// on GameState.player:
scouting?: Record<number, ScoutingRecord>;  // keyed by rosterId; additive-optional
```

The displayed band is computed on render from `ScoutingRecord.accuracy` + the true
`player.baseStats` via a pure helper (`scoutingBand(trueValue, accuracy)`) — **the
band is never stored**, so there is nothing to drift or to bloat the save.

### Events

- `PLAYER_SCOUT_ASSIGNED` — `{ rosterId; scoutId }`.
- `SCOUTING_ACCURACY_ADVANCED` — `{ rosterId; delta }`, clamp 0–100. Emitted weekly
  in the `WEEK_ADVANCED` flow for each actively-scouted target, with `delta` driven
  by the assigned scout's rating (from 1.2 `staff.ts`).
- Own-club players are seeded to `accuracy: 100` lazily (or simply treated as fully
  known by the render helper without a stored record) — no per-player seeding event
  needed.

### Invariants

Bound `accuracy` to 0–100 per record (mirror `condition`, `seasonInvariants.ts:58-60`).

### UI

- **Masked render across `PlayerProfileScreen`, `SquadOverviewScreen`,
  `PreMatchScreen` scout step, and `TransferMarketScreen`** — each calls
  `scoutingBand()` and shows `12–16` (or the exact number once `accuracy = 100`).
  Own-club squad screens are unaffected (always exact).
- **Scout-assignment flow** — from the transfer/target screens, "send a scout"
  surfaces available scouts (from 1.2) and shows a progress indicator as accuracy
  accrues.
- **Inbox** — "scouting report ready" / "report sharpened" items via `items.push`
  before the sort in `buildAssistantReport` (`inbox.ts`), reusing the existing
  `InboxItem` + `deepLink: 'transfers'` shape (`inbox.ts:18-28`).

### Balance (`src/engine/balance/`)

New `scouting.ts`: the `accuracy → band-half-width` curve (e.g. accuracy 0 ⇒ ±10,
50 ⇒ ±4, 90 ⇒ ±1, 100 ⇒ 0), the per-week accuracy gain as a function of scout rating
(handed over from `staff.ts`), and the scout-cap / assignment limits. No tuning
literals in the UI render helper.

### Determinism

Accuracy gain uses the **career stream** if any jitter is wanted (prefer fully
deterministic from scout rating). The band is a pure function of stored accuracy and
authored stats — **no RNG at render time**, so a reload reproduces the exact band.
Match determinism is untouched (this is a pure season/UI layer).

### Build milestones

1. `ScoutingRecord` state + `scoutingBand()` helper + invariants; render bands on the
   transfer/profile screens (own squad always exact). Seed all outside targets to a
   default low accuracy.
2. Scout-assignment flow + `PLAYER_SCOUT_ASSIGNED`.
3. Weekly `SCOUTING_ACCURACY_ADVANCED` driven by scout rating (1.2) + `scouting.ts`.
4. Inbox surfacing + polish (band visuals, mobile/text-scale check).

### Open questions (product decision)

- **Knowledge decay** when a player goes unwatched — in v1 or deferred? (Plan: defer;
  accuracy only rises in Tier 1.)
- **AI recruitment under fog** — AI clubs continue to use true stats (they don't need
  fog); only the *human* view is masked. (Plan: yes — AI is omniscient, the fog is a
  player-facing challenge, matching FM.)
- Should a scouted player's band carry over if they later sign *for you* (instant
  full reveal on signing)? (Plan: yes — own squad is always exact.)

### Acceptance criteria

- An unscouted free agent / rival player shows range bands, not exact stats; your own
  squad shows exact stats.
- Assigning a better scout narrows the band faster; a fully scouted target shows exact
  numbers; the band is identical across a save/reload.
- `npm run build` + `npm run verify` green; match determinism unaffected.

---

## 1.4 Press conferences (interactive media)

**Effort: M.** Turns the (already lovely) passive media manager into a 2–3 question
pre/post-match interaction whose answers feed **morale** and **board confidence**
(both Tier 0). Reuses personas + phrase bank.

### What already exists

- **The media manager** (`src/game/media/`) is a pure, deterministic story generator:
  `generateMatchStory(ctx)` (`mediaManager.ts:257-309`) and
  `generateSeasonPrediction(ctx)` (`311-328`), seeded from an **isolated**
  `makeRng(seed)` (line 13/258) — *not* the career stream, so adding press content
  cannot perturb season or match outcomes.
- **`personas.ts`** — 12 fictional outlets with `byline`, `outlet`, `register`
  (tabloid / broadsheet / tv / podcast / youtuber / x), plus per-register `OPENERS` /
  `SIGNOFFS` (`personas.ts:7-69`). **`phrases.ts`** — flat phrase pools per category
  (combinatorial, append-to-expand).
- **Inbox surfacing** — stories drop into the inbox as `category: 'media'`
  (`InboxItem`, `inbox.ts:18-28`; rendered in `InboxScreen`). The mutation seam is
  `MEDIA_STORY_PUBLISHED` → `League.mediaStories` (persisted, no save bump).
- **Tier 0 feedback targets exist:** `PLAYER_MORALE_ADJUSTED` and the board's
  `BOARD_CONFIDENCE_ADJUSTED`.

**The gap:** the media talks *at* you. There is no moment where you talk back.

### Design

**A short, interactive presser at two moments: pre-match and post-match.** A
persona asks 2–3 questions framed by context (form, board confidence, an upcoming
derby, a player's poor run); each offers a few **tone options** (e.g. *Back the
squad / Deflect pressure / Single out a player / Hype the occasion*). Each answer:

- nudges **squad or individual morale** (`PLAYER_MORALE_ADJUSTED`) — e.g. publicly
  backing a struggling player lifts him; calling players out can rattle a fragile
  dressing room (interacts with morale exactly as team talks do);
- nudges **board confidence** (`BOARD_CONFIDENCE_ADJUSTED`) — managing expectations
  well steadies the board; over-promising raises it now but sets a higher bar;
- generates a **follow-up media story** in the persona's voice that *reacts to your
  answer*, reusing the existing phrase bank + persona wrap.

Questions and the mapping (answer → morale/board deltas) are **deterministic** given
context — the only randomness is flavour sampling on the existing isolated media
stream.

### Data model

Press questions are *generated*, not stored long-term; the only persisted output is
the resulting media story (existing `League.mediaStories`) plus the morale/board
deltas (existing seams). No new persistent state is strictly required. If a presser
can be deferred/skipped and resumed (tab-close safety), add a small transient
`pendingPresser?` marker on `GameState.player` mirroring `preSeasonStep`.

### Events

- **No new mutation kind for the effects** — answers fan out into existing
  `PLAYER_MORALE_ADJUSTED` and `BOARD_CONFIDENCE_ADJUSTED` events, plus a
  `MEDIA_STORY_PUBLISHED` for the reaction piece.
- Optionally one `PRESSER_ANSWERED` event if we want a record for history/achievements
  — defer unless needed.

### Invariants

None new — morale and board invariants already bound the deltas.

### UI

- **A presser modal** at pre-match and post-match (reuse `ModalManager` / the
  team-talk modal pattern). Under `silent: true` headless AI sims it short-circuits to
  a neutral default (like the penalty/sub prompts).
- The reaction story lands in the **inbox** as a `media` item (existing path).
- Keep it skippable for players who want a fast loop.

### Balance (`src/engine/balance/`)

New `press.ts`: per-tone morale/board delta magnitudes, the morale-conditioned sign
(when "single out a player" helps vs backfires), and the board "over-promise raises
the bar" coupling. No tuning literals in the media manager.

### Determinism

Flavour sampling stays on the **isolated media `makeRng`** stream (never the career
or match stream). The morale/board deltas are deterministic from (answer, context).
Match determinism untouched.

### Build milestones

1. Question generator (context → 2–3 questions + tone options) reusing personas /
   phrases; pre-match presser modal; AI short-circuits silently.
2. Answer → morale/board deltas via existing events + `press.ts`.
3. Reaction story (`MEDIA_STORY_PUBLISHED`) in the persona's voice.
4. Post-match presser + polish (skippable, mobile layout, achievement hooks later).

### Open questions (product decision)

- Frequency — every match, or only "newsworthy" ones (derby, slump, milestone)? (Plan:
  newsworthy + a light default, to avoid presser fatigue.)
- Should board confidence reactions be visible immediately or fold into the next block
  report? (Plan: immediate small nudge; the block report still summarises.)
- **Forward dependency:** at a *new* club after a sacking, pressers would frame the
  rebuild — depends on the (unbuilt) manager carousel; not in Tier 1.

### Acceptance criteria

- A presser fires at pre/post-match with context-aware questions; answers measurably
  move morale and/or board confidence and spawn a reaction story.
- The same context + answer is reproducible across reload; headless AI sims resolve a
  presser without UI.
- `npm run build` + `npm run verify` green; match determinism unaffected.

---

## 1.5 Transfer requests & playing-time promises

**Effort: S–M.** Once morale exists (Tier 0), unhappy stars ask to leave and fringe
players want games. Closes the loop between squad management and the market.

### What already exists

- **Morale** (`Player.morale?`, `balance/morale.ts`) with bands
  (`unhappyThreshold`, `veryUnhappyThreshold`) and fixture-driven adjusters
  (playing-time, results, standout) already firing `PLAYER_MORALE_ADJUSTED`. **The
  trigger signal already exists.**
- **The transfer market** — `MarketState` (renewals / signings / signings-midseason /
  poach-midseason), `TransferCoordinator`, `aiTransferDirector`, `signingResolver`
  (appeal/wage satisfaction), `contractSeeder`. A player who requests a move slots
  into the existing **poach / signing** machinery as an *eager-to-leave* flag that
  raises poach eligibility and lowers his retention appeal.
- **Contracts** — `PlayerContract` (`clubId`, `expiresOn`, `annualWage`, `isMarquee`)
  and the renewal flow.
- **Inbox CTAs** — `counselAction` ("Speak to Player") and `moraleBoostAction`
  ("Have a Chat") (`inbox.ts:18-28`) are the established pattern for player-grievance
  actions, with handlers in `InboxScreen` → `GameCoordinator`.

**The gap:** the player never *initiates*. There is no transfer request and no way to
make (or break) a playing-time promise.

### Design

**Two linked player-agency mechanics:**

1. **Transfer request** — fires when a player is persistently **unhappy** (morale
   below `unhappyThreshold` for N rounds) *and* under-played relative to his rating
   rank, or in his final contract year. Surfaces an inbox item with choices: *Promise
   more game time* (→ a playing-time promise), *Offer a new/improved contract* (→
   existing renewal flow), *Accept the request* (mark him available — raises poach
   eligibility, drops retention appeal in `signingResolver`), or *Reject* (morale
   penalty, possible escalation).
2. **Playing-time promise** — the manager pledges a minimum role over a window (e.g.
   "start ≥ X of the next Y league rounds"). Recorded on the player; **kept** ⇒ a
   morale boost on expiry; **broken** ⇒ a larger morale penalty and a credibility hit
   (the player is less placated by future promises). Tracked automatically against
   appearances in the existing per-fixture flow.

Both are **deterministic** from morale + appearances + the manager's choice.

### Data model

On the roster player (`player.ts`, beside `morale`/`disciplineAdvice`):

```ts
transferRequest?: { sinceRound: number; status: 'open' | 'accepted' | 'withdrawn' };
playingTimePromise?: { minStarts: number; byRound: number; startsSoFar: number };
```

Both additive-optional (legacy saves load with them absent → no request/promise).

### Events (`SeasonEvent` union + `applySeasonEvent.ts`)

- `TRANSFER_REQUEST_FILED` — `{ rosterId; round }`, set `transferRequest`.
- `TRANSFER_REQUEST_RESOLVED` — `{ rosterId; outcome: 'promised' | 'renewed' |
  'accepted' | 'rejected' }`, update status + fan out a `PLAYER_MORALE_ADJUSTED`.
- `PLAYING_TIME_PROMISE_MADE` — `{ rosterId; minStarts; byRound }`.
- `PLAYING_TIME_PROMISE_RESOLVED` — `{ rosterId; kept: boolean }`, clear the promise +
  fan out the morale delta.

Emit points: request-filing is evaluated in the **`WEEK_ADVANCED`** flow (reads
morale band + appearance rank, mirroring how decay is computed); promise progress
(`startsSoFar`) increments where fixture appearances are already tallied
(`recordPlayerMatchResult` / `computeFixtureMoraleEvents`); promise/request resolution
fires when the window closes.

### Invariants

`minStarts` / `byRound` / `startsSoFar` non-negative and `startsSoFar ≤ minStarts`;
`transferRequest.status` a legal enum (mirror existing enum guards in
`seasonInvariants.ts`).

### UI

- **Inbox** — "wants to leave" and "promise progress / promise broken" items, reusing
  the `counselAction`-style CTA shape (add a `transferRequestAction` /
  `promiseAction` to `InboxItem`, `inbox.ts:18-28`) with `deepLink: 'transfers'` /
  `'squad'`.
- **A resolution modal** offering the four choices; the promise option sets the
  window (a small "start ≥ X of next Y" control).
- **Squad/profile screens** — a small "transfer-listed" / "promised game time" badge.

### Balance (`src/engine/balance/`)

New `playerRequests.ts` (or fold into `morale.ts`): the unhappy-rounds threshold and
under-played gap that trigger a request, the promise window defaults, and the
kept/broken morale deltas + the "broken-promise credibility" penalty. Hook the
*accepted* request into `signingResolver` appeal as a negative retention term.

### Determinism

No new RNG ideally — triggers and resolutions are deterministic from morale +
appearances + choice. Any jitter (e.g. whether a borderline-unhappy player escalates)
uses the **career stream** so it can't perturb a match.

### Build milestones

1. State (`transferRequest` / `playingTimePromise`) + the four events + invariants;
   promise progress tracked off existing appearance tallies (no UI yet).
2. `WEEK_ADVANCED` request-trigger + inbox "wants to leave" surfacing + resolution
   modal.
3. Playing-time promise made/kept/broken loop + morale deltas (`playerRequests.ts`).
4. Wire *accepted* requests into the transfer market (poach eligibility + retention
   appeal in `signingResolver`).

### Open questions (product decision)

- Should an *accepted* request force a sale in the same window, or just list him until
  a bid arrives? (Plan: list him — the existing AI poach/signing flow decides; no
  forced sale.)
- Can a star **refuse to play** if a request is rejected (a hard fail-state), or only
  sulk via morale? (Plan: morale-only in Tier 1; a strike is a later escalation.)

### Acceptance criteria

- A persistently unhappy, under-played star files a transfer request; promising game
  time and then delivering it lifts morale, while breaking the promise drops it
  further.
- An accepted request raises his poach eligibility and lowers retention appeal in the
  market.
- Morale stays 0–100 across a multi-season career; `npm run build` + `npm run verify`
  green; match determinism unaffected.

---

## 1.3 Player roles (deferred — stub)

**Status: deferred.** Per the product decision, lightweight player roles are **not**
detailed in Tier 1; they get a fuller treatment alongside **set-piece calls**
(`roadmap.md` Tier 2.4), where role re-weighting and recurring set-piece decisions
are designed together.

**Sketch (for continuity, not a build plan):** a small role set per position
(e.g. ball-playing vs game-manager fly-half, fetcher vs blindside 6/7) that
re-weights the existing resolver formulas. The seams already exist and are stable:

- `Position` union (`player.ts:1-5`); jersey slots `SLOT.*` (`engine/Slot.ts`).
- `PLAYER_OVERALL_WEIGHTS` per position + `IRRELEVANT_STATS` (`balance/rating.ts:102-133`)
  — the precedent for per-position stat weighting a role would re-weight.
- Resolver stat reads in `engine/events/OpenPlayEvent.ts` / `engine/resolvers/`.
- Matchday selection (`autoSelect.ts` `SLOT_SPECS`, `PreMatchScreen` tactics step) —
  where a role would be chosen.

A role would be an enum on selection + a weight table in `balance/` read by the
resolvers; **no new mutation kind**, since instructions persist on the player/selection
and are read at pre-match. Picked up in the Tier 2.4 design.

---

## Cross-cutting: save, determinism, docs

- **Save schema (`SaveManager.ts`, `SAVE_VERSION = 1`):** every new field in this tier
  is **additive-optional** — `CareerState.staff?`, `GameState.player.scouting?`,
  `Player.transferRequest?` / `playingTimePromise?` — so older saves load with sensible
  defaults (empty staff/pool, low scouting accuracy, no request/promise) and **no
  `SAVE_VERSION` bump** is required. If any field is made non-optional, bump
  `SAVE_VERSION` + `ACCEPTED_VERSIONS` (`SaveManager.ts:36-39`) and the four save-doc
  locations in `CLAUDE.md`. The press feature (1.4) adds nothing new to the save
  (it reuses `League.mediaStories` + morale/board).
- **RNG streams:** season-scope rolls (staff pool, scouting jitter, request
  escalation) use the **career stream** (`rngTransfer` / `setCareerSeed`); press
  flavour stays on the media manager's **isolated** `makeRng`. **No new draw enters
  the match (`rng`) or training/season deterministic path** — keep the fitness
  training multiplier as a magnitude scale on the existing roll. `npm run verify`
  (match *and* season determinism) must stay green.
- **Docs to update in the same commits (per `CLAUDE.md` "Documentation sync"):**
  - New `SeasonEvent` variants (`STAFF_*`, `PLAYER_SCOUT_ASSIGNED`,
    `SCOUTING_ACCURACY_ADVANCED`, `TRANSFER_REQUEST_*`, `PLAYING_TIME_PROMISE_*`) →
    `docs/game-engine.md` § "Mutation seam" table (+ `docs/transfer-system.md`
    § "Mutation-boundary additions" for the request/promise variants).
  - New balance files (`staff.ts`, `scouting.ts`, `press.ts`, `playerRequests.ts`) →
    the formula/table in the relevant engine doc, **with real numbers** (not "see
    balance/X.ts").
  - New Staff screen + Hub tile → `docs/DESIGN.md` §15.4 (tile list) + §15.5
    (navigation flow).
  - Scouting/press/request screen behaviour → `docs/DESIGN.md` §15 and
    `docs/transfer-system.md` (scouting fog + request flow).
- **Telemetry:** after staff (training multipliers) and transfer requests land, run
  `npm run telemetry` to confirm the new training/morale contributions haven't skewed
  match balance (score lines, win rates, injury rates).
- **Versioning:** bump `src/version.ts` (currently `1.49b`) per committed update, per
  `CLAUDE.md` § "Versioning".

---

## Forward dependencies (back into roadmap.md)

Tracked here and threaded into `docs/roadmap.md` so they aren't lost:

- **Manager carousel after a sacking — not built.** Tier 0's sacking fail-state ends
  the save; there is no "manage another club" flow yet. Both **1.4 (press)** and
  **1.5 (requests)** assume a single managed club. A future carousel (new-game-flow
  change) would let pressers/requests frame a rebuild at a new club. Flagged in Tier 0
  open questions; should become an explicit Tier 2/3 item.
- **AI-club staff & fog.** Tier 1 models staff and scouting **for the player's club
  only** (AI clubs are omniscient and staff-less). A later tier could give AI clubs
  staff-driven development and fogged recruitment for a fairer, deeper world — pairs
  with the Tier 2 world-breadth work.
- **Roles + set-piece calls (1.3 ↔ 2.4).** 1.3 is intentionally deferred to be
  designed *with* set-piece calls (Tier 2.4) so role re-weighting and recurring
  set-piece decisions share one selection/balance surface.
- **Knowledge decay & scout networks.** Tier 1 scouting accuracy only rises; decay,
  regional scout networks, and "scout the opposition's set-piece" are natural Tier 2/3
  extensions of the `scouting.ts` layer.
