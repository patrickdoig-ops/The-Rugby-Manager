// Event-payload builders for GameCoordinator.fromSave. Pure functions over
// a SavedSeason/SavedCareer — no GameState, no applySeasonEvent. They
// normalise the saved career into the SeasonEvent payloads that fromSave
// replays through the mutation boundary.

import type { SeasonEvent } from '../types/gameState';
import type { SavedCareer, SavedSeason } from './GameCoordinator';
import { SENIOR_CAP, EFFECTIVE_CAP_CREDITS } from '../engine/balance';

const DEFAULT_SALARY_BUDGET = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;

// ROSTER_SEEDED payload from a saved career.
export function buildRosterSeededEvent(career: SavedCareer): Extract<SeasonEvent, { type: 'ROSTER_SEEDED' }> {
  return {
    type: 'ROSTER_SEEDED',
    roster: career.roster,
    clubs: career.clubs.map(c => ({
      id: c.id,
      squad: [...c.squad],
      salaryBudget: c.salaryBudget ?? DEFAULT_SALARY_BUDGET,
    })),
    nextRosterId: career.nextRosterId,
  };
}

// CAREER_ARCHIVE_RESTORED event from a save. ROSTER_SEEDED only repopulates
// roster + clubs; the cumulative career counters (seasonsCompleted, archive)
// and the market / playoff layers come through here so every state.career.*
// write stays inside applySeasonEvent.
export function buildCareerArchiveRestoredEvent(save: SavedSeason): Extract<SeasonEvent, { type: 'CAREER_ARCHIVE_RESTORED' }> {
  const career = save.career!;
  return {
    type: 'CAREER_ARCHIVE_RESTORED',
    seasonsCompleted: career.seasonsCompleted,
    archive: career.archive,
    ...(career.freeAgents !== undefined ? { freeAgents: career.freeAgents } : {}),
    ...(career.market !== undefined ? { market: career.market } : {}),
    ...(career.pendingMoves !== undefined ? { pendingMoves: career.pendingMoves } : {}),
    ...(career.preSeasonStep !== undefined ? { preSeasonStep: career.preSeasonStep } : {}),
    ...(career.takeoverHistory !== undefined ? { takeoverHistory: career.takeoverHistory } : {}),
    ...(career.midseasonRejections !== undefined ? { midseasonRejections: career.midseasonRejections } : {}),
    ...(career.activePoachedIds !== undefined ? { activePoachedIds: career.activePoachedIds } : {}),
    ...(save.teamSeasonStats !== undefined ? { teamSeasonStats: save.teamSeasonStats } : {}),
    ...(save.playoffs !== undefined ? { playoffs: save.playoffs } : {}),
  };
}
