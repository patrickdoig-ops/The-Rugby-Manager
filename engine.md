# Engine Reference

Documents the complete game engine: the simulation loop, every match phase, all resolver formulas, and known gaps. Intended as the authoritative reference for anyone modifying engine behaviour.

---

## Simulation Loop

`MatchEngine.tick()` is a self-rescheduling `async` function using `setTimeout`. It is not `setInterval` — pausing is simply not scheduling the next tick.

Each tick:
1. Advances game time by `(0.5 + rng(0, 15) / 10) * 0.5` minutes (0.25–1.0 per tick)
2. Accumulates elapsed time; calls `applyFatigue()` on both teams once the accumulator reaches 5 game minutes
3. Increments possession and territory counters
4. Calls `resolvePhase()` to produce a `GameEvent`
5. Emits `engine:event` and `engine:stateChange`
6. Checks for penalty interactive pause (if phase is `Penalty`)
7. Checks for half-time (gameMinute ≥ 40 and `halfTimeDone === false`)
8. Checks for full-time (gameMinute ≥ 80)
9. Schedules next tick at `state.tickDelayMs`

### Attack direction

Home attacks toward `ballX = 100` in the first half, toward `ballX = 0` in the second. **Teams swap ends only at half-time, never on turnovers.** All ball movement uses three helpers in `MatchEngine` that factor in `state.halfTimeDone`:

- `attackDir()` → `+1` or `-1` for the possession team's attacking direction
- `isTryScored()` → true if `ballX` has crossed the possessing team's attacking try line
- `inOpposition22()` → true if `ballX` is inside the defending team's 22m zone

Never compute ball direction or territory logic outside these helpers.

### Phase state machine

```
KickOff      → OpenPlay | Scrum
OpenPlay     → Breakdown | TacticalKick | TryScored | Penalty | Scrum | HalfTime | FullTime
Breakdown    → OpenPlay | BoxKick | Scrum | Lineout | Penalty
BoxKick      → OpenPlay | Scrum
Scrum        → OpenPlay | Penalty | Scrum
Lineout      → OpenPlay | Scrum
TacticalKick → OpenPlay | Lineout | Scrum
TryScored    → ConversionKick → KickOff
Penalty      → [modal] → KickOff | Lineout | OpenPlay
HalfTime     → KickOff
FullTime     → (terminal)
```

`StateMachine.transition()` validates against this table and throws on illegal moves. `forceTransition()` bypasses validation and is used for HalfTime, FullTime, and penalty resolution.

### Player ratings

All players start at `rating: 6.0`. `adjustRating(player, delta)` multiplies the delta by **1.5** before applying it, then clamps to [1, 10]. The raw delta values documented in each phase section are the pre-multiplier figures; the actual change applied is `delta × 1.5`. Ratings are displayed in the Player Stats panel and update once per game minute.

---

## Fatigue System

Called via `applyFatigue(team, elapsedMinutes)` approximately every 5 game minutes.

### Decay

Every cycle, a base decay rate between 0.5 and 1.5 is randomly determined, then doubled. This rate is then reduced depending on the player's stamina — higher stamina means a slower fatigue drain. A player with a stamina rating of 90 will only suffer 40% of the base decay compared to a player with a stamina rating of 0.

`actualDecay = decayRate × 8 × (1 − stamina / 150)`

Higher stamina reduces decay. A player with stamina 90 decays at 40% the rate of one with stamina 0. With the ×8 multiplier and 16 fatigue applications per 80-minute game, expected total fatigue loss at stamina 60 is ~77%, stamina 0 hits the floor well before full time, stamina 90 is ~51% — most players cross the 50% penalty tier during the match.

### Attribute penalties (applied to `currentStats` from `baseStats`)

| Fatigue threshold | Affected attributes | Multiplier |
|---|---|---|
| < 70% | pace, agility | × 0.95 |
| < 50% | pace, agility | × 0.87 |
| < 50% | handling, discipline, composure | × 0.92 |
| < 30% | pace, agility | × 0.75 |
| < 30% | handling, discipline, composure | × 0.80 |
| < 30% | tackling | × 0.85 |

**Not affected by fatigue at any threshold:** strength, breakdown, kicking, setPiece, positioning.

`baseStats` is never modified. `currentStats` is rebuilt from `baseStats` on every fatigue application.

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

### Player selection

```typescript
kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0]
receiver = randomPlayer(defendTeam)   // any of 15
chaser   = randomPlayer(attackTeam)   // any of 15
```

