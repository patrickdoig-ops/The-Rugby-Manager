// Off-season market orchestrator. Owns the market-window lifecycle —
// renewals, free-agent signings, and Reg 7 pre-agreement poaches — plus
// the per-club marquee toggle. Splits cleanly out of `GameCoordinator`
// because the market surface shares only `GameState` with the lifecycle /
// match-intake path; no other coupling.
//
// All writes flow through `applySeasonEvent(state, ...)` — same mutation
// boundary as the rest of the game engine. The class holds a single
// `GameState` reference (shared with `GameCoordinator`) so mutations are
// visible across both.
//
// Public surface mirrors what was previously on `GameCoordinator`; the
// coordinator now delegates each call here. Screens continue to talk to
// `GameCoordinator` so the `getGameEngine: () => GameCoordinator` getter
// contract (see CLAUDE.md § 4) is preserved.

import type { GameState, SeasonEvent, TransferBid, TransferOffer } from '../types/gameState';
import type { Player } from '../types/player';
import { applySeasonEvent } from './applySeasonEvent';
import {
  expiringRosterIds, generateRenewalOffers, decideAIOffers, expiryAfterYears,
  signingTermsFor, isPoachEligible, poachCandidates,
  decideAIBids, decideAIRetentions, decideAIFinalSignings, retentionTermsFor,
  assessAIPoachThreats,
} from './aiTransferDirector';
import { resolveSigningRound, type SigningOutcome } from './signingResolver';
import { resolveSquadStatus } from './squadStatus';
import { estimateMarketWage } from './contractSeeder';
import { playerOverall } from '../engine/RatingEngine';
import {
  resolveMidseasonSigning, midseasonAcceptanceProbability, renewalAcceptProbability,
} from './midseasonSigningResolver';
import { clubBudgetUsage } from './teamStats';
import { isContractExpiringSoon } from './age';
import { RENEWAL, WAGE_FLOOR, WAGE_ROUNDING_UNIT, MIDSEASON_POACH, MAX_LOANS_OUT, PLAYING_TIME_PROMISE } from '../engine/balance/transfers';
import { MORALE, SQUAD_STATUS_THRESHOLDS } from '../engine/balance';
import { rngTransfer } from '../utils/rng';
import type { PreSeasonTransfer } from '../data/transfers-2025-26';
import { PARTNERSHIP_CLUB } from '../data/partnershipClubs';

// Outcome of a one-shot mid-season early renewal (Hub → Contracts).
// `accepted` carries the agreed terms for the toast; `declined` carries
// the cooldown week; `ineligible` explains why nothing happened.
export type EarlyRenewalResult =
  | { status: 'accepted'; wage: number; lengthYears: number }
  | { status: 'declined'; cooldownUntilWeek: number }
  | { status: 'ineligible'; reason: 'not_expiring' | 'on_cooldown' | 'over_budget' | 'not_on_squad' | 'market_open' };

// Clamp a user-chosen wage to a legal value: finite, ≥ WAGE_FLOOR,
// rounded to WAGE_ROUNDING_UNIT. Falls back to the supplied default
// (the asking wage) when nothing valid was passed.
function normalizeOfferedWage(wage: number | undefined, fallback: number): number {
  if (wage === undefined || !Number.isFinite(wage)) return fallback;
  const rounded = Math.round(wage / WAGE_ROUNDING_UNIT) * WAGE_ROUNDING_UNIT;
  return Math.max(WAGE_FLOOR, rounded);
}

export class TransferCoordinator {
  constructor(private state: GameState) {}

  // Re-designate the marquee slot for a club. Clears the previous
  // marquee on that squad and sets the new one. Pass `rosterId: null`
  // to clear without re-designating.
  designateMarquee(clubId: string, rosterId: number | null): void {
    applySeasonEvent(this.state, { type: 'MARQUEE_DESIGNATED', clubId, rosterId });
  }

  // Open the end-of-season renewal window. Seeds state.career.market
  // with one TransferOffer per expiring player league-wide, status
  // 'pending'. Idempotent — re-opening with the window already open
  // returns without changes. If there are no expiring players, the
  // window doesn't open at all (caller can skip the screen).
  openRenewalWindow(): void {
    if (this.state.career.market) return;
    const expiring = expiringRosterIds(this.state);
    if (expiring.length === 0) return;
    const offers = generateRenewalOffers(this.state);
    applySeasonEvent(this.state, {
      type: 'MARKET_OPENED',
      phase: 'renewals',
      expiringRosterIds: expiring,
      offers,
    });
  }

  // Close the renewal window: gather decisions, apply CONTRACT_EXTENDED
  // for accepts and CONTRACT_TERMINATED ('expired') for rejects, then
  // fire MARKET_CLOSED.
  //
  // `userDecisions` keys are offer IDs (only those belonging to the
  // player's club take effect); values are 'renew' or 'release'. Any
  // unsupplied offer falls back to the AI default for its club.
  //
  // `userWages` (optional) is a per-offer-ID chosen renewal wage. A user
  // 'renew' at or above the offer's asking wage is a certain accept
  // (preserving the prior behaviour); a lowball below asking is rolled
  // (the player may walk into free agency). The harness calls this with
  // both args defaulted to {}, so it takes zero rolls — byte-identical
  // to before. AI clubs always renew at the asking wage (no roll).
  closeRenewalWindow(
    userDecisions: Record<string, 'renew' | 'release'> = {},
    userWages: Record<string, number> = {},
  ): void {
    const market = this.state.career.market;
    if (!market) return;
    const playerClubId = this.state.player.teamId;

    // Gather decisions per offer ID. AI decides everywhere first,
    // then the user can override only their own club's offers.
    const decisions = new Map<string, boolean>();
    for (const club of this.state.career.clubs) {
      const { acceptIds, rejectIds } = decideAIOffers(this.state, club.id);
      for (const id of acceptIds) decisions.set(id, true);
      for (const id of rejectIds) decisions.set(id, false);
    }
    // Per-offer chosen wage for the user's negotiated renewals.
    const userWageById = new Map<string, number>();
    for (const [id, choice] of Object.entries(userDecisions)) {
      const offer = market.offers.find(o => o.id === id);
      if (offer && offer.fromClubId === playerClubId) {
        decisions.set(id, choice === 'renew');
        if (choice === 'renew' && userWages[id] !== undefined) {
          userWageById.set(id, normalizeOfferedWage(userWages[id], offer.annualWage));
        }
      }
    }

    // Apply in the offer-list order so the event log is stable.
    for (const offer of market.offers) {
      if (offer.status !== 'pending') continue;
      let accept = decisions.get(offer.id) ?? false;
      // Wage applied on accept — the user's negotiated figure when set,
      // otherwise the offer's asking wage.
      const renewWage = userWageById.get(offer.id) ?? offer.annualWage;

      // User lowball: a renewal below asking isn't guaranteed. Roll once
      // (user-only — the harness supplies no wages so this never fires
      // headless). At/above asking stays a certain accept.
      let lowballRejected = false;
      if (accept && offer.fromClubId === playerClubId && renewWage < offer.annualWage) {
        const p = this.state.career.roster[offer.rosterId];
        if (p) {
          const bid: TransferBid = {
            id: `r${this.state.career.seasonsCompleted}_${playerClubId}_${offer.rosterId}`,
            rosterId: offer.rosterId,
            clubId: playerClubId,
            annualWage: renewWage,
            lengthYears: offer.lengthYears,
            kind: 'retention',
            status: 'pending',
          };
          const club = this.state.career.clubs.find(c => c.id === playerClubId);
          const probability = renewalAcceptProbability(
            this.state, bid, p, offer.annualWage, renewWage,
            offer.squadStatus, club?.squad,
          );
          const roll = rngTransfer(1, 1000) / 1000;
          accept = roll <= probability;
          lowballRejected = !accept;
        }
      }

      const rejectReason: 'wage' | 'cap_overcommit' = lowballRejected ? 'wage' : 'cap_overcommit';
      applySeasonEvent(this.state, {
        type: 'OFFER_RESPONDED',
        offerId: offer.id,
        accept,
        ...(accept ? {} : { reason: rejectReason }),
      });
      if (accept) {
        applySeasonEvent(this.state, {
          type: 'CONTRACT_EXTENDED',
          rosterId: offer.rosterId,
          newExpiresOn: expiryAfterYears(this.state, offer.lengthYears),
          newAnnualWage: renewWage,
        });
      } else {
        applySeasonEvent(this.state, {
          type: 'CONTRACT_TERMINATED',
          rosterId: offer.rosterId,
          reason: 'expired',
        });
      }
    }

    applySeasonEvent(this.state, { type: 'MARKET_CLOSED' });
  }

