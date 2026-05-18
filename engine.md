# Engine Reference

Documents the complete game engine: the simulation loop, every match phase, all resolver formulas, and known gaps. Intended as the authoritative reference for anyone modifying engine behaviour.

---

## Simulation Loop

`MatchEngine.tick()` is a self-rescheduling `async` function using `setTimeout`. It is not `setInterval` — pausing is simply not scheduling the next tick.

Each tick:
1. Advances game time by `0.2 + rng(0, 8) / 10` minutes (0.2–1.0 per tick)
2. Accumulates elapsed time; calls `applyFatigue()` on both teams once the accumulator reaches 5 game minutes
3. Increments possession and territory counters
4. For `KickOff` and `BoxKick` phases: emits a pre-phase announce `GameEvent` (naming the kicker before the outcome is resolved)
5. For `KickOff` phase: awaits kick-off strategy selection — home team via modal (`kickoff_choice` pause), away team auto-selected
6. Calls `resolvePhase()` to produce the outcome `GameEvent`
7. Emits `engine:event` and `engine:stateChange`
8. Checks for penalty interactive pause (if phase is `Penalty`)
9. Checks for half-time (gameMinute ≥ 40 and `halfTimeDone === false`)
10. Checks for full-time (gameMinute ≥ 80)
11. Schedules next tick at `state.tickDelayMs`

### Attack direction

Home attacks toward `ballX = 100` in the first half, toward `ballX = 0` in the second. **Teams swap ends only at half-time, never on turnovers.** All ball movement uses three helpers in `MatchEngine` that factor in `state.halfTimeDone`:

- `attackDir()` → `+1` or `-1` for the possession team's attacking direction
- `isTryScored()` → true if `ballX` has crossed the possessing team's attacking try line
- `inOpposition22()` → true if `ballX` is inside the defending team's 22m zone

Never compute ball direction or territory logic outside these helpers.

### Phase state machine

```
KickOff      → KickReturn | Scrum
PhasePlay    → Breakdown | TacticalKick | TryScored | Penalty | Scrum | HalfTime | FullTime
FirstPhase   → Breakdown | TacticalKick | TryScored | Penalty | Scrum | HalfTime | FullTime
KickReturn   → Breakdown | TacticalKick | TryScored | Penalty | Scrum | HalfTime | FullTime
Breakdown    → PhasePlay | BoxKick | Scrum | Lineout | Penalty
BoxKick      → KickReturn | Scrum
Scrum        → FirstPhase | Penalty | Scrum
Lineout      → FirstPhase | Scrum
TacticalKick → KickReturn | Lineout | Scrum
TryScored    → ConversionKick → KickOff
Penalty      → [modal] → KickOff | Lineout | FirstPhase
HalfTime     → KickOff
FullTime     → (terminal)
```

Three carry phases share identical mechanics but are context-specific:
- **PhasePlay** — runs after Breakdown (recycled possession)
- **FirstPhase** — runs after Scrum, Lineout, or a penalty tap-and-go
- **KickReturn** — runs after KickOff, BoxKick, or TacticalKick (the receiving team now attacks)

`StateMachine.transition()` validates against this table and throws on illegal moves. `forceTransition()` bypasses validation and is used for HalfTime, FullTime, and penalty resolution.

### Player ratings

All players start at `rating: 6.0`. `adjustRating(player, delta)` clamps `rating + delta` to [1, 10]. Ratings are displayed in the Player Stats panel and update once per game minute.

---

## Fatigue System

Called via `applyFatigue(team, elapsedMinutes)` approximately every 5 game minutes.

### Decay

Every cycle, a base decay rate between 4 and 12 is randomly determined. This rate is then reduced depending on the player's stamina — higher stamina means a slower fatigue drain. A player with a stamina rating of 90 will only suffer 40% of the base decay compared to a player with a stamina rating of 0.

`actualDecay = decayRate × (1 − stamina / 150)`

Higher stamina reduces decay. A player with stamina 90 decays at 40% the rate of one with stamina 0. With 16 fatigue applications per 80-minute game, expected total fatigue loss at stamina 60 is ~77%, stamina 0 hits the floor well before full time, stamina 90 is ~51% — most players cross the 50% penalty tier during the match.

### Attribute penalties (applied to `currentStats` from `baseStats`)

| Fatigue threshold | Affected attributes | Multiplier |
|---|---|---|
| < 70% | pace, agility | × 0.95 |
| < 50% | pace, agility | × 0.87 |
| < 50% | handling, discipline, composure, setPiece, breakdown | × 0.92 |
| < 50% | strength | × 0.95 |
| < 30% | pace, agility | × 0.75 |
| < 30% | handling, discipline, composure | × 0.80 |
| < 30% | tackling | × 0.85 |
| < 30% | setPiece, breakdown | × 0.82 |
| < 30% | strength | × 0.88 |

**Not affected by fatigue at any threshold:** kicking, positioning.

