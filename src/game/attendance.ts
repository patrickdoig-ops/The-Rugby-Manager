import type { Fixture, FixtureResult, TeamStanding } from '../types/gameState';
import { ATTENDANCE, CLUB_FILL_RATE } from '../engine/balance';
import { recentForm } from './teamStats';

// Derive a match attendance figure capped by the effective venue capacity.
// All inputs are read-only; no RNG — the figure is deterministic given the
// pre-match state, so it can be recomputed for display purposes (PreMatchScreen)
// and stored for replay (FixtureResult.attendance).
// `fanSentiment` is the optional 0–100 per-season fan-sentiment meter;
// absent or undefined → treated as 50 (neutral, ×1.0 multiplier).
export function computeAttendance(
  fixture: Fixture,
  homeCapacity: number,
  standings: TeamStanding[],
  results: FixtureResult[],
  fanSentiment?: number,
): number {
  const capacity = fixture.venueCapacity ?? homeCapacity;
  if (!capacity) return 0;

  const base = CLUB_FILL_RATE[fixture.homeId] ?? 0.75;

  // Derby badge on the fixture already encodes the scheduled rivalry rounds.
  const derbyDelta = fixture.isDerby ? ATTENDANCE.derbyBonus : 0;

  // Fixture significance from current standings.
  const homePos = standings.findIndex(s => s.teamId === fixture.homeId) + 1;
  const awayPos = standings.findIndex(s => s.teamId === fixture.awayId) + 1;
  let significanceDelta = 0;
  if (homePos > 0 && awayPos > 0) {
    if (homePos <= 4 && awayPos <= 4) {
      significanceDelta = ATTENDANCE.top4Bonus;
    } else if (Math.abs(homePos - awayPos) <= 3) {
      significanceDelta = ATTENDANCE.closeStandingsBonus;
    }
  }

  // Home team's recent form.
  const form = recentForm(fixture.homeId, results, 5);
  const wins = form.filter(f => f === 'W').length;
  const losses = form.filter(f => f === 'L').length;
  const formDelta = wins >= 4
    ? ATTENDANCE.goodFormBonus
    : losses >= 4
      ? ATTENDANCE.poorFormPenalty
      : 0;

  // Round-of-season flavour.
  const roundDelta = fixture.round <= 3
    ? ATTENDANCE.earlyRoundBonus
    : fixture.round >= 15
      ? ATTENDANCE.lateRoundBonus
      : 0;

  const fillRate = Math.min(1, Math.max(
    ATTENDANCE.minFillRate,
    base + derbyDelta + significanceDelta + formDelta + roundDelta,
  ));

  // Fan-sentiment multiplier: 0.9 + sentiment/500, so 50 → ×1.0, 100 → ×1.1, 0 → ×0.9.
  const sentiment = fanSentiment ?? 50;
  const sentimentMultiplier = 0.9 + sentiment / 500;

  return Math.round(capacity * fillRate * sentimentMultiplier);
}
