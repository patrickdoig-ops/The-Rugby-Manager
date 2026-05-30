// Per-match → per-season stats roll-up. Run by GameCoordinator after every
// fixture (player and silent AI). Produces:
//   - one PLAYER_SEASON_STATS_ACCUMULATED SeasonEvent per player who took the
//     field, accumulated into state.career.roster[rosterId].seasonStats.
//   - two TEAM_SEASON_STATS_ACCUMULATED events (one per side), accumulated
//     into state.league.teamSeasonStats[teamId].
//
// Players with rosterId === 0 (non-career match contexts like
// checkDeterminism's single-match harness) are skipped — they have no
// roster entry to update. Team summaries fire regardless so the wider
// telemetry surface stays consistent.

import type { MatchState } from '../types/match';
import type { InjuryKind, Player, PlayerMatchStats } from '../types/player';
import type { SeasonEvent, TeamSeasonStats } from '../types/gameState';

export interface PlayerStatsSnapshot {
  rosterId: number;
  // Full per-match stat sheet snapshotted before engine.destroy(). Carrying
  // the whole shape (instead of just leaderboard fields) keeps the snapshot
  // a 1:1 mirror of PlayerMatchStats — adding a new countable stat is a
  // single-field touch on PlayerMatchStats, no fanout here.
  matchStats: PlayerMatchStats;
  rating: number;
  // Final in-match fatigue, snapshotted before teardown. Persisted back to
  // the roster's `condition` field via PLAYER_CONDITION_UPDATED so the next
  // match starts at this level (instead of always at 100).
  finalFatiguePct: number;
  // In-match injury, if the player picked one up. Severity + weeks are
  // rolled later via rngTransfer inside GameCoordinator (career stream).
  // Undefined for the typical case where the player finishes fit.
  injuryKind?: InjuryKind;
}

// Full post-match roll-up. The team summaries are single-match deltas
// (not running season totals) — applySeasonEvent's TEAM_SEASON_STATS_ACCUMULATED
// branch adds them into the season aggregates.
export interface MatchSnapshot {
  homeTeamId: string;
  awayTeamId: string;
  playerSnapshots: PlayerStatsSnapshot[];
  homeSummary: TeamSeasonStats;
  awaySummary: TeamSeasonStats;
}

// Extract every player who took the field — starters who finished plus
// starters who got subbed off. (Bench players who came on are already in
// `team.players` post-substitution.)
export function snapshotMatch(state: MatchState, homeTeamId: string, awayTeamId: string): MatchSnapshot {
  const players: Player[] = [
    ...state.homeTeam.players,
    ...state.homeTeam.substitutedOff,
    ...state.awayTeam.players,
    ...state.awayTeam.substitutedOff,
  ];

  const playerSnapshots = players
    .filter(p => p.rosterId > 0)
    .map(p => ({
      rosterId: p.rosterId,
      matchStats: { ...p.matchStats },
      rating: p.rating,
      finalFatiguePct: p.fatiguePct,
      ...(p.pendingInjuryKind ? { injuryKind: p.pendingInjuryKind } : {}),
    }));

  return {
    homeTeamId,
    awayTeamId,
    playerSnapshots,
    homeSummary: deriveTeamSummary(state, 'home'),
    awaySummary: deriveTeamSummary(state, 'away'),
  };
}

