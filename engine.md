# Engine Reference

Documents the complete game engine: the simulation loop, every match phase, all resolver formulas, and known gaps. Intended as the authoritative reference for anyone modifying engine behaviour.

---

## Simulation Loop

`MatchEngine.tick()` is a self-rescheduling `async` function using `setTimeout`. It is not `setInterval` — pausing is simply not scheduling the next tick.

Each tick:
1. Advances game time by `0.5 + rng(0, 15) / 10` minutes (0.5–2.0 per tick)
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
KickOff      → OpenPlay
OpenPlay     → Breakdown | TacticalKick | TryScored | Penalty | Scrum | HalfTime | FullTime
Breakdown    → OpenPlay | BoxKick | Scrum | Lineout | Penalty
BoxKick      → OpenPlay | Scrum
Scrum        → OpenPlay | Penalty
Lineout      → OpenPlay | Scrum
TacticalKick → OpenPlay | Lineout | Scrum
TryScored    → ConversionKick → KickOff
Penalty      → [modal] → KickOff | Lineout | OpenPlay
HalfTime     → KickOff
FullTime     → (terminal)
```

`StateMachine.transition()` validates against this table and throws on illegal moves. `forceTransition()` bypasses validation and is used for HalfTime, FullTime, and penalty resolution.

### Player ratings

All players start at `rating: 6.0`. `adjustRating(player, delta)` clamps to [1, 10]. Rating deltas are applied inside `resolvePhase()` and `applyPenaltyChoice()` at meaningful outcomes. Ratings are displayed in the Player Stats panel and update once per game minute.

---

## Fatigue System

Called via `applyFatigue(team, elapsedMinutes)` approximately every 5 game minutes.

### Decay

```
decayRate  = 0.5 + rng(0, 10) / 10        (0.5–1.5 per call)
actualDecay = decayRate × (1 − stamina / 150)
fatiguePct -= actualDecay
```

Higher stamina reduces decay. A player with stamina 90 decays at 40% the rate of one with stamina 0.

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

## Kick-Off

### Player selection

```typescript
kicker   = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0]
receiver = randomPlayer(defendTeam)   // any of 15
chaser   = randomPlayer(attackTeam)   // any of 15
```

The fly-half always kicks. Receiver and chaser are drawn at random from the full squad.

### Step 1 — Kick quality gate

```
kickScore = kicker.kicking + rng(1, 20)
kickScore < 35 → knock_on
```

Pass/fail. If the kick fails, the phase ends immediately — no catch contest. Possession flips, scrum awarded. Note: despite being the kicker's fault, the `receiver` receives the −0.25 rating penalty (known gap — see below).

### Step 2 — Catch vs chase contest

```
catchScore  = (receiver.handling + receiver.composure) / 2 + rng(1, 20)
chaseScore  = (chaser.pace + chaser.agility) / 2 + rng(1, 20)
margin      = catchScore − chaseScore
```

| Margin | Result |
|---|---|
| > 10 | `clean_receive` → OpenPlay |
| > −5 | `contested` → OpenPlay |
| ≤ −5 | `knock_on` → Scrum (possession flips) |

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| knock_on (either cause) | receiver | −0.25 |

### Known gap

When the kick fails the quality gate (`kickScore < 35`), the kicker is at fault but the **receiver** takes the rating penalty. This is because `primaryPlayer` is set to `receiver` before the quality check result is known, and the same rating path is used for both failure types.

---

## Open Play

### Player selection

```typescript
carrier  = randomPlayer(attackTeam)   // any of 15
defender = randomPlayer(defendTeam)   // any of 15
```

No positional weighting. All 15 players are equally likely to be drawn regardless of position.

### Step 0 — Kick or carry decision

```
rng(1, 100) ≤ 15  →  TacticalKick (phase exits immediately, no carrier selected)
```

Checked before any player is selected. If it fires, the fly-half (id=10) is logged as `primaryPlayer` for commentary and the phase transitions to `TacticalKick`. Steps 1–3 do not run.

**Future development:** propensity to kick should be driven by the attacking team's tactical setting (a "kicking game" tactic raises the threshold; a "possession game" lowers it) and by pitch location (e.g. kicking from inside your own 22 is unusual even for kicking teams).

### Step 1 — Handling gate

```
handlingScore = carrier.handling + rng(1, 20)
handlingScore < 30 → knock_on
```

Carrier only. The defender has no influence. If it fails, possession flips and a scrum is awarded. Steps 2 and 3 do not run.

### Step 2 — Evasion vs defence

```
evasionScore  = (carrier.agility + carrier.pace) / 2 + rng(1, 20)
defenceScore  = (defender.positioning + defender.pace) / 2 + rng(1, 20)
margin        = evasionScore − defenceScore
```

| Margin | Result |
|---|---|
| ≥ 15 | `line_break` → Breakdown (or TryScored if ball crosses line) |
| < 15 | Proceed to Step 3 |

### Step 3 — Collision

```
collisionAttack = (carrier.strength + carrier.pace) / 2 + rng(1, 20)
collisionDefend = (defender.tackling + defender.strength) / 2 + rng(1, 20)
margin          = collisionAttack − collisionDefend
```

| Margin | Result | Gain |
|---|---|---|
| ≥ +5 | `dominant_carry` | 3–8m |
| −4 to +4 | `play_on` | 1–4m |
| ≤ −5 | `dominant_tackle` | −2 to +1m |

All three outcomes transition to Breakdown.

### Ball movement

```typescript
state.ballX = clamp(state.ballX + attackDir() × gainMetres, 0, 100)
```

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
forwardPool = attackTeam.players.filter(p => p.id <= 8)   // all forwards (props, hooker, locks, flankers, no. 8)
supporters  = 3 players sampled without replacement from forwardPool using rng()
backRow     = defendTeam.players.filter(p => p.id >= 6 && p.id <= 8)   // blindside, openside, no. 8
jackal      = backRow[rng(0, backRow.length - 1)]
```

