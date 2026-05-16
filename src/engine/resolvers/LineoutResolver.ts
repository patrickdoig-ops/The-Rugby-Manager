import type { Player } from '../../types/player';
import type { LineoutResult } from '../../types/engine';
import { rng } from '../../utils/rng';

export interface LineoutResolution {
  result: LineoutResult;
  throwScore: number;
  attackJumpScore: number;
  defendJumpScore: number;
}

export function resolveLineout(
  hooker: Player,
  attackJumper: Player,
  defendJumper: Player,
): LineoutResolution {
  const throwScore = hooker.currentStats.setPiece + rng(1, 20);

  if (throwScore < 40) {
    return { result: 'steal', throwScore, attackJumpScore: 0, defendJumpScore: 0 };
  }

  const attackJumpScore = (attackJumper.currentStats.setPiece * 0.5
                         + attackJumper.currentStats.agility * 0.5)
                        + rng(1, 20);

  const defendJumpScore = (defendJumper.currentStats.setPiece * 0.5
                         + defendJumper.currentStats.agility * 0.5)
                        + rng(1, 20);

  const margin = attackJumpScore - defendJumpScore;

  let result: LineoutResult;
  if (margin >= 5) result = 'clean_catch';
  else if (margin >= 0) result = 'scrappy_knock_on';
  else result = 'steal';

  return { result, throwScore, attackJumpScore, defendJumpScore };
}
