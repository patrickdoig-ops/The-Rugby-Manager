# Dev tools

## `phase-animator.html` — keyframe authoring for the 2D pitch

A **self-contained** HTML tool (no build, no deps — just open it in a browser) for
visually authoring 2D-pitch animations by drag-and-drop + keyframes, in the same
spirit as SquadAnimator / AnimationSlate / RugbySlate. Built to explore whether
hand-authoring is a faster path than the code-driven choreography in
`src/ui/pitchChoreography.ts`.

It lives under `public/`, so it ships in the Pages build and is reachable on any
device once deployed:

```
https://patrickdoig-ops.github.io/The-Rugby-Manager/tools/phase-animator.html   # live (Pages)
http://127.0.0.1:5173/The-Rugby-Manager/tools/phase-animator.html               # local (npm run dev)
```

A bare `file://` open may block the sibling `phases.js` script in strict browsers;
use the dev server or the live URL if the dropdown is empty.

### What it does

- Portrait pitch in the **game's coordinate space** (x = long axis 0–100, 100 at the
  top; y = lateral 0–100, 0/100 = touchlines) so exported positions map straight onto
  `ballX`/`ballY` and `pitchCoords.toTop/toLeft`. Fixed end-labels (AWAY 22 / HOME 22)
  orient you. A **possession badge** (▲/▼) shows which team is in possession and which
  end they're attacking.
- **All 15 + 15 players** + the ball, each a draggable dot. On load, players are
  pre-placed at the real `choreograph()` output for that phase beat, and each player's
  `t = 0` start position is seeded from the predecessor phase's resting layout — so
  transitions between phases are smooth glides, not jumps. The info line says how many
  dots were seeded this way.
- **Timeline + keyframes:** drag any dot to set a keyframe at the playhead; scrub;
  play back with linear tweening between keyframes. Diamonds = the selected entity's
  keyframes, ticks = beats.
- **349 engine phases embedded** (`phases.js`) keyed by `(phase, outcome, predecessor
  phase)` — 14 phase types, multi-predecessor variants labelled separately
  (e.g. `FIRST_PHASE · crash_ball ← LINEOUT` vs `← SCRUM`), and secondary narration
  steps (`cover_tackle`, `offload_knock_on`) always present. Pick one from the dropdown
  and **Load phase**: the ball track is auto-seeded with the engine's real path
  (previous-phase position → in-phase movements → resolution), with beat markers and
  the involved players named. You can also drop your own `harness/trace.json`.
- **Export / Import JSON** — round-trips the full keyframe set.

### Regenerating the embedded phases

```
npm run export:phases     # runs the engine over 300 seeds → public/tools/phases.js
```

`scripts/exportPhases.ts` keeps the richest-movement beat per `(phase, outcome,
prevPhase)` combination. Full guide: `docs/phase-animator.md`.

### Export shape

```jsonc
{
  "meta": { "phase": "FIRST_PHASE (crash_ball/dominant_tackle)", "beats": [...],
            "coords": "game(x:long 0-100 top=100, y:lateral 0-100)" },
  "entities": [
    { "id": "ball", "kind": "ball",  "jersey": "",   "kf": [ { "t": 0, "x": 37, "y": 5  }, ... ] },
    { "id": "h10",  "kind": "home",  "jersey": "10", "kf": [ { "t": 0, "x": 30, "y": 46 }, ... ] },
    ...   // 30 players + ball; t is normalised 0..1 across the phase
  ]
}
```

Entity `id` is `side` + matchday slot (`h10` = home slot 10, `a2` = away slot 2).
Players that don't move have one keyframe at `t = 0`. Players seeded from the
predecessor have `t = 0` at the predecessor's resting position and `t = 1` at the
current phase's resting position. Game-authored chase animations (kick-off, drop-out)
retain their original `from`→`to` keyframes.

### How exported frames feed the game

Two paths — see `docs/phase-animator.md` §§ 9–10 for the full recipe:

- **Path A — prototyping aid (immediate):** author the motion here, read off the
  positions, and port them into `pitchChoreography.ts` by hand. Good for tuning
  existing layouts.
- **Path B — baking from export (structured):** parse the export JSON, convert the
  `t = 1` (resting) positions to ball-relative `[dx, dy]` offsets, store them as a
  `Formation` constant, and call `placeFormation()`. The `t = 0` positions (where
  non-zero) become `Placed.from` values for the formation-chase seam. Dispatch on
  `prevPhase` when multi-predecessor variants are needed — the `choreograph()` function
  already receives `prevPhase` as a parameter.