  // ===== Free-agent signings (Phase 5) =====

  // Opens the signing window. Pre-computes one TransferOffer per
  // free agent AND per Reg 7 poach candidate (final-12-month
  // contracted players at other clubs) in stable rosterId order so
  // rngTransfer advance is deterministic.
  //
  // Stores all offers on state.career.market so subsequent renders +
  // signFreeAgent / preAgreePoach reads + the AI close pass all see
  // identical terms. The UI splits free-agent rows from poach rows by
  // looking up which rosterIds are in state.career.freeAgents.
  //
  // Idempotent — no-op if window is already open or there's nothing
  // to offer (no free agents AND no poach candidates).
  // Squad Builder entry point. Walks the curated 2025-26 inbound
  // transfer list, name-matches against the live roster, and emits a
  // CONTRACT_TERMINATED('pre_season_unwind') per hit. Each match
  // releases the player into state.career.freeAgents — feeding the
  // pre-season signing window that opens immediately after. RNG-free
  // (the match is name-driven); the unwind order is fixed by the
  // input list order, so determinism is preserved.
  //
  // Returns { matched, skipped } purely for telemetry / logging. The
  // caller doesn't act on skipped names — Phase B's audit already
  // documented why those Wikipedia entries are absent from the seed
  // roster (foreign / loan / lower-league arrivals).
  unwindPreSeasonTransfers(transfers: PreSeasonTransfer[]): { matched: number; skipped: number } {
    const nameIndex = new Map<string, number>();
    for (const ridStr of Object.keys(this.state.career.roster)) {
      const rid = Number(ridStr);
      const p = this.state.career.roster[rid];
      if (!p) continue;
      nameIndex.set(`${p.firstName} ${p.lastName}`, rid);
    }
    let matched = 0;
    let skipped = 0;
    for (const t of transfers) {
      const rid = nameIndex.get(t.name);
      if (rid === undefined) { skipped++; continue; }
      applySeasonEvent(this.state, {
        type: 'CONTRACT_TERMINATED',
        rosterId: rid,
        reason: 'pre_season_unwind',
      });
      matched++;
    }
    return { matched, skipped };
  }

  openSigningWindow(opts: { skipPoaches?: boolean } = {}): void {
    if (this.state.career.market) return;
    const sortedFAs = [...this.state.career.freeAgents].sort((a, b) => a - b);
    // Every poach-eligible player league-wide gets an offer — INCLUDING
    // the user's own final-year players, so rival AI clubs can approach
    // them (the user defends via the RetentionDecisionScreen). The user
    // can't poach their own (submitBid rejects own-squad rosterIds, and
    // TransferMarketScreen hides them from the Reg 7 tab).
    const poaches = opts.skipPoaches ? [] : poachCandidates(this.state);
    if (sortedFAs.length === 0 && poaches.length === 0) return;

    const offers: TransferOffer[] = [];
    const seasonsCompleted = this.state.career.seasonsCompleted;
    // Combined stable order: FAs first, then poach candidates.
    // Both sub-lists are rosterId-ascending so rngTransfer consumption
    // is fully deterministic.
    for (const rid of sortedFAs) {
      const terms = signingTermsFor(this.state, rid, this.state.player.teamId);
      if (!terms) continue;
      offers.push({
        id: `s${seasonsCompleted}_fa_${rid}`,
        fromClubId: '',
        rosterId: rid,
        annualWage: terms.annualWage,
        lengthYears: terms.lengthYears,
        isMarquee: false,
        status: 'pending',
      });
    }
    for (const rid of poaches) {
      const terms = signingTermsFor(this.state, rid, this.state.player.teamId);
      if (!terms) continue;
      offers.push({
        id: `s${seasonsCompleted}_pc_${rid}`,
        fromClubId: this.state.career.roster[rid]?.contract.clubId ?? '',
        rosterId: rid,
        annualWage: terms.annualWage,
        lengthYears: terms.lengthYears,
        isMarquee: false,
        status: 'pending',
      });
    }
    applySeasonEvent(this.state, {
      type: 'MARKET_OPENED',
      phase: 'signings',
      expiringRosterIds: [],
      offers,
    });
  }

  // User-side bid submission. Adds a TransferBid for the user's club
  // on the named player. The wage is taken from the cached offer
  // (same for every bidder — appeal score is what decides, not wage
  // size). Bid sits pending until resolveSigningRound() picks the
  // winner among all bidders for that player.
  //
  // Hard budget gate: the projected wage usage (existing commitments +
  // pending bids + this bid) must fit under the user's salaryBudget.
  // The budget is reserved on submission; if the bid loses at
  // resolution, the reservation lifts automatically via BID_RESOLVED.
  //
  // Returns false if no window is open, no cached offer exists, the
  // player is no longer in the pool (FA / poach-eligible as
  // appropriate), the user already has a pending bid for this player,
  // or the budget would breach.
  signFreeAgent(rosterId: number, offeredWage?: number): boolean {
    return this.submitBid(rosterId, offeredWage);
  }

