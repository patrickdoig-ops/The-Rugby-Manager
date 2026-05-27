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
