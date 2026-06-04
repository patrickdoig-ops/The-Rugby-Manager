# Development Roadmap

A product review and prioritised feature roadmap for **The Rugby Manager**.

**North star for this roadmap: the manager fantasy.** The match engine and career
spine are already deep; the biggest gap between this game and the titles it's
benchmarked against (Football Manager especially) is the *manager fantasy* —
stakes, relationships, discovery, drama — and the *match presentation* that makes
the rich simulation legible. This roadmap leads with the office and the dressing
room, then fills out FM-style depth and world breadth. Pure on-pitch realism
features are still tracked (later tiers) and the match-realism alternative
prioritisation is parked at the end.

This is a planning document, not an architectural spec. Each item names the
systems it touches so it can be turned into a concrete design later. Effort is
rough: **S** = days, **M** = 1–2 weeks, **L** = multi-week, **XL** = month+.

---

## 1. Where the game stands today (v1.96b)

For a solo-built, no-backend, vanilla-TypeScript browser + iOS game, the depth of
the simulation core is ahead of any current rugby management title. Three areas are
now best-in-class:

- **The match engine.** 14 simulated phases — kick-off, open play (phase / first /
  kick-return carries), breakdown (stacked ruck contest with supporter
  commitment), scrum, lineout, maul (zone-gated driving lineout), tactical and box
  kicking, the 50:22, try/conversion, penalties (7 offence types, 4 decision
  outcomes), cards (yellow / red_20 / red_full with the 2-in-22 → 4th-in-22 auto
  rule), TMO reviews, and contact injuries — all driven by player attributes mixed
  with seeded RNG. The breakdown and discipline modelling is deeper than *Rugby
  Union Team Manager* or the legacy *Pro Rugby Manager*.

- **The 2D pitch animation.** Full 30-player formations in scrums and lineouts, per-player
  dot choreography from the engine's real phase data, multi-leg carry walks, kick-arc lobs
  with apex scaling, pick-and-go carrier rides the full ball path, animated #9s and hooker
  stepping on set-piece infractions, formation-chase seam for mass-movement animations, and
  goal-post rendering. The presentation rivals (and in rugby-specific detail, exceeds) FM's 2D
  match view.

- **The career spine.** Multi-season aging on Gaussian curves, hidden potential
  ceilings (FM-style CA/PA), retirement, academy + foreign-import regen, a
  realistic PRL salary-cap model (£6.4M + £1.4M credits, marquee outside cap),
  per-club performance-linked budgets and takeovers, a fully closed recruitment
  cycle — competitive bidding, scouting fog with range bands, staff hiring
  (assistant / fitness / scouts with separate budget), transfer requests + playing-time
  promises, development loans (out to partnership clubs), emergency cover loans (in from a
  generated pool), and a 5-phase competitive poaching market with Reg 7 — international
  windows (Autumn Nations / Six Nations / one-shot 2025 Lions tour), focused-development
  training, playoffs and a cup.

The architecture (single mutation seams, deterministic 4-stream RNG, exhaustive
discriminated unions, always-on invariants, all tuning in `balance/`) means depth
can be added *safely* — a strategic asset most indie sims lack. Save robustness is
now production-grade: rotate-before-write, last-known-good `.bak` fallback, rolling
backup history, version-keyed migration pipeline, and a background crash safety net.

**The headline weakness in one sentence:** an excellent *simulation* and a solid
*management loop* sit in front of a thin *world* — one closed 10-team league with no
European stage, no manager carousel after a sacking, and no match conditions variation.

---

## 2. Competitive benchmark (v1.96b)

