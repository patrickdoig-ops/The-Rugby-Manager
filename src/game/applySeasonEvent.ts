// Season-scope mutation seam. The only writer to GameState.
// Mirrors the convention of src/engine/applyMatchEvent.ts — every union
// variant has a single branch, and the exhaustive `default: const _: never`
// catches missing branches at compile time when SeasonEvent grows.

import type { Fixture, GameState, SeasonEvent, TeamSeasonStats, TeamStanding } from '../types/gameState';
import { zeroStanding, zeroTeamSeasonStats } from '../types/gameState';
import { zeroSeasonStats } from '../types/player';
import { LEAGUE_POINTS, SEASON_VALUES } from '../engine/balance';

export function applySeasonEvent(state: GameState, event: SeasonEvent): void {
  switch (event.type) {
    case 'SEASON_INITIALIZED': {
      state.player.teamId = event.playerTeamId;
      state.seed = event.seed >>> 0;
      state.calendar.week = 1;
      state.calendar.seasonLabel = event.schedule.seasonLabel;
      state.league.fixtures = event.schedule.fixtures.map(f => ({ ...f }));
      state.calendar.date = earliestDateForRound(state.league.fixtures, 1) ?? SEASON_VALUES.startDate;
      state.league.results = [];
      state.league.standings = event.teamIds.map(zeroStanding);
      state.league.teamSeasonStats = Object.fromEntries(event.teamIds.map(id => [id, zeroTeamSeasonStats()]));
      return;
    }
    case 'FIXTURE_RESULT_RECORDED': {
      state.league.results.push(event.result);
      const home = findOrCreate(state.league.standings, event.result.homeId);
      const away = findOrCreate(state.league.standings, event.result.awayId);
      const margin = event.result.homeScore - event.result.awayScore;
      applyToSide(home, event.result.homeScore, event.result.awayScore, margin);
      applyToSide(away, event.result.awayScore, event.result.homeScore, -margin);
      return;
    }
    case 'WEEK_ADVANCED': {
      state.calendar.week += 1;
      const nextRoundDate = earliestDateForRound(state.league.fixtures, state.calendar.week);
      state.calendar.date = nextRoundDate ?? addDays(state.calendar.date, SEASON_VALUES.weekLengthDays);
      return;
    }
    case 'PLAYER_TACTICS_SET': {
      state.player.tactics = { ...event.tactics };
      return;
    }
    case 'PLAYER_MATCHDAY_SQUAD_SET': {
      state.player.matchdaySquad = event.squad.map(r => ({ firstName: r.firstName, lastName: r.lastName }));
      return;
    }
    case 'ROSTER_SEEDED': {
      state.career.roster = event.roster;
      state.career.clubs = event.clubs.map(c => ({ id: c.id, squad: [...c.squad] }));
      state.career.nextRosterId = event.nextRosterId;
      return;
    }
    case 'PLAYER_SEASON_STATS_ACCUMULATED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      const s = p.seasonStats;
      const d = event.statsDelta;
      s.appearances            += d.appearances;
      s.tries                  += d.tries;
      s.carries                += d.carries;
      s.metresCarried          += d.metresCarried;
      s.lineBreaks             += d.lineBreaks;
      s.defendersBeaten        += d.defendersBeaten;
      s.passes                 += d.passes;
      s.conversions            += d.conversions;
      s.penaltiesScored        += d.penaltiesScored;
      s.dropGoals              += d.dropGoals;
      s.kicksFromHand          += d.kicksFromHand;
      s.kickMetres             += d.kickMetres;
      s.kicksAtGoal            += d.kicksAtGoal;
      s.kicksMade              += d.kicksMade;
      s.tackles                += d.tackles;
      s.missedTackles          += d.missedTackles;
      s.dominantTackles        += d.dominantTackles;
      s.turnoversWon           += d.turnoversWon;
      s.lineoutThrows          += d.lineoutThrows;
      s.lineoutWins            += d.lineoutWins;
      s.lineoutCatches         += d.lineoutCatches;
      s.lineoutSteals          += d.lineoutSteals;
      s.scrumPenaltiesWon      += d.scrumPenaltiesWon;
      s.scrumPenaltiesConceded += d.scrumPenaltiesConceded;
      s.rucksHit               += d.rucksHit;
      s.yellowCards            += d.yellowCards;
      s.redCards               += d.redCards;
      s.ratingSum              += d.ratingSum;
      return;
    }
    case 'TEAM_SEASON_STATS_ACCUMULATED': {
      const cur = state.league.teamSeasonStats[event.teamId] ?? zeroTeamSeasonStats();
      const d = event.statsDelta;
      const next: TeamSeasonStats = {
        matchesPlayed:     cur.matchesPlayed     + d.matchesPlayed,
        possessionSeconds: cur.possessionSeconds + d.possessionSeconds,
        territorySeconds:  cur.territorySeconds  + d.territorySeconds,
        matchSeconds:      cur.matchSeconds      + d.matchSeconds,
        tries:             cur.tries             + d.tries,
        lineBreaks:        cur.lineBreaks        + d.lineBreaks,
        defendersBeaten:   cur.defendersBeaten   + d.defendersBeaten,
        carries:           cur.carries           + d.carries,
        metresCarried:     cur.metresCarried     + d.metresCarried,
        tacklesAttempted:  cur.tacklesAttempted  + d.tacklesAttempted,
        tacklesMade:       cur.tacklesMade       + d.tacklesMade,
        turnoversWon:      cur.turnoversWon      + d.turnoversWon,
        kicksFromHand:     cur.kicksFromHand     + d.kicksFromHand,
        kickMetres:        cur.kickMetres        + d.kickMetres,
        lineoutsThrown:    cur.lineoutsThrown    + d.lineoutsThrown,
        lineoutsWon:       cur.lineoutsWon       + d.lineoutsWon,
        scrumsPutIn:       cur.scrumsPutIn       + d.scrumsPutIn,
        scrumsWon:         cur.scrumsWon         + d.scrumsWon,
        entries22:         cur.entries22         + d.entries22,
        entries22Points:   cur.entries22Points   + d.entries22Points,
        knockOns:          cur.knockOns          + d.knockOns,
        yellowCards:       cur.yellowCards       + d.yellowCards,
        redCards:          cur.redCards          + d.redCards,
      };
      state.league.teamSeasonStats[event.teamId] = next;
      return;
    }
    case 'PLAYER_AGED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      for (const [stat, delta] of Object.entries(event.statDeltas)) {
        if (delta === undefined) continue;
        const k = stat as keyof typeof p.baseStats;
        p.baseStats[k] = Math.max(1, Math.min(99, p.baseStats[k] + delta));
      }
      return;
    }
    case 'PLAYER_RETIRED': {
      const club = state.career.clubs.find(c => c.id === event.clubId);
      if (club) club.squad = club.squad.filter(id => id !== event.rosterId);
      return;
    }
    case 'PLAYER_INJURED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.injury = {
        kind: event.kind,
        severity: event.severity,
        weeksRemaining: event.weeksRemaining,
        injuredOn: event.injuredOn,
        isRecurrence: event.isRecurrence,
      };
      return;
    }
    case 'INJURY_TICK_ADVANCED': {
      const p = state.career.roster[event.rosterId];
      if (!p || !p.injury) return;
      p.injury.weeksRemaining = Math.max(0, p.injury.weeksRemaining - 1);
      return;
    }
    case 'PLAYER_RECOVERED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.injury = undefined;
      return;
    }
    case 'MARQUEE_DESIGNATED': {
      const club = state.career.clubs.find(c => c.id === event.clubId);
      if (!club) return;
      // Clear any existing marquee in this club's squad first.
      for (const rid of club.squad) {
        const p = state.career.roster[rid];
        if (p && p.contract.isMarquee) p.contract.isMarquee = false;
      }
      // Designate the new marquee, if one was specified and the player
      // is actually in this club's squad.
      if (event.rosterId !== null) {
        const target = state.career.roster[event.rosterId];
        if (target && club.squad.includes(event.rosterId)) {
          target.contract.isMarquee = true;
        }
      }
      return;
    }
    case 'MARKET_OPENED': {
      state.career.market = {
        phase: event.phase,
        openedAfterSeason: state.calendar.seasonLabel,
        expiringRosterIds: [...event.expiringRosterIds],
        offers: event.offers.map(o => ({ ...o })),
      };
      return;
    }
    case 'MARKET_CLOSED': {
      state.career.market = null;
      return;
    }
    case 'OFFER_SENT': {
      if (!state.career.market) return;
      // Defensive: ignore duplicate IDs so OFFER_SENT is idempotent.
      const existing = state.career.market.offers.find(o => o.id === event.offer.id);
      if (existing) return;
      state.career.market.offers.push({ ...event.offer });
      return;
    }
    case 'OFFER_RESPONDED': {
      if (!state.career.market) return;
      const o = state.career.market.offers.find(x => x.id === event.offerId);
      if (!o) return;
      o.status = event.accept ? 'accepted' : 'rejected';
      if (!event.accept && event.reason) o.rejectionReason = event.reason;
      return;
    }
    case 'CONTRACT_EXTENDED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.contract = {
        ...p.contract,
        expiresOn: event.newExpiresOn,
        annualWage: event.newAnnualWage,
      };
      return;
    }
    case 'CONTRACT_TERMINATED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      const club = state.career.clubs.find(c => c.id === p.contract.clubId);
      if (club) club.squad = club.squad.filter(id => id !== event.rosterId);
      // Marquees clear their flag on departure — slot is now free for
      // the club to re-designate.
      if (p.contract.isMarquee) p.contract.isMarquee = false;
      if (event.reason !== 'retired') {
        if (!state.career.freeAgents.includes(event.rosterId)) {
          state.career.freeAgents.push(event.rosterId);
        }
      }
      // Player's club affiliation is cleared on the contract so
      // downstream lookups don't show them attached to their former
      // squad. They'll be re-bound on CONTRACT_SIGNED.
      p.contract = { ...p.contract, clubId: '' };
      return;
    }
    case 'CONTRACT_SIGNED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      // Remove from free-agent pool (defensive — also handles the case
      // where the signing originates from elsewhere than the pool, e.g.
      // a Phase 7 academy graduate that lands directly on a squad).
      state.career.freeAgents = state.career.freeAgents.filter(id => id !== event.rosterId);
      // Add to new club's squad (defensive against double-add).
      const newClub = state.career.clubs.find(c => c.id === event.clubId);
      if (newClub && !newClub.squad.includes(event.rosterId)) {
        newClub.squad.push(event.rosterId);
      }
      p.contract = {
        clubId: event.clubId,
        expiresOn: event.expiresOn,
        annualWage: event.annualWage,
        isMarquee: false,
      };
      return;
    }
    case 'PRE_AGREEMENT_SIGNED': {
      // Defensive: drop any prior pending move for this rosterId — only
      // one pre-agreement at a time.
      state.career.pendingMoves = state.career.pendingMoves.filter(m => m.rosterId !== event.agreement.rosterId);
      state.career.pendingMoves.push({ ...event.agreement });
      return;
    }
    case 'TRANSFER_ACTIVATED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      // Remove from old club's squad.
      const oldClub = state.career.clubs.find(c => c.id === p.contract.clubId);
      if (oldClub) oldClub.squad = oldClub.squad.filter(id => id !== event.rosterId);
      // Add to new club's squad (defensive against double-add).
      const newClub = state.career.clubs.find(c => c.id === event.toClubId);
      if (newClub && !newClub.squad.includes(event.rosterId)) {
        newClub.squad.push(event.rosterId);
      }
      // Marquee status clears on departure; new club re-designates if wanted.
      p.contract = {
        clubId: event.toClubId,
        expiresOn: event.expiresOn,
        annualWage: event.annualWage,
        isMarquee: false,
      };
      return;
    }
    case 'ACADEMY_GRADUATED': {
      // New persona entering the senior roster of an existing club.
      // rosterId on the supplied Player is the freshly allocated id;
      // we bump nextRosterId past it.
      const rid = event.player.rosterId;
      state.career.roster[rid] = event.player;
      const club = state.career.clubs.find(c => c.id === event.clubId);
      if (club && !club.squad.includes(rid)) club.squad.push(rid);
      if (rid >= state.career.nextRosterId) state.career.nextRosterId = rid + 1;
      return;
    }
    case 'FOREIGN_IMPORT_ARRIVED': {
      // Unsigned new persona. Lands in freeAgents; signing flow picks
      // them up next.
      const rid = event.player.rosterId;
      state.career.roster[rid] = event.player;
      if (!state.career.freeAgents.includes(rid)) state.career.freeAgents.push(rid);
      if (rid >= state.career.nextRosterId) state.career.nextRosterId = rid + 1;
      return;
    }
    case 'CAREER_ARCHIVE_RESTORED': {
      state.career.seasonsCompleted = event.seasonsCompleted;
      state.career.archive = event.archive.map(a => ({
        seasonLabel: a.seasonLabel,
        standings: a.standings.map(s => ({ ...s })),
        topScorerRosterId: a.topScorerRosterId,
        mvpRosterId: a.mvpRosterId,
        ...(a.leaders ? { leaders: cloneLeaders(a.leaders) } : {}),
      }));
      if (event.freeAgents) state.career.freeAgents = [...event.freeAgents];
      if (event.market !== undefined) {
        state.career.market = event.market
          ? {
              phase: event.market.phase,
              openedAfterSeason: event.market.openedAfterSeason,
              expiringRosterIds: [...event.market.expiringRosterIds],
              offers: event.market.offers.map(o => ({ ...o })),
            }
          : null;
      }
      if (event.pendingMoves) state.career.pendingMoves = event.pendingMoves.map(m => ({ ...m }));
      if (event.teamSeasonStats) {
        const restored: Record<string, TeamSeasonStats> = {};
        for (const [teamId, stats] of Object.entries(event.teamSeasonStats)) {
          restored[teamId] = { ...stats };
        }
        state.league.teamSeasonStats = restored;
      }
      return;
    }
    case 'SEASON_ROLLED_OVER': {
      state.career.archive.push({
        seasonLabel: state.calendar.seasonLabel,
        standings: event.archivedStandings.map(s => ({ ...s })),
        topScorerRosterId: event.topScorerRosterId,
        mvpRosterId: event.mvpRosterId,
        ...(event.leaders ? { leaders: cloneLeaders(event.leaders) } : {}),
      });
      state.career.seasonsCompleted += 1;
      state.calendar.seasonLabel = event.newSeasonLabel;
      state.calendar.week = 1;
      state.league.fixtures = event.newFixtures.map(f => ({ ...f }));
      state.league.results = [];
      state.league.standings = state.league.standings.map(s => zeroStanding(s.teamId));
      state.calendar.date = earliestDateForRound(state.league.fixtures, 1) ?? state.calendar.date;
      // Reset per-player season aggregates for the new season.
      for (const id of Object.keys(state.career.roster)) {
        state.career.roster[Number(id)].seasonStats = zeroSeasonStats();
      }
      // Reset team season aggregates for the new season. Re-zero in place
      // for every team that already had a bucket; new teams (rare) get
      // lazy-initialised by the TEAM_SEASON_STATS_ACCUMULATED reducer.
      for (const teamId of Object.keys(state.league.teamSeasonStats)) {
        state.league.teamSeasonStats[teamId] = zeroTeamSeasonStats();
      }
      // Pending moves should already have been processed via
      // TRANSFER_ACTIVATED events fired by careerRollover before this
      // SEASON_ROLLED_OVER; clear the list as a safety net.
      state.career.pendingMoves = [];
      return;
    }
    default: {
      const _: never = event;
      void _;
      return;
    }
  }
}

