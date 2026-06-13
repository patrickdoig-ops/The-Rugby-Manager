# Phase Animator — user guide

> A developer tool for visually authoring 2D-pitch animations by drag-and-drop +
> keyframes, instead of hand-coding choreography in `src/ui/pitchChoreography.ts`.
> It lets you place **all 15 + 15 players** (not just the involved ones) and keyframe
> them against the engine's real ball path for any phase.
>
> Tool: `public/tools/phase-animator.html` · Generator: `scripts/exportPhases.ts`
> · Integration recipe: `docs/phase-animator.md` § 9 + `docs/DESIGN.md` § 15.7

---

## 1. Opening it

| Where | How |
|---|---|
| **On any device (recommended)** | <https://patrickdoig-ops.github.io/The-Rugby-Manager/tools/phase-animator.html> (ships in the Pages build). |
| **Locally** | `npm run dev`, then open `http://127.0.0.1:5173/The-Rugby-Manager/tools/phase-animator.html`. A bare `file://` double-click *may* leave the phase dropdown empty in strict browsers (the `phases.js` sibling script gets blocked) — use the dev server or the live URL. |

If you ever get a **404 right after a deploy**, it's a cached miss — add `?v=2` to the
URL or hard-refresh.

---

## 2. The layout

```
┌──────────────┬──────────────────────────────────────┐
│  SIDEBAR     │   PITCH (portrait)                   │
│  - phase     │   x = long axis (100 = top)          │
│  - selected  │   y = lateral (0/100 = touchlines)   │
│  - export    │   [POSS BADGE]                       │
│              │   15 home + 15 away + ball            │
├──────────────┴──────────────────────────────────────┤
│  TIMELINE  ▶ play · speed · playhead · bar          │
└─────────────────────────────────────────────────────┘
```

- **Pitch** — portrait top-down, the same coordinate space as the game (`x` runs up
  the screen, `100` at the top; `y` is lateral, `0`/`100` are the touchlines). The
  fixed end-labels read **AWAY 22** (top) and **HOME 22** (bottom) to orient you.
  Maroon dots = home, blue = away, orange = ball. The **try lines are at x=0 and
  x=100** (the solid end lines); the faintly-shaded band beyond each is the **in-goal**.
  You can drag a dot **behind a try line** into the in-goal — x goes slightly past
  100 (top) or below 0 (bottom), capped at [-6, 106]. The game renders these the same
  way (its `toTop` extrapolates), used e.g. for the conversion's defending line standing
  behind their try line. `y` stays on-field (0–100).
- **Possession badge** — a coloured pill that floats near the top or bottom of the
  pitch when a phase is loaded. It names the team in possession and which direction
  they're attacking (▲ = toward the top / AWAY end; ▼ = toward the bottom / HOME end).
  This flips naturally after half-time and for possession-swap outcomes.
- **Sidebar** — phase picker, the selected entity's keyframe controls, and export/import.
- **Timeline** — playback transport plus the scrub bar. **Ticks** are the phase's
  beats; **diamonds** are the *selected* entity's keyframes.

---

## 3. Core concepts

- **Entity** — each of the 30 players and the ball. Every entity owns a list of
  **keyframes** `{ t, x, y }`, where `t` is normalised time `0..1` across the phase.
- **Tweening** — during playback each entity is linearly interpolated between its
  keyframes. Before its first keyframe it holds the first position; after its last,
  the last.
- **The ball is authoritative.** When you load a phase, only the **ball** is
  pre-seeded — with the engine's real path (*previous-phase ball position → each
  in-phase movement → resolution*). You author the players **around** that path.
- **`t = 0` is an anchor.** Every entity always keeps a keyframe at `t = 0` (its start
  position); it can't be deleted.
- **Players are pre-placed at the game's live choreography.** Loading a phase seeds
  every on-field player from the same layout the game would draw — the real
  `choreograph()` output captured at export time. You start from a realistic formation,
  not a blank slate.
- **Predecessor seeding eliminates teleport between phases.** If the loaded phase
  has a predecessor (most do), each player's `t = 0` position is set to where they
  *ended up* in the previous phase. A player who doesn't move between phases gets
  a single static keyframe; one who moves gets `t = 0` at the predecessor's resting
  spot and `t = 1` at the current phase's resting spot, so the transition is a smooth
  glide rather than a jump.

---

## 4. The phase dropdown

