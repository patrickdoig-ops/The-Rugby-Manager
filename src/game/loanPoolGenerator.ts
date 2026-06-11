// Generates the season's loan-available player pool (Feature 2.3).
// Fires LOAN_POOL_SEEDED + individual FOREIGN_IMPORT_ARRIVED events so
// each generated player lands in career.roster via the normal mutation
// seam. Deterministic from rngTransfer — called once per season: at
// GameCoordinator.newSeason() for year 1, then at the end of every
// rollSeason() (after the rollover events apply, so nextRosterId is
// current and the draws can't shift any rollover rngTransfer draw).
//
// Players are lower-league quality (OVR 55-72, ages 19-26) and carry no
// club affiliation (contract.clubId = ''). They persist in career.roster
// across seasons as orphaned records once the pool is replaced at the
// next season's re-seed.

import type { GameState, SeasonEvent } from '../types/gameState';
import { generatePersona } from './personaGenerator';
import { rngTransfer } from '../utils/rng';
import { LOAN_POOL } from '../engine/balance/transfers';

export function buildLoanPoolEvents(state: GameState): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  const count = rngTransfer(LOAN_POOL.countMin, LOAN_POOL.countMax);
  const rosterIds: number[] = [];
  let nextId = state.career.nextRosterId;

  for (let i = 0; i < count; i++) {
    const player = generatePersona(
      {
        rosterId: nextId,
        ageBand: { min: LOAN_POOL.ageMin, max: LOAN_POOL.ageMax },
        ratingBand: { min: LOAN_POOL.ratingMin, max: LOAN_POOL.ratingMax },
      },
      state.calendar.date,
    );
    events.push({ type: 'FOREIGN_IMPORT_ARRIVED', player });
    rosterIds.push(nextId);
    nextId++;
  }

  events.push({ type: 'LOAN_POOL_SEEDED', rosterIds });
  return events;
}
