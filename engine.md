# Engine Reference

Documents the complete game engine: the simulation loop, every match phase, all resolver formulas, and known gaps. Intended as the authoritative reference for anyone modifying engine behaviour.

---

## Simulation Loop

`MatchEngine.tick()` is a self-rescheduling `async` function using `setTimeout`. It is not `setInterval` — pausing is simply not scheduling the next tick.

Each tick:
1. Captures `wasInRed = state.clockInTheRed` and `previousPhase = state.phase` before any mutation.
2. Advances game time: if `wasInRed`, adds `timeAdvance / 2` (clock crawls); otherwise advances normally and clamps to the half target (40 or 80). `timeAdvance = 0.2 + rng(0, 8) / 10` (0.2–1.0 per tick).
3. Accumulates elapsed time; calls `applyFatigue()` on both teams once the accumulator reaches 5 game minutes. Returns newly-fatigued players (crossing below 50%); emits a fatigue commentary event for each.
4. Increments possession and territory counters.
5. For `KickOff` and `BoxKick` phases: emits a pre-phase announce `GameEvent` (naming the kicker before the outcome is resolved).
6. For `KickOff` phase: awaits kick-off strategy selection via modal (`kickoff_choice` pause) — **home team only**. Away team always defaults to `high_ball` with no modal.
7. Calls `resolvePhase()` to produce the outcome `GameEvent`.
8. Emits `engine:event` and `engine:stateChange`.
9. Checks for penalty interactive pause (if phase is `Penalty`).
10. **Clock-in-the-red check:** If `!clockInTheRed && gameMinute >= halfTarget`, calls `enterClockInTheRed()` (sets flag, emits announcement). Else if `wasInRed && shouldEndPeriod(previousPhase)`, triggers half-time or full-time.
11. Schedules next tick at `state.tickDelayMs`.

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

Three carry phases share an evasion/collision resolver but have distinct player selection and structure:
- **PhasePlay** — runs after Breakdown; random carrier; hard carry or out-the-back split
- **FirstPhase** — runs after Scrum, Lineout, or a tap-and-go penalty; carrier always #10; crash ball or wide play
- **KickReturn** — runs after KickOff, BoxKick, or TacticalKick; carrier is whoever caught the kick; run step before evasion/collision

`StateMachine.transition()` validates against this table and throws on illegal moves. `forceTransition()` bypasses validation and is used for HalfTime, FullTime, and penalty resolution.

### Player ratings

Ratings are computed from accumulated per-player statistics, not from event-by-event deltas. After every `resolvePhase()` call (and after penalty goal kicks in `applyPenaltyChoice()`), `recalculateRatings()` calls `computeRating(player)` on all 30 players and writes the result to `player.rating`.

**`computeRating`** is a pure function in `src/engine/RatingEngine.ts`. It reads `player.matchStats` (a `PlayerMatchStats` object) and returns a value in [1.0, 10.0]:

```
baseScore = 6.0
score += tries × 7.0
score += lineBreaks × 2.5
score += defendersBeaten × 0.8
score += turnoversWon × 2.5
score += dominantTackles × 1.0
score += tacklesMade × 0.35
score += kicksMade × 1.0
score += metresCarried × 0.05
score -= knockOns × 1.5
score -= (tacklesAttempted − tacklesMade) × 0.5   // missed tackles
score -= penaltiesConceded × 1.2                  // breakdown penalties only
score -= kicksMissed × 0.75
```

Position bonuses (stacked additively on top of universal):

| Player id | Bonus |
|---|---|
| 2 (hooker) | `(lineoutWins / lineoutThrows − 0.75) × 20` when lineoutThrows > 0 |
| 4, 5 (locks) | `lineoutCatches × 1.5` + `lineoutSteals × 3.0` |
| 1–3 (front row) | `scrumPenaltiesWon × 2.5` − `scrumPenaltiesConceded × 2.5` |
| 6–8 (back row) | `turnoversWon × 1.5` (stacked) + `carries × 0.3` |
| 9 (scrum-half) | `passes × 0.05` |
| 10 (fly-half) | `kicksFromHand × 0.25` |
| 11, 14, 15 (wings/fullback) | `lineBreaks × 1.5` (stacked) |

