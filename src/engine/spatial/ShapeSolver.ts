// The defensive ShapeSolver + minimal carry corridor (Upgrade.md §§ 5.2, 5.3,
// 6 Layer 1; WP2). Layer 1 of the three-layer control stack: it assigns
// DESTINATIONS only (each agent's intent.target) — it never moves anyone. The
// MovementSystem steers agents to those targets over the micro-ticks.
//
// WP2 owns the DEFENCE half (line slots, fold, backfield, offside plane) and a
// deliberately primitive ATTACK corridor (carrier + a small support pod). The
// full attack shape — pods, depth, run-timing, pass windows — is WP5.
//
// All randomness is `rngSpatial` (CLAUDE.md § 7; enforced by the
// checkDeterminism external-consumer scan — this file lives in src/engine/
// spatial/ so it is permitted to call it). No outcome-stream (`rng`) draw ever
// happens here; the spatial verdict cannot perturb the legacy carry stream.
//
// All tuning is in balance/spatialShape.ts + balance/spatialSteering.ts — no
// magic literals here (CLAUDE.md balance rule). Coordinates are the existing
// 0–100 pitch space (Upgrade.md § 2.6): x = long axis, y = lateral.

import type { PossessionSide } from '../../types/engine';
import type { DefensiveLine, Discipline, AttackingStyle } from '../../types/team';
import { rngSpatial } from '../../utils/rng';
import {
  DEFENSIVE_LINE,
  DEFENCE_REANCHOR,
  LINE_SLOT_COUNT,
  LINE_OPEN_REDIRECT_CAP,
  BACKFIELD_DEPTH,
  BACKFIELD_SPREAD,
  OFFSIDE,
  OFFSIDE_TEAM_SCALE,
  CARRY_CORRIDOR,
  ATTACK_SPREAD,
  FORWARD_POD,
  GAP_BREAK,
} from '../balance/spatialShape';
import { PASS_CHAIN } from '../balance/spatialDecision';
import { AUTHORED_ATTACK_SHAPES } from '../balance/attackShapes';
import { deriveFoldSpeedMult } from '../balance/spatialSteering';
import { isForwardSlot, SLOT } from '../Slot';
import type { Agent } from './types';
import { AGENTS_PER_SIDE } from './World';
import type { World } from './World';

// The fixed inputs the solver needs from MatchState, snapshotted by the caller
// so the solver stays a pure function over (world, params) and never imports
// MatchState. `mark` is the breakdown / origin the line anchors on (the ball
// at carry start); `attackDir` is +1 (attacking toward x=100) or -1.
export interface ShapeParams {
  attackSide: PossessionSide;
  defendSide: PossessionSide;
  attackDir: 1 | -1;
  mark: { x: number; y: number };
  defensiveLine: DefensiveLine;
  backfield: 1 | 2;             // resolved BACKFIELD_COUNT for the tactic
  defendDiscipline: Discipline; // team discipline tactic (offside creep scale)
  carrierSlot: number;          // attacking matchday slot of the ball carrier
  attackingStyle: AttackingStyle; // drives the forward-pod spread (WP5)
}

// One defender's resolved line role — used by the gap-detection and offside
// passes after the micro-ticks. `slotY` is the lateral position of his slot on
// the line; `isBackfield` exempts him from the offside plane.
export interface LineRole {
  agent: Agent;
  slotY: number;
  isBackfield: boolean;
}

// Helper: the home block is agents[0..14], away is [15..29]. Empty slots (a
// side reduced below 15 by a card, role 'empty') are skipped — they hold no
// player, so they never join the line, corridor, spread, or gap/offside contest.
function sideAgents(world: World, side: PossessionSide): Agent[] {
  const base = side === 'home' ? 0 : AGENTS_PER_SIDE;
  return world.agents.slice(base, base + AGENTS_PER_SIDE).filter(a => a.role !== 'empty');
}

