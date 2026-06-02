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
| Match presentation | ★☆ (text feed + ball strip) | ★★★★ (2D/3D) | ★★★★★ (3D) | ★★☆ (2D/text) |
| Tactics | ★★★☆ (9 club levers, mid-match) | ★★★★★ (roles + instructions) | ★★★ | ★★☆ |
| Player attributes | ★★☆ (12 generic stats) | ★★★★★ (30+, roles) | ★★★★ | ★★★ |
| Transfers / recruitment | ★★★☆ (cap+bids, no loans/scouting) | ★★★★★ | ★★★★ (deadline day) | ★★★ |
| Scouting / information fog | ☆ (all stats visible) | ★★★★★ | ★★★ | ★★ |
| Board / job security / stakes | ☆ (budget only) | ★★★★★ | ★★★ | ★★★ |
| Staff (coaches/physio/scouts) | ☆ | ★★★★★ | ★★ | ★★★ |
| Player morale / interaction / press | ☆ (passive news only) | ★★★★★ | ★★★ | ★ |
| Finances | ★★★ (cap + budgets) | ★★★★★ | ★★★★ | ★★★ |
| World depth (leagues, promo/releg) | ★☆ (one closed 10-team league) | ★★★★★ | ★★★★ | ★★★★ |
| Career persistence / regen | ★★★★☆ | ★★★★★ | ★★★ | ★★★ |
| Narrative / drama | ★★ (charming flavour news) | ★★★★ | ★★★ | ★ |

**Read of the table:** the simulation columns rival or beat FM in rugby-specific
terms. Every weak column is a *manager-fantasy / presentation* column — and those
are precisely the systems that drive long-term retention.

---

## 3. The five biggest gaps

1. **No stakes.** Owners only nudge your budget. There's no board expectation, no
   job security, no consequence for finishing 9th. Without a fail-state, there's
   no tension and no reason to *care* about a bad run.
2. **No relationships.** Players have condition but no morale/happiness; no team
   talks, no transfer requests, no promises, no press conferences. The squad is a
   spreadsheet, not a dressing room.
3. **No information fog.** Every attribute is fully visible from day one. Scouting
   — the core "discovery" loop of FM and the thing that makes recruitment a *skill*
   — doesn't exist.
4. **Text-only match.** The engine computes a rich match but shows a text feed plus
   a 1D ball-position strip. This is the single biggest *first-impression*
   weakness, especially on mobile / the App Store.
5. **A small, closed world.** One 10-team league, no promotion/relegation, no
   European competition, no lower tier — so there's a ceiling on the long-term
   career fiction.

---

## 4. Prioritised roadmap (manager-fantasy weighting)

**Status as of v1.66b:** Tier 0 is fully shipped. Tier 1 has a detailed plan
in [`docs/roadmap-tier1.md`](./roadmap-tier1.md) and is next.

### Shipped beyond plan (v1.44b → v1.66b)

Features implemented that were not in the original roadmap, logged here for
completeness:

| Feature | What was built | Where |
|---|---|---|
| **Lateral / Y-axis ball movement** | Full per-phase Y-axis ball tracking: pass-distance bands, sweep-style multipliers per team tactics, kick-trajectory angles, try-landing jitter. Enables the 2D pitch animations. | `src/engine/balance/lateral.ts`; wired into every phase handler |
| **Advanced 2D pitch animations** | Beyond "FM-2D-lite": multi-leg carry keyframe walks, kick-arc lobs with apex scaling, kick-flight overlays toward posts, flash events per phase type, goal-post rendering, dead-ball / in-goal areas, field line accuracy. | `src/ui/PitchView.ts` |
| **Hub navigation restructure** | Contracts + Transfers merged into a sub-menu; new Club tile and `ClubMenuScreen` showing the board-confidence meter, drivers breakdown, and season objective live. | `src/ui/ClubMenuScreen.ts`, `ContractsTransfersMenuScreen.ts` |
| **Match captain nomination** | Manager nominates a captain (persists in save); fallback to highest-composure starter. Purely narrative (named in referee team-22 warning). | `src/game/captain.ts`, `captainRosterId` on `GameState.player` |
| **Discipline counselling** | Manager can counsel a player via an inbox CTA; temporarily boosts effective `discipline` stat for N rounds. Accumulation bans (5 yellows) and double-yellow fix. | `PLAYER_DISCIPLINE_COUNSELLED` event, `disciplineAdvice` on `Player` |
| **International camp stat boosts** | Players on international duty receive minor stat boosts during training camp, offsetting the club-training miss. | `src/game/internationalDutyEngine.ts` |

### Tier 0 — ✅ COMPLETE (shipped v1.44b–v1.66b)

> **Implementation reference: [`docs/roadmap-tier0.md`](./roadmap-tier0.md)**