The fly-half (id 10) of the kicking team always takes the kick. Receiver and chaser are drawn at random from the full squads.

### Step 1 — Kick quality and distance

The kicker's kicking stat combined with a random factor determines the quality of the kick. If the result meets a good threshold, the kick travels between 25 and 40 metres down the pitch and is harder for the receiving team to catch. If the kick is poor, it travels a shorter distance (10 to 20 metres) and the receiving team gets a significant advantage when attempting to catch the ball. The ball's position is immediately moved down the pitch by the kick's distance.

The scrum (on a knock-on) is therefore placed at the landing position, not at halfway.

### Step 2 — Catch vs chase contest

The receiving player attempts to catch the ball, relying on their handling and composure, boosted by any advantage from a poor kick. Simultaneously, a chasing player from the kicking team races forward, relying on their pace and agility. Both scores include a random factor, and the chasing score is subtracted from the catching score to determine the margin:

| Margin | Result | Possession |
|---|---|---|
| > 10 | `clean_receive` → OpenPlay | Flips to receiving team |
| > −5 | `contested` → OpenPlay | Flips to receiving team (scrambles possession) |
| ≤ −5 | `knock_on` → Scrum | No change (kicking team wins scrum put-in) |

`contested` always gives the ball to the receiving team — only a `knock_on` (the receiver drops it uncontested) benefits the kicking side.

**Short kick regather (`short_kick_retain`):** When the kicking team uses `short_kick` and the result is `contested`, there is a 15% chance the kicking team regathers their own kick and retains possession. The chase player (`chaser`) is credited as `primaryPlayer` for the event. This is the only scenario where the kicking team can retain on a `contested` result.

**Tactical Strategy (`KickOffStrategy`):**
- `high_ball`: Standard deep kick (25–40m on a good kick), normal catch vs chase margin.
- `short_kick`: Shorter distance (10–18m), makes receiver's catch slightly harder on a good kick (`catchMod` −5), easier on a poor kick (`catchMod` +10). Contested result has 15% kicking-team regather.
- `grubber`: Hard low kick along ground (15–30m), inflicts −10 catch penalty on receiver to increase knock-on probability.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| knock_on | receiver | −0.25 |

---

## Open Play

### Player selection

```typescript
carrier  = randomPlayer(attackTeam)   // any of 15
defender = randomPlayer(defendTeam)   // any of 15
```

No positional weighting. All 15 players are equally likely to be drawn regardless of position.

### Step 0 — Kick or carry decision

The probability of kicking rather than carrying into contact is driven by `attackTeam.tactics.attackingGamePlan` and pitch location:
- `possession`: 10% inside own 22; 5% in own half; 0% in opposition half.
- `balanced`: 20% inside own 22; 15% in own half; 10% in opposition half.
- `kicking`: 35% inside own 22; 25% in own half; 15% in opposition half.

Checked before any player is selected. If it fires, the fly-half (id=10) is logged as `primaryPlayer` for commentary and the phase transitions to `TacticalKick`. Steps 1–3 do not run.

### Step 1 — Handling gate

The ball carrier must first successfully catch and control the ball. Their handling stat is tested with a random factor. If they fail to meet the minimum threshold, they knock the ball on, resulting in a turnover and a scrum for the defending team.

Carrier only. The defender has no influence. If it fails, possession flips and a scrum is awarded. Steps 2 and 3 do not run.

### Step 2 — Evasion vs defence

If the ball is controlled, the carrier attempts to evade the defence. The carrier's evasion score is a mix of their agility and pace, while the defender relies on their positioning and pace to track them down. Both scores include a random factor. If a `breakdownMod` was set by the preceding breakdown phase, `attackMod` is added to the evasion score and `defendMod` is added to the defence score before the margin is calculated — see the Breakdown section for values.

**Backfield Defence front-line penalty:** If the defending team has more than one player committed to the backfield (`backfieldDefence`), their front-line defence is weakened. This penalty is applied to the defend score every carry phase (not via `breakdownMod` — it is always-on because backfield players are continuously absent from the line):

| `backfieldDefence` | `defendMod` adjustment |
|---|---|
| `one_back` | 0 |
| `two_back` | −5 |
| `three_back` | −10 |

The defence score is subtracted from the evasion score to determine the margin:

| Margin | Result |
|---|---|
| ≥ 15 | `line_break` → Breakdown (or TryScored if ball crosses line) |
| < 15 | Proceed to Step 3 |

### Step 3 — Collision