// ── Defensive shape (Upgrade.md § 5.2) ────────────────────────────────────
// Assigns every defender a target: front-line slots anchored at the mark,
// 1–2 backfield deep, the remainder folding toward the nearest line slot.
// Returns the resolved line roles for the post-tick gap + offside passes.
export function solveDefence(world: World, p: ShapeParams): LineRole[] {
  const defenders = sideAgents(world, p.defendSide);
  const cfg = DEFENSIVE_LINE[p.defensiveLine];

  // The line sets up `standOff` in FRONT of the mark (toward the attackers,
  // i.e. against attackDir from the defenders' view they face -attackDir).
  const lineX = p.mark.x + p.attackDir * cfg.standOff;
  // Backfield posts DEEP behind the line, toward the DEFENDING try line — the
  // line the attackers are running AT, which sits at +attackDir from the mark
  // (attackDir points toward the defenders' goal). So the backfield is +attackDir
  // BEHIND the front line, never on the attackers' side of the mark.
  const backX = p.mark.x + p.attackDir * BACKFIELD_DEPTH;

  // Pick the backfield defenders by matchday slot — the back three who cover
  // kicks: fullback (15) first, then wings (14, 11). Preference order is fixed
  // and deterministic; it is positional data (jersey-number checks, exempted
  // from the balance rule per CLAUDE.md). If a back-three slot is absent (empty
  // role — a carded side) or not in the active defenders list, fall through to
  // the next back-three slot. If all three back-three slots are unavailable,
  // fall back to the next-deepest available back (slots 9–15) by position, and
  // as a last resort to the legacy depth sort. The World was built from
  // onFieldPlayers so sin-binned/injured players are already excluded.
  const BACK_THREE_PREFERENCE = [SLOT.FULL_BACK, SLOT.WING_14, SLOT.WING_11];
  const backfield = new Set<Agent>();
  for (const slotNum of BACK_THREE_PREFERENCE) {
    if (backfield.size >= p.backfield) break;
    const agent = defenders.find(d => d.slot === slotNum);
    if (agent) backfield.add(agent);
  }
  // Fallback 1: any remaining back (slots 9–15) not already chosen, deepest first.
  if (backfield.size < p.backfield) {
    const remainingBacks = defenders
      .filter(d => d.slot >= 9 && d.slot <= 15 && !backfield.has(d))
      .sort((a, b) => (b.pos.x - a.pos.x) * p.attackDir * -1);
    for (const agent of remainingBacks) {
      if (backfield.size >= p.backfield) break;
      backfield.add(agent);
    }
  }
  // Fallback 2 (last resort): depth sort over all remaining defenders.
  if (backfield.size < p.backfield) {
    const byDepth = defenders
      .filter(d => !backfield.has(d))
      .sort((a, b) => (b.pos.x - a.pos.x) * p.attackDir * -1);
    for (const agent of byDepth) {
      if (backfield.size >= p.backfield) break;
      backfield.add(agent);
    }
  }

  const lineDefenders = defenders.filter(d => !backfield.has(d));
  const roles: LineRole[] = [];

  // Lay out front-line slots centred on the mark's y, spaced by the tactic's
  // slotSpacing — with blindside slots that would clamp against a near touchline
  // redistributed to the OPEN side instead of packing (lineSlotYs). Assign nearest
  // defender to each slot greedily IN ORDER (centre-out from the ruck): this fills
  // the carrier's channel + inside FIRST with the closest defenders, fanning out —
  // the right defensive priority (cover the threat, then the width).
  const slotCount = Math.min(LINE_SLOT_COUNT, lineDefenders.length);
  const slotYs = lineSlotYs(p.mark.y, slotCount, cfg.slotSpacing);

  const unassigned = lineDefenders.slice();
  for (const slotY of slotYs) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < unassigned.length; i++) {
      const d = Math.abs(unassigned[i].pos.y - slotY);
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    const agent = unassigned.splice(bestIdx, 1)[0];
    setFoldTarget(agent, lineX, slotY);
    roles.push({ agent, slotY, isBackfield: false });
  }

  // Any line defenders beyond the slot count hold just behind their own y (the
  // inside pillars / extra bodies); fold them onto the line too.
  for (const agent of unassigned) {
    setFoldTarget(agent, lineX, agent.pos.y);
    roles.push({ agent, slotY: agent.pos.y, isBackfield: false });
  }

  // Backfield: post deep, spread laterally around the mark.
  const bfAgents = [...backfield];
  for (let i = 0; i < bfAgents.length; i++) {
    const offset = bfAgents.length === 1 ? 0 : (i === 0 ? -BACKFIELD_SPREAD / 2 : BACKFIELD_SPREAD / 2);
    const agent = bfAgents[i];
    agent.role = 'idle';
    agent.intent.target = { x: backX, y: clampY(p.mark.y + offset) };
    roles.push({ agent, slotY: p.mark.y + offset, isBackfield: true });
  }

  return roles;
}