| Dimension | Rugby Manager (today) | Football Manager | EA Sports FC / FIFA | RU Team Manager / Pro Rugby Mgr |
|---|---|---|---|---|
| Match sim depth | ★★★★☆ (rugby-specific, excellent) | ★★★★★ | ★★★☆ | ★★☆ |
| Match presentation | ★★★★☆ (30-player formations, carry/kick animations) | ★★★★ (2D/3D) | ★★★★★ (3D) | ★★☆ (2D/text) |
| Tactics | ★★★☆ (9 club levers, mid-match) | ★★★★★ (roles + instructions) | ★★★ | ★★☆ |
| Player attributes | ★★☆ (12 generic stats) | ★★★★★ (30+, roles) | ★★★★ | ★★★ |
| Transfers / recruitment | ★★★★ (cap+bids, loans, scouting, requests) | ★★★★★ | ★★★★ (deadline day) | ★★★ |
| Scouting / information fog | ★★★☆ (range bands, screen, scout accuracy) | ★★★★★ | ★★★ | ★★ |
| Board / job security / stakes | ★★★☆ (confidence, sacking, press) | ★★★★★ | ★★★ | ★★★ |
| Staff (coaches/physio/scouts) | ★★★☆ (core 3 roles, separate budget) | ★★★★★ | ★★ | ★★★ |
| Player morale / interaction / press | ★★★☆ (morale, talks, press conf.) | ★★★★★ | ★★★ | ★ |
| Finances | ★★★ (cap + budgets) | ★★★★★ | ★★★★ | ★★★ |
| World depth (leagues, promo/releg) | ★☆ (one closed 10-team league) | ★★★★★ | ★★★★ | ★★★★ |
| Career persistence / regen | ★★★★☆ | ★★★★★ | ★★★ | ★★★ |
| Narrative / drama | ★★★☆ (news, press conf., morale, requests) | ★★★★ | ★★★ | ★ |

**Read of the table:** since Tier 0 + Tier 1, the simulation and management-loop
columns now rival or beat FM in rugby-specific terms. The two remaining gaps are
*world breadth* (one league, no Europe, no manager carousel) and *match experience*
(no highlights replay, no conditions variation). The recruitment column has moved
from ★★★ to ★★★★ as of v1.96b.

---

## 3. The five biggest gaps (v1.96b)

1. **No world breadth.** One closed 10-team league with no European competition.
   Without European nights (Champions Cup-style), a dynasty builder has no
   continental stage by season 3. The Premiership's closed-franchise structure means
   career arc comes from European qualification racing and big-club poaching — not
   promotion/relegation. A sacked manager also has nowhere to go; the board tension
   (now well built) has a hard ceiling on its narrative arc without a manager carousel.

2. **No match highlights / replay.** The 2D pitch animation is now excellent — 30
   players, carry walks, kick arcs — but there is no way to review what happened. No
   "jump to try" timeline, no key-moment scrubber. The engine records everything; it
   just isn't surfaced. This is the primary *rewatchability* and *shareability* gap.

3. **No manager carousel.** Getting sacked ends the save. Without being able to apply
   for other Premiership vacancies or get rehired after rebuilding a reputation, the
   board tension has no narrative second act. A sacking should be a story pivot, not
   a dead end.

4. **No match variation.** Every match plays in identical conditions: no weather
   (wind/rain/mud), no referee personalities, no set-piece call choices. Each
   sub-feature is a cheap isolated balance addition and collectively they give every
   fixture a unique character. The absence of weather especially flattens the
   European-night atmosphere that world-breadth work will eventually need.

5. **Thin finances beyond the cap.** No gate receipts, sponsorship, or facilities
   investment. The staff budget has no growth mechanism; a relegated club and a
   title-winner operate on identical financial levers except for the budget magnitude.
   This limits the "build a dynasty" arc.

*(The transfer/recruitment gap that was formerly #3 has closed significantly —
scouting fog, loans, transfer requests, and the full 5-phase market are all now live.)*

---

## 4. Prioritised roadmap (manager-fantasy weighting)

**Status as of v1.96b:** Tier 0 and Tier 1 are fully shipped. The loan system
(Tier 2.3) is also shipped. The primary remaining must-have for v1.0 is European
competition.