`baseStats` is never modified. `currentStats` is rebuilt from `baseStats` on every fatigue application.

---

## Per-Match Form Modifier

**Source:** `rngForm()` in `src/utils/rng.ts`, applied in `initPlayer()` in `src/engine/MatchEngine.ts`.

At match start, every player (starters and bench) receives a `formModifier` — a signed integer drawn from a normal distribution (mean 0, std dev 5, clamped to [−10, +10]). It is applied additively to every stat in `currentStats` before the first tick:

```
current[stat] = clamp(baseStats[stat] + formModifier, 1, 100)
```

`baseStats` is untouched. Fatigue then degrades `currentStats` from this form-adjusted base throughout the match. A player with `formModifier = +8` starts with all attributes elevated by 8 points; one with `formModifier = −6` starts 6 points below baseline in every stat.

`formModifier` is hidden from the UI — it is stored on `Player` for engine purposes but no UI module reads it.

---

## Coin Toss

Resolved inside `MatchEngine.initialize()` before the first tick.

```
winner = rng(0, 1) === 0 ? 'home' : 'away'
state.possession = winner
```

A 50/50 coin flip. The winning team kicks off in the first half. At half-time, `triggerHalfTime()` flips possession as normal — the losing-toss team therefore kicks off the second half automatically, with no additional logic needed.

A `GameEvent` with phase `KickOff` and key `coin_toss` is emitted immediately so the result appears in the commentary feed before the first tick runs.

---

## Kick-Off

### Strategy selection

Before the resolver runs, the kicking team's strategy is determined:

- **Home team kicking:** A modal pause (`kickoff_choice`) is presented to the human manager. Three options: Kick Short (`short_kick`), Grubber Kick (`grubber`), Kick Deep (`high_ball`). The engine awaits the selection before proceeding.
- **Away team kicking:** Strategy is auto-selected. Default is `high_ball`. Exception: if `gameMinute >= 70` and `score.away < score.home`, selects `short_kick` — the away team gambles on regathering to score quickly.

### Player selection

```typescript
kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0]
receiver = randomPlayer(defendTeam)   // any of 15
chaser   = randomPlayer(attackTeam)   // any of 15
```

The fly-half (id 10) of the kicking team always takes the kick. Receiver and chaser are drawn at random from the full squads.

### Step 1 — Kick quality and distance

```
kickScore = kicker.kicking + rng(1, 20)
goodKick  = kickScore >= 35
```

Distance and base `catchMod` vary by strategy:

| Strategy | Good kick distance | Poor kick distance | Good kick `catchMod` | Poor kick `catchMod` |
|---|---|---|---|---|
| `high_ball` | 25–40m | 10–20m | 0 | +15 (floated ball, easy catch) |
| `short_kick` | 10–18m | 8–12m | −5 (tighter contest) | +10 |
| `grubber` | 15–30m | 15–30m | −10 (hard low ball) | −10 |

**10-metre rule:** If `strategy === 'short_kick'` and `!goodKick` and `distance < 10`, the kick fails to reach the 10-metre line. The resolver returns `poor_kick` immediately — no catch contest is held. The receiving team is awarded a scrum at halfway and the kicker receives a rating penalty.

The ball is placed at the kick's landing position before outcome resolution (so a `knock_on` scrum is at the landing spot, not at halfway). `poor_kick` resets `ballX` to 50.

### Step 2 — Backfield modifier

```
catchMod += backfieldDefence === 'three_back' ? 15 : backfieldDefence === 'two_back' ? 8 : 0
```

The defending team's `backfieldDefence` tactic is applied as an additive bonus to `catchMod`. A team with more players positioned deep is better equipped to receive aerial kicks — consistent with the BoxKick `fullbackMod`.

### Step 3 — Catch vs chase contest

```
catchScore = (receiver.handling + receiver.composure) / 2 + rng(1, 20) + catchMod
chaseScore = (chaser.pace + chaser.agility) / 2 + rng(1, 20)
margin     = catchScore − chaseScore
```

| Margin | Result | Possession |
|---|---|---|
| > 10 | `clean_receive` → KickReturn | Flips to receiving team |
| > −5 | `contested` → KickReturn | Flips to receiving team |
| ≤ −5 | `knock_on` → Scrum | No change (kicking team wins put-in) |

`contested` always gives the ball to the receiving team — only `knock_on` benefits the kicking side.

**Short kick regather:** After a `contested` result with `strategy === 'short_kick'`, a 15% chance in the resolver upgrades the result to `short_kick_retain` — the kicker's team regathers their own kick, no possession flip, and play continues as `KickReturn`.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| `poor_kick` | kicker | −0.225 |
| `knock_on` | receiver | −0.375 |

---

## Carry Phases (PhasePlay / FirstPhase / KickReturn)