// ── Per-tick defensive re-anchor (Bug ③, Upgrade.md § 5.2) ────────────────
// solveDefence runs ONCE before the loop, so its slot targets are static. This
// runs INSIDE the micro-tick loop (SpatialSimulator's preMove hook) to re-anchor
// the front line onto the LIVE carrier each tick so the defence visibly
// advances/folds as he runs the corridor. Backfield roles are left alone (deep
// kick cover, not the gain-line contest). ALLOCATION-FREE: mutates each role's
// existing intent.target Vec2 in place — no per-tick object creation.
//
//   • lateral: each slot's y target chases the carrier's y, blended by the
//     tactic's lateralTrack (drift slides most; blitz least), so the line folds
//     across to the carrier's channel.
//   • forward: the line presses UP toward the gain line, scaled by the tactic's
//     forwardPress (blitz presses hard; drift little), bounded by pressCap past
//     the opening line so it cannot rush past the mark — the offside sweep
//     (measured against the FIXED mark after the loop) stays coherent.
//
// Per-tick top speed is still enforced by MovementSystem's velocity clamp, so a
// pressing slot can never teleport — it accelerates onto the new target.
export function reanchorDefence(roles: LineRole[], carrier: Agent, p: ShapeParams): void {
  const cfg = DEFENSIVE_LINE[p.defensiveLine];
  const openingLineX = p.mark.x + p.attackDir * cfg.standOff;
  // How far the carrier has advanced past the mark along attackDir (≥0). The
  // line presses forward in proportion to this, so it only pushes up as the
  // carrier commits — never ahead of him at beat open.
  const carrierAdvance = Math.max(0, (carrier.pos.x - p.mark.x) * p.attackDir);
  const press = Math.min(DEFENCE_REANCHOR.pressCap, carrierAdvance * DEFENCE_REANCHOR.pressGain * cfg.forwardPress);
  const targetLineX = clampX(openingLineX + p.attackDir * press);
  for (const r of roles) {
    if (r.isBackfield) continue;
    const t = r.agent.intent.target;
    if (!t) continue;
    // Lateral: slide the slot's y toward the carrier's channel, blended by the
    // tactic's lateralTrack. trackGain bounds how fast the slot chases per tick.
    const dy = carrier.pos.y - r.slotY;
    const slide = dy * cfg.lateralTrack * DEFENCE_REANCHOR.trackGain;
    t.x = targetLineX;
    t.y = clampY(r.slotY + slide);
  }
}

// Re-anchor the support pod each tick so it TRAILS the carrier — support runners
// stay ONSIDE (never ahead of the ball, the way real cleaners follow the carry
// into contact). Without this the pod targets a fixed point ahead of the mark and
// a faster runner overtakes a slow carrier — the "support ahead of the ball /
// offside at the breakdown" look. In-place target update (no allocation), mirror
// of reanchorDefence. Support = the corridor-role attackers other than the carrier
// (set by solveCarryCorridor); each holds its lateral channel and sits
// supportDepth behind the carrier's current x along attackDir.
export function reanchorSupport(world: World, carrier: Agent, p: ShapeParams): void {
  const attackers = sideAgents(world, p.attackSide);
  const trailX = clampX(carrier.pos.x - p.attackDir * CARRY_CORRIDOR.supportDepth);
  for (const a of attackers) {
    if (a === carrier || a.role !== 'corridor') continue;
    const t = a.intent.target;
    if (!t) continue;
    t.x = trailX;  // y already encodes the runner's lateral channel beside the carrier
  }
}

