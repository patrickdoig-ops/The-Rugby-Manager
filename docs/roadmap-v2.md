# Roadmap v2.0

A single, current-state roadmap for **The Rugby Manager**. It supersedes and
replaces both `improvement.md` and `docs/roadmap.md` — the items those documents
described as "not started" have, in most cases, shipped (European competition,
reactive crowd audio, the contextual help system, save robustness, and several
bug-hardening waves are all now live at **v2.68b**). This document re-evaluates
the game as it actually stands today and lays out a prioritised, sequenced plan
for what remains.

**Guiding star — the manager fantasy for rugby.** A Football-Manager-class game
for rugby: deep enough to reward mastery, legible enough to draw a newcomer in,
and dramatic enough to *retain* them across multiple seasons. Every item below is
weighed against one test — *does it make the game more playable, more absorbing,
or more sticky?* Pure-simulation realism is pursued only where it serves that
end.

**Authentic to the modern English game.** The Premiership is a **closed franchise
league** — there has been no promotion or relegation from the top flight since
2020/21. This roadmap therefore does **not** chase a second playable division or
a promotion/relegation pyramid (see §6). In a closed league the long-term career
arc comes from three authentic sources instead: **European qualification and
glory** (already shipped), the **manager's own reputation and job market**, and
**building a financial dynasty**. Those are the spine of what follows.

How to read this:
- Each item states **what exists today**, **what to build**, **why it matters**,
  **what it touches**, and **effort / priority**, plus any save-schema or RNG
  determinism notes — enough for an implementing agent to turn into a design.
- **Priority:** P1 = highest value-per-effort, do first within its tranche.
  P2 = major feature. P3 = polish / scale.
- **Effort:** S (≤1 day), M (days), L (week+), XL (multi-week).
- **Tranches** are sequenced by dependency and value. Tranche A is the **v1.0
  public-release gate**; B–E are post-launch depth, in recommended order.

---

## 1. Where the game stands today (v2.68b)

For a solo-built, no-backend, vanilla-TypeScript browser + iOS game, the
simulation core and career spine are ahead of any shipping rugby-management
title. Four areas are now genuinely best-in-class:

- **The match engine.** 14 simulated phases driven by player attributes mixed
  with seeded RNG: kick-off, open play (phase / first / kick-return carries),
  breakdown (stacked ruck contest with supporter commitment), scrum, lineout,
  maul (zone-gated driving lineout), tactical and box kicking, the 50:22,
  try/conversion, penalties (7 offence types × 4 decision outcomes), cards
  (yellow / red_20 / red_full with the 2-in-22 → 4th-in-22 auto rule), TMO
  reviews, and contact injuries.

- **The 2D pitch animation.** Full 30-player set-piece formations, per-player dot
  choreography from the engine's real phase data, multi-leg carry walks, kick-arc
  lobs, pick-and-go carrier rides, animated set-piece actors, a formation-chase
  seam, and goal-post rendering. In rugby-specific detail it exceeds FM's 2D view.

- **The career spine.** Multi-season aging on Gaussian curves, hidden potential
  ceilings, retirement, academy + foreign-import regen, a realistic PRL
  salary-cap model (marquee outside cap), per-club performance-linked budgets and
  takeovers, a fully closed recruitment cycle (competitive bidding, scouting fog
  with range bands, a 5-phase poaching market with Reg 7 pre-agreements, transfer
  requests + playing-time promises, development and emergency-cover loans),
  staff hiring, international windows, focused-development training, playoffs, a
  domestic cup, and now **European competition**.

- **European competition (shipped since the old roadmaps).** A full EPCR build:
  Champions Cup (4 pools × 6, cross-league pool rounds, top-4 to R16) and a
  second-tier Challenge Cup "Shield" (3 pools + Champions-Cup drop-outs into R16),
  knockout R16 → QF → SF → Final at a neutral venue, qualification seeded from
  league finish and re-seeded each year. This closed the single biggest
  career-arc gap the previous roadmaps were built around. Reference:
  `docs/european-cups-2025-26.md`, `src/game/EuropeanCoordinator.ts`.

The architecture (single mutation seams, deterministic isolated RNG streams,
exhaustive discriminated unions, always-on invariants, all tuning in `balance/`)
means depth can be added *safely*. Save robustness is production-grade
(rotate-before-write, last-known-good `.bak`, rolling backup history, a
version-keyed migration pipeline, a background crash safety net). A **contextual
help system** (`src/ui/help/`) now provides per-screen help overlays, and the
codebase has just been through several structured bug-fixing waves (`bugs.md`).

**Telemetry baseline (v2.68b, 450 fixtures):** home win **51.6% ± 1.1%**, away
40.0%, draw 8.4%; 4.4 tries and 28.7 combined points per match; 9.7 penalties,
1.9 turnovers won, 53 of 55 tackles made. All within real-rugby ranges — the
balance is healthy and is **not** a roadmap priority.

### The headline weaknesses, in one paragraph

An excellent *simulation* and a deep *recruitment loop* now sit in front of three
gaps. **(1) The career dead-ends.** Getting sacked clears the save — there is no
manager reputation, no job market, no second act. **(2) The economy is thin.**
There is a salary cap, a player budget, and a staff budget with a one-way
slider — but no revenue (gate receipts, sponsorship, prize money), no transfer
fees, no facilities to invest in, so a title-winner and a struggler pull the same
financial levers. **(3) The human layer is generic.** Players have 12 generic
stats and a reactive morale value but no personality, no individual on-pitch
roles, and the youth academy intakes automatically with no agency. Secondary
gaps: every fixture plays in identical conditions (no weather, referees, or
set-piece calls); knockout draws are resolved by a home-side fallback rather than
extra time; there is no guided onboarding or difficulty setting; and platform
reach is iOS-only.

