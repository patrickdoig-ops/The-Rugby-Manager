// Pure read helpers over the season-scope accumulators. No events, no
// caching — every call walks the live state. UI screens consume these to
// render leaderboards, per-team stat tables, and player-of-the-week tiles.
//
// Source of truth:
//   - per-player rows: state.career.roster[rosterId].seasonStats
//   - per-team rows:   state.league.teamSeasonStats[teamId]
// Both are reset on SEASON_ROLLED_OVER; the prior season's top-3 lives on
// in state.career.archive[i].leaders.

import type { GameState, TeamSeasonStats } from '../types/gameState';
import type { Player, PlayerSeasonStats } from '../types/player';
import { zeroTeamSeasonStats } from '../types/gameState';

// Player leaderboard categories — every numeric field on PlayerSeasonStats
// except appearances (which the leaderboard guards on) and the rating
// accumulator (use leaderboardAvgRating for that — averaged, not summed).
export type PlayerLeaderKey =
  | 'tries'
  | 'carries'
  | 'metresCarried'
  | 'lineBreaks'
  | 'defendersBeaten'
  | 'passes'
  | 'kicksFromHand'
  | 'kickMetres'
  | 'kicksMade'
  | 'tackles'
  | 'missedTackles'
  | 'dominantTackles'
  | 'turnoversWon'
  | 'lineoutCatches'
  | 'lineoutSteals'
  | 'scrumPenaltiesWon'
  | 'rucksHit'
  | 'yellowCards'
  | 'redCards';

export interface PlayerLeaderboardRow {
  rosterId: number;
  player: Player;
  value: number;
}

// Top N by a single counted stat. Players with value 0 are filtered out so
// the table shortens naturally on a slow-starting season. Ties break by
// ascending rosterId for deterministic ordering.
export function playerLeaderboard(state: GameState, key: PlayerLeaderKey, limit: number): PlayerLeaderboardRow[] {
  const rows: PlayerLeaderboardRow[] = [];
  const rosterIds = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = state.career.roster[rid];
    const value = p.seasonStats[key];
    if (value <= 0) continue;
    rows.push({ rosterId: rid, player: p, value });
  }
  rows.sort((a, b) => b.value - a.value || a.rosterId - b.rosterId);
  return rows.slice(0, limit);
}

export interface PlayerRatingRow {
  rosterId: number;
  player: Player;
  appearances: number;
  averageRating: number;
}

// Top N by average match rating (ratingSum / appearances) with an appearances
// floor — separate from playerLeaderboard so the guard is explicit and the
// value semantics ("ratio, not sum") are obvious at the call site.
export function leaderboardAvgRating(state: GameState, minAppearances: number, limit: number): PlayerRatingRow[] {
  const rows: PlayerRatingRow[] = [];
  const rosterIds = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = state.career.roster[rid];
    const s = p.seasonStats;
    if (s.appearances < minAppearances) continue;
    rows.push({
      rosterId: rid,
      player: p,
      appearances: s.appearances,
      averageRating: s.ratingSum / s.appearances,
    });
  }
  rows.sort((a, b) => b.averageRating - a.averageRating || a.rosterId - b.rosterId);
  return rows.slice(0, limit);
}

// Team leaderboard categories. matchesPlayed and matchSeconds are useful as
// denominators (per-match averages, possession %) — surface them but exclude
// them from the per-stat top-N keys.
export type TeamLeaderKey =
  | 'tries'
  | 'lineBreaks'
  | 'defendersBeaten'
  | 'carries'
  | 'metresCarried'
  | 'tacklesAttempted'
  | 'tacklesMade'
  | 'turnoversWon'
  | 'kicksFromHand'
  | 'kickMetres'
  | 'lineoutsThrown'
  | 'lineoutsWon'
  | 'scrumsPutIn'
  | 'scrumsWon'
  | 'entries22'
  | 'entries22Points'
  | 'knockOns'
  | 'yellowCards'
  | 'redCards';

export interface TeamLeaderboardRow {
  teamId: string;
  value: number;
}

export function teamLeaderboard(state: GameState, key: TeamLeaderKey, limit: number): TeamLeaderboardRow[] {
  const rows: TeamLeaderboardRow[] = [];
  for (const [teamId, stats] of Object.entries(state.league.teamSeasonStats)) {
    rows.push({ teamId, value: stats[key] });
  }
  rows.sort((a, b) => b.value - a.value || a.teamId.localeCompare(b.teamId));
  return rows.slice(0, limit);
}

export function teamSeasonStat(state: GameState, teamId: string): TeamSeasonStats {
  return state.league.teamSeasonStats[teamId] ?? zeroTeamSeasonStats();
}

// % possession given the raw seconds tracked on TeamSeasonStats. Returns 0
// when matchSeconds is 0 (pre-season) so callers don't have to guard.
export function teamPossessionPct(stats: TeamSeasonStats): number {
  return stats.matchSeconds > 0 ? (stats.possessionSeconds / stats.matchSeconds) * 100 : 0;
}

export function teamTerritoryPct(stats: TeamSeasonStats): number {
  return stats.matchSeconds > 0 ? (stats.territorySeconds / stats.matchSeconds) * 100 : 0;
}

// Average match rating shorthand — same formula the MVP card uses.
export function averageRating(s: PlayerSeasonStats): number {
  return s.appearances > 0 ? s.ratingSum / s.appearances : 0;
}
