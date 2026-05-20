// Season-scope mutation seam. The only writer to GameState.
// Mirrors the convention of src/engine/applyMatchEvent.ts — every union
// variant has a single branch, and the exhaustive `default: const _: never`
// catches missing branches at compile time when SeasonEvent grows.

import type { GameState, SeasonEvent, TeamStanding } from '../types/gameState';
import { zeroStanding } from '../types/gameState';
import { generateFixtures } from './fixtures';
import { LEAGUE_POINTS, SEASON_VALUES } from '../engine/balance';

export function applySeasonEvent(state: GameState, event: SeasonEvent): void {
  switch (event.type) {
    case 'SEASON_INITIALIZED': {
      state.player.teamId = event.playerTeamId;
      state.seed = event.seed >>> 0;
      state.calendar.date = event.startDate;
      state.calendar.week = 1;
      state.calendar.seasonLabel = event.seasonLabel;
      state.league.fixtures = generateFixtures(event.playerTeamId, event.teamIds);
      state.league.results = [];
      state.league.standings = event.teamIds.map(zeroStanding);
      return;
    }
    case 'FIXTURE_RESULT_RECORDED': {
      state.league.results.push(event.result);
      const home = findOrCreate(state.league.standings, event.result.homeId);
      const away = findOrCreate(state.league.standings, event.result.awayId);
      const margin = event.result.homeScore - event.result.awayScore;
      applyToSide(home, event.result.homeScore, event.result.awayScore, margin);
      applyToSide(away, event.result.awayScore, event.result.homeScore, -margin);
      return;
    }
    case 'WEEK_ADVANCED': {
      state.calendar.week += 1;
      state.calendar.date = addDays(state.calendar.date, SEASON_VALUES.weekLengthDays);
      return;
    }
    default: {
      const _: never = event;
      void _;
      return;
    }
  }
}

function findOrCreate(standings: TeamStanding[], teamId: string): TeamStanding {
  let s = standings.find(x => x.teamId === teamId);
  if (!s) {
    s = zeroStanding(teamId);
    standings.push(s);
  }
  return s;
}

function applyToSide(s: TeamStanding, pf: number, pa: number, margin: number): void {
  s.played += 1;
  s.pointsFor += pf;
  s.pointsAgainst += pa;
  s.pointsDiff = s.pointsFor - s.pointsAgainst;
  if (margin > 0) {
    s.won += 1;
    s.leaguePoints += LEAGUE_POINTS.win;
  } else if (margin === 0) {
    s.drawn += 1;
    s.leaguePoints += LEAGUE_POINTS.draw;
  } else {
    s.lost += 1;
    s.leaguePoints += LEAGUE_POINTS.loss;
    if (-margin <= LEAGUE_POINTS.losingBonusThreshold) {
      s.leaguePoints += LEAGUE_POINTS.losingBonusPoints;
    }
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
