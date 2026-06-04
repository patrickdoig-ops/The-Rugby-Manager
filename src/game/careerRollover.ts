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

import type { ArchivedPlayerSeason, Fixture, GameState, SeasonEvent, TeamStanding } from '../types/gameState';
import type { Player, PlayerStats, PlayerSeasonStats } from '../types/player';
import { isForward, PLAYER_STAT_KEYS } from '../types/player';
import type { SeasonAwards, SeasonLeader } from '../types/gameState';
import { AGE_CURVES, STAT_NOISE, RETIREMENT_CURVE, SEASON_AWARDS, ACADEMY_SUPPLY, IMPORT_SUPPLY, REPUTATION_OVR_NUDGE, proximityMultiplier, appearancesMultiplier } from '../engine/balance/career';
import { playerOverall } from '../engine/RatingEngine';
import { SEASON_VALUES } from '../engine/balance';
import { getAge, parseSeasonStartYear, seasonOpenIso } from './age';
import { generateFixtures } from './fixtures';
import { rngTransferRaw, rngTransfer } from '../utils/rng';
import { generatePersona } from './personaGenerator';
import { redrawCupPools, buildCupSeed } from './cupScheduler';
import { generateStaffPool } from './staffPoolGenerator';

export function computeRollover(state: GameState, allTeamIds: string[]): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  const currentSeasonStartYear = parseSeasonStartYear(state.calendar.seasonLabel);
  const newSeasonStartYear = currentSeasonStartYear + 1;

  // 0. Activate pre-agreed cross-club moves (Phase 6, Reg 7). Sorted by
  // rosterId so the event order is stable across runs. Each TRANSFER_ACTIVATED
  // atomically moves the player from old squad to new without touching
  // freeAgents — the player goes straight to their new club ahead of
  // any aging / retirement pass for the new season.
  const sortedMoves = [...state.career.pendingMoves].sort((a, b) => a.rosterId - b.rosterId);
  for (const move of sortedMoves) {
    events.push({
      type: 'TRANSFER_ACTIVATED',
      rosterId: move.rosterId,
      fromClubId: move.fromClubId,
      toClubId: move.toClubId,
      annualWage: move.annualWage,
      expiresOn: `${newSeasonStartYear + move.lengthYears - 1}-06-30`,
    });
  }

  // 1 + 2. Per-player aging + retirement. Iterate roster in stable
  // numeric-ascending order so the rngTransfer call sequence is
  // deterministic across runs.
  const rosterIds = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = state.career.roster[rid];
    if (!p.dob) continue;
    const ageInNewSeason = getAge(p.dob, seasonOpenIso(newSeasonStartYear)) ?? 0;

    const deltas = developStats(p, ageInNewSeason);
    const currentOvr = playerOverall(p.baseStats, p.position);
    const reputationNudge = Math.round((currentOvr - p.reputation) * REPUTATION_OVR_NUDGE);
    if (Object.keys(deltas).length > 0 || reputationNudge !== 0) {
      events.push({
        type: 'PLAYER_AGED',
        rosterId: rid,
        statDeltas: deltas,
        ...(reputationNudge !== 0 && { reputationNudge }),
      });
    }

    if (shouldRetire(p, ageInNewSeason)) {
      // A free agent is on no club squad. Previously this branch only emitted
      // for squad members, so free agents never retired — they kept aging
      // forever, bloating the FA pool with unsignable 35+yo "zombies" across
      // seasons. Emit for both: clubId '' marks a free-agent retirement (the
      // reducer skips the squad-removal step and drops them from freeAgents).
      const club = state.career.clubs.find(c => c.squad.includes(rid));
      events.push({ type: 'PLAYER_RETIRED', rosterId: rid, clubId: club?.id ?? '' });
    }
  }

  // 3. Phase 7 supply pipeline. Allocate fresh rosterIds for academy
  // graduates + foreign imports. Stable iteration order (clubs alpha,
  // then per-club graduate count, then imports) so the rngTransfer
  // sequence is deterministic. Each generatePersona call advances
  // rngTransfer several times (nationality, name, position, dob,
  // stats × 12) — locking the order is what keeps the harness
  // reproducible.
  let nextRid = state.career.nextRosterId;
  const calendarAnchor = seasonOpenIso(newSeasonStartYear);

  // Academy: per club, in stable id-ascending order.
  const sortedClubs = [...state.career.clubs].sort((a, b) => a.id.localeCompare(b.id));
  for (const club of sortedClubs) {
    const grads = rngTransfer(ACADEMY_SUPPLY.gradsPerClub.min, ACADEMY_SUPPLY.gradsPerClub.max);
    for (let i = 0; i < grads; i++) {
      const player = generatePersona(
        { rosterId: nextRid, clubId: club.id, ageBand: ACADEMY_SUPPLY.ageBand, ratingBand: ACADEMY_SUPPLY.ratingBand },
        calendarAnchor,
      );
      events.push({ type: 'ACADEMY_GRADUATED', clubId: club.id, player });
      nextRid += 1;
    }
  }

  // Foreign imports — single batch into the free-agent pool. Phase 5
  // signing flow consumes them at the next open signing window.
  const imports = rngTransfer(IMPORT_SUPPLY.perRollover.min, IMPORT_SUPPLY.perRollover.max);
  for (let i = 0; i < imports; i++) {
    const player = generatePersona(
      { rosterId: nextRid, ageBand: IMPORT_SUPPLY.ageBand, ratingBand: IMPORT_SUPPLY.ratingBand },
      calendarAnchor,
    );
    events.push({ type: 'FOREIGN_IMPORT_ARRIVED', player });
    nextRid += 1;
  }

  // 4. Awards + season-rollover composite.
  const leaders = computeAwards(state);
  const topScorerRosterId = leaders.topTries[0]?.rosterId ?? null;
  const mvpRosterId       = leaders.topRating[0]?.rosterId ?? null;
  const newSeasonLabel = `${newSeasonStartYear}/${(newSeasonStartYear + 1).toString().slice(2)} Season`;
  const newFixtures = dateRounds(
    generateFixtures(state.player.teamId, allTeamIds, { seasonsCompleted: state.career.seasonsCompleted }),
    newSeasonStartYear,
  );
  const archivedStandings: TeamStanding[] = state.league.standings.map(s => ({ ...s }));
  const championTeamId = state.league.playoffs?.championTeamId ?? null;
  const premCupChampionTeamId = state.league.premCup?.knockout?.championTeamId ?? null;
  const playerSeasonHistory = snapshotPlayerHistory(state);

  events.push({
    type: 'SEASON_ROLLED_OVER',
    newSeasonLabel,
    newFixtures,
    archivedStandings,
    topScorerRosterId,
    mvpRosterId,
    championTeamId,
    premCupChampionTeamId,
    leaders,
    playerSeasonHistory,
  });

  // Staff pool for the coming season. Carries forward any already-hired staff
  // (clubId != null) and replaces the free pool with a freshly generated set.
  // MUST come before redrawCupPools — cup draws stay last.
  const existingHired = (state.career.staff ?? []).filter(m => m.clubId !== null);
  const { staff: freshPool, nextStaffId } = generateStaffPool(state.career.nextStaffId ?? 1);
  events.push({ type: 'STAFF_POOL_SEEDED', staff: [...existingHired, ...freshPool], nextStaffId });

  // Seed next season's Prem Cup with redrawn pools. redrawCupPools is the
  // ONLY rngTransfer consumer here and MUST stay last in the rollover so it
  // can't shift any prior draw (aging / retirements / academy / imports).
  // Applied after SEASON_ROLLED_OVER, which has already cleared premCup and
  // installed newFixtures (used to date the cup inside the break gaps).
  const redrawn = redrawCupPools(allTeamIds);
  events.push({ type: 'PREM_CUP_SEEDED', ...buildCupSeed(redrawn, newFixtures, newSeasonLabel) });

  return events;
}

