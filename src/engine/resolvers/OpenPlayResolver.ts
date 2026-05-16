import type { Player } from '../../types/player';
import type { CollisionResult } from '../../types/engine';
import { rng } from '../../utils/rng';

export type OpenPlayOutcome =
  | 'knock_on'
  | 'line_break'
  | 'dominant_carry'
  | 'dominant_tackle'
  | 'play_on';

export interface OpenPlayResolution {
  outcome: OpenPlayOutcome;
  collisionResult?: CollisionResult;
  gainMetres: number;
  handlingScore: number;
  evasionScore: number;
  defenseScore: number;
  collisionAttack: number;
  collisionDefend: number;
}

export function resolveOpenPlay(attacker: Player, defender: Player): OpenPlayResolution {
  // Step 1: Handling check
  const handlingScore = attacker.currentStats.handling + rng(1, 20);
  if (handlingScore < 30) {
    return { outcome: 'knock_on', gainMetres: 0, handlingScore, evasionScore: 0, defenseScore: 0, collisionAttack: 0, collisionDefend: 0 };
  }

  // Step 2: Evasion check
  const evasionScore  = (attacker.currentStats.agility + attacker.currentStats.pace) / 2 + rng(1, 20);
  const defenseScore  = (defender.currentStats.positioning + defender.currentStats.pace) / 2 + rng(1, 20);

  if (evasionScore - defenseScore >= 15) {
    return { outcome: 'line_break', gainMetres: rng(10, 25), handlingScore, evasionScore, defenseScore, collisionAttack: 0, collisionDefend: 0 };
  }

  // Step 3: Collision check
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

  return { outcome, collisionResult, gainMetres, handlingScore, evasionScore, defenseScore, collisionAttack, collisionDefend };
}