---

## 2. The north star, and what "v1.0" means

A releasable **v1.0 public version** has to pass three tests:

1. **First impressions.** A newcomer to *both* rugby and management can learn the
   game, isn't punished with a game-over in their first season, and the match
   screen reads clearly.
2. **A career that doesn't dead-end.** Success and failure both lead somewhere —
   the closed-league arc (Europe, reputation, money) has at least its first leg
   in place.
3. **Authentic, distinct matches.** Fixtures feel different from one another and
   knockouts resolve correctly.

**Tranche A** below is scoped precisely to clear that bar. Tranches B–E are the
depth that turns a good launch into a game players stay with for years.

---

## 3. Cross-cutting implementation rules

Every item must follow these (from `CLAUDE.md` — they are invariants, not
suggestions):

- **Save schema.** New persisted state that changes the serialised shape
  incompatibly ⇒ bump `SAVE_VERSION` + add a `MIGRATIONS[N]` step + update
  `ACCEPTED_VERSIONS` + the `scripts/checkSaveSchema.ts` snapshot + the version
  tables in `docs/game-engine.md` / `docs/transfer-system.md`. **Additive-optional
  fields need only the snapshot update** — prefer them.
- **Randomness.** Pick the matching isolated stream — `rng` (match outcome) /
  `rngPosition` (lateral) / `pickRandom` (commentary) / `rngTransfer` (career).
  Never `Math.random()`. Adding draws to a stream shifts determinism hashes:
  land it as a deliberate **[RNG]** commit and re-baseline `npm run verify`.
- **Mutation seams.** All match-state mutation via new `MatchEvent` variants
  through `applyMatchEvent` (+ `assertInvariants` extension); all season mutation
  via new `SeasonEvent` variants through `applySeasonEvent` (+
  `assertSeasonInvariants`). The `default: never` exhaustiveness check enforces
  coverage.
- **Tuning.** Every probability, threshold, modifier, or weight lives in
  `src/engine/balance/` (one file per concern, barrel-exported). No new tuning
  literals in resolvers or systems.
- **Navigation.** The Hub stays at **six tiles**. New screens are reached through
  `ClubMenuScreen` (a `.cm-nav-row` entry), `ContractsTransfersMenuScreen` (a
  `.hub-tile` entry), or an existing sub-menu; init once via
  `initInSeasonScreens()` with a `getGameEngine` getter; register in
  `docs/DESIGN.md` §15.5 and add a help topic in `src/ui/help/helpContent.ts`.
- **Docs in the same commit.** Any documented system you touch updates its doc in
  the same commit. Engine balance numbers go *into* the doc, never "see
  `balance/X.ts`".
- **Verify gate.** `npm run build` and `npm run verify` pass before every commit;
  re-run `npm run telemetry` whenever engine balance was touched.

---

## 4. The roadmap

### Tranche A — Launch readiness (the v1.0 gate)

*Theme: make the game correct, legible, learnable, and dramatic enough to put in
front of the public. Low save-schema risk; mostly UI and engine-local. These can
run largely in parallel.*

#### A.1 Knockout extra time — P1, S/M  *(correctness)*

**Today:** knockout ties (playoff, domestic cup, **and now the live European
R16→Final**) are resolved by a home-side fallback —
`match.result.homeScore >= match.result.awayScore ? homeId : awayId` in
`applySeasonEvent.ts` (a code comment flags it as a placeholder). A drawn European
final being awarded to the "home" side of a neutral-venue fixture is the most
visible authenticity hole in a shipped system.

**Build:** on a draw at full time in a knockout, play two 10-minute periods, then
a kicking-competition fallback. The clock/period machinery in `ClockController`
already handles half transitions — add an `extraTime` period kind (and a
`golden_point` option behind a balance flag if wanted). `MatchCoordinator` gains
an `allowExtraTime` constructor flag set by the knockout orchestrators
(`PlayoffCoordinator`, `cupScheduler`, `EuropeanCoordinator`); default `false`
for league fixtures. Headless sims (`simulateFixture`) take the same flag so
AI-vs-AI knockouts resolve identically. Remove the home-side fallback once extra
time guarantees a winner.

**Touches:** `ClockController.ts`, `MatchCoordinator.ts`, the three knockout
orchestrators, `simulateFixture.ts`, `applySeasonEvent.ts`; `docs/match-engine.md`
§ clock + the playoff/European docs.
**Determinism:** **[RNG]** — extra-time periods consume outcome-stream draws;
re-baseline `verify`. **Save:** none (resolution is in-match).

#### A.2 Match momentum & key-moment timeline — P1, M

**Today:** every event is recorded in `state.events` but there is no post-match
browser; momentum is only implied by the live territory bar
(`PitchView.ts`). `keyMoment.ts` already auto-pauses on tries/cards/TMO and
`CommentaryFeed` hero-styles big moments — the data and the moment-detection both
exist, just not surfaced as a reviewable artefact.

**Build:**
- A **momentum model**: a pure `computeMomentum(events, windowTicks)` in
  `src/engine/` reading the existing log (territory from `state.ball.x`,
  possession, line breaks, penalties conceded, scores) — no new state, no RNG.
  Render as a horizontal strip in the match UI (extend `StatsPanel` or the
  territory strip).
- A **key-moments timeline** on `MatchResultScreen`: filter `state.events` for
  `TRY_SCORED`, `CARD_ISSUED`, penalties kicked, TMO decisions; render a tappable
  vertical timeline with minute, scoreline, and the already-generated commentary
  line. Reuse the `keyMoment.ts` classification so live auto-pause and the
  post-match timeline agree on what counts.
- *Stretch:* "replay this moment" — re-feed the stored `GameEvent`s around a
  selected event back through `buildDisplaySnapshot` + `PitchView` (the pipeline
  is already event-driven; frozen `GameEvent` payloads are schema-stable by
  design — do not restructure them).