Three phases share identical mechanics and commentary templates. **PhasePlay** runs after Breakdown; **FirstPhase** runs after KickOff, Scrum, Lineout, or a tap-and-go penalty; **KickReturn** runs after BoxKick or TacticalKick. Each is a separate handler (`handlePhasePlay`, `handleFirstPhase`, `handleKickReturn`) in its own file, routing to the matching `MatchPhase` enum value for commentary lookups.

### Player selection

```typescript
carrier  = randomPlayer(attackTeam)   // any of 15 (initial ball carrier)
defender = randomPlayer(defendTeam)   // any of 15
// Out the Back path only:
flyHalf      = pickPlayer(attackTeam, 10)
outsideBack  = random from attackTeam.players where id ∈ {11, 13, 14, 15}
```

The initial carrier and defender are always selected. The fly half and outside back are only selected if the Out the Back path is taken (see Step 2).

### Step 0 — Kick or carry decision

The probability of kicking rather than carrying into contact is driven by `attackTeam.tactics.attackingGamePlan` and pitch location:
- `possession`: 50% inside own 22; 15% in own half; 0% in opposition half.
- `balanced`: 75% inside own 22; 50% in own half; 10% in opposition half.
- `kicking`: 90% inside own 22; 65% in own half; 15% in opposition half.

Checked before any player is selected. If it fires, the fly-half (id=10) is logged as `primaryPlayer` for commentary and the phase transitions to `TacticalKick`. Steps 1–4 do not run.

### Step 1 — Carrier handling gate

The carrier's handling stat is tested with a random factor (threshold < 30). If they fail, they knock the ball on: possession flips, `handlingErrors` increments, and a scrum is awarded. Steps 2–4 do not run.

### Step 2 — Hard Carry / Out the Back decision

After the carrier's handling gate passes, the attacking team chooses a play based on `attackTeam.tactics.attackingStyle`:

| `attackingStyle` | Hard Carry | Out the Back |
|---|---|---|
| `keep_it_tight` | 90% | 10% |
| `balanced` | 70% | 30% |
| `wide_wide` | 50% | 50% |

If the carrier is the fly half (id 10), always Hard Carry.

**Hard Carry:** the carrier proceeds directly to evasion (Step 3). `ballCarrier = carrier`.

**Out the Back:** the ball is worked through the fly half to an outside back via two additional handling gates:

1. Fly half (id 10) handling gate (threshold < 30) — if failed: fly half is credited with the knock-on, possession flips, scrum awarded. The `out_the_back` commentary intro is still prepended.
2. Outside back (random from ids 11, 13, 14, 15) handling gate (threshold < 30) — if failed: outside back is credited with the knock-on, possession flips, scrum awarded. The `out_the_back` commentary intro is still prepended.

If both gates pass, `ballCarrier = outsideBack` and play proceeds to evasion (Step 3) with the outside back as the ball carrier. The outside back's pace and agility stats are used — backs with high pace naturally gain more from this path than a forward would.

### Step 3 — Evasion vs defence

`ballCarrier` (carrier or outside back depending on Step 2) attempts to evade the defence. The ball carrier's evasion score is a mix of their agility and pace; the defender relies on their positioning and pace. Both scores include a random factor. `breakdownMod` values are applied here — `attackMod` added to evasion, `defendMod` added to defence.

**Backfield Defence front-line penalty:** applied to the defend score on every carry, regardless of path:

| `backfieldDefence` | `defendMod` adjustment |
|---|---|
| `one_back` | 0 |
| `two_back` | −5 |
| `three_back` | −10 |

The defence score is subtracted from the evasion score to determine the margin:

| Margin | Result |
|---|---|
| ≥ 15 | `line_break` → Breakdown (or TryScored if ball crosses line) |
| < 15 | Proceed to Step 4 |

### Step 4 — Collision

If the ball carrier doesn't make a clean line break, a physical collision occurs. The ball carrier uses their strength and pace to drive forward; the defender relies on their tackling and strength to stop them. Both scores include a random factor.

| Margin | Result | Gain |
|---|---|---|
| ≥ +5 | `dominant_carry` | 3–8m |
| −4 to +4 | `play_on` | 1–4m |
| ≤ −5 | `dominant_tackle` | −2 to +1m |

All three outcomes transition to Breakdown.

### Commentary

When the Out the Back path is taken, an `out_the_back` commentary line is generated immediately after the fly half is selected, naming the carrier (`{primary}`) and fly half (`{secondary}`). This intro is prepended to the outcome commentary in every exit path — including both knock-on cases. Example combined output: *"Out the back from Jones! Williams catches and sends it wide. Price breaks through the line!"*

### Ball movement

The ball's position on the pitch is moved forward or backwards depending on the metres gained or lost in the collision.

### Rating adjustments

Applies to `ballCarrier` (the outside back on the Out the Back path, or the original carrier on Hard Carry).

