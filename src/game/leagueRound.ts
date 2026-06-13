// The current league-round cursor, derived from the fixture results rather
// than stored. Pure, no RNG.
//
// Historically `calendar.week` doubled as both the league-round index and the
// weekly tick. The unified-calendar migration (F-2) splits these: `calendar.week`
// becomes a monotonic week counter, and the league round — "which league round
// is next to play" — is derived here from how many league rounds the player has
// already completed. Every read that means "which league round" routes through
// this helper instead of `calendar.week`.
//
// Equals the legacy `calendar.week` value at every between-tick observation
// point: the season opens on round 1 (no results), and each completed league
// round bumps the count by one — so a player who has banked R1–R5 is on round 6.

import type { Fixture, GameState } from '../types/gameState';

export function leagueRound(state: GameState): number {
  const playerId = state.player.teamId;
  const played = new Set<number>();
  for (const r of state.league.results) {
    if (r.homeId === playerId || r.awayId === playerId) played.add(r.round);
  }
  return played.size + 1;
}

// Earliest dated fixture for a league round, or null when no fixture in that
// round carries a date (random-gen seasons) or the round doesn't exist (season
// finished). The calendar cursor (calendar.date) is re-homed onto this each
// time the league advances, so it always points at the next round's kick-off.
export function earliestDateForRound(fixtures: Fixture[], round: number): string | null {
  let min: string | null = null;
  for (const f of fixtures) {
    if (f.round !== round || !f.date) continue;
    if (min === null || f.date < min) min = f.date;
  }
  return min;
}