| # | Feature | Status | Notes |
|---|---|---|---|
| 0.1 | **Board / owner expectations + job security** | ✅ Done | Full `BoardState` (confidence 0–100, objective, warning/sack latches). Per-result deltas, streak penalties, EoS swing. `SackScreen` (terminal — ends save; manager carousel is Tier 4.1). Club Menu exposes confidence meter + drivers. |
| 0.2 | **Player morale / happiness** | ✅ Done | `Player.morale` (0–100). Playing-time, result, and standout-performance triggers. "Have a Chat" with diminishing returns. Feeds form bias (±3). Reason-aware inbox items. |
| 0.3 | **Pre-match + half-time team talks** | ✅ Done | Four tones (Calm / Encourage / Demand / Single Out) with morale-conditioned effects and decay. `TEAM_TALK_APPLIED` match event. Rotating phrase library. |
| 0.4 | **2D pitch view** | ✅ Done | Full animated 2D pitch: Y-axis ball movement, carry keyframes, kick arcs, goal-posts, territory bar, flash events, card pips, phase label. Exceeds original "FM-2D-lite" spec. |

### Tier 1 — FM-style depth (the management loop)

The bundle that earns the "deep, obsessive sim" tagline. Tier 0 morale + board
are built and ready to be read.

> **Detailed implementation plan: see [`docs/roadmap-tier1.md`](./roadmap-tier1.md)** —
> per-feature design, data model, events, invariants, UI, balance, save/determinism
> impact, build milestones, and acceptance criteria, grounded in the existing code
> seams. Locked design decisions: **1.1** masks *other clubs' players + free agents
> only* (own squad always visible) with *range-band* presentation; **1.2** is scoped
> to a *core three* (assistant, fitness/medical, scouts); **1.3** is *deferred* to be
> designed with set-piece calls (Tier 2.4). Build order: 1.2 staff → 1.1 scouting
> → 1.3 press → 1.4 transfer requests.

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 1.1 | **Scouting + attribute masking** | Makes recruitment a *skill*. Hide exact stats behind a scouted-knowledge fog; scout assignments reveal accuracy over time. The single biggest depth-add to the transfer game. Pairs with 1.2. | Player-knowledge layer; transfer/squad UI; scout assignment flow. | L |
| 1.2 | **Staff hiring** — Tier 1 scope: *core three* (assistant, fitness/medical, scouts) | Feeds training quality, injury rates, scouting accuracy, and AI suggestions. Gives the budget more to do than wages and adds a progression axis. Forwards/kicking coaches + analyst are a later expansion. | New staff entities + `SeasonEvent`; hooks into training, injuries, scouting. | M |
| 1.3 | **Press conferences (interactive media)** | Turn the (already lovely) passive media manager into a 2–3 question pre/post-match interaction that feeds morale + board confidence. Reuses personas + phrase bank. | Media manager → interactive flow; feeds 0.1/0.2. | M |
| 1.4 | **Transfer requests & playing-time promises** | Once morale (0.2) exists, unhappy stars ask to leave and fringe players want games. Closes the loop between squad management and the market. | Morale-driven `SeasonEvent`s; transfer + squad UI. | S–M |

### Tier 2 — World & breadth (long-term career fiction)

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 2.1 | **Second tier + promotion/relegation** | Removes the career ceiling; gives a sacked manager somewhere to fall and a rebuild story. Big content + balancing job but the foundation of long-term play. | League structure; fixtures; roster scaling; standings. | XL |
| 2.2 | **European competition (Champions Cup-style)** | Midweek European nights are the prestige content of club rugby; huge for the "build a dynasty" fantasy. Reuses the cup scheduler. | Cup scheduler; calendar; standings. | L |
| 2.3 | **Loan system + January-style window + deadline-day drama** | Fills out the recruitment calendar; loans give a use for fringe/youth players and a development pipeline. | Transfer system; new window phase; loan contracts. | M–L |
| 2.4 | **Match-engine depth: weather, referee variation, set-piece calls** | Variation that makes matches feel less repeatable: ref personalities (breakdown-strict, high-tackle hawk, lets-it-flow), wind/rain affecting kicking/handling gates, lineout and scrum call choices. *Lateral Y-axis movement is already shipped (see bonus features above) — this item covers the remaining three sub-features.* Each is an isolated balance addition. | Resolvers + `balance/`; pre-match indicators; commentary. | M (each) |
| 2.5 | **Finances beyond the cap** | Gate receipts, sponsorship, facilities investment — texture for owners/board and a long-term investment loop (training-ground upgrades feeding 1.2/development). | New finance state + `SeasonEvent`; board (0.1) tie-in. | L |
| 2.6 | **Pre-season window** | A brief period between transfer-window close and Round 1: a couple of simulated warm-up fixtures (or a training-camp variant) to bed in new signings, build form, and surface early-season injury risks before the campaign. Gives new arrivals a reason to sign early, and the manager meaningful pre-season squad decisions. | Cup scheduler reuse or lightweight fixture sim; condition/form warm-up; optional pre-season injury roll. | M |