Three attacking forwards are chosen at random from the full forward pool (ids 1–8). The defending jackal is chosen at random from the back row (ids 6–8); each of the three back-row players has an equal chance of attempting the steal.

**Future development:**
- **Attacking:** the number of forwards deployed should be driven by the attacking team's tactical setting (pick-and-drive deploys more; wide game deploys fewer). The open-play ball carrier (if a forward) should be excluded from the support pool — a player cannot carry the ball into contact and simultaneously arrive as a support runner. This requires the carrier to be threaded from `OpenPlay` into `Breakdown` via `MatchState` or a phase-transition payload.
- **Defending:** the number of defensive forwards deployed should depend on the defending team's tactical setting. The defending team should also choose between **jackal** (attempt a turnover steal, current behaviour) and **counter ruck** (use collective forward power to drive the attackers off the ball). Counter ruck would require a second resolver formula comparing pack scores rather than individual breakdown stats.

### Resolution

```
ARS = avgStat(supporters, 'breakdown') × 0.6
    + avgStat(supporters, 'strength') × 0.4
    + rng(1, 20)

DTS = jackal.breakdown × 0.7
    + jackal.strength × 0.3
    + rng(1, 20)

margin = ARS − DTS
```

| Margin | Result |
|---|---|
| ≥ 10 | `clean_ball` → OpenPlay |
| 1–9 | `slow_ball` → OpenPlay |
| −14 to 0 | `turnover` → OpenPlay (possession flips) |
| ≤ −15 | `penalty_defending` → Penalty (possession keeps) |

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
attackFront5 = attackTeam.players.filter(p => p.id <= 5)   // props + locks
defendFront5 = defendTeam.players.filter(p => p.id <= 5)
primaryPlayer = attackFront5[1]   // hooker (id 2), for commentary and ratings only
```

All five forwards contribute to the pack score. Flankers and number 8 are excluded.

### Resolution

```
packScore(front5) = avg(setPiece × 0.6 + strength × 0.4) across all 5 players

