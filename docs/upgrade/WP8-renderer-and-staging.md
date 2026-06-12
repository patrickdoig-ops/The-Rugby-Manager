# WP 8 — Renderer Integration + Set-Piece Staging

> Spatial Engine Upgrade, work package 8 of 9. Master plan: [`Upgrade.md`](../../Upgrade.md) § 8 (animation pipeline), § 4.2–4.3 (staging), § 9 (choreography mode for staging layouts).

| | |
|---|---|
| **Recommended model** | **Opus** — this WP touches the most fragile, invariant-dense area of the codebase (the animation layer — see `docs/animation-feedback-playbook.md`'s existence as evidence) and integrates across engine, event bus, and three UI modules. The one-driver-per-beat migration must coexist with legacy channels beat-by-beat without dots being fought over. |
| **Depends on** | WPs 5 + 7 (frames worth rendering exist for all open play); WP 6 useful but not required |
| **Unlocks** | WP 9 |
| **Size** | 5–7 commits (playFrames driver / markers / set-piece staging / ceremony staging / transition hardening / probe verification) |

## Objective

The spatial engine becomes what the user actually sees: `PitchView` gains the `playFrames` driver (all 31 actors from the frame stream for spatial beats), `FrameMarker`s sync sound/commentary to in-beat moments, and every statistical/staged phase gets its authored formation staging — so set piece → strike play → open play reads as one continuous motion.

## Pre-read

**Mandatory, in order**: `docs/DESIGN.md` § 15.7 (every invariant), `docs/animation-feedback-playbook.md` (triage discipline), `CLAUDE.md` § 9 (animation model), `Upgrade.md` §§ 4.2–4.3, 8–9. Then: `src/ui/PitchView.ts`, `src/ui/PitchPlayers.ts`, `src/ui/pitchChoreography.ts`, `src/engine/displaySnapshot.ts` (presenter pacing), `src/engine/choreography/`, `public/tools/phase-animator.html` choreography pipeline.

## Deliverables

### 1. `playFrames` driver — `PitchView.ts` (`Upgrade.md` § 8.2)

- For beats whose `GameEvent` carries `frames`: **one driver moves everything** — interpolate all 30 dots + ball through the captured micro-tick positions at the presenter's pacing, eased to 60 fps. The existing three-channel model (`isCarrier` follower XOR `from` XOR authored choreography) remains **untouched for staged/legacy beats**.
- **Channel exclusivity per beat** (the § 15.7 rule, generalised): a beat is either frames-driven (all dots) or channel-driven (per-dot) — never mixed within a beat. Enforce structurally: if `event.frames` exists, the per-dot channel paths are skipped entirely (mirror how `skipFollower` already short-circuits `animateMovements` for authored choreography).
- **Resting-state invariant**: commit final positions via `restAt()` before animating (anchor-and-offset, exactly the existing WAAPI pattern) so cancellation lands every dot at the final frame — which, by the continuity rule (`Upgrade.md` § 3), equals the next beat's first frame. **No teleports at beat seams is the gate.**
- Ball height scalar (WP 7) renders as scale/shadow on the existing ball element — visual only.

### 2. Markers (`Upgrade.md` § 8.3)

`FrameMarker`s (`tackle`/`offload`/`break`/`take`) fire UI effects at the interpolated moment they occur mid-beat: `SoundManager` hooks (thud, crowd swell) + commentary timing offsets. Markers derive from the `MatchEvent`s already crossing the seam — **no new truth**, no new bus event types unless unavoidable (doc-sync the UI-events table if so).

### 3. Set-piece staging (`Upgrade.md` § 4.2) — via choreography mode

Authored staging layouts for `Scrum`, `Lineout`, `Maul` (assembly formations, backline alignment for both sides) feeding the World rebuild on spatial re-entry (WP 4's `ensureWorld` placeholder formations are replaced by these). Outcome expression: dominant scrum nudges the bound pack 2–3 m, `wheel` rotates, won maul advances by resolved margin, lineout steal snaps the receive pod across. The contest formulas remain untouched — this is *presentation + World seeding only*. Author in the Phase Animator choreography mode; export via the existing pipeline (`npm run export:phases`).

### 4. Ceremony staging (`Upgrade.md` § 4.3)

`Penalty` (the real 10 m retreat walk — defenders physically move, so tap-and-go's emergent advantage works), `KickAtGoal`/`ConversionKick` (kicker routine, teams posted, flight arc), `TryScored` (grounding per existing in-goal rules — try scorer anchors **on** the line per § 15.7, display grounds at line+4; celebration cluster; retreat), `TmoReview` (huddles over the existing 3-tick narrative), `Substitution` (jog off/on). Respect every existing `keepX` flag semantics; extend the flag set only if a new transition needs a fade-hold (doc-sync § 15.7 if so).

### 5. Transition hardening + probe verification

The full transition matrix (spatial→staged, staged→spatial, spatial→spatial, snap phases) verified with `npm run probe`: dot traces must match the frame streams; no dot driven by two animators in any beat; `cachedEventPhase` semantics preserved for the lineout override. Add a probe assertion comparing rendered trace ↔ frames for a spatial beat.

## Out of scope

Canvas/WebGL (Phase B — a WP 9 *decision*, not this WP's work). New visual flourish beyond markers. Any contest-logic change of any kind (zero `MatchEvent`-producing code changes in this WP — presentation + World seeding only; telemetry must be **byte-identical**).

## Gate (definition of done)

- [ ] `npm run build` + `npm run verify` green; **telemetry byte-identical** (no engine-outcome change)
- [ ] `npm run probe`: traces match frames on spatial beats; no channel conflicts; staged beats unregressed (existing animations still correct)
- [ ] Watch test: scrum → strike play → 5 phases → try → conversion plays as one continuous, legible motion — owner sign-off
- [ ] Markers fire sound/commentary at the right interpolated moments
- [ ] Cancellation safety: skipping any beat mid-animation lands all dots exactly at next-beat start positions
- [ ] Version bump

## Doc-sync (per CLAUDE.md)

- `docs/DESIGN.md` § 15.7: the frames-driven beat model — new seam description, the generalised channel-exclusivity rule, height-scalar rendering, marker timing.
- `docs/animation-feedback-playbook.md`: triage table gains the frames-driven placement source (where positions now come from per beat family).
- `docs/match-engine.md`: UI Event Bus Contract table if any payload/event changed.
- `docs/phase-animator.md`: staging-layout authoring workflow.
- `Upgrade.md` § 14: mark WP 8 landed.
