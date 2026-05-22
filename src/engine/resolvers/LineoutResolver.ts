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

  let result: LineoutResult;
  let attackJumpScore = 0;
  let defendJumpScore = 0;

  if (throwScore < crookedThrowThreshold) {
    result = 'crooked_throw';
  } else {
    attackJumpScore = (attackJumper.currentStats.setPiece * setPieceWeight
                     + attackJumper.currentStats.agility  * agilityWeight)
                    + rng(1, 20);

    defendJumpScore = (defendJumper.currentStats.setPiece * setPieceWeight
                     + defendJumper.currentStats.agility  * agilityWeight)
                    + rng(1, 20);

    const margin = attackJumpScore - defendJumpScore;
    if      (margin >= cleanCatchMargin) result = 'clean_catch';
    else if (margin >= scrappyMargin)    result = 'scrappy_knock_on';
    else                                 result = 'steal';
  }

  // Own-throw floor (see LINEOUT_VALUES.ownThrowRescuePct). Rescue most
  // would-be losses (crooked / scrappy / steal) into a clean catch so the
  // weakest hooker/jumper pairings still hold their own throw at ~70%+
  // league-wide. Strong packs barely shift since their natural loss rate
  // is already low.
  if (result !== 'clean_catch' && rng(1, 100) <= LINEOUT_VALUES.ownThrowRescuePct) {
    result = 'clean_catch';
  }

  return { result, throwScore, attackJumpScore, defendJumpScore };
}
