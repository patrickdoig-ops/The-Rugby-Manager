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
import { SENIOR_CAP, EFFECTIVE_CAP_CREDITS } from '../engine/balance';
import { invariantsEnabled } from '../utils/invariantsMode';
import { MORALE } from '../engine/balance/morale';

const SENIOR_CAP_TOTAL = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;

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
  if (!invariantsEnabled()) return;
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
    // Player.dob is intentionally nullable — the seed data has some
    // legacy entries where the real-world DOB isn't published. Those
    // players legitimately skip aging + retirement in careerRollover
    // (the `if (!p.dob) continue;` guard there is documented behaviour,
    // not a bug). Invariant deliberately does not enforce dob presence.
    assertNonNeg(`roster.contract.annualWage[${rosterId}]`, p.contract.annualWage);
    if (p.injury) {
      assertNonNegInt(`roster.injury.weeksRemaining[${rosterId}]`, p.injury.weeksRemaining);
    }
    if (!(p.condition >= 0) || !(p.condition <= 100)) {
      fail(`roster.condition[${rosterId}]`, `${p.condition}`);
    }
    if (p.morale === undefined || p.morale < 0 || p.morale > 100) {
      fail(`roster.morale[${rosterId}]`, `${p.morale}`);
    }
    if (p.potential !== undefined && !(p.potential >= 1 && Number.isFinite(p.potential))) {
      fail(`roster.potential[${rosterId}]`, `${p.potential}`);
    }
    if (p.restObligation) {
      if (p.restObligation.eligibleRounds.length === 0) {
        fail(`roster.restObligation[${rosterId}]`, `empty eligibleRounds`);
      }
      for (const r of p.restObligation.eligibleRounds) {
        if (!(r >= 1) || !Number.isInteger(r)) {
          fail(`roster.restObligation.eligibleRounds[${rosterId}]`, `${r}`);
        }
      }
    }
    if (p.lionsReturnRound !== undefined && (!(p.lionsReturnRound >= 1) || !Number.isInteger(p.lionsReturnRound))) {
      fail(`roster.lionsReturnRound[${rosterId}]`, `${p.lionsReturnRound}`);
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
    // Salary budget never negative, never above the league cap. Floor
    // is intentionally NOT enforced here — the year-1 seed for Newcastle
    // (£4.15m) is legitimately below it; the floor only applies after
    // the first rollover, and even then is enforced by the planner not
    // by the invariant.
    assertNonNeg(`clubs[${club.id}].salaryBudget`, club.salaryBudget);
    if (club.salaryBudget > SENIOR_CAP_TOTAL) {
      fail(`clubs[${club.id}].salaryBudget`, `${club.salaryBudget} > effective cap ${SENIOR_CAP_TOTAL}`);
    }
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

  // ── Takeover history: known clubIds, no duplicates ───────────────────
  const seenTakeover = new Set<string>();
  for (const clubId of career.takeoverHistory) {
    if (seenTakeover.has(clubId)) {
      fail('takeoverHistory', `duplicate clubId=${clubId}`);
    }
    seenTakeover.add(clubId);
    if (!career.clubs.some(c => c.id === clubId)) {
      fail('takeoverHistory', `unknown clubId=${clubId} (not in career.clubs)`);
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

  // ── Mid-season rejection cooldowns: orphans + sane week values ───────
  for (const key of Object.keys(career.midseasonRejections)) {
    const rosterId = Number(key);
    if (!career.roster[rosterId]) {
      fail('midseasonRejections', `orphaned rosterId=${rosterId} (not in roster)`);
    }
    const weekUntilClear = career.midseasonRejections[rosterId];
    assertNonNegInt(`midseasonRejections.weekUntilClear[${rosterId}]`, weekUntilClear);
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
  // calendar.date must stay a parseable ISO date (catches a malformed
  // MATCHDAY_ADVANCED toDate). A strict monotonicity assert is omitted: the
  // fromSave re-home (GameCoordinator, line ~400) snaps the date to
  // earliestDateForRound on load, which can be earlier than the persisted cup
  // matchday date. All in-play paths are now forward-only (tickElapsedWeeks
  // guards the date before emitting MATCHDAY_ADVANCED).
  if (Number.isNaN(new Date(state.calendar.date).getTime())) {
    fail('calendar.date', `${state.calendar.date}`);
  }

  // ── League standings: derivation invariants ──────────────────────────
  let totalPlayed = 0;
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
    totalPlayed += s.played;
  }
  // League-wide sanity: Σ(played) must equal 2 × results.length (each
  // fixture contributes one played row to home + one to away). A bug
  // that records the same fixture twice satisfies the per-team check
  // but breaks this global one.
  if (totalPlayed !== 2 * state.league.results.length) {
    fail('standings.totalPlayed', `Σplayed=${totalPlayed} expected=${2 * state.league.results.length} (2 × results=${state.league.results.length})`);
  }

  // ── Playoff bracket (when active) ────────────────────────────────────
  const playoffs = state.league.playoffs;
  if (playoffs) {
    if (playoffs.semifinals[0].kind !== 'semifinal_1') {
      fail('playoffs.semifinals[0].kind', `${playoffs.semifinals[0].kind}`);
    }
    if (playoffs.semifinals[1].kind !== 'semifinal_2') {
      fail('playoffs.semifinals[1].kind', `${playoffs.semifinals[1].kind}`);
    }
    if (playoffs.final.kind !== 'final') {
      fail('playoffs.final.kind', `${playoffs.final.kind}`);
    }
    for (const m of [playoffs.semifinals[0], playoffs.semifinals[1], playoffs.final]) {
      if (m.result) {
        assertNonNegInt(`playoffs.${m.kind}.homeScore`, m.result.homeScore);
        assertNonNegInt(`playoffs.${m.kind}.awayScore`, m.result.awayScore);
        assertNonNegInt(`playoffs.${m.kind}.homeTries`, m.result.homeTries);
        assertNonNegInt(`playoffs.${m.kind}.awayTries`, m.result.awayTries);
      }
    }
    // championTeamId, when set, must match the final's winner.
    if (playoffs.championTeamId !== null) {
      if (!playoffs.final.result || !playoffs.final.homeId || !playoffs.final.awayId) {
        fail('playoffs.championTeamId', `set without a resolved final`);
      }
      const winner = playoffs.final.result.homeScore >= playoffs.final.result.awayScore
        ? playoffs.final.homeId
        : playoffs.final.awayId;
      if (playoffs.championTeamId !== winner) {
        fail('playoffs.championTeamId', `champion=${playoffs.championTeamId} winner=${winner}`);
      }
    }
  }

  // ── Prem Cup (when seeded) ───────────────────────────────────────────
  const premCup = state.league.premCup;
  if (premCup) {
    if (premCup.pools[0].id !== 'A') fail('premCup.pools[0].id', `${premCup.pools[0].id}`);
    if (premCup.pools[1].id !== 'B') fail('premCup.pools[1].id', `${premCup.pools[1].id}`);
    for (const pool of premCup.pools) {
      if (pool.teamIds.length !== 5) {
        fail(`premCup.pool[${pool.id}].teamIds`, `length=${pool.teamIds.length}`);
      }
      if (pool.standings.length !== 5) {
        fail(`premCup.pool[${pool.id}].standings`, `length=${pool.standings.length}`);
      }
      let poolPlayed = 0;
      for (const s of pool.standings) {
        if (s.played !== s.won + s.drawn + s.lost) {
          fail(`premCup.pool[${pool.id}].standings[${s.teamId}].played`, `played=${s.played} W=${s.won} D=${s.drawn} L=${s.lost}`);
        }
        if (s.pointsDiff !== s.pointsFor - s.pointsAgainst) {
          fail(`premCup.pool[${pool.id}].standings[${s.teamId}].pointsDiff`, `diff=${s.pointsDiff} for=${s.pointsFor} against=${s.pointsAgainst}`);
        }
        assertNonNegInt(`premCup.pool[${pool.id}].standings[${s.teamId}].played`, s.played);
        poolPlayed += s.played;
      }
      // Σ(played) in a pool == 2 × resulted fixtures in that pool (each
      // fixture adds one played row to home + one to away).
      const resultedInPool = premCup.fixtures.filter(f => f.pool === pool.id && f.result).length;
      if (poolPlayed !== 2 * resultedInPool) {
        fail(`premCup.pool[${pool.id}].totalPlayed`, `Σplayed=${poolPlayed} expected=${2 * resultedInPool}`);
      }
    }
    const ko = premCup.knockout;
    if (ko) {
      if (ko.semifinals[0].kind !== 'semifinal_1') fail('premCup.knockout.semifinals[0].kind', `${ko.semifinals[0].kind}`);
      if (ko.semifinals[1].kind !== 'semifinal_2') fail('premCup.knockout.semifinals[1].kind', `${ko.semifinals[1].kind}`);
      if (ko.final.kind !== 'final') fail('premCup.knockout.final.kind', `${ko.final.kind}`);
      for (const m of [ko.semifinals[0], ko.semifinals[1], ko.final]) {
        if (m.result) {
          assertNonNegInt(`premCup.knockout.${m.kind}.homeScore`, m.result.homeScore);
          assertNonNegInt(`premCup.knockout.${m.kind}.awayScore`, m.result.awayScore);
          assertNonNegInt(`premCup.knockout.${m.kind}.homeTries`, m.result.homeTries);
          assertNonNegInt(`premCup.knockout.${m.kind}.awayTries`, m.result.awayTries);
        }
      }
      if (ko.championTeamId !== null) {
        if (!ko.final.result || !ko.final.homeId || !ko.final.awayId) {
          fail('premCup.knockout.championTeamId', `set without a resolved final`);
        }
        const winner = ko.final.result.homeScore >= ko.final.result.awayScore ? ko.final.homeId : ko.final.awayId;
        if (ko.championTeamId !== winner) {
          fail('premCup.knockout.championTeamId', `champion=${ko.championTeamId} winner=${winner}`);
        }
      }
    }
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

  // ── Board confidence: 0–100 when seeded ──────────────────────────────
  const board = state.player.board;
  if (board) {
    if (!(board.confidence >= 0) || !(board.confidence <= 100)) {
      fail('board.confidence', `${board.confidence}`);
    }
    if (board.objective !== 'title' && board.objective !== 'playoffs' && board.objective !== 'topHalf') {
      fail('board.objective', `${board.objective}`);
    }
  }

  // ── Staff: valid ratings, wages, roles, singleton caps ───────────────
  const staff = state.career.staff;
  if (staff) {
    const VALID_ROLES = new Set(['assistant', 'fitness', 'scout']);
    const hiredByRole = new Map<string, number>();
    const seenIds = new Set<string>();
    for (const m of staff) {
      if (!m.id) fail('staff.id', `empty id`);
      if (seenIds.has(m.id)) fail('staff.id', `duplicate id=${m.id}`);
      seenIds.add(m.id);
      if (!VALID_ROLES.has(m.role)) fail(`staff[${m.id}].role`, `${m.role}`);
      if (!(m.rating >= 0) || !(m.rating <= 100)) fail(`staff[${m.id}].rating`, `${m.rating}`);
      if (!(m.annualWage >= 0)) fail(`staff[${m.id}].annualWage`, `${m.annualWage}`);
      if (m.clubId === state.player.teamId) {
        hiredByRole.set(m.role, (hiredByRole.get(m.role) ?? 0) + 1);
      }
    }
    if ((hiredByRole.get('assistant') ?? 0) > 1) fail('staff.hired.assistant', 'more than one hired');
    if ((hiredByRole.get('fitness')   ?? 0) > 1) fail('staff.hired.fitness',   'more than one hired');
    if ((hiredByRole.get('scout')     ?? 0) > 3) fail('staff.hired.scouts',    'more than 3 hired');
  }
}
