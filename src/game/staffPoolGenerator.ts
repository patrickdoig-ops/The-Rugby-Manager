// Generates the hireable staff pool for each season rollover.
// All randomness uses rngTransfer so it's part of the career stream
// and cannot perturb match outcomes.
//
// Takes a `startId` from CareerState.nextStaffId (mirrors the nextRosterId
// pattern) so IDs are fully deterministic across replays.

import type { StaffMember, StaffRole } from '../types/gameState';
import { rngTransfer } from '../utils/rng';
import {
  STAFF_POOL_SIZES, STAFF_RATING_BAND, STAFF_WAGES_BY_RATING,
} from '../engine/balance/staff';

const FIRST_NAMES = [
  'James', 'Richard', 'Mark', 'David', 'Steve', 'Paul', 'Chris', 'Andrew',
  'Simon', 'John', 'Michael', 'Peter', 'Neil', 'Gary', 'Ian', 'Phil',
  'Rob', 'Tom', 'Will', 'Dan', 'Matt', 'Sam', 'Alex', 'Joe',
];
const LAST_NAMES = [
  'Harris', 'Clarke', 'Fletcher', 'Walsh', 'Murphy', 'Evans', 'Davies',
  'Morgan', 'Brown', 'Smith', 'Jones', 'Wilson', 'Taylor', 'Hall',
  'Robinson', 'King', 'Baker', 'Hill', 'Cooper', 'Ward', 'Turner',
  'Parker', 'Young', 'Mitchell',
];

export function staffWageForRating(rating: number): number {
  const anchors = STAFF_WAGES_BY_RATING;
  if (rating <= anchors[0].rating) return anchors[0].annualWage;
  if (rating >= anchors[anchors.length - 1].rating) return anchors[anchors.length - 1].annualWage;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (rating >= a.rating && rating <= b.rating) {
      const t = (rating - a.rating) / (b.rating - a.rating);
      return Math.round(a.annualWage + t * (b.annualWage - a.annualWage));
    }
  }
  return anchors[anchors.length - 1].annualWage;
}

function generateOne(id: number, role: StaffRole): StaffMember {
  const firstName = FIRST_NAMES[rngTransfer(0, FIRST_NAMES.length - 1)];
  const lastName  = LAST_NAMES[rngTransfer(0, LAST_NAMES.length - 1)];
  const rating    = rngTransfer(STAFF_RATING_BAND.min, STAFF_RATING_BAND.max);
  return {
    id:         `s${id}`,
    role,
    name:       `${firstName} ${lastName}`,
    rating,
    annualWage: staffWageForRating(rating),
    clubId:     null,
  };
}

// Generate a fresh free pool for the start of a season. `startId` comes from
// CareerState.nextStaffId (or 1 on first run). Returns the pool and the
// updated counter so the caller can persist it via STAFF_POOL_SEEDED.
export function generateStaffPool(startId: number): { staff: StaffMember[]; nextStaffId: number } {
  const pool: StaffMember[] = [];
  let id = startId;
  for (let i = 0; i < STAFF_POOL_SIZES.assistant; i++) pool.push(generateOne(id++, 'assistant'));
  for (let i = 0; i < STAFF_POOL_SIZES.fitness;   i++) pool.push(generateOne(id++, 'fitness'));
  for (let i = 0; i < STAFF_POOL_SIZES.scout;     i++) pool.push(generateOne(id++, 'scout'));
  return { staff: pool, nextStaffId: id };
}
