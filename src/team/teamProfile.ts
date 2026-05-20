// Season-scope mutation seam for team-level data. Analogous to
// `src/engine/applyMatchEvent.ts` but at season scope: all writes to a
// TeamProfile flow through `applyResult` / `hydrateFromSave`. No code outside
// this module mutates profile state.
//
// On app start `init(rawTeams)` seeds the in-memory store from the imported
// team JSONs. `hydrateFromSave(savedResults)` then replays persisted results
// so a "Continue Game" load reaches the right season-form state.

import type { TeamProfile, SeasonForm } from '../types/teamProfile';
import { zeroSeasonForm } from '../types/teamProfile';
import type { TeamTactics } from '../types/team';
import type { PlayerStats } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import type { SavedResult } from '../ui/SaveManager';

// Shape of each team JSON file after the v1.55a regeneration. Holds both
// roster data (consumed by MatchCoordinator via RawTeamInput) and the
// team-level metadata used by the profile screen.
export interface TeamJson {
  id: string;
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  stadium: string;
  founded?: number;
  nickname?: string;
  blurb: string;
  suggestedTactics: TeamTactics;
  statBias: string[];
  stars: {
    name: string;
    position: string;
    nationality: string;
    blurb: string;
    indexHigh: string[];
    suggestedRating: number;
  }[];
  players: { baseStats: PlayerStats }[];
  bench?: { baseStats: PlayerStats }[];
  squad?: { baseStats: PlayerStats }[];
}

const profiles = new Map<string, TeamProfile>();
const rosters = new Map<string, PlayerStats[]>();

export function init(rawTeams: TeamJson[]): void {
  profiles.clear();
  rosters.clear();
  for (const t of rawTeams) {
    profiles.set(t.id, {
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      color: t.color,
      secondaryColor: t.secondaryColor,
      stadium: t.stadium,
      founded: t.founded,
      nickname: t.nickname,
      blurb: t.blurb,
      suggestedTactics: t.suggestedTactics,
      statBias: t.statBias,
      stars: t.stars,
      seasonForm: zeroSeasonForm(),
    });
    const roster: PlayerStats[] = [
      ...t.players.map(p => p.baseStats),
      ...(t.bench ?? []).map(p => p.baseStats),
      ...(t.squad ?? []).map(p => p.baseStats),
    ];
    rosters.set(t.id, roster);
  }
}

export function getProfile(teamId: string): TeamProfile {
  const p = profiles.get(teamId);
  if (!p) throw new Error(`Unknown team id: ${teamId}`);
  return p;
}

export function getAllProfiles(): TeamProfile[] {
  return [...profiles.values()];
}

// Average of the team's top-23 player overalls (matchday-squad sized pool).
// Drawn from players ∪ bench ∪ squad so a deep senior squad is rewarded.
export function computeOverallRating(teamId: string): number {
  const roster = rosters.get(teamId);
  if (!roster || roster.length === 0) return 0;
  const overalls = roster.map(playerOverall).sort((a, b) => b - a);
  const top = overalls.slice(0, 23);
  return Math.round(top.reduce((a, b) => a + b, 0) / top.length);
}

// Apply a single result to both teams' season form. Premiership scoring:
// 4 for win, 2 for draw, 0 for loss; +1 losing bonus if lost by ≤7. Try
// bonus is omitted because SavedResult does not persist try counts; adding
// try-bonus support would require bumping SAVE_VERSION.
export function applyResult(result: SavedResult): void {
  const home = profiles.get(result.homeId);
  const away = profiles.get(result.awayId);
  if (!home || !away) return;
  const margin = result.homeScore - result.awayScore;
  applyToSide(home.seasonForm, result.homeScore, result.awayScore, margin);
  applyToSide(away.seasonForm, result.awayScore, result.homeScore, -margin);
}

function applyToSide(form: SeasonForm, pf: number, pa: number, margin: number): void {
  form.played += 1;
  form.pointsFor += pf;
  form.pointsAgainst += pa;
  form.pointsDiff = form.pointsFor - form.pointsAgainst;
  if (margin > 0) {
    form.won += 1;
    form.leaguePoints += 4;
  } else if (margin === 0) {
    form.drawn += 1;
    form.leaguePoints += 2;
  } else {
    form.lost += 1;
    if (margin >= -7) form.leaguePoints += 1;
  }
}

export function hydrateFromSave(savedResults: SavedResult[]): void {
  for (const p of profiles.values()) {
    p.seasonForm = zeroSeasonForm();
  }
  const ordered = [...savedResults].sort((a, b) => a.round - b.round);
  for (const r of ordered) applyResult(r);
}