// Re-anchor the off-ball attack shape (forward cluster + backline fan) each tick
// to hold its depth BEHIND THE LIVE GAIN LINE — the carrier's current x — instead
// of the static mark. WP2 anchored the spread to the mark and solved it once; on a
// continuation beat (no reseed) the shape then sat wherever it drifted from the
// previous phase, frequently AHEAD of the ball (offside). Anchoring depth to the
// carrier each tick keeps the whole attack onside as he advances: the shape
// translates forward with the gain line, the backs hold their width (fan from the
// mark's y), and a fast carrier (line break) simply pulls ahead of his support —
// support that can't keep up falls legally behind. Same rank logic + constants as
// solveAttackSpread; in-place target update (no allocation). Corridor agents
// (carrier + support pod) are skipped — they have their own re-anchors.
export function reanchorAttack(world: World, carrier: Agent, p: ShapeParams): void {
  layAttackShape(world, p, carrier.pos.x);
}

// Set an off-ball attacker's role + target (create or update in place — no
// allocation on the per-tick path).
function setAttackTarget(a: Agent, x: number, y: number): void {
  a.role = 'idle';
  if (a.intent.target) { a.intent.target.x = x; a.intent.target.y = y; }
  else a.intent.target = { x, y };
  a.intent.driveLayer = 1; a.intent.driveReason = 'shape';   // Layer 1 ROLE (re-set each beat)
}

// Lay the OFF-BALL attack shape (forward pods + backline) at depth behind the
// gain line `gainX` (the mark at seed, the carrier's x per tick). Corridor agents
// (carrier + support pod) are skipped — they have their own targets. Forwards set
// up as PODS fanned to the open side; backs form an angled backline deeper + wider
// per man. Deterministic: agents partitioned in slot-iteration order.
function layAttackShape(world: World, p: ShapeParams, gainX: number): void {
  const attackers = sideAgents(world, p.attackSide);
  const openSign = p.mark.y <= 50 ? 1 : -1;
  // An AUTHORED shape for this attacking style drives the slots it names (WP5 shape
  // editor); the rest fall back to the procedural pods/backline below.
  const shape = AUTHORED_ATTACK_SHAPES[p.attackingStyle];
  const offForwards: Agent[] = [];
  const offBacks: Agent[] = [];
  for (const a of attackers) {
    if (a.role === 'corridor' || a.slot === p.carrierSlot) continue;
    // The scrum-half holds the RUCK base (the mark), not the backline fan — so the
    // pass chain starts at the ball and he is always goal-side of the breakdown.
    if (a.slot === SLOT.SCRUM_HALF) {
      setAttackTarget(a, clampX(p.mark.x - p.attackDir * PASS_CHAIN.scrumHalfDepth), clampY(p.mark.y));
      continue;
    }
    const s = shape?.slots[a.slot];
    if (s) {
      // fwd is attack-oriented (negative = behind the gain line); lat is toward the
      // open side and mirrored to the live open side via openSign.
      setAttackTarget(a, clampX(gainX + p.attackDir * s.fwd), clampY(p.mark.y + openSign * s.lat));
      continue;
    }
    (isForwardSlot(a.slot) ? offForwards : offBacks).push(a);
  }
  // Forwards → pods. Pod centres fan toward the open side, spaced per attacking
  // style (tight = near the ruck, wide = flung to the edges); within a pod the
  // members bunch tightly with a small lateral + depth stagger.
  const podSpread = FORWARD_POD.spread[p.attackingStyle];
  for (let i = 0; i < offForwards.length; i++) {
    const podIndex = Math.floor(i / FORWARD_POD.podSize);
    const inPod = i % FORWARD_POD.podSize;
    const podY = p.mark.y + openSign * (podSpread.firstPodOffset + podIndex * podSpread.podSpacing);
    const sign = inPod % 2 === 0 ? 1 : -1;
    const lateral = sign * Math.ceil(inPod / 2) * FORWARD_POD.inPodSpread;
    const depth = FORWARD_POD.podDepth + inPod * FORWARD_POD.inPodStagger;
    setAttackTarget(offForwards[i], clampX(gainX - p.attackDir * depth), clampY(podY + lateral));
  }
  // Backs → angled backline off the open side, deeper + wider per man.
  for (let i = 0; i < offBacks.length; i++) {
    const lateral = openSign * (ATTACK_SPREAD.backFirstOffset + i * ATTACK_SPREAD.backLateralStep);
    const depth = ATTACK_SPREAD.backDepth + i * ATTACK_SPREAD.backDepthStep;
    setAttackTarget(offBacks[i], clampX(gainX - p.attackDir * depth), clampY(p.mark.y + lateral));
  }
}