  // Reverses an in-window bid by withdrawing it. Returns false when no
  // pending bid by the user exists for this player. Refunds the wage
  // reservation immediately (clubBudgetUsage now sees one less pending
  // bid).
  unsignFreeAgent(rosterId: number): boolean {
    return this.withdrawBid(rosterId);
  }

  // User-side Reg 7 poach — same model as signFreeAgent; the kind is
  // inferred inside submitBid from whether the player is a FA or a
  // poach candidate.
  preAgreePoach(rosterId: number, offeredWage?: number): boolean {
    return this.submitBid(rosterId, offeredWage);
  }

  cancelPreAgreement(rosterId: number): boolean {
    return this.withdrawBid(rosterId);
  }

  // Unified bid submission. FAs and poach candidates funnel through
  // here — the kind is inferred from market state. Budget-gated.
  // Accepts both off-season 'signings' and Hub-entered
  // 'signings-midseason' phases. Mid-season additionally enforces the
  // per-player rejection cooldown (career.midseasonRejections).
  submitBid(rosterId: number, offeredWage?: number): boolean {
    const market = this.state.career.market;
    if (!market) return false;
    if (market.phase !== 'signings' && market.phase !== 'signings-midseason') return false;
    const offer = market.offers.find(o => o.rosterId === rosterId && o.status === 'pending');
    if (!offer) return false;
    // The offer's annualWage is the player's asking wage; the user may
    // bid a different figure. Overpaying lifts the bid's appeal (it can
    // beat a stronger rival); a deep lowball risks the reservation gate.
    const bidWage = normalizeOfferedWage(offeredWage, offer.annualWage);
    const userClubId = this.state.player.teamId;
    const club = this.state.career.clubs.find(c => c.id === userClubId);
    if (!club) return false;
    const p = this.state.career.roster[rosterId];
    if (!p) return false;

    // Can't bid on a player already on your own squad (defensive — the
    // UI shouldn't render the button, but cover the path).
    if (club.squad.includes(rosterId)) return false;

    // Already has a pending bid from this club? No-op (treat as
    // idempotent).
    if (market.bids.some(b =>
      b.rosterId === rosterId && b.clubId === userClubId && b.status === 'pending'
    )) return false;

    // Mid-season cooldown gate: a player who just declined an offer
    // sits behind a "Not interested this week" lock until WEEK_ADVANCED
    // prunes the entry. Off-season ignores this — that cooldown is a
    // mid-season-only concept.
    if (market.phase === 'signings-midseason') {
      const lock = this.state.career.midseasonRejections[rosterId];
      if (lock !== undefined && lock > this.state.calendar.week) return false;
    }

    // Determine kind. FA → kind: 'free_agent'. Anything else (and
    // player is poach-eligible at another club) → 'poach'. Mid-season
    // Reg 7 poach bids bypass this path (submitMidseasonPoach handles
    // them directly with immediate resolution).
    let kind: TransferBid['kind'];
    if (this.state.career.freeAgents.includes(rosterId)) {
      kind = 'free_agent';
    } else if (isPoachEligible(p, this.state.calendar.date) && p.contract.clubId && p.contract.clubId !== userClubId) {
      kind = 'poach';
    } else {
      return false;
    }

    // Hard budget gate — against the wage the user actually offered.
    if (!offer.isMarquee) {
      const projected = clubBudgetUsage(this.state, userClubId) + bidWage;
      if (projected > club.salaryBudget) return false;
    }

    const bid: TransferBid = {
      id: `b${this.state.career.seasonsCompleted}_${userClubId}_${rosterId}`,
      rosterId,
      clubId: userClubId,
      annualWage: bidWage,
      lengthYears: offer.lengthYears,
      kind,
      status: 'pending',
    };
    applySeasonEvent(this.state, { type: 'BID_SUBMITTED', bid });
    return true;
  }

  // Withdraw the user's pending bid (any kind) for the named player.
  // No-op if none exists.
  withdrawBid(rosterId: number): boolean {
    const market = this.state.career.market;
    if (!market) return false;
    if (market.phase !== 'signings' && market.phase !== 'signings-midseason') return false;
    const userClubId = this.state.player.teamId;
    const bid = market.bids.find(b =>
      b.rosterId === rosterId && b.clubId === userClubId && b.status === 'pending'
    );
    if (!bid) return false;
    applySeasonEvent(this.state, { type: 'BID_WITHDRAWN', bidId: bid.id });
    return true;
  }

  // User-side retention bid. Submitted only via the RetentionDecision
  // screen, after an external poach bid has landed on the named
  // player. Wage = renewal-rate (loyalty-discounted); the budget
  // accounting treats it as an in-place replacement of the player's
  // existing wage (retention bids are excluded from clubBudgetUsage's
  // pending-bid sum — see teamStats).
  submitRetentionBid(rosterId: number, offeredWage?: number): boolean {
    const market = this.state.career.market;
    if (!market || (market.phase !== 'signings' && market.phase !== 'poach-midseason')) return false;
    const p = this.state.career.roster[rosterId];
    if (!p) return false;
    const userClubId = this.state.player.teamId;
    if (p.contract.clubId !== userClubId) return false;

    // Player must be under poach attack (≥1 pending poach bid against them).
    const underAttack = market.bids.some(b =>
      b.rosterId === rosterId && b.kind === 'poach' && b.status === 'pending'
    );
    if (!underAttack) return false;

    // No-op if already a pending retention bid by this club.
    if (market.bids.some(b =>
      b.rosterId === rosterId && b.kind === 'retention' && b.status === 'pending'
    )) return false;

    // Asking baseline = the player's poach offer × loyalty-discount, the
    // SAME figure the resolver scores retention bids against (so a
    // default retention is wage-neutral) and RNG-free. Length from the
    // offer too. Falls back to retentionTermsFor only if the offer is
    // somehow missing.
    const offer = market.offers.find(o => o.rosterId === rosterId);
    let askingWage: number;
    let lengthYears: number;
    if (offer) {
      askingWage = Math.max(WAGE_FLOOR, Math.round(
        offer.annualWage * (1 - RENEWAL.loyaltyDiscount) / WAGE_ROUNDING_UNIT) * WAGE_ROUNDING_UNIT);
      lengthYears = offer.lengthYears;
    } else {
      const terms = retentionTermsFor(this.state, rosterId);
      if (!terms) return false;
      askingWage = terms.annualWage;
      lengthYears = terms.lengthYears;
    }
    // Default to the asking rate; the user can pay over it to out-appeal
    // the poacher in the resolver.
    const retentionWage = normalizeOfferedWage(offeredWage, askingWage);

    // Hard budget gate. Retention costs are net deltas
    // (newWage - oldWage); use the same projection as the AI's
    // auto-retention pass.
    const club = this.state.career.clubs.find(c => c.id === userClubId);
    if (!club) return false;
    const wageDelta = retentionWage - p.contract.annualWage;
    const projected = clubBudgetUsage(this.state, userClubId) + Math.max(0, wageDelta);
    if (projected > club.salaryBudget) return false;

    const bid: TransferBid = {
      id: `r${this.state.career.seasonsCompleted}_${userClubId}_${rosterId}`,
      rosterId,
      clubId: userClubId,
      annualWage: retentionWage,
      lengthYears,
      kind: 'retention',
      status: 'pending',
    };
    applySeasonEvent(this.state, { type: 'BID_SUBMITTED', bid });
    return true;
  }

