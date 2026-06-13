// The manager's whole-season schedule across every competition, played and
// upcoming, in one chronological list. Pure, no RNG.
//
// Sibling to calendarBlocks.collectUnplayed: that gathers UNPLAYED fixtures
// across all competitions for the block driver; this gathers BOTH played
// (carrying the result) and upcoming fixtures for the player's team only, for
// the Fixture List screen. Knockout / play-off matches whose participants
// aren't seeded yet (null sides) are excluded — they appear automatically once
// the bracket fills, since this re-reads live state on each call.

import type { GameState, FixtureResult } from '../types/gameState';
import type { BlockFixtureRef } from './blockFixture';

export type SeasonFixtureRow = BlockFixtureRef & {
  opponentId: string;
  playerIsHome: boolean;
  played: boolean;
  result?: { homeScore: number; awayScore: number };
};

export function collectSeasonFixtures(state: GameState, playerTeamId: string): SeasonFixtureRow[] {
  const rows: SeasonFixtureRow[] = [];

  const add = (ref: BlockFixtureRef, res?: { homeScore: number; awayScore: number }): void => {
    if (!ref.date) return;
    if (ref.homeId !== playerTeamId && ref.awayId !== playerTeamId) return;
    const playerIsHome = ref.homeId === playerTeamId;
    rows.push({
      ...ref,
      opponentId: playerIsHome ? ref.awayId : ref.homeId,
      playerIsHome,
      played: !!res,
      result: res,
    });
  };

  const score = (r: { homeScore: number; awayScore: number } | undefined) =>
    r ? { homeScore: r.homeScore, awayScore: r.awayScore } : undefined;

  // League — fixtures unioned with their results (keyed round|home|away).
  const leagueRes = new Map<string, FixtureResult>();
  for (const r of state.league.results) leagueRes.set(`${r.round}|${r.homeId}|${r.awayId}`, r);
  for (const f of state.league.fixtures) {
    const r = leagueRes.get(`${f.round}|${f.homeId}|${f.awayId}`);
    add({ comp: 'league', date: f.date ?? '', homeId: f.homeId, awayId: f.awayId, round: f.round }, score(r));
  }

  // League Cup — pool fixtures + (once seeded) knockout.
  const cup = state.league.premCup;
  if (cup) {
    for (const f of cup.fixtures) {
      add({ comp: 'cup', date: f.date, homeId: f.homeId, awayId: f.awayId, ref: { kind: 'pool', fixture: f } }, score(f.result));
    }
    if (cup.knockout) {
      const { semifinals, final } = cup.knockout;
      for (const m of [semifinals[0], semifinals[1], final]) {
        if (!m.homeId || !m.awayId) continue;
        add({ comp: 'cup', date: m.date, homeId: m.homeId, awayId: m.awayId, ref: { kind: 'knockout', stage: m.kind, match: m } }, score(m.result));
      }
    }
  }

  // European Cup + Shield — pool fixtures + (once seeded) knockout rounds.
  for (const competition of ['europeanCup', 'europeanShield'] as const) {
    const ec = state.league[competition];
    if (!ec) continue;
    for (const f of ec.fixtures) {
      add({ comp: 'european', date: f.date ?? '', homeId: f.homeId, awayId: f.awayId, ref: { kind: 'pool', competition, fixture: f } }, score(f.result));
    }
    const ko = ec.knockout;
    if (ko) {
      const stages = [
        { stage: 'r16' as const, matches: ko.r16 },
        { stage: 'quarterfinal' as const, matches: ko.quarterfinals },
        { stage: 'semifinal' as const, matches: ko.semifinals },
        { stage: 'final' as const, matches: [ko.final] },
      ];
      for (const { stage, matches } of stages) {
        for (const m of matches) {
          if (!m.homeId || !m.awayId) continue;
          add({ comp: 'european', date: m.date ?? '', homeId: m.homeId, awayId: m.awayId, ref: { kind: 'knockout', competition, stage, match: m } }, score(m.result));
        }
      }
    }
  }

  // Play-offs — semi-finals + final, once seeded.
  if (state.league.playoffs) {
    const { semifinals, final } = state.league.playoffs;
    for (const m of [semifinals[0], semifinals[1], final]) {
      if (!m.homeId || !m.awayId) continue;
      add({ comp: 'playoff', date: m.date, homeId: m.homeId, awayId: m.awayId, ref: { kind: m.kind } }, score(m.result));
    }
  }

  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
