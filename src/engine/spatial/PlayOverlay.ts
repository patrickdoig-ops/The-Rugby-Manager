// Play-overlay engine (Upgrade.md § 7.1; WP6) — the OUTCOME-AFFECTING half of the
// playbook. A play is a temporary named role-assignment (2–4 roles, ~3 s lifetime)
// whose authored run-line waypoints become the Layer-1 (ROLE) steering source for
// the bound agents, overriding the ShapeSolver's targets for THOSE agents only.
// Layers 2–3 stay live throughout (contact still resolves the tackle; an interrupt
// simply ends an agent's participation), and every play carries abort conditions
// evaluated per micro-tick — when the defence has read the move, the play degrades
// back to ShapeSolver targets rather than glitching.
//
// ONE DRIVER PER AGENT PER TICK (the WP5 channel rule): a play-bound agent's Layer 1
// IS the play; he is never simultaneously shape-driven. The caller enforces this by
// running the ShapeSolver re-anchors FIRST and letting driveOverlayTick OVERWRITE the
// bound agents' targets LAST — so the overlay is the single effective driver while the
// play is live, and after an abort the re-anchors are the only writer again.
//
// PURE MECHANISM: this module reads + writes agent positions/intents and the ball,
// exactly like the ShapeSolver. It returns no MatchEvents — only the carry OUTCOME
// (decided by detectGap/detectContact over the resulting positions) crosses the
// applyMatchEvent seam, via the handler. The abort checks are deterministic geometry
// (no rng) so the familiarity penalty (defender read speed, WP6 selection) can shift
// the abort rate predictably; any future jitter would use rngSpatial (CLAUDE.md § 7).
//
// COORDINATES: the 0–100 pitch (x = long axis, y = lateral). Waypoints are
// attack-oriented + mark-relative (see src/data/playbook/types.ts) and mirrored to the
// live beat by playPointToPitch — one definition plays in either direction / off
// either touchline (CLAUDE.md § 4 — the data contract is the offset; the mirror is a
// runtime function of it).

import type { Play, PlayWaypoint } from '../../data/playbook/types';
import { playPointToPitch, openSignFor } from './playGeometry';
import { PLAY_OVERLAY, PASS_CHAIN } from '../balance/spatialDecision';
import { CARRY_CORRIDOR } from '../balance/spatialShape';
import { AGENTS_PER_SIDE } from './World';
import type { World } from './World';
import type { ShapeParams } from './ShapeSolver';
import type { Agent, Vec2 } from './types';

// One bound role within a live overlay. `agent` is the matchday-slot agent the role
// animates; `line` its authored waypoints; `wpIdx` the index of the waypoint the
// steering is currently leading him toward (advances as ticks pass).
interface BoundRole {
  name: string;
  agent: Agent;
  line: PlayWaypoint[];
  wpIdx: number;
  isCarrier: boolean;
}

// A ball hand-over scheduled by a role's `pass` action. `t` is the micro-tick the
// pass completes (action.t + the pass flight); `to` the receiving role's agent.
interface BallTransfer {
  t: number;
  to: Agent;
}

// The live state of an installed play, threaded through the carry micro-tick loop.
export interface PlayOverlayState {
  play: Play;
  origin: Vec2;          // the mark the waypoints are relative to
  attackDir: 1 | -1;
  openSign: 1 | -1;
  carrier: Agent;        // the MEASURED carrier (the role that ends with `carry`)
  roles: BoundRole[];
  ballHolder: Agent;     // the agent currently holding the ball
  transfers: BallTransfer[];
  nextTransfer: number;
  aborted: boolean;
  abortTick: number;     // the tick the play aborted (-1 while live), for scenarios
}

// Map an attack-oriented, mark-relative waypoint to a clamped pitch target.
function waypointTarget(ov: PlayOverlayState, wp: PlayWaypoint): Vec2 {
  const p = playPointToPitch(ov.origin, ov.attackDir, ov.openSign, wp.fwd, wp.lat);
  return { x: clampX(p.x), y: clampY(p.y) };
}

