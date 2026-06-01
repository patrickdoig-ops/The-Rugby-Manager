// Prem Cup development nudge — RNG-free, bounded reward for game time.
//
// One PLAYER_TRAINED event per featured player per block (conditionDelta 0 —
// condition is handled by the cup condition writeback). The nudge adds a
// small gain to the player's weakest baseStats, scaled by age band; veterans
// earn nothing. Walked rosterId-ascending so the apply order is stable.

import type { GameState, SeasonEvent } from '../types/gameState';
import type { PlayerStats } from '../types/player';
import { PLAYER_STAT_KEYS } from '../types/player';
import { getAge } from './age';
import { CUP_DEVELOPMENT } from '../engine/balance';

export function cupDevelopmentEvents(
  state: GameState,
  featuredIds: Iterable<number>,
  nowIso: string,
): SeasonEvent[] {
  const ids = [...new Set(featuredIds)].sort((a, b) => a - b);
  const out: SeasonEvent[] = [];
  for (const rid of ids) {
    const p = state.career.roster[rid];
    if (!p) continue;
    const age = getAge(p.dob, nowIso);
    let gain: number;
    let count: number;
    if (age === null || age <= CUP_DEVELOPMENT.developingAgeMax) {
      // Unknown age is treated as developing — youth gets the larger band.
      if (age !== null && age <= CUP_DEVELOPMENT.youthAgeMax) {
        gain = CUP_DEVELOPMENT.youthStatGain;
        count = CUP_DEVELOPMENT.youthStatsTargeted;
      } else {
        gain = CUP_DEVELOPMENT.developingStatGain;
        count = CUP_DEVELOPMENT.developingStatsTargeted;
      }
    } else {
      continue; // veterans don't develop from cup minutes
    }
    if (gain <= 0 || count <= 0) continue;

    // Target the `count` weakest baseStats (ties broken by key order).
    const ranked = PLAYER_STAT_KEYS
      .map((k, i) => ({ k, v: p.baseStats[k], i }))
      .sort((a, b) => a.v - b.v || a.i - b.i);
    const statDeltas: Partial<PlayerStats> = {};
    let added = 0;
    for (const { k } of ranked) {
      if (added >= count) break;
      if (p.baseStats[k] >= 99) continue;
      statDeltas[k] = gain;
      added += 1;
    }
    if (added === 0) continue;
    out.push({ type: 'PLAYER_TRAINED', rosterId: rid, conditionDelta: 0, statDeltas });
  }
  return out;
}