The dropdown is populated from `public/tools/phases.js` — real engine samples
covering 14 phase types (BOX_KICK, BREAKDOWN, CONVERSION_KICK, DROP_OUT_22,
FIRST_PHASE, KICK_OFF, KICK_RETURN, LINEOUT, MAUL, PENALTY, PHASE_PLAY, SCRUM,
TACTICAL_KICK, TRY_SCORED).

### Mode toggle — Single phases / Transitions / Frame debugger

A segmented toggle above the dropdown switches what's listed:

- **Single phases** (default) — one entry per distinct `(phase, outcome)`, ~120 in
  total. Each is authored on its own; loading one places every player at that phase's
  own resting layout with **no predecessor blending**. This is the mode to use while
  building out the base library of phase animations.
- **Transitions** — every `(phase, outcome, predecessor)` pairing (all ~349 samples).
  Loading one **seeds player start positions from the predecessor phase** so you can
  author the blend between two phases. Use this later, once the single phases are done.
- **Frame debugger** — read-only playback of a captured 30-agent **frame stream** from
  the spatial engine. Not authoring — observation. See § 4.1 below.

The rest of this section describes the labels you'll see in each mode.

### 4.1 Frame debugger — the believability microscope

The frame debugger is a **read-only** mode for inspecting the spatial engine's
output (Spatial Engine Upgrade — `Upgrade.md` § 9; engine side in
**`docs/match-engine.md`** § "Spatial substrate (dark)"). Instead of authoring
keyframes, it plays back a **captured frame stream** — one snapshot per 10 Hz
micro-tick of all 30 agents + the ball — so "the 13 looks lost" stops being a
guess and becomes *scrub to tick 47 and read his decision annotations*.

Selecting **Frame debugger** swaps the keyframe-authoring controls for the
frame-stream panel and timeline. The authored dots are hidden; a dedicated 30-dot
overlay (positional identity: dots 1–15 = home slots 1–15, 16–30 = away slots
1–15) plus a ball dot are driven straight from the loaded frames.

**Loading a stream.** Drop a frame-stream JSON into the file input. Accepted shapes:
the bare `Frame[]` array, `{ frames: [...] }`, or a probe dump
`{ frameStreams: [{ label, frames }] }` carrying **every captured beat**. Generate one with:

```
npm run probe -- --frames     # → harness/frames.json (frame stream + annotations)
```

This runs the dark-mode `SpatialSimulator` over a demonstrative scenario **with
decision annotations enabled** and writes `harness/frames.json`. (A dev-build
match capture writes the same shape.)

**Playback.** The bottom row gains a frame timeline: a **scrub slider** over the
micro-ticks, **▶ Play / ⏸ / ⏹**, a **speed** select (0.25× / 1× / 2× — 1× is real
10 Hz time), and a `tick / total` readout. `Space` plays/pauses; `←` / `→` step a
single tick.

**Stepping between beats.** A probe dump holds many beats (e.g. 10 PhasePlay
carries). When more than one is loaded, a **Beat** pill appears with `[` / `]`
buttons (and the matching keys) to step through every captured beat, showing
`current / total` and the beat label. Each beat reloads the scrub timeline at
tick 0 — so the whole capture is reviewable, not just the first carry.

**Decision annotations.** When the capture recorded them — only in dev builds,
behind the `world.recordAnnotations` flag, **never** in production or silent
fixture paths — a dot carries a small green badge on ticks where it has an
annotation. Click any dot to read, in the sidebar, which **control layer** drove
it that tick (1 ROLE / 2 DECIDE / 3 REACT) and the leading utility options with
their scores. In WP 1 the decision layer is a stub, so annotations only report
that Layer 1 steered the agent to its target; WP 2+ surface real per-option
scores here.

In Single mode the label is just the phase and its outcome key(s):

```
BREAKDOWN · clean_ball
FIRST_PHASE · crash_ball/dominant_tackle
```

### Transition labels

In Transitions mode, when a `(phase, outcome)` pair has only one possible predecessor
the label stays compact; when the same outcome can follow different predecessors (and
the forward positions would therefore differ), the predecessor is shown explicitly:

```
FIRST_PHASE · crash_ball/dominant_tackle ← LINEOUT:clean_catch
FIRST_PHASE · crash_ball/dominant_tackle ← SCRUM:slow_ball
```

Load the variant whose predecessor matches the context you're animating.

### Multi-key outcomes