### Shipped beyond plan (v1.44b → v1.96b)

Features implemented that were not in the original roadmap, or shipped ahead of
their tier, logged here for completeness:

| Feature | What was built | Where |
|---|---|---|
| **Lateral / Y-axis ball movement** | Full per-phase Y-axis ball tracking: pass-distance bands, sweep-style multipliers per team tactics, kick-trajectory angles, try-landing jitter. Enables the 2D pitch animations. | `src/engine/balance/lateral.ts`; wired into every phase handler |
| **Full 2D pitch animations — beyond spec** | 30-player scrum/lineout formations with choreographed dot placement, multi-leg carry keyframe walks, kick-arc lobs with apex scaling, kick-flight overlays toward posts, pick-and-go carrier rides the full ball path (carrierFromStart), #9s animated stepping away from dominant scrum penalties, hooker animated stepping back on crooked lineout throws, formation-chase seam, goal-post rendering, dead-ball / in-goal areas, field line accuracy. | `src/ui/PitchView.ts`, `pitchChoreography.ts`, `PitchPlayers.ts` |
| **Hub navigation restructure** | Contracts + Transfers merged into a sub-menu; Club tile opens a 2-tile sub-menu (Board Confidence + Staff); Staff moved out of the Hub into the Club sub-menu. Hub tile count fixed at six. | `src/ui/ClubMenuScreen.ts`, `ContractsTransfersMenuScreen.ts` |
| **Match captain nomination** | Manager nominates a captain (persists in save); fallback to highest-composure starter. Named in referee team-22 warning. | `src/game/captain.ts`, `captainRosterId` on `GameState.player` |
| **Discipline counselling** | Manager can counsel a player via inbox CTA; temporarily boosts effective `discipline` stat for N rounds. Accumulation bans (5 yellows) and double-yellow fix. | `PLAYER_DISCIPLINE_COUNSELLED` event, `disciplineAdvice` on `Player` |
| **International camp stat boosts** | Players on international duty receive minor stat boosts during training camp, offsetting the club-training miss. | `src/game/internationalDutyEngine.ts` |
| **Player reputation arc** | `Player.reputation` (0–100) displayed in transfer market (REP column replaces OVR, which is private). Season rollover nudges REP 50% toward actual OVR over a career — players build public standing from performance. Scouting fog uses REP as the public-domain signal; OVR is hidden until scouted. | `careerRollover.ts`; `TransferMarketScreen`; `PlayerProfileScreen` |
| **Scouting screen** | Dedicated screen (Contracts & Transfers sub-menu) showing all scouted targets as dismissible cards. Stat ranges reflect confidence bands; top-4 stats highlighted per position; scout accuracy shown as a progress bar; scout name displayed per card. | `src/ui/ScoutingScreen.ts` |
| **Scouting fog improvements** | OVR fully hidden for unscouted / partially-scouted opponents on pre-match, match stats, and team-info screens. REP shown in its place. `(unscouted)` label at 0% accuracy on player profiles. | `PreMatchScreen`, `StatsPanel`, `PlayerProfileScreen`, `TeamInfoScreen` |
| **Press conference enhancements** | Rival-result triggers (rival\_win / rival\_loss) added alongside existing heavy-result/board/form triggers. Frequency tuned and priority inversion fixed (post-match precedes pre-match). Impact hints removed from answer options for a cleaner, more natural interaction. | `src/game/pressConference.ts`, `src/ui/PressConferenceScreen.ts` |
| **Staff / board UI polish** | Club colour gradient on Staff, Board Confidence, and press-conference screen headers. Solid green hire / solid red release buttons on Staff screen. | `src/ui/StaffScreen.ts`, `BoardConfidenceScreen.ts` |
| **Save system robustness overhaul** | Rotate-before-write (current primary → `.bak` before every save); last-known-good fallback on corrupt primary; rolling backup history (8 generations, ≥20 min apart) with restore UI; version-keyed migration pipeline (`MIGRATIONS[N]` chain); background flush + global error / unhandledrejection crash safety net; autosave failures surfaced to user instead of silently swallowed; corrupt roster fields rejected with graceful fallback to backup. | `src/ui/SaveManager.ts`, `src/save/saveBackup.ts`, `src/ui/SavesScreen.ts` |

