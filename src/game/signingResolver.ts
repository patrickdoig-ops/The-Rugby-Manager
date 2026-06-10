// Competitive signing resolver. Given a set of pending bids on
// market.bids, walks per-player groups, picks the highest-appeal
// winning club, fires the corresponding contract event(s), and marks
// every bid won/lost.
//
// Pure-ish module: state mutations flow through applySeasonEvent
// (passed in by the caller, so the resolver doesn't import it
// directly and stays unit-testable). Reads market.bids; calls back
// with the resolution events the caller should apply in order.
//
// Resolution order: ascending rosterId for stable replay regardless
// of bid-submission order.

import type { GameState, SeasonEvent, TransferBid } from '../types/gameState';
import type { Player } from '../types/player';
import { sortStandings } from './leagueTable';
import { APPEAL_WEIGHTS, HISTORICAL_POSITIONS, WAGE_NEGOTIATION, RENEWAL, WAGE_ROUNDING_UNIT } from '../engine/balance/transfers';
import { expiryAfterYears } from './aiTransferDirector';

// Per-player outcome consumed by SigningResultsScreen. `winnerBid` is
// the bid that won (null if the player got zero pending bids — they
// stay where they are, no event fired). `userBids` is whichever of
// the bidders belonged to the player's club, with their won/lost
// outcome; used to build the user's "you won / you lost" line.
export interface SigningOutcome {
  rosterId: number;
  winnerBid: TransferBid | null;
  bids: TransferBid[];      // every bid that was in play (won, lost, retention)
  // True when the best bid cleared the appeal contest but fell below
  // the player's reservation wage (asking × reservationFloorRatio) — the
  // player held out rather than sign. winnerBid is null in this case;
  // the flag distinguishes "nobody bid" from "the best offer was a
  // lowball". Transient — never persisted.
  heldOut?: boolean;
}

export interface ResolveResult {
  events: SeasonEvent[];
  outcomes: SigningOutcome[];
}

// Compute the appeal score a club's bid carries for the player. Higher
// = the player prefers this club. Tie-break is by lower clubId (stable
// across runs).
export function appealScore(
  state: GameState,
  bid: TransferBid,
  player: Player,
  // Optional per-round memo for weightedLeaguePosition — the archive sort
  // is identical for every bid in a resolution round, so resolveSigningRound
  // passes one Map to avoid re-sorting per bid evaluation.
  wlpMemo?: Map<string, number>,
): number {
  const club = state.career.clubs.find(c => c.id === bid.clubId);
  if (!club) return -Infinity;

  // Squad-average OVR — the prestige proxy. Skips marquees so a single
  // £600k star doesn't dominate a thin squad's average. Falls back to 0
  // for empty squads (defensive). Position shortage at the offering
  // club walked in the same loop — lower count = bigger need = higher
  // appeal. Capped at 3 so a brand-new club doesn't accidentally win
  // every bid via huge need scores.
  let ovrSum = 0;
  let ovrCount = 0;
  let positionCount = 0;
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (!p) continue;
    if (p.position === player.position) positionCount += 1;
    if (p.contract.isMarquee) continue;
    ovrSum += overallFor(p);
    ovrCount += 1;
  }
  const squadAvgOvr = ovrCount > 0 ? ovrSum / ovrCount : 0;
  const positionShortage = Math.max(0, Math.min(3, APPEAL_WEIGHTS.needTargetPerPosition - positionCount));

  // Ambition: weighted average of recent league positions (2/3 + 1/3).
  let lastSeasonPosition = wlpMemo?.get(club.id);
  if (lastSeasonPosition === undefined) {
    lastSeasonPosition = weightedLeaguePosition(state, club.id);
    wlpMemo?.set(club.id, lastSeasonPosition);
  }

  // Loyalty: retention bid by the player's current club gets a fixed
  // bonus to model the player's mild "devil you know" preference.
  const isCurrentClub = bid.kind === 'retention'
    || player.contract.clubId === club.id;

  return squadAvgOvr           * APPEAL_WEIGHTS.ovrWeight
       + positionShortage      * APPEAL_WEIGHTS.needWeight
       + (5.5 - lastSeasonPosition) * APPEAL_WEIGHTS.ambitionWeight
       + (isCurrentClub ? APPEAL_WEIGHTS.loyaltyBonus : 0);
}