// Build a single-match team aggregate from MatchState. Combines:
//   - state.stats (possession / territory / set-piece / entries / scoreboard
//     metrics tracked at team scope by applyMatchEvent)
//   - per-player matchStats sums (line breaks, carries, metres, defenders
//     beaten, kicks, cards — fields only tracked per-player)
// Mirrors the split in scripts/telemetry.ts::sumMatchStats so the two surfaces
// always quote the same numbers for the same fixture.
function deriveTeamSummary(state: MatchState, side: 'home' | 'away'): TeamSeasonStats {
  const team = side === 'home' ? state.homeTeam : state.awayTeam;
  const players = [...team.players, ...team.substitutedOff];
  const sum = (pick: (m: PlayerMatchStats) => number): number =>
    players.reduce((acc, p) => acc + pick(p.matchStats), 0);

  const possessionSeconds = state.stats.possession[side];
  const matchSeconds = state.stats.possession.home + state.stats.possession.away;

  return {
    matchesPlayed:     1,
    possessionSeconds,
    territorySeconds:  state.stats.territory[side],
    matchSeconds,
    tries:             state.stats.tries[side],
    lineBreaks:        sum(m => m.lineBreaks),
    defendersBeaten:   sum(m => m.defendersBeaten),
    offloadsCompleted: sum(m => m.offloadsCompleted),
    carries:           sum(m => m.carries),
    metresCarried:     sum(m => m.metresCarried),
    tacklesAttempted:  state.stats.tackles[side].attempted,
    tacklesMade:       state.stats.tackles[side].made,
    turnoversWon:      sum(m => m.turnoversWon),
    kicksFromHand:     sum(m => m.kicksFromHand),
    kickMetres:        sum(m => m.kickMetres),
    lineoutsThrown:    state.stats.ownLineouts[side].thrown,
    lineoutsWon:       state.stats.ownLineouts[side].won,
    scrumsPutIn:       state.stats.ownScrums[side].putIn,
    scrumsWon:         state.stats.ownScrums[side].won,
    entries22:         state.stats.entries22[side].count,
    entries22Points:   state.stats.entries22[side].pointsScored,
    knockOns:          state.stats.handlingErrors[side],
    yellowCards:       sum(m => m.yellowCards),
    redCards:          sum(m => m.redCards),
  };
}

export function collectSeasonEvents(snap: MatchSnapshot): SeasonEvent[] {
  const events: SeasonEvent[] = snap.playerSnapshots.map(s => {
    const m = s.matchStats;
    return {
      type: 'PLAYER_SEASON_STATS_ACCUMULATED',
      rosterId: s.rosterId,
      statsDelta: {
        appearances:            1,
        tries:                  m.tries,
        carries:                m.carries,
        metresCarried:          m.metresCarried,
        lineBreaks:             m.lineBreaks,
        defendersBeaten:        m.defendersBeaten,
        offloadsCompleted:      m.offloadsCompleted,
        passes:                 m.passes,
        conversions:            m.conversionsMade,
        penaltiesScored:        m.penaltiesMade,
        dropGoals:              0,
        kicksFromHand:          m.kicksFromHand,
        kickMetres:             m.kickMetres,
        kicksAtGoal:            m.kicksAtGoal,
        kicksMade:              m.kicksMade,
        tackles:                m.tacklesMade,
        missedTackles:          Math.max(0, m.tacklesAttempted - m.tacklesMade),
        dominantTackles:        m.dominantTackles,
        turnoversWon:           m.turnoversWon,
        lineoutThrows:          m.lineoutThrows,
        lineoutWins:            m.lineoutWins,
        lineoutCatches:         m.lineoutCatches,
        lineoutSteals:          m.lineoutSteals,
        scrumPenaltiesWon:      m.scrumPenaltiesWon,
        scrumPenaltiesConceded: m.scrumPenaltiesConceded,
        rucksHit:               m.rucksHit,
        yellowCards:            m.yellowCards,
        redCards:               m.redCards,
        ratingSum:              s.rating,
      },
    };
  });

  events.push(
    { type: 'TEAM_SEASON_STATS_ACCUMULATED', teamId: snap.homeTeamId, statsDelta: { ...snap.homeSummary } },
    { type: 'TEAM_SEASON_STATS_ACCUMULATED', teamId: snap.awayTeamId, statsDelta: { ...snap.awaySummary } },
  );

  return events;
}

// Match-end snapshot of each player's final fatigue, persisted back to the
// roster as their inter-match condition. One event per player who took the
// field; bench players who never came on keep their accumulated condition
// (no event emitted for them). Same snapshot shape as collectSeasonEvents
// so the call site is symmetric.
export function collectConditionEvents(snap: MatchSnapshot): SeasonEvent[] {
  return snap.playerSnapshots.map(s => ({
    type: 'PLAYER_CONDITION_UPDATED' as const,
    rosterId: s.rosterId,
    condition: s.finalFatiguePct,
  }));
}
