// Game-engine (season-scope) state and mutation event union.
//
// Analogous to src/types/match.ts (MatchState + MatchEvent), but operating at
// season scope: calendar, fixtures, results, standings. Owned by
// GameCoordinator; mutated only through applySeasonEvent.
//
// Naming: this union is `SeasonEvent` rather than `GameEvent` because the
// latter is already taken by the in-match commentary log type in
// src/types/match.ts. The two are unrelated.

import type { TeamTactics } from './team';

export interface Fixture {
  round: number;
  homeId: string;
  awayId: string;
  // ISO yyyy-mm-dd. Optional so future random-gen schedules can omit it;
  // when present, the calendar advances to per-round dates rather than the
  // flat +7-day fallback in applySeasonEvent.
  date?: string;
}

export interface SeasonSchedule {
  seasonLabel: string;
  fixtures: Fixture[];
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

// Stable reference to a real player across save/load and across raw-team
// regenerations. Full names are unique league-wide (see CLAUDE.md "Team
// data"), so a name pair is enough — no IDs needed (and IDs shift on
// pre-match swaps).
export interface PlayerRef {
  firstName: string;
  lastName: string;
}

export interface GameState {
  calendar: Calendar;
  league: League;
  player: {
    teamId: string;
    // Persisted preferences from the previous pre-match commit. Undefined
    // means "fall back to authored defaults" (DEFAULT_TACTICS for tactics,
    // raw team JSON order for matchdaySquad). Set via PLAYER_TACTICS_SET /
    // PLAYER_MATCHDAY_SQUAD_SET and consumed only by PreMatchScreen.
    tactics?: TeamTactics;
    matchdaySquad?: PlayerRef[]; // length 23: slots 1-15 starters, 16-23 bench
  };
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
      teamIds: string[];          // drives standings init
      schedule: SeasonSchedule;
    }
  | {
      type: 'FIXTURE_RESULT_RECORDED';
      result: FixtureResult;
    }
  | {
      type: 'WEEK_ADVANCED';
    }
  | {
      type: 'PLAYER_TACTICS_SET';
      tactics: TeamTactics;
    }
  | {
      type: 'PLAYER_MATCHDAY_SQUAD_SET';
      squad: PlayerRef[];
    };
