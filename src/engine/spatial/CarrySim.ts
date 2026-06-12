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
import { seedFormation, coupleBallToCarrier } from './World';
import type { World } from './World';
import { run } from './SpatialSimulator';
import { solveDefence, solveCarryCorridor, solveAttackSpread, detectGap, detectOffside, reanchorDefence, reanchorSupport, reanchorAttack } from './ShapeSolver';
import { detectContact } from './ContactSystem';
import type { ShapeParams } from './ShapeSolver';
import type { ContactOutcome } from './ContactSystem';
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
  // Net legacy carry modifier (attackMod − defendMod) the gap threshold reads so
  // home advantage / team talk / tactics still bias line breaks (Upgrade.md §13).
  modShift: number;
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

    const result = detectContact(world, carrier, roles);
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
  const preMoveFn = () => {
    reanchorDefence(roles, carrier, params);
    reanchorSupport(world, carrier, params);
    reanchorAttack(world, carrier, params);
  };
  const postMoveFn = () => coupleBallToCarrier(world, carrier);

  const allFrames: Frame[] = [];
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
