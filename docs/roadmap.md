# Development Roadmap

A product review and prioritised feature roadmap for **The Rugby Manager**.

**North star for this roadmap: on-pitch match realism.** The match engine is the
game's standout asset and clearest differentiator, so this roadmap weights
features that deepen the *simulation of a rugby match* above the broader
manager-fantasy and world-breadth systems. Manager-office and presentation
features are still tracked (later tiers) because some of them — player morale,
2D visualisation — directly serve match realism.

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

**The headline weakness:** a deep *simulation* sits behind a thin *presentation*
and a light *manager-fantasy* layer. With match realism as the north star, the
priority is to make the rich match that the engine already computes feel
*variable, reactive, and legible* — then surface it visually.

---

## 2. Competitive benchmark

| Dimension | Rugby Manager (today) | Football Manager | EA Sports FC / FIFA | RU Team Manager / Pro Rugby Mgr |
|---|---|---|---|---|
| Match sim depth | ★★★★☆ (rugby-specific, excellent) | ★★★★★ | ★★★☆ | ★★☆ |
| Match presentation | ★☆ (text feed + ball strip) | ★★★★ (2D/3D) | ★★★★★ (3D) | ★★☆ (2D/text) |
| Tactics | ★★★☆ (9 club levers, mid-match) | ★★★★★ (roles + instructions) | ★★★ | ★★☆ |
| Player attributes | ★★☆ (12 generic stats) | ★★★★★ (30+, roles) | ★★★★ | ★★★ |
| Set-piece control | ★☆ (contest-only) | n/a | ★★★ (set-piece picker) | ★★ |
| Referee / officiating variety | ☆ | ★★ | ★ | ★ |
| Weather / conditions | ☆ | ★★★ | ★★ | ★★ |
| Injuries detail | ★★☆ (contact roll, 3 bands) | ★★★★★ | ★★★ | ★★★ |
| Transfers / recruitment | ★★★☆ (cap+bids, no loans/scouting) | ★★★★★ | ★★★★ | ★★★ |
| Scouting / information fog | ☆ (all stats visible) | ★★★★★ | ★★★ | ★★ |
| Board / job security / stakes | ☆ (budget only) | ★★★★★ | ★★★ | ★★★ |
| Staff (coaches/physio/scouts) | ☆ | ★★★★★ | ★★ | ★★★ |
| Player morale / press | ☆ (passive news only) | ★★★★★ | ★★★ | ★ |
| World depth (leagues, promo/releg) | ★☆ (one closed 10-team league) | ★★★★★ | ★★★★ | ★★★★ |
| Career persistence / regen | ★★★★☆ | ★★★★★ | ★★★ | ★★★ |

**Read of the table:** the simulation columns rival or beat FM in rugby-specific
terms. The weak columns are presentation and manager-fantasy. For a *match-realism*
strategy, the gaps that matter most are the on-pitch ones: **set-piece control,
referee variety, weather, attribute granularity, injuries detail, and the lack of
a visual to read the match by.**

---

## 3. Match-realism gap analysis

What a deep rugby sim has that the engine does not yet model:

- **No weather or pitch conditions.** Every match plays in identical conditions;
  wind, rain, and mud have no effect on kicking, handling, or the breakdown.
- **No referee variation.** A single neutral whistle. No archetypes (breakdown-
  strict, scrum-fussy, lets-it-flow, high-tackle hawk), so the `discipline`
  tactical lever has the same value in every game and matches never feel refereed
  differently.
- **Thin, position-generic attributes.** 12 baseStats (`stamina, strength, pace,
  agility, handling, tackling, breakdown, kicking, setPiece, discipline,
  positioning, composure`) with no specialisation — no distinct lineout-throwing,
  goal-kicking vs out-of-hand kicking, jackal/poaching, or decision-making. FM
  carries 30+.
- **No player roles.** A 10 is a 10. There is no ball-playing vs game-manager
  flyhalf, no fetcher vs blindside split, so identical-stat players play
  identically.
- **Set-pieces are contests, not decisions.** Lineout is a binary throw-quality +
  jump roll (no calls, no front/middle/tail, no dummies); scrum is a pack
  aggregate (no 8-man shove / channel-ball / push-for-penalty choice).
- **No individual player instructions.** Only club-wide tactics; you can't tell a
  flanker to target the breakdown or a centre to take on the line.
- **Static in-match form.** Form is a fixed per-match modifier; there is no
  momentum swing after a try streak, a yellow card, or a turnover spree, so matches
  don't build narrative pressure.
- **Linear fatigue.** Threshold tiers (90/80/70/50/30%) rather than a curve, and no
  late-game cramping or collision load.
- **Binary place-kicking.** Conversions/penalties succeed or miss with an angle
  penalty only — no distance, wind, or kicker-pressure modelling, no visible kick.
