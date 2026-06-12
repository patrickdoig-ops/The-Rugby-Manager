// Spatial carry orchestration (Upgrade.md §§ 4.1, 5.2; WP2) — the bridge the
// PhasePlay handler calls. It owns the WHOLE spatial half of a carry:
//
//   buildWorld → solveDefence (line/fold/backfield/offside setup) →
//   solveCarryCorridor → solveAttackSpread → seedFormation (snap to shape) →
//   run N micro-ticks → detectGap → detectOffside
//
// and returns a plain-data verdict (line-break? + nearest line defender + metres
// + an optional offside offender slot) plus the captured frame stream. ZERO
// outcome-stream (`rng`) draws happen here; every spatial draw is `rngSpatial`,
// confined to src/engine/spatial/ (CLAUDE.md § 7). The handler turns the verdict
// into the legacy MatchEvent vocabulary on the `rng` stream — that is the seam.
//
// World lifecycle is MINIMAL (Upgrade.md § 3 / WP2 deliverable 4): a fresh World
// is built on entry and discarded on return. Cross-phase persistence is WP4.

import type { MatchState } from '../../types/match';
import type { PossessionSide } from '../../types/engine';
import type { DefensiveLine, Discipline } from '../../types/team';
import { CARRY_CORRIDOR_TICKS } from '../balance/spatialShape';
import { buildWorld, seedFormation } from './World';
import { run } from './SpatialSimulator';
import { solveDefence, solveCarryCorridor, solveAttackSpread, detectGap, detectOffside } from './ShapeSolver';
import type { ShapeParams } from './ShapeSolver';
import type { Frame } from './types';

export interface CarrySimInput {
  attackSide: PossessionSide;
  defendSide: PossessionSide;
  attackDir: 1 | -1;
  defensiveLine: DefensiveLine;
  backfield: 1 | 2;
  defendDiscipline: Discipline;
  carrierSlot: number;
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
}

// Resolve a single PhasePlay carry spatially. `state` supplies the on-field
// players, ball position (the mark) and clock for the World build.
export function runCarrySim(state: MatchState, input: CarrySimInput): CarrySimResult {
  const world = buildWorld(state);

  const params: ShapeParams = {
    attackSide: input.attackSide,
    defendSide: input.defendSide,
    attackDir: input.attackDir,
    mark: { x: state.ball.x, y: state.ball.y },
    defensiveLine: input.defensiveLine,
    backfield: input.backfield,
    defendDiscipline: input.defendDiscipline,
    carrierSlot: input.carrierSlot,
  };

  // Layer 1 setup: defenders to their slots (fold speed baked into pace), the
  // carry corridor for the carrier + support pod, then the placeholder spread
  // for the remaining attackers (forward cluster + backline fan).
  const roles = solveDefence(world, params);
  const carrier = solveCarryCorridor(world, params);
  solveAttackSpread(world, params);

  // Seed the opening formation: snap every agent off the ball onto its assigned
  // target so the beat OPENS in a believable rugby shape instead of 30 dots
  // piled on the ball (resetWorld's stub). Defenders start ON the line, the
  // carrier near the mark, support + backs spread with width and depth. The
  // defensive fold-overlap payoff still emerges from the carrier running the
  // corridor against the formed line over the micro-ticks.
  seedFormation(world, { attackDir: params.attackDir, mark: params.mark, carrierSlot: params.carrierSlot });

  // Run the micro-ticks. Targets are fixed for the beat (Layer 1 only in WP2;
  // the decision/contact layers are WP3/WP5), so no per-tick intent callback.
  const { frames } = run(world, CARRY_CORRIDOR_TICKS, input.silent);

  // Post-tick verdicts. The gap's nearest defender (the tackler) is excluded
  // from the offside sweep — he is legitimately advancing onto the carrier.
  const gap = detectGap(carrier, roles, input.modShift, input.attackDir);
  const offsideOffender = detectOffside(roles, params, gap.nearestDefender);

  return {
    lineBreak: gap.lineBreak,
    tacklerSlot: gap.nearestDefender.slot,
    spatialMetres: gap.spatialMetres,
    offsideOffenderSlot: offsideOffender ? offsideOffender.slot : null,
    frames,
  };
}
