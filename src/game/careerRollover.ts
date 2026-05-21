// Computes the SeasonEvent stream that rolls the league from one season
// to the next. Pure module — reads GameState, returns events. The caller
// (GameCoordinator.rollSeason) applies them via applySeasonEvent.
//
// Three stages, ordered:
//   1. Per-player stat development. Every rostered player ages by one
//      year; AGE_CURVES drives the expected per-stat delta, STAT_NOISE
//      adds Gaussian jitter via rngTransfer. Zero-delta players emit no
//      PLAYER_AGED event.
//   2. Per-player retirement check. Players whose age at the start of
//      the new season meets RETIREMENT_CURVE roll an rngTransfer check.
//      A retired player gets PLAYER_RETIRED (squad removal); the roster
//      entry itself is retained for archive references.
//   3. SEASON_ROLLED_OVER: archives current standings + awards, replaces
//      league.fixtures with a fresh circle-method round-robin, resets
//      results / standings / per-player seasonStats, sets the new season
//      label and calendar week=1.
//
// Awards: topScorerRosterId = max tries across the league (silent fixtures
// included via PLAYER_SEASON_STATS_ACCUMULATED). mvpRosterId = highest
// avg rating among players with >= SEASON_AWARDS.mvpMinAppearances apps.
//
// Fixture date synthesis: generateFixtures returns dateless fixtures.
// dateRounds assigns a weekly slot per round starting Sept 1 of the new
// year-end year, skipping November (autumn internationals) and February
// (Six Nations). Keeps the calendar feeling real without needing a
// hand-authored schedule for years 2+.

import type { Fixture, GameState, SeasonEvent, TeamStanding } from '../types/gameState';
import type { Player, PlayerStats } from '../types/player';
import { AGE_CURVES, STAT_NOISE, RETIREMENT_CURVE, SEASON_AWARDS } from '../engine/balance/career';
import { generateFixtures } from './fixtures';
import { rngTransferRaw } from '../utils/rng';

export function computeRollover(state: GameState, allTeamIds: string[]): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  const today = state.calendar.date;
  const currentSeasonStartYear = parseSeasonStartYear(state.calendar.seasonLabel);
  const newSeasonStartYear = currentSeasonStartYear + 1;

  // 1 + 2. Per-player aging + retirement. Iterate roster in stable
  // numeric-ascending order so the rngTransfer call sequence is
  // deterministic across runs.
  const rosterIds = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = state.career.roster[rid];
    if (!p.dob) continue;
    const ageInNewSeason = ageOnDate(p.dob, isoDate(newSeasonStartYear, 8, 1));

    const deltas = developStats(p, ageInNewSeason);
    if (Object.keys(deltas).length > 0) {
      events.push({ type: 'PLAYER_AGED', rosterId: rid, statDeltas: deltas });
    }

    if (shouldRetire(p, ageInNewSeason)) {
      const club = state.career.clubs.find(c => c.squad.includes(rid));
      if (club) {
        events.push({ type: 'PLAYER_RETIRED', rosterId: rid, clubId: club.id });
      }
    }
  }

  // 3. Awards + season-rollover composite.
  const { topScorerRosterId, mvpRosterId } = computeAwards(state);
  const newSeasonLabel = `${newSeasonStartYear}/${(newSeasonStartYear + 1).toString().slice(2)} Premiership`;
  const newFixtures = dateRounds(
    generateFixtures(state.player.teamId, allTeamIds),
    newSeasonStartYear,
  );
  const archivedStandings: TeamStanding[] = state.league.standings.map(s => ({ ...s }));

  events.push({
    type: 'SEASON_ROLLED_OVER',
    newSeasonLabel,
    newFixtures,
    archivedStandings,
    topScorerRosterId,
    mvpRosterId,
  });

  return events;
}

// --- Stat development ---

function developStats(p: Player, ageInNewSeason: number): Partial<PlayerStats> {
  const deltas: Partial<PlayerStats> = {};
  for (const k of Object.keys(p.baseStats) as (keyof PlayerStats)[]) {
    const curve = AGE_CURVES[k];
    const base = ageInNewSeason < curve.peakAge ? curve.growthPerYear : -curve.declinePerYear;
    const noise = clampedNormal(STAT_NOISE.stddev, STAT_NOISE.clamp);
    const delta = Math.round(base + noise);
    if (delta !== 0) deltas[k] = delta;
  }
  return deltas;
}

// Box-Muller single-sample → scale → clamp. Two rngTransfer calls per
// invocation; called once per stat per player per rollover.
function clampedNormal(stddev: number, clamp: number): number {
  let u1: number;
  do { u1 = rngTransferRaw(); } while (u1 === 0);
  const u2 = rngTransferRaw();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(-clamp, Math.min(clamp, z * stddev));
}

// --- Retirement ---

function shouldRetire(p: Player, ageInNewSeason: number): boolean {
  const cls = positionClass(p.position);
  const curve = RETIREMENT_CURVE[cls];
  let prob = 0;
  for (const entry of curve) {
    if (ageInNewSeason >= entry.age) prob = entry.prob;
  }
  if (prob === 0) return false;
  return rngTransferRaw() < prob;
}

function positionClass(pos: Player['position']): 'forwards' | 'backs' {
  const forwards: Player['position'][] = [
    'Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8', 'Back Row',
  ];
  return forwards.includes(pos) ? 'forwards' : 'backs';
}

// --- Awards ---

function computeAwards(state: GameState): { topScorerRosterId: number | null; mvpRosterId: number | null } {
  let topScorerRosterId: number | null = null;
  let mostTries = 0;
  let mvpRosterId: number | null = null;
  let bestAvg = -1;
  const rosterIds = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = state.career.roster[rid];
    const s = p.seasonStats;
    if (s.tries > mostTries) {
      mostTries = s.tries;
      topScorerRosterId = rid;
    }
    if (s.appearances >= SEASON_AWARDS.mvpMinAppearances) {
      const avg = s.ratingSum / s.appearances;
      if (avg > bestAvg) {
        bestAvg = avg;
        mvpRosterId = rid;
      }
    }
  }
  return { topScorerRosterId, mvpRosterId };
}

// --- Date helpers ---

function ageOnDate(dobIso: string, onIso: string): number {
  const dob = new Date(dobIso);
  const on = new Date(onIso);
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

function isoDate(year: number, monthIdx: number, day: number): string {
  return new Date(Date.UTC(year, monthIdx, day)).toISOString().slice(0, 10);
}

// Assign weekly fixture dates starting Sept 1 of `startYear`, skipping
// November and February. Sept-Oct + Dec-Jan + Mar-May = ~8 months at 1
// round/week = ~32 round slots, comfortably more than the 18 rounds we
// need. Same date per round (all fixtures in a round share it).
function parseSeasonStartYear(label: string): number {
  // "2025/26 Premiership" → 2025
  const m = label.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : new Date().getUTCFullYear();
}

function dateRounds(fixtures: Fixture[], startYear: number): Fixture[] {
  const rounds = [...new Set(fixtures.map(f => f.round))].sort((a, b) => a - b);
  const dateByRound = new Map<number, string>();
  const cursor = new Date(Date.UTC(startYear, 8, 1));  // Sept 1
  for (const round of rounds) {
    while (cursor.getUTCMonth() === 10 || cursor.getUTCMonth() === 1) {
      // Skip November (10) and February (1) — international windows.
      cursor.setUTCDate(cursor.getUTCDate() + 28);
    }
    dateByRound.set(round, cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return fixtures.map(f => ({ ...f, date: dateByRound.get(f.round) }));
}
