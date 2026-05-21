// Spawn-time lift of authored team JSONs. Three passes per team:
//   1. Tier calibration — additive shift on every non-star, non-irrelevant
//      baseStat. Magnitude depends on the roster slot the player sits in
//      (`TIER_CALIBRATION` in src/engine/balance/rating.ts). Starter
//      non-stars are lifted; bench less so; squad pushed down. Irrelevant
//      stats are clamped to `STAR_BOOST.irrelevantStatMax`. Stars get
//      `shift = 0` here — the next pass owns their numbers.
//   2. Per-star boost — for each entry in `team.stars[]`, find the matching
//      roster player by full name and lift their indexHigh stats to an
//      elite floor + non-indexHigh stats to a competitive floor, then
//      iteratively bump the highest-position-weighted non-capped stat by
//      +1 until the computed OVR meets `suggestedRating + targetOffset`
//      (or every stat caps at 99 / the per-stat ceiling).
//   3. Per-player overrides — `PLAYER_STAT_OVERRIDES` applied verbatim
//      across players + bench + squad. Can exceed the league ceiling
//      (e.g. Arundell pace 99) and acts as a per-player cap during the
//      boost iteration too.
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
  TIER_CALIBRATION,
  IRRELEVANT_STATS,
  LEAGUE_STAT_CEILINGS,
  PLAYER_STAT_OVERRIDES,
} from '../engine/balance';

type RosterEntry = TeamJson['players'][number] & {
  firstName: string;
  lastName: string;
};

type Tier = keyof typeof TIER_CALIBRATION;

export function applyStarBoost(team: TeamJson): TeamJson {
  const isStar = (p: RosterEntry): boolean =>
    team.stars.some(s => s.name.trim().toLowerCase() === `${p.firstName} ${p.lastName}`.trim().toLowerCase());

  let players = (team.players as RosterEntry[]).map(p => applyTierCalibration(p, 'starter', isStar(p)));
  let bench   = ((team.bench  ?? []) as RosterEntry[]).map(p => applyTierCalibration(p, 'bench',   isStar(p)));
  // Squad players are never marked as stars; always shifted down a tier.
  let squad   = team.squad
    ? (team.squad as RosterEntry[]).map(p => applyTierCalibration(p, 'squad', false))
    : undefined;

  for (const star of team.stars) {
    if (!boostByName(players, star)) boostByName(bench, star);
  }

  players = players.map(applyPlayerOverrides);
  bench   = bench.map(applyPlayerOverrides);
  squad   = squad?.map(applyPlayerOverrides);

  return { ...team, players, bench, ...(squad ? { squad } : {}) };
}

function statCap(p: RosterEntry, k: keyof PlayerStats): number {
  const override = PLAYER_STAT_OVERRIDES[`${p.firstName} ${p.lastName}`]?.[k];
  if (override !== undefined) return override;
  return Math.min(STAR_BOOST.capPerStat, LEAGUE_STAT_CEILINGS[k] ?? STAR_BOOST.capPerStat);
}

function applyTierCalibration(p: RosterEntry, tier: Tier, isStar: boolean): RosterEntry {
  const irrelevant = new Set(IRRELEVANT_STATS[p.position] ?? []);
  const shift = isStar ? 0 : TIER_CALIBRATION[tier];
  const stats = { ...p.baseStats };
  for (const k of Object.keys(stats) as (keyof PlayerStats)[]) {
    if (irrelevant.has(k)) {
      if (stats[k] > STAR_BOOST.irrelevantStatMax) stats[k] = STAR_BOOST.irrelevantStatMax;
    } else {
      const cap = statCap(p, k);
      stats[k] = Math.max(STAR_BOOST.statHardFloor, Math.min(cap, stats[k] + shift));
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