| Outcome | Player | Delta |
|---|---|---|
| knock_on (any gate) | player who dropped | −0.45 |
| line_break | ballCarrier | +0.375 |
| dominant_carry | ballCarrier | +0.225 |
| dominant_tackle | defender | +0.3 |
| dominant_tackle | ballCarrier | −0.075 |

---

## Breakdown

### Player selection

```typescript
forwardPool = attackTeam.players.filter(p => p.id <= 8 && p.id !== carrierId)
backRow     = defendTeam.players.filter(p => p.id >= 6 && p.id <= 8)
defendPack  = defendTeam.players.filter(p => p.id <= 8)
```

Attacking supporters are sampled at random (without replacement) from the forward pool. The count is set by `attackingBreakdown`: `pick_and_drive` = 4, `balanced` = 3, `wide_play` = 2. The defending jackal is chosen at random from the back row (ids 6–8). The full defending pack (ids 1–8) is also passed for use by the `counter_ruck` branch.

**Tactical Breakdown Commitment (`AttackingBreakdown` & `DefendingBreakdown`):**
- **Attacking:** Supporter count is driven by `attackTeam.tactics.attackingBreakdown`: `pick_and_drive` commits 4 forwards; `balanced` commits 3 forwards; `wide_play` commits 2 forwards. Body count directly drives ARS via the stacked-score formula — no separate flat bonus.
- **Defending:** Strategy is driven by `defendTeam.tactics.defendingBreakdown`:
  - `jackal`: Relies on a single back-row specialist's breakdown stat.
  - `counter_ruck`: The 4 strongest defenders (by `strength×0.6 + breakdown×0.4`) contest the ruck using the stacked-score formula.
  - `shadow`: Concedes ruck ball (DTS = rng(1,10)) to maintain a perfectly aligned defensive line.

**Next-phase carry-over (`state.breakdownMod`):** Committing more players to the ruck leaves fewer available for the next phase. After every breakdown the engine sets `state.breakdownMod.attack` and `state.breakdownMod.defend` which are consumed (and reset to zero) by the very next carry phase (PhasePlay after Breakdown, or FirstPhase/KickReturn in other contexts), where they are applied as modifiers to the evasion and defence scores respectively.

| Tactic | Effect on next carry phase |
|---|---|
| `pick_and_drive` | attack −8 evasion (forwards still arriving) |
| `balanced` | 0 |
| `wide_play` | attack +8 evasion (extra players on feet outside) |
| `counter_ruck` | defend −8 (pack committed to ruck) |
| `jackal` | 0 (one player, line intact) |
| `shadow` | defend +10 (full defensive line set) |

On turnover or penalty, `breakdownMod` is reset to `{0, 0}` immediately — possession changes reset the context. On Scrum, `breakdownMod` is also reset so stale mods from the BoxKick → Scrum → OpenPlay path don't carry through.

### Resolution

Both attack and defense use a **diminishing-return stacked score** (`stackedScore`). Players are sorted best-first (by their two primary stats), then each contributes their weighted score with the weights `[1.0, 0.6, 0.4, 0.3]` for positions 1–4. The raw weighted sum is divided by 2, which calibrates 3 supporters (balanced) to the same base as a simple average.

```
stackedScore(players, leadStat, supportStat):
  sort players descending by (leadStat×0.6 + supportStat×0.4)
  sum = Σ (leadStat×0.6 + supportStat×0.4 + (discipline−50)×0.15) × WEIGHTS[i]
  return sum / 2
```

**ARS (Attack Ruck Score):**
```
ARS = stackedScore(supporters, breakdown, strength) + rng(1,20) + attackBonus
attackBonus = 6 if previous play was dominant_carry, else 0
```

**DTS (Defensive Turnover Score):**
- **jackal**: `breakdown×0.7 + strength×0.3 + (discipline−50)×0.15 + rng(1,20)`
- **counter_ruck**: `stackedScore(top4defenders, strength, breakdown) + rng(1,20)`
- **shadow**: `rng(1,10)`

The top 4 defenders for `counter_ruck` are the 4 forwards with the highest `strength×0.6 + breakdown×0.4` score.

Effect of player count on ARS (same-quality supporters, typical stats):

| Tactic | Supporters | Weight sum | ARS multiplier vs average |
|---|---|---|---|
| `wide_play` | 2 | 1.6 | ×0.80 |
| `balanced` | 3 | 2.0 | ×1.00 (baseline) |
| `pick_and_drive` | 4 | 2.3 | ×1.15 |

Both quality (stat values) and quantity (number of bodies) now independently influence the score. A team with specialist breakdown forwards benefits more from committing them to the ruck.

**Margin and outcomes:**

| Margin | Result |
|---|---|
| ≥ 10 | `clean_ball` → PhasePlay |
| ≥ −8 | `slow_ball` → PhasePlay / BoxKick |
| ≥ −14 | `turnover` → PhasePlay (possession flips) |
| < −14 | `penalty_defending` → Penalty (possession flips to defending team) |

### Ball movement

