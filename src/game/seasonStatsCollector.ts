// Per-match → per-season stats roll-up. Run by GameCoordinator after every
// fixture (player and silent AI). Produces one PLAYER_SEASON_STATS_ACCUMULATED
// SeasonEvent per player who took the field, with deltas that applySeasonEvent
// adds into state.career.roster[rosterId].seasonStats.
//
// Players with rosterId === 0 (non-career match contexts like
// checkDeterminism's single-match harness) are skipped — they have no roster
// entry to update.

import type { MatchState } from '../types/match';
import type { Player } from '../types/player';
import type { SeasonEvent } from '../types/gameState';

export interface PlayerStatsSnapshot {
  rosterId: number;
  // Final per-match stat sheet + finishing rating. Snapshotted before
  // engine.destroy() so the data survives MatchCoordinator teardown.
  tries: number;
  tacklesMade: number;
  tacklesAttempted: number;
  turnoversWon: number;
  rating: number;
}

// Extract every player who took the field — starters who finished plus
// starters who got subbed off. (Bench players who came on are already in
// `team.players` post-substitution.)
export function snapshotMatch(state: MatchState): PlayerStatsSnapshot[] {
  const all: Player[] = [
    ...state.homeTeam.players,
    ...state.homeTeam.substitutedOff,
    ...state.awayTeam.players,
    ...state.awayTeam.substitutedOff,
  ];
  return all
    .filter(p => p.rosterId > 0)
    .map(p => ({
      rosterId: p.rosterId,
      tries: p.matchStats.tries,
      tacklesMade: p.matchStats.tacklesMade,
      tacklesAttempted: p.matchStats.tacklesAttempted,
      turnoversWon: p.matchStats.turnoversWon,
      rating: p.rating,
    }));
}

export function collectSeasonEvents(snapshots: PlayerStatsSnapshot[]): SeasonEvent[] {
  return snapshots.map(s => ({
    type: 'PLAYER_SEASON_STATS_ACCUMULATED',
    rosterId: s.rosterId,
    statsDelta: {
      appearances:      1,
      tries:            s.tries,
      // Goal-kicking sub-categories aren't tracked separately in matchStats
      // today — kicksMade is the lumped total. Keep these at zero in v1;
      // top-scorer ranking uses tries, MVP uses ratingSum/appearances.
      conversions:      0,
      penaltiesScored:  0,
      dropGoals:        0,
      yellowCards:      0,
      redCards:         0,
      tackles:          s.tacklesMade,
      missedTackles:    Math.max(0, s.tacklesAttempted - s.tacklesMade),
      turnoversWon:     s.turnoversWon,
      ratingSum:        s.rating,
    },
  }));
}
