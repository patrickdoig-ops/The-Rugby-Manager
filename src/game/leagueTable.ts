// Pure helpers over GameState.league. Sorting + lookup; no mutation.
// Standings themselves are mutated only via applySeasonEvent
// (FIXTURE_RESULT_RECORDED).

import type { TeamStanding } from '../types/gameState';

// Premiership ordering: league points, then points difference, then points for.
export function sortStandings(standings: readonly TeamStanding[]): TeamStanding[] {
  return [...standings].sort((a, b) => {
    if (b.leaguePoints !== a.leaguePoints) return b.leaguePoints - a.leaguePoints;
    if (b.pointsDiff   !== a.pointsDiff)   return b.pointsDiff   - a.pointsDiff;
    return b.pointsFor - a.pointsFor;
  });
}

export function findStanding(standings: readonly TeamStanding[], teamId: string): TeamStanding | undefined {
  return standings.find(s => s.teamId === teamId);
}