None. `ballX` does not change during a breakdown.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| clean_ball | supporters[0] (primary forward) | +0.15 |
| turnover | jackal | +0.75 |
| turnover | supporters[0] | −0.15 |
| penalty_defending | supporters[0] | −0.375 |

`supporters[0]` is the first randomly selected forward and serves as the `primaryPlayer` for commentary and rating purposes.

---

## Scrum

### Player selection

```typescript
attackForwards  = attackTeam.players.filter(p => p.id <= 8)   // props, hooker, locks, flankers, no. 8
defendForwards  = defendTeam.players.filter(p => p.id <= 8)
attackFrontRow  = attackTeam.players.filter(p => p.id <= 3)   // loosehead, hooker, tighthead
defendFrontRow  = defendTeam.players.filter(p => p.id <= 3)
attackHooker    = attackTeam.players.find(p => p.id === 2)     // commentary only
defendHooker    = defendTeam.players.find(p => p.id === 2)     // commentary only
```

All eight forwards contribute to the pack score. The hooker is used for commentary only. Rating adjustments apply to the entire front row (ids 1–3) on both sides.

### Resolution

```
packScore      = avg(setPiece×0.6 + strength×0.4) across all 8 forwards
packDiscipline = avg(discipline) across all 8 forwards
finalScore     = packScore + (packDiscipline − 50)×0.15 + rng(1,20)
```

The defending pack's final score is subtracted from the attacking pack's final score to determine the margin:

| Margin | Result |
|---|---|
| > 0 | `stable_win` → OpenPlay |
| −15 to 0 | `wheel` → Scrum |
| ≤ −15 | `dominant_penalty` → Penalty (possession flips to defending team) |

The threshold for `stable_win` is any positive margin — attackers win if they score higher by even 1 point.

### Ball movement

None.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| stable_win | attacking front row (ids 1–3), each | +0.15 |
| dominant_penalty | defending front row (ids 1–3), each | +0.225 |
| dominant_penalty | attacking front row (ids 1–3), each | −0.3 |

---

## Lineout

### Player selection

```typescript
hooker       = pickPlayer(attackTeam, 2)                          // hooker (id 2)
attackJumper = attackTeam.players.find(p => p.id === [4,5,7][rng(0,2)])  // random from Left Lock, Right Lock, Openside Flanker
defendJumper = pickPlayer(defendTeam, 4, 5, 6)                    // always id 4 (Left Lock)
```

The attacking jumper is chosen at random from ids 4 (Left Lock), 5 (Right Lock), and 7 (Openside Flanker). The defending jumper is selected via `Array.find`, which always returns id 4.

### Step 1 — Throw quality gate

```
throwScore = hooker.setPiece + rng(1, 100)
if throwScore < 95 → crooked_throw
```

`rng(1, 100)` is used here (not the usual 1–20) to allow fine probability calibration. For the hookers in the current squads (setPiece 88–90), this gives a ~4–6% crooked-throw rate. A hooker with setPiece 75 would fail ~19% of the time; setPiece 60 fails ~34% of the time.

On a crooked throw: possession flips, scrum awarded to the defending team. `attackJumpScore` and `defendJumpScore` are both 0.

### Step 2 — Jump contest

If the throw is good, both jumpers compete in the air using set-piece and agility, plus a random dice roll. The defending jumper's score is subtracted from the attacking jumper's score:

```
attackJumpScore = (setPiece×0.5 + agility×0.5) + rng(1,20)
defendJumpScore = (setPiece×0.5 + agility×0.5) + rng(1,20)
margin = attackJumpScore − defendJumpScore
```

| Margin | Result |
|---|---|
| ≥ −5 | `clean_catch` → OpenPlay |
| −15 to −6 | `scrappy_knock_on` → Scrum (possession flips) |
| < −15 | `steal` → OpenPlay (possession flips) |

The attack team has a significant advantage at the jump; clean catch is the expected outcome unless the defending jumper is markedly superior.

### Ball movement

None.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| crooked_throw | hooker | −0.4 |
| clean_catch | attackJumper | +0.225 |
| scrappy_knock_on | attackJumper | −0.3 |
| steal | defendJumper | +0.45 |
| steal | attackJumper | −0.15 |

---

## Box Kick

Triggered from a `slow_ball` Breakdown result. The decision to box kick is dynamically gated by `attackTeam.tactics.attackingGamePlan` and pitch location:
- `possession`: Never box kick; retain possession in hand (`OpenPlay`).
- `kicking`: Box kick on slow ball from anywhere outside opposition 22 and outside own deep 22.
- `balanced`: Box kick on slow ball primarily when in own half (outside own 22).

### Player selection

```typescript
scrumHalf  = attackTeam.players.find(p => p.id === 9)
wingerPool = attackTeam.players.filter(p => p.id === 11 || p.id === 14)   // left and right wings
winger     = wingerPool[rng(0, wingerPool.length - 1)]   // random winger
fullback   = defendTeam.players.find(p => p.id === 15)
```

