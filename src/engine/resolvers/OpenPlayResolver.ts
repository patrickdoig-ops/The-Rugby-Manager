import type { Player } from '../../types/player';
import type { CollisionResult } from '../../types/engine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { OPEN_PLAY_VALUES } from '../balance';

export type OpenPlayOutcome =
  | 'line_break'
  | 'dominant_carry'
  | 'dominant_tackle'
  | 'play_on';

export interface OpenPlayResolution {
  outcome: OpenPlayOutcome;
  collisionResult?: CollisionResult;
  gainMetres: number;
  evasionScore: number;
  defenseScore: number;
  collisionAttack: number;
  collisionDefend: number;
}

export function resolveOpenPlay(
  attacker: Player,
  defender: Player,
  attackMod = 0,
  defendMod = 0,
  // Defensive-line collision shift (blitz adds, drift subtracts). Defaults
  // to 0 so existing callers that don't pass it stay byte-identical.
  defendCollisionMod = 0,
): OpenPlayResolution {
  const V = OPEN_PLAY_VALUES;
  // Evasion check
  const evasionScore  = (attacker.currentStats.agility     * V.agilityWeight     + attacker.currentStats.pace * V.paceWeight) + rng(1, 20) + attackMod;
  const defenseScore  = (defender.currentStats.positioning * V.positioningWeight + defender.currentStats.pace * V.paceWeight + defender.currentStats.tackling * V.defenderTacklingLineBreakWeight) + rng(1, 20) + defendMod;

  if (evasionScore - defenseScore >= V.lineBreakMargin) {
    // Pace-scaled gain. Wings (~pace 90+) keep the full 20-45m range;
    // slower carriers (props/locks) see the range compressed because
    // defenders chase back faster than the carrier can run forward.
    const P = V.LINE_BREAK_PACE;
    const t = clamp((attacker.currentStats.pace - P.paceAtFloorGain) / (P.paceAtFullGain - P.paceAtFloorGain), 0, 1);
    const paceFactor = P.paceFactorMin + t * (P.paceFactorMax - P.paceFactorMin);
    const raw = rng(V.lineBreakMetres[0], V.lineBreakMetres[1]) * paceFactor;
    const gainMetres = Math.max(P.minGainMetres, Math.round(raw));
    return { outcome: 'line_break', gainMetres, evasionScore, defenseScore, collisionAttack: 0, collisionDefend: 0 };
  }

  // Collision check
  const collisionAttack = (attacker.currentStats.strength * V.attackerStrengthWeight + attacker.currentStats.pace * V.attackerPaceWeight) + rng(1, 20);
  const collisionDefend = (defender.currentStats.tackling * V.defenderTacklingWeight + defender.currentStats.strength * V.defenderStrengthWeight) + rng(1, 20) + defendCollisionMod;
  const collisionMargin = collisionAttack - collisionDefend;

  let outcome: OpenPlayOutcome;
  let collisionResult: CollisionResult;
  let gainMetres: number;

  if (collisionMargin >= V.dominantCarryMargin) {
    outcome = 'dominant_carry';
    collisionResult = 'dominant_carry';
    gainMetres = rng(V.dominantCarryMetres[0], V.dominantCarryMetres[1]);
  } else if (collisionMargin <= V.dominantTackleMargin) {
    outcome = 'dominant_tackle';
    collisionResult = 'dominant_tackle';
    gainMetres = rng(V.dominantTackleMetres[0], V.dominantTackleMetres[1]);
  } else {
    outcome = 'play_on';
    collisionResult = 'broken_tackle';
    gainMetres = rng(V.playOnMetres[0], V.playOnMetres[1]);
  }

  return { outcome, collisionResult, gainMetres, evasionScore, defenseScore, collisionAttack, collisionDefend };
}

