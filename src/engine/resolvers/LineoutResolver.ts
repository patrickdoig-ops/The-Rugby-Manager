import type { Player } from '../../types/player';
import type { LineoutResult } from '../../types/engine';
import { rng } from '../../utils/rng';
import { LINEOUT_VALUES } from '../balance';

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
  const { crookedThrowThreshold, setPieceWeight, agilityWeight, cleanCatchMargin, scrappyMargin } = LINEOUT_VALUES;
  const throwScore = hooker.currentStats.setPiece + rng(1, 100);

  if (throwScore < crookedThrowThreshold) {
    return { result: 'crooked_throw', throwScore, attackJumpScore: 0, defendJumpScore: 0 };
  }

  const attackJumpScore = (attackJumper.currentStats.setPiece * setPieceWeight
                         + attackJumper.currentStats.agility  * agilityWeight)
                        + rng(1, 20);

  const defendJumpScore = (defendJumper.currentStats.setPiece * setPieceWeight
                         + defendJumper.currentStats.agility  * agilityWeight)
                        + rng(1, 20);

  const margin = attackJumpScore - defendJumpScore;

  let result: LineoutResult;
  if (margin >= cleanCatchMargin) result = 'clean_catch';
  else if (margin >= scrappyMargin) result = 'scrappy_knock_on';
  else result = 'steal';

  return { result, throwScore, attackJumpScore, defendJumpScore };
}
