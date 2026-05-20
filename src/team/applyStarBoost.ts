// Spawn-time lift of authored team JSONs. Two passes per team:
//   1. League-wide floor — every player on the matchday roster (players + bench)
//      gets each baseStat raised to `STAR_BOOST.leagueMin`. Stats already above
//      the floor are untouched. The data-only `squad[]` is left alone.
//   2. Per-star boost — for each entry in `team.stars[]`, find the matching
//      roster player by full name and lift their indexHigh stats to an elite
//      floor + non-indexHigh stats to a competitive floor, then iteratively
//      bump the highest-position-weighted non-capped stat by +1 until the
//      computed OVR meets `suggestedRating + targetOffset` (or every stat
//      caps at 99).
//
// Deterministic and pure — no RNG, no side effects, returns a new TeamJson.
// Called once at app start from `main.ts` before `teamProfile.init` and
// before any TeamJson is consumed as `RawTeamInput` by the match engine.

import type { TeamJson } from './teamProfile';
import type { PlayerStats } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import { PLAYER_OVERALL_WEIGHTS, STAR_BOOST } from '../engine/balance';

type RosterEntry = TeamJson['players'][number] & {
  firstName: string;
  lastName: string;
};

export function applyStarBoost(team: TeamJson): TeamJson {
  const players = (team.players as RosterEntry[]).map(applyLeagueFloor);
  const bench = ((team.bench ?? []) as RosterEntry[]).map(applyLeagueFloor);

  for (const star of team.stars) {
    if (!boostByName(players, star)) boostByName(bench, star);
  }

  return { ...team, players, bench };
}

function applyLeagueFloor(p: RosterEntry): RosterEntry {
  const stats = { ...p.baseStats };
  for (const k of Object.keys(stats) as (keyof PlayerStats)[]) {
    if (stats[k] < STAR_BOOST.leagueMin) stats[k] = STAR_BOOST.leagueMin;
  }
  return { ...p, baseStats: stats };
}

function boostByName(arr: RosterEntry[], star: TeamJson['stars'][number]): boolean {
  const target = star.name.trim().toLowerCase();
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    const full = `${p.firstName} ${p.lastName}`.trim().toLowerCase();
    if (full === target) {
      arr[i] = boostStar(p, star);
      return true;
    }
  }
  return false;
}

function boostStar(p: RosterEntry, star: TeamJson['stars'][number]): RosterEntry {
  const stats = { ...p.baseStats };
  const indexHigh = new Set(star.indexHigh as (keyof PlayerStats)[]);
  const indexHighFloor = star.suggestedRating >= STAR_BOOST.topThreshold
    ? STAR_BOOST.topIndexHighMin
    : STAR_BOOST.indexHighMin;

  for (const k of Object.keys(stats) as (keyof PlayerStats)[]) {
    const floor = indexHigh.has(k) ? indexHighFloor : STAR_BOOST.otherStatMin;
    if (stats[k] < floor) stats[k] = floor;
  }

  const target = star.suggestedRating + STAR_BOOST.targetOffset;
  const weights = PLAYER_OVERALL_WEIGHTS[p.position];
  for (let iter = 0; iter < STAR_BOOST.maxIterations; iter++) {
    if (playerOverall(stats, p.position) >= target) break;
    let bestKey: keyof PlayerStats | null = null;
    let bestWeight = -1;
    for (const k of Object.keys(stats) as (keyof PlayerStats)[]) {
      if (stats[k] >= STAR_BOOST.capPerStat) continue;
      const w = weights[k] ?? 1.0;
      if (w > bestWeight) { bestWeight = w; bestKey = k; }
    }
    if (!bestKey) break;
    stats[bestKey] += 1;
  }

  return { ...p, baseStats: stats };
}
