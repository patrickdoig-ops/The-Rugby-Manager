# WP 6 — The Playbook

> Spatial Engine Upgrade, work package 6 of 9. Master plan: [`Upgrade.md`](../../Upgrade.md) § 7.1 (plays as data overlays), § 7.2 (manager controls), § 9 (play editor).

| | |
|---|---|
| **Recommended model** | **Sonnet** — the overlay mechanism is fully specified (§ 7.1), plays are data, and the substrate it builds on (WP 5's layer stack) already exists; plus a meaningful share of the work is UI (playbook picker, editor mode), which is well-bounded screen work. |
| **Depends on** | WP 5 |
| **Unlocks** | WP 7+ (independent); the content pipeline for all future set moves |
| **Size** | 5–6 commits (overlay engine / play schema + initial library / selection + familiarity / play editor / match-day UI / scenarios) |

## Objective

Authored set moves as **data overlays** on the layer stack: a play temporarily assigns run lines + timing to 2–4 named roles while Layers 2–3 stay live, with abort conditions. Ship the initial ~10-move library, the Phase Animator play editor, and the manager-facing match-day playbook UI.

## Pre-read

`CLAUDE.md` (full — UI sections especially: ScreenRouter rules, Hub-tile limit, help-content sync), `Upgrade.md` §§ 7.1–7.2, 9, WP 5 landed code (layer stack, ShapeSolver, utility AI), `src/ui/PreMatchScreen.ts`, the tactics modal (`ui:tacticsChange` → `TACTICS_UPDATED` seam), `docs/phase-animator.md`, `src/ui/help/helpContent.ts`.

## Deliverables

### 1. Play schema + initial library — `src/data/playbook/`

Per `Upgrade.md` § 7.1: `{ id, trigger: { phases, channel, minSpaceWide… }, roles: { name: { line: waypoints, action: { t, do, to/target } } }, abort: [...] }`. Waypoints **relative to play origin + `attackDir`** (mirror via the existing helper — never hand-mirrored data). Role *names* bind to slots at trigger time via WP 5's selector chains. Initial library (~10): switch/scissors, loop, miss-1, miss-2 + blocker, dummy switch, crash + tip-on, back-door screen, blindside strike off scrum, midfield bust off lineout, 1-3-3-1 same-way pattern. Plays are **content**; selection weights are **tuning** in `balance/spatialDecision.ts`.

### 2. Overlay engine — `src/engine/spatial/PlayOverlay.ts`

- On trigger (`FirstPhase` strike ball; clean quick ruck ball in `PhasePlay`), bind roles → agents, install run-line targets as their Layer-1 source for the play's lifetime (~3 s of micro-ticks), schedule the `t`-offset actions (pass / dummy / receive-at-pace) through WP 5's pass mechanics.
- **Layers 2–3 stay live** — an interrupt or utility veto simply ends the agent's participation; the play degrades rather than glitches.
- **Abort conditions** evaluated per tick: turnover, projected intercept risk over threshold, target receiver covered. Abort → roles revert to ShapeSolver targets; emit nothing special (the world state *is* the record).
- One driver per agent per tick (the WP 5 channel rule): a play-bound agent's Layer 1 *is* the play; he is never simultaneously shape-driven.

### 3. Selection + defensive familiarity

Play selection inside the WP 5 carrier/playmaker utility scoring: field position, defensive picture (rush vs drift + measured fold speed), `attackingGamePlan`, playmaker `composure`/`positioning`, match-day playbook weights (below). **Familiarity penalty**: per-match counter per play id; each repeat lowers its utility and raises defender read speed slightly (constants in `balance/spatialDecision.ts`). AI sides get a default playbook derived from their authored `suggestedTactics` so every club runs moves with no data authoring required.

### 4. Play editor — Phase Animator mode (`Upgrade.md` § 9)

Author run-line waypoints + timing offsets per role on the pitch; preview mirroring (both directions/halves); set triggers + aborts; export play JSON to `src/data/playbook/`. Must round-trip the shipped library.

### 5. Match-day playbook UI (`Upgrade.md` § 7.2 tier 2)

- `PreMatchScreen`: pick ~4–6 plays into the match-day playbook, weight by channel (tight/mid/wide). Persisted with the existing pre-match flow (follow how `playerTactics` travels into `initMatchState`; the playbook rides the same path — **check whether this touches the save shape**; selections that persist only for the live match need no save change, which is the preferred v1 scope).
- Tactics modal: playbook tab over the same `ui:tacticsChange` → `TACTICS_UPDATED` seam (extend the event payload only if unavoidable; doc-sync if so).
- **Help content** (CLAUDE.md doc-sync): update the PreMatch + tactics help topics in `src/ui/help/helpContent.ts` in the same commit as the UI.

### 6. Scenarios

- **Miss-2 vs fold speed**: same play vs slow drift fold → overlap converts at high rate; vs rush defence → play dies/aborts majority.
- **Abort integrity**: covered receiver → abort fires; agents revert to shape targets within N ticks with no position discontinuity.
- **Familiarity**: same play 4× in a match → success rate declines measurably.
- **Mirroring**: identical play left↔right and first↔second half produces mirror-identical trajectories (programmatic, not visual).

## Out of scope

Power-user formation overrides (§ 7.2 tier 3 — explicitly post-v1). New plays beyond the initial library. Spatial kick execution (WP 7). Any new Hub tile (CLAUDE.md: fixed at six — the playbook lives inside existing screens).

## Gate (definition of done)

- [ ] `npm run build` + `npm run verify` green
- [ ] WP 0 bands pass (plays shift the *texture* of attack, not the totals)
- [ ] All four scenarios pass; play-abort rate across telemetry pool is credible (not ~0 %, not > ~50 %)
- [ ] Play editor round-trips the shipped library
- [ ] Frame-debugger review: a strike play off a lineout is legible — decoy draws, blindside runner hits the gap
- [ ] Help topics updated with the UI commit
- [ ] Version bump

## Doc-sync (per CLAUDE.md)

- `docs/match-engine.md`: playbook overlay section (trigger/bind/abort lifecycle, selection scoring, familiarity — final constants).
- `docs/phase-animator.md`: play-editor mode.
- `docs/DESIGN.md` § 15: PreMatch/tactics-modal flow additions.
- `Upgrade.md` § 14: mark WP 6 landed.
