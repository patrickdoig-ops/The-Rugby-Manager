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
import { appealScore, type SigningOutcome } from './signingResolver';
import { expiryAfterYears } from './aiTransferDirector';
import { MIDSEASON_SIGNING } from '../engine/balance/transfers';
import { rngTransfer } from '../utils/rng';

export interface MidseasonResolveResult {
  events: SeasonEvent[];
  outcomes: SigningOutcome[];
}

// Map an appealScore to an acceptance probability in
// [MIDSEASON_SIGNING.acceptanceFloor, MIDSEASON_SIGNING.acceptanceCeiling].
// Pure — exported so tuning + future telemetry can inspect it.
export function midseasonAcceptanceProbability(
  state: GameState,
  bid: TransferBid,
  player: Player,
): number {
  const score = appealScore(state, bid, player);
  const { appealFloor, appealCeiling, acceptanceFloor, acceptanceCeiling } = MIDSEASON_SIGNING;
  const span = appealCeiling - appealFloor;
  const t = span > 0 ? Math.max(0, Math.min(1, (score - appealFloor) / span)) : 0;
  return acceptanceFloor + t * (acceptanceCeiling - acceptanceFloor);
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
    const probability = midseasonAcceptanceProbability(state, bid, player);
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
