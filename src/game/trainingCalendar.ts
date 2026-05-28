// Pure helpers for reasoning about the gap between the player's matches.
// The season calendar stores only `calendar.date` (the upcoming round's
// earliest fixture) and `calendar.week` (the upcoming round number), so the
// real rest gap for the manager's own team — which varies with Fri/Sat/Sun
// kick-offs and the Autumn Nations / Six Nations breaks — is derived on
// demand from the fixture list rather than stored.
//
// Both the engine injury-recovery tick (GameCoordinator.recordPlayerMatchResult)
// and the Training UI read `upcomingGap`, and they agree because at both call
// sites `calendar.week` already points at the upcoming round: the just-played
// match is round `week - 1`, the next is round `week`.

import type { GameState } from '../types/gameState';
import { SEASON_VALUES } from '../engine/balance';

// Days + whole-week count between the player's previous match (round
// week-1) and their upcoming match (round week). `weeks` is the number of
// discrete training weeks the gap represents — round(days/7), min 1.
// Falls back to a single 7-day week when either fixture is missing (round
// 1, season end) or undated (random-gen schedules).
export function upcomingGap(state: GameState): { weeks: number; days: number } {
  const playerId = state.player.teamId;
  const nextRound = state.calendar.week;
  const prevDate = playerFixtureDate(state, playerId, nextRound - 1);
  const nextDate = playerFixtureDate(state, playerId, nextRound);
  if (!prevDate || !nextDate) return { weeks: 1, days: SEASON_VALUES.weekLengthDays };

  const days = daysBetween(prevDate, nextDate);
  if (days <= 0) return { weeks: 1, days: SEASON_VALUES.weekLengthDays };
  const weeks = Math.max(1, Math.round(days / 7));
  return { weeks, days };
}

// Split a gap of `days` into `weeks` period-spans summing to `days`. Extra
// days land on the earlier periods. e.g. (36, 5) → [8,7,7,7,7]; (6,1) → [6].
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