attackScore = packScore(attackFront5) + rng(1, 20)
defendScore = packScore(defendFront5) + rng(1, 20)
margin      = attackScore − defendScore
```

| Margin | Result |
|---|---|
| > 0 | `stable_win` → OpenPlay |
| −15 to 0 | `wheel` → OpenPlay |
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
hooker       = pickPlayer(attackTeam, 2)         // always hooker (id 2)
attackJumper = pickPlayer(attackTeam, 4, 5, 6)   // always id 4 (Left Lock)
defendJumper = pickPlayer(defendTeam, 4, 5, 6)   // always id 4 (Left Lock)
```

`pickPlayer` uses `Array.find`, which returns the first match. Since id 4 always exists, players 5 (Right Lock) and 6 (Blindside Flanker) are **never** selected as jumpers despite appearing in the selection list.

### Step 1 — Throw quality gate

```
throwScore = hooker.setPiece + rng(1, 20)
throwScore < 40 → immediate steal (jump contest skipped)
```

If the throw fails, the defending team takes possession with no jump contest — `attackJumpScore` and `defendJumpScore` are both 0 in the returned resolution.

### Step 2 — Jump contest

```
attackJumpScore = (attackJumper.setPiece × 0.5 + attackJumper.agility × 0.5) + rng(1, 20)
defendJumpScore = (defendJumper.setPiece × 0.5 + defendJumper.agility × 0.5) + rng(1, 20)
margin          = attackJumpScore − defendJumpScore
```

| Margin | Result |
|---|---|
| ≥ 5 | `clean_catch` → OpenPlay |
| 0–4 | `scrappy_knock_on` → Scrum (possession flips) |
| < 0 | `steal` → OpenPlay (possession flips) |

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

Triggered from a `slow_ball` Breakdown result when the ball is more than 22 metres from the defending team's try line (i.e. `!inOpposition22()`). Not used when already inside the opposition 22, where other options are preferred.

### Player selection

```typescript
scrumHalf  = attackTeam.players.find(p => p.id === 9)
wingerPool = attackTeam.players.filter(p => p.id === 11 || p.id === 14)   // left and right wings
winger     = wingerPool[rng(0, wingerPool.length - 1)]   // random winger
fullback   = defendTeam.players.find(p => p.id === 15)
```

The scrum half always takes the kick. One attacking winger is selected at random to contest the aerial ball. The defending fullback always receives.

**Future development:** the decision to box kick from slow ball — and the propensity to do so in different pitch locations — should be driven by the attacking team's tactical setting. A "kicking game" tactic should increase propensity; a "possession game" tactic should reduce or eliminate it. Kicking from very deep in your own 22 is unusual even for kicking-oriented teams, so pitch zone should also gate the trigger.

### Resolution

**Step 1 — Kick quality gate**

```
kickScore = scrumHalf.kicking + rng(1, 20)
```

| Threshold | Quality |
|---|---|
| kickScore ≥ 75 | very_good → contested catch |
| kickScore < 75 | poor → uncontested catch |

**Step 2a — Very good kick: contested catch** (ball moves 15m up the pitch)

```
wingerScore   = (winger.handling + winger.pace) / 2 + rng(1, 20)
fullbackScore = (fullback.handling + fullback.positioning) / 2 + rng(1, 20)
contestMargin = wingerScore − fullbackScore
```

| Margin | Outcome | Next Phase |
|---|---|---|
| ≥ 10 | `attack_retain` — attacker wins contest clearly | OpenPlay (possession kept) |
| 0–9 | `defend_knock_on` — defender fumbles under pressure | Scrum (attacking put-in) |
| < 0 | `defend_catch_contested` — fullback claims cleanly | OpenPlay (possession flips) |

**Step 2b — Poor kick: uncontested catch** (ball moves 8m up the pitch)

```
catchScore = (fullback.handling + fullback.positioning) / 2 + rng(1, 20)
```

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

Triggered either by a direct phase transition or by the 15% random chance at the end of any OpenPlay resolution.

### Player selection

```typescript
kicker   = attackTeam.players.find(p => p.id === 10 || p.id === 9) ?? attackTeam.players[0]
defender = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam)
```

Fly-half kicks first, scrum-half if fly-half is unavailable. The fullback always receives.