### Tier 3 — Polish, retention & differentiators

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 3.1 | **Match highlights / key-moment timeline + replay scrub** | Once 2D exists (0.4), a jump-to-the-tries/cards timeline improves rewatchability and shareability. | UI over the event log. | M |
| 3.2 | **Onboarding / tutorial + difficulty settings** | Rugby + management is a steep combo. A guided first season and AI difficulty broadens the audience (and App Store reviews). | New tutorial flow; AI difficulty knobs. | M |
| 3.3 | **Club history, records, rivalries, hall of fame** | Persistent head-to-head, all-time records, club legends. Cheap to build on the season archive, big for long-term attachment. | Season archive read; new history UI. | S–M |
| 3.4 | **Expanded achievements + in-season narrative milestones** | The systems above unlock dozens more (dynasty, promotion, develop-an-academy-star-to-90, survive-a-sacking rebuild). | Achievement defs. | S |
| 3.5 | **Detailed injuries (HIA, long-term, recurrence) + squad depth/registration limits** | Deepens squad-management tension and makes physios/rotation matter. | Match + season injury systems; registration rules. | M |
| 3.6 | **Captain authority (mechanical weight)** | The captain nomination skeleton is shipped (narrative only). Give it meaningful mechanical effect: composure boost to players near the ball, morale leadership when the team is behind, named in commentary at key moments. The infrastructure (`captainRosterId`, fallback logic) is already in place. | `captain.ts`; match-build modifier; commentary triggers. | S |
| 3.7 | **Post-match analysis screen** | A narrative match summary after the final whistle: key tactical decisions that swung the game, what drove the score (breakdown dominance, set-piece edge, kicking accuracy), the standout individual. The rich per-phase stats already exist — surface them as a readable verdict rather than a raw table. | New screen reading existing match stats + result; no engine change. | S–M |

### Tier 4 — Advanced career depth

Features that require the full manager-fantasy and world-breadth foundation to
land well. Both have significant scope and touch multiple existing systems.

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 4.1 | **Manager carousel — finding new jobs** | Turns a sacking into a new story rather than a dead end. After being sacked (0.1), the manager can apply for vacant roles at other clubs (or get approached), with club prestige, budget, and the manager's track record shaping which jobs are available. Requires a functioning multi-club world (Tier 2.1 helps; Tier 3 difficulty settings should include a "no sacking" option for those who don't want it). | Manager reputation state; vacancy generation on AI manager turnover; job-application flow; new-game integration. | L–XL |
| 4.2 | **Individual player roles + per-player instructions** | The 12 generic stats mean identical-stat players play identically. Lightweight roles (ball-playing vs game-manager 10, fetcher vs blindside 6/7, distributor vs box-kicking 9) re-weight existing resolver inputs via `balance/` tables — high payoff, low new authored-data cost. A small set of per-player match instructions (target the breakdown, stay disciplined, run from deep) then layers over club-wide tactics. Deferred here because roles are most meaningful once the world has multi-club personality (Tier 2) and the pitch view (0.4) makes their effect legible. | Role enum on selection; resolver weight tables in `balance/`; selection UI; AI director awareness of opponent roles. | M–L |

---

## 5. Suggested sequencing

**Tier 0 is done.** Current version is v1.66b. Pick up at Tier 1.

1. **Tier 1 is next** — scouting + staff + press + transfer requests is the "FM
   depth" bundle. Start with **1.2 (staff) and 1.1 (scouting) together** since
   scouts are staff; then 1.3 press, then 1.4 transfer requests. Full plan in
   [`docs/roadmap-tier1.md`](./roadmap-tier1.md). Surfaces two forward dependencies:
   **player roles** (1.3 stub, deferred to 2.4) and **manager carousel** (4.1,
   deferred until world depth is in place).
2. **Tier 2 is content-heavy** — promotion/relegation and Europe set the long-term
   career ceiling; gate them behind a stable Tier 1 foundation. Tier 2.4 (weather,
   referee variation, set-piece calls) can be parallelised since each sub-feature is
   an isolated balance addition; note lateral Y-axis movement is already shipped.
   Tier 2.6 (pre-season window) is low-risk and can ship alongside any Tier 2 item.
3. **Tier 3 is continuous polish** — 3.1 (highlights timeline) is the most valuable
   unlock from the now-animated 2D pitch. 3.6 (captain authority) and 3.7
   (post-match analysis) are small and can slot between any arc.
4. **Tier 4 features need the full foundation** — the manager carousel (4.1) needs
   the board/sacking system (done) and multi-club world depth (2.1); player roles
   (4.2) are most meaningful with set-piece calls (2.4) and multi-club AI
   personality.

**Telemetry note (v1.66b baseline):** home win rate is 59.3% ± 4.3% across 450
simulated fixtures. Real Premiership home win rates sit ~55–58%, so this is
marginally elevated. No immediate action required but worth a targeted pass on
`src/engine/balance/homeAdvantage.ts` + `attendance.ts` if it trends upward.
Try rate (3.3/match), card rate (0.8 yellow/0.2 red), and set-piece win rates all
fall within expected ranges.

**Explicitly not recommended:** a full 3D match engine. The animated 2D pitch now
exceeds the original "FM-2D-lite" spec and already captures the key immersion gains.
A 3D engine would fight the no-backend/browser/mobile constraints for marginal
return.

---

## 6. Parked: alternative match-realism prioritisation

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

Several of these also appear in Tier 1.3 and Tier 2.4 above, where they support the
manager-fantasy build without leading it.
