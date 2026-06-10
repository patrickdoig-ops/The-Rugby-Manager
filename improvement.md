# Improvement Roadmap — Bringing The Rugby Manager to Football Manager / EA FC Parity

This document proposes the improvements that would close the gap between the current game and the genre leaders (Football Manager's management depth; EA FC's match-day presentation and career polish), adapted to rugby. Each item states what exists today, what to build, and a concrete implementation sketch against this codebase so it can be handed to an implementing agent.

**Cross-cutting implementation rules** (from CLAUDE.md — the implementer must follow these on every item):

- New persisted state ⇒ if the serialised shape changes incompatibly, bump `SAVE_VERSION` + add a `MIGRATIONS[N]` step + update `ACCEPTED_VERSIONS` + the `scripts/checkSaveSchema.ts` snapshot + the version tables in `docs/game-engine.md`/`docs/transfer-system.md`. Additive-optional fields need only the snapshot update.
- New randomness ⇒ pick the matching stream (`rng` outcome / `rngPosition` lateral / `pickRandom` commentary / `rngTransfer` career) — never `Math.random()`. Adding draws to the career stream changes determinism hashes; land as a deliberate commit and re-baseline `npm run verify`.
- All match-state mutations via new `MatchEvent` variants through `applyMatchEvent`; all season mutations via new `SeasonEvent` variants through `applySeasonEvent` (+ invariant extensions).
- All tuning numbers in `src/engine/balance/` (one file per concern, barrel export).
- **The Hub stays at six tiles.** New screens are reached through `ClubMenuScreen` (add a `.cm-nav-row` entry) or `ContractsTransfersMenuScreen` (add a `.hub-tile` entry). New screens init once via `initInSeasonScreens()` with a `getGameEngine` getter, and register in `docs/DESIGN.md` §15.5.
- Update the matching doc in the same commit as the code.

Priorities: **P1** = biggest parity gap per unit effort, do first. **P2** = major features, larger builds. **P3** = polish/scale. Effort: S (≤1 day), M (days), L (week+), XL (multi-week).

---

## Part 1 — Match Day (EA FC / FM match-engine parity)

### 1.1 Match momentum & highlights timeline — P1, M

**Today:** every event is recorded in `state.events` (`GameEvent[]`) but there is no way to browse a match afterwards; no momentum visualisation. FM's match screen and EA FC both lead with a momentum graph + key-moment timeline.

**Build:**
- A **momentum model**: a rolling score per side computed from recent events (territory from `state.ball.x`, possession, line breaks, penalties conceded, scores). Implement as a pure function `computeMomentum(events, windowTicks)` in `src/engine/` reading the existing event log — no new state, no RNG. Surface as a horizontal bar/graph strip in the match UI (extend `StatsPanel` with a sixth view or add to the territory strip in `index.html`).
- A **key-moments timeline** on `MatchResultScreen`: filter `state.events` for tries, cards, penalties kicked, TMO decisions (the types already exist — `TRY_SCORED`, `CARD_ISSUED`, etc.), render as a tappable vertical timeline with minute, scoreline, and the already-generated commentary line (`COMMENTARY_LOGGED` entries are in the log).
- Optional stretch: "replay this moment" — re-run the 2D pitch beats around a selected event. The display pipeline (`buildDisplaySnapshot` + `PitchView`) is already event-driven; a replay would feed stored `GameEvent`s back through the presenter. Per CLAUDE.md §3, frozen `GameEvent` payloads are schema-stable, which is exactly what makes this feasible — do not restructure them.

**Why P1:** highest visible-quality win; uses data the engine already produces; zero impact on determinism or save schema (timeline reads the live match only; if post-match persistence is wanted, store a compact `keyMoments` summary on `FixtureResult` — additive optional, snapshot update only).

### 1.2 Player roles & individual instructions — P1, L

**Today:** tactics are team-level only (9 dimensions + advanced per-zone numerics). FM's defining feature is per-player roles/duties.

