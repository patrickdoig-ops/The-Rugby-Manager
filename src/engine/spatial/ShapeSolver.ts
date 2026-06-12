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
import type { DefensiveLine, Discipline } from '../../types/team';
import { rngSpatial } from '../../utils/rng';
import {
  DEFENSIVE_LINE,
  LINE_SLOT_COUNT,
  BACKFIELD_DEPTH,
  BACKFIELD_SPREAD,
  OFFSIDE,
  OFFSIDE_TEAM_SCALE,
  CARRY_CORRIDOR,
  ATTACK_SPREAD,
  GAP_BREAK,
} from '../balance/spatialShape';
import { deriveFoldSpeedMult } from '../balance/spatialSteering';
import { isForwardSlot } from '../Slot';
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
}

// One defender's resolved line role — used by the gap-detection and offside
// passes after the micro-ticks. `slotY` is the lateral position of his slot on
// the line; `isBackfield` exempts him from the offside plane.
interface LineRole {
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
  // Backfield posts behind the line toward the defending try line (along
  // attackDir away from the attackers = -attackDir from the mark).
  const backX = p.mark.x - p.attackDir * BACKFIELD_DEPTH;

  // Pick the backfield defenders: the agents already deepest toward their own
  // line (largest -attackDir distance from the mark) — mirrors pickFullback
  // posting the back three. Sorted copy; no MatchState lookup needed because
  // the World was built from onFieldPlayers (sin-binned/injured excluded).
  const byDepth = defenders.slice().sort((a, b) => (b.pos.x - a.pos.x) * p.attackDir * -1);
  const backfield = new Set(byDepth.slice(0, p.backfield));

  const lineDefenders = defenders.filter(d => !backfield.has(d));
  const roles: LineRole[] = [];

  // Lay out front-line slots centred on the mark's y, alternating out from the
  // centre, spaced by the tactic's slotSpacing. Assign nearest defender to each
  // slot greedily by current lateral position so folds stay short.
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

  // Any line defenders beyond the slot count hold just behind their nearest
  // slot edge (the inside pillars / extra bodies); fold them onto the line too.
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

// Lateral slot ys, centred on `centreY`, alternating out: 0, +s, -s, +2s, -2s …
function lineSlotYs(centreY: number, count: number, spacing: number): number[] {
  const ys: number[] = [];
  for (let i = 0; i < count; i++) {
    const rank = Math.ceil(i / 2);
    const sign = i % 2 === 0 ? 1 : -1;
    ys.push(clampY(centreY + sign * rank * spacing));
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
}

// ── Carry corridor (Upgrade.md § 5.3, minimal) ────────────────────────────
// The carrier runs up the corridor; a small support pod tracks at authored
// offsets. The rest of the attack holds station (no target). Returns the
// carrier agent for the gap-detection pass.
export function solveCarryCorridor(world: World, p: ShapeParams): Agent {
  const attackers = sideAgents(world, p.attackSide);
  const carrier = attackers.find(a => a.slot === p.carrierSlot) ?? attackers[0];

  // Carrier target: up the corridor along attackDir, holding the mark's lateral
  // line. carryReach sets how far ahead he aims each solve. Role 'corridor' tells
  // seedFormation his OPENING start is the mark (his target is a RUN destination,
  // not a formation slot — snapping pos onto it would teleport him downfield).
  carrier.role = 'corridor';
  carrier.intent.target = { x: clampX(p.mark.x + p.attackDir * CARRY_CORRIDOR.carryReach), y: clampY(p.mark.y) };

  // Support pod: nearest few attackers (by distance to the carrier) get targets
  // slightly behind and lateral to the carrier, alternating sides. Role 'corridor'
  // so seedFormation seeds their opening start just behind the mark at the same
  // lateral channel as their target. Picked by current distance to the carrier;
  // at beat start every attacker is on the ball so the pick is array-order stable.
  const support = attackers
    .filter(a => a !== carrier)
    .sort((a, b) => dist(a.pos, carrier.pos) - dist(b.pos, carrier.pos))
    .slice(0, CARRY_CORRIDOR.supportCount);
  for (let i = 0; i < support.length; i++) {
    const pairRank = Math.floor(i / 2);
    const sign = i % 2 === 0 ? 1 : -1;
    const lateral = sign * (CARRY_CORRIDOR.supportLateralOffset + pairRank * CARRY_CORRIDOR.supportLateralStep);
    support[i].role = 'corridor';
    support[i].intent.target = {
      x: clampX(p.mark.x + p.attackDir * (CARRY_CORRIDOR.carryReach - CARRY_CORRIDOR.supportDepth)),
      y: clampY(p.mark.y + lateral),
    };
  }
  // Everyone else holds (no target) — solveAttackSpread fills the placeholder
  // forward cluster + backline fan next; resetWorld left them role 'idle'.
  for (const a of attackers) {
    if (a !== carrier && !support.includes(a)) a.intent.target = null;
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
  const attackers = sideAgents(world, p.attackSide);
  // Open side = the touchline further from the mark (more room). +1 ⇒ toward
  // y=100, -1 ⇒ toward y=0.
  const openSign = p.mark.y <= 50 ? 1 : -1;

  let fwdRank = 0;
  let backRank = 0;
  for (const a of attackers) {
    if (a.intent.target) continue; // carrier or support pod already placed
    if (isForwardSlot(a.slot)) {
      // Loose forward cluster behind the mark, alternating off the mark's y with
      // a small along-axis stagger so the pack is not flat.
      const pairRank = Math.floor(fwdRank / 2);
      const sign = fwdRank % 2 === 0 ? 1 : -1;
      const lateral = sign * (pairRank + 1) * (ATTACK_SPREAD.forwardClusterSpread / 2);
      const stagger = pairRank * ATTACK_SPREAD.forwardClusterStagger;
      a.role = 'idle';
      a.intent.target = {
        x: clampX(p.mark.x - p.attackDir * (ATTACK_SPREAD.forwardClusterDepth + stagger)),
        y: clampY(p.mark.y + lateral),
      };
      fwdRank++;
    } else {
      // Backline fans out toward the open side, each back wider + deeper — the
      // classic angled backline carrying width + depth behind the gain line.
      const lateral = openSign * (ATTACK_SPREAD.backFirstOffset + backRank * ATTACK_SPREAD.backLateralStep);
      const depth = ATTACK_SPREAD.backDepth + backRank * ATTACK_SPREAD.backDepthStep;
      a.role = 'idle';
      a.intent.target = {
        x: clampX(p.mark.x - p.attackDir * depth),
        y: clampY(p.mark.y + lateral),
      };
      backRank++;
    }
  }
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
