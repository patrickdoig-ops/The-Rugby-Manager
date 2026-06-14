// Spatial carry orchestration (Upgrade.md §§ 4.1, 5.2; WP2 / WP3) — the bridge
// the PhasePlay handler calls. It owns the WHOLE spatial half of a carry:
//
//   buildWorld → solveDefence (line/fold/backfield/offside setup) →
//   solveCarryCorridor → solveAttackSpread → seedFormation (snap to shape) →
//   run N micro-ticks (WP3: early-stop at contact) →
//   detectContact per tick → detectGap → detectOffside
//
// and returns a plain-data verdict (line-break? + nearest line defender + metres
// + an optional offside offender slot + WP3 contact result) plus the captured
// frame stream. ZERO outcome-stream (`rng`) draws happen here; every spatial
// draw is `rngSpatial`, confined to src/engine/spatial/ (CLAUDE.md § 7). The
// handler turns the verdict into the legacy MatchEvent vocabulary on the `rng`
// stream — that is the seam.
//
// WP3 contact model: ContactSystem is called once per tick after postMove. When
// a defender's radius intersects the carrier it resolves Phase 1 evasion + Phase
// 2 collision and returns a ContactResult. The loop stops immediately on contact
// (or on a broken tackle the carrier continues until the next contact or the
// MAX_TICKS_AFTER_BREAK cap). If no contact occurs across all ticks the gap
// detection path runs (line break / no break as in WP2).
//
// World lifecycle is PERSISTENT (Upgrade.md § 3; WP4): the World is owned by
// MatchCoordinator and passed IN. On a FRESH beat (cold entry / post-invalidation
// rebuild — `continuation === false`) the opening formation is seeded as in WP2.
// On a CONTINUATION beat (the World carried over from the previous spatial beat —
// `continuation === true`) seedFormation is SKIPPED so agents keep their current
// positions and run the new corridor from where the previous beat left them —
// nothing teleports between contiguous spatial beats.

import type { MatchState } from '../../types/match';
import type { PossessionSide } from '../../types/engine';
import type { DefensiveLine, Discipline, AttackingStyle } from '../../types/team';
import { CARRY_CORRIDOR_TICKS, MAX_TICKS_AFTER_BREAK } from '../balance/spatialShape';
import { LAUNCH_GRACE_TICKS, LAUNCH_GRACE_DIST } from '../balance/spatialTackle';
import { seedFormation, coupleBallToCarrier, captureFrame, AGENTS_PER_SIDE } from './World';
import type { World } from './World';
import { PASS_CHAIN } from '../balance/spatialDecision';
import { run } from './SpatialSimulator';
import { solveDefence, solveCarryCorridor, solveAttackSpread, detectGap, detectOffside, reanchorDefence, reanchorSupport, reanchorAttack } from './ShapeSolver';
import { detectContact } from './ContactSystem';
import { createPlayOverlay, driveOverlayTick, evaluatePlayAborts, couplePlayBall, carrierHasBall } from './PlayOverlay';
import type { PlayOverlayState } from './PlayOverlay';
import type { ShapeParams } from './ShapeSolver';
import type { ContactOutcome } from './ContactSystem';
import type { Play } from '../../data/playbook/types';
import type { Frame } from './types';

