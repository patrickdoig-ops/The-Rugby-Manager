# Tutorial — modifying the kick-off phase

A complete, worked example: prototype a richer kick-off in the **Phase Animator**,
then get it into the game. Read the [tool guide](./phase-animator.md) first for the
controls; this walks the kick-off end-to-end.

---

## What you're starting from

Today the kick-off draws only **three** dots (`kickOffLayout` in
`src/ui/pitchChoreography.ts`): the **kicker** over the centre spot, the **receiver**
at the landing, and one **chaser** that runs forward as the ball arcs (`PitchView.ts`
lobs the ball with `animateKickArc`). The other 28 players aren't shown.

**Goal of this tutorial:** author a full **15-v-15** kick-off — a kicking-team chase
line sweeping forward and a receiving-team back-field fielding the ball — and export
it so we can wire it into the game.

---

## Part A — Prototype it in the tool

### 1. Open the animator and load the kick-off
- Open <https://patrickdoig-ops.github.io/The-Rugby-Manager/tools/phase-animator.html>.
- In **Phase source**, pick **`KICK_OFF · clean_receive`** and click **Load phase**.
- The ball seeds two keyframes — **start `(x50, y50)`** (centre spot) → **resolve
  `(x20, y83)`** (deep in the receiving half, near a touchline) — and the info line
  reads *"Involved: home #14 & #6"* (the receiver and a chaser).

> **Reading the pitch:** `x` is the long axis (100 = top = AWAY end, 0 = bottom =
> HOME end); `y` is lateral (0/100 = touchlines, 50 = centre). In this sample **home
> receives** (the ball lands at low `x`, home's half) and **away kicks** (lines up at
> halfway and chases toward low `x`).

### 2. Place the receiving XV (home) at the start
Scrub the playhead to the far **left** (`t = 0`, or press **⏹**), then drag each home
(maroon) dot to its starting spot. A standard receive shape — **back three deep,
forwards in a front catching line, half-backs between**:

| # | Role | Start (x, y) | Note |
|---|---|---|---|
| 15 | Fullback | (25, 50) | deepest, central sweeper |
| 14 | Wing | (22, 80) | **the catcher** — near the landing |
| 11 | Wing | (22, 20) | far-side cover |
| 13 | Centre | (33, 62) | |
| 12 | Centre | (33, 40) | |
| 10 | Fly-half | (38, 46) | |
| 9  | Scrum-half | (44, 52) | |
| 1–8 | Forwards | front line ~x42–46 | spread across y: e.g. 6(45,24) 1(44,32) 2(44,42) 3(44,50) 8(42,58) 4(43,66) 5(43,74) 7(45,82) |

### 3. Place the kicking XV (away) at the start
Drag each away (blue) dot onto a **chase line along the halfway line** (`x ≈ 50`),
spread across the width, with the kicker on the spot:

| # | Role | Start (x, y) | Note |
|---|---|---|---|
| 10 | Kicker | (50, 50) | on the centre spot |
| 1–9, 11–15 | Chase line | `x ≈ 50–52`, `y` from ~14 to ~86 | evenly spread so they're onside and cover the width |

### 4. Keyframe the chase + the catch
Now add a couple of beats so it moves:
1. Click roughly **two-thirds along** the timeline bar to move the playhead there
   (around `t ≈ 0.6`). With **Auto-keyframe** on, drag:
   - the **away chase line** forward to `x ≈ 36–40` (they surge ~10–15 m downfield),
   - **#14 (home)** to the landing **(20, 83)** to take the catch,
   - a couple of nearest home forwards back toward #14 to form a pod.
2. Scrub to the far **right** (`t = 1`, resolve) and tidy the final frame: #14 with the
   ball at **(20, 83)**, the closest away chasers converging around **(28–32, 76–86)**,
   home support folding around the catcher.

> You don't need a keyframe for every player on every beat. A dot with keyframes only
> at `t = 0` and `t = 1` just glides straight between them — fine for players drifting
> a short way.

### 5. Play, refine, export
- Press **▶ Play** (try **0.5×**) and watch it. Select any dot to see its keyframes as
  **diamonds**; scrub to one and drag to fix it, or **Delete keyframe**.
- When it reads right, **Export JSON** → **Copy**, and save it (e.g.
  `kickoff-clean-receive.json`).

---

## Part B — Get it into the game

You've now got authored positions for all 30 players. Here's how that maps to the
code, and the two ways to apply it.

> **Status (worked example, done):** the authored kick-off from this tutorial is fully
> wired in — `kickOffLayout` lays out the **full 15-v-15 formation** (`KICKOFF_RECV` /
> `KICKOFF_KICK`, now carrying `from`/`to` per slot), parameterised by kick direction +
> landing side, with the real catcher on the real landing — **and the chase animates**
> (v1.79b): the pack surges forward and the catcher runs onto the ball as it's in the
> air, via the general `Placed.from` → `chaseDots` seam. The notes below are the general
> recipe for other phases.

### Where the kick-off lives
- **Formation** — `kickOffLayout(event, state)` in `src/ui/pitchChoreography.ts`
  returns the dots. It currently emits only kicker + receiver + chaser; to show your
  full XV-v-XV you extend it to place every forward/back of both teams.
- **Motion** — `src/ui/PitchView.ts` lobs the ball (`animateKickArc`) and runs the one
  chaser forward (the `players.chaserEl` block, direction from `chaseDir`). Animating
  *more* dots (the whole chase line) means adding them as animated actors the same way.

### What stays engine-driven (don't hard-code these)
The **ball landing** (`event.ballX/ballY`), **which player catches** (`primaryPlayer`),
and **which side kicks** all come from the match engine and change every kick-off. So
author your formation **relative to fixed anchors** — the halfway line (`x ≈ 50`) for
the chase line, and the landing for the catcher/pod — rather than as absolute spots.
`kickOffLayout` already derives the kicking team correctly across the coin-toss →
announce → receive beats; build on that.

### Two ways to apply it
- **Option 1 — hand it to me.** Paste the exported JSON into our chat and say "make the
  kick-off look like this." I'll translate the positions into `kickOffLayout` (and any
  chase motion into `PitchView`), keeping the engine-driven bits dynamic, then build +
  deploy so you can check it live.
- **Option 2 — DIY.** Edit `kickOffLayout` to push a `placed(...)` for each player at
  your authored `(x, y)` (remember `placed` takes game coords; the choreographer maps
  them through `toTop/toLeft`). Use `availableForwards` / `onFieldPlayers` to fetch the
  rosters, mirror the existing kicker/receiver/chaser logic for the dynamic actors, and
  run `npm run build` + open the app to test.

### Tips
- Re-run `npm run export:phases` if you want fresh kick-off samples after engine tweaks.
- Start small: get the **static formation** (all 30 in position) looking right first,
  then add the **chase motion** as a second pass — that's exactly the order this
  tutorial follows.

When your prototype looks good, export it and we'll take it from there.
