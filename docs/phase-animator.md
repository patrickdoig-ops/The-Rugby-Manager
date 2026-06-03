# Phase Animator — user guide

> A developer tool for visually authoring 2D-pitch animations by drag-and-drop +
> keyframes, instead of hand-coding choreography in `src/ui/pitchChoreography.ts`.
> It lets you place **all 15 + 15 players** (not just the involved ones) and keyframe
> them against the engine's real ball path for any phase.
>
> Tool: `public/tools/phase-animator.html` · Generator: `scripts/exportPhases.ts`
> · Reference + integration notes: `public/tools/README.md`
>
> **New to it?** Follow the worked example: [Tutorial — modifying the kick-off phase](./tutorial-kickoff.md).

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
┌──────────────┬─────────────────────────────┐
│  SIDEBAR     │   PITCH (portrait)          │
│  - phase     │   x = long axis (100 = top) │
│  - selected  │   y = lateral (0/100 touch) │
│  - export    │   15 home + 15 away + ball  │
├──────────────┴─────────────────────────────┤
│  TIMELINE  ▶ play · speed · playhead · bar  │
└─────────────────────────────────────────────┘
```

- **Pitch** — portrait top-down, the same coordinate space as the game (`x` runs up
  the screen, `100` at the top; `y` is lateral, `0`/`100` are the touchlines). Maroon
  dots = home, blue = away, orange = ball.
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
  pre-seeded — with the engine's real path (*previous-phase start → each in-phase
  movement → resolution*). You author the players **around** that path.
- **`t = 0` is an anchor.** Every entity always keeps a keyframe at `t = 0` (its start
  position); it can't be deleted.

---

## 4. Workflow — authoring a phase

1. **Pick a phase.** Use the **Phase source** dropdown (83 real engine samples are
   embedded, covering every phase type — kick-off, scrum, lineout, maul, first phase,
   phase play, breakdown, kick return, every kick, penalty, conversion, drop-out,
   try). Click **Load phase**.
   - The ball track fills with keyframes, the timeline gets **start / beat / resolve**
     markers, and the info line names the **involved players** (e.g. *"Involved: away
     #12 & #7"*).
   - **The players are pre-placed at the game's *current* layout for that phase** —
     the same dots the game actually draws (e.g. a lineout loads both lines of
     forwards, the hookers off the pitch, and the two #9s) — so you start from what
     exists, not a blank formation. Dots the phase doesn't involve stay in the default
     formation for you to position. (This comes from `phases.js`, captured by running
     the real `choreograph` in `npm run export:phases`; trace.json imports have no
     layout and fall back to the default formation.)
2. **Go to the start.** Click the far-left of the timeline bar (or press **⏹**) so the
   playhead is at `t = 0`.
3. **Place the players for the start.** Drag any dot to where it should begin. With
   **Auto-keyframe** on (default), each drag drops a keyframe at the current playhead.
4. **Step to each beat.** Click a beat **tick** on the bar to move the playhead there,
   then drag the players that move on that beat. Repeat for each beat through
   **resolve**.
   - You don't have to keyframe every player on every beat — a player with keyframes
     only at `t = 0` and `resolve` just glides straight between them.
5. **Review.** Press **▶ Play** (set **Speed** to taste). **⏹** rewinds to the start.
6. **Refine.** Select a dot (click it) to see its keyframes as **diamonds**. Scrub to a
   diamond and drag to adjust, or use **Delete keyframe** to remove the one nearest the
   playhead.
7. **Export.** Click **Export JSON** (then **Copy**) and save it. **Import** pastes a
   saved animation back in to keep working.

---

## 5. Controls reference

| Control | What it does |
|---|---|
| **Phase source** dropdown + **Load phase** | Seeds the ball from the chosen engine phase AND pre-places the players at the game's current layout for it; dots the phase doesn't involve reset to the default formation. |
| **Load trace.json** | Optional: drop your own `harness/trace.json` (from `npm run probe`) to use its beats instead of the embedded set. |
| **Reset formation** | Puts all 30 players back to the default starting layout (keeps the loaded phase). |
| **Drag a dot / the ball** | Moves it and (with auto-keyframe) sets a keyframe at the playhead. |
| **Set keyframe @ playhead** | Pins the selected entity's *current* interpolated position as a keyframe. |
| **Delete keyframe** | Removes the selected entity's keyframe nearest the playhead (never `t = 0`). |
| **Auto-keyframe while dragging** | When on, dragging creates/updates a keyframe at the playhead; when off, it nudges the nearest existing keyframe. |
| **Show start/end ghosts** | Toggles the faint ball start/end markers + the ball-path trail. |
| **Timeline bar** | Click/drag to scrub the playhead. |
| **▶ Play / ⏸ / ⏹** | Play, pause, stop-and-rewind. **Speed**: 0.5× / 1× / 2×. |
| **Export / Copy / Import** | Round-trips the full keyframe set as JSON. |

---

## 6. Export format

`t` is normalised `0..1`; `x`/`y` are game coordinates (so they map straight onto
`ballX`/`ballY` and `pitchCoords.toTop`/`toLeft`).

```jsonc
{
  "meta": {
    "phase": "FIRST_PHASE (crash_ball/dominant_tackle)",
    "beats": [ { "t": 0, "label": "start" }, { "t": 0.33, "label": "beat 1" }, ... ],
    "coords": "game(x:long 0-100 top=100, y:lateral 0-100)"
  },
  "entities": [
    { "id": "ball", "kind": "ball", "kf": [ { "t": 0, "x": 37, "y": 5 }, ... ] },
    { "id": "h10",  "kind": "home", "jersey": "10", "kf": [ { "t": 0, "x": 37, "y": 42 }, ... ] },
    { "id": "a12",  "kind": "away", "jersey": "12", "kf": [ ... ] }
    // 30 players + the ball
  ]
}
```

---

## 7. Regenerating the embedded phases

The dropdown is populated from `public/tools/phases.js` (`window.EMBEDDED_PHASES`).
After engine changes that affect ball movement, regenerate it:

```
npm run export:phases     # runs the engine over 60 seeds → public/tools/phases.js
```

`scripts/exportPhases.ts` runs `MatchCoordinator` headlessly, varies the penalty
decision to surface tap-and-go / lineout / kick-at-goal branches, and keeps the
**richest-movement beat per `(phase, outcome)`** so each phase has a meaningful path.

---

## 8. How it relates to the game

The editor is the easy part; wiring authored clips back in is the open question,
because the match engine is RNG-driven (each phase has variants with different ball
paths and involved players). Two paths, detailed in `public/tools/README.md`:

- **Path A — prototyping aid (today):** design the motion here, then port the
  positions into `pitchChoreography.ts`.
- **Path B — data-driven runtime:** author **templates** keyed by `(phase, outcome)`
  in a normalised, ball-relative frame; at play-time anchor them on the engine's real
  `GameEvent.movements[]` and map generic slots onto the actual roster. The export
  schema above is a reasonable starting point (add a `slot` field per entity to bind
  to roster slots rather than fixed jerseys).

When you've authored a phase you like, export it and we can take the Path-B step.

---

## 9. Wiring an exported animation into the game (recipe)

This is the step-by-step for a fresh session handed an exported JSON ("wire this
lineout in"). The **worked precedent is the kick-off** — read `kickOffLayout` +
`KICKOFF_RECV` / `KICKOFF_KICK` in `src/ui/pitchChoreography.ts` first; do the same
shape for the new phase.

1. **Read the JSON.** `meta.phase` names the phase → edit that phase's layout function
   in `src/ui/pitchChoreography.ts` (`lineoutLayout`, `maulLayout`,
   `firstPhaseBacklineLayout`, `openPlayLayout`, the kick layouts, …). `entities[].kf`
   are per-player keyframes in **game coords** (x = long axis 0–100, 100 = top;
   y = lateral 0–100); `id` is `side`+`slot` — `h10` = home slot 10, `a2` = away slot 2.
   The `ball` entity is informational (the engine owns the real ball path).

2. **Bake the positions as a slot→spot table** next to the layout function, exactly
   like `KICKOFF_RECV` / `KICKOFF_KICK`. A dot that moves over the beat (≥2 keyframes)
   stores `{ from, to }`; a static dot stores one spot. In the layout, look up each
   on-field player by slot (`onFieldPlayers(...).find(p => p.id === slot)`) and
   `placed(...)` it at the table spot.

3. **Parameterise — NEVER hard-code the absolute coords.** The JSON is ONE sample on
   ONE touchline/end; the live phase varies. Transform the authored frame (see the
   kick-off's `tx()`):
   - **Long axis (x):** flip to the real direction — `x' = 50 − (x−50)·dir`, where
     `dir` comes from **team orientation** (stable across all the phase's beats), not
     from the landing (which isn't known on early beats).
   - **Lateral (y):** mirror when the live event is on the opposite touchline
     (lineout: `event.ballY < 50`). Kick-off drops the mirror because the landing side
     is unknown on the announce beat — decide per phase.
   - **Keep engine-driven bits DYNAMIC.** The real ball position (`event.ballX/ballY`),
     who's on the ball (`event.primaryPlayer` / `secondaryPlayer`), and which side
     kicks/throws all come from the engine and change every time. Snap the *actual*
     actor to the real spot (kick-off snaps `primaryPlayer` to the landing) and place
     everyone else from the table. The layout already derives the acting team (e.g.
     `kickOffLayout`'s kicking-side logic) — reuse that pattern.

4. **Animate motion with the existing seams (CLAUDE.md § 8):**
   - **Whole-dot move over the beat:** set `Placed.from` (start). `PitchPlayers`
     records it on `players.chaseDots`; `PitchView` rides each from `from` to its
     resting spot, synced to the beat (the kick-off chase line).
   - **The on-ball carrier:** rides automatically via the `ballWalkFollower` when the
     phase emits a multi-leg `movements[]` and the layout flags `isCarrier`; set
     `GameEvent.carrierFromStart` for a direct pick-up (carrier picks at the start).
   - **A bound pack (maul):** Layer-3 `dot-transitioning` glide, not the follower.

5. **Validate with the probe — kill stale Vite first.**
   ```
   npm run export:phases     # only if engine ball paths changed
   pkill -9 -f vite          # OWN step — the probe reuses any running dev server
   npm run probe             # → harness/trace.json + screenshots
   ```
   Check the beat in `harness/trace.json` (dots carry only a jersey number, no side —
   cross-reference `beats[].side` + `movements[]`). If numbers look identical to the
   pre-fix run, Vite was stale — kill it and re-run.

**Re-uploading an updated JSON** = re-bake step 2's table from the new keyframe values;
the parameterisation (step 3) and seams (step 4) stay the same.
