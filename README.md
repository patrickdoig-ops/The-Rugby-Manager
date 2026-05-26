# Rugby Simulator

[![Deploy to GitHub Pages](https://github.com/patrickdoig-ops/Rugby-Simulator-/actions/workflows/deploy.yml/badge.svg)](https://github.com/patrickdoig-ops/Rugby-Simulator-/actions/workflows/deploy.yml)
[![Telemetry](https://github.com/patrickdoig-ops/Rugby-Simulator-/actions/workflows/telemetry.yml/badge.svg)](https://github.com/patrickdoig-ops/Rugby-Simulator-/actions/workflows/telemetry.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

A browser-based, event-driven Rugby Union match and career simulator built with vanilla TypeScript and CSS. Manage a Gallagher Premiership club through matches, seasons, transfers, training, and playoffs — all in the browser, no backend required.

**Live demo:** https://patrickdoig-ops.github.io/Rugby-Simulator-/

---

## Features

### Match engine
- **Phase-based simulation** — `KickOff` → `OpenPlay` → `Breakdown` / `Scrum` / `Lineout` / `Maul` / `Penalty` / `KickReturn` / `TryScored` / `Conversion`, etc.
- **Player-driven resolvers** — every phase compares player attributes (12 baseStats, scaled 1-99) against opponents, mixed with seeded RNG.
- **Live commentary** — descriptors emitted by the engine are rendered as colourised text by an independent UI module.
- **Tactical depth** — seven adjustable tactical dimensions (gameplan, attacking style, breakdown commitment, defensive line, backfield, offload strategy, kick decisions), changeable mid-match.
- **Cards & TMO** — yellow / red_20 / red_full sin-bin lifecycle, TMO reviews with frozen clock, team-22-rule auto-yellow.
- **AI directors** — pure, RNG-free tactical and substitution directors adapt the AI side based on score, time remaining, and player fatigue.
- **Stamina, fatigue and injuries** — per-player condition decays during a match and carries forward to the next; in-match injuries flow into the season-scope injury system.

### Career mode
- **Full 2025/26 Premiership season** — 90 fixtures across 18 rounds with real ISO dates, Autumn Nations and Six Nations breaks, semifinals and a final at Twickenham.
- **Persistent rosters** — every player carries a globally unique `rosterId`, accumulating season stats and aging year-over-year.
- **Contracts and salary cap** — £6.4M senior cap + £1.4M dispensation, marquee exclusions, hand-authored marquee per club, interactive cap pill.
- **Owner budgets** — per-club wage budgets set by prior-season performance, Newcastle Red Bull takeover at year-2, random investor takeovers from year-3+.
- **Competitive signings** — multi-round bid market with appeal-score resolution, AI clubs target their own budgets, Reg 7 cross-Premiership poaching for final-year players.
- **Mid-season free-agent signings** — interactive Hub flow with appeal-based acceptance rolls and per-player cooldowns.
- **Training** — manager-set training plans drive weekly attribute drift and condition recovery for the entire squad.
- **Playoffs** — top-4 bracket after Round 18, semifinals followed by a neutral-venue final.
- **Saves** — autosave to `localStorage`, schema-versioned with auto-migration across 18 save versions.

### Architecture
- **Strict engine ↔ UI separation** — typed pub/sub event bus, no direct DOM access from the engine, no engine method calls from the UI (except `SimController`).
- **Single mutation seam** — every match state write flows through `applyMatchEvent`, every season write through `applySeasonEvent`. Exhaustive `MatchEvent` / `SeasonEvent` discriminated unions enforce coverage at compile time.
- **Always-on invariants** — `assertInvariants` and `assertSeasonInvariants` run after every event; throw on illegal state.
- **Deterministic RNG** — four isolated mulberry32 streams (outcome / form / commentary / career) so matches and full careers are seed-reproducible.
- **Headless AI fixtures** — silent `MatchCoordinator` instances simulate every AI fixture league-wide each round, populating standings and player stats identically to the live match.

---

## Tech stack

- **TypeScript** (strict mode) — primary correctness check, no test framework.
- **Vite** — dev server and production build.
- **Vanilla HTML / CSS** — no framework dependencies; CSS custom properties for theming.
- **GitHub Pages** — hosted build, deployed automatically from `main`.

---

## Quick start

Requires Node.js 20+ and npm.

```bash
git clone https://github.com/patrickdoig-ops/Rugby-Simulator-.git
cd Rugby-Simulator-
npm install
npm run dev
```

The dev server prints a local URL (typically `http://localhost:5173/Rugby-Simulator-/`). Open it in a browser; saves persist in `localStorage`.

---

## Available scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server with hot reload. |
| `npm run build` | Type-check (`tsc`) and produce a production build in `dist/`. |
| `npm run preview` | Serve the built `dist/` folder locally. |
| `npm run verify` | Run match and season determinism harnesses (`scripts/checkDeterminism.ts`, `scripts/checkSeasonDeterminism.ts`). Both must pass before every commit. |
| `npm run telemetry` | Generate the balance and realism report (450-fixture, 5-seed sweep) to stdout. CI also runs this on every push to `main` and commits the result to `telemetry/latest.md`. |

There is no test or lint command — TypeScript strict mode is the primary correctness check, and the determinism harnesses guard runtime behaviour.

---

## Project structure

```
.
├── docs/                          # Authoritative reference docs
│   ├── match-engine.md            # Match engine internals, phases, resolvers, formulas
│   ├── game-engine.md             # Season-scope engine, GameCoordinator, save format
│   ├── transfer-system.md         # Transfer system roadmap and open questions
│   ├── prem-fixtures-2025-26.md   # Authoritative 2025/26 fixture list
│   ├── team-data.md               # Source of truth for team JSONs
│   └── DESIGN.md                  # Visual design system, colours, typography
├── src/
│   ├── engine/                    # Match engine — pure, no UI imports
│   │   ├── MatchCoordinator.ts    # Per-match orchestrator
│   │   ├── applyMatchEvent.ts     # Sole match-state mutation seam
│   │   ├── balance/               # All gameplay tuning constants
│   │   ├── events/                # Phase handlers (read-only over state)
│   │   └── resolvers/             # Pure outcome resolvers
│   ├── game/                      # Season engine
│   │   ├── GameCoordinator.ts     # Per-career orchestrator
│   │   ├── applySeasonEvent.ts    # Sole season-state mutation seam
│   │   ├── simulateFixture.ts     # Headless AI fixture sims
│   │   └── …                      # Transfers, training, rollover, leaderboards
│   ├── ui/                        # All DOM-touching code
│   ├── data/                      # Team JSONs (10 Premiership clubs) + 2025/26 fixtures
│   ├── types/                     # Shared type definitions
│   ├── utils/                     # eventBus, rng streams, save/load
│   └── main.ts                    # App entry point
├── scripts/                       # Determinism harnesses, telemetry, audits
├── style/                         # Global CSS
├── telemetry/                     # CI-generated telemetry report (do not edit by hand)
├── .github/workflows/             # Deploy + telemetry CI
└── index.html
```

---

## Architecture overview

### Engine ↔ UI contract
The match engine never imports from UI code; UI never calls engine methods directly **except** for `SimController` (Play/Pause/Speed). All communication flows through a typed pub/sub singleton at `src/utils/eventBus.ts`. Within a tick, `engine:event` fires **before** `engine:stateChange`, so UI state caches from the prior tick are still valid when the event arrives.

The season engine emits an analogous family of `game:*` events (`game:initialized`, `game:fixtureRecorded`, `game:weekAdvanced`, `game:bracketSeeded`, `game:seasonComplete`, `game:seasonRolledOver`) for in-season screens to subscribe to.

### Mutation boundaries
- **Match state:** all writes to `MatchState`, `player.matchStats`, `player.fatiguePct`, `player.currentStats`, and `player.rating` go through `applyMatchEvent(state, event)`. Every call runs `assertInvariants` afterwards.
- **Season state:** all writes to `GameState` go through `applySeasonEvent(state, event)`. Every call runs `assertSeasonInvariants` afterwards.

Both use exhaustive discriminated unions with a `default: const _: never = event;` to catch missing branches at compile time.

### Determinism
Four isolated mulberry32 streams (outcome / form / commentary / career) ensure that:
- A match with a given seed is fully reproducible.
- A career with `(playerTeamId, rootSeed)` is fully reproducible across multiple seasons.
- Adding commentary cannot perturb match outcomes; adding transfer logic cannot perturb a match.

### Balance constants
Every gameplay tuning number — probabilities, thresholds, modifiers, fatigue multipliers, rating point values — lives in `src/engine/balance/`. One file per concern (kicking, openPlay, breakdown, scrum, lineout, fatigue, rating, tactics, discipline, …) with a barrel re-export. Resolvers never hardcode tuning literals.

---

## Documentation

The codebase is heavily documented to maintain strict architectural and design guidelines. Read these before contributing:

- **[`CLAUDE.md`](./CLAUDE.md)** — Architectural invariants, mutation-boundary rules, and ways of working. Read this first.
- **[`docs/match-engine.md`](./docs/match-engine.md)** — Match engine reference: phase state machine, resolver formulas, RNG streams, tactics effects, UI event-bus contract.
- **[`docs/game-engine.md`](./docs/game-engine.md)** — Season engine reference: `GameCoordinator`, fixtures, headless AI sims, league standings, save format.
- **[`docs/transfer-system.md`](./docs/transfer-system.md)** — Transfer system roadmap and open implementation questions.
- **[`docs/DESIGN.md`](./docs/DESIGN.md)** — Visual design system: colours, fonts, spacing, component patterns.
- **[`docs/team-data.md`](./docs/team-data.md)** — Source of truth for the 10 Premiership team JSONs. Regenerate with `node scripts/generateTeamJsons.mjs`.
- **[`docs/prem-fixtures-2025-26.md`](./docs/prem-fixtures-2025-26.md)** — Authoritative 2025/26 Premiership schedule.

---

## Deployment

The production build deploys to GitHub Pages automatically on every push to `main` via `.github/workflows/deploy.yml`. The Vite `base` path is `/Rugby-Simulator-/` — do not change it or asset URLs break in production.

A second workflow (`.github/workflows/telemetry.yml`) runs the telemetry harness on every push to `main` and commits the regenerated report to `telemetry/latest.md`.

---

## Versioning

The current version is rendered on the Home Screen and lives in `src/version.ts`. The pattern is `2.XXa` (e.g. `2.191a`); bump by 1 after every committed update.

---

## Contributing

This repository follows the conventions documented in [`CLAUDE.md`](./CLAUDE.md). A non-exhaustive summary:

- **Simplicity first** — minimum code that solves the problem, no speculative abstractions.
- **Surgical changes** — touch only what the task requires; don't refactor adjacent code.
- **Mutation boundaries** — never sneak a direct write past `applyMatchEvent` / `applySeasonEvent`.
- **Randomness boundary** — never call `Math.random()` directly; use the four streams in `src/utils/rng.ts`.
- **Balance constants** — all gameplay tuning lives in `src/engine/balance/`. Never introduce a tuning literal in a resolver.
- **Doc co-update** — when engine code changes, update the matching engine doc in the same commit.
- **Always green** — both `npm run build` and `npm run verify` must pass cleanly before every commit.

---

## License

No license file is currently present in this repository. All rights reserved by the author unless otherwise stated.
