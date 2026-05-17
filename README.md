# Rugby Simulator

A browser-based, event-driven Rugby Union match simulator built with vanilla TypeScript and CSS.

The project features a decoupled architecture where a standalone simulation engine broadcasts match state and events to independent UI modules, ensuring strict separation of concerns and smooth, DOM-based visual updates without heavy frontend frameworks.

## Quick Start

```bash
npm install
npm run dev      # start Vite dev server (hot reload)
npm run build    # tsc type-check then Vite production build -> dist/
npm run preview  # serve the dist/ folder locally
```

## Documentation

The codebase is heavily documented to maintain strict architectural and design guidelines. Please refer to the following core documents before contributing or modifying the code:

- [Engine Reference (`engine.md`)](./engine.md) — The authoritative guide on the game engine, covering the simulation loop, phase state machine, resolver formulas, fatigue system, and known gaps.
- [Design Guide (`DESIGN.md`)](./DESIGN.md) — Covers the UI principles, CSS custom properties, typography, responsive layout rules, and modular UI structure.
- [Contributor Workflow (`CLAUDE.md`)](./CLAUDE.md) — Essential guidelines for AI assistants and contributors, detailing the coding philosophy, architecture constraints (Engine ↔ UI contract), and versioning instructions.

## Architecture Overview

- **Event-Driven Interface:** The engine never imports or mutates UI components directly. It publishes events via a centralized `eventBus` (e.g., `engine:stateChange`, `engine:event`), allowing isolated UI modules to update reactively.
- **Vanilla Tech Stack:** Built without React, Vue, or Tailwind. The project relies on plain HTML, modular TypeScript classes, and scoped CSS variables for robust styling.
- **Phased State Machine:** Match flow follows a rigorous state machine (e.g., `KickOff` → `OpenPlay` → `Breakdown` / `Scrums` / `Lineouts`), resolving actions by comparing player attributes mixed with RNG.