The scrum half always takes the kick. One attacking winger is selected at random to contest the aerial ball. The defending fullback always receives.

**Backfield Defence modifier (`fullbackMod`):** The defending team's `backfieldDefence` tactic determines how much support the fullback has under the high ball. This is applied as a flat bonus to both the fullback's contested score and the uncontested catch score:

| `backfieldDefence` | `fullbackMod` |
|---|---|
| `one_back` | 0 |
| `two_back` | +8 |
| `three_back` | +15 |

### Resolution

**Step 1 — Kick quality gate**

The scrum-half's kicking stat, combined with a random factor, determines the kick's quality. A high score results in a very good, hang-time kick, while a lower score results in a poor kick.

| Threshold | Quality |
|---|---|
| kickScore ≥ 75 | very_good → contested catch |
| kickScore < 75 | poor → uncontested catch |

**Step 2a — Very good kick: contested catch** (ball moves 15m up the pitch)

The attacking winger races to contest the ball, relying on their handling and pace. The defending fullback relies on their handling and positioning. Both scores include a random factor, and the fullback's score is subtracted from the winger's score to determine the margin:

| Margin | Outcome | Next Phase |
|---|---|---|
| ≥ 10 | `attack_retain` — attacker wins contest clearly | OpenPlay (possession kept) |
| 0–9 | `defend_knock_on` — defender fumbles under pressure | Scrum (attacking put-in) |
| < 0 | `defend_catch_contested` — fullback claims cleanly | OpenPlay (possession flips) |

**Step 2b — Poor kick: uncontested catch** (ball moves 8m up the pitch)

Because the kick lacked hang-time or distance, the fullback has time to set themselves under the ball. They rely entirely on their handling and positioning, plus a random factor, to catch the ball cleanly. A high score results in a clean catch, while a low score results in a knock-on.

| Threshold | Outcome | Next Phase |
|---|---|---|
| catchScore ≥ 35 | `defend_catch` — fullback collects | OpenPlay (possession flips) |
| catchScore < 35 | `knock_on` — fullback drops | Scrum (attacking put-in) |

### Ball movement

- Very good kick: `ballX += attackDir() × 15`
- Poor kick: `ballX += attackDir() × 8`

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| attack_retain | scrum half | +0.15 |
| attack_retain | winger | +0.30 |
| attack_retain | fullback | −0.15 |
| defend_knock_on | scrum half | +0.075 |
| defend_knock_on | winger | +0.15 |
| defend_knock_on | fullback | −0.225 |
| defend_catch_contested | fullback | +0.30 |
| defend_catch_contested | winger | −0.15 |
| defend_catch | fullback | +0.15 |
| knock_on | scrum half | −0.15 |
| knock_on | fullback | −0.225 |

---

## Tactical Kick

Triggered by the 15% kick-or-carry check at the start of `OpenPlay` (Step 0, before any player is selected for a carry).

### Player selection

```typescript
kicker   = attackTeam.players.find(p => p.id === 10 || p.id === 9) ?? attackTeam.players[0]
defender = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam)
```

Fly-half kicks first, scrum-half if fly-half is unavailable. The fullback receives.

### Step 1 — Kick quality and distance

The kicker relies on their kicking stat and a random factor to generate a kick score (`kickScore = kicking + rng(1, 20)`). A good kick (`kickScore >= 25`) travels further (20 to 40 metres), has a 0% chance of going out on the full, and a 75% chance of bouncing into touch. A poor kick (`kickScore < 25`) is shorter (5 to 15 metres), has a 30% chance of going directly out on the full, and a 30% chance of bouncing into touch.

The ball's position on the pitch is updated immediately based on the calculated distance.

**Backfield Defence touch reduction:** The defending team's `backfieldDefence` tactic reduces the effective touch probability — more backfield players mean better kick coverage and a lower chance of the kick finding touch:

| `backfieldDefence` | Touch probability reduction |
|---|---|
| `one_back` | 0 |
| `two_back` | −15 |
| `three_back` | −25 |

The reduction is applied as `Math.max(0, touchProbability - touchReduction)` so the probability never goes below zero.

### Step 2 — Out on the full, touch, or caught

The game first rolls a percentage chance against the `outOnTheFullProbability` determined in Step 1.
- **Out on the Full:** If the roll succeeds and the kick was taken from *outside* the kicking team's own 22m line, it goes straight out on the full. The ball is brought all the way back to the original kicking position (no ground gained) and the defending team gets the lineout. (If taken from *inside* the own 22m line, gaining ground directly into touch is legal, so it acts as a Standard Touch).

If the ball does not go out on the full, the game rolls against `touchProbability` to see if the ball bounces into touch.
- **50:22 Rule:** If the kick bounces into touch, was taken from *inside* the kicking team's own half, and lands *inside* the opposition's 22m line, the kicking team is rewarded for a 50:22! The kicking team **retains possession** and gets the throw-in at the resulting lineout.
- **Standard Touch:** In all other bouncing touch scenarios (or direct touch from inside own 22), the distance is gained and the defending team gets the throw-in at the lineout.

