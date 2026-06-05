// Morale builders shared by the match-result tick and the playoff tick. Pure
// "read state → return SeasonEvent[]" functions (the caller applies them through
// applySeasonEvent), parameterised by GameState so multiple season
// sub-coordinators can reuse them without a common `this`. Extracted verbatim
// from GameCoordinator — behaviour-preserving, RNG-free.

import type { FixtureResult, GameState, SeasonEvent } from '../types/gameState';
import type { MoraleReason } from '../types/player';
import type { MatchSnapshot } from './seasonStatsCollector';
import { playerOverall } from '../engine/RatingEngine';
import { MORALE } from '../engine/balance';

// Computes PLAYER_MORALE_ADJUSTED events for all players in both clubs
// after a fixture: playing-time (top-OVR players who didn't appear),
// match result (win/loss nudge for all squad members), and individual
// standout (rating ≥ threshold). Pure — no state mutations.
export function computeFixtureMoraleEvents(state: GameState, result: FixtureResult, snapshot: MatchSnapshot): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  const played = new Set(snapshot.playerSnapshots.map(s => s.rosterId));
  const standoutSet = new Set(
    snapshot.playerSnapshots
      .filter(s => s.rating >= MORALE.standoutRatingThreshold)
      .map(s => s.rosterId),
  );

  for (const side of ['home', 'away'] as const) {
    const teamId = side === 'home' ? result.homeId : result.awayId;
    const club = state.career.clubs.find(c => c.id === teamId);
    if (!club) continue;

    const won = result.homeScore > result.awayScore
      ? result.homeId
      : result.awayScore > result.homeScore
        ? result.awayId
        : null; // draw
    const resultDelta = teamId === won
      ? MORALE.winDelta
      : won === null ? MORALE.drawDelta : MORALE.lossDelta;

    // Rank non-injured players by OVR descending to determine PT expectation.
    const ranked = club.squad
      .map(rid => state.career.roster[rid])
      .filter((p): p is NonNullable<typeof p> => !!p && !p.injury)
      .sort((a, b) => playerOverall(b.baseStats, b.position) - playerOverall(a.baseStats, a.position));

    for (let i = 0; i < ranked.length; i++) {
      const p = ranked[i];
      const rid = p.rosterId;
      let delta = resultDelta;
      let moraleReason: MoraleReason | undefined;

      if (!played.has(rid)) {
        // Playing-time penalty: top-15 OVR expected to play; 16-23 as bench cover.
        if (i < 15) { delta += MORALE.omittedTopDelta; moraleReason = 'playing_time'; }
        else if (i < 23) { delta += MORALE.benchedUnusedDelta; moraleReason = 'unused_bench'; }
      }

      if (standoutSet.has(rid)) delta += MORALE.standoutDelta;

      // Net-negative result with no playing-time issue: blame the bad run.
      if (delta < 0 && !moraleReason) moraleReason = 'bad_run';

      if (delta !== 0) {
        events.push({ type: 'PLAYER_MORALE_ADJUSTED', rosterId: rid, delta, reason: 'fixture', moraleReason });
      }
    }
  }
  return events;
}

// Computes PLAYER_MORALE_ADJUSTED decay events for all roster players,
// nudging morale toward MORALE.baseline each week. Rounds to the nearest
// integer; skips players already at baseline (delta rounds to 0).
export function computeMoraleDecayEvents(state: GameState): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  const freeAgentSet = new Set(state.career.freeAgents);
  for (const key of Object.keys(state.career.roster)) {
    const rid = Number(key);
    if (freeAgentSet.has(rid)) continue;
    const p = state.career.roster[rid];
    const current = p.morale ?? MORALE.baseline;
    const rawDelta = (MORALE.baseline - current) * MORALE.decayRate;
    const delta = Math.round(rawDelta);
    if (delta === 0) continue;
    events.push({ type: 'PLAYER_MORALE_ADJUSTED', rosterId: p.rosterId, delta, reason: 'decay' });
  }
  return events;
}
