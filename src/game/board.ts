// Board-confidence logic — the career fail-state spine. Pure functions over
// season state; all tuning numbers come from src/engine/balance/board.ts.
// Confidence is fully deterministic from results (no RNG), so the determinism
// harness is unaffected.

import type { GameState, ArchivedSeason, TeamStanding } from '../types/gameState';
import type { BoardAmbition } from '../types/teamData';
import {
  BOARD_SEED,
  BOARD_RESULT_DELTA,
  BOARD_EOS_SWING,
  BOARD_BANDS,
} from '../engine/balance';
import { sortStandings } from './leagueTable';

export type ObjectiveVerdict = 'exceeded' | 'met' | 'missed';

// Final league position (1-based) of a club in a sorted standings table, or
// null if it isn't present.
function positionOf(standings: readonly TeamStanding[], teamId: string): number | null {
  const idx = sortStandings(standings).findIndex(s => s.teamId === teamId);
  return idx >= 0 ? idx + 1 : null;
}

// Judge a finish against the board's ambition. `position` is the regular-season
// final placing (1-based); `isChampion` whether the club won the Grand Final.
// Mirrors the thresholds the inbox owner-messages already use.
export function evaluateObjective(
  ambition: BoardAmbition,
  position: number | null,
  isChampion: boolean,
  totalTeams: number,
): ObjectiveVerdict {
  if (position === null) return 'missed';
  const topHalfCut = Math.ceil(totalTeams / 2);
  switch (ambition) {
    case 'title':
      if (isChampion) return 'exceeded';
      return position <= 4 ? 'met' : 'missed';
    case 'playoffs':
      if (position <= 2) return 'exceeded';
      return position <= 4 ? 'met' : 'missed';
    case 'topHalf':
      if (position <= 4) return 'exceeded';
      return position <= topHalfCut ? 'met' : 'missed';
  }
}

// Confidence to start a season with. Year 1 (no prior season) uses the ambition
// baseline; otherwise the prior finish is judged and mapped onto a seed.
export function seedConfidence(
  ambition: BoardAmbition,
  prior: ArchivedSeason | undefined,
  teamId: string,
): number {
  if (!prior) return BOARD_SEED.year1[ambition];
  if (prior.championTeamId === teamId) return BOARD_SEED.champion;
  const verdict = evaluateObjective(
    ambition,
    positionOf(prior.standings, teamId),
    prior.championTeamId === teamId,
    prior.standings.length,
  );
  return BOARD_SEED[verdict];
}

// Per-result confidence delta. `result` is the managed club's outcome;
// `expectedToWin` whether it was the pre-match favourite; `losingStreak`
// whether this is a third consecutive league loss.
export function resultDelta(
  result: 'W' | 'D' | 'L',
  expectedToWin: boolean,
  losingStreak: boolean,
): number {
  let delta: number;
  if (result === 'W') {
    delta = expectedToWin ? BOARD_RESULT_DELTA.winFavourite : BOARD_RESULT_DELTA.winUnderdog;
  } else if (result === 'D') {
    delta = expectedToWin ? BOARD_RESULT_DELTA.drawFavourite : BOARD_RESULT_DELTA.drawUnderdog;
  } else {
    delta = expectedToWin ? BOARD_RESULT_DELTA.lossFavourite : BOARD_RESULT_DELTA.lossUnderdog;
  }
  if (losingStreak) delta += BOARD_RESULT_DELTA.losingStreakPenalty;
  return delta;
}

// End-of-season objective swing for a verdict.
export function eosSwing(verdict: ObjectiveVerdict): number {
  return BOARD_EOS_SWING[verdict];
}

// The managed club's current regular-season verdict, for the live standings.
export function currentObjectiveVerdict(state: GameState, ambition: BoardAmbition): ObjectiveVerdict {
  const teamId = state.player.teamId;
  return evaluateObjective(
    ambition,
    positionOf(state.league.standings, teamId),
    state.league.playoffs?.championTeamId === teamId,
    state.league.standings.length,
  );
}

// Hub-pill band for a confidence value.
export function confidenceBand(confidence: number): (typeof BOARD_BANDS)[number] {
  for (const band of BOARD_BANDS) {
    if (confidence >= band.min) return band;
  }
  return BOARD_BANDS[BOARD_BANDS.length - 1];
}
