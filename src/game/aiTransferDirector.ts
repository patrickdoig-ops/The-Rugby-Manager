// AI-side renewal logic for the end-of-season market window. Pure +
// deterministic — no RNG in the decision path (renewal wages are
// generated via contractSeeder, which uses rngTransfer; the
// accept-or-reject choice is purely a sort-by-rating greedy against
// the cap target).
//
// Phase 4 surface: only own-club renewals. Phase 5+ adds free-agent
// signings + cross-club poaching using the same TransferOffer shape.

import type { GameState, TransferOffer } from '../types/gameState';
import type { Player } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import {
  SENIOR_CAP, EFFECTIVE_CAP_CREDITS, RENEWAL,
  WAGE_FLOOR, WAGE_ROUNDING_UNIT, AI_SIGNING_POLICY,
} from '../engine/balance/transfers';
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
      WAGE_FLOOR,
      Math.round(fresh.contract.annualWage * (1 - RENEWAL.loyaltyDiscount) / WAGE_ROUNDING_UNIT) * WAGE_ROUNDING_UNIT,
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
  // Effective cap = SENIOR_CAP + EFFECTIVE_CAP_CREDITS — the headline
  // £6.4M plus the HG/EPS/injury dispensation pools every Premiership
  // club enjoys (modelled flat in v1). Then target =
  // max(effectiveCap × aiTargetCapUtilisation, preWindowCap):
  // the lower bound keeps under-cap clubs disciplined; the upper bound
  // stops over-cap clubs from shedding their entire expiring cohort
  // the first time a window opens. Renewals' loyalty discount means
  // most renewals reduce wage anyway, so over-cap clubs gradually
  // converge.
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
  const effectiveCap = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;
  const targetCap = Math.max(effectiveCap * RENEWAL.aiTargetCapUtilisation, preWindowCap);
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

// --- Free-agent signings (Phase 5) ---

// Per-signing decision the director produces for one AI club. Caller
// fires CONTRACT_SIGNED with these fields.
export interface AISigning {
  rosterId: number;
  clubId: string;
  annualWage: number;
  expiresOn: string;
}

