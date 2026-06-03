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

## 1. Where the game stands today

For a solo-built, no-backend, vanilla-TypeScript browser + iOS game, the depth of
the simulation core is ahead of any current rugby management title. Two areas are
best-in-class:

- **The match engine.** 14 simulated phases — kick-off, open play (phase / first /
  kick-return carries), breakdown (stacked ruck contest with supporter
  commitment), scrum, lineout, maul (zone-gated driving lineout), tactical and box
  kicking, the 50:22, try/conversion, penalties (7 offence types, 4 decision
  outcomes), cards (yellow / red_20 / red_full with the 2-in-22 → 4th-in-22 auto
  rule), TMO reviews, and contact injuries — all driven by player attributes mixed
  with seeded RNG. The breakdown and discipline modelling is deeper than *Rugby
  Union Team Manager* or the legacy *Pro Rugby Manager*.
- **The career spine.** Multi-season aging on Gaussian curves, hidden potential
  ceilings (FM-style CA/PA), retirement, academy + foreign-import regen, a
  realistic PRL salary-cap model (£6.4M + £1.4M credits, marquee outside cap),
  per-club performance-linked budgets and takeovers, a 5-phase competitive bid
  market with Reg 7 poaching, international windows (Autumn Nations / Six Nations /
  one-shot 2025 Lions tour), focused-development training, playoffs and a cup.

The architecture (single mutation seams, deterministic 4-stream RNG, exhaustive
discriminated unions, always-on invariants, all tuning in `balance/`) means depth
can be added *safely* — a strategic asset most indie sims lack.

**The headline weakness in one sentence:** a deep *simulation* sits behind a thin
*presentation* and a light *manager-fantasy* layer. The systems that drive the
"up until 3am" retention the README promises — stakes, relationships, discovery,
and a match you can *see* — are exactly the ones that are lightest today.

---

## 2. Competitive benchmark

| Dimension | Rugby Manager (today) | Football Manager | EA Sports FC / FIFA | RU Team Manager / Pro Rugby Mgr |
|---|---|---|---|---|
| Match sim depth | ★★★★☆ (rugby-specific, excellent) | ★★★★★ | ★★★☆ | ★★☆ |
| Match presentation | ★★★☆ (animated 2D, above spec) | ★★★★ (2D/3D) | ★★★★★ (3D) | ★★☆ (2D/text) |
| Tactics | ★★★☆ (9 club levers, mid-match) | ★★★★★ (roles + instructions) | ★★★ | ★★☆ |
| Player attributes | ★★☆ (12 generic stats) | ★★★★★ (30+, roles) | ★★★★ | ★★★ |
| Transfers / recruitment | ★★★☆ (cap+bids, no loans/scouting) | ★★★★★ | ★★★★ (deadline day) | ★★★ |
| Scouting / information fog | ★★☆ (range bands, scout accuracy) | ★★★★★ | ★★★ | ★★ |
| Board / job security / stakes | ★★★☆ (confidence, sacking, press) | ★★★★★ | ★★★ | ★★★ |
| Staff (coaches/physio/scouts) | ★★☆ (core 3 roles, separate budget) | ★★★★★ | ★★ | ★★★ |
| Player morale / interaction / press | ★★★☆ (morale, talks, press conf.) | ★★★★★ | ★★★ | ★ |
| Finances | ★★★ (cap + budgets) | ★★★★★ | ★★★★ | ★★★ |
| World depth (leagues, promo/releg) | ★☆ (one closed 10-team league) | ★★★★★ | ★★★★ | ★★★★ |
| Career persistence / regen | ★★★★☆ | ★★★★★ | ★★★ | ★★★ |
| Narrative / drama | ★★★☆ (news, press conf., morale) | ★★★★ | ★★★ | ★ |

**Read of the table:** the simulation columns rival or beat FM in rugby-specific
terms. The manager-fantasy columns have moved significantly from near-zero after
Tier 0 and Tier 1. The remaining gaps are *world breadth* (one league, no Europe)
and *match presentation* (no highlights replay, no 3D).

---

## 3. The five biggest gaps

1. **No world breadth.** One closed 10-team league with no European competition.
   The Premiership is a franchise league — no promotion/relegation since 2020/21 —
   so the career ceiling isn't a second tier; it's the absence of European nights
   (Champions Cup-style) and a manager carousel. A sacked manager has nowhere to
   go; a dynasty builder has no continental stage to conquer.
2. **No match highlights / replay.** The 2D pitch animation is now excellent but
   there's no way to review what happened — no "jump to try" timeline, no key
   moments view. The engine records everything; it just isn't surfaced.
3. **Incomplete transfer system.** No loans (injury-cover or development), no
   deadline-day drama. Transfer requests are partially implemented (morale trigger
   exists, market framework exists) but not fully closed. Rugby has year-round
   registration with no formal windows — the right model is emergency loans and
   development loans, not a January-style window.