// Lateral slot ys, centred on `centreY`, alternating out: 0, +s, -s, +2s, -2s …
function lineSlotYs(centreY: number, count: number, spacing: number): number[] {
  // Centre-out alternating slots (ruck guard, then ±spacing out), BUT a slot that
  // would clamp against a near touchline is redirected to extend the OTHER side
  // instead of packing against the line. So a wide ruck spreads its defenders
  // across the open field (the user's "bunched on the touchline" fix) while a
  // central ruck — where nothing clamps — is byte-identical to the old symmetric
  // layout (same positions AND order), preserving the tuned fold/2-on-1 behaviour.
  // Generation order is preserved (centre-out, − side first on ties) so the
  // greedy in-order assignment in solveDefence keeps its cover-the-threat-first
  // priority.
  const LO = 3, HI = 97;  // clampY bounds
  const ys: number[] = [clampY(centreY)];  // ruck guard (i = 0)
  let posRank = 0;  // ranks already placed on the +y side
  let negRank = 0;  // ranks already placed on the −y side
  let redirects = 0;  // clamped slots moved to the open side
  for (let i = 1; i < count; i++) {
    const wantNeg = i % 2 === 1;  // original alternation: i=1,3,5… take the −y side first
    if (wantNeg) {
      const y = centreY - (negRank + 1) * spacing;
      if (y >= LO) { negRank++; ys.push(y); }
      else if (redirects < LINE_OPEN_REDIRECT_CAP) { redirects++; posRank++; ys.push(clampY(centreY + posRank * spacing)); }
      else { negRank++; ys.push(clampY(y)); }  // cap reached: pack the touchline as before
    } else {
      const y = centreY + (posRank + 1) * spacing;
      if (y <= HI) { posRank++; ys.push(y); }
      else if (redirects < LINE_OPEN_REDIRECT_CAP) { redirects++; negRank++; ys.push(clampY(centreY - negRank * spacing)); }
      else { posRank++; ys.push(clampY(y)); }
    }
  }
  return ys;
}

// Set a defender's fold target + fold-speed scaling. The fold speed is the
// agent's derived work rate (stamina + positioning) × fatigue, written onto
// `speedScale` so MovementSystem folds him in slower. Slow folders (low work
// rate / fatigued) reach their slot later → overlaps (Upgrade.md § 5.2). The
// World is rebuilt every spatial entry so speedScale never leaks across phases.
function setFoldTarget(agent: Agent, x: number, y: number): void {
  agent.role = 'idle';
  agent.intent.target = { x, y: clampY(y) };
  agent.speedScale = deriveFoldSpeedMult(agent.stamina, agent.positioning, agent.fatigueSnapshot);
  agent.intent.driveLayer = 1; agent.intent.driveReason = 'line/fold';  // Layer 1 ROLE
}

