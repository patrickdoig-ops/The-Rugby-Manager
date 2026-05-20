import type { Player } from '../../types/player';
import type { CollisionResult } from '../../types/engine';
import { rng } from '../../utils/rng';
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

export function resolveOpenPlay(attacker: Player, defender: Player, attackMod = 0, defendMod = 0): OpenPlayResolution {
  const V = OPEN_PLAY_VALUES;
  // Evasion check
  const evasionScore  = (attacker.currentStats.agility     * V.agilityWeight     + attacker.currentStats.pace * V.paceWeight) + rng(1, 20) + attackMod;
  const defenseScore  = (defender.currentStats.positioning * V.positioningWeight + defender.currentStats.pace * V.paceWeight) + rng(1, 20) + defendMod;

  if (evasionScore - defenseScore >= V.lineBreakMargin) {
    return { outcome: 'line_break', gainMetres: rng(V.lineBreakMetres[0], V.lineBreakMetres[1]), evasionScore, defenseScore, collisionAttack: 0, collisionDefend: 0 };
  }

  // Collision check
  const collisionAttack = (attacker.currentStats.strength * V.attackerStrengthWeight + attacker.currentStats.pace * V.attackerPaceWeight) + rng(1, 20);
  const collisionDefend = (defender.currentStats.tackling * V.defenderTacklingWeight + defender.currentStats.strength * V.defenderStrengthWeight) + rng(1, 20);
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