export interface CarrySimInput {
  attackSide: PossessionSide;
  defendSide: PossessionSide;
  attackDir: 1 | -1;
  defensiveLine: DefensiveLine;
  backfield: 1 | 2;
  defendDiscipline: Discipline;
  carrierSlot: number;
  attackingStyle: AttackingStyle;  // drives the forward-pod spread (WP5)
  // The pass chain that prefixes the carry (WP5): attacking slots from the ruck to
  // the carrier — e.g. [9, 10, carrierSlot] for a wide play, [9, carrierSlot] for a
  // hard carry. The ball is swept along it before the carrier runs. Last entry is
  // always the carrier; a length < 2 means no visible pass (pick-and-go style).
  passChain: number[];
  // Net legacy carry modifier (attackMod − defendMod) the gap threshold reads so
  // home advantage / team talk / tactics still bias line breaks (Upgrade.md §13).
  modShift: number;
  // Context-specific bonus (≥0) added to the DEFENDER's Phase-1 evasion score in
  // contact: higher = the carrier beats the tackler 1-on-1 less often. 0 for phase
  // play; the FirstPhase strike passes a set-defence bonus so a strike off a set
  // piece is harder to beat (the square, organised line makes more dominant tackles
  // and fewer clean breaks — WP6). Default 0 keeps existing callers byte-identical.
  contactDefenderBonus?: number;
  // The selected playbook play overlaid on this carry (WP6), or undefined for a
  // plain carry. When present its named roles' run-line waypoints become the
  // Layer-1 steering source and its pass schedule replaces the default sweep; the
  // contact/gap verdict is still measured against the carrier. Undefined keeps the
  // path byte-identical to the pre-overlay carry — selection (a later WP6 commit)
  // is what populates this in live play.
  play?: Play;
  silent: boolean;
}

export interface CarrySimResult {
  lineBreak: boolean;
  // Matchday slot (1–15) of the nearest line defender — the tackler the legacy
  // formula resolves the contact outcome against (WP2 seam: spatial picks WHO).
  tacklerSlot: number;
  // Distance the carrier covered through the gap (line break only).
  spatialMetres: number;
  // Matchday slot of the worst offside offender to be pinged, or null.
  offsideOffenderSlot: number | null;
  frames: Frame[];
  // WP3: spatial contact result fields (null when no contact / legacy path).
  contactOccurred: boolean;
  contactOutcome: ContactOutcome | null;
  offloadAttempted: boolean;
  offloadCompleted: boolean;
  catcherSlot: number | null;
  // Actual micro-ticks run this beat (≤ CARRY_CORRIDOR_TICKS); used by scenarios.
  ticksRun: number;
}

// Snap a COLD World (buildWorld/resetWorld leave every agent piled on the ball)
// into a believable opening formation: defenders on their line, the carrier +
// support pod in the corridor, the rest of the attack spread with width/depth.
// Owned by the World lifecycle — handlePhasePlay calls this ONCE when a cold World
// comes online, BEFORE any kick / pick-and-go / carry branch, so no branch can
// leave an unseeded stub for a later continuation beat to inherit (the "30 dots
// bloom out of the ball" bug). A continuation beat never calls this — it keeps the
// positions carried over from the previous spatial beat (Upgrade.md § 3; WP4).
export function seedWorld(world: World, params: ShapeParams): void {
  solveDefence(world, params);
  solveCarryCorridor(world, params);
  solveAttackSpread(world, params);
  seedFormation(world, { attackDir: params.attackDir, mark: params.mark, carrierSlot: params.carrierSlot });
}