**Touches:** new `src/engine/` momentum function; `StatsPanel.ts`,
`MatchResultScreen.ts`, `keyMoment.ts`; `docs/match-engine.md`.
**Save:** none for the live timeline. If post-match persistence is wanted, store a
compact `keyMoments` summary on the fixture result — additive optional, snapshot
update only.

#### A.3 Match-day presentation pass — P1, M

**Today:** the 2D pitch + reactive audio (`AudioDirector.ts`) + commentary are
strong, but the wrapper is utilitarian. `PreMatchScreen` shows a plain line-up
list; there is no score-flash hero treatment beyond commentary styling, no
stats interstitial, and no ratings reveal.

**Build (EA-FC-style framing, pure UI, respects `silent` throughout):**
- Animated **pre-match line-up presentation** — both XVs slide in over the pitch
  view, reusing the dot-formation machinery.
- **Score-flash treatments** on tries/cards (extend the existing hero-moment
  styling).
- A **half-time / full-time stats interstitial** (auto-shown `StatsPanel` data).
- A **post-match player-ratings reveal** — the rating data already exists;
  animate it count-up style.

**Touches:** `PreMatchScreen.ts`, `MatchResultScreen.ts`, `StatsPanel.ts`,
`PitchView.ts`/`PitchPlayers.ts` (line-up slide reuse), `keyMoment.ts`; pure UI,
no engine or save change. Pairs naturally with A.2.

#### A.4 Onboarding flow & difficulty presets — P1, S/M

**Today:** a contextual **help system** exists (per-screen `HelpOverlay` +
`helpContent.ts`), but there is no guided first-session walkthrough and **no
difficulty setting** at all (`grep` confirms none).

**Build:**
- A **first-session guided flow**: 5–6 dismissible coach-mark overlays on
  Hub / Squad / Tactics / Match, layered on the existing help-overlay component.
  Track completion in a simple `onboardingSeen` flags object in **settings
  storage, not the save**.
- **Difficulty presets** at new-game: Relaxed / Standard / Hardcore, each a
  multiplier set over existing `balance/` levers (board-confidence decay rate,
  budget multiplier, AI bid-premium aggressiveness). Stored on the save as an
  additive-optional `difficulty` field; no engine forks — the presets only scale
  numbers that already exist.

**Touches:** `src/ui/help/`, new onboarding flow, `SettingsScreen.ts`, the new-game
flow, `balance/` preset tables; `docs/DESIGN.md`.
**Save:** additive-optional `difficulty` ⇒ snapshot update only.

#### A.5 Drop goals — P2, M  *(signature rugby moment)*

**Today:** `PlayerMatchStats.dropGoals` / `PlayerSeasonStats.dropGoals` are
reserved-but-never-incremented; no open-play mechanic exists. A rugby sim with no
last-minute drop goal is missing a defining moment of the sport.

**Build:** extend `KickDecisionDirector` — in the opposition half, margin ≤3,
final 5 minutes (or red), evaluate a `drop_goal` option weighted by the
fly-half's `kicking` + `composure` and the existing AI `chasing/protecting`
intents. Resolve in `TacticalKickEvent` (or a slim dedicated handler): success ⇒
new `DROP_GOAL_SCORED` `MatchEvent` (+3; new `applyMatchEvent` branch; extend
`assertInvariants` score legality; extend `PlayerMatchStats` + `zeroMatchStats()`
+ the apply branch). Wire season stats through **both** the `statsDelta` type in
`gameState.ts` and the `seasonStatsCollector` reducer (the BUG-17 trap — see
`bugs.md`). Commentary keys + a 2D beat reusing `animateKickArc`. Keep it
AI/tactic-driven first (an `allowDropGoals` tactics toggle); a manual call can
come later.

**Touches:** `KickDecisionDirector.ts`, `TacticalKickEvent.ts`,
`types/matchEvent.ts`, `types/player.ts`, `applyMatchEvent.ts`, `invariants.ts`,
`seasonStatsCollector.ts`, `gameState.ts`, `balance/kickDecision.ts`, commentary
bank; `docs/match-engine.md`.
**Determinism:** **[RNG] [TELEMETRY]** — re-baseline `verify` and re-run
telemetry (drop goals shift scoring). **Save:** additive-optional stat ⇒ snapshot
update.

#### A.6 Accessibility foundation (light theme + colour-blind) — P2, S/M

**Today:** dark mode only; text scaling exists (`textScale.ts`); no light theme,
no colour-blind affordance.

**Build:** (a) finish the **light theme** — `DESIGN.md` defers it and the CSS
variable architecture should make it a token pass; (b) **colour-blind-safe
fallbacks** for team colours (the team-coloured commentary names and pitch dots
need a shape/pattern channel as well as hue). Localisation plumbing is deferred to
Tranche E.

**Touches:** `style/`, `teamColors.ts`, `PitchPlayers.ts`, `SettingsScreen.ts`;
`docs/DESIGN.md`. Pure UI; no save/engine change.

---

### Tranche B — The closed-league career spine

*Theme: the long-term retention layer. In a closed Premiership the arc is
reputation + money + recorded history. This is the heart of "build a dynasty".
B.1 and B.2 are the two highest-impact post-launch items in the whole roadmap.*

#### B.1 Manager reputation & the manager carousel — P1, L/XL

**Today:** sacking is terminal — `SackScreen` clears the save and offers only New
Game / Main Menu. There is no manager identity beyond board confidence. This is
the single biggest career-mode gap: a sacking should be a setback, not a
game-over, and success should open doors.

**Build:**
- `ManagerState` on `GameState.career`: `reputation: 0–100` (moves on trophies,
  over/under-achievement vs board expectation, win%) + `history:
  ManagerJobRecord[]`. Additive ⇒ snapshot update.
