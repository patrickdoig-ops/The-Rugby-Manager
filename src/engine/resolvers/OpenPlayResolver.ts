import type { Player } from '../../types/player';
import type { CollisionResult } from '../../types/engine';
import { rng } from '../../utils/rng';

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
  // Evasion check
  const evasionScore  = (attacker.currentStats.agility + attacker.currentStats.pace) / 2 + rng(1, 20) + attackMod;
  const defenseScore  = (defender.currentStats.positioning + defender.currentStats.pace) / 2 + rng(1, 20) + defendMod;

  if (evasionScore - defenseScore >= 15) {
    return { outcome: 'line_break', gainMetres: rng(10, 25), evasionScore, defenseScore, collisionAttack: 0, collisionDefend: 0 };
  }

  // Collision check
  const collisionAttack = (attacker.currentStats.strength + attacker.currentStats.pace) / 2 + rng(1, 20);
  const collisionDefend = (defender.currentStats.tackling + defender.currentStats.strength) / 2 + rng(1, 20);
  const collisionMargin = collisionAttack - collisionDefend;

  let outcome: OpenPlayOutcome;
  let collisionResult: CollisionResult;
  let gainMetres: number;

  if (collisionMargin >= 5) {
    outcome = 'dominant_carry';
    collisionResult = 'dominant_carry';
    gainMetres = rng(3, 8);
  } else if (collisionMargin <= -5) {
    outcome = 'dominant_tackle';
    collisionResult = 'dominant_tackle';
    gainMetres = rng(-2, 1);
  } else {
    outcome = 'play_on';
    collisionResult = 'broken_tackle';
    gainMetres = rng(1, 4);
  }

  return { outcome, collisionResult, gainMetres, evasionScore, defenseScore, collisionAttack, collisionDefend };
}