---

### Tier 0 — ✅ COMPLETE (shipped v1.44b–v1.66b)

> **Implementation reference: [`docs/roadmap-tier0.md`](./roadmap-tier0.md)**

| # | Feature | Status | Notes |
|---|---|---|---|
| 0.1 | **Board / owner expectations + job security** | ✅ Done | Full `BoardState` (confidence 0–100, objective, warning/sack latches). Per-result deltas, streak penalties, EoS swing. `SackScreen` (terminal — ends save). Club Menu → Board Confidence screen shows meter, drivers, objective. |
| 0.2 | **Player morale / happiness** | ✅ Done | `Player.morale` (0–100). Playing-time, result, and standout-performance triggers. "Have a Chat" with diminishing returns. Feeds form bias (±3). Reason-aware inbox items. |
| 0.3 | **Pre-match + half-time team talks** | ✅ Done | Four tones (Calm / Encourage / Demand / Single Out) with morale-conditioned effects and decay. `TEAM_TALK_APPLIED` match event. Rotating phrase library. |
| 0.4 | **2D pitch view** | ✅ Done | Full animated 2D pitch with 30-player formations: Y-axis ball movement, carry keyframes, kick arcs, pick-and-go carrier animation, animated set-piece actors, goal-posts, territory bar, flash events, card pips, phase label. Far exceeds original "FM-2D-lite" spec. |

---

### Tier 1 — ✅ COMPLETE (shipped v1.67b–v1.96b)

> **Implementation reference: [`docs/roadmap-tier1.md`](./roadmap-tier1.md)**

| # | Feature | Status | Notes |
|---|---|---|---|
| 1.1 | **Scouting + attribute masking** | ✅ Done | Own-squad always visible. External players show range bands (e.g. `tackling 12–16`) that narrow as scouting accuracy rises. Scout assigned per player; weekly accuracy gain gated on scout rating. Dedicated `ScoutingScreen` (dismissible cards, stat bands, accuracy bars). OVR hidden; REP shown as the public signal. `PlayerProfileScreen` renders `(unscouted)` label at 0% accuracy. |
| 1.2 | **Staff hiring — core three** | ✅ Done | Assistant (AI suggestion quality), fitness/medical (training gains + injury risk), scouts (scouting accuracy). Separate staff budget (4.5% of player budget, e.g. Newcastle £186k, Bath £349k) — not drawn from the salary cap. Pool regenerates each rollover. Release auto-unassigns scout targets. Club colour gradient on screen header. |
| 1.3 | **Press conferences (interactive media)** | ✅ Done | Post-match, newsworthy triggers (heavy result ≥15-point margin, board confidence ≤40, ≥2 losses in last 3, 3-win streak, rival result). 2 questions, 3-tone answers (Positive / Measured / Blunt) each shifting board confidence and morale. Skip = −2 board penalty + stub story. Impact hints removed for cleaner UX. |
| 1.4 | **Transfer requests & playing-time promises** | ✅ Done | Morale-triggered requests after 2 consecutive very-unhappy rounds. Inbox CTAs: Promise game time / Grant request / Reject (with morale penalty and escalation). Playing-time promises track starts vs required over a 4-week window; broken promise fires `PROMISE_BROKEN` with −15 morale penalty. Accepted requests raise poach eligibility in the market. |

---

### Tier 2 — World & breadth

> Tier 2.3 (loan system) shipped in v1.96b alongside Tier 1.4. The primary
> remaining Tier 2 items are European competition and match variation.

