// Season-scope mutation seam. The only writer to GameState.
// Mirrors the convention of src/engine/applyMatchEvent.ts — every union
// variant has a single branch, and the exhaustive `default: const _: never`
// catches missing branches at compile time when SeasonEvent grows.

import type { Fixture, GameState, SeasonEvent, TeamStanding } from '../types/gameState';
import { zeroStanding } from '../types/gameState';
import { zeroSeasonStats } from '../types/player';
import { LEAGUE_POINTS, SEASON_VALUES } from '../engine/balance';

export function applySeasonEvent(state: GameState, event: SeasonEvent): void {
  switch (event.type) {
    case 'SEASON_INITIALIZED': {
      state.player.teamId = event.playerTeamId;
      state.seed = event.seed >>> 0;
      state.calendar.week = 1;
      state.calendar.seasonLabel = event.schedule.seasonLabel;
      state.league.fixtures = event.schedule.fixtures.map(f => ({ ...f }));
      state.calendar.date = earliestDateForRound(state.league.fixtures, 1) ?? SEASON_VALUES.startDate;
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
      const nextRoundDate = earliestDateForRound(state.league.fixtures, state.calendar.week);
      state.calendar.date = nextRoundDate ?? addDays(state.calendar.date, SEASON_VALUES.weekLengthDays);
      return;
    }
    case 'PLAYER_TACTICS_SET': {
      state.player.tactics = { ...event.tactics };
      return;
    }
    case 'PLAYER_MATCHDAY_SQUAD_SET': {
      state.player.matchdaySquad = event.squad.map(r => ({ firstName: r.firstName, lastName: r.lastName }));
      return;
    }
    case 'ROSTER_SEEDED': {
      state.career.roster = event.roster;
      state.career.clubs = event.clubs.map(c => ({ id: c.id, squad: [...c.squad] }));
      state.career.nextRosterId = event.nextRosterId;
      return;
    }
    case 'PLAYER_SEASON_STATS_ACCUMULATED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      const s = p.seasonStats;
      const d = event.statsDelta;
      s.appearances     += d.appearances;
      s.tries           += d.tries;
      s.conversions     += d.conversions;
      s.penaltiesScored += d.penaltiesScored;
      s.dropGoals       += d.dropGoals;
      s.yellowCards     += d.yellowCards;
      s.redCards        += d.redCards;
      s.tackles         += d.tackles;
      s.missedTackles   += d.missedTackles;
      s.turnoversWon    += d.turnoversWon;
      s.ratingSum       += d.ratingSum;
      return;
    }
    case 'PLAYER_AGED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      for (const [stat, delta] of Object.entries(event.statDeltas)) {
        if (delta === undefined) continue;
        const k = stat as keyof typeof p.baseStats;
        p.baseStats[k] = Math.max(1, Math.min(99, p.baseStats[k] + delta));
      }
      return;
    }
    case 'PLAYER_RETIRED': {
      const club = state.career.clubs.find(c => c.id === event.clubId);
      if (club) club.squad = club.squad.filter(id => id !== event.rosterId);
      return;
    }
    case 'CAREER_ARCHIVE_RESTORED': {
      state.career.seasonsCompleted = event.seasonsCompleted;
      state.career.archive = event.archive.map(a => ({
        seasonLabel: a.seasonLabel,
        standings: a.standings.map(s => ({ ...s })),
        topScorerRosterId: a.topScorerRosterId,
        mvpRosterId: a.mvpRosterId,
      }));
      return;
    }
    case 'SEASON_ROLLED_OVER': {
      state.career.archive.push({
        seasonLabel: state.calendar.seasonLabel,
        standings: event.archivedStandings.map(s => ({ ...s })),
        topScorerRosterId: event.topScorerRosterId,
        mvpRosterId: event.mvpRosterId,
      });
      state.career.seasonsCompleted += 1;
      state.calendar.seasonLabel = event.newSeasonLabel;
      state.calendar.week = 1;
      state.league.fixtures = event.newFixtures.map(f => ({ ...f }));
      state.league.results = [];
      state.league.standings = state.league.standings.map(s => zeroStanding(s.teamId));
      state.calendar.date = earliestDateForRound(state.league.fixtures, 1) ?? state.calendar.date;
      // Reset per-player season aggregates for the new season.
      for (const id of Object.keys(state.career.roster)) {
        state.career.roster[Number(id)].seasonStats = zeroSeasonStats();
      }
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

// Min ISO date across fixtures in a given round. Returns null if no fixture
// in that round carries a date (random-gen seasons), or the round doesn't
// exist (season finished).
function earliestDateForRound(fixtures: Fixture[], round: number): string | null {
  let min: string | null = null;
  for (const f of fixtures) {
    if (f.round !== round || !f.date) continue;
    if (min === null || f.date < min) min = f.date;
  }
  return min;
}