// Build the pass-sweep frames that PREFIX a carry (WP5): the ball travels from the
// ruck (scrum-half) through the backline to the carrier (already at his receiving
// point — out wide for a back, the mark for a forward). Runs in BOTH live and
// silent (the caller passes input.silent through). Pure deterministic position math
// (no rng): the scrum-half is placed at the ruck; intervening receivers are staged
// behind their catch points and run FORWARD onto the ball over the flight;
// reanchorAttack (called every carry tick) then reshapes off-ball attackers, and
// the slot-9 anchor keeps the scrum-half at the ruck. Because the position math is
// identical in live and silent, the carry begins from byte-identical state in both
// — that is why headless league sims stay in lockstep with live, with NO snapshot
// or restore needed. Frames are captured only when not silent.
function runPassPhase(world: World, params: ShapeParams, passChain: number[], silent: boolean): Frame[] {
  if (passChain.length < 2) return [];
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
  const base = params.attackSide === 'home' ? 0 : AGENTS_PER_SIDE;
  const dir = params.attackDir;
  const members = passChain.map(slot => world.agents[base + slot - 1]);
  const carrier = members[members.length - 1];

  // Post the chain for the pass: scrum-half at the ruck (the ball starts there);
  // intervening receivers DEEP (behind their catch point) + lateral toward the
  // carrier, so they RUN ONTO the ball; the carrier is already at his receiving
  // point. NO snapshot/restore — the receivers flow into the carry (reanchorAttack
  // reshapes the off-ball ones, the slot-9 anchor keeps the scrum-half at the ruck),
  // so nothing teleports at the pass→carry seam. Pure deterministic position math
  // (no rng); the caller runs it in BOTH live and silent (so live == silent), and
  // frames are captured only when not silent.
  members[0].pos.x = clamp(params.mark.x, 2, 98);
  members[0].pos.y = clamp(params.mark.y, 3, 97);
  members[0].vel.x = 0; members[0].vel.y = 0;
  for (let i = 1; i < members.length - 1; i++) {
    const frac = i / (members.length - 1);
    members[i].pos.x = clamp(params.mark.x - dir * (PASS_CHAIN.linkDepth + PASS_CHAIN.runOnDepth), 2, 98);
    members[i].pos.y = clamp(params.mark.y + (carrier.pos.y - params.mark.y) * frac, 3, 97);
    members[i].vel.x = 0; members[i].vel.y = 0;
  }

  const frames: Frame[] = [];
  let t = 0;
  world.ball.carrierSlot = undefined;  // in flight
  for (let i = 0; i < members.length - 1; i++) {
    const passer = members[i], receiver = members[i + 1];
    const isCarrier = i + 1 === members.length - 1;   // the carrier catches at his point, then runs
    const startX = receiver.pos.x;
    for (let k = 1; k <= PASS_CHAIN.flightTicks; k++) {
      const f = k / PASS_CHAIN.flightTicks;
      // An intervening receiver runs FORWARD onto the ball over the flight; the ball
      // flies to where he IS, so it meets a moving man, not a statue.
      if (!isCarrier) receiver.pos.x = clamp(startX + dir * PASS_CHAIN.runOnDepth * f, 2, 98);
      world.ball.pos.x = passer.pos.x + (receiver.pos.x - passer.pos.x) * f;
      world.ball.pos.y = passer.pos.y + (receiver.pos.y - passer.pos.y) * f;
      if (!silent) frames.push(captureFrame(world, t++));
    }
  }
  world.ball.pos.x = carrier.pos.x; world.ball.pos.y = carrier.pos.y; world.ball.carrierSlot = carrier.slot;
  return frames;
}