// Per-player season snapshot captured before SEASON_ROLLED_OVER zeroes
// state.career.roster[*].seasonStats. Skips players with no appearances
// to keep the payload tight (a 480-player league has many wider-squad
// players who never see the pitch). Iterates rosterId-ascending so the
// JSON serialisation order is stable for save-roundtrip determinism.
function snapshotPlayerHistory(state: GameState): Record<number, ArchivedPlayerSeason> {
  const out: Record<number, ArchivedPlayerSeason> = {};
  const rosterIds = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = state.career.roster[rid];
    const s = p.seasonStats;
    if (s.appearances === 0) continue;
    out[rid] = {
      clubId: p.contract.clubId,
      apps: s.appearances,
      ratingSum: s.ratingSum,
      tries: s.tries,
      carries: s.carries,
      metresCarried: s.metresCarried,
      lineBreaks: s.lineBreaks,
      tackles: s.tackles,
      turnoversWon: s.turnoversWon,
      kicksMade: s.kicksMade,
      kicksAtGoal: s.kicksAtGoal,
      yellowCards: s.yellowCards,
      redCards: s.redCards,
    };
  }
  return out;
}

// --- Stat development ---

function developStats(p: Player, ageInNewSeason: number): Partial<PlayerStats> {
  const deltas: Partial<PlayerStats> = {};
  const ovr = playerOverall(p.baseStats, p.position);
  const proxMul = proximityMultiplier(p.potential, ovr);
  const appsMul = appearancesMultiplier(p.seasonStats.appearances);
  for (const k of PLAYER_STAT_KEYS) {
    const curve = AGE_CURVES[k];
    const isGrowth = ageInNewSeason < curve.peakAge;
    const base = isGrowth ? curve.growthPerYear : -curve.declinePerYear;
    // Growth is modulated by proximity to ceiling and match experience.
    // Decline fires at full rate regardless of either.
    const scaledBase = isGrowth ? base * proxMul * appsMul : base;
    const noise = clampedNormal(STAT_NOISE.stddev, STAT_NOISE.clamp);
    const delta = Math.round(scaledBase + noise);
    // Growing stats can't go negative — noise variance shouldn't reverse a
    // player who is genuinely still developing.
    const clamped = isGrowth ? Math.max(0, delta) : delta;
    if (clamped !== 0) deltas[k] = clamped;
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
  return isForward(pos) ? 'forwards' : 'backs';
}

// --- Awards ---

// Top-3 across the league per category, taken from each roster player's
// seasonStats *before* SEASON_ROLLED_OVER zeros them out. Order is by
// value desc; ties broken by ascending rosterId for deterministic
// replay-safe ordering. Players with zero value are excluded so the
// list shortens naturally if a season had thin scoring.
function computeAwards(state: GameState): SeasonAwards {
  const rosterIds = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);

  type Entry = { rosterId: number; value: number };

  const topByField = (
    pick: (s: PlayerSeasonStats) => number,
    options: { minAppearances?: number } = {},
  ): SeasonLeader[] => {
    const entries: Entry[] = [];
    const min = options.minAppearances ?? 0;
    for (const rid of rosterIds) {
      const s = state.career.roster[rid].seasonStats;
      if (s.appearances < min) continue;
      const value = pick(s);
      if (value <= 0) continue;
      entries.push({ rosterId: rid, value });
    }
    entries.sort((a, b) => b.value - a.value || a.rosterId - b.rosterId);
    return entries.slice(0, SEASON_AWARDS.leaderboardSize);
  };

  return {
    topTries:   topByField(s => s.tries),
    topCarries: topByField(s => s.carries),
    topTackles: topByField(s => s.tackles),
    topRating:  topByField(s => s.appearances > 0 ? s.ratingSum / s.appearances : 0,
                          { minAppearances: SEASON_AWARDS.mvpMinAppearances }),
  };
}

// Assigns weekly fixture dates starting on the season-open anchor of
// `startYear`, skipping the international windows. Sept-Oct + Dec-Jan
// + Mar-May = ~8 months at 1 round/week = ~32 round slots, comfortably
// more than the 18 rounds we need. Same date per round (all fixtures
// in a round share it). All calendar anchors live in SEASON_VALUES.
function dateRounds(fixtures: Fixture[], startYear: number): Fixture[] {
  const rounds = [...new Set(fixtures.map(f => f.round))].sort((a, b) => a - b);
  const dateByRound = new Map<number, string>();
  const cursor = new Date(Date.UTC(startYear, SEASON_VALUES.seasonOpenMonth, SEASON_VALUES.seasonOpenDay));
  const skipMonths = new Set<number>(SEASON_VALUES.internationalWindowMonths);
  for (const round of rounds) {
    while (skipMonths.has(cursor.getUTCMonth())) {
      cursor.setUTCDate(cursor.getUTCDate() + SEASON_VALUES.internationalSkipDays);
    }
    dateByRound.set(round, cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + SEASON_VALUES.weekLengthDays);
  }
  return fixtures.map(f => ({ ...f, date: dateByRound.get(f.round) }));
}