// Bind a play's roles to agents and install the opening run-line targets. Returns
// null when the play cannot run on this beat — the carrier role has no on-field
// agent to bind to (a carded slot, role 'empty'). A non-carrier role whose slot is
// empty is simply DROPPED (the play degrades, never glitches).
//
// Role → agent binding: the play's CARRIER role (the one that performs a `carry`
// action — the strike runner) binds to the handler-chosen `carrierSlot` so the
// measured carry geometry is the one the play set up; every OTHER role binds to its
// authored matchday slot. This keeps the rng()-chosen carrier (the legacy seam)
// authoritative while the play shapes the run lines around him.
export function createPlayOverlay(world: World, p: ShapeParams, play: Play): PlayOverlayState | null {
  const base = p.attackSide === 'home' ? 0 : AGENTS_PER_SIDE;
  const carrierRoleName = findCarrierRole(play);
  const roles: BoundRole[] = [];
  let carrier: Agent | null = null;

  for (const [name, role] of Object.entries(play.roles)) {
    const isCarrier = name === carrierRoleName;
    const slot = isCarrier ? p.carrierSlot : role.slot;
    const agent = world.agents[base + slot - 1];
    if (!agent || agent.role === 'empty') {
      if (isCarrier) return null;   // no carrier to bind → no play
      continue;                     // drop a degraded support role
    }
    roles.push({ name, agent, line: role.line, wpIdx: 0, isCarrier });
    if (isCarrier) carrier = agent;
  }
  if (!carrier) return null;

  const ov: PlayOverlayState = {
    play,
    origin: { x: p.mark.x, y: p.mark.y },
    attackDir: p.attackDir,
    openSign: openSignFor(p.mark.y),
    carrier,
    roles,
    ballHolder: carrier,            // overwritten below to the opening holder
    transfers: [],
    nextTransfer: 0,
    aborted: false,
    abortTick: -1,
  };

  // The opening ball-holder is the role that performs the first ball action that is
  // NOT a receive (a pass / dummy / carry) — he has the ball fed to him from the ruck
  // at play start. Fall back to the carrier if no role passes (a solo strike line).
  let holder = carrier;
  let holderT = Infinity;
  for (const r of roles) {
    const role = play.roles[r.name];
    if (!role.actions) continue;
    for (const a of role.actions) {
      if (a.do === 'receive') continue;
      if (a.t < holderT) { holderT = a.t; holder = r.agent; }
    }
  }
  ov.ballHolder = holder;

  // Build the pass schedule: each `pass` action hands the ball to the named role's
  // agent, completing after the pass flight. `dummy` keeps the ball (it is a sell);
  // `receive`/`carry` are the catching/running side, not transfers.
  const byName = new Map(roles.map(r => [r.name, r.agent]));
  for (const r of roles) {
    const role = play.roles[r.name];
    if (!role.actions) continue;
    for (const a of role.actions) {
      if (a.do !== 'pass' || !a.to) continue;
      const to = byName.get(a.to);
      if (to) ov.transfers.push({ t: a.t + PASS_CHAIN.flightTicks, to });
    }
  }
  ov.transfers.sort((x, y) => x.t - y.t);

  // Install each role's opening target (its first waypoint) so the agents leave the
  // set piece on their authored lines from tick 0.
  for (const r of roles) installTarget(ov, r);
  return ov;
}

// Per-tick Layer-1 drive (Upgrade.md § 7.1). Advances each bound role to its current
// waypoint target and processes any ball hand-overs due by tick `t`. Must run AFTER
// the ShapeSolver re-anchors so it WINS the one-driver contest for the bound agents.
// A no-op once aborted — the re-anchors then own every agent again.
export function driveOverlayTick(ov: PlayOverlayState, t: number): void {
  if (ov.aborted) return;
  for (const r of ov.roles) {
    // Advance to the latest waypoint whose scheduled tick has passed; the steering
    // layer leads the agent onto the NEXT one (run-onto-the-line timing).
    while (r.wpIdx < r.line.length - 1 && r.line[r.wpIdx].t <= t) r.wpIdx++;
    installTarget(ov, r);
  }
  while (ov.nextTransfer < ov.transfers.length && ov.transfers[ov.nextTransfer].t <= t) {
    ov.ballHolder = ov.transfers[ov.nextTransfer].to;
    ov.nextTransfer++;
  }
}

// Couple the ball to the current holder (the overlay's postMove). While the play is
// live the ball travels with whoever holds it (the feeder, then the strike runner);
// the carry's contact/gap verdict is measured against the carrier once he has it.
export function couplePlayBall(ov: PlayOverlayState, world: World): void {
  const ball = world.ball;
  ball.pos.x = ov.ballHolder.pos.x;
  ball.pos.y = ov.ballHolder.pos.y;
  ball.carrierSlot = ov.ballHolder.slot;
  ball.carrierSide = ov.ballHolder.side;
}

// True once the measured carrier is actually carrying the ball — the gate the caller
// uses to suppress contact until the strike runner has received (a defender reaching
// a decoy who has no ball is not a tackle).
export function carrierHasBall(ov: PlayOverlayState): boolean {
  return ov.ballHolder === ov.carrier;
}

// Evaluate the play's abort conditions for tick `t` (Upgrade.md § 7.1). Returns true
// the tick an abort fires; the caller then stops driving the overlay (the bound roles
// revert to ShapeSolver targets) and reverts the carrier to a forward corridor run so
// there is no position discontinuity. Deterministic geometry — no rng draw.
export function evaluatePlayAborts(ov: PlayOverlayState, world: World, p: ShapeParams, t: number): boolean {
  if (ov.aborted) return false;
  const defBase = p.defendSide === 'home' ? 0 : AGENTS_PER_SIDE;
  const nextReceiver = ov.nextTransfer < ov.transfers.length ? ov.transfers[ov.nextTransfer].to : null;

  let fire = false;
  for (const kind of ov.play.abort) {
    if (kind === 'receiver_covered' && nextReceiver) {
      if (nearestDefenderDist(world, defBase, nextReceiver.pos) <= PLAY_OVERLAY.receiverCoverRadius) fire = true;
    } else if (kind === 'intercept_risk' && nextReceiver) {
      if (nearestDefenderToSegment(world, defBase, ov.ballHolder.pos, nextReceiver.pos) <= PLAY_OVERLAY.interceptLaneRadius) fire = true;
    } else if (kind === 'turnover' && carrierHasBall(ov)) {
      const supportDist = nearestSupportDist(ov);
      if (supportDist > PLAY_OVERLAY.isolationRadius &&
          nearestDefenderDist(world, defBase, ov.carrier.pos) <= PLAY_OVERLAY.turnoverRadius) fire = true;
    }
    if (fire) break;
  }
  if (!fire) return false;

  ov.aborted = true;
  ov.abortTick = t;
  abortRevertCarrier(ov);
  return true;
}

