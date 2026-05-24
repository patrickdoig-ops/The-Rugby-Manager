// Runtime tripwires for GameState. Sibling of src/engine/invariants.ts —
// called from applySeasonEvent after every mutation. Catches the silent-
// corruption modes the season seam is otherwise blind to: orphaned roster
// IDs, a player in two clubs at once, a free-agent who's also squadded,
// negative counters, etc. Surfaces the bug at the event that caused it
// rather than weeks later as a confused leaderboard or a phantom contract.
//
// Cost is O(roster + clubs) per call. With a ~500-player league and ~25
// applySeasonEvent calls per fixture, that's well under a millisecond per
// fixture — negligible against the per-event mutation work already done.

import type { GameState } from '../types/gameState';

function fail(check: string, detail: string): never {
  throw new Error(`Season invariant violated [${check}]: ${detail}`);
}

function assertNonNeg(name: string, v: number): void {
  if (!(v >= 0)) fail(name, `${v}`);
}

function assertNonNegInt(name: string, v: number): void {
  if (!(v >= 0) || !Number.isInteger(v)) fail(name, `${v}`);
}

export function assertSeasonInvariants(state: GameState): void {
  const career = state.career;

  // ── Roster + rosterId integrity ──────────────────────────────────────
  // Every key in the Record matches the player's own rosterId field, and
  // every rosterId referenced elsewhere in CareerState resolves back to a
  // real Player.
  let maxRosterId = 0;
  for (const key of Object.keys(career.roster)) {
    const rosterId = Number(key);
    const p = career.roster[rosterId];
    if (p.rosterId !== rosterId) {
      fail('roster.key', `key=${rosterId} player.rosterId=${p.rosterId}`);
    }
    if (rosterId > maxRosterId) maxRosterId = rosterId;
    if (!p.firstName || !p.lastName) {
      fail('roster.name', `rosterId=${rosterId} firstName="${p.firstName}" lastName="${p.lastName}"`);
    }
    assertNonNeg(`roster.contract.annualWage[${rosterId}]`, p.contract.annualWage);
    if (p.injury) {
      assertNonNegInt(`roster.injury.weeksRemaining[${rosterId}]`, p.injury.weeksRemaining);
    }
    const s = p.seasonStats;
    assertNonNegInt(`roster.seasonStats.appearances[${rosterId}]`, s.appearances);
    assertNonNegInt(`roster.seasonStats.tries[${rosterId}]`, s.tries);
    assertNonNegInt(`roster.seasonStats.carries[${rosterId}]`, s.carries);
    assertNonNegInt(`roster.seasonStats.tackles[${rosterId}]`, s.tackles);
    assertNonNegInt(`roster.seasonStats.yellowCards[${rosterId}]`, s.yellowCards);
    assertNonNegInt(`roster.seasonStats.redCards[${rosterId}]`, s.redCards);
    assertNonNeg(`roster.seasonStats.ratingSum[${rosterId}]`, s.ratingSum);
  }
  if (career.nextRosterId <= maxRosterId) {
    fail('career.nextRosterId', `nextRosterId=${career.nextRosterId} <= maxRosterId=${maxRosterId}`);
  }

  // ── Club squads: no duplicates, no orphaned rosterIds, ≤1 marquee ────
  const clubBySquadId = new Map<number, string>();
  for (const club of career.clubs) {
    let marqueeCount = 0;
    for (const rosterId of club.squad) {
      const p = career.roster[rosterId];
      if (!p) fail(`clubs[${club.id}].squad`, `orphaned rosterId=${rosterId} (not in roster)`);
      const prev = clubBySquadId.get(rosterId);
      if (prev !== undefined) {
        fail(`clubs.squad`, `rosterId=${rosterId} appears in both ${prev} and ${club.id}`);
      }
      clubBySquadId.set(rosterId, club.id);
      if (p.contract.isMarquee) marqueeCount += 1;
    }
    if (marqueeCount > 1) {
      fail(`clubs[${club.id}].marquee`, `marqueeCount=${marqueeCount}`);
    }
  }

  // ── Free agents: no duplicates, no overlap with any club squad ───────
  const freeAgentSet = new Set<number>();
  for (const rosterId of career.freeAgents) {
    if (!career.roster[rosterId]) {
      fail('freeAgents', `orphaned rosterId=${rosterId} (not in roster)`);
    }
    if (freeAgentSet.has(rosterId)) {
      fail('freeAgents', `duplicate rosterId=${rosterId}`);
    }
    freeAgentSet.add(rosterId);
    const club = clubBySquadId.get(rosterId);
    if (club !== undefined) {
      fail('freeAgents', `rosterId=${rosterId} is also in ${club}'s squad`);
    }
  }

  // ── Pending moves (Reg 7): orphans + wage sanity ─────────────────────
  for (const move of career.pendingMoves) {
    if (!career.roster[move.rosterId]) {
      fail('pendingMoves', `orphaned rosterId=${move.rosterId}`);
    }
    assertNonNeg(`pendingMoves.annualWage[${move.rosterId}]`, move.annualWage);
    if (move.fromClubId === move.toClubId) {
      fail('pendingMoves', `rosterId=${move.rosterId} fromClubId === toClubId === ${move.fromClubId}`);
    }
  }

  // ── Market offers (when open): orphans + wage sanity ─────────────────
  if (career.market) {
    const offerIds = new Set<string>();
    for (const offer of career.market.offers) {
      if (!career.roster[offer.rosterId]) {
        fail('market.offers', `orphaned rosterId=${offer.rosterId} (offer ${offer.id})`);
      }
      if (offerIds.has(offer.id)) {
        fail('market.offers', `duplicate offer id=${offer.id}`);
      }
      offerIds.add(offer.id);
      assertNonNeg(`market.offers.annualWage[${offer.id}]`, offer.annualWage);
    }
  }

  // ── Calendar + seasonsCompleted ──────────────────────────────────────
  if (!(career.seasonsCompleted >= 0) || !Number.isInteger(career.seasonsCompleted)) {
    fail('career.seasonsCompleted', `${career.seasonsCompleted}`);
  }
  if (!(state.calendar.week >= 1) || !Number.isInteger(state.calendar.week)) {
    fail('calendar.week', `${state.calendar.week}`);
  }

  // ── League standings: derivation invariants ──────────────────────────
  for (const s of state.league.standings) {
    if (s.played !== s.won + s.drawn + s.lost) {
      fail(`standings[${s.teamId}].played`, `played=${s.played} W=${s.won} D=${s.drawn} L=${s.lost}`);
    }
    if (s.pointsDiff !== s.pointsFor - s.pointsAgainst) {
      fail(`standings[${s.teamId}].pointsDiff`, `diff=${s.pointsDiff} for=${s.pointsFor} against=${s.pointsAgainst}`);
    }
    assertNonNegInt(`standings[${s.teamId}].played`, s.played);
    assertNonNeg(`standings[${s.teamId}].pointsFor`, s.pointsFor);
    assertNonNeg(`standings[${s.teamId}].pointsAgainst`, s.pointsAgainst);
    assertNonNegInt(`standings[${s.teamId}].leaguePoints`, s.leaguePoints);
  }

  // ── Team season stats: per-club counters + set-piece win <= thrown ───
  for (const teamId of Object.keys(state.league.teamSeasonStats)) {
    const t = state.league.teamSeasonStats[teamId];
    assertNonNegInt(`teamSeasonStats[${teamId}].matchesPlayed`, t.matchesPlayed);
    assertNonNegInt(`teamSeasonStats[${teamId}].tries`, t.tries);
    assertNonNegInt(`teamSeasonStats[${teamId}].carries`, t.carries);
    assertNonNegInt(`teamSeasonStats[${teamId}].tacklesAttempted`, t.tacklesAttempted);
    assertNonNegInt(`teamSeasonStats[${teamId}].tacklesMade`, t.tacklesMade);
    if (t.tacklesMade > t.tacklesAttempted) {
      fail(`teamSeasonStats[${teamId}].tackles`, `made=${t.tacklesMade} > attempted=${t.tacklesAttempted}`);
    }
    assertNonNegInt(`teamSeasonStats[${teamId}].lineoutsThrown`, t.lineoutsThrown);
    assertNonNegInt(`teamSeasonStats[${teamId}].lineoutsWon`, t.lineoutsWon);
    if (t.lineoutsWon > t.lineoutsThrown) {
      fail(`teamSeasonStats[${teamId}].lineouts`, `won=${t.lineoutsWon} > thrown=${t.lineoutsThrown}`);
    }
    assertNonNegInt(`teamSeasonStats[${teamId}].scrumsPutIn`, t.scrumsPutIn);
    assertNonNegInt(`teamSeasonStats[${teamId}].scrumsWon`, t.scrumsWon);
    if (t.scrumsWon > t.scrumsPutIn) {
      fail(`teamSeasonStats[${teamId}].scrums`, `won=${t.scrumsWon} > putIn=${t.scrumsPutIn}`);
    }
    assertNonNegInt(`teamSeasonStats[${teamId}].yellowCards`, t.yellowCards);
    assertNonNegInt(`teamSeasonStats[${teamId}].redCards`, t.redCards);
  }
}
