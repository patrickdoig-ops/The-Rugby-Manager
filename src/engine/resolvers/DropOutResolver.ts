import type { Player } from '../../types/player';
import type { KickOffResult } from '../../types/engine';
import { rng } from '../../utils/rng';
import { DROP_OUT_VALUES } from '../balance';

export interface DropOutResolution {
  result: KickOffResult;
  distance: number;
}

// Drop-out from the 22 by the defending team after a missed penalty kick at
// goal. Mirrors `resolveKickOff` shape (high-ball-style outcome family) but
// with no strategy choice — single fixed model. A kick that travels less
// than the 22m floor returns 'poor_kick' (scrum to the receiving team at
// halfway, same shape as kick-off poor_kick).
export function resolveDropOut(
  kicker: Player,
  receiver: Player,
): DropOutResolution {
  const V = DROP_OUT_VALUES;
  const kickScore = kicker.currentStats.kicking + rng(1, 20);
  const goodKick  = kickScore >= V.goodKickThreshold;
  const distance  = goodKick ? rng(V.distance.good[0], V.distance.good[1]) : rng(V.distance.poor[0], V.distance.poor[1]);

  if (distance < V.distance.autoPoorIfUnder) return { result: 'poor_kick', distance };

  const catchScore = (receiver.currentStats.handling + receiver.currentStats.composure) / 2 + rng(1, 20);
  return { result: catchScore < V.catchKnockOnThreshold ? 'knock_on' : 'clean_receive', distance };
}
