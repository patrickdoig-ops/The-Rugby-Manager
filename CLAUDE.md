# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start Vite dev server (hot reload)
npm run build    # tsc type-check then Vite production build → dist/
npm run preview  # serve the dist/ folder locally
```

There are no tests or linters configured. TypeScript strict mode is the primary correctness check — `npm run build` must pass cleanly before every commit.

**Deploy:** Push to `main`. GitHub Actions builds and deploys to GitHub Pages automatically. The Vite base path is `/Rugby-Simulator-/` — do not change it or asset URLs break in production.

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

The penalty interactive pause is a `Promise` that resolves only when `resolvePlayerChoice(choice)` is called from outside. The loop `await`s it mid-tick; `handlePenaltyDecision()` emits `engine:paused` which triggers the modal.

### Phase flow

```
KickOff → OpenPlay → Breakdown → OpenPlay (loop)
                   → Scrum / Lineout → OpenPlay
                   → TacticalKick → OpenPlay / Lineout / Scrum
                   → TryScored → ConversionKick → KickOff
                   → Penalty → [modal if in opp 22] → KickOff / Lineout / OpenPlay
OpenPlay at 40 min → HalfTime → KickOff (second half)
Any phase at 80 min → FullTime
```

`StateMachine` validates transitions; `forceTransition()` bypasses validation for HalfTime/FullTime/penalty resolution.

### Attack direction

Home attacks toward x=100 in the first half, toward x=0 in the second half. **Teams only swap ends at half-time, never on turnovers.** All `ballX` mutations must go through `attackDir()`, `isTryScored()`, and `inOpposition22()` in `MatchEngine` — these are the authoritative helpers that factor in `state.halfTimeDone`.

### Resolvers

Each resolver in `src/engine/resolvers/` is a pure function (no side effects, no imports from engine). They receive player objects and return a typed result. `MatchEngine.resolvePhase()` calls them and owns all state mutations and rating adjustments.

Resolver formulas at a glance:
- **Breakdown:** `ARS = avgBreakdown×0.6 + avgStrength×0.4 + rng(1,20)` vs `DTS = jackalBreakdown×0.7 + jackalStrength×0.3 + rng(1,20)`
- **Scrum:** `packScore = avg(setPiece×0.6 + strength×0.4) + rng`
- **Lineout:** hooker `setPiece + rng` gates the throw (< 40 = steal); jumpers contest on `(setPiece×0.5 + agility×0.5) + rng`
- **OpenPlay:** three-step chain — handling gate (< 30 = knock-on) → evasion vs defence → collision
- **GoalKick:** `kicking + composure×0.2 − anglePenalty + rng ≥ 65` = success

### Player attributes — known gaps

Two attributes do not currently influence in-play resolution:

- **`discipline`** — degrades with fatigue but is never read by any resolver. It does not affect penalty rates.
- **`stamina`** — only controls fatigue decay rate, never appears in a resolver formula directly.

Six attributes (`strength`, `breakdown`, `kicking`, `setPiece`, `positioning`, `tackling` at mild fatigue) are **not** reduced by the fatigue system — they stay at base value regardless of match duration.

### Player rating system

Players start each match at `rating: 6.0` (out of 10). `MatchEngine.adjustRating(player, delta)` clamps to [1, 10]. Deltas fire inside `resolvePhase()` and `applyPenaltyChoice()` at every meaningful outcome (try: +0.5, turnover jackal: +0.3, knock-on: −0.3, etc.).

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
