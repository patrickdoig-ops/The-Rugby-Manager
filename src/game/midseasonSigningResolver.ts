// Mid-season free-agent signing resolver. Walks the user's pending
// bids in market.bids, rolls a per-player acceptance probability
// against the rngTransfer stream, and emits the resulting season
// events (BID_RESOLVED + CONTRACT_SIGNED on accept, BID_RESOLVED +
// MIDSEASON_OFFER_REJECTED on decline).
//
// Unlike resolveSigningRound (off-season, competitive), there is no
// AI bidder; the player either accepts the user's offer or not.
// Acceptance is appeal-score-driven so a stronger club's offer is
// more likely to land, without ever being a sure thing.
//
// Pure-ish: state reads only, caller applies events through
// applySeasonEvent. Walks rosterId-ascending so the rngTransfer
// consumption order is stable for the determinism harness.

import type { GameState, SeasonEvent, TransferBid } from '../types/gameState';
import type { Player } from '../types/player';
import { appealScore, wageSatisfaction, type SigningOutcome } from './signingResolver';
import { expiryAfterYears } from './aiTransferDirector';
import { MIDSEASON_SIGNING, WAGE_NEGOTIATION } from '../engine/balance/transfers';
import { rngTransfer } from '../utils/rng';

export interface MidseasonResolveResult {
  events: SeasonEvent[];
  outcomes: SigningOutcome[];
}

// Map an appealScore (+ wage satisfaction) to an acceptance probability
// in [MIDSEASON_SIGNING.acceptanceFloor, MIDSEASON_SIGNING.acceptanceCeiling].
// `askingWage` is the player's expected wage (the offer's annualWage);
// the bid's annualWage is what the user offered. A higher offer lifts
// the score and so the probability. Pure — exported so tuning + the UI
// wage-modal read can call it with the same inputs the engine uses.
export function midseasonAcceptanceProbability(
  state: GameState,
  bid: TransferBid,
  player: Player,
  askingWage: number,
): number {
  const score = appealScore(state, bid, player) + wageSatisfaction(bid.annualWage, askingWage);
  const { appealFloor, appealCeiling, acceptanceFloor, acceptanceCeiling } = MIDSEASON_SIGNING;
  const span = appealCeiling - appealFloor;
  const t = span > 0 ? Math.max(0, Math.min(1, (score - appealFloor) / span)) : 0;
  return acceptanceFloor + t * (acceptanceCeiling - acceptanceFloor);
}

// Acceptance probability for a USER renewal / early-renewal offer.
// Folds the wage term into the mid-season appeal→probability map, then
// clamps: an offer at or above asking is near-certain (loyalty floor), a
// lowball never below the underpay floor. Pure + RNG-free — shared by
// the coordinator's renewal paths and the wage-modal UI read so the chip
// the user sees matches the engine's roll. `askingWage` here can be the
// real loyalty-discounted rate or an RNG-free estimate for previews.
export function renewalAcceptProbability(
  state: GameState,
  bid: TransferBid,
  player: Player,
  askingWage: number,
  offeredWage: number,
): number {
  const base = midseasonAcceptanceProbability(state, bid, player, askingWage);
  if (offeredWage >= askingWage) return Math.max(base, WAGE_NEGOTIATION.renewalLoyaltyFloorProb);
  return Math.max(base, WAGE_NEGOTIATION.renewalUnderpayFloorProb);
}

// UI helper — bucket an acceptance probability into a coarse label so
// the wage-offer modal can show "Likely / Uncertain / Unlikely" without
// duplicating any of the probability math. Thresholds are display-only.
export type AcceptanceLabel = 'likely' | 'uncertain' | 'unlikely';
export function acceptanceLabel(probability: number): AcceptanceLabel {
  if (probability >= 0.75) return 'likely';
  if (probability >= 0.40) return 'uncertain';
  return 'unlikely';
}

// Resolves every pending user bid on the mid-season market. One
// rngTransfer roll per bid in rosterId-ascending order. The caller
// applies the returned events in order; outcomes feed
// SigningResultsScreen.
export function resolveMidseasonSigning(state: GameState): MidseasonResolveResult {
  const events: SeasonEvent[] = [];
  const outcomes: SigningOutcome[] = [];
  const market = state.career.market;
  if (!market || market.phase !== 'signings-midseason') return { events, outcomes };

  const userClubId = state.player.teamId;
  const pendingUserBids = market.bids
    .filter(b => b.status === 'pending' && b.clubId === userClubId && b.kind === 'free_agent')
    .sort((a, b) => a.rosterId - b.rosterId);

  for (const bid of pendingUserBids) {
    const player = state.career.roster[bid.rosterId];
    if (!player) continue;
    // Asking wage = the offer the window opened with; the bid carries
    // the user's chosen wage. Fallback to the bid wage (neutral) if the
    // offer is somehow missing.
    const offer = market.offers.find(o => o.rosterId === bid.rosterId);
    const askingWage = offer?.annualWage ?? bid.annualWage;
    const probability = midseasonAcceptanceProbability(state, bid, player, askingWage);
    // rngTransfer(1, 1000) / 1000 → uniform [0.001, 1] roll. Below the
    // probability threshold accepts; otherwise declines.
    const roll = rngTransfer(1, 1000) / 1000;
    const accepted = roll <= probability;
    events.push({
      type: 'BID_RESOLVED',
      bidId: bid.id,
      outcome: accepted ? 'won' : 'lost',
    });
    if (accepted) {
      events.push({
        type: 'CONTRACT_SIGNED',
        rosterId: bid.rosterId,
        clubId: userClubId,
        expiresOn: expiryAfterYears(state, bid.lengthYears),
        annualWage: bid.annualWage,
      });
      outcomes.push({ rosterId: bid.rosterId, winnerBid: bid, bids: [bid] });
    } else {
      events.push({
        type: 'MIDSEASON_OFFER_REJECTED',
        rosterId: bid.rosterId,
        weekUntilClear: state.calendar.week + 1,
      });
      outcomes.push({ rosterId: bid.rosterId, winnerBid: null, bids: [bid] });
    }
  }

  return { events, outcomes };
}
