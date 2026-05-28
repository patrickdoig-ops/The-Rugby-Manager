// Save-version migration / back-fill. Pure functions over a (possibly
// legacy) SavedSeason — no GameState, no applySeasonEvent. They normalise
// an on-disk save into the event payloads that GameCoordinator.fromSave
// replays through the season mutation boundary, so the version ladder
// lives here as a single deserialisation concern rather than tangled into
// the runtime orchestrator. The full version table is in
// docs/game-engine.md § "Save format".
//
// GameCoordinator stays the only caller of applySeasonEvent: these
// builders return event objects / normalise the save in place; the
// coordinator applies them.

import type { SeasonEvent, SeasonSchedule } from '../types/gameState';
import type { SavedCareer, SavedSeason } from './GameCoordinator';
import { seedContractFields } from './contractSeeder';
import { SENIOR_CAP, EFFECTIVE_CAP_CREDITS } from '../engine/balance';

const DEFAULT_SALARY_BUDGET = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;

// Prefer the schedule embedded in the save (v3+); fall back to the
// current canonical one for legacy v2 saves that pre-date the field.
export function resolveSchedule(save: SavedSeason, fallback: SeasonSchedule): SeasonSchedule {
  return save.fixtures
    ? { seasonLabel: save.seasonLabel ?? fallback.seasonLabel, fixtures: save.fixtures.map(f => ({ ...f })) }
    : fallback;
}

// v5 → v6 back-fill. Saved Players from a v5-era career lack the
// `contract` + `reputation` fields added in Phase 2. Synthesise them via
// contractSeeder so the loaded career is usable on v6 code paths
// (ContractsScreen, etc.). Mutates the saved roster in place. Walks
// rosterId-ascending so the contractSeeder rngTransfer call order is
// stable across runs.
export function backfillCareerContracts(career: SavedCareer, seasonStartYear: number): void {
  const rosterIds = Object.keys(career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = career.roster[rid];
    if (!p.contract || !p.contract.expiresOn) {
      const club = career.clubs.find(c => c.squad.includes(rid));
      const { contract, reputation } = seedContractFields(p, club?.id ?? '', seasonStartYear);
      p.contract = contract;
      if (typeof p.reputation !== 'number') p.reputation = reputation;
    }
  }
}

// ROSTER_SEEDED payload from a saved career. v13 saves omit salaryBudget —
// default to the effective cap so the load is non-disruptive; the next
// rollover recomputes via computeBudgetEvents so per-club budgets kick in
// from then on. See docs/game-engine.md § "Save format" v13 → v14. Call
// backfillCareerContracts first — this reads career.roster verbatim.
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

// CAREER_ARCHIVE_RESTORED event from a save. ROSTER_SEEDED only
// repopulates roster + clubs; the cumulative career counters
// (seasonsCompleted, archive) and the market / playoff layers come
// through here so every state.career.* write stays inside
// applySeasonEvent — no mutation-boundary carveout. Each optional layer
// is included only when the save actually carries it; older versions
// omit some and the reducer leaves those at their emptyCareerState
// defaults.
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
    ...(save.teamSeasonStats !== undefined ? { teamSeasonStats: save.teamSeasonStats } : {}),
    ...(save.playoffs !== undefined ? { playoffs: save.playoffs } : {}),
  };
}