// One pass per AI club, in stable club-id-ascending order. For each:
// score the remaining free agents (rating + position-need bonus),
// greedy-sign the top scorers until the club's cap target or the
// per-club signing limit is hit. Players signed by an earlier club
// are not re-considered by later clubs (deterministic resolution of
// what would otherwise be multi-club bidding).
//
// rngTransfer is advanced once per candidate per club (via
// contractSeeder seeding their fresh-market wage). Stable rosterId
// iteration order keeps the sequence deterministic across runs.
//
// `humanClubId` (if provided) is skipped — the human signs themselves
// via signFreeAgent. Pass undefined in headless contexts so the
// director fills every club.
export function decideAISignings(state: GameState, humanClubId?: string): AISigning[] {
  const signings: AISigning[] = [];
  const taken = new Set<number>();
  const seasonStartYear = parseSeasonStartYear(state.calendar.seasonLabel);
  const effectiveCap = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;

  const clubs = [...state.career.clubs].sort((a, b) => a.id.localeCompare(b.id));
  for (const club of clubs) {
    if (club.id === humanClubId) continue;

    let currentCap = 0;
    const positionCounts = new Map<string, number>();
    for (const rid of club.squad) {
      const p = state.career.roster[rid];
      if (!p) continue;
      if (!p.contract.isMarquee) currentCap += p.contract.annualWage;
      positionCounts.set(p.position, (positionCounts.get(p.position) ?? 0) + 1);
    }
    let headroom = effectiveCap * AI_SIGNING_POLICY.capTarget - currentCap;
    if (headroom <= 0) continue;

    // Score every remaining free agent for this club. Each candidate
    // gets a fresh wage seed (advances rngTransfer twice) so the
    // sequence is deterministic.
    const candidates = state.career.freeAgents
      .filter(rid => !taken.has(rid))
      .map(rid => {
        const p = state.career.roster[rid];
        if (!p) return null;
        const overall = playerOverall(p.baseStats, p.position);
        const fresh = seedContractFields(p, club.id, seasonStartYear);
        const need = Math.max(0, AI_SIGNING_POLICY.targetPerPosition - (positionCounts.get(p.position) ?? 0));
        const score = overall + need * AI_SIGNING_POLICY.positionNeedWeight;
        return { rid, p, overall, fresh, score };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      // No OVR floor here — the pool is largely sub-70 (renewals
      // released them precisely because of the renewal floor) but
      // clubs still need to fill thin positions. Score keeps quality
      // signings ahead of squad-filler ones.
      .sort((a, b) => b.score - a.score || a.rid - b.rid);

    let signedThisClub = 0;
    for (const { rid, p, fresh } of candidates) {
      if (signedThisClub >= AI_SIGNING_POLICY.perClubLimit) break;
      const wage = fresh.contract.annualWage;
      if (wage > headroom) continue;
      const lengthYears = yearsBetween(p.contract.expiresOn || `${seasonStartYear + 1}-06-30`, fresh.contract.expiresOn) || 2;
      signings.push({
        rosterId: rid,
        clubId: club.id,
        annualWage: wage,
        expiresOn: expiryAfterYears(state, lengthYears),
      });
      taken.add(rid);
      headroom -= wage;
      positionCounts.set(p.position, (positionCounts.get(p.position) ?? 0) + 1);
      signedThisClub += 1;
    }
  }

  return signings;
}

// Pure helper for the user-side signing path. Returns the wage +
// length the user's club would offer a given free agent (matches what
// the AI director would compute for the same player at the same
// moment in the rngTransfer stream).
export function signingTermsFor(
  state: GameState,
  rosterId: number,
  clubId: string,
): { annualWage: number; lengthYears: number; expiresOn: string } | null {
  const p = state.career.roster[rosterId];
  if (!p) return null;
  const seasonStartYear = parseSeasonStartYear(state.calendar.seasonLabel);
  const fresh = seedContractFields(p, clubId, seasonStartYear);
  const lengthYears = yearsBetween(p.contract.expiresOn || `${seasonStartYear + 1}-06-30`, fresh.contract.expiresOn) || 2;
  return {
    annualWage: fresh.contract.annualWage,
    lengthYears,
    expiresOn: expiryAfterYears(state, lengthYears),
  };
}

// --- Cross-club poaching (Phase 6 — Reg 7) ---

// A contracted player is eligible for cross-club approach in the final
// 12 months of their deal. Bath player whose contract expires
// 2027-06-30 becomes approachable on 2026-07-01, and the move (if
// agreed) activates at the 2027 rollover.
export function isPoachEligible(player: { contract: { expiresOn: string; clubId: string } }, currentDate: string): boolean {
  if (!player.contract.expiresOn) return false;
  if (!player.contract.clubId) return false; // free agents go via signFreeAgent
  const exp = new Date(player.contract.expiresOn);
  const now = new Date(currentDate);
  const monthsAhead = (exp.getUTCFullYear() - now.getUTCFullYear()) * 12
                    + (exp.getUTCMonth() - now.getUTCMonth());
  return monthsAhead >= 0 && monthsAhead <= 12;
}

// rosterIds of every player league-wide who could be approached now.
// Stable rosterId-ascending order.
export function poachCandidates(state: GameState): number[] {
  const ids: number[] = [];
  for (const club of state.career.clubs) {
    for (const rid of club.squad) {
      const p = state.career.roster[rid];
      if (!p) continue;
      if (p.contract.isMarquee) continue; // marquees rarely move mid-deal; simplification for v1
      if (isPoachEligible(p, state.calendar.date)) ids.push(rid);
    }
  }
  return ids.sort((a, b) => a - b);
}

// AI poaching pass: per club, score available poach candidates and
// pre-agree the top scorer if cap fits AND the player's OVR is above
// the floor + the candidate isn't already pre-agreed by an earlier
// club. Pure / RNG-free decision logic (wage seeds via contractSeeder
// inside seedContractFields → rngTransfer, deterministic over stable
// iteration).
//
// One poaching per non-human AI club per window in v1 — keeps the AI
// from gutting a rival's entire squad in one off-season.
export function decideAIPoaches(state: GameState, humanClubId?: string): Array<{
  rosterId: number; toClubId: string; annualWage: number; lengthYears: number;
}> {
  const decisions: Array<{ rosterId: number; toClubId: string; annualWage: number; lengthYears: number }> = [];
  const claimed = new Set<number>();
  const seasonStartYear = parseSeasonStartYear(state.calendar.seasonLabel);
  const effectiveCap = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;
  const candidates = poachCandidates(state);
  if (candidates.length === 0) return decisions;

  const clubs = [...state.career.clubs].sort((a, b) => a.id.localeCompare(b.id));
  for (const club of clubs) {
    if (club.id === humanClubId) continue;

    let currentCap = 0;
    for (const rid of club.squad) {
      const p = state.career.roster[rid];
      if (!p || p.contract.isMarquee) continue;
      currentCap += p.contract.annualWage;
    }
    const headroom = effectiveCap * AI_SIGNING_POLICY.capTarget - currentCap;
    if (headroom <= 0) continue;

    // Score: overall + position-need bonus, restricted to OVR >= floor.
    const positionCounts = new Map<string, number>();
    for (const rid of club.squad) {
      const p = state.career.roster[rid];
      if (!p) continue;
      positionCounts.set(p.position, (positionCounts.get(p.position) ?? 0) + 1);
    }

    const ranked = candidates
      .filter(rid => !claimed.has(rid))
      .map(rid => state.career.roster[rid])
      .filter((p): p is Player => !!p)
      .filter(p => p.contract.clubId !== club.id) // don't poach your own
      .map(p => {
        const overall = playerOverall(p.baseStats, p.position);
        const fresh = seedContractFields(p, club.id, seasonStartYear);
        const need = Math.max(0, AI_SIGNING_POLICY.targetPerPosition - (positionCounts.get(p.position) ?? 0));
        return { p, overall, fresh, score: overall + need * AI_SIGNING_POLICY.positionNeedWeight };
      })
      .filter(x => x.overall >= RENEWAL.aiReleaseRatingFloor)
      .filter(x => x.fresh.contract.annualWage <= headroom)
      .sort((a, b) => b.score - a.score || a.p.rosterId - b.p.rosterId);

    const top = ranked[0];
    if (!top) continue;
    const lengthYears = Math.max(1, Math.min(3,
      parseInt(top.fresh.contract.expiresOn.slice(0, 4), 10) - parseInt(top.p.contract.expiresOn.slice(0, 4), 10)
    )) || 2;
    decisions.push({
      rosterId: top.p.rosterId,
      toClubId: club.id,
      annualWage: top.fresh.contract.annualWage,
      lengthYears,
    });
    claimed.add(top.p.rosterId);
  }

  return decisions;
}