  withdrawRetentionBid(rosterId: number): boolean {
    const market = this.state.career.market;
    if (!market || (market.phase !== 'signings' && market.phase !== 'poach-midseason')) return false;
    const userClubId = this.state.player.teamId;
    const bid = market.bids.find(b =>
      b.rosterId === rosterId && b.clubId === userClubId && b.kind === 'retention' && b.status === 'pending'
    );
    if (!bid) return false;
    applySeasonEvent(this.state, { type: 'BID_WITHDRAWN', bidId: bid.id });
    return true;
  }

  // Rosters of the user's final-year players currently under poach
  // attack — surfaces the list the RetentionDecisionScreen needs to
  // render. Walks pending poach bids; one rosterId per player even if
  // multiple clubs are bidding.
  getUserRetentionPrompts(): number[] {
    const market = this.state.career.market;
    if (!market || (market.phase !== 'signings' && market.phase !== 'poach-midseason')) return [];
    const userClubId = this.state.player.teamId;
    const seen = new Set<number>();
    for (const bid of market.bids) {
      if (bid.status !== 'pending') continue;
      if (bid.kind !== 'poach') continue;
      const p = this.state.career.roster[bid.rosterId];
      if (!p) continue;
      if (p.contract.clubId !== userClubId) continue;
      seen.add(bid.rosterId);
    }
    return [...seen].sort((a, b) => a - b);
  }

  // One round of competitive resolution: AI clubs bid → AI auto-retains
  // its own at-risk players → resolver picks winners by appeal → events
  // fire in order. The user submits any retention bids of their own
  // BEFORE calling this method (typically via the RetentionDecision
  // screen between submitBidPass and resolve). Returns the per-player
  // outcomes for SigningResultsScreen.
  runAIBidPass(): void {
    const bids = decideAIBids(this.state, this.state.player.teamId);
    for (const bid of bids) {
      applySeasonEvent(this.state, { type: 'BID_SUBMITTED', bid });
    }
  }

  runAIRetentionPass(): void {
    const bids = decideAIRetentions(this.state, this.state.player.teamId);
    for (const bid of bids) {
      applySeasonEvent(this.state, { type: 'BID_SUBMITTED', bid });
    }
  }

  // AI mid-season early renewal cadence (called every 4 rounds). Each AI
  // club attempts to lock in its highest-OVR expiring player before the
  // off-season window. Mirrors offerEarlyRenewal but for all AI clubs.
  runAIEarlyRenewals(): void {
    if (this.state.career.market) return;
    const userClubId = this.state.player.teamId;
    const clubs = [...this.state.career.clubs].sort((a, b) => a.id.localeCompare(b.id));
    for (const club of clubs) {
      if (club.id === userClubId) continue;
      const candidate = club.squad
        .map(rid => this.state.career.roster[rid])
        .filter((p): p is Player => {
          if (!p) return false;
          if (!isContractExpiringSoon(p.contract.expiresOn, this.state.calendar.date)) return false;
          const lock = this.state.career.midseasonRejections[p.rosterId];
          if (lock !== undefined && lock > this.state.calendar.week) return false;
          return playerOverall(p.baseStats, p.position) >= RENEWAL.aiReleaseRatingFloor;
        })
        .sort((a, b) => playerOverall(b.baseStats, b.position) - playerOverall(a.baseStats, a.position))[0];
      if (!candidate) continue;
      const terms = retentionTermsFor(this.state, candidate.rosterId);
      if (!terms) continue;
      if (!candidate.contract.isMarquee) {
        const projected = clubBudgetUsage(this.state, club.id) - candidate.contract.annualWage + terms.annualWage;
        if (projected > club.salaryBudget) continue;
      }
      const bid: TransferBid = {
        id: `ar${this.state.career.seasonsCompleted}_${club.id}_${candidate.rosterId}`,
        rosterId: candidate.rosterId,
        clubId: club.id,
        annualWage: terms.annualWage,
        lengthYears: terms.lengthYears,
        kind: 'retention',
        status: 'pending',
      };
      // AI early renewals offer the plain loyalty rate (no premium), so
      // asking == offered and the wage term is neutral — behaviour
      // identical to before negotiation was added.
      const probability = midseasonAcceptanceProbability(this.state, bid, candidate, terms.annualWage);
      const roll = rngTransfer(1, 1000) / 1000;
      if (roll <= probability) {
        applySeasonEvent(this.state, {
          type: 'CONTRACT_EXTENDED',
          rosterId: candidate.rosterId,
          newExpiresOn: terms.expiresOn,
          newAnnualWage: terms.annualWage,
        });
      } else {
        applySeasonEvent(this.state, {
          type: 'MIDSEASON_OFFER_REJECTED',
          rosterId: candidate.rosterId,
          weekUntilClear: this.state.calendar.week + RENEWAL.earlyRenewalCooldownWeeks,
        });
      }
    }
  }

  // Mid-season AI poaching pass. Like runAIBidPass but restricted to
  // poach bids only — AI clubs do not sign free agents mid-season, which
  // keeps the FA pool stable for the user to plan around.
  runAIMidseasonPoachPass(): void {
    const bids = decideAIBids(this.state, this.state.player.teamId)
      .filter(b => b.kind === 'poach');
    for (const bid of bids) {
      applySeasonEvent(this.state, { type: 'BID_SUBMITTED', bid });
    }
  }

  // Background threat assessment — called at WEEK_ADVANCED. RNG-free;
  // safe to run in the deterministic path. Writes POACH_THREATS_SET so
  // the Hub Transfers badge stays current without the user opening the
  // screen.
  updatePoachThreats(): void {
    const rosterIds = assessAIPoachThreats(this.state, this.state.player.teamId);
    applySeasonEvent(this.state, { type: 'POACH_THREATS_SET', rosterIds });
  }

  resolveSigningRound(): SigningOutcome[] {
    const { events, outcomes } = resolveSigningRound(this.state);
    for (const ev of events) applySeasonEvent(this.state, ev);
    return outcomes;
  }