// ── Carry corridor (Upgrade.md § 5.3, minimal) ────────────────────────────
// The carrier runs up the corridor; a small support pod tracks at authored
// offsets. The rest of the attack holds station (no target). Returns the
// carrier agent for the gap-detection pass.
export function solveCarryCorridor(world: World, p: ShapeParams): Agent {
  const attackers = sideAgents(world, p.attackSide);
  const carrier = attackers.find(a => a.slot === p.carrierSlot) ?? attackers[0];

  // Carrier target: run FORWARD from his CURRENT position along attackDir (not
  // back to a fixed mark-relative point). On a fresh beat seedFormation has just
  // snapped him onto the mark, so this equals mark + carryReach as before. On a
  // CONTINUATION beat he carried over from the previous phase — often AHEAD of
  // mark + carryReach (e.g. after a line break) — and a mark-relative target would
  // make him run BACKWARD into his own support, stranding the whole attack ahead
  // of the ball (offside). Anchoring the reach to his own position keeps him going
  // forward and the re-anchored shape (reanchorAttack) onside behind him. He holds
  // his current lateral lane. Role 'corridor' tells seedFormation his OPENING start
  // is the mark (the target is a RUN destination, not a formation slot).
  // The carrier ENGAGES FROM THE RUCK: snap him onto the mark each beat. On a
  // fresh beat seedFormation does this anyway; on a CONTINUATION beat the nominal
  // carrier is a different player sitting out in the shape — he comes to the
  // breakdown to take the recycled ball (which is AT the mark). Without this he
  // runs from wherever he was last phase, dragging the coupled ball backward and
  // stranding the whole attack ahead of him (the offside / "ball goes backwards"
  // look). The off-ball shape is NOT snapped — it continues, held onside behind
  // him by reanchorAttack. In the continuity sequence the mark tracks the carrier,
  // so this is a no-op there (no teleport); in a live match the NEW carrier
  // legitimately arrives at the ruck.
  // WHERE the carrier receives depends on who he is. A FORWARD engages from the
  // ruck — snapped onto the mark (the recycled ball is there). A BACK receives the
  // pass OUT WIDE in the backline, slightly behind the gain line, then runs onto
  // the line — the pass phase (runCarrySim) sweeps the ball to him here, so a wide
  // play's carry actually happens out wide instead of teleporting to the mark.
  if (isForwardSlot(p.carrierSlot)) {
    carrier.pos.x = clampX(p.mark.x);
    carrier.pos.y = clampY(p.mark.y);
  } else {
    const openSign = p.mark.y <= 50 ? 1 : -1;
    carrier.pos.x = clampX(p.mark.x - p.attackDir * PASS_CHAIN.receiveDepth);
    carrier.pos.y = clampY(p.mark.y + openSign * PASS_CHAIN.receiveWidth);
  }
  carrier.vel.x = 0;
  carrier.vel.y = 0;
  carrier.role = 'corridor';
  // Run FORWARD from wherever he received (the snap point above), holding his lane.
  carrier.intent.target = { x: clampX(carrier.pos.x + p.attackDir * CARRY_CORRIDOR.carryReach), y: clampY(carrier.pos.y) };

  // Support pod: the nearest few attackers to the breakdown follow the carry in.
  // Seeded just BEHIND the mark; reanchorSupport then trails them behind the
  // carrier each tick so they stay onside (never ahead of the ball).
  const support = attackers
    .filter(a => a !== carrier)
    .sort((a, b) => dist(a.pos, carrier.pos) - dist(b.pos, carrier.pos))
    .slice(0, CARRY_CORRIDOR.supportCount);
  const supportSet = new Set(support);
  for (let i = 0; i < support.length; i++) {
    const pairRank = Math.floor(i / 2);
    const sign = i % 2 === 0 ? 1 : -1;
    const lateral = sign * (CARRY_CORRIDOR.supportLateralOffset + pairRank * CARRY_CORRIDOR.supportLateralStep);
    support[i].role = 'corridor';
    support[i].intent.target = {
      x: clampX(p.mark.x - p.attackDir * CARRY_CORRIDOR.supportDepth),
      y: clampY(p.mark.y + lateral),
    };
  }
  // Everyone else is an off-ball shape agent. Reset any stale 'corridor' role left
  // by a previous beat's pod so reanchorAttack (which skips 'corridor') drives them.
  for (const a of attackers) {
    if (a === carrier || supportSet.has(a)) continue;
    a.role = 'idle';
    a.intent.target = null;
  }
  return carrier;
}