- An **AI manager pool** (~14 personas via `personaGenerator` patterns) assigned
  to the other 9 clubs; each season 1–3 AI clubs cycle managers based on league
  position vs a simple expectation table (career stream).
- A **vacancy flow**: on sack (or a voluntary "Resign"), instead of ending the
  save, show a `JobMarketScreen` — vacancies whose club ambition ≤ manager
  reputation are offerable. Accepting rebinds `state.career.userClubId`; audit
  every reader of the user club (`GameCoordinator`, board, inbox, the transfer /
  staff / European coordinators) — they all read it from one place today, which
  is what makes this tractable. Unemployment ticks weeks forward via the existing
  headless round-sim loop until an offer is taken.
- Board expectation at the new club seeds from the existing `BoardState`
  machinery. `SackScreen` becomes a fork: retire (old behaviour) or seek work.

**Touches:** `types/gameState.ts`, `applySeasonEvent.ts`, `BoardCoordinator.ts`,
`GameCoordinator.ts`, new `JobMarketScreen.ts`, `SackScreen.ts`, `main.ts`
new-game/resume flow; `docs/game-engine.md`.
**Determinism:** **[RNG]** (AI manager cycling). **Save:** additive `manager`
subtree; the `userClubId` rebind must be exercised by a new leg in
`scripts/checkSeasonDeterminism.ts`.

#### B.2 Real financial model — P1, L  *(build incrementally)*

**Today:** `FinancesScreen` shows a player salary budget vs committed wages, a
staff budget, and a **one-way slider** moving salary headroom into staff — that
is the whole economy. Attendance is computed deterministically but display-only;
there is no revenue and no transfer fee (`TransferBid` carries wage + length +
kind only, no `fee`).

**Build in three phases:**
- **Phase A — revenue ledger (display + budget input).** A monthly ledger on
  `ClubState`: gate receipts (attendance × authored ticket price — the attendance
  model already exists), sponsorship (authored per-club base × league-position
  multiplier), prize money (league finish + cup/European progression — hook the
  existing elimination/champion events), wages out (sum of contracts). Surface in
  `FinancesScreen`; feed the year-on-year budget formula from the ledger balance
  instead of position-only. `SeasonEvent` `LEDGER_MONTH_POSTED`; constants in new
  `balance/finance.ts`; additive-optional save subtree.
- **Phase B — transfer fees.** Players under contract become buyable: fee = wage ×
  years-remaining × age/potential multiplier (`balance/transfers.ts`). Add a `fee`
  field to the existing `TransferBid` (the competitive multi-round bid system is
  already there); Reg-7 free pre-agreements stay as the fee-avoidance route (real
  rugby flavour). AI clubs get a transfer pot from their ledger. This changes
  `MarketState`/`TransferBid` shape ⇒ **likely a `SAVE_VERSION` bump + migration.**
- **Phase C — board investment asks.** Spend ledger surplus on facilities (B.3) or
  budget boosts via a request interaction on `BoardConfidenceScreen`
  (accept/deny on confidence + ledger).

**Touches:** `types/gameState.ts` (`ClubState`, `MarketState`, `TransferBid`),
`applySeasonEvent.ts`, `FinancesScreen.ts`, `BoardConfidenceScreen.ts`,
`TransferCoordinator.ts`, `aiTransferDirector.ts`, new `balance/finance.ts`;
`docs/game-engine.md` + `docs/transfer-system.md`.
**Determinism/Save:** Phase A additive; Phase B is the save-bump.

#### B.3 Facilities & training-ground investment — P2, M  *(depends on B.2 Phase A)*

**Today:** none.

**Build:** two club facility levels (1–5): `trainingFacilities` (multiplier on
`trainingRunner` gains) and `medicalFacilities` (injury-week + recurrence-window
reduction). Upgrades cost ledger surplus (B.2 Phase C) and take a season to
complete (inbox progress items). AI clubs get static authored levels so effects
stay symmetric. Small system, big "building a club" feel.

**Touches:** `types/gameState.ts` (`ClubState`), `applySeasonEvent.ts`,
`trainingRunner.ts`, `injuryEffects.ts`, `FinancesScreen.ts` (or a small
facilities surface), new `balance/facilities.ts`; `docs/game-engine.md`.
**Save:** additive-optional on `ClubState`.

#### B.4 Club history, records & hall of fame — P2, S/M

**Today:** the archive data already exists (`ArchivedSeason` with standings,
champions, top scorers/carriers/tacklers, MVPs, per-player season history) but
has no dedicated surface — only the player-facing `AchievementsScreen`.

**Build:** a `ClubHistoryScreen` (via `ClubMenuScreen`): season-by-season
finishes, trophies, club records (most tries in a season, most appearances, most
points — computable from the archived history), and a hall of fame (retired
players above appearance/achievement thresholds — hook `PLAYER_RETIRED` to append
to a `hallOfFame` list). Cheap (pure UI + one small reducer) and disproportionate
retention value: it makes a long career feel *recorded*.

**Touches:** new `ClubHistoryScreen.ts`, `ClubMenuScreen.ts`,
`applySeasonEvent.ts` (the `hallOfFame` append), `types/gameState.ts`;
`docs/game-engine.md`, `docs/DESIGN.md`.
**Save:** additive-optional `hallOfFame` ⇒ snapshot update.

---

### Tranche C — Squad depth & the human layer (FM "feel")

*Theme: deepen the week-to-week loop and the emotional attachment to individual
players. These benefit from the financial model (academy/staff/facilities
budgets) being in place, so they follow Tranche B — though C.1 (roles) and C.2
(personality) are independent of finance and can be pulled forward
opportunistically if squad depth is wanted sooner.*

