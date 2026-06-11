# Animation Feedback Playbook

How to act on feedback that a 2D pitch animation "doesn't look right". Referenced from
`CLAUDE.md`; read this **before** touching any animation code in response to feedback.
Background model: `docs/DESIGN.md` § 15.7 (the three layers + invariants) and
`docs/phase-animator.md` (authoring tool). Planned changes that will move some of the
sources below: `docs/pitch-animation-plan.md` — **update this playbook's tables in the same
commit when a plan work-package relocates something.**

---

## 1. Intake — pin the beat down first

Animation bugs are almost always specific to *one phase + outcome + orientation*. Before
editing anything, establish (ask the user if the feedback doesn't say):

1. **Phase and outcome key** — e.g. `BoxKick / defend_catch`, `FirstPhase / crash_ball`,
   `Penalty / tap_and_go`. The commentary line usually identifies it.
2. **Predecessor phase** — Scrum vs Lineout vs open play (first-phase and maul visuals
   depend on it).
3. **Orientation** — which team attacked which end (before/after half-time), and which
   touchline the ball was near. Mirroring/flip bugs only reproduce in some orientations.
4. **Tick speed** — fast-speed-only glitches point at animation supersession/cancellation,
   not at placement data.
5. **Symptom class** — wrong *position* (placement data), wrong *motion* (animator/pacing),
   wrong *player* (actor resolution), or wrong *persistence* (dots vanishing/lingering).

Reproduce before fixing: `npm run dev` and watch a match, or `npm run probe` for a headless
capture (kill stale Vite first: `pkill -9 -f vite`; traces carry jersey number only —
cross-reference `beats[].side` + `movements[]` to identify actors).

---

## 2. Triage table — where each phase's visuals come from

Two pipelines exist (both are kept, by owner decision):

- **UI pipeline** — layouts + baked tables in `src/ui/pitchChoreography.ts`, animated by
  `PitchView.ts` / `PitchPlayers.ts`.
- **Engine pipeline** — Phase Animator JSON parsed into
  `src/engine/balance/firstPhaseChoreography.ts` (`FIRST_PHASE_CHOREOGRAPHIES`), applied by
  `applyChoreography` in `src/engine/events/FirstPhaseEvent.ts` (and
  `applyScrumChoreography` in `ScrumEvent.ts`), consumed via `GameEvent.choreography` +
  authored `t` on `GameEvent.movements`.

| Phase / outcome | Placement source | Motion driver |
|---|---|---|
| KickOff (all beats) | `kickOffLayout` + `KICKOFF_RECV/KICK` (+ `_SHORT_` variants) | chase seam (`Placed.from`) + ball kick arc |
| TacticalKick | `TACTICAL_KICK_BASE` / `_FROZEN`; catcher snapped to landing | chase seam + kick arc / touch lob |
| BoxKick announce | kicker only (+ `keepBoxKickAnnounce` hold) | static |
| BoxKick outcomes | `BOX_KICK_*` formations (anchor = kick origin `prevBall`) | chase seam + kick arc |
| DropOut22 announce / clean_receive | `DROPOUT_*` tables (ball-relative, two-beat) | chase seam + kick arc |
| DropOut22 other outcomes | `travelingKickLayout` | kick arc |
| Penalty kick_to_touch / _close / tap_and_kick_dead | `PENALTY_*` formations | touch lob (`kickFindsTouch`) |
| Penalty tap_and_go | `PENALTY_TAP_AND_GO` + carrier flagged `isCarrier` | follower rides `movements` |
| ConversionKick / Penalty at goal | `conversionLayout` (`CONV_ABS`) | kick-flight overlay (`triggerKickFlight`) |
| Scrum | `scrumLayout` + `SCRUM_ROWS` / `SCRUM_*_BACKS`; `SCRUM:wheel` authored entries override | SH sweep + choreography loop |
| Lineout | `lineoutLayout` (procedural) | ball touchline override (`cachedEventPhase`) |
| Maul | `maulLayout` + `MAUL_ATK_ROWS` (`MAUL_HOOKER_DX`) | Layer-3 glide as a bound unit — never the follower |
| FirstPhase (authored play registered) | engine pipeline (`FIRST_PHASE_CHOREOGRAPHIES`) | choreography loop + ball on authored `t` |
| FirstPhase (no authored play) | `firstPhaseBacklineLayout` on engine `movements[]` hops | follower + chase |
| Breakdown outcomes | `BREAKDOWN_*` formations (anchor = live ruck) | Layer-3 glide |
| PhasePlay / KickReturn / open play | `openPlayLayout` (involved actors only) | follower + per-beat glide |
| TryScored | `openPlayLayout` try branch (scorer anchored on the **try line**, `keepTryScored` hold) | glide |
| Substitution | `substitutionLayout` + glows | static + glow classes |
| TMO review | none (`keepTmo` frozen hold) | none |

---

## 3. Adjustment recipes

### R1 — An authored play looks wrong (first phase / scrum wheel / future backs moves)
**Re-author in the Phase Animator; never hand-tune the numbers in
`firstPhaseChoreography.ts`** (they are pasted exports — hand edits are lost on the next
re-export and drift from the tool).

1. Open the animator (`docs/phase-animator.md` § 1), load the phase, fix the keyframes.
2. Export JSON, paste into the registry entry's `parseChoreography({...})` call.
3. Key naming: predecessor-qualified `"PREVPHASE:outcome"` (e.g. `"SCRUM:crash_ball"`),
   bare key as the cross-predecessor fallback. A play authored off one predecessor will
   visibly snap at `t=0` when fired off the other — author per-predecessor variants when
   the start shapes differ.
4. Forwards (slots 1–8) are always skipped by the engine apply step — they hold the
   set-piece shape. Don't try to animate them from the JSON.
5. If the play ends short / overruns relative to the engine outcome, the **dynamic
   truncation** rules apply — read the "Dynamic Truncation of Authored Timelines" and
   "Try Y-Coordinate Alignment" paragraphs in `docs/DESIGN.md` § 15.7 before touching that
   code; the min-distance + tolerance scan is deliberate, a strict radius check regresses it.
6. Verify: `npm run verify` (includes the choreography validator once
   `scripts/checkChoreography.ts` lands — monotonic `t`, ball entity present, slots parse),
   then watch the play in the dev server **in both attack directions and from both
   touchlines** (flip/mirror bugs hide in untested orientations).

### R2 — A baked formation frame is wrong (box kick / breakdown / penalty / tactical kick)
These are `Formation` offset tables (`{ nearTop, atk, def, atkFrom?, defFrom? }`,
slot → `[dx, dy]` from the ball, canonical frame: **attacker toward +x, ball near the
`nearTop` touchline**).

1. Prefer re-authoring the frame in the Phase Animator and re-baking the offsets
   (subtract the authored ball position from each player; a small parse script over the
   export — see `docs/DESIGN.md` § 15.7 "Re-bake the offset tables"). Small nudges to a
   couple of slots may be hand-edited, but keep the canonical-frame convention.
2. `nearTop` is the authored-frame **fact** (`authoredBallY >= 50`), not a choice — getting
   it wrong reflects every dot onto the wrong touchline.
3. `defenderIsAttacker: true` is required for frames authored with the ball-winning
   defender as `atk` (turnover, not_rolling_away, offside_at_ruck) — without it the frame
   double-flips for one beat. With it, do NOT also invert the offsets.
4. From-tables (`atkFrom`/`defFrom`) list **movers only**; omitted slots rest statically.
5. Anchor matters: kick-outcome frames anchor on the **kick origin** (`prevBall`), ruck
   frames on the **live ball**. Check the dispatch site in `choreograph()` before assuming
   the table is wrong.

### R3 — Kick-off / drop-out shape or chase wrong
`KICKOFF_*` / `DROPOUT_*` spot tables (slot → `{from, to}`). Same re-author-and-paste
workflow. These deliberately have **no lateral mirror** (landing side unknown at announce —
mirroring would break announce↔kick continuity); don't add one. Kick direction derives from
team orientation, and the chaser direction from ball travel (`ballX >= 50`), never from
`event.side` — both are documented invariants.

### R4 — Procedural layout wrong (open-play fan, lineout spread, scrum pack, subs, maul backs)
Edit the geometry in the layout functions / row tables in `pitchChoreography.ts`
(`fanLateral`, `SCRUM_ROWS`, `lineSpread` 5m/15m bounds, etc.). Shared presentation
constants (carrier-behind-ball `2.5`, tackler-ahead `1.3`, `MAUL_HOOKER_DX`) are load-bearing
in **multiple files** — change them in their shared home (`src/ui/pitchAnimConstants.ts`
once it exists; until then, find every copy) or the ball and dots drift apart.

### R5 — Ball path or pace wrong
The ball path is **engine-authoritative**: `GameEvent.movements[]` is recorded in
`PhaseRouter` from actual ball-position changes. Never invent UI-side waypoints (a previous
implementation did and snapped at the breakdown — see the comment in `PitchView`'s
movements branch). Fix path problems at the emitting handler (`emitSweepHops`, kick
resolvers); fix pace problems in `PitchView.animateMovements` (durations/offsets) — and keep
the carrier/tackler follower frames on the same offset scheme as the ball or they desync.

### R6 — Dots vanish or linger across a transition
This is the persistence model: `persistedKeys` + the `keepX` holds in
`PitchPlayers.applyBeat` (moving to a pure `transitionDirective` in `pitchChoreography`
under plan WP5.2). A formation wrongly cleared on entry to a phase usually needs a hold
flag; a formation wrongly surviving needs the phase removed from a hold. Empty beats
(pure announcements) hold by design. Snap phases (`KickOff`, `HalfTime`, `FullTime`) cut
instead of glide — also by design.

### R7 — Wrong side / mirrored / double-flipped
Checklist, in order:
1. `attacksTop` derivation at the call site — `(event.side === 'home') !== halfTimeDone`,
   and remember `event.side` is the team that **started** the phase (it is the *receiver*
   on kick-off outcome beats).
2. Possession-swap outcomes: `placeFormation` flips `dir` when `sideOf(primaryPlayer)`
   differs from the possession side — unless `defenderIsAttacker` (see R2.3).
3. Lateral mirror: `mirrorY = nearTop !== (anchorY >= 50)`; mirrored frames swap paired
   slots `11↔14, 1↔3, 6↔7` (owner decision; engine pipeline already swaps via
   `flipX !== flipY`). If one pipeline swaps and the other doesn't, that's the bug.
4. The lineout ball-on-touchline override keys on **`cachedEventPhase`**, never
   `display.phase` (the snapshot is captured after the transition).

### R8 — Glitches only at fast tick speed
Almost never a data problem: look at animation lifecycle — superseded WAAPI animations not
cancelled (ball: `clearMovement`; follower: `stopCarrierAnim`; other per-dot animations:
the cancellation registry from plan WP1.5), or glide generation tokens (`scheduleGlide`).

---

## 4. Invariants — never break these while adjusting

The authoritative list lives in `CLAUDE.md` § 8 and `docs/DESIGN.md` § 15.7. The ones most
often violated by feedback-driven tweaks:

- A dot is driven by exactly one channel: `isCarrier` (follower) XOR `from` (chase) XOR an
  authored choreography entry.
- The maul never goes through `animateMovements` (its branch sits earlier on purpose).
- All animation is visual-only: commit the resting position first, animate offsets back —
  never leave a dot whose DOM rest position isn't its final position.
- Coordinates map through `pitchCoords.toTop/toLeft` and the shared clamps
  (`clampX`/`clampY`/`clampInGoalX`/`clampDefenderX`) — never copy the numbers.
- Try-line actors anchor on the line (x=0/100), not `ballX` (5 m leniency).
- Authored `t` offsets must stay in `[0,1]`, sorted; if any keyframe has `t`, the whole
  walk runs on authored offsets — don't mix with even/distance-based spacing.

## 5. Verify + ship

1. `npm run build` and `npm run verify` (every src-touching commit).
2. Watch the fixed beat in the dev server in **both directions and both touchlines**; for
   motion/timing fixes also at the fastest tick speed.
3. `npm run probe` when the fix touches choreography/motion — compare the capture against
   the previous run.
4. Doc sync per the `CLAUDE.md` table: animation-seam changes update `docs/DESIGN.md`
   § 15.7 in the same commit; if a placement source moved, update the triage table in
   **this file** too.
5. Bump `src/version.ts` (src changes only; docs-only commits skip build/verify/bump).