// ── Attack placeholder spread (Upgrade.md § 5.3; beat-opening shape) ───────
// Run AFTER solveCarryCorridor: it fills a credible placeholder target for
// every attacker the corridor solve left with no target (i.e. not the carrier
// and not the support pod). Forwards pack in a loose cluster just behind the
// mark; backs fan out toward the open side with progressive width + depth
// behind the gain line. This is NOT the full pod model (WP5) — it only exists
// so seedFormation can snap these attackers off the ball into a believable
// opening shape. All offsets are oriented by attackDir; the open side is the
// wider half of the pitch from the mark so the backline always has room to run.
export function solveAttackSpread(world: World, p: ShapeParams): void {
  // Seed-time opening shape: same pod + backline layout as the per-tick re-anchor,
  // anchored to the mark (the carrier opens AT the mark). seedFormation then snaps
  // every off-ball attacker onto these targets.
  layAttackShape(world, p, p.mark.x);
}

// ── Gap detection → line-break verdict (Upgrade.md § 5.2) ─────────────────
// Run AFTER the micro-ticks. Measures the lateral gap from the carrier's
// running line to the NEAREST front-line defender, adjusts for the carrier's
// evasion potential and that defender's cover, adds a small rngSpatial noise
// band, and returns whether the corridor opened into a line break plus WHO the
// nearest line defender is (the tackler the legacy formula resolves against).
export interface GapVerdict {
  lineBreak: boolean;
  nearestDefender: Agent;   // nearest front-line defender = the tackler
  spatialMetres: number;    // metres the carrier covers through the gap (line break only)
}

// `modShift` is the legacy carry net modifier (attackMod − defendMod): home
// advantage, team talk, tactical evasion shifts. A positive shift lowers the
// gap needed to break so those match-shaping modifiers still bias line breaks.
export function detectGap(carrier: Agent, roles: LineRole[], modShift: number, attackDir: 1 | -1): GapVerdict {
  // Nearest front-line defender to the carrier's CHANNEL (line defenders only —
  // the backfield is for kick cover, not the gain-line contest). The gap is
  // LATERAL-dominant: a defender level with or ahead of the carrier contributes
  // his |Δy| (lateral coverage); a defender BEHIND the carrier is partly beaten,
  // so his along-axis deficit is added with a penalty weight — a folding line
  // that hasn't reached the carrier's channel leaves a large effective gap, the
  // emergent overlap payoff (Upgrade.md § 5.2). Pure Euclidean distance would
  // wrongly count a defender the carrier has simply run PAST as "covering".
  let nearest = roles.find(r => !r.isBackfield)?.agent ?? roles[0].agent;
  let nearestGap = Infinity;
  for (const r of roles) {
    if (r.isBackfield) continue;
    const dy = Math.abs(r.agent.pos.y - carrier.pos.y);
    const behind = Math.max(0, (carrier.pos.x - r.agent.pos.x) * attackDir);
    const gap = dy + behind * GAP_BREAK.behindWeight;
    if (gap < nearestGap) { nearestGap = gap; nearest = r.agent; }
  }

  // Effective break threshold = base − evasion swing + cover swing − mod swing.
  // A more evasive carrier needs a smaller gap; better cover needs a bigger gap;
  // a net-positive carry modifier (favoured attack) needs a smaller gap.
  const evasion = attr01(carrier.agility * 0.5 + carrier.pace * 0.5);
  const cover = attr01(nearest.positioning * 0.4 + nearest.tackling * 0.3 + nearest.pace * 0.3);
  const modSwing = clampAbs(modShift * GAP_BREAK.modGapWeight, GAP_BREAK.modGapClamp);
  const threshold = GAP_BREAK.baseGapThreshold
    - GAP_BREAK.evasionGapSwing * evasion
    + GAP_BREAK.coverGapSwing * cover
    - modSwing;

  // rngSpatial noise band, centred on 0 (±half), so the verdict is not a hard
  // step (mirrors the rng(1,20) jitter the legacy resolver adds to each score).
  const noise = rngSpatial(0, GAP_BREAK.noiseBand) - GAP_BREAK.noiseBand / 2;
  const measuredGap = nearestGap + noise;

  const lineBreak = measuredGap >= threshold;
  const spatialMetres = lineBreak ? spatialBreakMetres(carrier.pace) : 0;
  return { lineBreak, nearestDefender: nearest, spatialMetres };
}

