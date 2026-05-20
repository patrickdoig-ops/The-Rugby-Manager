import type { TeamTactics } from './team';

export interface StarPlayerMeta {
  name: string;
  position: string;
  nationality: string;
  blurb: string;
  indexHigh: string[];
  suggestedRating: number;
}

export interface SeasonForm {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  leaguePoints: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
}

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
  blurb: string;
  suggestedTactics: TeamTactics;
  statBias: string[];
  stars: StarPlayerMeta[];
  seasonForm: SeasonForm;
}

export function zeroSeasonForm(): SeasonForm {
  return {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    leaguePoints: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointsDiff: 0,
  };
}