Some beats carry more than one `phase_outcome` step — for example a `line_break`
always comes with a `cover_tackle` step. Both keys appear in the label:

```
PHASE_PLAY · line_break/cover_tackle
```

The ball path and player layout are the same sample; the compound label just
tells you which narration chain it represents.

---

## 5. Workflow — authoring a phase

1. **Pick a phase.** Use the **Phase source** dropdown and **Load phase**.
   - The ball track fills with keyframes, the timeline gets **start / beat / resolve**
     markers, and the **info line** below the buttons shows:
     - *"HOME in possession · attacking ↑ (top)."*
     - *"Involved: #10 & #14."* — the primary and secondary actors from the engine.
     - *"Layout: 22 dots placed."* — how many players were pre-placed. In **Transitions**
       mode it also reports how many had their `t = 0` seeded from the predecessor phase
       (e.g. *"(9 seeded from LINEOUT:clean_catch)"* — those 9 start at their lineout
       positions and glide to their first-phase positions as you play). In **Single
       phases** mode nothing is seeded — every dot loads at its own resting position.
   - The **possession badge** on the pitch confirms which team attacks which end.

2. **Read the orientation.** Before dragging anything:
   - The badge and the ▲/▼ arrow tell you which end is the attacking in-goal.
   - End labels say **AWAY 22** (top) and **HOME 22** (bottom).
   - The dashed lines at the 22m marks and the solid halfway line give you field position.

3. **Go to the start.** Click the far-left of the timeline bar (or press **⏹**) so
   the playhead is at `t = 0`. The players will be at their predecessor-seeded
   starting positions.

4. **Play through the default animation.** Press **▶ Play** before touching anything.
   The ball follows the engine's real path; every player who moved from the predecessor
   phase glides to their resting position. This is your baseline — you're extending
   or refining it, not building from scratch.

5. **Adjust starting positions.** Scrub to `t = 0` and drag players that need
   repositioning. With **Auto-keyframe** on (default), each drag updates the keyframe
   at the playhead.

6. **Step to each beat.** Click a beat **tick** on the timeline bar to move the
   playhead there, then drag the players that move on that beat. Repeat for each
   beat through **resolve**.
   - A player with keyframes only at `t = 0` and `t = 1` (resolve) just glides
     straight between them — you don't need to keyframe everyone on every beat.

7. **Review.** Press **▶ Play** (set **Speed** to taste). **⏹** rewinds.

8. **Refine.** Select a dot (click it) to see its keyframes as **diamonds** on the
   timeline. Scrub to a diamond and drag to adjust, or use **Delete keyframe** to
   remove the one nearest the playhead.

9. **Export.** Click **Export JSON** (then **Copy**) and save it. **Import** pastes a
   saved animation back in to keep working.

---

## 6. Controls reference

| Control | What it does |
|---|---|
| **Phase source** dropdown + **Load phase** | Seeds the ball from the chosen engine phase, pre-places all 30 players at the game's live layout, seeds each player's `t = 0` from the predecessor phase (where known), and shows the possession badge. |
| **Load trace.json** | Optional: drop your own `harness/trace.json` (from `npm run probe`) to use its beats instead. Trace beats have no pre-baked layout and fall back to the default formation; predecessor seeding still applies where `prevPhase`/`prevKey` are present. |
| **Reset formation** | Puts all 30 players back to the default starting layout (keeps the loaded phase and the ball path). |
| **Drag a dot / the ball** | Moves it and (with auto-keyframe) sets a keyframe at the playhead. |
| **Set keyframe @ playhead** | Pins the selected entity's *current* interpolated position as a keyframe. |
| **Delete keyframe** | Removes the selected entity's keyframe nearest the playhead (never `t = 0`). |
| **Auto-keyframe while dragging** | When on, dragging creates/updates a keyframe at the playhead; when off, it nudges the nearest existing keyframe. |
| **Show start/end ghosts** | Toggles the faint ball start/end markers + the ball-path trail. |
| **Timeline bar** | Click/drag to scrub the playhead. |
| **▶ Play / ⏸ / ⏹** | Play, pause, stop-and-rewind. **Speed**: 0.5× / 1× / 2×. |
| **Export / Copy / Import** | Round-trips the full keyframe set as JSON. |

---

## 6.1 Shape editor (subset roster + spatial shape)