// Pace-scaled line-break metres on the spatial stream (mirrors the legacy
// pace-scaled gain, drawn via rngSpatial). Slow carriers get the smaller range.
function spatialBreakMetres(pace: number): number {
  const t = clamp01((pace - GAP_BREAK.paceAtFloor) / (GAP_BREAK.paceAtFull - GAP_BREAK.paceAtFloor));
  const lo = GAP_BREAK.metresMin[0] + t * (GAP_BREAK.metresMax[0] - GAP_BREAK.metresMin[0]);
  const hi = GAP_BREAK.metresMin[1] + t * (GAP_BREAK.metresMax[1] - GAP_BREAK.metresMin[1]);
  return Math.max(GAP_BREAK.metresFloor, rngSpatial(Math.round(lo), Math.round(hi)));
}

// ── Offside plane (Upgrade.md § 5.2) ──────────────────────────────────────
// After the micro-ticks, measure how far each front-line defender crept past
// the offside plane (the mark, along attackDir). The worst offender, if his
// creep exceeds the threshold, is rolled (rngSpatial) into an offside penalty.
// Returns the offending agent when a penalty should be awarded, else null. The
// `tackler` (nearest defender who engaged the carrier) is excluded — he is
// legitimately advancing to make the tackle, not creeping offside ahead of the
// line; offside is about the REST of the line pushing up before ball-out.
export function detectOffside(roles: LineRole[], p: ShapeParams, tackler?: Agent): Agent | null {
  let worst: Agent | null = null;
  let worstCreep = 0;
  for (const r of roles) {
    if (r.isBackfield) continue;
    if (r.agent === tackler) continue;
    const a = r.agent;
    // How far the defender's slot sits past the mark toward the attackers, plus
    // the baseCreep an average line drifts before ball-out. This raw advance is
    // the geometric component (positive = ahead of the plane).
    const advance = (a.pos.x - p.mark.x) * p.attackDir + OFFSIDE.baseCreep;
    if (advance <= 0) continue;
    // EFFECTIVE creep amplifies the advance for poorly-drilled defenders and
    // risky teams. A high discipline+positioning defender SHRINKS his creep
    // (holds the line); a low one AMPLIFIES it. The team `discipline` tactic
    // scales on top — risky pushes the line, cautious holds. So low-discipline
    // risky sides creep materially more and ping materially more often.
    const disc01 = attr01(a.discipline * 0.6 + a.positioning * 0.4);
    const discScale = OFFSIDE.disciplineScaleWorst + (OFFSIDE.disciplineScaleBest - OFFSIDE.disciplineScaleWorst) * disc01;
    const creep = advance * discScale * OFFSIDE_TEAM_SCALE[p.defendDiscipline];
    if (creep > worstCreep) { worstCreep = creep; worst = a; }
  }
  if (!worst || worstCreep < OFFSIDE.penaltyThreshold) return null;
  // Roll the single worst offender. The discipline + tactic scaling already
  // shaped the creep; the roll percentage is flat so the aggregate rate folds
  // into the penalty band.
  if (rngSpatial(1, 100) <= OFFSIDE.penaltyRollPct) return worst;
  return null;
}

// ── small math helpers (geometry exempt from the balance rule) ────────────
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
// Map an authored 1–100 attribute (or weighted blend) to 0–1.
function attr01(v: number): number {
  return clamp01((v - 1) / 99);
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampY(v: number): number {
  return v < 3 ? 3 : v > 97 ? 97 : v;
}
function clampX(v: number): number {
  return v < 2 ? 2 : v > 98 ? 98 : v;
}
function clampAbs(v: number, mag: number): number {
  return v < -mag ? -mag : v > mag ? mag : v;
}