If the ball **does not** go into touch at all, the defending fullback catches the ball in the field of play. The phase becomes Open Play, and possession flips to the defending team.

**Backfield return momentum:** When the kick is caught in the field, the defending team's backfield players support the counter-attack. A `breakdownMod.attack` bonus is set to give the receiving team an advantage in the next open play phase:

| `backfieldDefence` | `breakdownMod.attack` on catch |
|---|---|
| `one_back` | 0 (no bonus) |
| `two_back` | +5 |
| `three_back` | +10 |

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| good kick (kickScore ≥ 25) | kicker | +0.15 |
| poor kick (kickScore < 25) | kicker | −0.225 |

---

## Penalty

### How a penalty arises

Penalties are generated by two phases:

- **Breakdown** `penalty_defending`: margin ≤ −15 (attacking team infringes at ruck)
- **Scrum** `dominant_penalty`: margin ≤ −15 (attacking pack collapses under pressure)

In both cases the **non-offending team** gains possession and the phase transitions to `Penalty`.

### Interactive pause decision

After `resolvePhase()` sets the phase to `Penalty`, `tick()` calls `handlePenaltyDecision()`:

```
if possession !== 'home'  → auto-select kick_to_touch (away team AI, no modal)
if NOT inOppositionHalf() → auto-select kick_to_touch (own half, no modal)
if possession === 'home' AND inOppositionHalf() → emit engine:paused → await Promise<PenaltyChoice>
```

`inOppositionHalf()` returns true when `ballX > 50` for home in the first half (attacking right) or `ballX < 50` in the second half (attacking left). The modal is only shown to the human manager, who controls the home team.

The engine loop is suspended mid-tick at the `await`. It resumes when the `onChoice(choice)` callback (provided in the `engine:paused` payload) is called by `ModalManager`.

### Choice: kick_for_goal

```
tryLine        = attacking try line (100 or 0 depending on half and possession)
distFromPosts  = |ballY − 50| × 0.3 + |ballX − tryLine| × 0.2
anglePenalty   = distFromPosts × 0.3
score          = kicking + composure×0.2 − anglePenalty + rng(1,20)
success        = score ≥ 65
```

Both lateral angle (`ballY`) and distance from the try line (`ballX`) contribute to difficulty. A central kick close to the posts has `distFromPosts ≈ 0`; a wide kick from distance can push `distFromPosts` to 30+, adding ~9 points of penalty.

On success: +3 points, possession flips, ballX resets to 50, → KickOff.
On miss: no score, possession flips, ballX resets to 50, → KickOff.

Rating: success → kicker +0.3; miss → kicker −0.225.

### Choice: kick_to_touch

The ball is moved 20 metres down the pitch towards the opposition try line.

Possession is retained. The lineout is awarded to the kicking team 20 units further up the pitch.

**Future development:** the metres gained from kicking to touch should be variable, driven by the kicker's kicking stat, composure, and pitch location.

### Choice: tap_and_go



No ball movement. Possession is retained. Resumes open play from current position.

---

## Try Scored

### How a try arises

`TryScored` is set inside the `OpenPlay` handler when a `line_break` result causes `isTryScored()` to return true — i.e. the ball has crossed the attacking try line after `gainMetres` are applied.

### Resolution

```typescript
scorer = lastEvent.primaryPlayer ?? randomPlayer(attackTeam)
```

The scorer is assigned to the player who carried the ball over the line from the previous phase.

```
score[possession] += 5
stats.tries[possession]++
→ ConversionKick
```

### Rating adjustments

| Player | Delta |
|---|---|
| scorer | +1.0 |

---

## Conversion Kick

### Player selection

```typescript
kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0]
```

Always the fly-half.

### Resolution

```
distFromPosts = |ballY − 50| × 0.4
anglePenalty  = distFromPosts × 0.3
score         = kicking + composure×0.2 − anglePenalty + rng(1,20)
success       = score ≥ 65
```

Only the lateral angle (`ballY`) affects difficulty for conversions — unlike the penalty kick, distance from the try line is not factored in. A central conversion has `distFromPosts = 0`; a conversion from the touchline adds up to ~6 points of penalty.

On success: +2 points.

After resolution (regardless of outcome): possession flips, ballX resets to 50, → KickOff.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| success | kicker | +0.225 |
| miss | kicker | −0.15 |

---

## Half-Time

Triggered inside `tick()` when `gameMinute ≥ 40` and `halfTimeDone === false`.

```typescript
state.halfTimeDone = true
state.possession   = flipped
state.ballX        = 50
state.ballY        = 50
```