**Build (rugby-flavoured roles, not a soccer copy):**
- Add `role?: PlayerRole` to the matchday slot assignment (per-slot, set in `PreMatchScreen`/`MidMatchTeamEditor`). Example role sets: fly-half `first_receiver | flat_attack | deep_playmaker`; back row `jackal_specialist | carrier | lineout_option`; scrum-half `box_kicker | sniper`; fullback `counter_attacker | positional`; wings `roam_infield | hold_width`.
- Engine consumption: roles are *modifier providers*, not new phases. Add a `src/engine/balance/roles.ts` table mapping role → small modifiers on existing resolver inputs (e.g. `jackal_specialist`: +X to breakdown steal contribution when that player is the arriving jackal in `BreakdownEvent`; `box_kicker`: shifts the kick-family weights already consumed by `KickDecisionDirector`; `carrier`: raises that player's selection weight in carry-target picks). Thread through `PhaseContext` the same way tactics modifiers already flow.
- Persist on the saved team selection (additive optional field on the selection payload — snapshot update, no version bump if optional).
- AI: give each club's `suggestedTactics` a default role map in the authored club identity data.
- UI: role picker chip on each slot row in `SquadManagementScreen`/`PreMatchScreen`; OOP-style severity chip showing role familiarity.

**Determinism note:** role modifiers change outcome-stream consumption ⇒ verify hashes re-baseline once; telemetry re-run required to confirm balance (target: role choices shift win% by low single digits, like a tactic dimension).

### 1.3 Set-piece calls — P1, M

**Today:** scrums and lineouts resolve with no manager input; the maul is zone-gated. Rugby's equivalent of FM set-piece routines is choosing the lineout target and scrum intent.

**Build:**
- **Lineout call** (when the user's team throws in): `front | middle | back | off_the_top_to_9`. Front = safest, lowest reward; back = riskier, better launch platform (modifier on the subsequent `FirstPhase` quality and maul availability). Implement as a modal in live play (gate on `silent` exactly like `PenaltyHandler`'s decision modal — `MatchCoordinator` already short-circuits modals to defaults when silent) or as a pre-set default in tactics (`TeamTactics.lineoutCall`) so it works without pausing.
- **Scrum intent**: `hook_and_clear | shove_for_penalty | channel_one_quick`. Modifier table in `balance/scrum.ts` feeding the existing `ScrumEvent` resolver (wheel/penalty/clean probabilities already exist — the intent shifts weights between them).
- Add `LINEOUT_CALL_SET` / nothing new to state if implemented as resolver inputs read from tactics at resolve time (preferred — no new MatchEvent needed).

### 1.4 Weather & pitch conditions — P2, M

**Today:** none. FM/EA FC both model weather affecting play.

**Build:**
- Per-fixture `weather: 'dry' | 'wet' | 'wind' | 'cold'` rolled at fixture creation time from the **career stream** (`rngTransfer`) with month-weighted probabilities (authored in `balance/weather.ts`), stored on the fixture (additive optional ⇒ snapshot update). Derby/finals get no special casing.
- Engine consumption: a `weatherMods` entry on `MatchState` set once in `initMatchState` from the fixture: wet ⇒ + knock-on chance, − pass-chain length, + kick frequency weighting for AI; wind ⇒ widen goal-kick miss distribution + shift `rngPosition` launch-angle spread; cold ⇒ small fatigue drain increase. All consumed where those formulas already live (`balance/openPlay.ts` knockOnPct, `balance/kicking.ts` goal-kick model, fatigue intervals).
- UI: weather chip on `PreMatchScreen` and the match scoreboard; commentary bank gets weather flavour lines (commentary stream, isolated by design).
- Telemetry: add a weather column to `scripts/telemetry.ts` so balance per condition is visible.

### 1.5 Referee profiles — P2, S/M

**Today:** penalties/cards use flat probabilities. FM models referee strictness.

**Build:** a small authored referee pool (`src/data/referees.ts`, ~12 named refs) with two dials: `strictness` (scales penalty base rates ±15%) and `cardThreshold` (scales the team-22 cumulative-penalty warning trigger and high-tackle card escalation). Assign per fixture from the career stream at scheduling time (stored on the fixture, additive optional). Consume in `CardHandler.evaluateNewPenalty` and the penalty base-rate sites — multiply, don't fork logic. Pre-match screen shows the ref + tendencies (this is the gameplay loop: adjust `discipline` tactics against a strict ref).

### 1.6 Drop goals — P2, M

**Today:** `PlayerSeasonStats.dropGoals` is reserved-but-zero; no open-play drop-goal mechanic. A rugby sim without drop goals at the death is missing a signature moment.

**Build:** extend `KickDecisionDirector`: when in opposition half, score margin ≤3, clock in final 5 minutes (or red), evaluate a `drop_goal` option weighted by fly-half `kicking` + `composure` and tactical intent (the AI `chasing/protecting` intents already exist). Resolve as a new outcome in `TacticalKickEvent` or a slim dedicated handler: success ⇒ new `DROP_GOAL_SCORED` MatchEvent (+3 points; new `applyMatchEvent` branch; extend `assertInvariants` score legality; add to `PlayerMatchStats` via the documented pattern — extend type + `zeroMatchStats()` + apply branch). Wire season stats through the existing `seasonStatsCollector` delta (note: add the field to the `statsDelta` type in `gameState.ts` AND the reducer — see bugs.md BUG-17 for the trap). Commentary keys + a 2D pitch beat reusing `animateKickArc` with the goal-kick flight. Manager-side: add `drop_goal` to the existing penalty-decision-style modal? No — keep it AI/tactic-driven first (an `allowDropGoals` toggle in tactics), manual call later.

### 1.7 Extra time in knockouts — P2, S

**Today:** playoff ties fall to the home side; no extra time. **Build:** for playoff/cup/European knockouts, on a draw at full time play two 10-minute periods (the clock/period machinery in `ClockController` already handles half transitions — add an `extraTime` period kind), then a kicking-competition fallback. `MatchCoordinator` gains an `allowExtraTime` constructor flag set by the knockout orchestrators (default false for league). Update `docs/match-engine.md` § clock and the playoff docs.

### 1.8 In-match audio commentary & atmosphere — P3, L

**Today:** text commentary, SFX, haptics. EA FC's audio is a huge part of feel, but full VO is out of scope for an indie build. **Build instead:** crowd-bed audio that reacts to momentum (1.1) and attendance (already modelled deterministically) — layered loops (murmur/build/roar) crossfaded by `SoundManager` on `engine:event` types, plus referee whistle SFX cues on penalties/cards/half-time. Pure UI; no engine impact.

---

## Part 2 — Squad, Players & Development (FM depth)

### 2.1 Youth academy you can manage — P1, L

**Today:** academy intake is automatic at rollover (2–4 grads/club); no screen, no agency. FM's youth pipeline (intake day, development, promote/release) is core to long-career retention.

**Build:**
- New `AcademyState` on `GameState.career`: a per-user-club list of 6–10 youth prospects (16–19yo) generated by the existing `personaGenerator` with wider `potential` variance and low current stats. Additive optional field ⇒ snapshot update; generate via `rngTransfer` at rollover (deliberate [RNG] commit).
- **Intake day** event in the season calendar (one inbox item per year, reusing the inbox CTA pattern): present the year's class with scout-style range bands (reuse the scouting band mechanic from `ScoutingScreen` — accuracy improves as the season runs).
- Prospects develop via the existing aging-curve machinery (they're just roster players with an `academy: true` flag, excluded from selection until promoted). Manager actions: **promote** (joins squad on a cheap 2-year deal via the existing contract seeder), **release**, **send on loan** (reuse the development-loan path — 1.5× dev multiplier already exists).
- New `AcademyScreen` reached from `ClubMenuScreen` (NOT a new Hub tile). SeasonEvents: `ACADEMY_CLASS_GENERATED`, `ACADEMY_PLAYER_PROMOTED`, `ACADEMY_PLAYER_RELEASED` + reducer branches + `assertSeasonInvariants` coverage + `docs/game-engine.md` mutation-seam table rows.

### 2.2 Player personality & interaction depth — P1, M

**Today:** morale is reason-tagged and reactive; "Have a Chat" exists; player agency is wage-driven only. FM players have personalities that change how they respond.

**Build:**
- Add `temperament: 'professional' | 'ambitious' | 'loyal' | 'volatile' | 'laid_back'` to `Player` (additive optional; assign at generation from `rngTransfer`, and author it for the real starting squads in `docs/team-data.md` + regenerate via `scripts/generateTeamJsons.mjs` — follow the "stats are authored" rule).
- Consume it everywhere morale already moves (`moraleEffects.ts`, transfer-request triggers, promise tracking, team-talk response in `TeamTalkScreen`/`HalfTimeTalkPanel`): temperament scales the magnitude/decay of existing deltas (volatile ⇒ ×1.5 swings; professional ⇒ ×0.6; loyal ⇒ poach-resistance bonus in `isPoachEligible` appeal; ambitious ⇒ stronger reaction to playing-time promises and European elimination). Constants in `balance/morale.ts`.
- Surface as a one-word trait chip on `PlayerProfileScreen` and in scouting reports (range-banded until scouted, consistent with the OVR-hiding design).

### 2.3 Expanded specialist attributes — P2, M

**Today:** 12 generic stats; goal-kicking uses `kicking`, lineout throwing uses `setPiece`. FM's granularity (separate corners/free-kicks/etc.) is part of squad-building depth.

**Build conservatively (3 additions, not 20):** `goalKicking`, `lineoutThrowing`, `jackaling` as optional derived-at-first, authored-later stats. Phase 1: compute them as weighted blends of existing stats at `initPlayer` (no data change, lets all formulas migrate); phase 2: author real values in `docs/team-data.md` → regenerate JSONs. Migrate consumers: `pickKicker` weighting + goal-kick success model → `goalKicking`; lineout throw accuracy → `lineoutThrowing`; breakdown steal contribution → `jackaling`. Keep the `baseStats` 12-stat contract intact by making these *separate optional fields* on `Player`, not new `baseStats` keys (avoids touching the position-weighted OVR and every team JSON at once). Save: additive optional ⇒ snapshot update only.

### 2.4 Injury & medical depth — P2, M

**Today:** 8 kinds × 3 severities, weeks-based recovery, recurrence flag (note: the recurrence balance constants exist but are unwired — see bugs.md BUG-50). **Build:** wire recurrence properly (a player returning early via low `condition` has `recurrenceMult` applied to in-match injury rolls for `recurrenceWindowWeeks`); add a **return-to-play choice** on the inbox item (rush back at 90% condition + recurrence risk vs hold an extra week); add an HIA sub-type for head knocks (forced permanent removal that doesn't consume a tactical sub — extend the substitution machinery's forced-sub path which already exists for red_20). Medical staff (2.5) reduces recurrence windows.

### 2.5 Full staff structure — P2, L

**Today:** exactly 3 roles (Assistant, Fitness, Scouts), player-club only. FM's staff market is a whole game layer.

**Build:**
- Extend `StaffState` with `forwardsCoach`, `backsCoach`, `kickingCoach`, `headPhysio` — each a generated persona with a 1–99 quality stat and wage drawn from the existing staff budget (the budget + slider already exist in `FinancesScreen`).
- Effects route through existing systems, no new engine paths: forwards coach ⇒ multiplier on training gains for the 4 forwards focuses + small scrum/lineout resolver modifier; backs coach ⇒ same for backs focuses + first-phase quality; kicking coach ⇒ goal-kick model + tactical-kick accuracy; physio ⇒ injury-week reduction (stack with current fitness lead, then rename fitness lead's effect to condition recovery only).
- AI clubs get static authored staff quality (one number per club in the club identity data) so the modifier is symmetric — avoids simulating an AI staff market.
- `StaffScreen` already exists; extend its list. SeasonEvents for hire/release already exist for the 3 roles — extend the role enum and reducers. Constants in `balance/staff.ts` (new). Save: staff state shape extension — if the existing `StaffState` keys change, bump `SAVE_VERSION` with a migration backfilling the new roles as vacant; if purely additive optional, snapshot update only (prefer additive).

### 2.6 Squad registration & cap pressure — P3, M

**Today:** salary cap + marquee exist; no squad-size or homegrown rules. **Build:** Premiership-style senior-squad registration (e.g. 33 senior + unlimited academy, homegrown minimum) checked at window close; a `RegistrationScreen` step in the end-of-season chain flags violations and blocks rollover until resolved. Adds real squad-building constraint pressure, which is where FM's transfer decisions get their tension.

---

## Part 3 — Career, Competitions & World (FM scale)

### 3.1 Manager reputation & the manager carousel — P1, L

**Today:** sacking is terminal (`SackScreen` ends the save); no manager identity beyond board confidence. This is the single biggest career-mode gap vs FM: getting sacked should be a setback, not a game-over, and success should open doors.

**Build:**
- `ManagerState` on `GameState.career`: `reputation: 0-100` (moves on trophies, overachievement vs board expectation, win%), `history: ManagerJobRecord[]`. Additive ⇒ snapshot update.
- **AI manager pool:** ~14 generated manager personas (reuse `personaGenerator` patterns) assigned to the other 9 clubs; each season 1–3 AI clubs sack/cycle managers based on their league position vs a simple expectation table (career stream).
- **Vacancy flow:** on sack (or voluntarily via a "Resign" option in settings), instead of ending the save, show a `JobMarketScreen`: vacancies whose club ambition ≤ manager reputation are offerable; accepting rebinds `state.career.userClubId` (audit every site that reads the user club — `GameCoordinator`, board, inbox, transfer coordinator — they all read it from one place today, which makes this tractable). Unemployment ticks weeks forward (reuse the headless round-sim loop) until an offer is taken.
- Board expectation at a new club seeds from the existing `BoardState` machinery. SackScreen becomes a fork: retire (old behaviour) or seek work.
- This is the foundation 3.2 (multiple leagues) plugs into later. Save: new optional `manager` subtree + the `userClubId` rebind must be exercised by a new leg in `scripts/checkSeasonDeterminism.ts`.

### 3.2 Second playable division + promotion/relegation — P2, XL

**Today:** one closed 10-team league; European teams are opponent-data-only. FM's pyramid is its world-feel backbone; full multi-country play is out of scope, but one English second tier is achievable.

**Build:** author a 12-team Championship (squads via `docs/team-data.md` + generator pipeline — the european-teams.ts authored-opponent precedent shows the data shape scales); bottom Premiership club swaps with the Championship winner at rollover (`computeRollover` emits `PROMOTION_RELEGATION_APPLIED`); Championship seasons sim headless exactly like the European pools do today (derived per-fixture seeds keep the career stream clean). The user's club can be relegated and play down a season (fixture generation is league-agnostic once BUG-01's circle method lands). Budget formula already takes league position — extend for division. Gate this behind 3.1 so relegation + sacking interplay works. This is the largest single item; split into: data authoring → headless second league simming → promotion/relegation seam → playable-when-relegated.

### 3.3 Pre-season friendlies & season arc — P2, S/M

**Today:** pre-season = cup leg 0 only. **Build:** 2 selectable friendlies before round 1 (opponent picker from the European opponent pool — data already exists), low-stakes (no league stats; morale/condition/familiarity benefits; trial academy players with relaxed selection rules). Implement as extra fixtures with a `friendly` competition tag through the existing live/headless match path; `seasonStatsCollector` already supports a `competition` discriminator.

### 3.4 Club history, records & hall of fame — P2, S/M

**Today:** the archive data exists (`archive` with standings, champions, top scorers, MVPs, per-player season history) but has no dedicated surface. **Build:** a `ClubHistoryScreen` (via `ClubMenuScreen`): season-by-season finishes, trophies, club records (most tries in a season, most appearances, points — computable from the archived `playerSeasonHistory`), and a hall of fame (retired players above appearance/achievement thresholds — hook the `PLAYER_RETIRED` event to append to a `hallOfFame` list; additive optional). Cheap, pure-UI + one small reducer, and it makes long careers feel recorded — disproportionate retention value.

### 3.5 International management hooks — P3, M

**Today:** international breaks call players up and return them; the user only experiences absence. **Build (lightweight):** during breaks, show the user's players' international match results + performance lines in the inbox (generate via the existing media phrase machinery + a couple of headless sims with the duty engine's data); a "release request" decision (refuse = player morale hit + board relief, the rugby club-vs-country tension). Full playable international management is not recommended — poor effort/value vs 3.1/3.2.

---

## Part 4 — Club, Finance & Transfers (FM economy)

### 4.1 Real financial model — P1, L

**Today:** salary budget under a cap + staff budget; attendance is computed but display-only; no revenue, no transfer fees. FM's financial loop (revenue → board → budgets) is the spine of its management fantasy.

**Build incrementally:**
- **Phase A (revenue ledger, display + budget input):** monthly ledger on `ClubState`: gate receipts (attendance × authored ticket price — attendance model already exists and is deterministic), sponsorship (authored per-club base × league-position multiplier), prize money (league finish, cup/European progression — hook the existing elimination/champion events), wages out (sum of contracts — already computable). Surface in `FinancesScreen` (already exists). Feed the year-on-year budget formula from the ledger balance instead of position-only. SeasonEvent `LEDGER_MONTH_POSTED`; constants in `balance/finance.ts` (new); additive optional save subtree.
- **Phase B (transfer fees):** players under contract become buyable: fee model = wage × years-remaining × age/potential multiplier (constants in `balance/transfers.ts`). Extends the existing bid system (`TransferBid` already supports multi-round competitive bidding — add a `fee` field); Reg 7 free pre-agreements stay as the fee-avoidance route (real rugby flavour). AI clubs get a transfer pot derived from their ledger. This changes `MarketState` shape ⇒ likely a `SAVE_VERSION` bump + migration.
- **Phase C (board investment asks):** spend ledger surplus on facilities (4.2) or budget boosts via a board-request interaction on `BoardConfidenceScreen` (accept/deny based on confidence + ledger).

### 4.2 Facilities & training-ground investment — P2, M

**Today:** none. **Build:** two club facility levels (1–5): `trainingFacilities` (multiplier on training gains — hooks `trainingRunner`) and `medicalFacilities` (injury-week reduction + recurrence-window reduction). Upgrades cost ledger surplus (4.1 Phase C) and take a season to complete (inbox progress items). AI clubs get static authored levels. Small system, big "building a club" feel. Constants in `balance/facilities.ts`; additive optional on `ClubState`.

### 4.3 Scouting depth — P2, M

**Today:** per-target range bands narrowing with scout accuracy; OVR hidden until scouted — a good foundation. **Build:** (a) **scout assignments by brief** ("find me a young openside under £80k") that surface 3–5 candidates per month from the existing generated pools instead of requiring the user to know who to scout; (b) **scout reports as inbox cards** with a one-line verdict and star-rating for current/potential (FM's familiar two-row stars; potential band only — never the hidden number, consistent with the CA/PA design); (c) regional bias — scouts have a nationality affinity improving accuracy on matching personas. All career-stream; extends `ScoutingScreen` + inbox.

### 4.4 Contract clauses & agent friction — P3, M

**Today:** wage + length + marquee flag only. **Build:** 2–3 clauses, not FM's twenty: signing-on bonus (one-off ledger hit, improves acceptance probability), playing-time clause (formalises the existing promise machinery into the contract — breach triggers the existing transfer-request path), and a release-fee clause (interacts with 4.1 Phase B fees). Extend `signingTermsFor`/`renewal` flows + the negotiation UI in `ContractsScreen`. `Contract` shape change ⇒ `SAVE_VERSION` bump + migration backfilling absent clauses.

---

## Part 5 — Presentation, Narrative & Meta (EA FC polish)

### 5.1 Onboarding & difficulty — P1, S/M

**Today:** no tutorial, no difficulty. New players face nine tactic dimensions cold. **Build:** (a) a first-session guided flow: 5–6 dismissible coach-mark overlays on Hub/Squad/Tactics/Match (a simple `onboardingSeen` flags object in settings storage — not the save); (b) difficulty presets at new-game: Relaxed / Standard / Hardcore mapping to existing levers (board confidence decay rate, budget multiplier, AI bid premium aggressiveness — all constants already in `balance/`, so a preset is a multiplier set stored on the save; additive optional). No engine forks.

### 5.2 Match-day presentation pass — P2, M

**Today:** the 2D pitch + commentary are strong; the wrapper is utilitarian. **Build EA-FC-style framing:** animated pre-match line-up presentation (both XVs slide in over the pitch view, reusing the dot-formation machinery), score-flash treatments on tries/cards (the key-moment hero treatment exists — extend it), half-time/full-time stats interstitial (StatsPanel data, auto-shown), and a post-match player-ratings reveal with the existing rating data animated count-up style. Pure UI layer; respects the `silent` flag throughout.

### 5.3 Fan sentiment & rivalries — P3, M

**Today:** derbies are flagged in fixtures; media stories are flavour-only. **Build:** a `fanSentiment: 0-100` per-season meter (moves on results, derby outcomes ×2, style of play vs club DNA — the style-DNA media archetype already computes this signal) shown on `BoardConfidenceScreen`; sentiment feeds attendance fill-rate (the model already takes a significance input) and one board-confidence driver. Closes the loop on the existing attendance + media systems.

### 5.4 Cloud saves & platform reach — P3, M/L

**Today:** localStorage + iOS Documents mirror; no Android, no cloud. **Build order:** (a) **Android via Capacitor** — the iOS shell pattern is established (`capacitor.config.ts`, base-relative assets already handled); add the android platform, test save mirroring on Android filesystem API; (b) **iCloud key-value/document sync** for iOS using a Capacitor plugin, syncing the existing slot payloads (conflict rule: newest `savedAt` wins, surface a chooser on conflict — the payload already carries `savedAt`); (c) Steam/desktop wrap is optional later (the web build already runs desktop browsers).

### 5.5 Accessibility & localisation foundation — P3, M

**Today:** text scaling exists; single en-GB locale; dark mode only. **Build:** (a) finish the light theme (DESIGN.md defers it — the CSS variable architecture should make this a token pass); (b) externalise the commentary/UI string banks behind the existing locale folder structure (`src/commentary/banks/en-GB/` is already locale-keyed — add the plumbing to select a bank, even if en-GB stays the only one shipped; this is cheap now, expensive later); (c) colour-blind-safe team-colour fallbacks (the team-coloured commentary names + pitch dots need a pattern/shape channel).

---

## Suggested build order (quarters, assuming one implementing agent)

| Phase | Items | Theme |
|---|---|---|
| 1 | bugs.md waves 1–3 first, then **1.1 momentum/timeline, 5.1 onboarding/difficulty, 3.4 club history** | Fix the foundations, then cheap high-visibility wins |
| 2 | **1.2 player roles, 1.3 set-piece calls, 2.2 personality** | Match-day + squad depth (the FM "feel" core) |
| 3 | **3.1 manager carousel, 4.1 finances A→B, 2.1 youth academy** | Career spine — the long-game retention layer |
| 4 | **2.5 staff, 4.2 facilities, 1.4 weather, 1.5 referees, 1.6 drop goals** | World texture |
| 5 | **3.2 second division, 4.3 scouting depth, 5.2 presentation pass, 5.4 platforms** | Scale & polish |

**Dependency notes:** 3.2 depends on 3.1 (relegation needs the carousel to be fun) and on bugs.md BUG-01 (fixture generation must be correct before generating a second league). 4.2 depends on 4.1 Phase A (needs a ledger to spend). 1.6 and 2.3 both touch the season-stats delta seam — fix BUG-17 first so the pattern is clean. Every phase ends with `npm run build`, `npm run verify`, and a `npm run telemetry` review where engine balance was touched.