- **Limited injury fidelity.** A contact-weighted roll into 3 severity bands; no
  HIA / blood-bin protocol, no failed-HIA forced removal, no recurrence tracking.
- **No officiating depth beyond cards.** TMO fires on a fixed set of triggers; no
  captain's referrals, no scrum-reset escalation to penalty try territory.
- **No rivalry/atmosphere persistence.** Derbies get flavour commentary but no
  multi-year head-to-head weight or crowd effect on discipline/kicking nerves.
- **Text-only presentation.** The engine computes a rich match but shows a play-by-
  play feed plus a 1D ball-position strip — there is no way to *see* territory,
  phase build-up, or momentum.

---

## 4. Prioritised roadmap (match-realism weighting)

### Tier 0 — Highest impact-to-effort, makes every match feel different

These reuse the existing resolvers and the `balance/` seam, add no authored team
data, and immediately increase match-to-match variation and tactical meaning.

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 0.1 | **Weather & pitch conditions** | Wind, rain, mud per fixture, modulating the kicking resolvers (distance, touch-finding, box-kick contest), the handling/knock-on gate, maul traction and scrum stability. The single cheapest way to make matches feel distinct and to give tactics (kick vs run, offload freely vs cautious) situational weight. | New per-fixture condition seed; balance multipliers into existing kick/handling/maul/scrum resolvers; commentary lines; a pre-match indicator. | M |
| 0.2 | **Referee personality / variation** | A small set of ref archetypes that shift penalty thresholds per offence family (breakdown-strict, scrum-fussy, high-tackle hawk, lets-it-flow). Makes the `discipline` lever matter differently each week and rewards reading the official. | Penalty/card threshold modulation (already centralised); pre-match ref reveal; commentary. | M |
| 0.3 | **Player roles (stat re-weighting)** | Fixes the "every 10 is identical" problem with **no new authored data**: roles re-weight existing baseStats contributions in resolvers (ball-playing vs game-manager 10; fetcher vs blindside 6/7; distributor vs sniping 9). High realism payoff for low data cost. | Role enum on selection; resolver weight tables in `balance/`; selection UI. | M |
| 0.4 | **In-match momentum / dynamic form** | Confidence that swings during a match — a try streak, a turnover spree, or a yellow card nudges subsequent rolls for the team on the right/wrong side of it. Turns a sequence of independent rolls into a match with narrative pressure. | New transient match-state field through `applyMatchEvent`; feeds resolver inputs; invariant range; commentary. | M |
| 0.5 | **Player morale / condition → match performance** | Lightweight squad morale (playing time, results, contract state) that biases the per-match form modifier. Belongs in the realism tier because a flat or unhappy player should visibly underperform. Also unlocks transfer requests / press later. | New season-scope state + `SeasonEvent`; feeds match-build form; Hub/squad surface. | M |

### Tier 1 — Set-piece & tactical decision depth

Turns the engine's biggest "contest, not decision" areas into things the manager
actually controls.

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 1.1 | **Set-piece calls** | Lineout calls (front/middle/tail, throw-to-self, dummy, off-the-top vs drive) and scrum options (8-man shove, channel ball, push for the penalty) with risk/reward. Converts two binary contests into recurring tactical decisions. | New lineout/scrum phase decision points; resolver branches; AI director choices; modal or pre-set call sheet. | L |
| 1.2 | **Individual player instructions** | A few per-player match instructions (target the breakdown, stay disciplined, run from deep, take on the line, hit rucks) layered over club tactics. | Per-player instruction set; resolver modifiers; selection UI. | M |
| 1.3 | **Expanded specialist attributes** | Add a small number of specialist stats — distinct goal-kicking, lineout-throwing accuracy, jackal/poaching, decision-making — so kickers, hookers and fetchers differentiate. Higher cost because it touches authored team data (`team-*.json` regen via `scripts/generateTeamJsons.mjs`) and `team-data.md`. | `PlayerStats` + `zeroMatchStats`/curves; resolver inputs; team JSON regen; aging curves. | L |
| 1.4 | **Detailed injuries (HIA / blood-bin / recurrence)** | HIA protocol (temporary off, pass/fail return), blood-bin temporary replacement, failed-HIA forced removal, and recurrence likelihood on early return. Deepens in-match substitution tension and the season injury system. | Match injury events + temporary-replacement flow; season recovery bands; `SeasonEvent`; medical inbox. | M |