4. **No match variation.** Every match plays in identical conditions: no weather
   (wind/rain/mud), no referee personalities, no set-piece call choices. These are
   cheap to add individually and each one gives every fixture a unique character.
5. **No manager carousel.** Getting sacked ends the save. Without being able to
   apply for other Premiership jobs or get rehired after rebuilding a reputation,
   the board tension (which is now well built) has a hard ceiling on its narrative arc.

*(Stakes, relationships, discovery, and presentation have all moved considerably
after Tier 0 + Tier 1 — the gap list has shifted from "manager fantasy basics" to
"world depth and long-term replayability.")*

---

## 4. Prioritised roadmap (manager-fantasy weighting)

**Status as of v1.87b:** Tier 0 and Tier 1 are fully shipped. Tier 2 is next.

### Shipped beyond plan (v1.44b → v1.87b)

Features implemented that were not in the original roadmap, logged here for
completeness:

| Feature | What was built | Where |
|---|---|---|
| **Lateral / Y-axis ball movement** | Full per-phase Y-axis ball tracking: pass-distance bands, sweep-style multipliers per team tactics, kick-trajectory angles, try-landing jitter. Enables the 2D pitch animations. | `src/engine/balance/lateral.ts`; wired into every phase handler |
| **Advanced 2D pitch animations** | Beyond "FM-2D-lite": multi-leg carry keyframe walks, kick-arc lobs with apex scaling, kick-flight overlays toward posts, flash events per phase type, goal-post rendering, dead-ball / in-goal areas, field line accuracy, formation-chase seam, kick-off 15v15 authoring. | `src/ui/PitchView.ts`, `pitchChoreography.ts` |
| **Hub navigation restructure** | Contracts + Transfers merged into a sub-menu; Club tile opens a 2-tile sub-menu (Board Confidence + Staff) matching the same layout. | `src/ui/ClubMenuScreen.ts`, `BoardConfidenceScreen.ts`, `ContractsTransfersMenuScreen.ts` |
| **Match captain nomination** | Manager nominates a captain (persists in save); fallback to highest-composure starter. Named in referee team-22 warning. | `src/game/captain.ts`, `captainRosterId` on `GameState.player` |
| **Discipline counselling** | Manager can counsel a player via inbox CTA; temporarily boosts effective `discipline` stat for N rounds. Accumulation bans (5 yellows) and double-yellow fix. | `PLAYER_DISCIPLINE_COUNSELLED` event, `disciplineAdvice` on `Player` |
| **International camp stat boosts** | Players on international duty receive minor stat boosts during training camp, offsetting the club-training miss. | `src/game/internationalDutyEngine.ts` |

### Tier 0 — ✅ COMPLETE (shipped v1.44b–v1.66b)

> **Implementation reference: [`docs/roadmap-tier0.md`](./roadmap-tier0.md)**

| # | Feature | Status | Notes |
|---|---|---|---|
| 0.1 | **Board / owner expectations + job security** | ✅ Done | Full `BoardState` (confidence 0–100, objective, warning/sack latches). Per-result deltas, streak penalties, EoS swing. `SackScreen` (terminal — ends save). Club Menu → Board Confidence screen shows meter, drivers, objective. |
| 0.2 | **Player morale / happiness** | ✅ Done | `Player.morale` (0–100). Playing-time, result, and standout-performance triggers. "Have a Chat" with diminishing returns. Feeds form bias (±3). Reason-aware inbox items. |
| 0.3 | **Pre-match + half-time team talks** | ✅ Done | Four tones (Calm / Encourage / Demand / Single Out) with morale-conditioned effects and decay. `TEAM_TALK_APPLIED` match event. Rotating phrase library. |
| 0.4 | **2D pitch view** | ✅ Done | Full animated 2D pitch: Y-axis ball movement, carry keyframes, kick arcs, goal-posts, territory bar, flash events, card pips, phase label. Exceeds original "FM-2D-lite" spec. |

### Tier 1 — ✅ COMPLETE (shipped v1.67b–v1.87b)

> **Implementation reference: [`docs/roadmap-tier1.md`](./roadmap-tier1.md)**

