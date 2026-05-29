import type { TeamTactics } from './team';

export interface StarPlayerMeta {
  name: string;
  position: string;
  nationality: string;
  indexHigh: string[];
  suggestedRating: number;
}

// Identity, narrative and stat-bias metadata for a club. Season-form
// (W/D/L, league points) lives on GameState.league.standings — not here —
// since the game engine refactor centralised that state.
export interface TeamProfile {
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
  suggestedTactics: TeamTactics;
  statBias: string[];
  stars: StarPlayerMeta[];
}
