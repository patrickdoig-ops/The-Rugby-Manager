# 2D Pitch Animation — Implementation Plan

Output of the June 2026 animation-logic review (session: pitch-view-animation-sync-review).
This is the handover plan for implementation sessions. Work through the packages in order;
each numbered item is **one commit** that must build clean (`npm run build` + `npm run verify`),
follow the doc-sync table in `CLAUDE.md`, and bump `src/version.ts` (src-touching commits only).

## Delivery status (updated as work lands)

| Item | Status | Notes |
|---|---|---|
| WP1.1–1.5 | ✅ done | All five glitch fixes shipped + verified. |
| WP2.1 | ✅ done | `pitchAnimConstants.ts`; maul-slide aligned to GLIDE_MS. |
| WP2.2 | ✅ done | Distance-proportional pacing over the full beat window. |
| WP2.3 | ✅ done | Roster-lead comment corrected. |
| WP3.3 | ✅ done (reframed) | The validator already existed in `parseChoreography` and runs in `verify` via import; tightened it with a slot-range check rather than adding a redundant script. |
| WP4.1 | ◑ partial | Shared `swapPairedSlot` helper extracted + both engine sites refactored. The fuller transform unification (`flipPoint`/`anchorPoint` across all 5 sites) is **not** done. |
| WP4.2 | ✅ done | `placeFormation` swaps paired slots on single-axis reflection. **Skips `defenderIsAttacker` frames** (unverified parity). **NEEDS OWNER EYEBALL** on both touchlines/directions. |
| WP6.1 | ✅ done | DESIGN.md drift fixes (chaserEl, key convention). |
| **WP3.1** | ⏳ not started | Large behaviour-preserving refactor of the 390-line `applyChoreography`. Runs only in live (non-silent) mode, so `verify` can't catch a regression — do it with the dev server open and eyeball an authored crash-ball / out-the-back / wheel before+after. |
| **WP3.2** | ⏳ deferred | Needs new cross-tick engine state (the set-piece origin isn't tracked past the tick that sets `nextPhase = FirstPhase`), so it is **not** the "additive" change first assumed — it touches the mutation boundary. No current registry entry benefits (only bare keys + the separately-handled `SCRUM:wheel`). Do alongside authoring the first per-predecessor variant. |
| **WP5.1** | ✅ done | Baked tables extracted to `src/ui/pitchFormations.ts`; behaviour-neutral (silent-score golden unchanged). |
| **WP5.2** | ✅ done | Pure `transitionDirective(event, currentPhase)` → `{ snap, hold, preserveKeys }` in `pitchChoreography.ts`; `PitchPlayers.applyBeat` consumes it. Behaviour-preserving. |
| **WP5** | ◑ in progress | Between-ruck drift (owner-requested). WP5.1 (data extraction) + WP5.2 (hold directive) ✅ done; WP5.3 introduces new visible behaviour and **must be tuned live** (`DRIFT_WEIGHT`) with the owner watching — do not ship blind. |
| **WP6.2** | ⏳ not started | Probe sync assertions (teleport / carrier-contact / channel-exclusivity). Needs the headless-Chromium probe harness. |

**Recommended next session:** WP5 (drift) with the dev server running so `DRIFT_WEIGHT` can be
tuned by eye, then WP3.1 (refactor) with an authored-play before/after check. Both want a human
watching the pitch — they are not safe to land purely on `build`/`verify` green.

**Decisions already made by the project owner — do not re-litigate:**

1. **Roster lead is accepted.** The dot layer reads the live (producer run-ahead, ≤4-beat)
   `MatchState` for rosters. Do NOT build a per-beat roster snapshot. Fix the misleading
   comment only (WP2.3).
2. **Mirrored formations swap paired slots.** When `placeFormation` mirrors a baked
   `Formation` laterally, jersey pairs `11↔14`, `1↔3`, `6↔7` swap — matching the engine-side
   authored-choreography pipeline (WP4).
3. **Between-ruck formation drift is wanted** (WP5).
4. **Both animation pipelines stay.** The engine-side authored pipeline
   (`FIRST_PHASE_CHOREOGRAPHIES`) is the strategic one — the owner will author more backs
   moves in the Phase Animator — so WP3 (pipeline hardening) ranks above the UI-side
   structural cleanups.

When user feedback about a wrong-looking animation arrives mid-implementation, follow
**`docs/animation-feedback-playbook.md`** — and keep that playbook's tables updated as these
work packages change where things live (each WP lists its playbook impact).

File references below use symbol names as the anchor; line numbers are approximate as of
this plan's commit and will drift.

---

## WP1 — Glitch fixes (5 independent commits)

### 1.1 Empty `choreography` array starves the carrier follower
- **Where:** `PhaseRouter.ts` GameEvent composition (`choreography: result.choreography`);
  consumer check in `PitchView.ts` `engine:event` (`animateMovements(…, !!event.choreography)`
  vs the loop's `event.choreography.length > 0`).
- **Change:** normalise at the producer: compose `choreography` as `undefined` when the array
  is empty (also in `PenaltyHandler`-style direct GameEvent builders if any gain choreography
  later). Leave consumers as-is once the producer guarantees non-empty-or-undefined.
- **Why:** `applyChoreography` (`FirstPhaseEvent.ts`) skips slots 1–8, so a play whose
  surviving entries are all forwards yields `[]` → ball follows the authored path with no
  carrier ride (follower skipped, loop draws nothing).
- **Accept:** an authored play stripped to zero entries animates the carrier via the follower
  exactly like a procedural beat.

### 1.2 Try flash fires at raw `ballX`, not the rendered ball
- **Where:** `PitchView.ts` `engine:event` → `fireFlash(toTop(event.ballX), …)`;
  compare `displaySnapshot.ts` (`ballX` for `TryScored` = `line + dir*4`).
- **Change:** when the flash class is `flash-try` **and** `event.phase === MatchPhase.TryScored`,
  anchor the flash x on the try line + 4 (direction from
  `(event.side === 'home') !== cachedHalfTimeDone`). Conversions also carry the try phase
  class — they must keep the raw `ballX` (the kick spot), hence the phase gate.
- **Accept:** a try awarded with leniency (`ballX ≈ 95`) flashes in the in-goal where the
  ball/scorer render, not 5 units short.

### 1.3 Tackler/scorer anchor mismatch on lenient tries
- **Where:** `pitchChoreography.ts` `openPlayLayout` — the carrier branch anchors the scorer
  on the **try line** (`(fwd>0?100:0) + fwd*2.5` via `clampInGoalX`); the pinned-tackler branch
  recomputes a *different* "carrierX" from raw `ballX` (`clampInGoalX(ballX + fwd*2.5)` — note
  the sign also disagrees with the carrier's `ballX − fwd*2.5`).
- **Change:** compute the carrier `Placed` first, then derive the tackler from the **actual**
  carrier position (`carrier.x + fwd*1.3`, `carrier.y`), as `firstPhaseBacklineLayout`'s
  tackler block already does (`out.find(carrier)`).
- **Accept:** on a `TryScored` beat with `ballX = 95`, the tackler dot rests ~1.3 units behind
  the scorer, not ~6.

### 1.4 Choreographed dots double-driven by chase seam + choreography loop
- **Where:** `firstPhaseBacklineLayout` and `scrumLayout` set `dot.from = first` on
  choreographed dots → `PitchPlayers.applyBeat` pushes them to `chaseDots` → `PitchView`
  animates them in the chaseDots block **and again** in the choreography loop. The later
  animation wins only by WAAPI composite order.
- **Change:** do not set `Placed.from` on a dot that has an `event.choreography` entry (its
  keyframes already encode the start). Fix at the two layout sites.
- **Doc sync:** add the exclusivity rule to `docs/DESIGN.md` §15.7: *a dot is driven by exactly
  one of follower (`isCarrier`), chase (`from`), or an authored choreography entry.*
- **Accept:** during an authored first-phase play, each choreographed element has exactly one
  running `Animation` (verify via `el.getAnimations()` in the probe or devtools).

### 1.5 Cancel superseded per-dot animations
- **Where:** `PitchView.ts` — chaseDots block, choreography loop, scrum SH `sweepSH`,
  `animateKickDecision`'s fly-half animation. All are fire-and-forget; only the ball
  (`arcAnim`) and follower channels (`stopCarrierAnim`) cancel on supersession. A new beat
  commits a new `top/left` anchor while a stale ≤650 ms animation still applies px offsets
  computed against the old anchor → dots lurch at fast tick speeds.
- **Change:** keep a module-level `Map<HTMLElement, Animation>` in `PitchView`; a helper
  `runDotAnim(el, frames, opts)` cancels the element's previous entry, starts the new one,
  and removes the map entry `onfinish` (guarding `if (map.get(el) !== anim) return`, same
  pattern as `arcAnim`). Use it at all four sites. Cancel-all in the `engine:initialized`
  handler. Do **not** route the follower through it (PitchPlayers owns that channel and its
  `transition:none` guard).
- **Accept:** at the fastest tick speed, the probe teleport detector (WP6.3) is clean across a
  half; manually, kick-off chases interrupted by the next beat no longer flicker through
  off-path positions.

---

## WP2 — Pacing model (3 commits)

### 2.1 Presentation constants module
- **New file:** `src/ui/pitchAnimConstants.ts`. Move the inline literals:
  `CARRIER_BEHIND_BALL = 2.5` (PitchView ×3, pitchChoreography ×6+, incl. the
  `firstPhaseBacklineLayout` choreographed-carrier override), `TACKLER_AHEAD = 1.3`,
  kick-arc duration clamp `[300, 650]`, maul ball-slide clamp `[200, 400]`, leg floor `90`,
  glide `600` / snap `400` ms (PitchPlayers `scheduleGlide` callers + CSS comment pointer),
  SH sweep clamp `[300, 500]`, scrum SH infield start `9`.
- These are presentation values, NOT gameplay tuning — they do not belong in
  `src/engine/balance/` (note this in the module header so the balance rule isn't
  misapplied).
- Align the maul ball-slide duration with the Layer-3 glide (one constant) so pack and ball
  arrive together.
- **Behaviour-neutral commit** (values unchanged except the maul/glide alignment — call that
  out in the commit message).

### 2.2 Beat-window duration + distance-proportional leg pacing
- **Where:** `PitchView.ts` `animateMovements` (and the choreography loop's duplicated
  duration formula).
- **Change A (duration):** `duration = max(MOVE_MIN_MS, beatWindow)` where
  `beatWindow = stepMs * max(1, lineCount)` — the walk fills the narration window instead of
  finishing early (`legMs` capped at `stepMs`) or overrunning (90 ms floor × many legs).
  Use the same `duration` in the choreography loop (delete the duplicated `legMs` math).
- **Change B (offsets):** for **procedural** movements (no authored `t` on any keyframe),
  assign `offset_i = cumulativeDistance_i / totalDistance` over the path
  `[current, …kfs]` (guard `totalDistance === 0` → even spacing). If **any** keyframe carries
  authored `t`, keep the existing authored-offset behaviour untouched — never mix the two
  schemes in one walk (see DESIGN.md §15.7 "Authored Timelines and WAAPI Pacing").
- **Change C (followers):** the carrier and tackler frames currently use `i/N` offsets — they
  must adopt the same computed offsets (hold-at-receive uses the cumulative offset at
  `carryStartIdx`, not `carryStartIdx/N`), or they desync from the ball.
- `animateKickDecision` keeps its bespoke 0/0.5/1 pacing. Kick arcs keep their clamp.
- **Doc sync:** rewrite the pacing paragraphs in `docs/DESIGN.md` §15.7 (Layer 1 + the
  authored-pacing note).
- **Accept:** probe traces show near-constant ball speed across unequal legs of one walk; on
  a 4-line beat with a 2-leg walk the ball is still moving when the last line lands; carrier
  contact still lands on the ball's final frame.
- **Optional follow-up (separate commit, only if asked):** weight pass legs faster than carry
  legs by tagging keyframes at the `PhaseRouter` recording site with the producing event type.

### 2.3 Record the accepted roster lead
- **Where:** `PitchView.ts` comment above `cachedState` ("reads the previous beat's state…").
- **Change:** comment-only. State the truth: `cachedState` is a reference to the live
  `MatchState`; rosters can lead the narration by up to `COMMENTARY_PACING.lookaheadBeats`
  (4) beats around substitutions/cards; this is accepted by design (owner decision, matches
  the StatsPanel lead). Mirror one sentence in `docs/DESIGN.md` §15.7 "Between-beat state".

---

## WP3 — Authored-play pipeline hardening (3 commits)
*(Priority raised: the owner will author more backs moves in the Phase Animator.)*

### 3.1 Extract `applyAuthoredChoreography` from the phase handlers
- **Where:** `FirstPhaseEvent.ts` — `applyChoreography` is a ~390-line closure doing five
  jobs; `ScrumEvent.ts` `applyScrumChoreography` duplicates the transform third of it.
- **Change:** new module `src/engine/choreography/` with typed, separately reviewable
  functions: `transformEntities` (flipX/flipY + anchor dx/dy + paired-slot swap),
  `spliceBallEvents`, `truncateToOutcome` (the min-distance + tolerance scan — preserve the
  documented algorithm exactly), `extendForOffloads`, `reconcileTryY`. `FirstPhaseEvent` and
  `ScrumEvent` both consume it. Replace the `any` casts with the real `MatchEvent` union
  narrowings. **Behaviour-preserving** — verify with `npm run verify` (determinism must not
  shift; this code runs only when `!silent`, so determinism scripts won't see it — also
  eyeball an authored crash-ball/out-the-back/wheel in the dev server before and after).
- **Doc sync:** new subsection in `docs/match-engine.md` (authored choreography module);
  update the pointers in `docs/DESIGN.md` §15.7 and `docs/phase-animator.md` §9. Update the
  playbook's "engine-side pipeline" rows.

### 3.2 Predecessor-qualified registry keys
- **Where:** `balance/firstPhaseChoreography.ts` keys (`'crash_ball'`, `'out_the_back'`,
  `'kick_decision'`, `'SCRUM:wheel'`); lookup in `applyChoreography` uses bare `playType`,
  so one authored play fires off both scrum and lineout predecessors — but the animator's
  predecessor seeding bakes the *authored* predecessor's start positions into `t=0`, so the
  other predecessor gets a visible snap at play start.
- **Change:** look up `` `${prevPhase}:${playType}` `` first, fall back to the bare
  `playType` (so existing single-frame plays keep working everywhere). `prevPhase` is
  available in the handler context (the phase the set piece came from — derive from
  `state`/`ctx` the same way `firstPhaseBacklineLayout` receives `prevPhase` on the UI side;
  if the engine doesn't track it yet, thread it through `PhaseContext`). Registry comment:
  new plays should be registered predecessor-qualified (`LINEOUT:crash_ball`,
  `SCRUM:crash_ball`, …).
- **Doc sync:** `docs/DESIGN.md` §15.7 (the key-convention sentence currently overstates
  this), `docs/phase-animator.md` §9, playbook recipe R1.
- **Accept:** with both a `SCRUM:` and bare variant registered, the scrum predecessor picks
  the qualified one; lineout falls back to bare.

### 3.3 Build-time choreography validator
- **New file:** `scripts/checkChoreography.ts`, appended to the `npm run verify` chain
  (same pattern as `scripts/checkSaveSchema.ts`).
- **Checks per registry entry:** a `ball` entity exists with ≥2 keyframes; every entity's
  `t` values are within `[0,1]` and non-decreasing; every non-ball entity id parses to
  side `h|a` + slot `1–15`; `authoredAnchorX/Y` are finite. A violation today surfaces as a
  runtime WAAPI `TypeError` (unordered offsets) that silently kills a beat — fail the build
  instead.
- **Doc sync:** `CLAUDE.md` Commands section note is NOT needed (verify already covers it);
  mention the validator in `docs/phase-animator.md` §9 ("export won't load? run verify").

---

## WP4 — Shared transform + mirrored paired-slot swap (2 commits)

### 4.1 One transform module
- **Where:** the authored-frame transform exists five times with diverging conventions:
  `placeFormation` (UI), `kickOffLayout.tx`, `dropOutLayout.tx` (UI),
  `transformEntities` (engine, post-WP3.1), `applyScrumChoreography` (absorbed by WP3.1).
- **Change:** put the shared helpers in `src/engine/choreography/transform.ts`
  (engine-side so the UI can import it — engine never imports UI):
  `flipPoint`, `anchorPoint`, and `swapPairedSlot(slot)` with the pair table
  `11↔14, 1↔3, 6↔7`. `placeFormation`, `kickOffLayout`, `dropOutLayout` consume them.
  Kick-off/drop-out keep their **no-lateral-mirror** behaviour (documented, intentional) —
  they only share the x-flip helper.
- **Behaviour-neutral commit.**

### 4.2 `placeFormation` swaps paired slots on lateral mirror *(owner decision: yes)*
- **Change:** when `mirrorY` is true, look up each player's table offsets via
  `swapPairedSlot(slot)` — so the mirrored frame puts the open-side winger's *role* on the
  open side (the #14 player stands where the table's #11 entry was authored, etc.), instead
  of wingers visually crossing the field.
- **Blast radius:** every baked `Formation` (12 frames: box kick ×6, breakdown ×7 — counting
  shared — penalties ×5, tactical kick) renders differently whenever the live ball is on the
  opposite touchline from `nearTop`. **Eyeball pass required:** run the dev server / probe
  through box-kick and breakdown beats on both touchlines, both attack directions, and
  confirm front-five slots (unswapped) are unaffected.
- **Doc sync:** `docs/DESIGN.md` §15.7 `placeFormation` paragraph (the mirror description)
  + playbook recipe R7.

---

## WP5 — Between-ruck formation drift (3 commits)
*(Owner wants this. Two preparatory structural commits make it clean.)*

### 5.1 Extract baked data → `src/ui/pitchFormations.ts` ✅ DELIVERED
- Moved the baked tables out of `pitchChoreography.ts`: all `Formation` constants +
  `BOX_KICK_FORMS`, `KICKOFF_*` / `DROPOUT_*` spot tables, `CONV_ABS`, `SCRUM_ROWS`,
  `MAUL_ATK_ROWS`, the `*_BACKS` tables, `MAUL_HOOKER_DX`. Types (`FormOffsets`,
  `Formation`, `KickoffSpot`) moved with them. `pitchChoreography.ts` imports them and
  keeps router + layout logic only; `MAUL_HOOKER_DX` is re-exported so `PitchView`'s
  import path is unchanged.
- **Behaviour-neutral** (silent-score golden unchanged); doc sync done: `docs/DESIGN.md`
  §15.7 split-boundary note + playbook UI-pipeline / R2 / R4 source pointers.

### 5.2 Hold/snap directive moves into the pure choreographer ✅ DELIVERED
- **Where:** `PitchPlayers.applyBeat` owns the eight `keepX` hold flags,
  `KICK_PREDECESSORS`, the BoxKick-announce special case, and the `setpieceSHKey`
  rule — rugby knowledge its own header disclaims.
- **Change:** export a pure `transitionDirective(event, currentPhase)` from
  `pitchChoreography.ts` returning `{ hold: boolean; snap: boolean; preserveKeys: string[] }`
  (preserveKeys carries the set-piece #9 case). `applyBeat` consumes it: fade-unless-hold,
  snap-vs-glide, skip-position-update for `preserveKeys`. `PitchPlayers` ends up with zero
  phase names outside the directive call.
- **Behaviour-preserving** — the directive reproduces the current flag logic exactly
  (the empty-beat hold via `nextKeys.size > 0` stays in `applyBeat`, since it depends on
  `placed`). `KICK_PREDECESSORS` moved to `pitchChoreography.ts`; `SLOT` import dropped from
  `PitchPlayers`. The per-beat `PhasePlay` glide and the `glowsForBeat` Substitution check
  stay in `PitchPlayers` (separate concerns, not phase-transition decisions). **Doc sync
  done:** §15.7 "Dot persistence" + Layer-3 glide rule restructured around the directive;
  playbook R6 updated.

### 5.3 Drift pass
- **Goal:** during `PhasePlay`, the ~27 held dots stop being statues — the defensive line
  re-forms ball-relative, the attacking shape follows — without fighting the carrier /
  tackler / chase channels.
- **Design:**
  - `PitchPlayers` maintains `lastPositions: Map<key, {x,y}>` in **game coords**, updated
    wherever it commits a dot's top/left (use the already-computed numbers — do not parse
    style strings), entries removed when a dot fades. Passed to `choreograph` as a new
    parameter (the choreographer stays pure).
  - In `choreograph`, **only on `PhasePlay` beats**, after `openPlayLayout` returns: for each
    `lastPositions` key not already in `placed` and still on-field, append a drift entry at
    `lerp(current, target, DRIFT_WEIGHT)` — no `from`, no `isCarrier`.
  - Targets: a ball-anchored side-relative shape. Start by reusing `BREAKDOWN_CLEAN`'s
    resting offsets as the target table (it is the authored "open play around the ball"
    shape); if the owner later authors a dedicated `PHASE_PLAY_DRIFT` frame in the Phase
    Animator, swap the table. Attack side keys → `atk` table (toward the attacking
    direction), defenders → `def` with `clampDefenderX`.
  - `DRIFT_WEIGHT` (≈0.25/beat) lives in `pitchAnimConstants.ts` (presentation, not balance).
  - Animation comes for free: PhasePlay already re-arms `dot-transitioning` every beat
    (Layer 3); drifted dots glide because their committed position changed.
  - Exclusions: snap/hold phases other than PhasePlay are untouched (`TmoReview` frozen hold,
    `TryScored`, `Substitution`, kick formations all keep current behaviour).
- **Accept:** a 4+ beat PhasePlay passage shows the defensive line continuously re-forming
  goal-side of the ball and attack support drifting with play; breakdown beats still redraw
  all 30 exactly as today; the follower's `transition:none` guard still wins on the carrier;
  probe teleport detector clean.
- **Doc sync:** new "Formation drift" paragraph in §15.7 + playbook row.

---

## WP6 — Docs + probe hygiene (2 commits)

### 6.1 DESIGN.md §15.7 drift fixes (docs-only commit — no build/verify/version bump)
- Remove the stale "Lineout→FirstPhase 2-leg path … `lineoutSHTop/Left`" bullet (those
  variables no longer exist; engine `movements[]` superseded the mechanism).
- Replace the Layer-2 pipeline mention of `players.chaserEl` with the `chaseDots` seam.
- Fix the registry-key convention sentence to match WP3.2's qualified-with-fallback scheme.

### 6.2 Probe sync assertions
- **Where:** the `npm run probe` harness (headless capture, `harness/` output).
- **Add automated checks over the captured traces:**
  1. *Teleport detector:* no dot moves > X units between consecutive frames without an
     active animation/glide window (catches WP1.5-class bugs for good).
  2. *Carrier contact:* at each multi-leg walk's final frame, the carrier dot is within ε of
     `ball − fwd·CARRIER_BEHIND_BALL`.
  3. *Exclusivity:* assert per beat that no `Placed` is both `isCarrier` and `from`, and
     (post-1.4) no choreographed key carries `from` — this can run as a cheap pure scan over
     `choreograph()` outputs inside the probe page, no screenshot needed.
- Keep the probe out of `verify` (it needs Chromium + Vite); document the assertions in the
  probe section of `CLAUDE.md` Commands only if the invocation changes (it shouldn't).

---

## Sequencing summary

| Order | Package | Commits | Risk |
|---|---|---|---|
| 1 | WP1 glitch fixes | 5 | Low — each isolated |
| 2 | WP2 pacing | 3 | Medium — touches every walk; probe before/after |
| 3 | WP3 authored pipeline | 3 | Medium — behaviour-preserving extraction + additive keys |
| 4 | WP4 transform + mirror swap | 2 | Medium — visual change to mirrored frames; eyeball pass |
| 5 | WP5 drift | 3 | Highest — new behaviour; tune `DRIFT_WEIGHT` with the owner |
| 6 | WP6 docs + probe | 2 | Low |

Global regression gates for every commit: `npm run build`, `npm run verify`, and for any
commit in WP2/WP4/WP5 a probe capture eyeballed against the previous baseline.