The **Roster** panel (top of the authoring sidebar) chooses **which players a shape
animates** — per-player chips plus quick-selects (Home 15 / Away 15 / Home backs /
Away backs / All / None). Excluded players are dimmed + inert and **left out of the
export**, so you can author just one team's backs, all 15 of a team, or any subset;
the engine fills in the rest. Re-importing a subset restores its selection; the ball
anchor is always kept.

**"Export spatial shape"** emits the active HOME players as **mark-relative,
attack-oriented** offsets for `AUTHORED_ATTACK_SHAPES` in
`src/engine/balance/attackShapes.ts`: `fwd = player.x − ball.x` (negative = behind
the gain line), `lat = player.y − ball.y` (toward the open side — the engine mirrors
it to whichever side is actually open). Author one team here; the spatial engine
plays the shape off either touchline. Paste the output under the desired
`attackingStyle` key; the engine drives the named slots into the formation and the
remaining slots keep the procedural pods/backline. (Per-team selection + named
set-moves are the WP6 playbook.)

## 7. Export format

`t` is normalised `0..1`; `x`/`y` are game coordinates (so they map straight onto
`ballX`/`ballY` and `pitchCoords.toTop`/`toLeft`). Entity `id` is `side` + slot:
`h10` = home slot 10, `a2` = away slot 2 (where slot = matchday jersey 1–15).

```jsonc
{
  "meta": {
    "phase": "FIRST_PHASE (crash_ball/dominant_tackle)",
    "beats": [ { "t": 0, "label": "start" }, { "t": 0.33, "label": "beat 1" }, ... ],
    "coords": "game(x:long 0-100 top=100, y:lateral 0-100)"
  },
  "entities": [
    { "id": "ball", "kind": "ball",  "jersey": "",   "kf": [ { "t": 0, "x": 37, "y": 5  }, ... ] },
    { "id": "h10",  "kind": "home",  "jersey": "10", "kf": [ { "t": 0, "x": 30, "y": 46 }, ... ] },
    { "id": "a12",  "kind": "away",  "jersey": "12", "kf": [ { "t": 0, "x": 68, "y": 55 }, ... ] }
    // ... 30 players total + ball
  ]
}
```

Players that don't move (static) have a single keyframe at `t = 0`. Players seeded
from the predecessor will have a `t = 0` keyframe at the predecessor's resting position
and a `t = 1` keyframe at the current phase's resting position — that's the glide you
saw during playback, ready to bake or further refine.

---

## 8. Regenerating the embedded phases

The dropdown is populated from `public/tools/phases.js` (`window.EMBEDDED_PHASES`).
After engine changes that affect ball movement or choreography, regenerate it:

```
npm run export:phases     # runs the engine over 300 seeds → public/tools/phases.js
```

`scripts/exportPhases.ts` runs `MatchCoordinator` headlessly across 300 seeds (cycling
`kick_for_goal` / `kick_to_touch` / `tap_and_go` penalty choices to surface all
branches), captures the richest beat per `(phase, outcome, prevPhase)` combination —
the one with the most ball movements, then most layout dots as tiebreaker.

Each sample carries:
- `phase`, `key`, `keys` — the phase name and all narration outcome keys on this beat
- `start`, `moves`, `resolve` — the engine's ball path (previous position → in-phase
  movements → final resting position)
- `side` — the engine's `event.side`. On a possession-swap outcome this is the team
  receiving the *next* set piece, not the team that just acted (see `actorSide`)
- `attacksTop` — `true` if `side` attacks toward x = 100 (top of screen)
- `actorSide` — the team actually performing the phase (`sideOf(primaryPlayer)`). The
  possession badge keys on this so e.g. `box_kick_to_touch` correctly shows the *kicker*
  in possession attacking the way the ball travels, not the team that gets the lineout
- `prevPhase`, `prevKey` — the predecessor beat's phase name and primary outcome key,
  used by the animator for predecessor seeding and by the game for dispatch
- `layout` — the full 30-player choreographed dot positions for that beat (game coords),
  including any game-authored `from` positions (kick-off / drop-out chase lines)
- `primary`, `secondary` — squad numbers of the primary and secondary actors

The `(phase, outcome, prevPhase)` key means phases with geometrically distinct
predecessor formations each get their own sample (e.g. `FIRST_PHASE:crash_ball:SCRUM`
and `FIRST_PHASE:crash_ball:LINEOUT` are separate entries, because the forwards are
in completely different positions). Secondary narration steps (`cover_tackle`,
`offload_knock_on`, `high_tackle_penalty`) are captured by iterating all keys on a
beat, not just the first, so they're always present in the dropdown.