| # | Feature | Priority | Status | Why it matters | Touches | Effort |
|---|---|---|---|---|---|---|
| 2.3 | **Loan system (injury cover + development)** | 🔴 Must-have for v1.0 | ✅ Done (v1.96b) | Development loans out to a partnership club (max 5, instant recall, 1.5× training multiplier). Emergency cover loans in from a generated pool (15–20 players per season). Loan tile in Contracts & Transfers sub-menu. Pool clears on season rollover. | `LoanScreen.ts`, `loanPoolGenerator.ts`, `trainingWeek.ts`, `GameCoordinator.ts` | M |
| 2.2 | **European competition (Champions Cup-style)** | 🔴 Must-have for v1.0 | ⬜ Not started | The primary long-term career arc in a closed Premiership. Without European nights, a dynasty builder has no continental stage by season 3. Qualification from league standing. Reuses the cup scheduler. | Cup scheduler; calendar; qualification standings; new fixtures. | L |
| 2.4 | **Match variation: weather, referee personalities, set-piece calls** | 🟡 Should-have | ⬜ Not started | Each sub-feature is an isolated balance addition. Weather + referee give every fixture a unique character. Set-piece calls add recurring decision texture (lineout calls, scrum channel). *Lateral Y-axis movement already shipped.* | Resolvers + `balance/`; pre-match indicators; commentary. | M (each) |
| 2.6 | **Pre-season window** | 🟡 Should-have | ⬜ Not started | A short pre-season period: warm-up friendlies or training camp, early injury rolls, form build-up for new signings. Completes the rugby calendar and makes summer signings meaningful before competitive rugby. | Cup scheduler reuse; condition/form warm-up; optional injury roll. | M |
| 2.5 | **Finances beyond the cap** | 🔵 Nice-to-have | ⬜ Not started | Gate receipts, sponsorship, facilities investment. Would give the staff budget a growth mechanism and let training-ground investment feed player development. Deferred until European competition makes investment meaningful. | New finance state + `SeasonEvent`; board tie-in. | L |
| 2.1 | **Second tier + promotion/relegation** | 🔵 Nice-to-have | ⬜ Not started | The Premiership is a closed franchise league — no promotion/relegation since 2020/21. A second tier doesn't reflect the game's Prem setting and is an XL content build. Career arc in a closed league comes from European competition and the manager carousel, not a second tier. Possible long-term fictional expansion post-v1.0. | League structure; fixtures; roster scaling; standings. | XL |

---

### Tier 3 — Polish, retention & differentiators

Organised into coherent delivery packages:

#### Package 3-A: Match experience

| # | Feature | Priority | Why it matters | Touches | Effort |
|---|---|---|---|---|---|
| 3.7 | **Post-match analysis screen** | 🟡 Should-have | A richer verdict after the final whistle: what swung the match, standout individual, tactical narrative. A basic post-match result screen already exists — this is an enhancement to make the rich per-phase stats more legible. High return for low cost. | New screen reading existing match stats; no engine change. | S–M |
| 3.6 | **Captain authority (mechanical weight)** | 🟡 Should-have | The captain nomination skeleton is shipped (narrative only). Give it mechanical weight: composure boost to nearby players in pressure moments, morale leadership when behind. Infrastructure (`captainRosterId`, fallback logic) already in place — very cheap to add. | `captain.ts`; match-build modifier; commentary triggers. | S |
| 3.1 | **Match highlights / key-moment timeline** | 🟡 Should-have | The 2D pitch animation is excellent; the ability to jump to tries/cards/turnovers is the obvious next step for rewatchability. The engine records every event — just not surfaced as a scrubber. | UI over the event log; no engine change. | M |

#### Package 3-B: Long-term attachment

