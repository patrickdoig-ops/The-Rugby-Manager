// Shared helpers that summarise a SavedSeason for display — the Home screen's
// "Continue Career" card and the Saves screen's slot cards both derive their
// team / week / league-position teaser from these pure functions.

import type { RawTeamInput } from '../types/teamData';
import type { SavedSeason, SavedSeasonResult } from './GameCoordinator';
import { PREMIERSHIP_2025_26 } from '../data/fixtures-2025-26';
import { resultLeaguePoints } from './leagueTable';

export function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// League standings recomputed from saved fixture results, using the same
// shared points rule as the live table (win/draw + losing bonus + 4-try
// bonus via resultLeaguePoints) — exact, not approximate.
interface SimpleStanding {
  teamId: string;
  pts: number;
  pf: number;
  pa: number;
}

function approximateStandings(teamIds: string[], results: SavedSeasonResult[]): SimpleStanding[] {
  const map = new Map<string, SimpleStanding>(
    teamIds.map(id => [id, { teamId: id, pts: 0, pf: 0, pa: 0 }]),
  );
  for (const r of results) {
    const home = map.get(r.homeId);
    const away = map.get(r.awayId);
    if (!home || !away) continue;
    home.pf += r.homeScore;  home.pa += r.awayScore;
    away.pf += r.awayScore;  away.pa += r.homeScore;
    const margin = r.homeScore - r.awayScore;
    home.pts += resultLeaguePoints(margin, r.homeTries);
    away.pts += resultLeaguePoints(-margin, r.awayTries);
  }
  return [...map.values()].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    return (b.pf - b.pa) - (a.pf - a.pa);
  });
}

export interface SaveContext {
  teamName: string;
  week: number;
  totalRounds: number;
  rank: number;
  pts: number;
  seasonLabel: string;
}

export function buildSaveContext(save: SavedSeason, allTeams: RawTeamInput[]): SaveContext | null {
  const team = allTeams.find(t => t.id === save.playerTeamId);
  if (!team) return null;
  const totalRounds = (save.fixtures ?? PREMIERSHIP_2025_26.fixtures)
    .reduce((m, f) => Math.max(m, f.round), 0);
  const standings = approximateStandings(allTeams.map(t => t.id), save.results);
  const rankIdx = standings.findIndex(s => s.teamId === save.playerTeamId);
  const player = rankIdx >= 0 ? standings[rankIdx] : null;
  return {
    teamName: team.name,
    week: save.currentWeek,
    totalRounds,
    rank: rankIdx + 1,
    pts: player?.pts ?? 0,
    seasonLabel: save.seasonLabel ?? '2025/26',
  };
}