// Spatial carry resolution (Upgrade.md §§ 4.1, 5.2; WP2). Used ONLY on the
// spatial PhasePlay path. The spatial layer has already decided WHERE contact
// happens and WHETHER the line was broken (gap detection in src/engine/spatial/);
// this function turns that verdict into the SAME OpenPlayResolution shape the
// legacy resolver returns, so every downstream consumer (offload chain, try
// check, CARRY_RESOLVED, high-tackle, injury) is byte-identical.
//
// RNG-ORDER CONTRACT (CLAUDE.md § 7): this draws EXACTLY the same outcome-stream
// (`rng`) rolls the legacy collision path draws, in the same order — evasion
// pair, collision pair, one metres draw — REGARDLESS of the spatial verdict, so
// the outcome stream is stable across line-break-vs-contact. The line-break
// metres come from the spatial layer (passed in); the legacy metres draw is
// still consumed (then discarded) on a forced line break so the draw count is
// invariant. NO spatial-stream draw here — that stream is owned entirely by
// src/engine/spatial/ and cannot be referenced outside it.
//
// `forcedLineBreak` is the spatial gap-detection verdict; `spatialMetres` is the
// distance the carrier actually covered through the gap. When false, the
// collision bands decide the contact outcome exactly as resolveOpenPlay does.
export function resolveOpenPlaySpatial(
  attacker: Player,
  defender: Player,
  forcedLineBreak: boolean,
  spatialMetres: number,
  attackMod = 0,
  defendMod = 0,
  defendCollisionMod = 0,
): OpenPlayResolution {
  const V = OPEN_PLAY_VALUES;
  // Draws 1-2: evasion + defense scores. Computed (and rng consumed) every call
  // so the stream position is identical whether or not the line broke. The
  // legacy line-break MARGIN test is NOT applied — the spatial verdict replaces
  // it (Upgrade.md: spatial line breaks replace the line-break portion).
  const evasionScore = (attacker.currentStats.agility * V.agilityWeight + attacker.currentStats.pace * V.paceWeight) + rng(1, 20) + attackMod;
  const defenseScore = (defender.currentStats.positioning * V.positioningWeight + defender.currentStats.pace * V.paceWeight + defender.currentStats.tackling * V.defenderTacklingLineBreakWeight) + rng(1, 20) + defendMod;

  // Draws 3-4: collision scores. Consumed unconditionally (same as draws 1-2)
  // so a forced line break draws the identical number of outcome-stream values
  // as a contact resolution.
  const collisionAttack = (attacker.currentStats.strength * V.attackerStrengthWeight + attacker.currentStats.pace * V.attackerPaceWeight) + rng(1, 20);
  const collisionDefend = (defender.currentStats.tackling * V.defenderTacklingWeight + defender.currentStats.strength * V.defenderStrengthWeight) + rng(1, 20) + defendCollisionMod;
  const collisionMargin = collisionAttack - collisionDefend;

  if (forcedLineBreak) {
    // Draw 5 (discarded): keep the metres draw so the stream count matches the
    // contact branch below exactly. The actual gain comes from the spatial layer.
    rng(V.lineBreakMetres[0], V.lineBreakMetres[1]);
    const gainMetres = Math.max(V.LINE_BREAK_PACE.minGainMetres, Math.round(spatialMetres));
    return { outcome: 'line_break', gainMetres, evasionScore, defenseScore, collisionAttack: 0, collisionDefend: 0 };
  }

  // Contact: identical collision bands + metres draws as resolveOpenPlay, so
  // contact carries are byte-for-byte unchanged from the legacy distribution.
  let outcome: OpenPlayOutcome;
  let collisionResult: CollisionResult;
  let gainMetres: number;
  if (collisionMargin >= V.dominantCarryMargin) {
    outcome = 'dominant_carry';
    collisionResult = 'dominant_carry';
    gainMetres = rng(V.dominantCarryMetres[0], V.dominantCarryMetres[1]);
  } else if (collisionMargin <= V.dominantTackleMargin) {
    outcome = 'dominant_tackle';
    collisionResult = 'dominant_tackle';
    gainMetres = rng(V.dominantTackleMetres[0], V.dominantTackleMetres[1]);
  } else {
    outcome = 'play_on';
    collisionResult = 'broken_tackle';
    gainMetres = rng(V.playOnMetres[0], V.playOnMetres[1]);
  }
  return { outcome, collisionResult, gainMetres, evasionScore, defenseScore, collisionAttack, collisionDefend };
}