| # | Feature | Status | Notes |
|---|---|---|---|
| 1.1 | **Scouting + attribute masking** | ✅ Done | Own-squad always visible. External players show range bands (e.g. `tackling 12–16`) that narrow as scouting accuracy rises. Scout assigned per player; weekly accuracy gain gated on scout rating. `PlayerProfileScreen` renders bands for masked players. |
| 1.2 | **Staff hiring — core three** | ✅ Done | Assistant (AI suggestion quality), fitness/medical (training gains + injury risk), scouts (scouting accuracy). Separate staff budget (4.5% of player budget, e.g. Newcastle £186k, Bath £349k) — not drawn from the salary cap. Pool regenerates each rollover. Release auto-unassigns scout targets. |
| 1.3 | **Press conferences (interactive media)** | ✅ Done | Post-match only, newsworthy triggers (heavy result ≥15-point margin, board confidence ≤40, ≥2 losses in last 3, 3-win streak). 2 questions, 3-tone answers (Positive / Measured / Blunt) each shifting board confidence and morale. Skip = −2 board penalty + stub story. |
| 1.4 | **Transfer requests & playing-time promises** | ⏳ Stub | Morale trigger infrastructure and transfer market framework both exist. Full transfer-request flow (player requests, playing-time promises, forced-sale gate) not yet wired. **This is the one remaining Tier 1 item.** |

### Tier 2 — World & breadth (long-term career fiction)

> The single biggest remaining gap. Tier 1 has given the management loop depth;
> Tier 2 gives it a world to operate in.

| # | Feature | Priority | Why it matters | Touches | Effort |
|---|---|---|---|---|---|
| 2.1 | **Second tier + promotion/relegation** | 🔵 Nice-to-have | The Premiership is a closed franchise league — no promotion/relegation since 2020/21. A second tier doesn't reflect the game's Prem setting and is an XL content build. Career arc in a closed league comes from European competition (2.2) and the manager carousel (4.1), not a second tier. Could appear as a fictional long-term expansion post-v1.0. | League structure; fixtures; roster scaling; standings. | XL |
| 2.3 | **Loan system (injury cover + development)** | 🔴 Must-have for v1.0 | Rugby has year-round registration — no formal windows. Emergency loans for injury cover and development loans for young players are the authentic model. Fills out the recruitment calendar; also unblocks transfer requests (1.4) fully. No new "window phase" needed — loans trigger on demand. | Transfer system; loan contracts. | M |
| 2.6 | **Pre-season window** | 🟡 Should-have | A short pre-season period: warm-up friendlies or training camp, early injury rolls, form build-up for new signings. Makes the January/summer signing windows feel meaningful. Low-risk; can slot alongside any Tier 2 item. | Cup scheduler reuse; condition/form warm-up; optional injury roll. | M |
| 2.4 | **Match variation: weather, referee personalities, set-piece calls** | 🟡 Should-have | Each sub-feature is an isolated balance addition. Weather and referee personalities are the highest-value pair (every fixture is currently identical conditions). Set-piece calls add decision texture. *Lateral Y-axis movement already shipped.* | Resolvers + `balance/`; pre-match indicators; commentary. | M (each) |
| 2.2 | **European competition (Champions Cup-style)** | 🟡 Should-have | The primary long-term career arc in a closed Premiership — midweek European nights are prestige content, and without them a dynasty builder has no continental stage by season 3. Reuses the cup scheduler; qualification from league standing. | Cup scheduler; calendar; qualification standings. | L |
| 2.5 | **Finances beyond the cap** | 🔵 Nice-to-have | Gate receipts, sponsorship, facilities investment. Would give the staff budget a growth mechanism and let training-ground investment feed into development. Deferred until the world depth (2.1/2.2) makes the investment meaningful. | New finance state + `SeasonEvent`; board tie-in. | L |

### Tier 3 — Polish, retention & differentiators

| # | Feature | Priority | Why it matters | Touches | Effort |
|---|---|---|---|---|---|
| 3.7 | **Post-match analysis screen** | 🟡 Should-have | A richer verdict after the final whistle: what swung the match, standout individual, tactical narrative. A basic post-match result screen already exists — this is an enhancement to make the rich per-phase stats more readable. High return for low engine cost. | New screen reading existing match stats; no engine change. | S–M |
| 3.1 | **Match highlights / key-moment timeline** | 🟡 Should-have | Once the 2D pitch is animated, the ability to jump to tries/cards/turnovers is the obvious next step for rewatchability and shareability. | UI over the event log. | M |
| 3.2 | **Onboarding / tutorial + difficulty settings** | 🟡 Should-have | Rugby + management is a steep combo. A guided first season and AI difficulty broadens the App Store audience materially. | New tutorial flow; AI difficulty knobs in `balance/`. | M |
| 3.6 | **Captain authority (mechanical weight)** | 🟡 Should-have | The captain nomination skeleton is shipped (narrative only). Give it mechanical effect: composure boost to nearby players, morale leadership when behind. Infrastructure (`captainRosterId`, fallback logic) already in place — very cheap to add weight. | `captain.ts`; match-build modifier; commentary triggers. | S |
| 3.3 | **Club history, records, rivalries, hall of fame** | 🔵 Nice-to-have | Head-to-head records, all-time top scorers, club legends. Cheap to build on the season archive; big for long-term attachment and dynasty play. | Season archive read; new history UI. | S–M |
| 3.4 | **Expanded achievements + in-season narrative milestones** | 🔵 Nice-to-have | The Tier 0/1 systems unlock dozens of new achievements: dynasty, promotion, develop-an-academy-star-to-90, survive-a-sacking rebuild. | Achievement defs only. | S |
| 3.5 | **Detailed injuries (HIA, long-term, recurrence) + squad depth limits** | 🔵 Nice-to-have | Deepens squad-management tension and makes the fitness coach matter more visibly. Recurrence is already partially modelled. | Match + season injury systems; registration rules. | M |

