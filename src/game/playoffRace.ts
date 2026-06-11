import type { GameState } from '../types/gameState';
import { LEAGUE_POINTS } from '../engine/balance/season';

const MAX_LP_PER_GAME = LEAGUE_POINTS.win + LEAGUE_POINTS.tryBonusPoints; // 5

function gamesRemaining(state: GameState, teamId: string): number {
  const total = state.league.fixtures.filter(
    f => f.homeId === teamId || f.awayId === teamId,
  ).length;
  const played = state.league.standings.find(s => s.teamId === teamId)?.played ?? 0;
  return Math.max(0, total - played);
}

function maxFinal(state: GameState, teamId: string): number {
  const pts = state.league.standings.find(s => s.teamId === teamId)?.leaguePoints ?? 0;
  return pts + MAX_LP_PER_GAME * gamesRemaining(state, teamId);
}

export function playoffRaceStatus(
  state: GameState,
  teamId: string,
): { securedTop4: boolean; securedTop2: boolean; eliminated: boolean } {
  if (state.league.playoffs !== null) {
    return { securedTop4: false, securedTop2: false, eliminated: false };
  }
  const myPts = state.league.standings.find(s => s.teamId === teamId)?.leaguePoints ?? 0;
  const myMax = maxFinal(state, teamId);
  const others = state.league.standings.filter(s => s.teamId !== teamId);

  const canCatchUs = others.filter(u => maxFinal(state, u.teamId) >= myPts).length;
  const securedTop4 = canCatchUs < 4;
  const securedTop2 = canCatchUs < 2;

  const aheadOfOurBest = others.filter(u => {
    const uPts = state.league.standings.find(s => s.teamId === u.teamId)?.leaguePoints ?? 0;
    return uPts > myMax;
  }).length;
  const eliminated = aheadOfOurBest >= 4;

  return { securedTop4, securedTop2, eliminated };
}