```
rating = clamp(6.0 + score / 10.0, 1.0, 10.0)
```

**`PlayerMatchStats`** is declared in `src/types/player.ts` and initialised to all zeros in `zeroMatchStats()` which is called by `initPlayer()` for every player (starters and bench). Fields:

```typescript
carries, metresCarried, lineBreaks, defendersBeaten, knockOns, passes,
tacklesAttempted, tacklesMade, dominantTackles, turnoversWon, penaltiesConceded,
tries, kicksFromHand, kicksAtGoal, kicksMade, kicksMissed,
lineoutThrows, lineoutWins, lineoutCatches, lineoutSteals,
scrumPenaltiesWon, scrumPenaltiesConceded,
kickMetres, rucksHit
```

To add a new stat: add one field to `PlayerMatchStats`, one `field: 0` in `zeroMatchStats()`, increment it in the relevant event file(s), and optionally add a weight in `computeRating()`.

Ratings are displayed in the Player Stats panel and update once per game minute. Bench players who never came on retain their initial rating of 6.0.

---

## Fatigue System

Called via `applyFatigue(team, elapsedMinutes)` approximately every 5 game minutes.

### Decay

Every cycle, a base decay rate between 4 and 12 is randomly determined. This rate is then reduced depending on the player's stamina — higher stamina means a slower fatigue drain. A player with a stamina rating of 90 will only suffer 40% of the base decay compared to a player with a stamina rating of 0.

`actualDecay = decayRate × (1 − stamina / 150)`

For forwards (player id ≤ 8), the decay is then multiplied by a tactic factor:

- `attackingBreakdown === 'pick_and_drive'`: ×1.1
- `defendingBreakdown === 'counter_ruck'`: ×1.1
- Both active: ×1.21 (multiplicative, not additive)

Backs (id ≥ 9) are unaffected by the tactic multiplier.

Higher stamina reduces decay. A player with stamina 90 decays at 40% the rate of one with stamina 0. With 16 fatigue applications per 80-minute game, expected total fatigue loss at stamina 60 is ~77%, stamina 0 hits the floor well before full time, stamina 90 is ~51% — most players cross the 50% penalty tier during the match.

### Attribute penalties (applied to `currentStats` from `baseStats`)

Each `if` block overwrites the previous, so the final matching block wins.

| Fatigue threshold | Affected attributes | Multiplier |
|---|---|---|
| < 90% | strength | × 0.90 |
| < 80% | tackling | × 0.80 |
| < 70% | pace, agility | × 0.75 |
| < 70% | handling, discipline, composure, setPiece, breakdown | × 0.80 |
| < 70% | strength | × 0.70 |
| < 50% | pace, agility | × 0.55 |
| < 50% | handling, discipline, composure, setPiece, breakdown | × 0.60 |
| < 50% | strength | × 0.50 |
| < 30% | pace, agility | × 0.35 |
| < 30% | handling, discipline, composure | × 0.40 |
| < 30% | tackling | × 0.40 |
| < 30% | setPiece, breakdown | × 0.30 |
| < 30% | strength | × 0.30 |

**Not affected by fatigue at any threshold:** kicking, positioning.

`baseStats` is never modified. `currentStats` is rebuilt from `baseStats` on every fatigue application.

### Fatigue commentary

When `applyFatigue` detects a player crossing from ≥ 50% to < 50% fatiguePct, it returns that player in a list. `MatchEngine` emits a `GameEvent` (using the current phase/possession context) with a randomly chosen line from six variants: "starting to look tired", "looking leggy", "wear is showing", "running on empty", "looks worn out", "tank is emptying". The commentary feed colorises the player name normally.

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

