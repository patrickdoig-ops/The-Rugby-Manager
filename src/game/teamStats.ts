// Pure derivations from `GameState.league.results` + team overall ratings.
// Used by the pre-match screen's stake row (form pins, H2H, spread). Every
// helper takes the slice it needs as an argument — no module state, no
// reading from the bus, no subscription to game events.

import type { FixtureResult, TeamStanding } from '../types/gameState';

export type FormResult = 'W' | 'L' | 'D';

// Last `n` results for the team, padded with null on the left so the most
// recent result is always the rightmost slot. Slot semantics: index 0 is
// the oldest visible game, index n-1 is the most recent.
export function recentForm(teamId: string, results: FixtureResult[], n = 5): Array<FormResult | null> {
  const involved = results
    .filter(r => r.homeId === teamId || r.awayId === teamId)
    .sort((a, b) => b.round - a.round)
    .slice(0, n);

  const mostRecentFirst: FormResult[] = involved.map(r => {
    const isHome = r.homeId === teamId;
    const my = isHome ? r.homeScore : r.awayScore;
    const op = isHome ? r.awayScore : r.homeScore;
    if (my > op) return 'W';
    if (my < op) return 'L';
    return 'D';
  });

  const oldestFirst = mostRecentFirst.reverse();
  const padding = Array<FormResult | null>(n - oldestFirst.length).fill(null);
  return [...padding, ...oldestFirst];
}

export interface H2H {
  wins:   number;
  draws:  number;
  losses: number;
  meetings: number;
}

// Head-to-head record from team A's perspective across every meeting so far
// in the season. `meetings === 0` means the two teams have not yet played.
export function headToHead(teamA: string, teamB: string, results: FixtureResult[]): H2H {
  let wins = 0, draws = 0, losses = 0;
  for (const r of results) {
    const aHome = r.homeId === teamA && r.awayId === teamB;
    const aAway = r.homeId === teamB && r.awayId === teamA;
    if (!aHome && !aAway) continue;
    const my = aHome ? r.homeScore : r.awayScore;
    const op = aHome ? r.awayScore : r.homeScore;
    if (my > op) wins++;
    else if (my < op) losses++;
    else draws++;
  }
  return { wins, draws, losses, meetings: wins + draws + losses };
}

// Spread tuning. Both numbers live here (not in src/engine/balance/)
// because they're prediction-only: the actual match engine doesn't apply
// home advantage or league-form modifiers to outcomes today. Tweak in one
// place if either factor needs recalibrating.
export const HOME_ADVANTAGE_PTS = 3;
export const FORM_PTS_WEIGHT    = 0.1;

// "Live" form adjustment: the team's league points relative to the league
// average, scaled by FORM_PTS_WEIGHT. Zero at season start (every team on
// 0 pts → average is 0 → delta is 0); grows as standings spread out.
// Returns 0 for a missing standing or an empty league — both states mean
// "no signal yet".
export function formAdjustment(
  standing: TeamStanding | undefined,
  standings: TeamStanding[],
): number {
  if (!standing || standings.length === 0) return 0;
  const total = standings.reduce((sum, s) => sum + s.leaguePoints, 0);
  const avg = total / standings.length;
  return (standing.leaguePoints - avg) * FORM_PTS_WEIGHT;
}

// Match handicap from two effective ratings. The favoured team's spread is
// negative; the underdog's is positive. At this league's scoring tempo 1
// rating point ≈ 1 scoreboard point, so the difference doubles as the
// expected margin. Symmetric: `home + away === 0`.
//
// Inputs are *effective* ratings — caller is expected to bake in
// HOME_ADVANTAGE_PTS for the home side and formAdjustment for each team
// before calling, keeping this helper a pure mathematical transform.
export function matchSpread(homeRating: number, awayRating: number): { home: number; away: number } {
  const home = Math.round(awayRating - homeRating);
  return { home, away: -home };
}
