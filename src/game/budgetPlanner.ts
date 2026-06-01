// Computes the next-season SeasonEvent stream for the budget +
// takeover layer. Pure module — reads GameState, returns events.
// Called from GameCoordinator.prepareBudgetsForNextSeason at the start
// of the off-season chain, BEFORE renewals + signings, so the user
// sees the new budget when they make their wage decisions.
//
// Output order:
//   1. CLUB_BUDGET_SET per club (stable alpha order on clubId) —
//      performance-derived base, floor-clamped from year 2 onwards,
//      cap-clamped at the league ceiling.
//   2. CLUB_TAKEOVER for any club that gets the Red Bull-style boost
//      (year-1→year-2 Newcastle hardcoded; year-2→year-3+ rngTransfer
//      roll for each not-yet-taken-over club).
//
// Determinism: consumes rngTransfer (career stream) only for the
// random-takeover rolls. The performance-based budget computation is
// pure (no RNG). The same root seed produces the same budget timeline
// across runs.

import type { BudgetReason, GameState, SeasonEvent } from '../types/gameState';
import { sortStandings } from './leagueTable';
import { BUDGET_VALUES, SENIOR_CAP, EFFECTIVE_CAP_CREDITS, TAKEOVER_VALUES } from '../engine/balance';
import { rngTransfer } from '../utils/rng';

const SENIOR_CAP_TOTAL = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;

// Returns the SeasonEvent stream that updates every club's salaryBudget
// for the upcoming season, plus any takeover boost. Does not mutate
// state — caller applies through applySeasonEvent.
export function computeBudgetEvents(state: GameState): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  // The floor applies from year 2 onwards. seasonsCompleted is the
  // number of finished seasons; at the moment this runs we're between
  // the just-finished season and the next rollover, so the new budget
  // is for season (seasonsCompleted + 2). Year 2 = upcoming when
  // seasonsCompleted === 0; we apply the floor from then on.
  const upcomingSeasonNumber = state.career.seasonsCompleted + 2;
  const floorApplies = upcomingSeasonNumber >= 2;
  const sorted = sortStandings(state.league.standings);
  const positionByClub = new Map<string, number>();
  sorted.forEach((s, i) => positionByClub.set(s.teamId, i + 1));
  const playoffs = state.league.playoffs;
  const championId = playoffs?.championTeamId ?? null;
  const sfClubs = new Set<string>();
  const finalistClubs = new Set<string>();
  if (playoffs) {
    for (const m of playoffs.semifinals) {
      if (m.homeId) sfClubs.add(m.homeId);
      if (m.awayId) sfClubs.add(m.awayId);
    }
    if (playoffs.final.homeId) finalistClubs.add(playoffs.final.homeId);
    if (playoffs.final.awayId) finalistClubs.add(playoffs.final.awayId);
  }

  // Stable alpha-by-clubId order keeps the event stream reproducible
  // regardless of clubs[] iteration order. Same ordering on the
  // takeover rolls below.
  const clubsSorted = [...state.career.clubs].sort((a, b) => a.id.localeCompare(b.id));
  for (const club of clubsSorted) {
    const reasons: BudgetReason[] = [];
    const position = positionByClub.get(club.id) ?? Math.ceil(sorted.length / 2);
    reasons.push({ kind: 'position', value: position });
    const positionShift = (5.5 - position) * BUDGET_VALUES.positionDelta;
    let next = club.salaryBudget + positionShift;
    if (finalistClubs.has(club.id)) {
      next += BUDGET_VALUES.finalistBonus;
      reasons.push({ kind: 'finalist' });
    } else if (sfClubs.has(club.id)) {
      next += BUDGET_VALUES.semiFinalBonus;
      reasons.push({ kind: 'sf_appearance' });
    }
    if (championId === club.id) {
      next += BUDGET_VALUES.championBonus;
      reasons.push({ kind: 'champion' });
    }
    if (floorApplies && next < BUDGET_VALUES.floor) {
      next = BUDGET_VALUES.floor;
      reasons.push({ kind: 'floor_applied' });
    }
    if (next > SENIOR_CAP_TOTAL) {
      next = SENIOR_CAP_TOTAL;
      reasons.push({ kind: 'cap_applied' });
    }
    // Round to nearest £50k so the UI never shows £6,827,341 — the
    // adjustment deltas land on clean numbers and the headline figure
    // is readable.
    next = Math.round(next / 50_000) * 50_000;
    const delta = next - club.salaryBudget;
    events.push({
      type: 'CLUB_BUDGET_SET',
      clubId: club.id,
      salaryBudget: next,
      delta,
      reasons,
    });
  }

  // Year-1 → Year-2 hardcoded: Newcastle Red Bull takeover. Fires
  // before any random rolls so the random pool excludes Newcastle from
  // then on (the reducer pushes them into takeoverHistory).
  if (upcomingSeasonNumber === 2) {
    const newcastleId = TAKEOVER_VALUES.hardcodedYear2ClubId;
    if (!state.career.takeoverHistory.includes(newcastleId)
        && state.career.clubs.some(c => c.id === newcastleId)) {
      events.push({
        type: 'CLUB_TAKEOVER',
        clubId: newcastleId,
        boostAmount: TAKEOVER_VALUES.boostAmount,
        flavor: 'red_bull',
      });
    }
  }

  // Year-3 onwards: independent rngTransfer roll per not-yet-taken-over
  // club. Stable alpha order so the RNG sequence is reproducible.
  // Newcastle is already in takeoverHistory by this point (added by
  // the year-2 reducer) so they're naturally skipped.
  if (upcomingSeasonNumber >= 3) {
    for (const club of clubsSorted) {
      if (state.career.takeoverHistory.includes(club.id)) continue;
      const roll = rngTransfer(1, 100);
      if (roll <= TAKEOVER_VALUES.randomChancePct) {
        events.push({
          type: 'CLUB_TAKEOVER',
          clubId: club.id,
          boostAmount: TAKEOVER_VALUES.boostAmount,
          flavor: 'investor',
        });
      }
    }
  }

  return events;
}