---

## 9. How the animator output maps to the game

The animator is the authoring surface; `pitchChoreography.ts` is where the authored
frames live in the game. Understanding the relationship helps you decide what to
export and how to bake it.

### What already drives the game (no animator output needed)

| Phase | How the game places dots |
|---|---|
| **Scrum** | Computed geometry: `SCRUM_ROWS` + `SCRUM_ATK_BACKS`/`SCRUM_DEF_BACKS` constants |
| **Lineout** | Computed geometry: row spread + `LINEOUT_ATK_BACKS`/`LINEOUT_DEF_BACKS` |
| **FirstPhase (backs)** | `firstPhaseBacklineLayout` — anchored on the engine's real `movements[]` sweep. **Forwards are always held at the predecessor set-piece formation** (`keepLineout`) regardless of whether a choreography JSON is active. |
| **Maul** | Computed from scrum geometry with the hooker shifted to the tail |
| **Open play fallback** | `openPlayLayout` — only the 2–3 named actors around the ball |

### What is authored and baked from the animator

| Phase | Seam | Where in code |
|---|---|---|
| **FirstPhase** (crash ball, out the back, kick decision) | `applyFirstPhaseChoreography()` — Phase Animator JSON ingested into `FIRST_PHASE_CHOREOGRAPHIES` in `firstPhaseChoreography.ts`; backs (slots 9–15) animated per-keyframe; forwards skipped; ball path replaces `emitSweepHops`; entire move anchored to live ball position via `dx`/`dy` offset | `src/engine/balance/firstPhaseChoreography.ts`, `src/engine/choreography/applyChoreography.ts`, `src/engine/events/FirstPhaseEvent.ts` |
| **Breakdown** (7 outcomes) | `placeFormation` with a `Formation` offset table | `BREAKDOWN_CLEAN`, `BREAKDOWN_SLOW_BALL`, etc. |
| **BoxKick** (announce + 5 outcomes) | `placeFormation` | `BOX_KICK_ANNOUNCE`, `BOX_KICK_FORMS` |
| **KickOff** (announce + chase) | Bespoke `from`/`to` slot tables | `KICKOFF_RECV`, `KICKOFF_KICK` |
| **DropOut22** (announce + receive) | Bespoke `from`/`to` offset tables | `DROPOUT_ANNOUNCE_*`, `DROPOUT_RECEIVE_*` |

Everything else (TacticalKick, KickReturn, Penalty, PhasePlay, TryScored,
ConversionKick) falls back to `openPlayLayout` or `travelingKickLayout` — only the
named actors are placed. These are candidates for full-formation authoring.

### The two ingestion paths

**Path A — prototyping aid (immediate):** author the motion in the animator, read off
the positions visually, and hand-write the matching constants into `pitchChoreography.ts`.
Good for one-off tuning of existing layouts.

**Path B — baking from export (structured):** export the JSON, parse the `t = 0`
(resting) positions into ball-relative offsets, and store them as a `Formation`
constant or a `from`/`to` slot table. The step-by-step recipe is in § 10 below.

### What the predecessor keying gives you at bake time

The `prevPhase` label in the dropdown (`← LINEOUT` vs `← SCRUM`) tells you which
`prevPhase` dispatch branch to create in `choreograph()`. The function already receives
`prevPhase` as a parameter (line 81 in `pitchChoreography.ts`). The pattern is:

```typescript
if (event.phase === MatchPhase.PhasePlay) {
  const keys = outcomeKeys(event);
  if (keys.includes('dominant_tackle')) {
    if (prevPhase === MatchPhase.Breakdown) return placeFormation(..., FROM_BREAKDOWN);
    if (prevPhase === MatchPhase.Lineout)   return placeFormation(..., FROM_LINEOUT);
  }
}
```

You only need separate variants when the predecessor's forward positions are
**geometrically distinct** — scrum vs lineout vs open-ruck are all different; one
breakdown preceding another breakdown is not.

---

## 10. Wiring an exported animation into the game (recipe)

This is the step-by-step for a session handed an exported JSON. The **worked precedent
is the kick-off** — read `kickOffLayout` + `KICKOFF_RECV` / `KICKOFF_KICK` in
`src/ui/pitchChoreography.ts` first; then the breakdown formations for the
`placeFormation` pattern.

