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
import { AGE_CURVES, STAT_NOISE, RETIREMENT_CURVE, SEASON_AWARDS, ACADEMY_SUPPLY, IMPORT_SUPPLY, REPUTATION_OVR_NUDGE, MIN_SQUAD_SIZE, proximityMultiplier, appearancesMultiplier } from '../engine/balance/career';
import { playerOverall } from '../engine/RatingEngine';
import { SEASON_VALUES } from '../engine/balance';
import { getAge, parseSeasonStartYear, seasonOpenIso } from './age';
import { generateFixtures } from './fixtures';
import { rngTransferRaw, rngTransfer } from '../utils/rng';
import { generatePersona } from './personaGenerator';
import { redrawCupPools, buildCupSeed } from './cupScheduler';
import { buildYear2EuropeanSeed } from './europeanScheduler';
import { generateStaffPool } from './staffPoolGenerator';
import { sortStandings } from './leagueTable';
import { positionGroup, neediestPosition, emptyGroupCounts, type PositionGroup } from './squadComposition';

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
      expiresOn: `${newSeasonStartYear + move.lengthYears}-06-30`,
    });
  }

  // 1 + 2. Per-player aging + retirement. Iterate roster in stable
  // numeric-ascending order so the rngTransfer call sequence is
  // deterministic across runs.
  const rosterIds = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = state.career.roster[rid];
    if (!p.dob || p.retired) continue;
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

  // Per-club projected position-group counts (current squad minus this
  // rollover's retirements / out-moves, plus in-moves). Academy intake targets
  // the biggest per-position shortfall vs POSITION_FLOORS so the scarce
  // specialist positions (Lock / Prop / Hooker / SH / FH) don't starve under
  // uniform-random generation while the three-label back row bloats.
  const posCountByClub = new Map<string, Record<PositionGroup, number>>();
  for (const club of state.career.clubs) {
    const counts = emptyGroupCounts();
    for (const rid of club.squad) {
      const g = positionGroup(state.career.roster[rid]?.position ?? '');
      if (g !== 'Other') counts[g]++;
    }
    posCountByClub.set(club.id, counts);
  }
  for (const e of events) {
    if (e.type === 'PLAYER_RETIRED' && e.clubId) {
      const g = positionGroup(state.career.roster[e.rosterId]?.position ?? '');
      const c = posCountByClub.get(e.clubId);
      if (c && g !== 'Other') c[g] = Math.max(0, c[g] - 1);
    } else if (e.type === 'TRANSFER_ACTIVATED') {
      const g = positionGroup(state.career.roster[e.rosterId]?.position ?? '');
      if (g !== 'Other') {
        const from = posCountByClub.get(e.fromClubId); if (from) from[g] = Math.max(0, from[g] - 1);
        const to = posCountByClub.get(e.toClubId); if (to) to[g] += 1;
      }
    }
  }

  // Academy: per club, in stable id-ascending order. Each graduate is generated
  // into the club's neediest position (null → leave the random roll) so intake
  // closes per-position gaps. The random position roll is consumed regardless,
  // so the rngTransfer stream offset is unchanged.
  const sortedClubs = [...state.career.clubs].sort((a, b) => a.id.localeCompare(b.id));
  for (const club of sortedClubs) {
    const grads = rngTransfer(ACADEMY_SUPPLY.gradsPerClub.min, ACADEMY_SUPPLY.gradsPerClub.max);
    const counts = posCountByClub.get(club.id) ?? emptyGroupCounts();
    for (let i = 0; i < grads; i++) {
      const targetPos = neediestPosition(counts);
      const player = generatePersona(
        { rosterId: nextRid, clubId: club.id, ageBand: ACADEMY_SUPPLY.ageBand, ratingBand: ACADEMY_SUPPLY.ratingBand,
          ...(targetPos ? { position: targetPos } : {}) },
        calendarAnchor,
      );
      events.push({ type: 'ACADEMY_GRADUATED', clubId: club.id, player });
      const g = positionGroup(player.position);
      if (g !== 'Other') counts[g] += 1;
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

  // 3b. Squad-size floor. Project each club's post-rollover squad size from the
  // events already queued (this rollover's retirements, pre-agreed moves, and
  // the academy intake above) plus the loan-in players that SEASON_ROLLED_OVER
  // releases — then top up any club below MIN_SQUAD_SIZE with extra academy
  // graduates so no club starts the new season unable to field a 23. Runs after
  // the regular intake, in the same stable alpha club order, so the rngTransfer
  // sequence stays deterministic. A no-op for healthy squads (no RNG consumed).
  const projected = new Map<string, number>();
  for (const club of state.career.clubs) {
    const loanInCount = club.squad.reduce((n, rid) => n + (state.career.roster[rid]?.loanIn ? 1 : 0), 0);
    projected.set(club.id, club.squad.length - loanInCount);
  }
  for (const e of events) {
    if (e.type === 'TRANSFER_ACTIVATED') {
      projected.set(e.fromClubId, (projected.get(e.fromClubId) ?? 0) - 1);
      projected.set(e.toClubId, (projected.get(e.toClubId) ?? 0) + 1);
    } else if (e.type === 'PLAYER_RETIRED' && e.clubId) {
      projected.set(e.clubId, (projected.get(e.clubId) ?? 0) - 1);
    } else if (e.type === 'ACADEMY_GRADUATED') {
      projected.set(e.clubId, (projected.get(e.clubId) ?? 0) + 1);
    }
  }
  for (const club of sortedClubs) {
    let size = projected.get(club.id) ?? 0;
    const counts = posCountByClub.get(club.id) ?? emptyGroupCounts();
    while (size < MIN_SQUAD_SIZE) {
      const targetPos = neediestPosition(counts);
      const player = generatePersona(
        { rosterId: nextRid, clubId: club.id, ageBand: ACADEMY_SUPPLY.ageBand, ratingBand: ACADEMY_SUPPLY.ratingBand,
          ...(targetPos ? { position: targetPos } : {}) },
        calendarAnchor,
      );
      events.push({ type: 'ACADEMY_GRADUATED', clubId: club.id, player });
      const g = positionGroup(player.position);
      if (g !== 'Other') counts[g] += 1;
      nextRid += 1;
      size += 1;
    }
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
  // Capture English European qualifiers BEFORE SEASON_ROLLED_OVER zeros standings.
  const sortedForEuro = sortStandings([...state.league.standings]);
  const englishCupTeams   = sortedForEuro.slice(0, 8).map(s => s.teamId);
  const englishShieldTeams = sortedForEuro.slice(8, 10).map(s => s.teamId);

  const archivedStandings: TeamStanding[] = state.league.standings.map(s => ({ ...s }));
  const championTeamId = state.league.playoffs?.championTeamId ?? null;
  const premCupChampionTeamId = state.league.premCup?.knockout?.championTeamId ?? null;
  const europeanCupChampionTeamId = state.league.europeanCup?.knockout?.championTeamId ?? null;
  const europeanShieldChampionTeamId = state.league.europeanShield?.knockout?.championTeamId ?? null;
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
    europeanCupChampionTeamId,
    europeanShieldChampionTeamId,
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

  // Seed next season's European competitions. Uses dynamic pool draw from
  // standings captured above. Must follow redrawCupPools so the rngTransfer
  // stream shift from the Prem Cup draw doesn't disturb the European draw order.
  events.push({
    type: 'EUROPEAN_COMP_SEEDED',
    ...buildYear2EuropeanSeed(englishCupTeams, englishShieldTeams, newSeasonStartYear, 'europeanCup'),
  });
  events.push({
    type: 'EUROPEAN_COMP_SEEDED',
    ...buildYear2EuropeanSeed(englishCupTeams, englishShieldTeams, newSeasonStartYear, 'europeanShield'),
  });

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