// Resolve a single PhasePlay carry spatially. `world` is the persistent World
// owned by MatchCoordinator (built/reset/continued by ensureWorld); `state`
// supplies the mark + on-field players for the solver params.
export function runCarrySim(world: World, state: MatchState, input: CarrySimInput): CarrySimResult {
  const params: ShapeParams = {
    attackSide: input.attackSide,
    defendSide: input.defendSide,
    attackDir: input.attackDir,
    mark: { x: state.ball.x, y: state.ball.y },
    defensiveLine: input.defensiveLine,
    backfield: input.backfield,
    defendDiscipline: input.defendDiscipline,
    carrierSlot: input.carrierSlot,
    attackingStyle: input.attackingStyle,
  };

  // Layer 1 setup: defenders to their slots (fold speed baked into pace), the
  // carry corridor for the carrier + support pod, then the placeholder spread
  // for the remaining attackers (forward cluster + backline fan). The opening-
  // formation SNAP is NOT here — it is owned by the World lifecycle (handlePhasePlay
  // calls seedWorld once when a cold World comes online, before any kick / pick-
  // and-go / carry branch). By the time runCarrySim runs, the World is always in
  // shape: a cold beat was just seeded; a continuation beat carries its positions
  // over from the previous spatial beat (Upgrade.md § 3; WP4 — nothing teleports).
  const roles = solveDefence(world, params);
  const carrier = solveCarryCorridor(world, params);
  solveAttackSpread(world, params);

  // PLAY OVERLAY (WP6): when a play is selected, install its named roles' run-line
  // waypoints as the Layer-1 steering source for the bound agents and let its pass
  // schedule own the ball — Layers 2–3 (contact / the abort checks) stay live.
  // createPlayOverlay returns null when the play can't bind its carrier (a carded
  // slot); the carry then runs plain. The carrier the verdict measures is unchanged.
  const overlay: PlayOverlayState | null = input.play ? createPlayOverlay(world, params, input.play) : null;

  // PASS PHASE (WP5): prefix the carry with the ball sweeping from the ruck
  // (scrum-half) through the backline to the carrier (positioned at his receiving
  // point by solveCarryCorridor) — so a wide play visibly moves the ball across the
  // backline before the carrier runs. Runs in BOTH live and silent paths: pure
  // deterministic position math (no rng) means the carry begins from byte-identical
  // state regardless — NO snapshot or restore; live == silent via determinism.
  // Frames are produced only when not silent. SKIPPED under an active overlay — the
  // play's own pass schedule moves the ball through the micro-tick loop instead.
  const passFrames = overlay ? [] : runPassPhase(world, params, input.passChain, input.silent);

  // WP3 contact state — mutable across ticks, written into by the contact hook.
  // Pre-allocated: no allocation in the hot path.
  let contactOccurred = false;
  let contactOutcome: ContactOutcome | null = null;
  let contactTacklerSlot = 0;
  let offloadAttempted = false;
  let offloadCompleted = false;
  let catcherSlot: number | null = null;
  let brokenTackle = false;        // set when Phase 1 evasion wins → broken tackle
  let ticksAfterBreak = 0;         // count ticks since the broken tackle
  let ticksRun = 0;

  // Launch grace: snapshot the carrier's spawn position so the grace-distance
  // gate can measure how far he has run from the carry start.
  const carrierStartX = carrier.pos.x;
  const carrierStartY = carrier.pos.y;

  // Contact hook: called each tick after postMove. Returns true to stop the loop.
  // Written as a closure that captures the mutable state above.
  // Launch grace (WP3 contact-timing fix): contact is suppressed until the
  // carrier has run at least LAUNCH_GRACE_TICKS ticks AND covered at least
  // LAUNCH_GRACE_DIST from the carry start. This prevents instant/near-instant
  // tackles when a defender is seeded very close to the carrier.
  const contactHook = (_w: typeof world, t: number): boolean => {
    // t is the tick index within the current run(world, 1, ...) call — always 0
    // since we call run() with 1 tick at a time. Use ticksRun (incremented just
    // before this call) as the elapsed tick count instead.
    const elapsed = ticksRun;
    const carrierDist = Math.hypot(carrier.pos.x - carrierStartX, carrier.pos.y - carrierStartY);
    if (elapsed < LAUNCH_GRACE_TICKS || carrierDist < LAUNCH_GRACE_DIST) return false;
    void t;

    // Overlay contact gate (WP6): while a play is live, the carrier may be running a
    // decoy/strike line BEFORE he is fed the ball — a defender reaching him then is
    // not a tackle. Suppress contact until the strike runner actually has the ball.
    // After an abort the carrier is a normal ball-carrier again, so contact resumes.
    if (overlay && !overlay.aborted && !carrierHasBall(overlay)) return false;

    const result = detectContact(world, carrier, roles, input.contactDefenderBonus ?? 0);
    if (!result) return false;

    if (result.outcome === 'broken_tackle') {
      // Evasion won: the carrier beat one defender. Continue running but count
      // ticks so we can cap the extended run at MAX_TICKS_AFTER_BREAK.
      brokenTackle = true;
      ticksAfterBreak = 0;
      return false;
    }

    // Contact resolved (dominant_carry / dominant_tackle / play_on).
    contactOccurred = true;
    contactOutcome = result.outcome;
    contactTacklerSlot = result.tacklerSlot;
    offloadAttempted = result.offloadAttempted;
    offloadCompleted = result.offloadCompleted;
    catcherSlot = result.catcherSlot;
    return true; // stop the loop
  };

  // After a broken tackle we continue running up to MAX_TICKS_AFTER_BREAK more
  // ticks looking for the next contact. We run one tick at a time and check both
  // the contact hook and the break cap — simplest without restructuring run().
  const totalTicks = CARRY_CORRIDOR_TICKS;
  let stopped = false;

  // We run tick-by-tick so we can enforce the MAX_TICKS_AFTER_BREAK cap. The
  // per-tick hooks are the same closures the WP2 path used (allocated once here).
  // Re-anchor the whole picture to the live gain line each tick: the defensive
  // line presses + folds onto the carrier, the support pod trails him, and the
  // off-ball attack shape holds its depth BEHIND him — so the attack stays onside
  // and the defence stays organised as the carry advances (WP5 continuous shape).
  // Re-anchors run FIRST (they set every attacker's Layer-1 target); the overlay
  // then OVERWRITES its bound roles' targets LAST, so it is the single effective
  // driver per the one-driver-per-agent rule. Once aborted, driveOverlayTick is a
  // no-op and the re-anchors are the only writer again — the play degrades cleanly.
  // playTick is the 0-based micro-tick within the play (ticksRun is incremented
  // just before run() each iteration, so ticksRun-1 is this tick's index).
  const preMoveFn = () => {
    reanchorDefence(roles, carrier, params);
    reanchorSupport(world, carrier, params);
    reanchorAttack(world, carrier, params);
    if (overlay && !overlay.aborted) {
      const playTick = ticksRun - 1;
      driveOverlayTick(overlay, playTick);
      evaluatePlayAborts(overlay, world, params, playTick);
    }
  };
  // While the play is live the ball travels with its current holder (feeder → strike
  // runner); after an abort, or with no overlay, it is glued to the carrier as usual.
  const postMoveFn = () =>
    overlay && !overlay.aborted ? couplePlayBall(overlay, world) : coupleBallToCarrier(world, carrier);

  const allFrames: Frame[] = passFrames.slice();  // the pass sweep precedes the carry
  for (let t = 0; t < totalTicks && !stopped; t++) {
    ticksRun++;
    const { frames } = run(world, 1, input.silent, preMoveFn, postMoveFn, contactHook);
    if (!input.silent) allFrames.push(...frames);

    if (contactOccurred) {
      stopped = true;
    } else if (brokenTackle) {
      ticksAfterBreak++;
      if (ticksAfterBreak >= MAX_TICKS_AFTER_BREAK) {
        // Cap the extended run: treat as no contact (the carrier cleared the line).
        stopped = true;
      }
    }
  }

  // Post-tick verdicts.
  // If spatial contact resolved the outcome, we still need to run detectGap for
  // the gap nearest-defender pick (used for fallback Player lookup in OpenPlayEvent).
  // For a true contact (not a line break), lineBreak=false and we use the spatial
  // outcome for the carry result.
  const gap = detectGap(carrier, roles, input.modShift, input.attackDir);
  const offsideOffender = detectOffside(roles, params, gap.nearestDefender);

  // When contact occurred: the tackle resolved spatially — override lineBreak.
  // When no contact and brokenTackle: the carrier cleared all defenders → line break.
  // When no contact and no brokenTackle: use gap detection as in WP2.
  let lineBreak: boolean;
  let tacklerSlot: number;
  let spatialMetres: number;

  if (contactOccurred) {
    lineBreak = false;
    tacklerSlot = contactTacklerSlot;
    spatialMetres = 0;
  } else if (brokenTackle) {
    // Carrier cleared all defenders after a broken tackle — this is a spatial line break.
    lineBreak = true;
    tacklerSlot = gap.nearestDefender.slot;
    spatialMetres = gap.spatialMetres;
  } else {
    // No contact encountered — use WP2 gap detection verdict.
    lineBreak = gap.lineBreak;
    tacklerSlot = gap.nearestDefender.slot;
    spatialMetres = gap.spatialMetres;
  }

  return {
    lineBreak,
    tacklerSlot,
    spatialMetres,
    offsideOffenderSlot: offsideOffender ? offsideOffender.slot : null,
    frames: allFrames,
    contactOccurred,
    contactOutcome,
    offloadAttempted,
    offloadCompleted,
    catcherSlot,
    ticksRun,
  };
}
