// Pure calendar-block utilities. No side effects, no RNG.
//
// A CalendarBlock clusters all unplayed fixtures whose dates fall within
// BLOCK_GAP_DAYS of each other (counting from the earliest unplayed date).
// This groups Fri/Sat/Sun rounds, back-to-back cup weekends, etc. into a
// single schedulable unit.

import type { GameState } from '../types/gameState';
import type { BlockFixtureRef } from './blockFixture';
import { BLOCK_GAP_DAYS } from '../engine/balance/season';

export interface CalendarBlock {
  startDate: string;
  endDate: string;
  fixtures: BlockFixtureRef[];
  competitions: Array<'league' | 'cup' | 'european' | 'playoff'>;
}

// Days between two ISO yyyy-mm-dd strings (b - a). Always non-negative when
// b >= a. Uses integer arithmetic on UTC day counts to avoid DST drift.
function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.round((Date.parse(b) - Date.parse(a)) / msPerDay);
}

// Collect every unplayed fixture from all competitions and return them as
// a flat array of BlockFixtureRef sorted ascending by date.
function collectUnplayed(state: GameState): BlockFixtureRef[] {
  const refs: BlockFixtureRef[] = [];

  // League fixtures — unplayed = no matching FixtureResult
  const resultSet = new Set(
    state.league.results.map(r => `${r.round}|${r.homeId}|${r.awayId}`),
  );
  for (const f of state.league.fixtures) {
    if (!f.date) continue;
    if (resultSet.has(`${f.round}|${f.homeId}|${f.awayId}`)) continue;
    refs.push({ comp: 'league', date: f.date, homeId: f.homeId, awayId: f.awayId, round: f.round });
  }

  // Prem Cup — pool fixtures
  const cup = state.league.premCup;
  if (cup) {
    for (const f of cup.fixtures) {
      if (f.result) continue;
      refs.push({ comp: 'cup', date: f.date, homeId: f.homeId, awayId: f.awayId,
        ref: { kind: 'pool', fixture: f } });
    }
    // Cup knockouts
    if (cup.knockout) {
      const { semifinals, final } = cup.knockout;
      for (const m of [semifinals[0], semifinals[1], final]) {
        if (!m.homeId || !m.awayId || m.result) continue;
        refs.push({ comp: 'cup', date: m.date, homeId: m.homeId, awayId: m.awayId,
          ref: { kind: 'knockout', stage: m.kind, match: m } });
      }
    }
  }

  // European pool fixtures + knockouts
  for (const compKey of ['europeanCup', 'europeanShield'] as const) {
    const ec = state.league[compKey];
    if (!ec) continue;
    const competition = compKey;
    for (const f of ec.fixtures) {
      if (!f.date || f.result) continue;
      refs.push({ comp: 'european', date: f.date, homeId: f.homeId, awayId: f.awayId,
        ref: { kind: 'pool', competition, fixture: f } });
    }
    if (ec.knockout) {
      const ko = ec.knockout;
      for (const m of ko.r16) {
        if (!m.homeId || !m.awayId || m.result) continue;
        refs.push({ comp: 'european', date: m.date ?? '', homeId: m.homeId, awayId: m.awayId,
          ref: { kind: 'knockout', competition, stage: 'r16', match: m } });
      }
      for (const m of ko.quarterfinals) {
        if (!m.homeId || !m.awayId || m.result) continue;
        refs.push({ comp: 'european', date: m.date ?? '', homeId: m.homeId, awayId: m.awayId,
          ref: { kind: 'knockout', competition, stage: 'quarterfinal', match: m } });
      }
      for (const m of ko.semifinals) {
        if (!m.homeId || !m.awayId || m.result) continue;
        refs.push({ comp: 'european', date: m.date ?? '', homeId: m.homeId, awayId: m.awayId,
          ref: { kind: 'knockout', competition, stage: 'semifinal', match: m } });
      }
      if (ko.final.homeId && ko.final.awayId && !ko.final.result) {
        refs.push({ comp: 'european', date: ko.final.date ?? '', homeId: ko.final.homeId, awayId: ko.final.awayId,
          ref: { kind: 'knockout', competition, stage: 'final', match: ko.final } });
      }
    }
  }

  // Playoffs
  if (state.league.playoffs) {
    const { semifinals, final } = state.league.playoffs;
    for (const m of [semifinals[0], semifinals[1], final]) {
      if (!m.homeId || !m.awayId || m.result) continue;
      refs.push({ comp: 'playoff', date: m.date, homeId: m.homeId, awayId: m.awayId,
        ref: { kind: m.kind } });
    }
  }

  // Drop any refs with an empty date (defensive — knockout matches without a
  // date set yet are not yet schedulable).
  return refs.filter(r => r.date).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

// Returns the next CalendarBlock — all unplayed fixtures clustered around the
// earliest unplayed date — or null when the season has no more fixtures.
//
// `allTeamIds` is accepted for future use (e.g. to filter to the player's
// fixtures) but is not used by the current algorithm.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function nextBlock(state: GameState, _allTeamIds: string[]): CalendarBlock | null {
  const unplayed = collectUnplayed(state);
  if (unplayed.length === 0) return null;

  const d0 = unplayed[0].date;
  let blockEnd = d0;

  // Greedily extend: keep adding fixtures while the next one's date is within
  // BLOCK_GAP_DAYS of the current block's last date.
  const inBlock: BlockFixtureRef[] = [];
  for (const ref of unplayed) {
    if (daysBetween(blockEnd, ref.date) <= BLOCK_GAP_DAYS) {
      inBlock.push(ref);
      if (ref.date > blockEnd) blockEnd = ref.date;
    } else {
      break;
    }
  }

  // Distinct competition kinds, in canonical order.
  const compOrder: Array<'league' | 'cup' | 'european' | 'playoff'> = ['league', 'cup', 'european', 'playoff'];
  const seen = new Set(inBlock.map(r => r.comp));
  const competitions = compOrder.filter(c => seen.has(c));

  return { startDate: d0, endDate: blockEnd, fixtures: inBlock, competitions };
}