- **Home team kicking:** A modal pause (`kickoff_choice`) is presented. Three options: Kick Short (`short_kick`), Grubber Kick (`grubber`), Kick Deep (`high_ball`). The engine awaits the selection before proceeding.
- **Away team kicking:** Always defaults to `high_ball` (Kick Deep), no modal shown.

> **Future development:** Away team kick-off strategy should be driven by away team tactics (e.g. late-game pressure situations selecting `short_kick`). Currently hardcoded to `high_ball` pending away team tactical UI.

### Player selection

The fly-half (id 10) of the kicking team always takes the kick. Receiver and chaser are drawn based on strategy:

| Strategy | Receiver pool | Chaser pool |
|---|---|---|
| `high_ball` (Kick Deep) | ids 9, 11, 14, 15 (backs) | any |
| `short_kick` (Kick Short) | ids 1–8 (forwards) | ids 7, 11, 14 |
| `grubber` (Grubber Kick) | ids 1–8 (forwards) | any (not used in resolver) |

Falls back to `randomPlayer` if the filtered pool is empty.

### Step 1 — Kick quality and distance

```
kickScore = kicker.kicking + rng(1, 20)
goodKick  = kickScore >= 35
```

| Strategy | Good kick distance | Bad kick distance |
|---|---|---|
| `high_ball` | 25–40m | 15–25m (no poor-kick threshold) |
| `short_kick` | 10–20m | 4–9m → `poor_kick` |
| `grubber` | 15–25m | 4–9m → `poor_kick` |

**10-metre rule (`short_kick` and `grubber`):** If `distance < 10`, the resolver returns `poor_kick` immediately. The receiving team is awarded a scrum at halfway (possession flips) and the kicker receives a rating penalty.

The ball is placed at the kick's landing position before outcome resolution (so a `knock_on` scrum is at the landing spot, not at halfway). `poor_kick` resets `ballX` to 50.

### Step 2 — Outcome resolution

**Kick Deep (`high_ball`) — catching gate only:**
```
catchScore = (receiver.handling + receiver.composure) / 2 + rng(1, 20)
catchScore < 30 → knock_on
else            → clean_receive
```
No chase contest. The result is solely whether the receiver holds the ball.

**Kick Short (`short_kick`) — catch vs chase contest:**
```
catchScore = (receiver.handling + receiver.composure) / 2 + rng(1, 20)
chaseScore = (chaser.pace + chaser.agility) / 2 + rng(1, 20)
margin     = catchScore − chaseScore
margin > 10  → clean_receive
margin > −5  → 30% short_kick_retain, else clean_receive
margin ≤ −5  → knock_on
```

**Grubber (`grubber`) — catching gate only:**
```
catchScore = (receiver.handling + receiver.composure) / 2 + rng(1, 20)
catchScore < 30 → knock_on
else            → clean_receive
```

### Outcome summary

| Result | Possession | ballX | Next phase |
|---|---|---|---|
| `poor_kick` | flip to receiving team | 50 (halfway) | Scrum |
| `knock_on` | stays with kicking team | landing position | Scrum |
| `clean_receive` | flip to receiving team | landing position | KickReturn |
| `short_kick_retain` | stays with kicking team | landing position | KickReturn |

### Stat increments

| Outcome | Player | Stat |
|---|---|---|
| every kick-off | kicker | `kicksFromHand++` |

---

## Carry Phases (PhasePlay / FirstPhase / KickReturn)

Three phases share a common evasion/collision resolver but have distinct player selection, play-structure, and preliminary steps. Each is a separate handler in its own file, routing to the matching `MatchPhase` enum for commentary.

### Step 0 — Kick or carry decision (all three phases)

The probability of kicking rather than carrying is driven by `attackTeam.tactics.attackingGamePlan` and pitch location:
- `possession`: 50% inside own 22; 15% in own half; 0% in opposition half.
- `balanced`: 75% inside own 22; 50% in own half; 10% in opposition half.
- `kicking`: 90% inside own 22; 65% in own half; 15% in opposition half.