#### C.1 Player roles & individual instructions — P1, L

**Today:** tactics are team-level only (9 dimensions + per-zone numerics). There
is no per-player role. FM's defining feature is per-player roles/duties.

**Build (rugby-flavoured, not a soccer copy):** add `role?: PlayerRole` to the
matchday slot assignment, set in `PreMatchScreen` / `MidMatchTeamEditor`. Example
sets: fly-half `first_receiver | flat_attack | deep_playmaker`; back row
`jackal_specialist | carrier | lineout_option`; scrum-half `box_kicker | sniper`;
fullback `counter_attacker | positional`; wings `roam_infield | hold_width`. Roles
are **modifier providers, not new phases**: a `balance/roles.ts` table maps role →
small modifiers on existing resolver inputs (e.g. `jackal_specialist`: +X to
breakdown steal when that player is the arriving jackal; `box_kicker`: shifts the
kick-family weights `KickDecisionDirector` already consumes; `carrier`: raises
carry-target selection weight), threaded through `PhaseContext` like tactics
modifiers. AI clubs get a default role map in authored club identity data. UI: a
role chip per slot row with a familiarity indicator.

**Touches:** selection payload, `PreMatchScreen.ts`, `MidMatchTeamEditor.ts`,
`SquadManagementScreen.ts`, `engine/events/*` resolver inputs, `PhaseContext`,
new `balance/roles.ts`; `docs/match-engine.md`.
**Determinism:** **[RNG] [TELEMETRY]** — role modifiers change outcome
consumption; re-baseline once, re-run telemetry (target: role choice shifts win%
by low single digits, like a tactic dimension). **Save:** additive-optional
selection field ⇒ snapshot update.

#### C.2 Player personality & temperament — P1, M

**Today:** morale is reason-tagged and reactive and "Have a Chat" exists, but
player agency is wage-driven only; there is no personality.

**Build:** add `temperament: 'professional' | 'ambitious' | 'loyal' | 'volatile'
| 'laid_back'` to `Player` (additive optional; assign at generation from
`rngTransfer`, **and author it for the real starting squads** in
`docs/team-data.md` + regenerate via `scripts/generateTeamJsons.mjs` — follow the
"stats are authored" rule). Consume it everywhere morale already moves
(`moraleEffects.ts`, transfer-request triggers, promise tracking, team-talk
responses): temperament scales the magnitude/decay of existing deltas (volatile
×1.5; professional ×0.6; loyal ⇒ poach-resistance bonus; ambitious ⇒ stronger
reaction to playing-time promises and European elimination). Surface as a
one-word trait chip on `PlayerProfileScreen` and in scouting reports
(range-banded until scouted, consistent with the OVR-hiding design). Constants in
`balance/morale.ts`.

**Touches:** `types/player.ts`, `moraleEffects.ts`, `TransferCoordinator.ts`,
`TeamTalkScreen.ts`/`HalfTimeTalkPanel.ts`, `PlayerProfileScreen.ts`,
`ScoutingScreen.ts`, `docs/team-data.md` + JSON regen, `balance/morale.ts`;
`docs/game-engine.md`.
**Determinism:** **[RNG]** (generation draw). **Save:** additive-optional ⇒
snapshot update.

#### C.3 Manageable youth academy — P2, L

**Today:** academy intake is automatic at rollover (`careerRollover.ts` —
`ACADEMY_GRADUATED`) with no screen and no agency.

**Build:** an `AcademyState` on `GameState.career` — a per-user-club list of 6–10
prospects (16–19yo) from `personaGenerator` with wider potential variance and low
current stats (additive optional; generate via `rngTransfer` at rollover, a
deliberate **[RNG]** commit). An **intake-day** inbox item presents the year's
class with scout-style range bands (reuse the `ScoutingScreen` band mechanic).
Prospects are just roster players with an `academy: true` flag, excluded from
selection until promoted, developing via the existing aging curves. Manager
actions: **promote** (cheap 2-year deal via the contract seeder), **release**,
**send on loan** (reuse the development-loan path; 1.5× dev multiplier already
exists). New `AcademyScreen` via `ClubMenuScreen` (not a Hub tile). SeasonEvents
`ACADEMY_CLASS_GENERATED` / `ACADEMY_PLAYER_PROMOTED` / `ACADEMY_PLAYER_RELEASED`
+ reducers + invariants + `docs/game-engine.md` mutation-seam rows.

**Touches:** `types/gameState.ts`, `types/player.ts` (`academy` flag),
`careerRollover.ts`, `applySeasonEvent.ts`, `personaGenerator.ts`, new
`AcademyScreen.ts`, `ClubMenuScreen.ts`; `docs/game-engine.md`, `docs/DESIGN.md`.
**Save:** additive-optional `AcademyState` ⇒ snapshot update.

#### C.4 Full staff structure — P2, L

**Today:** exactly three roles (`assistant | fitness | scout`), player-club only.

**Build:** extend `StaffRole` with `forwardsCoach`, `backsCoach`, `kickingCoach`,
`headPhysio` — each a generated persona with a 1–99 quality stat and wage from the
existing staff budget. Effects route through existing systems, no new engine
paths: forwards coach ⇒ training-gain multiplier on the 4 forwards focuses + small
scrum/lineout resolver modifier; backs coach ⇒ backs focuses + first-phase
quality; kicking coach ⇒ goal-kick + tactical-kick accuracy; physio ⇒ injury-week
reduction (stack with the current fitness lead, then narrow fitness to condition
recovery). AI clubs get one authored staff-quality number per club so the modifier
is symmetric — no AI staff market. Extend `StaffScreen`, the role enum, the
hire/release reducers, and `staffPoolGenerator`. Constants in `balance/staff.ts`.

