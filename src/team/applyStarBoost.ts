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
import {
  PLAYER_OVERALL_WEIGHTS,
  STAR_BOOST,
  IRRELEVANT_STATS,
  LEAGUE_STAT_CEILINGS,
  PLAYER_STAT_OVERRIDES,
} from '../engine/balance';

type RosterEntry = TeamJson['players'][number] & {
  firstName: string;
  lastName: string;
};

export function applyStarBoost(team: TeamJson): TeamJson {
  let players = (team.players as RosterEntry[]).map(applyLeagueFloor);
  let bench = ((team.bench ?? []) as RosterEntry[]).map(applyLeagueFloor);

  for (const star of team.stars) {
    if (!boostByName(players, star)) boostByName(bench, star);
  }

  // Per-player overrides apply across the whole roster — matchday + wider
  // squad — so a named exception (e.g. "fastest wing in the league") shows
  // correctly even when the player isn't in this round's 23. The league
  // floor / star boost still leave `squad[]` untouched per data-only intent.
  players = players.map(applyPlayerOverrides);
  bench = bench.map(applyPlayerOverrides);
  const squad = team.squad
    ? (team.squad as RosterEntry[]).map(applyPlayerOverrides)
    : undefined;

  return { ...team, players, bench, ...(squad ? { squad } : {}) };
}

function statCap(p: RosterEntry, k: keyof PlayerStats): number {
  const override = PLAYER_STAT_OVERRIDES[`${p.firstName} ${p.lastName}`]?.[k];
  if (override !== undefined) return override;
  return Math.min(STAR_BOOST.capPerStat, LEAGUE_STAT_CEILINGS[k] ?? STAR_BOOST.capPerStat);
}

function applyLeagueFloor(p: RosterEntry): RosterEntry {
  const irrelevant = new Set(IRRELEVANT_STATS[p.position] ?? []);
  const stats = { ...p.baseStats };
  for (const k of Object.keys(stats) as (keyof PlayerStats)[]) {
    if (irrelevant.has(k)) {
      if (stats[k] > STAR_BOOST.irrelevantStatMax) stats[k] = STAR_BOOST.irrelevantStatMax;
    } else {
      if (stats[k] < STAR_BOOST.leagueMin) stats[k] = STAR_BOOST.leagueMin;
      const cap = statCap(p, k);
      if (stats[k] > cap) stats[k] = cap;
    }
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
  const irrelevant = new Set(IRRELEVANT_STATS[p.position] ?? []);
  const indexHigh = new Set(star.indexHigh as (keyof PlayerStats)[]);
  const indexHighFloor = star.suggestedRating >= STAR_BOOST.topThreshold
    ? STAR_BOOST.topIndexHighMin
    : STAR_BOOST.indexHighMin;

  for (const k of Object.keys(stats) as (keyof PlayerStats)[]) {
    if (irrelevant.has(k)) continue;
    const cap = statCap(p, k);
    const floor = Math.min(indexHigh.has(k) ? indexHighFloor : STAR_BOOST.otherStatMin, cap);
    if (stats[k] < floor) stats[k] = floor;
    if (stats[k] > cap) stats[k] = cap;
  }

  const target = star.suggestedRating + STAR_BOOST.targetOffset;
  const weights = PLAYER_OVERALL_WEIGHTS[p.position];
  for (let iter = 0; iter < STAR_BOOST.maxIterations; iter++) {
    if (playerOverall(stats, p.position) >= target) break;
    let bestKey: keyof PlayerStats | null = null;
    let bestWeight = -1;
    for (const k of Object.keys(stats) as (keyof PlayerStats)[]) {
      if (irrelevant.has(k)) continue;
      if (stats[k] >= statCap(p, k)) continue;
      const w = weights[k] ?? 1.0;
      if (w > bestWeight) { bestWeight = w; bestKey = k; }
    }
    if (!bestKey) break;
    stats[bestKey] += 1;
  }

  return { ...p, baseStats: stats };
}

function applyPlayerOverrides(p: RosterEntry): RosterEntry {
  const overrides = PLAYER_STAT_OVERRIDES[`${p.firstName} ${p.lastName}`];
  if (!overrides) return p;
  return { ...p, baseStats: { ...p.baseStats, ...overrides } };
}