If it fires, the fly-half (id=10) is logged as `primaryPlayer` for commentary and the phase transitions to `TacticalKick`. The remaining steps do not run.

---

### PhasePlay

Runs after `Breakdown` (recycled possession). The carrier is a random player from the attacking team.

```typescript
carrier  = randomPlayer(attackTeam)
defender = randomPlayer(defendTeam)
```

**Step 1 — Carrier handling gate**

`handling + rng(1,100) < 85` → knock-on: possession flips, scrum awarded, carrier −0.45. This gives ~5% for handling 80, ~10% for handling 75, ~20% for handling 65, 0% for handling ≥ 85.

**Step 2 — Hard Carry / Out the Back decision**

| `attackingStyle` | Hard Carry | Out the Back |
|---|---|---|
| `keep_it_tight` | 90% | 10% |
| `balanced` | 70% | 30% |
| `wide_wide` | 50% | 50% |

If the carrier is the fly-half (id 10), **always Out the Back**.

**Hard Carry:** carrier proceeds directly to evasion (Step 3).

**Out the Back:** ball is worked through the fly half (id 10) to an outside back (random from ids 11, 13, 14, 15) via two additional handling gates (same `handling + rng(1,100) < 85` threshold). Knock-on at either gate: possession flips, scrum awarded. If both pass, `ballCarrier = outsideBack`.