  // True when the user still has budget headroom AND viable candidates
  // remain. The signing-window loop calls this between rounds to
  // decide whether to auto-finish or hand control back to the user.
  hasViableSigningOptions(): boolean {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return false;
    const userClubId = this.state.player.teamId;
    const club = this.state.career.clubs.find(c => c.id === userClubId);
    if (!club) return false;
    const headroom = club.salaryBudget - clubBudgetUsage(this.state, userClubId);
    if (headroom <= 0) return false;
    // Mirrors the TransferMarketScreen row filter: a player who's been
    // signed (out of freeAgents) or pre-agreed (on pendingMoves) in a
    // prior round is no longer a viable target this round.
    const freeAgentSet = new Set(this.state.career.freeAgents);
    const pendingMovesSet = new Set(this.state.career.pendingMoves.map(m => m.rosterId));
    for (const offer of market.offers) {
      if (offer.status !== 'pending') continue;
      if (offer.annualWage > headroom) continue;
      // Already on the user's squad?
      if (club.squad.includes(offer.rosterId)) continue;
      // Already gone in a prior round (anyone's signing / pre-agreement)?
      const isPoach = offer.fromClubId !== '';
      if (isPoach) {
        if (pendingMovesSet.has(offer.rosterId)) continue;
      } else {
        if (!freeAgentSet.has(offer.rosterId)) continue;
      }
      // Already a pending bid for this player by the user?
      if (market.bids.some(b =>
        b.rosterId === offer.rosterId && b.clubId === userClubId && b.status === 'pending'
      )) continue;
      return true;
    }
    return false;
  }

  // Closes the signing window. Runs one final AI bid + auto-retention +
  // resolution pass so every AI club gets a last shot at the leftover
  // pool, then flips offer statuses to their terminal state and fires
  // MARKET_CLOSED.
  //
  // `skipPoaches` is the Squad Builder mode (pre-season FA-only): no
  // Reg 7 poaching during year-1 setup. The `decideAIFinalSignings`
  // pass naturally filters poaches when this is true via the offer
  // pool seeded by openSigningWindow.
  closeSigningWindow(opts: { skipPoaches?: boolean } = {}): void {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return;
    const humanClubId = this.state.player.teamId;

    // Final AI bid pass — even if the user clicked Finish without
    // submitting offers, every AI club gets a chance to fill any
    // remaining roster gaps. decideAIFinalSignings produces TransferBids
    // (not direct signings), so the resolver still picks winners
    // properly when AI clubs end up bidding on the same player.
    void opts;
    const finalBids = decideAIFinalSignings(this.state, humanClubId);
    for (const bid of finalBids) {
      applySeasonEvent(this.state, { type: 'BID_SUBMITTED', bid });
    }
    // AI auto-retains anyone the new bids put under attack.
    const retentions = decideAIRetentions(this.state, humanClubId);
    for (const bid of retentions) {
      applySeasonEvent(this.state, { type: 'BID_SUBMITTED', bid });
    }
    // Resolve everything that's still pending — this round + anything
    // dragged in from prior rounds the user never advanced.
    const { events } = resolveSigningRound(this.state);
    for (const ev of events) applySeasonEvent(this.state, ev);

    // Flip every cached offer to its terminal status so the seam
    // matches the renewal-window flow. Free-agent offers (fromClubId
    // === '') accept iff the rosterId is no longer in freeAgents;
    // poach offers accept iff the rosterId is on pendingMoves.
    const pendingMovesSet = new Set(this.state.career.pendingMoves.map(m => m.rosterId));
    const freeAgentSet = new Set(this.state.career.freeAgents);
    for (const offer of market.offers) {
      if (offer.status !== 'pending') continue;
      const isPoach = offer.fromClubId !== '';
      const accepted = isPoach
        ? pendingMovesSet.has(offer.rosterId)
        : !freeAgentSet.has(offer.rosterId);
      applySeasonEvent(this.state, {
        type: 'OFFER_RESPONDED',
        offerId: offer.id,
        accept: accepted,
        ...(accepted ? {} : { reason: 'cap_overcommit' as const }),
      });
    }
    applySeasonEvent(this.state, { type: 'MARKET_CLOSED' });
  }

  // ===== Mid-season free-agent signings (Hub → Transfers) =====
  //
  // Independent lifecycle from the off-season window — different phase
  // value, no Reg 7 candidates, no AI competition. The player either
  // accepts the user's offer or declines and goes on cooldown until
  // the next WEEK_ADVANCED. See src/game/midseasonSigningResolver.ts
  // for the acceptance roll and docs/transfer-system.md for the flow.

  // Opens a mid-season signing market: free agents + Reg 7 candidates.
  // Excludes cooldown-locked rosterIds from the FA pool. Reg 7 offers
  // are seeded with estimateMarketWage (RNG-free); FA offers go through
  // signingTermsFor → seedContractFields, which consumes 2 rngTransfer
  // draws per free agent — determinism survives because the window is
  // user-triggered and careerRngOffset is snapshot at save time (same
  // precedent as boostPlayerMorale). Idempotent:
  // re-opening while a market is already live is a no-op. If both pools
  // are empty the window doesn't open so the caller can route to Hub.
  openMidseasonSigningWindow(): void {
    if (this.state.career.market) return;
    const week = this.state.calendar.week;
    const rejections = this.state.career.midseasonRejections;
    const eligibleFAs = this.state.career.freeAgents
      .filter(rid => {
        const lock = rejections[rid];
        return lock === undefined || lock <= week;
      })
      .sort((a, b) => a - b);

    // Reg 7 candidates: all final-12-month contracted players league-wide
    // (including user's own — the UI hides them; rivals can approach them
    // via the poach-midseason window). Exclude already-pending pre-agreements.
    const pendingMoveSet = new Set(this.state.career.pendingMoves.map(m => m.rosterId));
    const poaches = poachCandidates(this.state).filter(rid => !pendingMoveSet.has(rid));

    if (eligibleFAs.length === 0 && poaches.length === 0) return;

    const offers: TransferOffer[] = [];
    const seasonsCompleted = this.state.career.seasonsCompleted;
    for (const rid of eligibleFAs) {
      const terms = signingTermsFor(this.state, rid, this.state.player.teamId);
      if (!terms) continue;
      offers.push({
        id: `m${seasonsCompleted}_w${week}_fa_${rid}`,
        fromClubId: '',
        rosterId: rid,
        annualWage: terms.annualWage,
        lengthYears: terms.lengthYears,
        isMarquee: false,
        status: 'pending',
      });
    }
    for (const rid of poaches) {
      const p = this.state.career.roster[rid];
      if (!p) continue;
      const ovr = playerOverall(p.baseStats, p.position);
      offers.push({
        id: `m${seasonsCompleted}_w${week}_pc_${rid}`,
        fromClubId: p.contract.clubId,
        rosterId: rid,
        annualWage: estimateMarketWage(ovr, p.position),
        lengthYears: MIDSEASON_POACH.lengthYears,
        isMarquee: false,
        status: 'pending',
      });
    }
    if (offers.length === 0) return;
    applySeasonEvent(this.state, {
      type: 'MARKET_OPENED',
      phase: 'signings-midseason',
      expiringRosterIds: [],
      offers,
    });
    // User is now handling threats via the market — clear the badge.
    applySeasonEvent(this.state, { type: 'POACH_THREATS_SET', rosterIds: [] });
  }

