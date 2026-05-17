# CLAUDE.md

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start Vite dev server (hot reload)
npm run build    # tsc type-check then Vite production build → dist/
npm run preview  # serve the dist/ folder locally
```

There are no tests or linters configured. TypeScript strict mode is the primary correctness check — `npm run build` must pass cleanly before every commit.

**Deploy:** Push to `main`. GitHub Actions builds and deploys to GitHub Pages automatically. The Vite base path is `/Rugby-Simulator-/` — do not change it or asset URLs break in production.

## Versioning

**After every committed update, bump the version in `src/version.ts` and push to `main`.**

The version string follows the pattern `0.XXa` (e.g. `0.01a`, `0.02a`). Increment the two-digit numeric part by 1 for each update. The version is displayed on the Home Screen; `src/version.ts` is the single source of truth.

## Maintaining engine.md

**After any change to engine code, update `engine.md` to match.**

`engine.md` is a plain-English reference for the entire game engine. It must stay in sync with the code. This includes:
- `src/engine/MatchEngine.ts` — loop, phase resolution, rating deltas, ball movement
- `src/engine/StaminaSystem.ts` — fatigue decay formula, attribute penalty tiers
- `src/engine/StateMachine.ts` — allowed phase transitions
- `src/engine/resolvers/*.ts` — all resolver formulas, thresholds, return types
- `src/engine/CommentaryEngine.ts` — commentary template keys

When updating `engine.md`, document:
1. Which players are selected (exact `find`/`filter` conditions from `MatchEngine.resolvePhase()`)
2. The resolver formula with actual numbers from the resolver file
3. All outcome thresholds
4. Ball position changes and possession swaps
5. Rating adjustments (delta values)
6. Any known gaps or approximations

Do not paraphrase — if the code changes, the doc must reflect the new code exactly.

---

## Architecture

### Engine ↔ UI contract

The single most important architectural rule: **the engine never imports from UI; UI modules never call engine methods directly** (except `SimController`, which wires the Play/Pause/Speed controls). All communication goes through the typed pub/sub singleton at `src/utils/eventBus.ts`.

Engine emits → UI subscribes:

| Event | Payload | Subscribers |
|---|---|---|
| `engine:stateChange` | `{ state: MatchState }` | Scoreboard, StatsPanel, PitchStrip |
| `engine:event` | `{ event: GameEvent }` | CommentaryFeed |
| `engine:paused` | `{ payload: ModalPayload }` | ModalManager |
| `engine:resumed` | `{}` | ModalManager |
| `engine:finished` | `{ state: MatchState }` | (available for end-screen) |

`eventBus.on()` returns an unsubscribe function. Use it for one-shot initialisation (see `PitchStrip.ts` for the self-removing listener pattern).

### Simulation loop

`MatchEngine.tick()` is a self-rescheduling `async` function using `setTimeout` — **not** `setInterval`. Pausing is simply not scheduling the next tick. Resuming calls `scheduleTick(0)`.

Time advances `0.5 + rng(0,15)/10` game minutes per tick (0.5–2.0 min). Fatigue is applied every ~5 accumulated game minutes via `fatigueAccumulator`.

The penalty interactive pause is a `Promise` that resolves when the `onChoice(choice)` callback is called from the UI payload. The loop `await`s it mid-tick; `handlePenaltyDecision()` emits `engine:paused` which triggers the modal.

### Phase flow

```
KickOff → OpenPlay → Breakdown → OpenPlay (loop)
                               → BoxKick (slow ball outside opp 22) → OpenPlay / Scrum
                   → TacticalKick (15% chance) → OpenPlay / Lineout / Scrum
                   → Scrum / Lineout → OpenPlay
                   → TryScored → ConversionKick → KickOff
                   → Penalty → [modal if in opp 22] → KickOff / Lineout / OpenPlay
OpenPlay at 40 min → HalfTime → KickOff (second half)
Any phase at 80 min → FullTime
```

`StateMachine` validates transitions; `forceTransition()` bypasses validation for HalfTime/FullTime/penalty resolution.

### Attack direction

Home attacks toward x=100 in the first half, toward x=0 in the second half. **Teams only swap ends at half-time, never on turnovers.** All `ballX` mutations must go through `attackDir()`, `isTryScored()`, and `inOpposition22()` in `MatchEngine` — these are the authoritative helpers that factor in `state.halfTimeDone`.

- Try scored: `ballX >= 95` (home attacking right) or `ballX <= 5` (home attacking left)
- In opposition 22: `ballX >= 78` / `ballX <= 22` depending on half and possession

### Resolvers

Each resolver in `src/engine/resolvers/` is a pure function (no side effects, no imports from engine). They receive player objects and return a typed result. `MatchEngine.resolvePhase()` calls them and owns all state mutations and rating adjustments.

Resolver formulas at a glance:

| Phase | Key formula | Outcome thresholds |
|---|---|---|
| **KickOff** | `kickScore = kicking + rng(1,20)` < 35 → knock_on; then `catchScore - chaseScore` | > 10 clean_receive; > -5 contested; else knock_on |
| **OpenPlay** | 3-step: handling gate → evasion → collision | handling < 30 = knock_on; evasion margin ≥ 15 = line_break; collision ±5 = dominant |
| **Breakdown** | `ARS = avgBreakdown×0.6 + avgStrength×0.4 + rng(1,20)` vs `DTS = jackalBreakdown×0.7 + jackalStrength×0.3 + rng(1,20)` | margin ≥ 10 clean_ball; ≥ 1 slow_ball; ≥ -14 turnover; else penalty_defending |
| **Scrum** | `avg(setPiece×0.6 + strength×0.4) + rng` for each front 5 | attack margin > 0 stable_win; > -15 wheel; else dominant_penalty |
| **Lineout** | `throwScore = hookerSetPiece + rng` < 40 → auto steal; then `(setPiece×0.5 + agility×0.5) + rng` each jumper | margin ≥ 5 clean_catch; ≥ 0 scrappy_knock_on; else steal |
| **BoxKick** | `kickScore = kicking + rng(1,20)` ≥ 75 → contested (wingerScore vs fullbackScore); else uncontested catch gate | contested: margin ≥ 10 attack_retain; ≥ 0 defend_knock_on; else defend_catch_contested. Uncontested: catchScore ≥ 35 defend_catch; else knock_on |
| **TacticalKick** | `kickScore = kicking + rng(1, 20)` < 25 → poor_kick | goodKick: outOnTheFull 0%, touch 75%; poorKick: outOnTheFull 30%, touch 30% → Lineout / OpenPlay |
| **GoalKick** | `kicking + composure×0.2 − anglePenalty + rng(1,20)` | ≥ 65 = success |

### Player selection per phase

| Phase | Attacker | Defender |
|---|---|---|
| KickOff | id=10 (fly-half) as kicker; random as chaser | random receiver |
| OpenPlay | `randomPlayer(attackTeam)` | `randomPlayer(defendTeam)` |
| Breakdown | 3 forwards sampled at random without replacement from `players.filter(p.id <= 8)` | 1 back-row player sampled at random from `players.filter(p.id >= 6 && p.id <= 8)` |
| BoxKick | id=9 (scrum half) as kicker; random from id=11\|14 (wingers) as chaser | id=15 (fullback) |
| Scrum | `players.filter(p => p.id <= 5)` (front 5) | same filter on defend team |
| Lineout | hooker=id 2; jumper=`find(id===4\|5\|6)` → always id 4 | `find(id===4\|5\|6)` → always id 4 |
| TacticalKick | id=10 or id=9 (fly-half/scrum-half) | id=15 (fullback) |
| ConversionKick | id=10 (fly-half) | — |
| TryScored | last event primaryPlayer (carrier) | — |

### Open Play — future development notes

- **Kick propensity:** the 15% kick-or-carry decision at the start of open play is a flat probability. It should be driven by the attacking team's tactical setting (a "kicking game" tactic raises the likelihood; a "possession game" lowers it) and by pitch location (e.g. kicking from inside your own 22 or near the touchline is unusual even for kicking teams).

### Breakdown — future development notes

- **Number of forwards deployed** should be driven by the attacking team's tactical setting (e.g. a "pick-and-drive" tactic deploys more forwards; a "wide game" tactic fewer). Currently hard-coded to 3.
- **Defensive breakdown tactics:** the number of defensive forwards deployed to a breakdown should depend on the defending team's tactical setting. The defending team should also choose between two strategies: **jackal** (attempt a turnover steal, current behaviour) and **counter ruck** (use collective forward power to drive the attackers off the ball). Currently only the jackal is modelled.
- **Box kick propensity:** the decision to box kick from slow ball, and the propensity to do so in different pitch locations, should be driven by the attacking team's tactical setting. A "kicking game" tactic should increase propensity; a "possession game" tactic should reduce or eliminate it. Kicking from very deep in your own 22 is unusual even for kicking-oriented teams, so pitch zone should also gate the trigger. Currently the box kick always triggers on slow ball outside the opposition 22.

### Player attributes — known gaps

One attribute does not currently influence in-play resolution:

- **`stamina`** — controls fatigue decay rate via `decayRate * (1 − staminaBase/150)` but never appears in a resolver formula directly

Six attributes (`strength`, `breakdown`, `kicking`, `setPiece`, `positioning` at mild fatigue; all non-listed at <30%) are **not** affected at early fatigue tiers. Full fatigue attribute degradation table:

| Attribute | <70% fatigue | <50% fatigue | <30% fatigue |
|---|---|---|---|
| pace | ×0.95 | ×0.87 | ×0.75 |
| agility | ×0.95 | ×0.87 | ×0.75 |
| handling | — | ×0.92 | ×0.80 |
| discipline | — | ×0.92 | ×0.80 |
| composure | — | ×0.92 | ×0.80 |
| tackling | — | — | ×0.85 |
| strength, breakdown, kicking, setPiece, positioning | unchanged | unchanged | unchanged |

### Player rating system

Players start each match at `rating: 6.0` (out of 10). `MatchEngine.adjustRating(player, delta)` clamps to [1, 10]. Deltas:

| Event | Player | Delta |
|---|---|---|
| Try scored | scorer | +0.5 |
| Lineout steal | defender jumper | +0.3 |
| Breakdown turnover | jackal | +0.3 |
| Goal kick success (penalty) | kicker | +0.2 |
| Dominant tackle | defender | +0.2 |
| Scrum dominant_penalty | defending hooker | +0.15 |
| Lineout clean_catch | attack jumper | +0.15 |
| Goal kick success (conversion) | kicker | +0.15 |
| Dominant carry | carrier | +0.15 |
| Line break | carrier | +0.25 |
| Scrum stable_win | hooker | +0.1 |
| Breakdown clean_ball | primary supporter | +0.1 |
| Tactical kick success | kicker | +0.1 |
| Knock-on (open play) | carrier | −0.3 |
| Lineout steal conceded | attack jumper | −0.2 |
| Tactical kick catch drop | defender | −0.2 |
| Scrum dominant_penalty conceded | attack hooker | −0.2 |
| Breakdown penalty conceded | primary supporter | −0.25 |
| Kick-off knock-on | receiver | −0.25 |
| Goal kick miss (penalty) | kicker | −0.15 |
| Tactical kick poor | kicker | −0.15 |
| Lineout scrappy_knock_on | attack jumper | −0.2 |
| Breakdown turnover conceded | primary supporter | −0.1 |
| Goal kick miss (conversion) | kicker | −0.1 |
| Dominant tackle conceded | carrier | −0.05 |

### UI module responsibilities

| Module | Sole responsibility |
|---|---|
| `Scoreboard.ts` | Team names, scores, clock, phase badge |
| `StatsPanel.ts` | Stats table (cached by HTML diff) + player stats panel (updated once per game minute) |
| `PitchStrip.ts` | Ball marker position + attack direction label |
| `CommentaryFeed.ts` | Appending commentary entries (max 30, prepend-scrolls) |
| `ModalManager.ts` | Penalty choice bottom sheet / centred dialog |
| `PreMatchScreen.ts` | Pre-match player attribute table; calls `onStart()` callback to trigger `engine.initialize()` |
| `SimController.ts` | Play / Pause buttons and speed slider — the only UI module that calls engine methods |

`AppShell.ts` injects the static HTML skeleton. All UI modules are initialised before `engine.initialize()` fires — they are purely reactive and have no internal state beyond DOM references and render caches.

### Design system

All visual decisions are governed by `DESIGN.md`. CSS custom properties are defined in `style/main.css` `:root` and must be used for every colour — no hardcoded hex except the two button exceptions (`#007a2a` Play/buy, `#b8001b` destructive/sell).

Key tokens: `--bg`, `--surface`, `--surface2`, `--border`, `--border-mid`, `--text`, `--text-sec`, `--text-muted`, `--blue`, `--green`, `--red`, `--amber`, `--purple`, `--gold`, `--font-sans` (Inter), `--font-mono` (Space Mono).

**All live numeric values** must use `font-family: var(--font-mono); font-variant-numeric: tabular-nums` to prevent digit-width jitter.

### Team data

`src/data/team-home.json` (The Lions, `#c8102e`) and `src/data/team-away.json` (The Eagles, `#003087`). Each has 15 players with 12 base stats on a 1–100 integer scale. `initPlayer()` in `MatchEngine` copies `baseStats` to `currentStats` at match start, then `StaminaSystem.applyFatigue()` mutates `currentStats` over the course of the match. `baseStats` is never modified.
