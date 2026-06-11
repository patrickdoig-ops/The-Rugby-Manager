// Pure seed derivation for headless AI fixtures. Mixes the game-engine root
// seed with round number and team identifiers so a given (rootSeed, round,
// fixture) pair always produces the same match outcome. Stable across runs
// — does not depend on iteration order or hash randomization.

import { hashSeed } from '../utils/rng';

export function deriveFixtureSeed(rootSeed: number, round: number, homeId: string, awayId: string): number {
  const tag = hashSeed(`${homeId}|${awayId}`);
  let s = (rootSeed ^ Math.imul(round + 1, 0x9E3779B9) ^ tag) >>> 0;
  s ^= s >>> 16;
  s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15;
  s = Math.imul(s, 0x846ca68b) >>> 0;
  s ^= s >>> 16;
  return s >>> 0;
}