### Tier 4 — Advanced career depth

Features that require the full manager-fantasy and world-breadth foundation to
land well.

| # | Feature | Priority | Why it matters | Touches | Effort |
|---|---|---|---|---|---|
| 4.1 | **Manager carousel — finding new jobs** | 🟡 Should-have | Turns a sacking into a new story rather than a dead end. Within a closed Premiership, this means applying for other Prem vacancies and being rehired. Manager reputation, track record, vacancy generation, prestige-gated job applications. | Manager reputation state; vacancy generation; job-application flow. | L–XL |
| 4.2 | **Individual player roles + per-player instructions** | 🔵 Nice-to-have | Lightweight roles (ball-playing vs game-manager #10, fetcher vs blindside flanker, distributor vs box-kicking #9) re-weight existing resolver inputs via `balance/` tables. Most meaningful once 2D pitch makes role effects visible and multi-club world creates distinct AI personalities. | Role enum on selection; resolver weight tables; selection UI. | M–L |

---

## 5. Suggested sequencing toward v1.0

**Tiers 0 and 1 are done.** Current version is v1.87b.

### What "v1.0" means

A releasable v1.0 needs to pass two tests: *does it have a complete recruitment
system?* and *does the career have meaningful long-term stakes?* The must-haves
above define that bar. The Premiership's closed-franchise structure means career
arc comes from European competition and manager reputation — not a second tier.

**Must-haves before v1.0:**
- **1.4** Transfer requests (the one open Tier 1 item — close it)
- **2.3** Loan system (injury-cover and development loans — the authentic rugby recruitment model; also unblocks 1.4)

**Strongly recommended for v1.0 (high-value, manageable scope):**
- **2.2** European competition (the primary long-term career arc in a closed Premiership — without it a dynasty builder has no continental stage by season 3)
- **3.7** Post-match analysis enhancement (basic screen exists; richer verdict is high return for S–M effort)
- **2.4** Weather + referee personalities (each is an isolated balance addition — makes every fixture distinct)
- **3.6** Captain authority mechanical weight (S effort; skeleton already in place)
- **2.6** Pre-season window (natural fit alongside the rebuilt recruitment calendar)

**Sequencing:**

1. **Close Tier 1** — wire the transfer-request flow (1.4). The morale and market
   infrastructure both exist; this is a UI + event wiring job.
2. **Tier 2.3 (loans)** — independent of everything else; the authentic rugby model
   for injury cover and development. No new window phase — loans trigger on demand.
   Pairs naturally with 1.4.
3. **Tier 2.2 (European competition)** — the main career-arc milestone for a closed
   Premiership. Reuses the cup scheduler; qualification from league standing.
4. **Tier 3.7 (post-match analysis enhancement)** — small; can slot in at any point.
5. **Tier 2.4 + 2.6** — can be built incrementally, one sub-feature at a time,
   interspersed with the above.
6. **Post-v1.0: 4.1 (manager carousel), 3.1 (highlights), 3.2 (tutorial/difficulty),
   2.1 (fictional second-tier expansion if desired)** — meaningful but not required
   for initial release.

**Explicitly deferred to post-v1.0:**
- Manager carousel (4.1) — powerful but needs multi-season reputation infrastructure
- Full finances beyond the cap (2.5) — needs the expanded world to be meaningful
- Detailed injuries (3.5) — polish, not gating
- Club history / hall of fame (3.3) — needs multiple seasons of data first
- Player roles (4.2) — high payoff but needs set-piece calls (2.4) first
- Second tier / promotion-relegation (2.1) — not authentic to the Prem setting; possible long-term expansion
- 3D match engine — fights the no-backend/browser/mobile constraints for marginal return

---

## 6. Telemetry baseline (v1.87b)

Home win rate: **59.3% ± 4.3%** across 450 simulated fixtures. Real Premiership
home win rates sit ~55–58% so this is marginally elevated but within an acceptable
range. No immediate action required; worth a targeted pass on
`src/engine/balance/homeAdvantage.ts` + `attendance.ts` if it trends upward.

Try rate (3.3/match), card rate (0.8 yellow / 0.2 red), and set-piece win rates
all fall within expected ranges.

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