// Signed appeal contribution from the wage a club offers relative to
// the player's asking wage. Positive when the offer beats asking,
// negative when it falls short. Pure — the asking wage is passed in by
// the caller (from the offer it already has in scope) so appealScore
// itself stays free of any market-state dependency.
//
//   ratio = offered / asking   (asking ≤ 0 → neutral 0)
//   ratio ≥ 1 → min(slopeOver  × (ratio - 1),  maxBonus)
//   ratio < 1 → max(slopeUnder × (ratio - 1), -maxPenalty)
//
// See WAGE_NEGOTIATION in balance/transfers.ts for the worked numbers.
export function wageSatisfaction(offeredWage: number, askingWage: number): number {
  if (askingWage <= 0) return 0;
  const ratio = offeredWage / askingWage;
  if (ratio >= 1) {
    return Math.min(WAGE_NEGOTIATION.slopeOver * (ratio - 1), WAGE_NEGOTIATION.maxBonus);
  }
  return Math.max(WAGE_NEGOTIATION.slopeUnder * (ratio - 1), -WAGE_NEGOTIATION.maxPenalty);
}

// Resolves every pending bid in market.bids. Returns the events to
// apply and per-player outcomes for the SigningResultsScreen.
//
// Side-effect-free: caller applies events through applySeasonEvent
// in order. Walking rosterId-ascending keeps the event stream stable
// for the determinism harness.
export function resolveSigningRound(state: GameState): ResolveResult {
  const events: SeasonEvent[] = [];
  const outcomes: SigningOutcome[] = [];
  const market = state.career.market;
  if (!market) return { events, outcomes };

  // Asking wage per player — the offer's annualWage, the baseline the
  // wage term scores against. Built once for the whole round.
  const askingByRoster = new Map<number, number>();
  for (const offer of market.offers) {
    askingByRoster.set(offer.rosterId, offer.annualWage);
  }

  // Group bids by rosterId. Only pending bids are in scope; previously
  // resolved ones are skipped.
  const bidsByRoster = new Map<number, TransferBid[]>();
  for (const bid of market.bids) {
    if (bid.status !== 'pending') continue;
    const arr = bidsByRoster.get(bid.rosterId) ?? [];
    arr.push(bid);
    bidsByRoster.set(bid.rosterId, arr);
  }

  const sortedRosterIds = [...bidsByRoster.keys()].sort((a, b) => a - b);
  const wlpMemo = new Map<string, number>();

  for (const rid of sortedRosterIds) {
    const player = state.career.roster[rid];
    if (!player) continue;
    const bids = bidsByRoster.get(rid)!;
    const askingWage = askingByRoster.get(rid) ?? 0;
    // The cached offer is the full-market rate (FA / poach). A retention
    // bid is quoted at the loyalty-discounted rate, so its wage baseline
    // is that discounted figure — otherwise a default retention would
    // carry a spurious wage penalty on top of the loyalty bonus that
    // already models the player accepting less to stay.
    const retentionAsk = Math.round(
      askingWage * (1 - RENEWAL.loyaltyDiscount) / WAGE_ROUNDING_UNIT) * WAGE_ROUNDING_UNIT;
    const askFor = (bid: TransferBid): number => bid.kind === 'retention' ? retentionAsk : askingWage;

    // Score each bid = club appeal + wage satisfaction (how the offered
    // wage compares to that bid's asking baseline). Highest wins;
    // tie-break by lower clubId using localeCompare so the ordering is
    // explicit and locale-stable. Today's clubIds are English-letter
    // slugs (`bath`, `exeter`, …) so the result matches a naive `<`
    // compare, but localeCompare makes the intent unambiguous and
    // survives a future ID format change.
    let winner: TransferBid | null = null;
    let bestScore = -Infinity;
    for (const bid of bids) {
      const score = appealScore(state, bid, player, wlpMemo) + wageSatisfaction(bid.annualWage, askFor(bid));
      const wins = score > bestScore
        || (score === bestScore && winner !== null && bid.clubId.localeCompare(winner.clubId) < 0);
      if (wins) {
        bestScore = score;
        winner = bid;
      }
    }
    if (!winner) {
      outcomes.push({ rosterId: rid, winnerBid: null, bids });
      continue;
    }

    // Reservation gate: a FA / poach winner must clear the player's
    // reservation wage (asking × reservationFloorRatio). A deep lowball
    // — even unopposed — makes the player hold out rather than sign;
    // every bid is marked lost and no contract event fires. Retention
    // winners are exempt: the current club keeping a player doesn't
    // trigger a holdout (a severe lowball there simply loses the appeal
    // contest to the poacher instead), and exempting them avoids a
    // false holdout from wage-noise between the offer + retention rates.
    if (winner.kind !== 'retention'
        && askingWage > 0
        && winner.annualWage / askingWage < WAGE_NEGOTIATION.reservationFloorRatio) {
      for (const bid of bids) {
        events.push({ type: 'BID_RESOLVED', bidId: bid.id, outcome: 'lost' });
      }
      outcomes.push({ rosterId: rid, winnerBid: null, bids, heldOut: true });
      continue;
    }

    // Resolution events: mark each bid won/lost, then fire the
    // contract event for the winner.
    for (const bid of bids) {
      events.push({
        type: 'BID_RESOLVED',
        bidId: bid.id,
        outcome: bid.id === winner.id ? 'won' : 'lost',
      });
    }

    if (winner.kind === 'retention') {
      // Retention — player stays at their current club with new terms.
      events.push({
        type: 'CONTRACT_EXTENDED',
        rosterId: rid,
        newExpiresOn: expiryAfterYears(state, winner.lengthYears),
        newAnnualWage: winner.annualWage,
      });
    } else if (winner.kind === 'free_agent') {
      // Free-agent signing — immediate effect.
      events.push({
        type: 'CONTRACT_SIGNED',
        rosterId: rid,
        clubId: winner.clubId,
        expiresOn: expiryAfterYears(state, winner.lengthYears),
        annualWage: winner.annualWage,
      });
    } else {
      // Poach — Reg 7 pre-agreement, activates at next rollover.
      events.push({
        type: 'PRE_AGREEMENT_SIGNED',
        agreement: {
          rosterId: rid,
          fromClubId: player.contract.clubId,
          toClubId: winner.clubId,
          annualWage: winner.annualWage,
          lengthYears: winner.lengthYears,
        },
      });
    }

    outcomes.push({ rosterId: rid, winnerBid: winner, bids });
  }

  return { events, outcomes };
}

