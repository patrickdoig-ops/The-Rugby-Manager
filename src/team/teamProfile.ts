// In-memory registry of identity, narrative, star and roster data for each
// team. Pure data — no season-form state lives here any more (the game
// engine owns standings on GameState.league.standings).

import type { TeamProfile } from '../types/teamProfile';
import type { TeamTactics } from '../types/team';
import type { PlayerStats, Position } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';

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
  stadiumCapacity?: number;
  headCoach?: string;
  honours?: string;
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
  players: { baseStats: PlayerStats; position: Position }[];
  bench?: { baseStats: PlayerStats; position: Position }[];
  squad?: { baseStats: PlayerStats; position: Position }[];
}

interface RosterEntry { stats: PlayerStats; position: Position; }

const profiles = new Map<string, TeamProfile>();
const rosters = new Map<string, RosterEntry[]>();

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
      stadiumCapacity: t.stadiumCapacity,
      headCoach: t.headCoach,
      honours: t.honours,
      blurb: t.blurb,
      suggestedTactics: t.suggestedTactics,
      statBias: t.statBias,
      stars: t.stars,
    });
    const roster: RosterEntry[] = [
      ...t.players.map(p => ({ stats: p.baseStats, position: p.position })),
      ...(t.bench ?? []).map(p => ({ stats: p.baseStats, position: p.position })),
      ...(t.squad ?? []).map(p => ({ stats: p.baseStats, position: p.position })),
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
  const overalls = roster.map(r => playerOverall(r.stats, r.position)).sort((a, b) => b - a);
  const top = overalls.slice(0, 23);
  return Math.round(top.reduce((a, b) => a + b, 0) / top.length);
}
