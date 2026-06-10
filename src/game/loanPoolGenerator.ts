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

const LOAN_POOL_MIN = 15;
const LOAN_POOL_MAX = 20;
const LOAN_AGE_BAND  = { min: 19, max: 26 };
const LOAN_RATING_BAND = { min: 55, max: 72 };

export function buildLoanPoolEvents(state: GameState): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  const count = rngTransfer(LOAN_POOL_MIN, LOAN_POOL_MAX);
  const rosterIds: number[] = [];
  let nextId = state.career.nextRosterId;

  for (let i = 0; i < count; i++) {
    const player = generatePersona(
      { rosterId: nextId, ageBand: LOAN_AGE_BAND, ratingBand: LOAN_RATING_BAND },
      state.calendar.date,
    );
    events.push({ type: 'FOREIGN_IMPORT_ARRIVED', player });
    rosterIds.push(nextId);
    nextId++;
  }

  events.push({ type: 'LOAN_POOL_SEEDED', rosterIds });
  return events;
}