A `HalfTime` event is emitted, then the phase force-transitions to `KickOff` for the second half. The possession swap at half-time combined with `halfTimeDone = true` is what reverses the output of `attackDir()`, `isTryScored()`, and `inOpposition22()` for the rest of the match.

---

## Full-Time

Triggered inside `tick()` when `gameMinute ≥ 80`.

```typescript
state.isRunning = false
```

Forces phase to `FullTime`. Emits `engine:event`, `engine:stateChange`, and `engine:finished`. No further ticks are scheduled.

---

## Substitutions

Triggered by the UI via `eventBus.emit('ui:substitution', { benchSquadNum, fieldSquadNum })`. The engine listens and calls `substitute('home', benchSquadNum, fieldSquadNum)` immediately (mid-tick if in progress).

```typescript
sub.id = off.id     // sub inherits the field jersey position (id) of the player coming off
team.players[fieldIdx] = sub
team.bench.splice(benchIdx, 1)
team.substitutedOff.push(off)
```

The substitute takes the squad position (`id`) of the player they replace, so they slot into the same formation role and will be selected by phase handlers using that id. A commentary event (`MatchPhase.Substitution`) is emitted immediately so the change appears in the feed.

No rating adjustment is applied on substitution. The incoming player's `formModifier` and `fatiguePct` are as initialised at match start — they are not reset on sub.

**Scope:** Only the home team can substitute via the UI. Away team substitutions are not implemented.

---

## Tactical Commentary

Each event file (`BreakdownEvent`, `OpenPlayEvent`, `TacticalKickEvent`, `BoxKickEvent`) contains a local `tacticNote(chancePct, ...lines)` helper:

```typescript
function tacticNote(chancePct: number, ...lines: string[]): string {
  return rng(1, 100) <= chancePct ? ' ' + lines[rng(0, lines.length - 1)] : '';
}
```

When a tactic directly influences a key outcome, the handler may append a note to the standard `getCommentary(...)` string. Notes only fire for the **home team** (checked via `state.possession` before any possession flip). Multiple lines are provided per trigger; one is chosen at random. This ensures variety and prevents the feed from becoming formulaic.

Notes cover both the upside and the downside of a tactic choice — a player should see their good decisions rewarded *and* their poor decisions highlighted.

| File | Trigger | Home role | Chance |
|---|---|---|---|
| `BreakdownEvent` | `pick_and_drive` + `clean_ball` | attacking | 30% |
| `BreakdownEvent` | `wide_play` + `slow_ball` | attacking | 30% |
| `BreakdownEvent` | `wide_play` or `pick_and_drive` + `penalty_defending` | attacking | 25% |
| `BreakdownEvent` | `jackal` + `turnover` | defending | 35% |
| `BreakdownEvent` | `counter_ruck` + `slow_ball` or `turnover` | defending | 30% |
| `BreakdownEvent` | `shadow` + `clean_ball` conceded | defending | 30% |
| `BreakdownEvent` | `jackal` + `penalty_defending` | defending | 25% |
| `OpenPlayEvent` | `line_break` + `two_back`/`three_back` defending | defending | 30% |
| `TacticalKickEvent` | kick caught + `two_back`/`three_back` | defending (now attacking) | 35% |
| `TacticalKickEvent` | `fifty_twenty_two` + `one_back` | defending | 25% |
| `BoxKickEvent` | `defend_catch` + `two_back`/`three_back` | defending | 30% |

The Out the Back path in `OpenPlayEvent` uses a different mechanism — a structural `getCommentary(..., 'out_the_back')` call (not a `tacticNote`) that always fires when the path is taken. It names the carrier and fly half and is prepended to the outcome commentary.

---

## Commentary Engine

`CommentaryEngine.ts` is a pure text module. It must never produce HTML — that is the UI layer's concern.

### `getCommentary(event, key)`

Picks a random template from `TEMPLATES[event.phase][key]` (falling back to `TEMPLATES.default.generic`) and calls `interpolate()`.

### Template variables

| Token | Resolved value |
|---|---|
| `{primary}` | `primaryPlayer` formatted as `"Name (#jersey)"`, or `"the player"` if absent |
| `{secondary}` | `secondaryPlayer` formatted as `"Name (#jersey)"`, or `"the defender"` if absent |
| `{side}` | `event.sideName` (team name string) |

The `playerLabel(player, fallback)` helper produces the `"Name (#N)"` format. Both `{primary}` and `{secondary}` use it. Adding a player to a template automatically picks up jersey number — no template changes needed.

### Plain-text contract

`CommentaryEngine` always returns a plain-text string. `CommentaryFeed.ts` post-processes it to wrap player name tokens in team-coloured `<span>` elements. If `CommentaryEngine` ever emits HTML, the span injection in `CommentaryFeed` will double-encode or break.

---

## Known Gaps

| Gap | Location | Effect |
|---|---|---|
| kicking, positioning not degraded by fatigue | StaminaSystem | These stats remain at full base value for the entire 80 minutes |
