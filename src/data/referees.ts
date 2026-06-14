// Authored pool of match officials.
//
// strictness     — multiplier on every penalty base-rate roll (>1 = strict,
//                  calls more stoppages; <1 = lenient, lets the game flow).
// cardThreshold  — multiplier on every card-escalation probability (>1 = more
//                  likely to card; <1 = slower to reach for the pocket).
//
// Both dials are within [0.85, 1.15] (REFEREE_STRICTNESS_RANGE /
// REFEREE_CARD_THRESHOLD_RANGE in balance/referees.ts).

import { rngTransferRaw } from '../utils/rng';
import type { Fixture } from '../types/gameState';

export interface Referee {
  id:             string;
  name:           string;
  strictness:     number;   // [0.85, 1.15]
  cardThreshold:  number;   // [0.85, 1.15]
}

export const REFEREES: Referee[] = [
  { id: 'ref-01', name: 'Craig Maxwell-Keys', strictness: 1.10, cardThreshold: 1.05 },
  { id: 'ref-02', name: 'Karl Dickson',        strictness: 0.90, cardThreshold: 0.90 },
  { id: 'ref-03', name: 'Luke Pearce',         strictness: 1.05, cardThreshold: 1.15 },
  { id: 'ref-04', name: 'Ian Tempest',         strictness: 1.00, cardThreshold: 1.00 },
  { id: 'ref-05', name: 'Matthew Carley',      strictness: 1.15, cardThreshold: 1.10 },
  { id: 'ref-06', name: 'Wayne Barnes',        strictness: 0.95, cardThreshold: 0.85 },
  { id: 'ref-07', name: 'Tom Foley',           strictness: 0.85, cardThreshold: 0.95 },
  { id: 'ref-08', name: 'Adam Leal',           strictness: 1.00, cardThreshold: 1.05 },
  { id: 'ref-09', name: 'Christophe Ridley',   strictness: 0.92, cardThreshold: 0.92 },
  { id: 'ref-10', name: 'Brett Cronan',        strictness: 1.08, cardThreshold: 1.00 },
  { id: 'ref-11', name: 'Sara Cox',            strictness: 0.97, cardThreshold: 1.10 },
  { id: 'ref-12', name: 'Andrew Jackson',      strictness: 1.03, cardThreshold: 0.88 },
];

// Build a map for O(1) lookup at match time.
const _byId = new Map<string, Referee>(REFEREES.map(r => [r.id, r]));
export function getRefereeById(id: string): Referee | undefined {
  return _byId.get(id);
}

// Assign a referee to each fixture by picking randomly from REFEREES via the
// career RNG stream (rngTransferRaw). Called at season-init and rollover time
// after the fixture list is finalised. Returns a new array (does not mutate).
export function assignReferees(fixtures: Fixture[]): Fixture[] {
  const n = REFEREES.length;
  return fixtures.map(f => ({
    ...f,
    refereeId: REFEREES[Math.floor(rngTransferRaw() * n)].id,
  }));
}