  // Resolves a single mid-season Reg 7 pre-agreement offer immediately
  // (no queue — the player accepts or declines on the spot). Uses the
  // same appeal-score-based probability model as mid-season FA signings.
  // Fires PRE_AGREEMENT_SIGNED on accept, MIDSEASON_OFFER_REJECTED on
  // decline (same one-round cooldown as FA declines). Returns the
  // outcome so the UI can show a toast and re-render.
  submitMidseasonPoach(rosterId: number, wage: number): 'accepted' | 'declined' {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings-midseason') return 'declined';
    const offer = market.offers.find(o => o.rosterId === rosterId && o.fromClubId !== '' && o.status === 'pending');
    if (!offer) return 'declined';
    const player = this.state.career.roster[rosterId];
    if (!player || !isPoachEligible(player, this.state.calendar.date)) return 'declined';
    // Guard: can't poach your own player.
    const userClubId = this.state.player.teamId;
    const userClub = this.state.career.clubs.find(c => c.id === userClubId);
    if (userClub?.squad.includes(rosterId)) return 'declined';
    // Guard: already pre-agreed (handles rapid double-click before render).
    if (this.state.career.pendingMoves.some(m => m.rosterId === rosterId)) return 'declined';
    // Cooldown guard: mirrors the submitBid check so declined players
    // can't be re-approached until WEEK_ADVANCED clears the entry.
    const lock = this.state.career.midseasonRejections[rosterId];
    if (lock !== undefined && lock > this.state.calendar.week) return 'declined';

    const bidWage = normalizeOfferedWage(wage, offer.annualWage);
    const bid: TransferBid = {
      id: `mp_u${this.state.career.seasonsCompleted}_w${this.state.calendar.week}_${rosterId}`,
      rosterId,
      clubId: userClubId,
      annualWage: bidWage,
      lengthYears: offer.lengthYears,
      kind: 'poach',
      status: 'pending',
    };
    const probability = midseasonAcceptanceProbability(this.state, bid, player, offer.annualWage);
    const accepted = rngTransfer(1, 1000) / 1000 <= probability;

    if (accepted) {
      applySeasonEvent(this.state, {
        type: 'PRE_AGREEMENT_SIGNED',
        agreement: {
          rosterId,
          fromClubId: player.contract.clubId,
          toClubId: userClubId,
          annualWage: bidWage,
          lengthYears: offer.lengthYears,
        },
      });
    } else {
      applySeasonEvent(this.state, {
        type: 'MIDSEASON_OFFER_REJECTED',
        rosterId,
        weekUntilClear: this.state.calendar.week + 1,
      });
    }
    return accepted ? 'accepted' : 'declined';
  }

  // Closes a mid-season FA window. No AI pass — mid-season has no
  // competing bidders, so any pending bids the user didn't submit just
  // disappear with the market. Idempotent on an already-closed market.
  closeMidseasonSigningWindow(): void {
    if (!this.state.career.market) return;
    if (this.state.career.market.phase !== 'signings-midseason') return;
    applySeasonEvent(this.state, { type: 'MARKET_CLOSED' });
  }

  // ===== Mid-season Reg 7 poaching of the user's players =====
  //
  // A rival AI club approaches one or more of the user's final-year
  // players mid-season. The user defends via RetentionDecisionScreen
  // (retain — paying up via the wage modal — or let them go); an
  // un-retained player pre-agrees to leave at the next rollover. Live
  // only — orchestrated by main.ts every round; the headless harness
  // never opens it. RNG-FREE throughout (offers use estimateMarketWage,
  // AI bids use the closed-form aiBidWage, resolution is appeal-based),
  // so it never perturbs the career rngTransfer stream.
  //
  // Opens a 'poach-midseason' market seeded with one offer per at-risk
  // user player + the AI poach bids. No-op (leaves market null) if a
  // window is already open or no AI club has the appetite/budget to
  // poach. If offers were seeded but no AI actually bid, the window is
  // closed again immediately so the caller sees no market.
  openMidseasonPoachWindow(): void {
    if (this.state.career.market) return;
    const userClubId = this.state.player.teamId;
    const atRisk = assessAIPoachThreats(this.state, userClubId);
    if (atRisk.length === 0) return;

    const offers: TransferOffer[] = [];
    const seasonsCompleted = this.state.career.seasonsCompleted;
    const week = this.state.calendar.week;
    for (const rid of atRisk) {
      const p = this.state.career.roster[rid];
      if (!p) continue;
      const ovr = playerOverall(p.baseStats, p.position);
      offers.push({
        id: `mp${seasonsCompleted}_w${week}_${rid}`,
        fromClubId: userClubId,           // poached FROM the user's club
        rosterId: rid,
        annualWage: estimateMarketWage(ovr, p.position),  // RNG-free asking
        lengthYears: MIDSEASON_POACH.lengthYears,
        isMarquee: false,
        status: 'pending',
      });
    }
    if (offers.length === 0) return;
    applySeasonEvent(this.state, {
      type: 'MARKET_OPENED',
      phase: 'poach-midseason',
      expiringRosterIds: [],
      offers,
    });

    // AI poach bids (RNG-free aiBidWage). decideAIBids skips the user's
    // own club, so only rivals bid on the seeded offers; every bid is a
    // poach (the offers are all the user's own players).
    const bids = decideAIBids(this.state, userClubId);
    for (const bid of bids) {
      applySeasonEvent(this.state, { type: 'BID_SUBMITTED', bid });
    }

    // No rival actually bid (budget / squad depth) — no real approach,
    // so close the window again and leave the caller with no market.
    if (!bids.some(b => b.kind === 'poach')) {
      applySeasonEvent(this.state, { type: 'MARKET_CLOSED' });
    }
  }

  // Resolves the mid-season poach window: the user's retention bids (if
  // any) compete with the AI poach bids by appeal score. Poach winners
  // fire PRE_AGREEMENT_SIGNED (the player leaves at the next rollover);
  // a retained player fires CONTRACT_EXTENDED. Then MARKET_CLOSED.
  // Returns the per-player outcomes for SigningResultsScreen. Idempotent
  // / safe if the window already closed.
  closeMidseasonPoachWindow(): SigningOutcome[] {
    const market = this.state.career.market;
    if (!market || market.phase !== 'poach-midseason') return [];
    const { events, outcomes } = resolveSigningRound(this.state);
    for (const ev of events) applySeasonEvent(this.state, ev);
    applySeasonEvent(this.state, { type: 'MARKET_CLOSED' });
    return outcomes;
  }

