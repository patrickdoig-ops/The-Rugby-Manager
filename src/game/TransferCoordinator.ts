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

import type { GameState, TransferOffer } from '../types/gameState';
import type { Player } from '../types/player';
import { applySeasonEvent } from './applySeasonEvent';
import {
  expiringRosterIds, generateRenewalOffers, decideAIOffers, expiryAfterYears,
  decideAISignings, signingTermsFor, isPoachEligible, decideAIPoaches, poachCandidates,
} from './aiTransferDirector';
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

  // User-side sign. Looks up the cached offer for `rosterId` in the
  // open signing window and fires CONTRACT_SIGNED at those terms.
  // Returns false if no window is open, no cached offer exists, the
  // player is no longer a free agent, or the signing would breach the
  // user's club salaryBudget. The budget is a hard constraint — see
  // CLAUDE.md § Budgets. OFFER_RESPONDED is deferred to
  // closeSigningWindow so the cached offer stays 'pending' through the
  // window, letting the user undo via unsignFreeAgent without
  // offer-status drift.
  signFreeAgent(rosterId: number): boolean {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return false;
    if (!this.state.career.freeAgents.includes(rosterId)) return false;
    const offer = market.offers.find(o => o.rosterId === rosterId && o.status === 'pending');
    if (!offer) return false;
    const userClubId = this.state.player.teamId;
    const club = this.state.career.clubs.find(c => c.id === userClubId);
    if (!club) return false;
    // Hard budget gate. Marquees are excluded from budget (offer.isMarquee
    // implies the player would slot into the marquee facility, outside
    // the cap-relevant pool) — but the cached signing-window offers are
    // all non-marquee in v1, so the simple add-and-compare check below
    // covers every real path.
    if (!offer.isMarquee) {
      const projected = clubBudgetUsage(this.state, userClubId) + offer.annualWage;
      if (projected > club.salaryBudget) return false;
    }
    applySeasonEvent(this.state, {
      type: 'CONTRACT_SIGNED',
      rosterId,
      clubId: userClubId,
      expiresOn: expiryAfterYears(this.state, offer.lengthYears),
      annualWage: offer.annualWage,
    });
    return true;
  }

  // Reverses an in-window signFreeAgent: player returns to freeAgents,
  // contract.clubId clears. Only valid while the signing window is open
  // (after MARKET_CLOSED the cached offer is gone). Returns false if
  // the rosterId isn't on the user's squad — guards against unrelated
  // squad members being released through this path.
  unsignFreeAgent(rosterId: number): boolean {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return false;
    const p = this.state.career.roster[rosterId];
    if (!p) return false;
    const playerClubId = this.state.player.teamId;
    if (p.contract.clubId !== playerClubId) return false;
    const club = this.state.career.clubs.find(c => c.id === playerClubId);
    if (!club || !club.squad.includes(rosterId)) return false;
    applySeasonEvent(this.state, {
      type: 'CONTRACT_TERMINATED',
      rosterId,
      reason: 'released',
    });
    return true;
  }

  // User-side Reg 7 poach. Pre-agrees a move for a contracted player
  // currently at another club whose deal is in its final 12 months.
  // The move activates at the next rollover via TRANSFER_ACTIVATED
  // (not immediately) — the player completes the current season at
  // their existing club.
  //
  // Reads from the cached signing-window offers (state.career.market)
  // so the wage matches what the user saw on TransferMarketScreen.
  // Returns false if no signing window is open, the player isn't
  // poach-eligible, or no cached offer exists.
  preAgreePoach(rosterId: number): boolean {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return false;
    const p = this.state.career.roster[rosterId];
    if (!p) return false;
    if (!isPoachEligible(p, this.state.calendar.date)) return false;
    const playerClubId = this.state.player.teamId;
    if (p.contract.clubId === playerClubId) return false;
    const offer = market.offers.find(o => o.rosterId === rosterId && o.status === 'pending');
    if (!offer) return false;
    // Hard budget gate. Pending poach wages count toward usage via
    // clubBudgetUsage (the move is a future committed liability even
    // though the player completes the current season at their old
    // club).
    const club = this.state.career.clubs.find(c => c.id === playerClubId);
    if (!club) return false;
    if (!offer.isMarquee) {
      const projected = clubBudgetUsage(this.state, playerClubId) + offer.annualWage;
      if (projected > club.salaryBudget) return false;
    }
    applySeasonEvent(this.state, {
      type: 'PRE_AGREEMENT_SIGNED',
      agreement: {
        rosterId,
        fromClubId: p.contract.clubId,
        toClubId: playerClubId,
        annualWage: offer.annualWage,
        lengthYears: offer.lengthYears,
      },
    });
    return true;
  }

  // Reverses an in-window preAgreePoach: drops the pending move so the
  // player won't switch clubs at rollover. Only valid while the signing
  // window is open and the pending move belongs to the user's club.
  cancelPreAgreement(rosterId: number): boolean {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return false;
    const playerClubId = this.state.player.teamId;
    const move = this.state.career.pendingMoves.find(m => m.rosterId === rosterId);
    if (!move || move.toClubId !== playerClubId) return false;
    applySeasonEvent(this.state, { type: 'PRE_AGREEMENT_CANCELLED', rosterId });
    return true;
  }

  // Closes the signing window. Runs the AI signing pass over whatever
  // free agents remain, then the AI poaching pass over contracted
  // players in their final 12 months, then batches OFFER_RESPONDED
  // across every cached offer (accepted iff the rosterId left the
  // free-agent pool / landed on pendingMoves), then fires MARKET_CLOSED.
  closeSigningWindow(opts: { skipPoaches?: boolean } = {}): void {
    const market = this.state.career.market;
    if (!market || market.phase !== 'signings') return;
    const humanClubId = this.state.player.teamId;
    const signings = decideAISignings(this.state, humanClubId);
    for (const s of signings) {
      applySeasonEvent(this.state, {
        type: 'CONTRACT_SIGNED',
        rosterId: s.rosterId,
        clubId: s.clubId,
        expiresOn: s.expiresOn,
        annualWage: s.annualWage,
      });
    }
    // Phase 6: AI poaching pass. Each non-human AI club pre-agrees at
    // most one Reg 7 candidate. Activations happen at the next
    // rollover via TRANSFER_ACTIVATED. Skipped in Squad Builder
    // pre-season — that window is FA-only by design.
    const poaches = opts.skipPoaches ? [] : decideAIPoaches(this.state, humanClubId);
    for (const a of poaches) {
      const fromClubId = this.state.career.roster[a.rosterId]?.contract.clubId ?? '';
      applySeasonEvent(this.state, {
        type: 'PRE_AGREEMENT_SIGNED',
        agreement: {
          rosterId: a.rosterId,
          fromClubId,
          toClubId: a.toClubId,
          annualWage: a.annualWage,
          lengthYears: a.lengthYears,
        },
      });
    }
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
