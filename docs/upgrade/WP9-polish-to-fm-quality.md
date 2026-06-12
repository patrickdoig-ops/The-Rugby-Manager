# WP 9 — Polish to FM-Quality

> Spatial Engine Upgrade, work package 9 of 9. Master plan: [`Upgrade.md`](../../Upgrade.md) § 13 (new spatial metrics), § 8.4 (renderer Phase B decision), § 14 (final gate).

| | |
|---|---|
| **Recommended model** | **Sonnet** — iterative, telemetry-driven tuning with a human in the loop for every watch test; individual changes are small and well-bounded. Pull in Opus for any single stubborn believability problem the debugger can isolate but Sonnet's tuning passes can't fix. |
| **Depends on** | WPs 0–8 all landed |
| **Unlocks** | release; the iOS-sequel port decision (`Upgrade.md` § 16) |
| **Size** | open-ended by nature — many small commits; timebox per cycle, not overall |

## Objective

Close the gap from "works and is in band" to "reads as a real rugby match with the sound off." Tuning, texture, instrumentation, and the Canvas Phase B decision — no new systems.

## Pre-read

`CLAUDE.md` (full), `Upgrade.md` §§ 8.4, 13–14, all landed WP docs, `docs/animation-feedback-playbook.md` (the feedback→fix discipline this WP runs on), current `telemetry/latest.md`.

## Deliverables

### 1. New spatial telemetry metrics (`Upgrade.md` § 13)

Extend `scripts/telemetry.ts` + `spatialBaselines.ts` with bands set from real Premiership data: line breaks/match (~10), defenders beaten (~25), offloads (~10), metres carried (~450/team), try-channel distribution (tight/mid/wide), play-abort rate, ruck-speed distribution (clean/slow split), kick-outcome split. These become permanent `checkSpatialBands` assertions — the engine's rugby-realism contract.

### 2. Tuning cycles (the core loop)

Repeat: **watch a match → log believability issues via the playbook triage discipline → trace each in the frame debugger to a constant or scoring weight → adjust in `balance/spatial*.ts` → re-run bands + scenarios → re-watch.** Known focus areas from the build (expect more):

- Decision-noise calibration per `composure` tier — stars look composed, journeymen look human, nobody looks random.
- Fold-speed × fatigue curve — late-game looseness should be *visible* but not absurd.
- Familiarity penalty strength — repeated plays punished, but a team's identity (favoured moves) still reads.
- Support-line timing — runners arrive *through* the gap, not after it closes.
- Chase-line spacing vs returner counter space.

Every changed constant lands with its `docs/match-engine.md` formula update in the same commit (CLAUDE.md doc-sync — the doc carries the real number).

### 3. Commentary & sound texture

Marker-timed commentary lines for spatial moments via the existing commentary stream (phrase additions: "beats three men on the outside", "the fold is slow — there's space out wide", "isolated — jackal over the ball"). Commentary stream isolation (`pickRandom`/`commentaryChance`) guarantees zero outcome impact. Sound polish on WP 8's marker hooks.

### 4. Renderer Phase B decision (`Upgrade.md` § 8.4)

A timeboxed Canvas/PixiJS spike rendering the same frame streams, then an explicit owner decision: ship DOM (if 60 fps holds on the low-end target device + Capacitor iOS shell) or schedule the Canvas swap as its own post-v1 package. The spike must not touch the frame format — that contract is frozen.

### 5. The final gate — the watch test

A neutral-observer protocol, run on 3+ full matches: with the sound off and no commentary feed visible, can a rugby-literate viewer narrate what is happening and *why* (who's winning the gain line, where the space is, why that try was scored)? Pass = the `Upgrade.md` north star is met. Record the protocol + results in this file when run.

## Out of scope

New gameplay systems of any kind. Attribute expansion (the `Upgrade.md` § 10 trigger condition is a *post-v1* data-contract decision). Weather, crowds-affecting-play, referee personality — sequel material. The Swift port itself (`Upgrade.md` § 16 — a separate project that begins from this WP's outputs).

## Gate (definition of done)

- [ ] `npm run build` + `npm run verify` green, including the expanded spatial bands
- [ ] All scenario suites green across all WPs
- [ ] Silent-fixture timing within WP 0 budget (final check — tuning must not have eroded it)
- [ ] Phase B decision recorded (in this file + `Upgrade.md` § 8.4)
- [ ] **Watch test passed and recorded** — owner sign-off
- [ ] `Upgrade.md` § 14 marked complete; § 16 (sequel port) becomes actionable

## Doc-sync (per CLAUDE.md)

- `docs/match-engine.md`: final constants throughout; new telemetry metrics documented.
- `Upgrade.md`: § 13 table extended with the shipped spatial metrics + final values; § 14 closed out.
- This file: watch-test protocol + results appended.