// On abort, hand the carrier a fresh forward corridor target from his CURRENT
// position (never a fixed mark-relative point — that could send him backward into
// his support). He keeps running forward; MovementSystem's accel cap makes the target
// switch continuous (velocity ramps; no teleport). The non-carrier bound roles need
// no special revert — the caller's ShapeSolver re-anchors drive them from this tick.
function abortRevertCarrier(ov: PlayOverlayState): void {
  ov.carrier.intent.target = {
    x: clampX(ov.carrier.pos.x + ov.attackDir * CARRY_CORRIDOR.carryReach),
    y: clampY(ov.carrier.pos.y),
  };
  ov.carrier.intent.driveLayer = 1;
  ov.carrier.intent.driveReason = 'play-abort';
}

// Set a bound role's steering target to its current waypoint (in place — no per-tick
// allocation beyond the target Vec2 the agent already owns). Tags the control layer
// for the frame debugger: a play is a Layer-1 ROLE override for its named roles.
function installTarget(ov: PlayOverlayState, r: BoundRole): void {
  const tgt = waypointTarget(ov, r.line[r.wpIdx]);
  if (r.agent.intent.target) { r.agent.intent.target.x = tgt.x; r.agent.intent.target.y = tgt.y; }
  else r.agent.intent.target = tgt;
  r.agent.role = 'corridor';   // overlay-driven attacker: its Layer 1 is the play
  r.agent.intent.driveLayer = 1;
  r.agent.intent.driveReason = `play:${ov.play.id}/${r.name}`;
}

// The carrier role = the role that performs a `carry` action (the strike runner who
// ends up with the ball). If several do, the LAST-carrying role wins (the deepest
// strike). If none does (every role only passes/receives), fall back to the last
// role that receives — he is the end of the chain. Determinism: Object.entries
// preserves insertion order, so the pick is stable across runs.
function findCarrierRole(play: Play): string {
  let carry: string | null = null;
  let carryT = -1;
  let lastReceive: string | null = null;
  let receiveT = -1;
  for (const [name, role] of Object.entries(play.roles)) {
    if (!role.actions) continue;
    for (const a of role.actions) {
      if (a.do === 'carry' && a.t >= carryT) { carry = name; carryT = a.t; }
      if (a.do === 'receive' && a.t >= receiveT) { lastReceive = name; receiveT = a.t; }
    }
  }
  return carry ?? lastReceive ?? Object.keys(play.roles)[0];
}

// Smallest distance from `point` to any active (non-empty) defender on the defending
// side. Index iteration over the defending block — allocation-free.
function nearestDefenderDist(world: World, defBase: number, point: Vec2): number {
  let best = Infinity;
  for (let i = 0; i < AGENTS_PER_SIDE; i++) {
    const d = world.agents[defBase + i];
    if (d.role === 'empty') continue;
    const dist = Math.hypot(d.pos.x - point.x, d.pos.y - point.y);
    if (dist < best) best = dist;
  }
  return best;
}

// Smallest perpendicular distance from any active defender to the segment a→b (the
// live pass lane). A defender level with the lane is the interception threat.
function nearestDefenderToSegment(world: World, defBase: number, a: Vec2, b: Vec2): number {
  let best = Infinity;
  for (let i = 0; i < AGENTS_PER_SIDE; i++) {
    const d = world.agents[defBase + i];
    if (d.role === 'empty') continue;
    const dist = pointSegmentDist(d.pos, a, b);
    if (dist < best) best = dist;
  }
  return best;
}

// Smallest distance from the carrier to any OTHER bound role's agent — the strike
// runner's nearest authored support. Large ⇒ isolated.
function nearestSupportDist(ov: PlayOverlayState): number {
  let best = Infinity;
  for (const r of ov.roles) {
    if (r.agent === ov.carrier) continue;
    const dist = Math.hypot(r.agent.pos.x - ov.carrier.pos.x, r.agent.pos.y - ov.carrier.pos.y);
    if (dist < best) best = dist;
  }
  return best;
}

// Perpendicular distance from point p to segment a→b (geometry — exempt from the
// balance rule). Degenerate (a == b) falls back to point distance.
function pointSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

function clampX(v: number): number {
  return v < 2 ? 2 : v > 98 ? 98 : v;
}
function clampY(v: number): number {
  return v < 3 ? 3 : v > 97 ? 97 : v;
}
