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
open public/tools/phase-animator.html                                            # local (no server)
```

### What it does
- Portrait pitch in the **game's coordinate space** (x = long axis 0–100, 100 at the
  top; y = lateral 0–100, 0/100 = touchlines) so exported positions map straight onto
  `ballX`/`ballY` and `pitchCoords.toTop/toLeft`.
- **All 15 + 15 players** + the ball, each a draggable dot starting from a default
  formation (the whole reason for this tool — the live choreographer only ever draws
  the *involved* players).
- **Timeline + keyframes:** drag any dot to set a keyframe at the playhead; scrub;
  play back with linear tweening between keyframes. Diamonds = the selected entity's
  keyframes, ticks = beats.
- **Seed a real phase:** `npm run probe` → drop `harness/trace.json` in, pick a beat.
  The ball track is auto-seeded with **where the ball started (previous phase) →
  each in-phase movement → where it resolved** (exactly the structure asked for).
  You then keyframe the players around that authoritative ball path.
- **Export / Import JSON** — round-trips the full keyframe set.

### Export shape
```jsonc
{
  "meta": { "phase": "#12 FIRST_PHASE (crash_ball/...)", "beats": [...], "coords": "game(...)" },
  "entities": [
    { "id": "ball", "kind": "ball", "kf": [ { "t": 0, "x": 37, "y": 5 }, ... ] },
    { "id": "h10", "kind": "home", "jersey": "10", "kf": [ ... ] },
    ...   // 30 players + ball; t is normalised 0..1 across the phase
  ]
}
```

## Feasibility / how this could feed the game

The hard part is **not** the editor — it's that the match engine is RNG-driven, so a
phase has *variants* (crash ball vs wide play, knock-on, interception, line break…),
and the ball's start/end + which players are involved differ every time. A fixed
hand-authored clip can't be replayed verbatim. Two viable integration paths:

- **Path A — prototyping aid (no engine change, available today).** Use the tool to
  design the motion for a phase variant with all 15 players, then port the resulting
  positions into `pitchChoreography.ts`. Immediate value: iterate on *look* visually
  instead of editing geometry in code and re-running.

- **Path B — data-driven runtime (the "efficient" end-state).** Build a small runtime
  that consumes authored **templates**, keyed by `(phase, outcome)` and authored in a
  *normalised* frame, then at play-time: (1) anchor the template on the engine's real
  ball path (`GameEvent.movements[]`), and (2) map the template's generic slots
  (#9, #10, carrier, …) onto the actual involved/roster players. This replaces the
  per-phase layout functions with authored data. Bigger lift (template format, slot
  mapping, fallback when a variant has no template) but it's what makes authoring
  *all* phases scalable.

**Recommendation:** keep this as a Path-A prototyping aid first. If it proves faster
in practice, invest in Path B's template format (the export JSON above is already a
reasonable starting schema — add a `slot` field per entity so positions bind to roster
slots rather than fixed jerseys, and author in a ball-relative normalised frame).

Not part of the build or the deployed app; dev-only.