  // Resolves every pending user bid against the appeal-score-driven
  // acceptance probability. Returns SigningOutcome[] for
  // SigningResultsScreen. Caller is responsible for calling
  // closeMidseasonSigningWindow afterwards (the chain is single-shot:
  // submit → results → hub, no looping back).
  runMidseasonSigning(): SigningOutcome[] {
    const { events, outcomes } = resolveMidseasonSigning(this.state);
    for (const ev of events) applySeasonEvent(this.state, ev);
    return outcomes;
  }

  // ===== Mid-season early contract renewal (Hub → Contracts) =====
  //
  // Inline, one-shot voluntary renewal of one of the user's OWN players
  // whose contract sits inside the rolling EXPIRING_CONTRACT_WINDOW_MONTHS
  // window. Unlike the end-of-season renewal window this isn't a market
  // — no screen lifecycle, no AI competition. Terms are the same
  // loyalty-discounted offer the EOS window would generate
  // (retentionTermsFor); acceptance is the appeal-score roll the
  // mid-season FA path uses (midseasonAcceptanceProbability), so a star
  // eyeing a bigger move can still say no. A decline locks the player
  // behind a RENEWAL.earlyRenewalCooldownWeeks cooldown on
  // career.midseasonRejections (pruned by WEEK_ADVANCED) so the roll
  // can't be spammed.
  //
  // Accept → CONTRACT_EXTENDED; decline → MIDSEASON_OFFER_REJECTED. No
  // new event variant, no save-format bump. Consumes rngTransfer draws
  // (one for the wage seed, one for the acceptance roll) — user-initiated,
  // same precedent as the mid-season FA signing; the determinism harness
  // never calls this so `verify` is unaffected. An over-budget bail still
  // costs the wage-seed draw (the wage can't be known without it); that
  // divergence is harmless and user-driven.
  offerEarlyRenewal(rosterId: number, offeredWage?: number): EarlyRenewalResult {
    // Never while an off-season / mid-season market window is open.
    if (this.state.career.market) return { status: 'ineligible', reason: 'market_open' };

    const userClubId = this.state.player.teamId;
    const club = this.state.career.clubs.find(c => c.id === userClubId);
    const p = this.state.career.roster[rosterId];
    if (!club || !p) return { status: 'ineligible', reason: 'not_on_squad' };
    if (p.contract.clubId !== userClubId || !club.squad.includes(rosterId)) {
      return { status: 'ineligible', reason: 'not_on_squad' };
    }

    // Eligibility: inside the same expiring window the UI surfaces.
    if (!isContractExpiringSoon(p.contract.expiresOn, this.state.calendar.date)) {
      return { status: 'ineligible', reason: 'not_expiring' };
    }

    // Cooldown: a recent decline locks the player out for a few rounds.
    const lock = this.state.career.midseasonRejections[rosterId];
    if (lock !== undefined && lock > this.state.calendar.week) {
      return { status: 'ineligible', reason: 'on_cooldown' };
    }

    // Loyalty-discounted terms (advances rngTransfer via the seeder) —
    // used for the contract length + expiry only. The asking wage is the
    // RNG-FREE estimate (estimateMarketWage × loyalty discount), the same
    // figure ContractsScreen anchors its modal + acceptance chip on, so
    // the engine's accept threshold matches what the user was shown. (The
    // noisy terms.annualWage would diverge from the estimate by up to the
    // WAGE_NOISE spread, turning an at-asking default into a silent
    // lowball.) The user may offer over the asking to raise the odds, or
    // under it to save cap at the risk of a decline.
    const terms = retentionTermsFor(this.state, rosterId);
    if (!terms) return { status: 'ineligible', reason: 'not_on_squad' };
    const ovr = playerOverall(p.baseStats, p.position);
    const asking = Math.max(WAGE_FLOOR, Math.round(
      estimateMarketWage(ovr, p.position) * (1 - RENEWAL.loyaltyDiscount) / WAGE_ROUNDING_UNIT) * WAGE_ROUNDING_UNIT);
    const renewWage = normalizeOfferedWage(offeredWage, asking);

    // Net budget gate — the renewal replaces the player's current wage,
    // so only the delta counts. Marquee wages sit outside the budget.
    if (!p.contract.isMarquee) {
      const projected = clubBudgetUsage(this.state, userClubId) - p.contract.annualWage + renewWage;
      if (projected > club.salaryBudget) return { status: 'ineligible', reason: 'over_budget' };
    }

    // Appeal-score acceptance roll (own-club loyalty bonus applies via
    // the 'retention' kind). The wage term lifts/lowers the odds; an
    // offer at or above asking is clamped near-certain via the loyalty
    // floor, a lowball never below the underpay floor.
    const bid: TransferBid = {
      id: `r${this.state.career.seasonsCompleted}_${userClubId}_${rosterId}`,
      rosterId,
      clubId: userClubId,
      annualWage: renewWage,
      lengthYears: terms.lengthYears,
      kind: 'retention',
      status: 'pending',
    };
    const probability = renewalAcceptProbability(
      this.state, bid, p, asking, renewWage,
      resolveSquadStatus(p, club.squad, this.state.career.roster), club.squad,
    );
    const roll = rngTransfer(1, 1000) / 1000;
    if (roll <= probability) {
      applySeasonEvent(this.state, {
        type: 'CONTRACT_EXTENDED',
        rosterId,
        newExpiresOn: terms.expiresOn,
        newAnnualWage: renewWage,
      });
      return { status: 'accepted', wage: renewWage, lengthYears: terms.lengthYears };
    }

    const cooldownUntilWeek = this.state.calendar.week + RENEWAL.earlyRenewalCooldownWeeks;
    applySeasonEvent(this.state, {
      type: 'MIDSEASON_OFFER_REJECTED',
      rosterId,
      weekUntilClear: cooldownUntilWeek,
    });
    return { status: 'declined', cooldownUntilWeek };
  }

  // Squad Builder cleanup. After unwind + close, some AI clubs may
  // have lost their authored marquee (the marquee was a 2025-26
  // in-signing that got unwound). Pick the highest-wage player on
  // each marquee-less AI squad and designate them — top earner is
  // typically the star and reducing cap pressure most. Skips the
  // human's club (the user picks theirs in the marquee step).
  // Called explicitly from the Squad Builder flow; not part of the
  // end-of-season chain.
  repairAIMarquees(): void {
    const humanClubId = this.state.player.teamId;
    for (const club of this.state.career.clubs) {
      if (club.id === humanClubId) continue;
      const players = club.squad
        .map(rid => this.state.career.roster[rid])
        .filter((p): p is Player => !!p);
      if (players.some(p => p.contract.isMarquee)) continue;
      let top: Player | null = null;
      for (const p of players) {
        if (!top || p.contract.annualWage > top.contract.annualWage) top = p;
      }
      if (!top) continue;
      applySeasonEvent(this.state, {
        type: 'MARQUEE_DESIGNATED',
        clubId: club.id,
        rosterId: top.rosterId,
      });
    }
  }