function cloneLeaders(l: import('../types/gameState').SeasonAwards): import('../types/gameState').SeasonAwards {
  return {
    topTries:   l.topTries.map(x => ({ ...x })),
    topCarries: l.topCarries.map(x => ({ ...x })),
    topTackles: l.topTackles.map(x => ({ ...x })),
    topRating:  l.topRating.map(x => ({ ...x })),
  };
}

function findOrCreate(standings: TeamStanding[], teamId: string): TeamStanding {
  let s = standings.find(x => x.teamId === teamId);
  if (!s) {
    s = zeroStanding(teamId);
    standings.push(s);
  }
  return s;
}

function applyToSide(s: TeamStanding, pf: number, pa: number, margin: number): void {
  s.played += 1;
  s.pointsFor += pf;
  s.pointsAgainst += pa;
  s.pointsDiff = s.pointsFor - s.pointsAgainst;
  if (margin > 0) {
    s.won += 1;
    s.leaguePoints += LEAGUE_POINTS.win;
  } else if (margin === 0) {
    s.drawn += 1;
    s.leaguePoints += LEAGUE_POINTS.draw;
  } else {
    s.lost += 1;
    s.leaguePoints += LEAGUE_POINTS.loss;
    if (-margin <= LEAGUE_POINTS.losingBonusThreshold) {
      s.leaguePoints += LEAGUE_POINTS.losingBonusPoints;
    }
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Min ISO date across fixtures in a given round. Returns null if no fixture
// in that round carries a date (random-gen seasons), or the round doesn't
// exist (season finished).
function earliestDateForRound(fixtures: Fixture[], round: number): string | null {
  let min: string | null = null;
  for (const f of fixtures) {
    if (f.round !== round || !f.date) continue;
    if (min === null || f.date < min) min = f.date;
  }
  return min;
}
