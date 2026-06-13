// Pure helpers for reasoning about the gap between the player's matches.
// The season calendar stores only `calendar.date` (the upcoming round's
// earliest fixture) and `calendar.week` (the upcoming round number), so the
// real rest gap for the manager's own team — which varies with Fri/Sat/Sun
// kick-offs and the Autumn Nations / Six Nations breaks — is derived on
// demand from the fixture list rather than stored.
//
// Both the engine injury-recovery tick (GameCoordinator.recordPlayerMatchResult)
// and the Training UI read `upcomingGap`, and they agree because at both call
// sites the derived `leagueRound(state)` already points at the upcoming round:
// the just-played match is round `leagueRound - 1`, the next is `leagueRound`.

import type { GameState } from '../types/gameState';
import { SEASON_VALUES } from '../engine/balance';
import { leagueRound } from './leagueRound';

// Days + whole-week count between the player's previous match (round
// week-1) and their upcoming match (round week). `weeks` is the number of
// discrete training weeks the gap represents — round(days/7), min 1.
// Falls back to a single 7-day week when either fixture is missing (round
// 1, season end) or undated (random-gen schedules).
//
// Special case: during the pre-season cup block (week 1, no previous round,
// and unresolved leg-0 cup fixtures) the gap is derived from the first
// leg-0 fixture date to R1, approximating the real ~2-week window.
export function upcomingGap(state: GameState): { weeks: number; days: number } {
  const playerId = state.player.teamId;
  const nextRound = leagueRound(state);
  const prevDate = playerFixtureDate(state, playerId, nextRound - 1);
  let nextDate = playerFixtureDate(state, playerId, nextRound);

  // Pre-season cup block: no previous round but there are unplayed leg-0
  // cup fixtures. Compute the gap from the earliest leg-0 date to R1.
  if (!prevDate && nextDate && state.league.premCup) {
    const leg0 = state.league.premCup.fixtures.filter(f => f.leg === 0 && !f.result);
    if (leg0.length > 0) {
      const earliest = leg0.map(f => f.date).filter(Boolean).sort()[0];
      if (earliest) {
        const days = daysBetween(earliest, nextDate);
        if (days > 0) {
          return { weeks: Math.max(1, Math.round(days / 7)), days };
        }
      }
    }
  }

  // During the season, check if there are any Cup, European, or Playoff matches
  // before the next League round, to correctly break up multi-week training gaps.
  if (prevDate) {
    const earliestNext = nextPlayableDate(state, playerId, prevDate);
    if (earliestNext && (!nextDate || earliestNext < nextDate)) {
      nextDate = earliestNext;
    }
  }

  if (!prevDate || !nextDate) return { weeks: 1, days: SEASON_VALUES.weekLengthDays };

  const days = daysBetween(prevDate, nextDate);
  if (days <= 0) return { weeks: 1, days: SEASON_VALUES.weekLengthDays };
  const weeks = Math.max(1, Math.round(days / 7));
  return { weeks, days };
}

// Gap for a non-league matchday (cup / European), derived from explicit
// from/to dates rather than league-round lookup. `upcomingGap` keys off the
// derived `leagueRound`, which doesn't move for an intermediate cup/European
// matchday, so it would report the surrounding league gap instead of the
// matchday-to-next-matchday gap — hence this date-explicit variant. Falls
// back to a single 7-day week when either date is missing or the span is
// non-positive (same shape as `upcomingGap`).
export function upcomingGapFromDate(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): { weeks: number; days: number } {
  if (!fromIso || !toIso) return { weeks: 1, days: SEASON_VALUES.weekLengthDays };
  const days = daysBetween(fromIso, toIso);
  if (days <= 0) return { weeks: 1, days: SEASON_VALUES.weekLengthDays };
  return { weeks: Math.max(1, Math.round(days / 7)), days };
}

// Split a gap of `days` into exactly `weeks` period-spans (each ≥ 1 day, so the
// downstream per-period training loop never gets a zero-length span). Extra days
// land on the earlier periods. e.g. (36, 5) → [8,7,7,7,7]; (6,1) → [6]. The sum
// equals `days` whenever `days ≥ weeks`; in the degenerate `days < weeks` case
// the ≥ 1 floor makes the sum exceed `days` (e.g. (3, 5) → [1,1,1,1,1]). The
// fixed span COUNT is the load-bearing contract — `runTrainingPeriods` pairs
// `spans[i]` with `weeks[i]` — so the count is preserved over the exact sum.
// Live callers derive `weeks ≈ round(days / 7)`, so `days < weeks` never occurs.
export function splitGapIntoPeriods(days: number, weeks: number): number[] {
  const n = Math.max(1, weeks);
  const base = Math.floor(days / n);
  let remainder = days - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    out.push(Math.max(1, base + extra));
  }
  return out;
}

function playerFixtureDate(state: GameState, playerId: string, round: number): string | null {
  if (round < 1) return null;
  const f = state.league.fixtures.find(
    fx => fx.round === round && (fx.homeId === playerId || fx.awayId === playerId),
  );
  return f?.date ?? null;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function nextPlayableDate(state: GameState, playerId: string, fromIso: string): string | null {
  const dates: string[] = [];

  // League
  for (const f of state.league.fixtures) {
    if (f.date && f.date > fromIso && (f.homeId === playerId || f.awayId === playerId)) {
      dates.push(f.date);
    }
  }

  // Cup
  const cup = state.league.premCup;
  if (cup) {
    for (const f of cup.fixtures) {
      if (!f.result && f.date && f.date > fromIso && (f.homeId === playerId || f.awayId === playerId)) {
        dates.push(f.date);
      }
    }
    const ko = cup.knockout;
    if (ko) {
      for (const m of [ko.semifinals[0], ko.semifinals[1], ko.final]) {
        if (!m.result && m.date && m.date > fromIso && (m.homeId === playerId || m.awayId === playerId)) {
          dates.push(m.date);
        }
      }
    }
  }

  // European
  for (const comp of ['europeanCup', 'europeanShield'] as const) {
    const eu = state.league[comp];
    if (eu) {
      for (const f of eu.fixtures) {
        if (!f.result && f.date && f.date > fromIso && (f.homeId === playerId || f.awayId === playerId)) {
          dates.push(f.date);
        }
      }
      const ko = eu.knockout;
      if (ko) {
        for (const m of [...ko.r16, ...ko.quarterfinals, ...ko.semifinals, ko.final]) {
          if (!m.result && m.date && m.date > fromIso && (m.homeId === playerId || m.awayId === playerId)) {
            dates.push(m.date);
          }
        }
      }
    }
  }

  // Playoffs
  const playoffs = state.league.playoffs;
  if (playoffs) {
    for (const m of [...playoffs.semifinals, playoffs.final]) {
      if (!m.result && m.date && m.date > fromIso && (m.homeId === playerId || m.awayId === playerId)) {
        dates.push(m.date);
      }
    }
  }

  if (dates.length === 0) return null;
  dates.sort();
  return dates[0];
}
