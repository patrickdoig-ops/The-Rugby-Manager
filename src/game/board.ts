// Board-confidence logic — the career fail-state spine. Pure functions over
// season state; all tuning numbers come from src/engine/balance/board.ts.
// Confidence is fully deterministic from results (no RNG), so the determinism
// harness is unaffected.

import type { GameState, ArchivedSeason, TeamStanding, EuropeanObjective } from '../types/gameState';
import type { BoardAmbition } from '../types/teamData';
import {
  BOARD_SEED,
  BOARD_RESULT_DELTA,
  BOARD_EOS_SWING,
  BOARD_BANDS,
} from '../engine/balance';
import { sortStandings } from './leagueTable';
import { recentForm } from './teamStats';
import type { FormResult } from './teamStats';

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

export interface BoardFactor {
  label: string;
  detail: string;
  tone: 'positive' | 'negative' | 'neutral';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// Phrase the owner's European target as a full objective, e.g. "win the
// European Cup" / "reach the European Shield semi-finals". Used by the board
// breakdown + the season-objective owner messages.
export function europeanObjectiveText(objective: EuropeanObjective, compName: string): string {
  switch (objective) {
    case 'win':          return `win the ${compName}`;
    case 'final':        return `reach the ${compName} final`;
    case 'semifinal':    return `reach the ${compName} semi-finals`;
    case 'quarterfinal': return `reach the ${compName} quarter-finals`;
    case 'r16':          return `reach the ${compName} knockout stage`;
    case 'participate':  return `make a respectable showing in the ${compName}`;
  }
}

// The concrete factors currently moving board confidence, for the Club page's
// "what's driving it" breakdown. Mirrors the real mechanics: results vs
// expectation (the per-result deltas), losing runs (the streak penalty), and
// the season objective the owner judges against. Ordered most-relevant first.
export function boardConfidenceFactors(state: GameState): BoardFactor[] {
  const board = state.player.board;
  if (!board) return [];
  const factors: BoardFactor[] = [];
  const teamId = state.player.teamId;

  // Season objective + where the club sits against it (live verdict).
  const verdict = currentObjectiveVerdict(state, board.objective);
  const pos = positionOf(state.league.standings, teamId);
  const objText = board.objective === 'title' ? 'win the Premiership'
    : board.objective === 'playoffs' ? 'reach the playoffs (top four)'
    : 'finish in the top half';
  factors.push({
    label: 'Season objective',
    detail: pos
      ? `The owner expects you to ${objText}. You sit ${ordinal(pos)}${verdict === 'exceeded' ? ' — ahead of target.' : verdict === 'met' ? ' — on target.' : ' — below target.'}`
      : `The owner expects you to ${objText}.`,
    tone: verdict === 'missed' ? 'negative' : verdict === 'exceeded' ? 'positive' : 'neutral',
  });

  // European objective — the owner's continental target this season.
  if (board.europeanObjective) {
    const inCup = state.league.europeanCup?.pools.some(p => p.teamIds.includes(teamId)) ?? false;
    const compName = inCup ? 'European Cup' : 'European Shield';
    factors.push({
      label: 'European objective',
      detail: `The owner expects you to ${europeanObjectiveText(board.europeanObjective, compName)}.`,
      tone: 'neutral',
    });
  }

  // Recent results — the main lever on confidence.
  const last = recentForm(teamId, state.league.results, 5).filter((r): r is FormResult => r !== null);
  if (last.length > 0) {
    const w = last.filter(r => r === 'W').length;
    const d = last.filter(r => r === 'D').length;
    const l = last.filter(r => r === 'L').length;
    factors.push({
      label: 'Recent results',
      detail: `${w} win${w !== 1 ? 's' : ''}, ${d} draw${d !== 1 ? 's' : ''}, ${l} loss${l !== 1 ? 'es' : ''} in your last ${last.length}. ${w >= 3 ? 'The board is pleased.' : l >= 3 ? 'Poor results are weighing heavily.' : 'A mixed run.'}`,
      tone: w >= 3 ? 'positive' : l >= 3 ? 'negative' : 'neutral',
    });

    // Current run — a streak amplifies the swing (3+ losses add an extra hit).
    const lastResult = last[last.length - 1];
    let run = 1;
    for (let i = last.length - 2; i >= 0; i--) {
      if (last[i] === lastResult) run++; else break;
    }
    if (lastResult === 'L' && run >= 3) {
      factors.push({ label: 'Form alarm', detail: `On a ${run}-match losing run. A sustained slump like this drains confidence fast and puts your job at risk.`, tone: 'negative' });
    } else if (lastResult === 'W' && run >= 3) {
      factors.push({ label: 'In form', detail: `On a ${run}-match winning run. Momentum like this is exactly what the owner wants to see.`, tone: 'positive' });
    }
  }

  // Formal-warning latch.
  if (board.warningIssued) {
    factors.push({ label: 'Formal warning', detail: 'The board has issued a formal warning over your position. Confidence is in the danger zone — results must improve immediately.', tone: 'negative' });
  }

  return factors;
}