If the carrier doesn't make a clean line break, a physical collision occurs. The carrier uses their strength and pace to drive forward, while the defender relies on their tackling and strength to stop them. Both collision scores include a random factor, and the defender's score is subtracted from the carrier's score to determine the margin:

| Margin | Result | Gain |
|---|---|---|
| ≥ +5 | `dominant_carry` | 3–8m |
| −4 to +4 | `play_on` | 1–4m |
| ≤ −5 | `dominant_tackle` | −2 to +1m |

All three outcomes transition to Breakdown.

### Ball movement

The ball's position on the pitch is moved forward or backwards depending on the metres gained or lost in the collision.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| knock_on | carrier | −0.30 |
| line_break | carrier | +0.25 |
| dominant_carry | carrier | +0.15 |
| dominant_tackle | defender | +0.20 |
| dominant_tackle | carrier | −0.05 |

---

## Breakdown

### Player selection

```typescript
forwardPool = attackTeam.players.filter(p => p.id <= 8)
backRow     = defendTeam.players.filter(p => p.id >= 6 && p.id <= 8)
```
Three attacking forwards are chosen at random from the full forward pool (ids 1–8). The defending jackal is chosen at random from the back row (ids 6–8); each of the three back-row players has an equal chance of attempting the steal.

**Tactical Breakdown Commitment (`AttackingBreakdown` & `DefendingBreakdown`):**
- **Attacking:** Supporter count is driven by `attackTeam.tactics.attackingBreakdown`: `pick_and_drive` commits 4 forwards; `balanced` commits 3 forwards; `wide_play` commits 2 forwards. Commitment also adds a direct ARS bonus: `pick_and_drive` +8, `balanced` 0, `wide_play` −5.
- **Defending:** Strategy is driven by `defendTeam.tactics.defendingBreakdown`:
  - `jackal`: Relies on individual back-row specialist's breakdown stat (standard turnover contest).
  - `counter_ruck`: Engages the entire defending pack (ids 1–8) using average strength and breakdown power.
  - `shadow`: Concedes ruck ball (low defensive score) to maintain a perfectly aligned defensive line.

**Next-phase carry-over (`state.breakdownMod`):** Committing more players to the ruck leaves fewer available for the next phase. After every breakdown the engine sets `state.breakdownMod.attack` and `state.breakdownMod.defend` which are consumed (and reset to zero) by the very next `OpenPlay` phase, where they are applied as modifiers to the evasion and defence scores respectively.

| Tactic | Effect on next OpenPlay |
|---|---|
| `pick_and_drive` | attack −8 evasion (forwards still arriving) |
| `balanced` | 0 |
| `wide_play` | attack +8 evasion (extra players on feet outside) |
| `counter_ruck` | defend −8 (pack committed to ruck) |
| `jackal` | 0 (one player, line intact) |
| `shadow` | defend +10 (full defensive line set) |

On turnover or penalty, `breakdownMod` is reset to `{0, 0}` immediately — possession changes reset the context. On Scrum, `breakdownMod` is also reset so stale mods from the BoxKick → Scrum → OpenPlay path don't carry through.

### Resolution

The attacking team generates an Attack Ruck Score based heavily on the breakdown and strength stats of their supporting players. They also receive a slight bonus or penalty depending on whether their average discipline is above or below 50.

The defending jackal generates a Defensive Turnover Score based heavily on their individual breakdown and strength stats, also modified slightly by their discipline.

Both scores include a random dice roll. The defensive score is subtracted from the attacking score to determine the margin:

| Margin | Result |
|---|---|
| ≥ 10 | `clean_ball` → OpenPlay |
| ≥ −8 | `slow_ball` → OpenPlay / BoxKick |
| ≥ −14 | `turnover` → OpenPlay (possession flips) |
| < −14 | `penalty_defending` → Penalty (possession flips to defending team) |

### Ball movement

None. `ballX` does not change during a breakdown.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| clean_ball | supporters[0] (randomly selected forward) | +0.10 |
| turnover | jackal | +0.30 |
| turnover | supporters[0] | −0.10 |
| penalty_defending | supporters[0] | −0.25 |

`supporters[0]` is the first of the three randomly selected forwards and serves as the `primaryPlayer` for commentary and rating purposes.

---

## Scrum

### Player selection

```typescript
attackForwards = attackTeam.players.filter(p => p.id <= 8)   // props, hooker, locks, flankers, no. 8
defendForwards = defendTeam.players.filter(p => p.id <= 8)
attackHooker   = attackTeam.players.find(p => p.id === 2)
defendHooker   = defendTeam.players.find(p => p.id === 2)
```