**Steps 3–4 — Evasion → Collision** — see [Shared Evasion/Collision](#shared-evasioncollision) below.

---

### FirstPhase

Runs after `Scrum`, `Lineout`, or a tap-and-go penalty. The carrier is **always #10 (fly-half)**.

```typescript
carrier  = pickPlayer(attackTeam, 10)
```

**Step 1 — Carrier handling gate**

Same threshold as PhasePlay (`handling + rng(1,100) < 85` → knock-on; defender is `randomPlayer(defendTeam)` for commentary).

**Step 2 — Crash Ball / Wide Play decision**

Driven by `attackingStyle` using the same thresholds as the Hard Carry / Out the Back split:

| `attackingStyle` | Crash Ball | Wide Play |
|---|---|---|
| `keep_it_tight` | 90% | 10% |
| `balanced` | 70% | 30% |
| `wide_wide` | 50% | 50% |

**Crash Ball path** (#10 → #12):
1. `#10` passes to `insideCentre` (id 12)
2. `insideCentre` handling gate (`handling + rng(1,100) < 85`; red-clock variant: `< Math.min(99, 85 + Math.round(Math.max(0, 85 − handling) × 0.4))`) → knock-on if failed
3. `ballCarrier = insideCentre`; `defender = pickPlayer(defendTeam, 12)`

**Wide Play path** (#10 → #13 → #11 or #14):
1. `#10` passes to `outsideCentre` (id 13)
2. `outsideCentre` handling gate (same formula as above) → knock-on if failed
3. `outsideCentre` passes to `wing` (random from ids 11, 14)
4. `wing` handling gate (same formula) → knock-on if failed
5. `ballCarrier = wing`; `defender = random from defendTeam.players where id ∈ {11, 14}`

On any knock-on: possession flips, scrum awarded, dropping player −0.45. The `out_the_back` commentary intro is prepended before the knock-on line.

**Steps 3–4 — Evasion → Collision** — see [Shared Evasion/Collision](#shared-evasioncollision) below.

---

### KickReturn

Runs after `KickOff`, `BoxKick`, or `TacticalKick`. The carrier is **whoever caught the kick** in the prior phase, tracked via `state.kickReturnCarrier` (set by each kick handler before transitioning to `KickReturn`, cleared at the start of this handler). Falls back to `randomPlayer(attackTeam)` if unset.

```typescript
carrier  = state.kickReturnCarrier ?? randomPlayer(attackTeam)
defender = randomPlayer(defendTeam)   // any of the 15
```

`kickReturnCarrier` sources by prior phase:

| Prior phase | Outcome | Carrier set to |
|---|---|---|
| `KickOff` | `clean_receive` | `receiver` |
| `KickOff` | `short_kick_retain` | `chaser` |
| `BoxKick` | `attack_retain` | `winger` |
| `BoxKick` | `defend_catch_contested` | `fullback` |
| `BoxKick` | `defend_catch` | `fullback` |
| `TacticalKick` | `kick_caught` | `defender` (the fullback) |

**No carrier handling gate** — the catch was already resolved in the kick phase.

**Step 2 — Run**

The returner runs back before meeting the defensive line. Uses pace and agility against the chasers' pace and tackling:

```
runAttack = (carrier.pace + carrier.agility) / 2 + rng(1, 20)
runDefend = (defender.pace + defender.tackling) / 2 + rng(1, 20)
runMetres = runAttack >= runDefend ? rng(3, 10) : rng(0, 3)
```

`runMetres` is added to the evasion/collision gain at the end.

**Steps 3–4 — Evasion → Collision** — see [Shared Evasion/Collision](#shared-evasioncollision) below.

Total ball movement = `runMetres + res.gainMetres`.

---

### Shared Evasion/Collision

All three phases call `resolveOpenPlay(ballCarrier, defender, attackMod, defendMod + backfieldPenalty)` after completing their phase-specific steps.

**Backfield Defence front-line penalty:**

| `backfieldDefence` | `defendMod` adjustment |
|---|---|
| `one_back` | 0 |
| `two_back` | −5 |
| `three_back` | −10 |

**Step 3 — Evasion:**

```
evasionScore = (ballCarrier.agility + ballCarrier.pace) / 2 + rng(1,20) + attackMod
defenseScore = (defender.positioning + defender.pace) / 2 + rng(1,20) + (defendMod + backfieldPenalty)
```

| Margin | Result |
|---|---|
| ≥ 15 | `line_break` → Breakdown (or TryScored) |
| < 15 | Proceed to Step 4 |

**Step 4 — Collision:**

```
collisionAttack = (ballCarrier.strength + ballCarrier.pace) / 2 + rng(1,20)
collisionDefend = (defender.tackling + defender.strength) / 2 + rng(1,20)
```

| Margin | Result | Gain |
|---|---|---|
| ≥ +5 | `dominant_carry` | 3–8m |
| −4 to +4 | `play_on` | 1–4m |
| ≤ −5 | `dominant_tackle` | −2 to +1m |

All outcomes → Breakdown.

**Tackle statistics:** `tackles.attempted` is incremented for `dominant_tackle`, `dominant_carry`, `play_on`, and `line_break`. `tackles.made` is only incremented for `dominant_tackle`, `dominant_carry`, and `play_on`. Line breaks therefore count as a missed tackle, lowering the tackle % displayed in the stats panel.

### Commentary

When Out the Back (PhasePlay), Crash Ball, or Wide Play (FirstPhase) paths are taken, `out_the_back` commentary lines are prepended naming the passer and receiver. These fire at each pass in the sequence and are prepended to all downstream outcomes including knock-ons.

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| knock-on at any handling gate | dropping player | `knockOns++` |
| PhasePlay carry phase (carrier ≠ #9) | scrumHalf (#9) | `passes++` |
| FirstPhase carry phase (after scrum/lineout) | scrumHalf (#9) | `passes++` |
| Out the Back path clears outsideBack gate | flyHalf | `passes++` |
| Crash Ball path clears insideCentre gate | carrier (#10) | `passes++` |
| Wide Play path clears outsideCentre gate | carrier (#10) | `passes++` |
| Wide Play path clears wing gate | outsideCentre | `passes++` |
| all four collision outcomes | ballCarrier | `carries++`, `metresCarried += gainMetres` |
| all four collision outcomes | defender | `tacklesAttempted++` |
| `line_break` | ballCarrier | `lineBreaks++`, `defendersBeaten++` |
| `dominant_carry` | ballCarrier | `defendersBeaten++` |
| `dominant_tackle` | defender | `tacklesMade++`, `dominantTackles++` |
| `dominant_carry` or `play_on` | defender | `tacklesMade++` |

KickReturn: total metres = `runMetres + res.gainMetres` (combined into `metresCarried`).

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

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| every breakdown | all supporters | `rucksHit++` (attacking ruck involvements) |
| `turnover` | jackal | `turnoversWon++` |
| `penalty_defending` | supporters[0] | `penaltiesConceded++` |

`supporters[0]` is the first randomly selected forward and serves as the `primaryPlayer` for commentary purposes.

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
| > 15 | `attacking_dominant_penalty` → Penalty (attacking team keeps possession) |
| > 0 | `stable_win` → FirstPhase |
| −8 to 0 | `wheel` → Scrum |
| ≤ −8 | `defending_dominant_penalty` → Penalty (possession flips to defending team) |

### Ball movement

None.

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| `attacking_dominant_penalty` | attacking front row (ids 1–3), each | `scrumPenaltiesWon++` |
| `attacking_dominant_penalty` | defending front row (ids 1–3), each | `scrumPenaltiesConceded++` |
| `defending_dominant_penalty` | defending front row (ids 1–3), each | `scrumPenaltiesWon++` |
| `defending_dominant_penalty` | attacking front row (ids 1–3), each | `scrumPenaltiesConceded++` |

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

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| every lineout | hooker | `lineoutThrows++` |
| `clean_catch` | hooker | `lineoutWins++` |
| `clean_catch` | attackJumper | `lineoutCatches++` |
| `steal` | defendJumper | `lineoutSteals++` |

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

**Step 2a — Very good kick: contested catch** (ball moves 20m up the pitch)

The attacking winger races to contest the ball, relying on their handling and pace. The defending fullback relies on their handling and positioning. Both scores include a random factor, and the fullback's score is subtracted from the winger's score to determine the margin:

| Margin | Outcome | Next Phase |
|---|---|---|
| ≥ 10 | `attack_retain` — attacker wins contest clearly | OpenPlay (possession kept) |
| 0–9 | `defend_knock_on` — defender fumbles under pressure | Scrum (attacking put-in) |
| < 0 | `defend_catch_contested` — fullback claims cleanly | OpenPlay (possession flips) |

**Step 2b — Poor kick: uncontested catch** (ball moves 30m or 8m, 50-50)

Because the kick lacked hang-time or distance (or is over-hit), the fullback has time to set themselves under the ball. They rely entirely on their handling and positioning, plus a random factor, to catch the ball cleanly. A high score results in a clean catch, while a low score results in a knock-on.

| Threshold | Outcome | Next Phase |
|---|---|---|
| catchScore ≥ 35 | `defend_catch` — fullback collects | OpenPlay (possession flips) |
| catchScore < 35 | `knock_on` — fullback drops | Scrum (attacking put-in) |

### Ball movement

- Very good kick: `ballX += attackDir() × 20`
- Poor kick: `ballX += attackDir() × 30` or `× 8` (50-50, resolved in resolver)

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| every box kick | scrumHalf | `kicksFromHand++`, `kickMetres += res.distance` |

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

The kicker relies on their kicking stat and a random factor to generate a kick score (`kickScore = kicking + rng(1, 20)`). A good kick (`kickScore >= 25`) travels further (30 to 50 metres), has a 0% chance of going out on the full, and a 75% chance of bouncing into touch. A poor kick (`kickScore < 25`) is shorter (10 to 20 metres), has a 30% chance of going directly out on the full, and a 30% chance of bouncing into touch.

The ball position is clamped to 5–95 after the kick — the ball can never land within 5m of either try line.

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

### Stat increments

| Outcome | Player | Stats |
|---|---|---|
| every tactical kick | kicker | `kicksFromHand++`, `kickMetres += res.distance` |

---

## Penalty

### How a penalty arises

Penalties are generated by two phases:

- **Breakdown** `penalty_defending`: margin ≤ −15 (attacking team infringes at ruck)
- **Scrum** `attacking_dominant_penalty`: margin > 15 (attacking pack crushes defending scrum; attacker keeps possession)
- **Scrum** `defending_dominant_penalty`: margin ≤ −15 (attacking pack collapses under pressure; possession flips)

In both cases the **non-offending team** gains possession and the phase transitions to `Penalty`.

### Interactive pause decision

After `resolvePhase()` sets the phase to `Penalty`, `tick()` calls `handlePenaltyDecision()`:

```
if possession !== 'home' OR NOT inOppositionHalf():
  if clockInTheRed AND possession === 'away' AND score.away > score.home → auto-select tap_and_kick_dead
  else → auto-select kick_to_touch
if possession === 'home' AND inOppositionHalf() → emit engine:paused → await Promise<PenaltyChoice>
```

`inOppositionHalf()` returns true when `ballX > 50` for home in the first half (attacking right) or `ballX < 50` in the second half (attacking left). The modal is only shown to the human manager, who controls the home team.

The engine loop is suspended mid-tick at the `await`. It resumes when the `onChoice(choice)` callback (provided in the `engine:paused` payload) is called by `ModalManager`.

### Choice: kick_for_goal

```
tryLine        = attacking try line (100 or 0 depending on half and possession)
distFromPosts  = |ballY − 50| × 0.3 + |ballX − tryLine| × 0.2
anglePenalty   = distFromPosts × 0.3
score          = kicking + composure×0.2 − anglePenalty + rng(1,100)
success        = score ≥ 120
```

Both lateral angle (`ballY`) and distance from the try line (`ballX`) contribute to difficulty. A central kick close to the posts has `distFromPosts ≈ 0`; a wide kick from distance can push `distFromPosts` to 30+, adding ~9 points of penalty.

On success: +3 points, possession flips, ballX resets to 50, → KickOff.
On miss: no score, possession flips, ballX resets to 50, → KickOff.

Stat increments: `kicker.kicksAtGoal++`; on success `kicksMade++`; on miss `kicksMissed++`.

### Choice: kick_to_touch

The ball is moved 20 metres down the pitch towards the opposition try line.

Possession is retained. The lineout is awarded to the kicking team 20 units further up the pitch.

**Future development:** the metres gained from kicking to touch should be variable, driven by the kicker's kicking stat, composure, and pitch location.

### Choice: tap_and_go

No ball movement. Possession is retained. Resumes open play from current position.

### Choice: tap_and_kick_dead *(clock-in-the-red only)*

Available only when `clockInTheRed` is true. The attacking team taps the ball then immediately kicks it into touch, ending the period.

The phase transitions to `Lineout` without setting `penaltyKickToTouchLineout`, so `shouldEndPeriod` returns true and triggers half-time or full-time on the same tick.

Home team: shown as a 4th option in the modal when `clockInTheRed`. Away team AI: auto-selected when `clockInTheRed && score.away > score.home`.

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

### Stat increments

`scorer.matchStats.tries++`

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
score         = kicking + composure×0.2 − anglePenalty + rng(1,100)
success       = score ≥ 120
```

Only the lateral angle (`ballY`) affects difficulty for conversions — unlike the penalty kick, distance from the try line is not factored in. A central conversion has `distFromPosts = 0`; a conversion from the touchline adds up to ~6 points of penalty.

On success: +2 points.

After resolution (regardless of outcome): possession flips, ballX resets to 50, → KickOff.

### Stat increments

`kicker.matchStats.kicksAtGoal++`; on success `kicksMade++`; on miss `kicksMissed++`.

---

## Clock In The Red

When `gameMinute` reaches the half target (40 first half, 80 second half), the engine enters the **clock-in-the-red** state. The ball is still live; the half does not end immediately.

### Entering the red

`enterClockInTheRed()` is called on the tick when `!clockInTheRed && gameMinute >= halfTarget`:

```typescript
state.clockInTheRed = true
// emits GameEvent with a randomly chosen announcement line (3 variants per half)
```

From this point, clock time advances at `timeAdvance / 2` per tick — effectively crawling — so that many more phases can occur before the game ends.

The knock-on threshold in all carry phases is raised from 85 to `Math.min(99, 85 + Math.round(Math.max(0, 85 − handling) × 0.4))`, giving approximately a 40% increase in knock-on probability for players with handling below 85.

### Ending the period: `shouldEndPeriod(prevPhase)`

The period ends only when the ball goes dead. `shouldEndPeriod` returns `true` on these transitions:

| Condition | Description |
|---|---|
| `state.phase === Scrum && prevPhase !== Scrum` | Knock-on or crooked lineout throw (not a wheel reset — those have prevPhase === Scrum) |
| `state.phase === Lineout && !penaltyKickToTouchLineout` | Ball in touch (except after a penalty kick-to-touch — see exception below) |
| `state.phase === KickOff && prevPhase === ConversionKick` | Try scored and conversion taken |
| `state.phase === KickOff && prevPhase === Penalty` | Penalty goal kick attempt (success or miss) |

**Penalty kick-to-touch exception:** When the home team chooses `kick_to_touch` on a penalty during the red, `penaltyKickToTouchLineout` is set to `true`. `shouldEndPeriod` detects this, clears the flag, and returns `false` — the subsequent lineout does not end the period. This allows the attacking team to take the lineout and keep playing.

### Triggering half-time / full-time

When `wasInRed && shouldEndPeriod(previousPhase)`:
- **First half:** calls `triggerHalfTime()`, which resets `clockInTheRed = false` and `penaltyKickToTouchLineout = false` for the second half.
- **Second half:** calls `endMatch()`.

---

## Half-Time

Triggered by `triggerHalfTime()` inside `tick()` after `shouldEndPeriod()` returns true during the first-half red.

```typescript
state.halfTimeDone           = true
state.clockInTheRed          = false
state.penaltyKickToTouchLineout = false
state.possession             = flipped
state.ballX                  = 50
state.ballY                  = 50
```

A `HalfTime` event is emitted, then the phase force-transitions to `KickOff` for the second half. The possession swap at half-time combined with `halfTimeDone = true` is what reverses the output of `attackDir()`, `isTryScored()`, and `inOpposition22()` for the rest of the match.

---

## Full-Time

Triggered by `endMatch()` inside `tick()` after `shouldEndPeriod()` returns true during the second-half red.

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
| `{side}` | `event.sideName` (attacking team name) |
| `{defside}` | `event.defSideName` (defending team name), or `"the opposition"` if absent |

`defSideName` is set by `draftEvent()` in `MatchEngine` from the non-possessing team's name at the moment the event is drafted. It is declared as `defSideName?: string` on `GameEvent`. Templates that name the defending team (e.g. "The Eagles hold at the gain line") use `{defside}` rather than hardcoding.

The `playerLabel(player, fallback)` helper produces the `"Name (#N)"` format. Both `{primary}` and `{secondary}` use it. Adding a player to a template automatically picks up jersey number — no template changes needed.

### Plain-text contract

`CommentaryEngine` always returns a plain-text string. `CommentaryFeed.ts` post-processes it to:
1. Wrap all `"Name (#N)"` player mentions in team-coloured `<span>` elements (scans all 30 squad members)
2. Wrap team name strings ("The Lions", "The Eagles") in their respective team-coloured `<span>` elements

If `CommentaryEngine` ever emits HTML, the span injection will double-encode or break. Tactic notes in event handlers are plain template literals (`\`...\``) that embed `attackTeam.name` / `defendTeam.name` directly — these also go through the same CommentaryFeed colorization pass.

---

## Known Gaps

| Gap | Location | Effect |
|---|---|---|
| kicking, positioning not degraded by fatigue | StaminaSystem | These stats remain at full base value for the entire 80 minutes |
