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
  decideAISignings, signingTermsFor, isPoachEligible, decideAIPoaches, poachCandidates,
  decideAIBids, decideAIRetentions, decideAIFinalSignings, retentionTermsFor,
} from './aiTransferDirector';
import { resolveSigningRound, type SigningOutcome } from './signingResolver';
import { clubBudgetUsage } from './teamStats';
import type { PreSeasonTransfer } from '../data/transfers-2025-26';

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
  closeRenewalWindow(userDecisions: Record<string, 'renew' | 'release'> = {}): void {
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
    for (const [id, choice] of Object.entries(userDecisions)) {
      const offer = market.offers.find(o => o.id === id);
      if (offer && offer.fromClubId === playerClubId) {
        decisions.set(id, choice === 'renew');
      }
    }

    // Apply in the offer-list order so the event log is stable.
    for (const offer of market.offers) {
      if (offer.status !== 'pending') continue;
      const accept = decisions.get(offer.id) ?? false;
      applySeasonEvent(this.state, {
        type: 'OFFER_RESPONDED',
        offerId: offer.id,
        accept,
        ...(accept ? {} : { reason: 'cap_overcommit' as const }),
      });
      if (accept) {
        applySeasonEvent(this.state, {
          type: 'CONTRACT_EXTENDED',
          rosterId: offer.rosterId,
          newExpiresOn: expiryAfterYears(this.state, offer.lengthYears),
          newAnnualWage: offer.annualWage,
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
    const poaches = opts.skipPoaches ? [] : poachCandidates(this.state).filter(rid => {
      const p = this.state.career.roster[rid];
      // Skip player's own club's players (can't poach yourself).
      return p && p.contract.clubId !== this.state.player.teamId;
    });
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
  signFreeAgent(rosterId: number): boolean {
    return this.submitBid(rosterId);
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
  preAgreePoach(rosterId: number): boolean {
    return this.submitBid(rosterId);
  }

  cancelPreAgreement(rosterId: number): boolean {
    return this.withdrawBid(rosterId);
  }

  // Unified bid submission. FAs and poach candidates funnel through
  // here — the kind is inferred from market state. Budget-gated.
  submitBid(rosterId: number): boolean {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return false;
    const offer = market.offers.find(o => o.rosterId === rosterId && o.status === 'pending');
    if (!offer) return false;
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

    // Determine kind. FA → kind: 'free_agent'. Anything else (and
    // player is poach-eligible at another club) → 'poach'.
    let kind: TransferBid['kind'];
    if (this.state.career.freeAgents.includes(rosterId)) {
      kind = 'free_agent';
    } else if (isPoachEligible(p, this.state.calendar.date) && p.contract.clubId && p.contract.clubId !== userClubId) {
      kind = 'poach';
    } else {
      return false;
    }

    // Hard budget gate.
    if (!offer.isMarquee) {
      const projected = clubBudgetUsage(this.state, userClubId) + offer.annualWage;
      if (projected > club.salaryBudget) return false;
    }

    const bid: TransferBid = {
      id: `b${this.state.career.seasonsCompleted}_${userClubId}_${rosterId}`,
      rosterId,
      clubId: userClubId,
      annualWage: offer.annualWage,
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
    if (!market || market.phase !== 'signings') return false;
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
  submitRetentionBid(rosterId: number): boolean {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return false;
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

    const terms = retentionTermsFor(this.state, rosterId);
    if (!terms) return false;

    // Hard budget gate. Retention costs are net deltas
    // (newWage - oldWage); use the same projection as the AI's
    // auto-retention pass.
    const club = this.state.career.clubs.find(c => c.id === userClubId);
    if (!club) return false;
    const wageDelta = terms.annualWage - p.contract.annualWage;
    const projected = clubBudgetUsage(this.state, userClubId) + Math.max(0, wageDelta);
    if (projected > club.salaryBudget) return false;

    const bid: TransferBid = {
      id: `r${this.state.career.seasonsCompleted}_${userClubId}_${rosterId}`,
      rosterId,
      clubId: userClubId,
      annualWage: terms.annualWage,
      lengthYears: terms.lengthYears,
      kind: 'retention',
      status: 'pending',
    };
    applySeasonEvent(this.state, { type: 'BID_SUBMITTED', bid });
    return true;
  }

  withdrawRetentionBid(rosterId: number): boolean {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return false;
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
    if (!market || market.phase !== 'signings') return [];
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
    // Any still-pending offer the user could afford?
    for (const offer of market.offers) {
      if (offer.status !== 'pending') continue;
      if (offer.annualWage > headroom) continue;
      // Already on their squad?
      if (club.squad.includes(offer.rosterId)) continue;
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
}
