// Morale builders shared by the match-result tick and the playoff tick. Pure
// "read state → return SeasonEvent[]" functions (the caller applies them through
// applySeasonEvent), parameterised by GameState so multiple season
// sub-coordinators can reuse them without a common `this`. Extracted verbatim
// from GameCoordinator — behaviour-preserving, RNG-free.

import type { FixtureResult, GameState, SeasonEvent } from '../types/gameState';
import type { MoraleReason } from '../types/player';
import type { MatchSnapshot } from './seasonStatsCollector';
import { MORALE, SQUAD_STATUS_OMIT_PENALTY } from '../engine/balance';
import { resolveSquadStatus } from './squadStatus';

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

    for (const rid of club.squad) {
      const p = state.career.roster[rid];
      if (!p || p.injury || p.loanOut) continue;
      let delta = resultDelta;
      let moraleReason: MoraleReason | undefined;

      if (!played.has(rid)) {
        const status = resolveSquadStatus(p, club.squad, state.career.roster);
        const omitDelta = SQUAD_STATUS_OMIT_PENALTY[status];
        if (omitDelta !== 0) { delta += omitDelta; moraleReason = 'playing_time'; }
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
