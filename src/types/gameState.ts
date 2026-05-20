// Game-engine (season-scope) state and mutation event union.
//
// Analogous to src/types/match.ts (MatchState + MatchEvent), but operating at
// season scope: calendar, fixtures, results, standings. Owned by
// GameCoordinator; mutated only through applySeasonEvent.
//
// Naming: this union is `SeasonEvent` rather than `GameEvent` because the
// latter is already taken by the in-match commentary log type in
// src/types/match.ts. The two are unrelated.

export interface Fixture {
  round: number;
  homeId: string;
  awayId: string;
}

export interface FixtureResult {
  round: number;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  playerSide: 'home' | 'away' | null;
}

export interface TeamStanding {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  leaguePoints: number;
}

export interface Calendar {
  date: string;        // ISO yyyy-mm-dd
  week: number;        // 1-based; week 1 = first round
  seasonLabel: string; // e.g. "2025/26 Season"
}

export interface League {
  fixtures: Fixture[];   // all rounds, generated once at season start
  results: FixtureResult[];
  standings: TeamStanding[];
}

export interface GameState {
  calendar: Calendar;
  league: League;
  player: { teamId: string };
  seed: number;
}

export function zeroStanding(teamId: string): TeamStanding {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointsDiff: 0,
    leaguePoints: 0,
  };
}

export type SeasonEvent =
  | {
      type: 'SEASON_INITIALIZED';
      playerTeamId: string;
      seed: number;
      teamIds: string[];      // ordering matters: drives fixture rotation
      seasonLabel: string;
      startDate: string;       // ISO yyyy-mm-dd
    }
  | {
      type: 'FIXTURE_RESULT_RECORDED';
      result: FixtureResult;
    }
  | {
      type: 'WEEK_ADVANCED';
    };