**Touches:** `types/gameState.ts` (`StaffRole`, `StaffState`),
`applySeasonEvent.ts`, `StaffScreen.ts`, `StaffCoordinator.ts`,
`staffPoolGenerator.ts`, `trainingRunner.ts`, resolver inputs, `balance/staff.ts`;
`docs/game-engine.md`.
**Save:** prefer additive-optional new roles (snapshot update); if `StaffState`
keys change, bump `SAVE_VERSION` with a migration backfilling the new roles as
vacant.

#### C.5 Expanded specialist attributes — P2, M

**Today:** 12 generic stats. Goal-kicking, tactical kicking, and the 50:22 all
read `kicking`; all set-piece work reads `setPiece`; jackaling reads
`breakdown` + `strength`.

**Build conservatively — 3 additions, not 20:** `goalKicking`, `lineoutThrowing`,
`jackaling` as **separate optional fields on `Player`** (not new `baseStats`
keys — that keeps the 12-stat contract and the position-weighted OVR intact).
Phase 1: compute them as weighted blends of existing stats at `initPlayer` (no
data change; migrate all formulas). Phase 2: author real values in
`docs/team-data.md` → regenerate JSONs. Migrate consumers: `pickKicker` + goal-kick
model → `goalKicking`; lineout throw accuracy → `lineoutThrowing`; breakdown steal
→ `jackaling`.

**Touches:** `types/player.ts`, `initPlayer`, `KickingResolver.ts`,
`LineoutResolver.ts`, `BreakdownResolver.ts`, `FieldPosition.pickKicker`,
`docs/team-data.md` + JSON regen; `docs/match-engine.md`.
**Determinism:** **[RNG] [TELEMETRY]** if the blend changes any roll input —
re-baseline. **Save:** additive-optional ⇒ snapshot update.

#### C.6 Injury & medical depth — P2, M

**Today:** 8 kinds × 3 severities, weeks-based recovery, but recurrence is
**scaffolded-and-deferred** (`injuryEffects.ts` always emits
`isRecurrence: false`; the `INJURY_RECURRENCE_*` balance constants exist but are
unwired — `bugs.md` BUG-50). `concussion` is a kind but there is no HIA flow.

**Build:** wire recurrence (a player returning early on low `condition` carries
`recurrenceMult` on in-match injury rolls for `recurrenceWindowWeeks`); add a
**return-to-play choice** on the inbox item (rush back at ~90% condition + risk vs
hold a week); add an **HIA sub-type** for head knocks (forced permanent removal
that doesn't consume a tactical sub — extend the forced-sub path that already
exists for red_20). Medical staff (C.4) and medical facilities (B.3) reduce
recurrence windows.

**Touches:** `injuryEffects.ts`, the match injury resolver, the substitution
machinery, inbox CTA, `balance/injuries.ts`; `docs/match-engine.md`,
`docs/game-engine.md`.
**Determinism:** **[RNG] [TELEMETRY]** — re-baseline.

#### C.7 Contract clauses & agent friction — P3, M

**Today:** `PlayerContract` is wage + length + `isMarquee` only.

**Build 2–3 clauses, not FM's twenty:** signing-on bonus (one-off ledger hit,
improves acceptance probability), playing-time clause (formalises the existing
promise machinery into the contract — breach triggers the existing
transfer-request path), and a release-fee clause (interacts with B.2 Phase B
fees). Extend the `signingResolver`/renewal flows + the negotiation UI in
`ContractsScreen`.

**Touches:** `types/player.ts` (`PlayerContract`), `signingResolver.ts`,
`RenewalsScreen.ts`/`ContractsScreen.ts`, `applySeasonEvent.ts`;
`docs/transfer-system.md`.
**Save:** `PlayerContract` shape change ⇒ **`SAVE_VERSION` bump + migration**
backfilling absent clauses.

#### C.8 Scouting depth — P2, M

**Today:** per-target range bands narrowing with scout accuracy, OVR hidden until
scouted, a dedicated `ScoutingScreen` — a strong foundation, but the user must
already know who to scout.

**Build:** (a) **scout-by-brief** assignments ("find a young openside under £80k")
surfacing 3–5 candidates/month from the existing generated pools; (b) **scout
reports as inbox cards** with a one-line verdict and a two-row star rating for
current/potential (potential as a band only — never the hidden number); (c)
**regional bias** — scouts have a nationality affinity improving accuracy on
matching personas. All career-stream; extends `ScoutingScreen` + inbox.

**Touches:** `scouting.ts`, `ScoutingScreen.ts`, `StaffCoordinator.ts` (scout
briefs), inbox, `balance/scouting.ts`; `docs/transfer-system.md`.
**Determinism:** **[RNG]**.

#### C.9 Squad registration & cap pressure — P3, M

**Today:** salary cap + marquee only; no squad-size or homegrown rule.

**Build:** Premiership-style senior-squad registration (e.g. 33 senior + unlimited
academy, a homegrown minimum) checked at window close; a `RegistrationScreen` step
in the end-of-season chain flags violations and blocks rollover until resolved.
Adds genuine squad-building constraint pressure — where transfer decisions get
their tension. Pairs with C.3 (academy supplies homegrown) and B.2 (fees raise the
cost of over-squadding).

**Touches:** new `RegistrationScreen.ts`, the rollover chain in
`GameCoordinator.ts`/`careerRollover.ts`, `balance/transfers.ts`;
`docs/transfer-system.md`, `docs/game-engine.md`.

---

### Tranche D — Match texture & seasonal colour

*Theme: make every fixture and every season feel distinct. Each item is an
isolated balance addition that lands best once roles (C.1) and the presentation
layer (A.2/A.3) make their effects visible. Cheap individually; collectively they
transform replay value. Any of D.1–D.3 can be pulled forward as one-session wins
if a quick "every match is different" boost is wanted between larger tranches.*

