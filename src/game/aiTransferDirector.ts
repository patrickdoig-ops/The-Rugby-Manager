// AI-side renewal logic for the end-of-season market window. Pure +
// deterministic — no RNG in the decision path (renewal wages are
// generated via contractSeeder, which uses rngTransfer; the
// accept-or-reject choice is purely a sort-by-rating greedy against
// the cap target).
//
// Phase 4 surface: only own-club renewals. Phase 5+ adds free-agent
// signings + cross-club poaching using the same TransferOffer shape.

import type { GameState, TransferOffer } from '../types/gameState';
import { playerOverall } from '../engine/RatingEngine';
import { SENIOR_CAP, RENEWAL } from '../engine/balance/transfers';
import { seedContractFields } from './contractSeeder';
import { parseSeasonStartYear } from './age';

// Rosters players whose contract expires on or before 30 June of the
// just-completed season's end year. Stable rosterId-ascending order.
export function expiringRosterIds(state: GameState): number[] {
  const seasonStartYear = parseSeasonStartYear(state.calendar.seasonLabel);
  const cutoff = `${seasonStartYear + 1}-06-30`;
  const ids: number[] = [];
  for (const club of state.career.clubs) {
    for (const rid of club.squad) {
      const p = state.career.roster[rid];
      if (!p) continue;
      if (p.contract.expiresOn && p.contract.expiresOn <= cutoff) {
        ids.push(rid);
      }
    }
  }
  return ids.sort((a, b) => a - b);
}

// One TransferOffer per expiring player league-wide. Wage =
// fresh-market rate × (1 - loyaltyDiscount), rounded to £5k. Length
// re-derived from current age via contractSeeder (advances rngTransfer
// in stable rosterId order, so the offer set is deterministic).
export function generateRenewalOffers(state: GameState): TransferOffer[] {
  const seasonStartYear = parseSeasonStartYear(state.calendar.seasonLabel);
  const expiring = expiringRosterIds(state);
  const offers: TransferOffer[] = [];
  for (const rid of expiring) {
    const p = state.career.roster[rid];
    if (!p) continue;
    const fresh = seedContractFields(p, p.contract.clubId, seasonStartYear);
    const renewalWage = Math.max(
      20_000,
      Math.round(fresh.contract.annualWage * (1 - RENEWAL.loyaltyDiscount) / 5_000) * 5_000,
    );
    offers.push({
      id: makeOfferId(state.career.seasonsCompleted, p.contract.clubId, rid),
      fromClubId: p.contract.clubId,
      rosterId: rid,
      annualWage: renewalWage,
      lengthYears: yearsBetween(p.contract.expiresOn, fresh.contract.expiresOn),
      isMarquee: p.contract.isMarquee,
      status: 'pending',
    });
  }
  return offers;
}

// Greedy renewal decisions for a single club. Pure / RNG-free.
//
//   1. Compute the cap headroom available after the club's non-marquee
//      non-expiring squad members are accounted for.
//   2. Sort expiring offers by overall rating descending.
//   3. Iterate: marquees always renew; players under the floor always
//      release; otherwise renew if the wage fits the remaining headroom.
//
// Returns the offer IDs to accept and to reject. The caller fires
// OFFER_RESPONDED + CONTRACT_EXTENDED / CONTRACT_TERMINATED for each.
export function decideAIOffers(state: GameState, clubId: string): { acceptIds: string[]; rejectIds: string[] } {
  const market = state.career.market;
  const club = state.career.clubs.find(c => c.id === clubId);
  if (!market || !club) return { acceptIds: [], rejectIds: [] };

  const clubOffers = market.offers.filter(o => o.fromClubId === clubId && o.status === 'pending');
  if (clubOffers.length === 0) return { acceptIds: [], rejectIds: [] };

  // Two cap snapshots:
  //   preWindowCap — all non-marquee wages BEFORE the window opens
  //   (includes the expiring players at their current rates).
  //   fixedCap — non-marquee wages AFTER expiring players drop off.
  //
  // Cap target = max(SENIOR_CAP × aiTargetCapUtilisation, preWindowCap).
  // The lower bound keeps under-cap clubs disciplined; the
  // upper bound stops over-cap clubs (most of them, in v2.23a's
  // seeded world) from shedding their entire expiring cohort the
  // first time a renewal window opens. Renewals' loyalty discount
  // means most renewals reduce wage anyway, so over-cap clubs
  // gradually converge toward the cap over multiple seasons.
  const expiringSet = new Set(market.expiringRosterIds);
  let preWindowCap = 0;
  let fixedCap = 0;
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (!p || p.contract.isMarquee) continue;
    preWindowCap += p.contract.annualWage;
    if (expiringSet.has(rid)) continue;
    fixedCap += p.contract.annualWage;
  }
  const targetCap = Math.max(SENIOR_CAP * RENEWAL.aiTargetCapUtilisation, preWindowCap);
  let headroom = targetCap - fixedCap;

  const ranked = clubOffers.map(o => {
    const p = state.career.roster[o.rosterId];
    const ovr = p ? playerOverall(p.baseStats, p.position) : 0;
    return { offer: o, ovr };
  }).sort((a, b) => b.ovr - a.ovr || a.offer.rosterId - b.offer.rosterId);

  const acceptIds: string[] = [];
  const rejectIds: string[] = [];
  for (const { offer, ovr } of ranked) {
    if (ovr < RENEWAL.aiReleaseRatingFloor) {
      rejectIds.push(offer.id);
      continue;
    }
    if (offer.isMarquee) {
      acceptIds.push(offer.id);
      continue;
    }
    if (offer.annualWage <= headroom) {
      acceptIds.push(offer.id);
      headroom -= offer.annualWage;
    } else {
      rejectIds.push(offer.id);
    }
  }
  return { acceptIds, rejectIds };
}

// New expiry ISO date when a renewal offer with `lengthYears` is
// accepted in the current season. Returns "yyyy-06-30" of the
// (current season's end year + lengthYears - 1).
//
// Example: season "2025/26" + 3-year renewal → "2028-06-30" (the new
// deal covers 2026/27, 2027/28, 2028/29).
export function expiryAfterYears(state: GameState, lengthYears: number): string {
  const startYear = parseSeasonStartYear(state.calendar.seasonLabel);
  // The current season ends in startYear + 1 (e.g. 2025/26 ends 2026).
  // A 1-year renewal expires the season after that, so + lengthYears.
  return `${startYear + 1 + lengthYears - 1}-06-30`;
}

function makeOfferId(seasonsCompleted: number, clubId: string, rid: number): string {
  return `r${seasonsCompleted}_${clubId}_${rid}`;
}

function yearsBetween(currentExpiry: string, newExpiry: string): number {
  const a = parseInt(currentExpiry.slice(0, 4), 10);
  const b = parseInt(newExpiry.slice(0, 4), 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.min(3, b - a));
}