All eight forwards contribute to the pack score. The hooker is used only for commentary and ratings.

### Resolution

Each team calculates a pack score by averaging the set-piece and strength stats of all eight forwards. They also calculate an average discipline score for the pack.

The final score for each pack combines their pack score, a slight bonus or penalty based on their pack's average discipline, and a random dice roll. The defending pack's score is subtracted from the attacking pack's score to determine the margin:

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
| stable_win | attacking hooker | +0.10 |
| dominant_penalty | defending hooker | +0.15 |
| dominant_penalty | attacking hooker | −0.20 |

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

The hooker attempts the throw, combining their set-piece stat with a random dice roll. If the throw is extremely poor and fails to meet a minimum threshold, the lineout is considered not straight or easily stolen, and the defending team takes possession immediately without a jump contest.

If the throw fails, the defending team takes possession with no jump contest — `attackJumpScore` and `defendJumpScore` are both 0 in the returned resolution.

### Step 2 — Jump contest

If the throw is good, the designated jumpers from both teams compete in the air. Both jumpers use a combination of their set-piece stat and agility, plus a random dice roll, to generate a jump score. The defending jumper's score is subtracted from the attacking jumper's score to determine the margin:

| Margin | Result |
|---|---|
| ≥ −5 | `clean_catch` → OpenPlay |
| −15 to −6 | `scrappy_knock_on` → Scrum (possession flips) |
| < −15 | `steal` → OpenPlay (possession flips) |

The attack team has a significant advantage; a clean catch is the expected outcome unless the defending jumper is markedly superior.

### Ball movement

None.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| clean_catch | attackJumper (id 4) | +0.15 |
| scrappy_knock_on | attackJumper | −0.20 |
| steal | defendJumper | +0.30 |
| steal | attackJumper | −0.10 |

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
| attack_retain | scrum half | +0.10 |
| attack_retain | winger | +0.20 |
| attack_retain | fullback | −0.10 |
| defend_knock_on | scrum half | +0.05 |
| defend_knock_on | winger | +0.10 |
| defend_knock_on | fullback | −0.15 |
| defend_catch_contested | fullback | +0.20 |
| defend_catch_contested | winger | −0.10 |
| defend_catch | fullback | +0.10 |
| knock_on | scrum half | −0.10 |
| knock_on | fullback | −0.15 |

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
| good kick (kickScore ≥ 25) | kicker | +0.10 |
| poor kick (kickScore < 25) | kicker | −0.15 |

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

The distance from the posts and the angle of the kick (based on where the penalty was awarded) create a combined difficulty penalty.

The kicker generates a goal kick score by combining their kicking stat, a small bonus from their composure, and a random factor. The difficulty penalty is subtracted from this total. If the final score meets the minimum threshold, the kick is successful.

On success: +3 points, possession flips, ballX resets to 50, → KickOff.
On miss: no score, possession flips, ballX resets to 50, → KickOff.

Rating: success → kicker +0.20; miss → kicker −0.15.

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
| scorer | +0.50 |

---

## Conversion Kick

### Player selection

```typescript
kicker = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0]
```

Always the fly-half.

### Resolution

The distance from the posts and the angle of the kick (based on where the try was scored) create a combined difficulty penalty.

The kicker generates a goal kick score by combining their kicking stat, a small bonus from their composure, and a random factor. The difficulty penalty is subtracted from this total. If the final score meets the minimum threshold, the kick is successful.

On success: +2 points.

After resolution (regardless of outcome): possession flips, ballX resets to 50, → KickOff.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| success | kicker | +0.15 |
| miss | kicker | −0.10 |

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

---

## Known Gaps

| Gap | Location | Effect |
|---|---|---|
| strength, breakdown, kicking, setPiece, positioning not degraded by fatigue | StaminaSystem | These stats remain at full base value for the entire 80 minutes |
| Conversion kick difficulty uses angle only, not distance | ConversionKickEvent | `distFromPosts = Math.abs(ballY - 50) * 0.4` — a try scored from 60m out has the same conversion difficulty as one from 5m, if the angle is equal |
| Scrum `dominant_penalty` not counted in scrum stats | ScrumEvent | `state.stats.scrums` is only incremented on `stable_win`; a dominant penalty win is not recorded as a scrum won |
| Tackle `made` stat only incremented on `dominant_tackle` | OpenPlayEvent | `dominant_carry` and `play_on` both result in a tackle but only increment `attempted`, not `made` |