### Step 1 — Kick quality gate

```
kickScore = kicker.kicking + rng(1, 20)
kickScore < 25 → poor_kick → OpenPlay (no possession change)
```

A poor kick returns the ball to open play without changing possession or moving the ball.

### Step 2 — Catch quality gate

```
catchScore    = (defender.handling + defender.positioning) / 2 + rng(1, 20)
ballMovement  = round((kickScore − 50) / 5)

catchScore < 30 → knock_on_catch → Scrum (kicking team retains put-in)
```

### Step 3 — Good kick outcome

```
goesToTouch = rng(1, 100) ≤ 60   (60% chance)

if goesToTouch:
    possession flips
    ballX += attackDir() × |ballMovement| × 2
    → Lineout

else:
    → OpenPlay
```

`ballMovement` from a kick with score 70 = 4 units, × 2 = 8 units forward. Score 90 = 8 units, × 2 = 16 units forward.

### Rating adjustments

| Outcome | Player | Delta |
|---|---|---|
| poor_kick | kicker | −0.15 |
| knock_on_catch | defender | −0.20 |
| good_kick | kicker | +0.10 |

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
if NOT inOpposition22() → auto-select kick_to_touch (no modal shown)
if inOpposition22()     → emit engine:paused → await Promise<PenaltyChoice>
```

The engine loop is suspended mid-tick at the `await`. It resumes only when `resolvePlayerChoice(choice)` is called from `SimController` (wired to the modal's choice buttons).

### Choice: kick_for_goal

```
tryLine        = possession team's attacking try line (accounts for halfTimeDone)
distFromPosts  = |ballY − 50| × 0.3 + |ballX − tryLine| × 0.2
anglePenalty   = distFromPosts × 0.3

goalKickScore  = kicker.kicking + kicker.composure × 0.2 − anglePenalty + rng(1, 20)
success        = goalKickScore ≥ 65
```

On success: +3 points, possession flips, ballX resets to 50, → KickOff.
On miss: no score, possession flips, ballX resets to 50, → KickOff.

Rating: success → kicker +0.20; miss → kicker −0.15.

### Choice: kick_to_touch

```
ballX += attackDir() × 10
→ Lineout
```

Possession is retained. The lineout is awarded to the kicking team 10 units further up the pitch.

### Choice: tap_and_go

```
→ OpenPlay
```

No ball movement. Possession is retained. Resumes open play from current position.

---

## Try Scored

### How a try arises

`TryScored` is set inside the `OpenPlay` handler when a `line_break` result causes `isTryScored()` to return true — i.e. the ball has crossed the attacking try line after `gainMetres` are applied.

### Resolution

```typescript
scorer = randomPlayer(attackTeam)   // any of 15
```

The scorer is selected at random from the full squad — no weighting toward the carrier who actually made the line break.

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

```
distFromPosts = |ballY − 50| × 0.4
anglePenalty  = distFromPosts × 0.3

goalKickScore = kicker.kicking + kicker.composure × 0.2 − anglePenalty + rng(1, 20)
success       = goalKickScore ≥ 65
```

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

## Known Gaps

| Gap | Location | Effect |
|---|---|---|
| `discipline` not read by any resolver | StaminaSystem only | Penalty rate is identical for all players regardless of discipline stat |
| Knock-on from poor kick-off penalises receiver, not kicker | `MatchEngine` KickOff case | Kicker fault misattributed in ratings |
| Ball carrier not excluded from breakdown support pool | `MatchEngine` Breakdown case | A forward who carried the ball into contact can be randomly re-selected as a support runner on the same breakdown |
| `pickPlayer(team, 4, 5, 6)` always returns id 4 | `MatchEngine` Lineout case | Right Lock and Blindside Flanker never jump at lineout |
| Try scorer is `randomPlayer()` | `MatchEngine` TryScored case | Props are as likely to be credited as wings; the carrier who made the line break is not linked to the try |
| strength, breakdown, kicking, setPiece, positioning not degraded by fatigue | StaminaSystem | These stats remain at full base value for the entire 80 minutes |