| # | Feature | Priority | Why it matters | Touches | Effort |
|---|---|---|---|---|---|
| 3.3 | **Club history, records, rivalries, hall of fame** | 🔵 Nice-to-have | Head-to-head records, all-time top scorers, club legends. Cheap to build on the season archive; big for long-term dynasty attachment. | Season archive read; new history UI. | S–M |
| 3.4 | **Expanded achievements + in-season narrative milestones** | 🔵 Nice-to-have | The Tier 0/1/2 systems unlock dozens of new achievements: dynasty, European glory, develop-an-academy-star, survive-a-sacking rebuild. | Achievement defs only; existing event bus. | S |
| 3.5 | **Detailed injuries (HIA, long-term, recurrence) + squad depth limits** | 🔵 Nice-to-have | Deepens squad-management tension and makes the fitness coach matter more visibly. Recurrence is already partially modelled. Loan cover becomes essential for long-term injuries. | Match + season injury systems; registration rules. | M |

#### Package 3-C: Onboarding & accessibility

| # | Feature | Priority | Why it matters | Touches | Effort |
|---|---|---|---|---|---|
| 3.2 | **Onboarding / tutorial + difficulty settings** | 🟡 Should-have | Rugby + management is a steep combo. A guided first season and AI difficulty knobs broadens the App Store audience. | New tutorial flow; AI difficulty constants in `balance/`. | M |

---

### Tier 4 — Advanced career depth

Features that require the full manager-fantasy and world-breadth foundation to
land well. Organised into two coherent packages:

#### Package 4-A: The manager career