#### D.1 Set-piece calls — P1, M

**Today:** scrums and lineouts resolve with no manager input (jumper selection and
scrum engagement are automatic).

**Build:** a **lineout call** when the user throws in (`front | middle | back |
off_the_top_to_9` — front safest/lowest reward, back riskier/better platform,
modifying subsequent `FirstPhase` quality and maul availability) and a **scrum
intent** (`hook_and_clear | shove_for_penalty | channel_one_quick`, shifting the
weights the `ScrumEvent` resolver already computes). Implement as a pre-set default
in `TeamTactics` (works without pausing) and/or a live modal gated on `silent`
exactly like `PenaltyHandler`'s decision modal. Prefer reading the call from
tactics at resolve time so **no new `MatchEvent` is needed**.

**Touches:** `TeamTactics`, `LineoutEvent.ts`, `ScrumEvent.ts`,
`balance/lineout.ts`/`balance/scrum.ts`, tactics UI; `docs/match-engine.md`.
**Determinism:** **[RNG] [TELEMETRY]**.

#### D.2 Weather & pitch conditions — P2, M

**Today:** none — every match plays in identical conditions.

**Build:** per-fixture `weather: 'dry' | 'wet' | 'wind' | 'cold'` rolled at
fixture creation from the **career stream** with month-weighted probabilities
(`balance/weather.ts`), stored on the fixture (additive optional). A `weatherMods`
entry on `MatchState` set once in `initMatchState`: wet ⇒ +knock-on, −pass-chain
length, +AI kick weighting; wind ⇒ wider goal-kick miss + shifted `rngPosition`
launch-angle spread; cold ⇒ small fatigue-drain increase — all consumed where
those formulas already live. Weather chip on `PreMatchScreen` + scoreboard;
weather commentary lines (commentary stream); a weather column in `telemetry.ts`.

**Touches:** fixture generation, `initMatchState`, `balance/openPlay.ts`,
`balance/kicking.ts`, fatigue intervals, `PreMatchScreen.ts`, commentary,
`scripts/telemetry.ts`, new `balance/weather.ts`; `docs/match-engine.md`.
**Determinism:** **[RNG] [TELEMETRY]**. **Save:** additive-optional fixture field.

#### D.3 Referee profiles — P2, S/M

**Today:** penalties/cards use flat probabilities; no referee variation.

**Build:** a small authored pool (`src/data/referees.ts`, ~12 named refs) with two
dials — `strictness` (scales penalty base rates ±15%) and `cardThreshold` (scales
the team-22 cumulative-penalty warning and high-tackle escalation). Assign per
fixture from the career stream at scheduling time (stored on the fixture, additive
optional). Consume in `CardHandler.evaluateNewPenalty` and the penalty base-rate
sites by multiplying, not forking. Pre-match screen shows the ref + tendencies —
the loop is adjusting the `discipline` lever against a strict ref.

**Touches:** new `src/data/referees.ts`, fixture assignment, `CardHandler.ts`,
penalty resolvers, `PreMatchScreen.ts`; `docs/match-engine.md`.
**Determinism:** **[RNG] [TELEMETRY]**. **Save:** additive-optional fixture field.

#### D.4 Pre-season friendlies — P2, S/M

**Today:** pre-season is the Prem Cup Leg 0 only (`InternationalBreakCoordinator`
`runPreSeasonBlock`); no friendlies.

**Build:** 2 selectable friendlies before round 1 (opponent picker from the
existing European opponent pool), low-stakes (no league stats; morale / condition
/ familiarity benefits; trial academy players under relaxed selection). Implement
as extra fixtures with a `friendly` competition tag through the existing
live/headless match path — `seasonStatsCollector` already supports a `competition`
discriminator.

**Touches:** `cupScheduler.ts`/season calendar, `InternationalBreakCoordinator.ts`,
`seasonStatsCollector.ts`, a friendly-opponent picker UI; `docs/game-engine.md`.

#### D.5 International management hooks — P3, M

**Today:** breaks call players up and return them with condition/injury effects,
but the user only experiences absence — no visibility into international results.