// --- internals ---

// Player overall computed from baseStats with the position weights —
// re-exported helper inline to avoid pulling RatingEngine in (no
// circular import). Same shape as RatingEngine.playerOverall.
function overallFor(p: Player): number {
  // Quick approximation matching playerOverall — average of the most
  // position-relevant stats. RatingEngine is the source of truth for
  // a precise OVR; this is the resolver's working number where a
  // small approximation error is acceptable.
  const s = p.baseStats;
  return Math.round((s.strength + s.pace + s.handling + s.tackling + s.composure) / 5);
}

// Weighted average of the two most recent seasons' positions for a club.
// Recent season = 2/3 weight, older season = 1/3 weight.
// Season sources (most-to-least recent):
//   archiveLen ≥ 2 → both from in-game archive
//   archiveLen = 1 → archived S1 + historical 2024-25
//   archiveLen = 0 → historical 2024-25 + historical 2023-24
// Falls back to 5.5 (mid-table) only when no data exists.
export function weightedLeaguePosition(state: GameState, clubId: string): number {
  const hist = HISTORICAL_POSITIONS[clubId];
  const archiveLen = state.career.archive.length;

  function archivePos(i: number): number | null {
    const arch = state.career.archive[i];
    if (!arch) return null;
    const sorted = sortStandings(arch.standings);
    const idx = sorted.findIndex(s => s.teamId === clubId);
    return idx >= 0 ? idx + 1 : null;
  }

  let recent: number | null;
  let older: number | null;

  if (archiveLen >= 2) {
    recent = archivePos(archiveLen - 1);
    older  = archivePos(archiveLen - 2);
  } else if (archiveLen === 1) {
    recent = archivePos(0);
    older  = hist?.pos2425 ?? null;
  } else {
    recent = hist?.pos2425 ?? null;
    older  = hist?.pos2324 ?? null;
  }

  if (recent !== null && older !== null) return (2 / 3) * recent + (1 / 3) * older;
  if (recent !== null) return recent;
  return 5.5;
}