  // ===== Transfer requests + loans (Features 1.4 / 2.3) =====

  // Feature 1.4 — fires after morale decay each round for the human club only.
  // Tracks very-unhappy streaks → transfer requests. Checks expired
  // playing-time promises. No RNG used; deterministic on current state.
  // Called from GameCoordinator's match-result tick.
  checkTransferRequestsAndPromises(): void {
    const teamId = this.state.player.teamId;
    const club = this.state.career.clubs.find(c => c.id === teamId);
    if (!club) return;
    const week = this.state.calendar.week;
    const gamesPlayed = this.state.league.results.filter(
      r => r.homeId === teamId || r.awayId === teamId,
    ).length;

    for (const rid of club.squad) {
      const p = this.state.career.roster[rid];
      if (!p) continue;
      const morale = p.morale ?? MORALE.baseline;

      // Transfer request streak — skip if already requested or on loan.
      if (!p.wantsTransfer && !p.loanOut) {
        if (morale <= MORALE.veryUnhappyThreshold) {
          applySeasonEvent(this.state, { type: 'PLAYER_VERY_UNHAPPY_TICK', rosterId: rid });
          // p is a live reference — consecutiveVeryUnhappyRounds is already
          // updated by the event above.
          if ((p.consecutiveVeryUnhappyRounds ?? 0) >= MORALE.transferRequestStreak) {
            applySeasonEvent(this.state, { type: 'TRANSFER_REQUEST_SUBMITTED', rosterId: rid });
          }
        }
      }

      // Playing-time promise expiry check.
      const promise = p.playingTimePromise;
      if (promise && week >= promise.toRound) {
        const startsGained = (p.seasonStats.starts ?? 0) - promise.startsAtPromise;
        if (startsGained < promise.startsRequired) {
          applySeasonEvent(this.state, { type: 'PROMISE_BROKEN', rosterId: rid });
        }
        // If the target was met the promise expires cleanly at SEASON_ROLLED_OVER.
      }

      // Status-pace mismatch check. Use actual games played (not calendar
      // week) so the gate and pro-rating stay aligned during international
      // breaks where calendar.week advances without a league fixture.
      if (gamesPlayed >= MORALE.statusMismatchWarningRounds) {
        applyStatusPacePenalty(this.state, p, teamId, gamesPlayed);
      }
    }
  }

  // Feature 1.4 — promise game time to a player (inbox CTA).
  // Promises `startsRequired` starts in the next `windowRounds` rounds.
  makePlayingTimePromise(rosterId: number): void {
    const p = this.state.career.roster[rosterId];
    if (!p) return;
    const toRound = this.state.calendar.week + PLAYING_TIME_PROMISE.windowRounds;
    const startsRequired = PLAYING_TIME_PROMISE.startsRequired;
    applySeasonEvent(this.state, {
      type: 'PLAYING_TIME_PROMISED',
      rosterId,
      toRound,
      startsRequired,
      startsAtPromise: p.seasonStats.starts ?? 0,
    });
  }

  // Feature 1.4 — grant a transfer request (inbox CTA).
  grantTransferRequest(rosterId: number): void {
    const p = this.state.career.roster[rosterId];
    if (!p || !p.wantsTransfer) return;
    applySeasonEvent(this.state, { type: 'TRANSFER_REQUEST_GRANTED', rosterId });
    applySeasonEvent(this.state, { type: 'CONTRACT_TERMINATED', rosterId, reason: 'released' });
  }

  // Feature 1.4 — reject a transfer request (inbox CTA).
  rejectTransferRequest(rosterId: number): void {
    const p = this.state.career.roster[rosterId];
    if (!p || !p.wantsTransfer) return;
    applySeasonEvent(this.state, { type: 'TRANSFER_REQUEST_REJECTED', rosterId });
  }

  // Feature 2.3 — send a player on loan to their club's partnership club.
  loanOutPlayer(rosterId: number): void {
    const p = this.state.career.roster[rosterId];
    if (!p || p.loanOut) return;
    const partnerClub = PARTNERSHIP_CLUB[this.state.player.teamId];
    if (!partnerClub) return;
    const club = this.state.career.clubs.find(c => c.id === this.state.player.teamId);
    if (!club) return;
    const currentLoans = club.squad.filter(rid2 => this.state.career.roster[rid2]?.loanOut).length;
    if (currentLoans >= MAX_LOANS_OUT) return;
    applySeasonEvent(this.state, {
      type: 'PLAYER_LOANED_OUT',
      rosterId,
      partnerClub,
      fromRound: this.state.calendar.week,
    });
  }

  // Feature 2.3 — recall a loaned-out player.
  recallLoanedPlayer(rosterId: number): void {
    const p = this.state.career.roster[rosterId];
    if (!p || !p.loanOut) return;
    applySeasonEvent(this.state, { type: 'PLAYER_RECALLED_FROM_LOAN', rosterId });
  }

  // Feature 2.3 — sign a player from the loan pool.
  signLoanPlayer(rosterId: number): void {
    if (!(this.state.career.loanPool ?? []).includes(rosterId)) return;
    applySeasonEvent(this.state, {
      type: 'LOAN_PLAYER_SIGNED',
      rosterId,
      clubId: this.state.player.teamId,
      fromRound: this.state.calendar.week,
    });
  }

  // Feature 2.3 — release a loan-in player back to the pool.
  releaseLoanPlayer(rosterId: number): void {
    const p = this.state.career.roster[rosterId];
    if (!p || !p.loanIn) return;
    applySeasonEvent(this.state, { type: 'LOAN_PLAYER_RELEASED', rosterId });
  }
}

// Status-pace mismatch morale check. Called weekly from
// checkTransferRequestsAndPromises once statusMismatchWarningRounds have
// elapsed. Pro-rates the status's minApps threshold against the season
// round and fires a morale penalty when the player is behind pace.
// Only fires for non-loaned, non-injured players.
function applyStatusPacePenalty(
  state: GameState,
  p: Player,
  teamId: string,
  gamesPlayed: number,
): void {
  if (p.injury || p.loanOut) return;
  const club = state.career.clubs.find(c => c.id === teamId);
  if (!club) return;
  const status = resolveSquadStatus(p, club.squad, state.career.roster);
  const threshold = SQUAD_STATUS_THRESHOLDS[status];
  if (threshold.minApps === 0) return; // backup — no expectation
  const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0) || 22;
  const expectedAppsAtWeek = Math.round(threshold.minApps * gamesPlayed / totalRounds);
  if (p.seasonStats.appearances < expectedAppsAtWeek) {
    applySeasonEvent(state, {
      type: 'PLAYER_MORALE_ADJUSTED',
      rosterId: p.rosterId,
      delta: MORALE.statusMismatchWeeklyPenalty,
      reason: 'status_pace',
    });
  }
}