**Build (lightweight):** during breaks, show the user's players' international
results + performance lines in the inbox (generate via the existing media phrase
machinery + a couple of headless sims with the duty engine's data); a
"release request" decision (refuse ⇒ player morale hit + board relief — the
club-vs-country tension). **Not** full playable international management (poor
effort/value — see §6).

**Touches:** `internationalDutyEngine.ts`, `InternationalBreakCoordinator.ts`,
inbox, `src/game/media/`; `docs/game-engine.md`.
**Determinism:** **[RNG]**.

#### D.6 Fan sentiment & rivalries — P3, M

**Today:** derbies are flagged in fixtures and media stories are flavour-only;
there is no sentiment meter.

**Build:** a `fanSentiment: 0–100` per-season meter (moves on results, derby
outcomes ×2, style-of-play vs club DNA — the style-DNA media archetype already
computes this signal) shown on `BoardConfidenceScreen`; feeds attendance fill-rate
(the model already takes a significance input) and one board-confidence driver.
Closes the loop on the existing attendance + media systems.

**Touches:** `types/gameState.ts`, `applySeasonEvent.ts`, `attendance.ts`,
`board.ts`, `BoardConfidenceScreen.ts`, `src/game/media/`; `docs/game-engine.md`,
`docs/media-manager.md`.
**Save:** additive-optional ⇒ snapshot update.

---

### Tranche E — Reach & longevity

*Theme: widen the audience and harden long-term ownership. Independent of game
depth; can run in parallel with any tranche once the core is stable.*

#### E.1 Cloud saves & Android — P3, M/L

**Today:** localStorage + iOS Documents mirror; `capacitor.config.ts` is iOS-only;
no Android, no cloud.

**Build order:** (a) **Android via Capacitor** — the iOS shell pattern is
established and assets are already base-relative; add the android platform and
test save mirroring on the Android filesystem API; (b) **iCloud document sync** on
iOS via a Capacitor plugin, syncing the existing slot payloads (conflict rule:
newest `savedAt` wins, with a chooser on conflict — the payload already carries
`savedAt`); (c) a desktop/Steam wrap is optional later.

**Touches:** `capacitor.config.ts`, `src/native/`, `saveBackup.ts`,
`SavesScreen.ts`; `docs/game-engine.md` (save format note).

#### E.2 Localisation foundation — P3, M

**Today:** single en-GB locale; the commentary banks are already locale-keyed
(`src/commentary/banks/en-GB/`).

**Build:** externalise the commentary/UI string banks behind a selectable locale
bank (add the selection plumbing even if en-GB stays the only shipped bank — cheap
now, expensive later). Pairs with the accessibility work in A.6.

**Touches:** `src/commentary/banks/`, a locale-select setting, UI string
extraction; `docs/DESIGN.md`.

#### E.3 Reactive audio & atmosphere extensions — P3, S/M

**Today:** the reactive crowd-bed + event-cue system is **already shipped**
(`AudioDirector.ts` — idle/engaged/tension beds, roars/groans/surges, whistle and
impact cues). This is largely *done*.

**Build (incremental only):** tie crowd intensity to the A.2 momentum model once
it exists, and add European-night / derby atmosphere variants. Pure UI. Low
priority — listed for completeness, not as a gap.

---

## 5. Sequencing summary

| Tranche | Items | Theme | Release line |
|---|---|---|---|
| **A** | A.1 extra time · A.2 momentum/timeline · A.3 presentation pass · A.4 onboarding/difficulty · A.5 drop goals · A.6 light theme/colour-blind | Launch readiness — correct, legible, learnable, dramatic | **Ships v1.0** |
| **B** | B.1 manager carousel · B.2 financial model A→B→C · B.3 facilities · B.4 club history | The closed-league career spine (retention core) | Post-launch, first |
| **C** | C.1 roles · C.2 personality · C.3 academy · C.4 staff · C.5 specialist attrs · C.6 injuries · C.7 contract clauses · C.8 scouting depth · C.9 registration | Squad depth & the human layer | Post-launch |
| **D** | D.1 set-piece calls · D.2 weather · D.3 referees · D.4 pre-season · D.5 intl hooks · D.6 fan sentiment | Match texture & seasonal colour | Post-launch |
| **E** | E.1 cloud/Android · E.2 localisation · E.3 audio extensions | Reach & longevity | Parallel / ongoing |

**Dependency notes.**
- **B.3** needs **B.2 Phase A** (a ledger to spend). **B.1 ↔ relegation** is moot
  here — there is no relegation by design.
- **C.3 / C.4 / B.3** all draw on the **B.2** economy; build B first.
- **C.9** wants **C.3** (academy supplies homegrown) and **B.2 Phase B** (fees
  make over-squadding costly).
- **A.5 drop goals** and **C.5 specialist attrs** both touch the season-stats
  delta seam — confirm the BUG-17 pattern is clean first (it has been fixed; see
  `bugs.md`).
- **D.1–D.3** are isolated balance additions — pull forward opportunistically.
- Every engine-balance change ends with `npm run build`, `npm run verify`, and a
  `npm run telemetry` review.

**Why this order serves the north star.** Tranche A wins the *first impression*
(draw-in): a learnable, correct, good-looking match. Tranche B builds the
*long-term hook* (retain): a career that survives a sacking and rewards
dynasty-building. Tranche C deepens the *daily loop* and the attachment to
individual players. Tranche D adds *replay variety*. E widens the door. Each
tranche is independently shippable and leaves the game in a coherent state.

---

## 6. Explicitly not pursuing

Recorded so the decisions aren't relitigated:

- **A second playable division / promotion / relegation.** The Premiership is a
  closed franchise league with no promotion or relegation from the top flight
  since 2020/21 — a second tier would be inauthentic, and it is an XL content
  build. The closed-league career arc is served by European competition (shipped),
  the manager carousel (B.1), and the financial model (B.2) instead.
- **Full playable international management.** Poor effort/value against the club
  game. The lightweight international *hooks* in D.5 (results in the inbox, a
  release-request decision) capture the club-vs-country tension without the build.
- **A 3D match engine.** Fights the no-backend / browser / mobile constraints for
  marginal return over the already-strong 2D pitch.
- **Full voice commentary.** Out of scope for an indie build; the reactive
  crowd-audio system (shipped) plus text commentary covers the feel.

---

## 7. Deeper match-realism backlog (parked)

If the north star ever shifts toward on-pitch realism, these lead — tracked so
the alternative isn't lost. They are nice-to-have refinements, not retention
drivers:

- **Dynamic in-match momentum feeding rolls** (not just the A.2 visualisation):
  confidence swings after try streaks, turnovers, or cards biasing subsequent
  rolls.
- **Non-linear fatigue + cramping** in the closing stages.
- **Place-kicking realism** — distance / angle / wind / pressure model with a
  visible kick (pairs with D.2 wind and C.5 `goalKicking`).
- **Alternative kicking styles** — garryowen / cross-field / grubber / chip as
  distinct tactical options.

---

## 8. Relationship to `bugs.md` (foundation gate)

`bugs.md` is a separate, living full-codebase review and **stays separate** — it
is not folded into this roadmap. Treat its outstanding items (notably the
fixture-generator correctness work, BUG-01) as a **foundation gate**: stabilise
the engine, determinism, and save harnesses there before layering new season-scope
systems (Tranches B and C) on top. The two documents are read together — `bugs.md`
keeps the floor solid; this roadmap builds the rooms.