| # | Feature | Priority | Why it matters | Touches | Effort |
|---|---|---|---|---|---|
| 4.1 | **Manager carousel — finding new jobs** | 🟡 Should-have | Turns a sacking into a new story rather than a dead end. Within a closed Premiership, this means applying for other Prem vacancies and being rehired. Manager reputation, track record, vacancy generation, prestige-gated applications. | Manager reputation state; vacancy generation; job-application flow; new-game flow. | L–XL |
| 4.2 | **Individual player roles + per-player instructions** | 🔵 Nice-to-have | Lightweight roles (ball-playing vs game-manager #10, fetcher vs blindside 6/7, distributor vs box-kicker #9) re-weight existing resolver inputs via `balance/` tables. Most meaningful once the 2D pitch makes role effects visible and European opponents create distinct tactical puzzles. Designed alongside set-piece calls (2.4). | Role enum on selection; resolver weight tables; selection UI. | M–L |

#### Package 4-B: World expansion

| # | Feature | Priority | Why it matters | Touches | Effort |
|---|---|---|---|---|---|
| 4.3 | **AI-club staff & scouting parity** | 🔵 Nice-to-have | Tier 1 modelled staff and scouting for the player's club only. Giving AI clubs staff-driven development and fogged recruitment would create fairer, deeper world dynamics — pairs naturally with European competition (AI club rosters matter more). | AI training/recruitment loops; staff on `CareerState` per all clubs. | M |
| 4.4 | **Finances beyond the cap — club investment axis** | 🔵 Nice-to-have | Gate receipts, sponsorship, facilities investment giving the staff budget a growth mechanism and training-ground investment a payoff. Only meaningful once European competition and/or a fictional second tier expand the financial stakes. | New finance state + `SeasonEvent`; board tie-in. | L |

---

## 5. Suggested sequencing toward v1.0

**Tiers 0 and 1 are done. Loan system (2.3) is done.** Current version is v1.96b.

### What "v1.0" means

A releasable v1.0 needs to pass two tests: *does the career have a long-term arc?*
and *does the game have the depth to keep a player engaged beyond season 2?* The
Premiership's closed-franchise structure means career arc comes from European
competition and (eventually) manager reputation — not a second tier. European
competition is the primary remaining gate.

**Must-have before v1.0:**
- **2.2** European competition — the primary career-arc milestone for a closed Premiership;
  without it, a dynasty builder has no continental stage and a dynasty feels circular by
  season 3.

**Strongly recommended for v1.0 (high-value, manageable scope):**
- **3.7** Post-match analysis enhancement (basic screen exists; richer verdict is S–M effort with high return)
- **3.6** Captain authority mechanical weight (S effort; skeleton in place)
- **2.4** Weather + referee personalities (each is an isolated balance addition — makes every fixture distinct; especially important for European nights)
- **2.6** Pre-season window (natural fit alongside the complete recruitment calendar; M effort)

**Suggested sequencing:**

1. **Tier 2.2 (European competition)** — the primary v1.0 gate. Reuses the cup
   scheduler; qualification from league standing. Budget L effort but the highest
   narrative payoff of any remaining item.
2. **Tier 3.7 (post-match analysis)** — quick win; can slot in before or alongside
   European competition work.
3. **Tier 2.4 (weather + referee)** — make every European fixture distinct with
   isolated balance additions. Can be built one sub-feature at a time.
4. **Tier 2.6 (pre-season)** — natural fit to complete the full rugby calendar before
   or alongside European competition.
5. **Tier 3.6 (captain authority)** — one session's work; the infrastructure exists.

**Post-v1.0 packages (in rough priority order):**
- **Package 3-A** (match experience: highlights, captain) — immediately post-v1.0
- **Package 4-A** (manager carousel) — once European competition gives the career its narrative spine
- **Package 3-B** (club history, achievements, injuries) — can be built incrementally
- **Package 3-C** (tutorial/difficulty) — important for App Store growth
- **Package 4-B** (world expansion) — meaningful only once the carousel exists
- **2.1** Fictional second tier — not authentic to the Prem; long-term optional expansion
- 3D match engine — fights the no-backend/browser/mobile constraints for marginal return

---

## 6. Telemetry baseline (v1.96b)

Home win rate: **58.9% ± 4.2%** across 450 simulated fixtures (90 fixtures × 5 root
seeds). Real Premiership home win rates sit ~55–58%, so this is at the high end of
the acceptable range but within it. No immediate action required.

Per-match averages: 3.3 tries, 35.1 combined points, 12.8 penalties, 0.8 yellow
cards, 0.2 red cards, 1.2 TMO triggers. Try origin: 44% from breakdown, 27% from
lineout, 9% from box kick. Set-piece win rates (LO 87–92%, scrums 80–95%) reflect
authored team quality differentials.

Tactics slice: kicking game plans average 501 kick metres/game and score 19.2
points/game (highest); possession plans generate more line breaks (needed for the
lower-quality game plan to create tries); balanced plans sit between. All within
expected rugby ranges.

**Telemetry is auto-generated by CI** (`telemetry/latest.md`) — do not edit by hand.
Full per-club breakdown, try-origin, penalty-offence split, and player leaderboards
are in that file.

---

## 7. Parked: alternative match-realism prioritisation

If the north star were ever shifted to *on-pitch realism* instead of the manager
fantasy, the lead items would re-order to push the match engine first. Tracked
here so the alternative isn't lost:

- **Weather & pitch conditions** — wind/rain/mud modulating the kicking, handling
  (knock-on gate), maul and scrum resolvers. Cheapest way to make matches distinct.
- **Referee personality / variation** — archetypes shifting penalty thresholds per
  offence family, giving the `discipline` lever situational weight.
- **In-match momentum / dynamic form** — confidence swings after try streaks,
  turnovers, or cards feeding subsequent rolls.
- **Set-piece calls** — lineout (front/middle/tail, dummy, off-the-top vs drive)
  and scrum (8-man shove, channel ball, push for penalty) as recurring decisions.
- **Expanded specialist attributes** — distinct goal-kicking, lineout-throwing,
  jackal/poaching, decision-making (touches authored team data + aging curves).
- **Non-linear fatigue + cramping**, **place-kicking realism (distance/angle/wind/
  pressure + visible kick)**, and **alternative kicking styles** (Garryowen / box /
  cross-field / grubber / chip).

Several of these also appear in Tier 2.4 above, where they support the
manager-fantasy build without leading it.
