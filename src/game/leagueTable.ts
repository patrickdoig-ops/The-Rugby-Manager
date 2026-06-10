// Pure helpers over GameState.league. Sorting + lookup; no mutation.
// Standings themselves are mutated only via applySeasonEvent
// (FIXTURE_RESULT_RECORDED).

import type { FixtureResult, TeamStanding } from '../types/gameState';
import { LEAGUE_POINTS } from '../engine/balance';

// league ordering: league points, then points difference, then points for.
// Relies on Array.prototype.sort being stable (ES2019+) so that fully tied
// teams retain their relative source order — important for the playoff
// bracket seeding which calls sortStandings(top 4).
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

// Recomputes standings from a slice of results without touching live state.
// Used by RoundResultsScreen to derive the pre-round position for the delta chip.
export function computeStandingsFromResults(results: readonly FixtureResult[]): TeamStanding[] {
  const map = new Map<string, TeamStanding>();
  const get = (id: string): TeamStanding => {
    if (!map.has(id)) map.set(id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0,
      pointsFor: 0, pointsAgainst: 0, pointsDiff: 0, tryBonus: 0, losingBonus: 0, leaguePoints: 0 });
    return map.get(id)!;
  };
  for (const r of results) {
    applyResultToStanding(get(r.homeId), r.homeScore, r.awayScore, r.homeTries,  r.homeScore - r.awayScore);
    applyResultToStanding(get(r.awayId), r.awayScore, r.homeScore, r.awayTries, -(r.homeScore - r.awayScore));
  }
  return [...map.values()];
}

// League points earned from one result: win=4 / draw=2 / loss=0, +1 for
// losing by ≤7, +1 for ≥4 tries (try bonus is independent of the result).
// The single place the bonus rules live — applyResultToStanding and
// teamStats.formPoints both build on it.
export function resultLeaguePoints(margin: number, tries: number): number {
  let pts = margin > 0 ? LEAGUE_POINTS.win : margin === 0 ? LEAGUE_POINTS.draw : LEAGUE_POINTS.loss;
  if (margin < 0 && -margin <= LEAGUE_POINTS.losingBonusThreshold) pts += LEAGUE_POINTS.losingBonusPoints;
  if (tries >= LEAGUE_POINTS.tryBonusThreshold) pts += LEAGUE_POINTS.tryBonusPoints;
  return pts;
}

// Applies one result to a TeamStanding in place. Shared by the league /
// cup / European standings reducers in applySeasonEvent and the
// from-results recompute above.
export function applyResultToStanding(s: TeamStanding, pf: number, pa: number, tries: number, margin: number): void {
  s.played++; s.pointsFor += pf; s.pointsAgainst += pa; s.pointsDiff = s.pointsFor - s.pointsAgainst;
  if (margin > 0)        s.won++;
  else if (margin === 0) s.drawn++;
  else {
    s.lost++;
    if (-margin <= LEAGUE_POINTS.losingBonusThreshold) s.losingBonus++;
  }
  if (tries >= LEAGUE_POINTS.tryBonusThreshold) s.tryBonus++;
  s.leaguePoints += resultLeaguePoints(margin, tries);
}