### Tier 2 — Presentation of realism + advanced match modelling

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 2.1 | **2D pitch view** | Even under a realism mandate, the realism must be *legible*. Promote the 1D ball strip to a top-down pitch with territory zones, ball position, phase build-up, possession and key-event flashes. No need for 22 animated players — a "FM-2D-lite" / territory tug-of-war transforms immersion and App Store screenshots. | New UI canvas reading `displaySnapshot` + event bus; no engine change. | L |
| 2.2 | **Non-linear fatigue + cramping + collision load** | Replace threshold tiers with a curve; add late-game cramping and per-player collision load so heavy ball-carriers tire faster and close games get visibly ragged. | Fatigue/stamina system; invariant ranges; balance curve. | M |
| 2.3 | **Formation / defensive-shape depth** | Go beyond the 3-option defensive line: width control, 13-man defence, double-bubble, line-speed granularity, kick-chase shape. | Tactics dimensions; defensive resolver; AI director. | M |
| 2.4 | **Place-kicking realism + visible kick** | Distance + angle + wind + kicker pressure model for conversions/penalties, with a simple kick meter or outcome animation. Makes the goal-kicker attribute (1.3) matter and adds a tense beat. | Kick-at-goal handler + balance; UI kick moment. | S–M |
| 2.5 | **Alternative kicking styles** | Distinct Garryowen / box / cross-field / grubber / chip options with their own risk-reward and chase contests, instead of distance+hangtime buckets. | Kick decision director + resolvers; commentary. | M |

### Tier 3 — Realism polish & connective tissue

| # | Feature | Why it matters | Touches | Effort |
|---|---|---|---|---|
| 3.1 | **Match highlights / key-moment timeline** | Once a 2D view exists (2.1), a jump-to-the-tries/cards timeline and replay scrub improves rewatchability and sharing. | UI over the event log. | M |
| 3.2 | **Officiating depth** | Captain's referrals, scrum-reset escalation, more TMO trigger types, advantage being played. | Penalty/TMO handlers; commentary. | S–M |
| 3.3 | **Rivalry / atmosphere persistence** | Multi-year head-to-head weight and crowd effect on discipline and kicker nerves at hostile grounds; travel fatigue. | Season archive read; home-advantage + match-build modifiers. | S–M |
| 3.4 | **Crowd & home-advantage depth** | Extend the current home bonus into referee tilt, kicker confidence, and atmosphere tied to fill rate and occasion. | HomeAdvantage + balance; commentary. | S |
| 3.5 | **Expanded achievements / records for on-pitch feats** | New systems above unlock dozens of match-feat achievements and all-time records (perfect kicking day, defensive shut-out streak, comeback from 20 down). | Achievement defs; season archive. | S |

---

## 5. Suggested sequencing

1. **Tier 0 is the next release.** Weather + referee variation + player roles +
   momentum (and morale feeding form) is a coherent, marketable "every match feels
   different" update. Crucially, **0.1–0.4 add no authored team data and reuse the
   existing resolvers and `balance/` seam**, so they are low-risk under the
   determinism harness.
2. **Tier 1 is the "I'm coaching the match" arc** — set-piece calls and player
   instructions are where managerial decisions reach the pitch. Schedule the
   attribute expansion (1.3) deliberately: it touches authored team data and aging
   curves, so it wants its own focused pass with a `team-data.md` + JSON regen.
3. **Tier 2 makes the realism visible** — lead with the 2D pitch (2.1); it is the
   biggest first-impression upgrade and a pure UI addition over `displaySnapshot`
   with no engine risk.
4. **Tier 3 is continuous polish** to slot between the larger arcs.

**Explicitly not recommended:** a full 3D match engine. It fights the
no-backend/browser/mobile constraints, is a money pit, and the differentiator is
simulation depth, not graphics. A strong 2D view (2.1) captures ~80% of the
immersion for ~10% of the cost.

---

## 6. Parked: manager-fantasy & world-breadth backlog

Tracked but de-prioritised under the match-realism north star. Revisit once the
on-pitch arc lands — several are high-value for long-term retention.

- **Board / owner expectations + job security** — the missing career fail-state
  (season objective, confidence meter, sack risk). Highest-value non-match item.
- **Scouting + attribute masking** — makes recruitment a skill; pairs with staff.
- **Staff hiring** (assistant, S&C, kicking/forwards coaches, physio, scouts) —
  feeds training, injuries, scouting accuracy; also gives 1.3/1.4 more inputs.
- **Press conferences** — turn the passive media manager into a 2–3 question
  interaction feeding morale + board confidence.
- **Transfer requests & playing-time promises** — unlocked once morale (0.5) lands.
- **Second tier + promotion/relegation** — removes the career ceiling (XL).
- **European competition (Champions Cup-style)** — prestige midweek content.
- **Loan system + winter window + deadline-day drama.**
- **Finances beyond the cap** — gate receipts, sponsorship, facilities investment
  (which can feed staff/development).
- **Onboarding / tutorial + difficulty settings** — broadens the audience for a
  steep rugby + management combo.
