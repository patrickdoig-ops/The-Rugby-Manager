// Deterministic contract + reputation generator. Called from
// rosterSeeder for every player whose JSON doesn't carry hand-authored
// overrides (the ~10 marquees authored in docs/team-data.md). Uses
// rngTransfer so the same root seed produces the same contract terms.
//
// Wage formula: WAGE_BY_RATING (linear interpolation by overall) ×
// POSITION_SCARCITY[position] × WAGE_NOISE roll.
// Length: weighted by age band (older → shorter), via CONTRACT_LENGTH.
// Expiry: 30 June of (seasonStartYear + lengthYears). Staggers so the
// first rollover doesn't dump every player as a free agent at once.
// Reputation: round(overall × ratingMultiplier) + marqueeBonus, clamped
// to [0, 100].
//
// Pure: no side effects beyond advancing the rngTransfer stream. Honours
// any RawPlayer override fields verbatim and only synthesises the rest.

import type { RawPlayer } from '../types/teamData';
import type { PlayerContract } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import {
  WAGE_BY_RATING, POSITION_SCARCITY, WAGE_NOISE, CONTRACT_LENGTH, REPUTATION_SEED,
} from '../engine/balance/transfers';
import { rngTransferRaw } from '../utils/rng';

export interface SeededContractFields {
  contract: PlayerContract;
  reputation: number;
}

export function seedContractFields(
  raw: RawPlayer,
  clubId: string,
  seasonStartYear: number,
): SeededContractFields {
  const overall = playerOverall(raw.baseStats, raw.position);
  const isMarquee = raw.contract?.isMarquee ?? false;

  const contract: PlayerContract = raw.contract
    ? {
        clubId: raw.contract.clubId || clubId,
        expiresOn: raw.contract.expiresOn || expiryFor(seasonStartYear, pickLength(raw, overall)),
        annualWage: raw.contract.annualWage > 0 ? raw.contract.annualWage : synthesizeWage(raw, overall),
        isMarquee,
      }
    : {
        clubId,
        expiresOn: expiryFor(seasonStartYear, pickLength(raw, overall)),
        annualWage: synthesizeWage(raw, overall),
        isMarquee: false,
      };

  const reputation = raw.reputation ?? clampReputation(
    Math.round(overall * REPUTATION_SEED.ratingMultiplier) +
    (contract.isMarquee ? REPUTATION_SEED.marqueeBonus : 0)
  );

  return { contract, reputation };
}

function synthesizeWage(raw: RawPlayer, overall: number): number {
  const base = wageFromRating(overall);
  const scarcity = POSITION_SCARCITY[raw.position] ?? 1.0;
  const noise = WAGE_NOISE.min + rngTransferRaw() * (WAGE_NOISE.max - WAGE_NOISE.min);
  const wage = base * scarcity * noise;
  // Round to the nearest £5k so the UI never shows £138,743.
  return Math.max(20_000, Math.round(wage / 5_000) * 5_000);
}

// Piecewise-linear lookup between the anchor points. Below the lowest
// or above the highest, clamp to the endpoint.
function wageFromRating(overall: number): number {
  const anchors = WAGE_BY_RATING;
  if (overall <= anchors[0].rating) return anchors[0].wage;
  if (overall >= anchors[anchors.length - 1].rating) return anchors[anchors.length - 1].wage;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (overall >= a.rating && overall <= b.rating) {
      const t = (overall - a.rating) / (b.rating - a.rating);
      return a.wage + t * (b.wage - a.wage);
    }
  }
  return anchors[anchors.length - 1].wage;
}

function pickLength(raw: RawPlayer, overall: number): number {
  const age = currentAgeForLengthHeuristic(raw, overall);
  const bucket = age < 25
    ? CONTRACT_LENGTH.under25
    : age < 30
      ? CONTRACT_LENGTH.age25to30
      : CONTRACT_LENGTH.age30plus;
  const roll = rngTransferRaw();
  if (roll < bucket.p1) return 1;
  if (roll < bucket.p2) return 2;
  return 3;
}

// Best-effort age estimate at seed time. Uses the JSON dob when
// present; falls back to a rating-based heuristic for the
// no-dob case so the length distribution still behaves.
function currentAgeForLengthHeuristic(raw: RawPlayer, overall: number): number {
  if (raw.dob) {
    const seasonOpen = new Date('2025-09-01');
    const dob = new Date(raw.dob);
    let age = seasonOpen.getUTCFullYear() - dob.getUTCFullYear();
    const m = seasonOpen.getUTCMonth() - dob.getUTCMonth();
    if (m < 0 || (m === 0 && seasonOpen.getUTCDate() < dob.getUTCDate())) age -= 1;
    return age;
  }
  return overall >= 85 ? 28 : 25;
}

function expiryFor(seasonStartYear: number, lengthYears: number): string {
  return `${seasonStartYear + lengthYears}-06-30`;
}

function clampReputation(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
