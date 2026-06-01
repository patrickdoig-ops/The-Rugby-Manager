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

### Tier 0 — The "1.0 of the manager fantasy" (do these first)

Highest impact-to-effort, and together a coherent, marketable release. Fixes the
two biggest gaps — stakes and presentation — and makes everything afterward land
harder. Notably **0.1–0.3 are small-to-medium and reuse systems you already have**
(owner budgets, performance tracking, modals, commentary).

> **Detailed implementation plan: see [`docs/roadmap-tier0.md`](./roadmap-tier0.md)** —
> per-feature design, data model, events, invariants, UI, balance, save/determinism
> impact, build milestones, and acceptance criteria, grounded in the existing code
> seams.

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 0.1 | **Board / owner expectations + job security** | The missing fail-state. A pre-season objective (e.g. "reach the playoffs"), a confidence meter that moves with results and transfers, and a real sack risk. Turns every match into something that *matters*. | New `SeasonEvent` + state; reuse owner budgets + performance tracking; inbox + Hub surface. | M |
| 0.2 | **Player morale / happiness** | Foundational system that unlocks team talks, transfer requests, and press reactions. Driven by playing time, results, contract status, and squad role; feeds form/training. The spine of the dressing room. | New season-scope state + `SeasonEvent`; feeds match-build form; squad/Hub surface. | M |
| 0.3 | **Pre-match + half-time team talks** | The cheapest "I'm the manager" moment in the genre — a few options that nudge morale and an in-match modifier, with huge perceived agency. | Reuse modal + commentary; transient match modifier through `applyMatchEvent`; reads morale (0.2). | S |
| 0.4 | **2D pitch view** | Convert the 1D ball strip into a top-down pitch with territory zones, ball position, phase build-up, possession, and key-event flashes. No need for 22 animated players — a "FM-2D-lite" / territory tug-of-war transforms immersion and App Store screenshots. | New UI canvas over `displaySnapshot` + event bus; no engine change. | L |

### Tier 1 — FM-style depth (the management loop)

The bundle that earns the "deep, obsessive sim" tagline.

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 1.1 | **Scouting + attribute masking** | Makes recruitment a *skill*. Hide exact stats behind a scouted-knowledge fog; scout assignments reveal accuracy over time. The single biggest depth-add to the transfer game. Pairs with 1.2. | Player-knowledge layer; transfer/squad UI; scout assignment flow. | L |
| 1.2 | **Staff hiring** (assistant, S&C, forwards/kicking coaches, physio, scouts) | Feeds training quality, injury rates, scouting accuracy, and AI suggestions. Gives the budget more to do than wages and adds a progression axis. | New staff entities + `SeasonEvent`; hooks into training, injuries, scouting. | M–L |
| 1.3 | **Player roles + a few individual instructions** | The 12 generic stats are thin. Lightweight roles (ball-playing vs game-manager 10, fetcher vs blindside 6/7) re-weight existing resolvers — high payoff, low new-data cost. Optionally a couple of per-player instructions. | Role enum on selection; resolver weight tables in `balance/`; selection UI. | M |
| 1.4 | **Press conferences (interactive media)** | Turn the (already lovely) passive media manager into a 2–3 question pre/post-match interaction that feeds morale + board confidence. Reuses personas + phrase bank. | Media manager → interactive flow; feeds 0.1/0.2. | M |
| 1.5 | **Transfer requests & playing-time promises** | Once morale (0.2) exists, unhappy stars ask to leave and fringe players want games. Closes the loop between squad management and the market. | Morale-driven `SeasonEvent`s; transfer + squad UI. | S–M |

### Tier 2 — World & breadth (long-term career fiction)

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 2.1 | **Second tier + promotion/relegation** | Removes the career ceiling; gives a sacked manager somewhere to fall and a rebuild story. Big content + balancing job but the foundation of long-term play. | League structure; fixtures; roster scaling; standings. | XL |
| 2.2 | **European competition (Champions Cup-style)** | Midweek European nights are the prestige content of club rugby; huge for the "build a dynasty" fantasy. Reuses the cup scheduler. | Cup scheduler; calendar; standings. | L |
| 2.3 | **Loan system + January-style window + deadline-day drama** | Fills out the recruitment calendar; loans give a use for fringe/youth players and a development pipeline. | Transfer system; new window phase; loan contracts. | M–L |
| 2.4 | **Match-engine depth: weather, referee variation, set-piece calls** | Variation that makes matches feel less repeatable: ref personalities, wind/rain affecting kicking/handling, lineout/scrum call choices. Each is an isolated balance addition. | Resolvers + `balance/`; pre-match indicators; commentary. | M (each) |
| 2.5 | **Finances beyond the cap** | Gate receipts, sponsorship, facilities investment — texture for owners/board and a long-term investment loop (training-ground upgrades feeding 1.2/development). | New finance state + `SeasonEvent`; board (0.1) tie-in. | L |

### Tier 3 — Polish, retention & differentiators

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 3.1 | **Match highlights / key-moment timeline + replay scrub** | Once 2D exists (0.4), a jump-to-the-tries/cards timeline improves rewatchability and shareability. | UI over the event log. | M |
| 3.2 | **Onboarding / tutorial + difficulty settings** | Rugby + management is a steep combo. A guided first season and AI difficulty broadens the audience (and App Store reviews). | New tutorial flow; AI difficulty knobs. | M |
| 3.3 | **Club history, records, rivalries, hall of fame** | Persistent head-to-head, all-time records, club legends. Cheap to build on the season archive, big for long-term attachment. | Season archive read; new history UI. | S–M |
| 3.4 | **Expanded achievements + in-season narrative milestones** | The systems above unlock dozens more (dynasty, promotion, develop-an-academy-star-to-90, survive-a-sacking rebuild). | Achievement defs. | S |
| 3.5 | **Detailed injuries (HIA, long-term, recurrence) + squad depth/registration limits** | Deepens squad-management tension and makes physios/rotation matter. | Match + season injury systems; registration rules. | M |

---

## 5. Suggested sequencing

1. **Ship Tier 0 as the next "1.0 of the manager fantasy."** Board expectations +
   morale + team talks + a 2D pitch is a coherent, marketable update that fixes the
   two biggest gaps (stakes + presentation). **0.1–0.3 are small-to-medium and
   reuse systems you already have**, so they are low-risk under the determinism
   harness; 0.4 is a pure UI addition over `displaySnapshot` with no engine change.
2. **Tier 1 is the "FM depth" arc** — scouting + staff + roles + press is the
   bundle that earns the "deep, obsessive" tagline. Do **scouting (1.1) and staff
   (1.2) together** since scouts *are* staff.
3. **Tier 2 is content-heavy** — promotion/relegation and Europe are where real
   time and balancing budget go; gate them behind a stable Tier 0/1 foundation.
4. **Tier 3 is continuous polish** to slot between the bigger arcs and keep reviews
   fresh.

**Explicitly not recommended:** a full 3D match engine. It fights the
no-backend/browser/mobile constraints, is a money pit, and the differentiator is
simulation depth, not graphics. A strong 2D view (0.4) captures ~80% of the
immersion for ~10% of the cost.

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