### Step 1 — Identify which layout function to edit

`meta.phase` in the exported JSON names the phase → look up the matching dispatch in
`choreograph()` in `pitchChoreography.ts`. For a phase currently falling through to
`openPlayLayout`, you're adding a new branch before the final `return openPlayLayout(…)`.

### Step 2 — Bake the t = 1 (resting) positions as a ball-relative `Formation`

For each player entity in the JSON, take their **last keyframe** `(x, y)` — that's
the resting position. Subtract the ball's last position to get `[dx, dy]` offsets.
Store as a `Formation`:

```typescript
const MY_PHASE_OUTCOME: Formation = { nearTop: true,   // authoredBallY >= 50
  atk: {
    1: [-8.2,  3.1],  2: [-9.1, 11.4],  // ... slot → [dx, dy]
  },
  def: {
    1: [ 4.0,  0.0],  2: [ 5.3,  8.2],
  },
};
```

`nearTop` is a fact about the authored frame: `authoredBallY >= 50` (the nearer
touchline). Getting it wrong reflects every dot onto the wrong touchline.

`atk` vs `def`: the attacking side is the one `event.primaryPlayer` belongs to.
On a turnover outcome the `primaryPlayer` is the **defending** team's jackal, so its
table is written from the defender's perspective — `atk` and `def` in the constant
are swapped relative to the attacking team. Follow the existing breakdown constants
as a guide.

Then call it via `placeFormation(event, state, attacksTop, event.ballX, event.ballY, MY_PHASE_OUTCOME)`.

### Step 3 — Add `from` positions for any dot that moves during the beat

If a player has more than one keyframe (they move over the beat duration), their
first keyframe is their start; their last is their rest. Store both in a `from`/`to`
slot table (like `KICKOFF_RECV`) and set `Placed.from` in the layout. `PitchPlayers`
records the dot on `players.chaseDots`; `PitchView` animates each from `from` to its
resting spot, synced to the beat duration.

### Step 4 — Parameterise — NEVER hard-code absolute coords

The JSON is ONE sample on ONE touchline/end. Transform the authored frame at play-time:

- **Long axis (x):** `x' = 50 − (x − 50) · dir`, where `dir` comes from **team
  orientation** (`attacksTop` flag), NOT the ball landing. The kick-off uses this
  pattern so the announce beat (no landing yet) and the kick beat (landing known) use
  the same transform and stay continuous.
- **Lateral (y):** mirror `dy` when the live ball is on the opposite touchline
  (`mirrorY = form.nearTop !== (anchorY >= 50)`). `placeFormation` does this
  automatically. The kick-off and drop-out drop the y mirror because the landing
  side is unknown on the announce beat.
- **Keep engine-driven bits dynamic.** The real ball position, the actual actors
  (`event.primaryPlayer` / `event.secondaryPlayer`), and which side is in possession
  all come from the engine and change every game. Snap the *actual* actor to the
  real spot (kick-off snaps `primaryPlayer` to the real landing) and place everyone
  else from the authored table.

### Step 5 — Handle multi-predecessor variants

If the animator showed you two dropdown entries for the same outcome (e.g.
`FIRST_PHASE · crash_ball ← SCRUM` and `FIRST_PHASE · crash_ball ← LINEOUT`), author
both and bake them as separate `Formation` constants. In `choreograph`, dispatch on
`prevPhase`:

```typescript
if (event.phase === MatchPhase.FirstPhase) {
  if (prevPhase === MatchPhase.Scrum)   return placeFormation(..., CRASH_FROM_SCRUM);
  if (prevPhase === MatchPhase.Lineout) return placeFormation(..., CRASH_FROM_LINEOUT);
}
```

If the predecessor doesn't change forward geometry meaningfully (e.g. all open-ruck
phases look the same regardless of which specific breakdown preceded them), one
constant covers all predecessors — no dispatch needed.

### Step 6 — Validate with the probe

```
npm run export:phases     # only if ball paths changed
pkill -9 -f vite          # OWN step — kill ALL vite before re-running
npm run probe             # → harness/trace.json + screenshots
```

Check the beat in `harness/trace.json`. If numbers look identical to the pre-fix
run, Vite was stale — kill it and re-run.

**Re-baking an updated JSON** = redo step 2 from the new keyframe values; the
parameterisation (step 4) and seams (step 3) stay the same.
