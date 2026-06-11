// Season-scope mutation seam. The only writer to GameState.
// Mirrors the convention of src/engine/applyMatchEvent.ts — every union
// variant has a single branch, and the exhaustive `default: const _: never`
// catches missing branches at compile time when SeasonEvent grows.

import type { CupKnockoutMatch, EuropeanCompState, EuropeanKnockoutMatch, Fixture, GameState, PlayoffMatch, PremCupState, SeasonEvent, TeamSeasonStats, TeamStanding } from '../types/gameState';
import { zeroStanding, zeroTeamSeasonStats } from '../types/gameState';
import type { MoraleReason } from '../types/player';
import { zeroSeasonStats } from '../types/player';
import { SEASON_VALUES, SENIOR_CAP, EFFECTIVE_CAP_CREDITS, FORM_MODEL, MORALE, STAFF_BUDGET_FRACTION } from '../engine/balance';
import { applyResultToStanding } from './leagueTable';

// Sum of senior cap + dispensation credits — the league's absolute
// ceiling on any club's non-marquee wage spend. The takeover boost
// clamps to this so a Bath-level budget doesn't break through.
const SENIOR_CAP_TOTAL = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;

// Higher index = higher priority. A lower-priority reason never overwrites a
// higher-priority one so e.g. a 'bad_run' loss doesn't clear 'broken_promise'.
const MORALE_NOTE_PRIORITY: MoraleReason[] = [
  'bad_run', 'unused_bench', 'playing_time', 'loan', 'transfer_rejected', 'broken_promise',
];
function moraleNotePriority(r: MoraleReason): number {
  const idx = MORALE_NOTE_PRIORITY.indexOf(r);
  return idx === -1 ? 0 : idx;
}
function setMoraleNote(p: { moraleNote?: { reason: MoraleReason; week: number } }, reason: MoraleReason, week: number): void {
  if (!p.moraleNote || moraleNotePriority(reason) >= moraleNotePriority(p.moraleNote.reason)) {
    p.moraleNote = { reason, week };
  }
}
import { assertSeasonInvariants } from './seasonInvariants';
import { addDaysIso, getAge } from './age';
import { playerOverall } from '../engine/RatingEngine';

export function applySeasonEvent(state: GameState, event: SeasonEvent): void {
  applySeasonEventBody(state, event);
  assertSeasonInvariants(state);
}

function applySeasonEventBody(state: GameState, event: SeasonEvent): void {
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
      state.league.playoffs = null;
      state.league.premCup = null;
      state.league.europeanCup = null;
      state.league.europeanShield = null;
      state.league.mediaStories = [];
      return;
    }
    case 'FIXTURE_RESULT_RECORDED': {
      state.league.results.push(event.result);
      const home = findOrCreate(state.league.standings, event.result.homeId);
      const away = findOrCreate(state.league.standings, event.result.awayId);
      const margin = event.result.homeScore - event.result.awayScore;
      applyResultToStanding(home, event.result.homeScore, event.result.awayScore, event.result.homeTries, margin);
      applyResultToStanding(away, event.result.awayScore, event.result.homeScore, event.result.awayTries, -margin);
      return;
    }
    case 'MEDIA_STORY_PUBLISHED': {
      state.league.mediaStories.push(event.story);
      return;
    }
    case 'WEEK_ADVANCED': {
      state.calendar.week += 1;
      const nextRoundDate = earliestDateForRound(state.league.fixtures, state.calendar.week);
      state.calendar.date = nextRoundDate ?? addDaysIso(state.calendar.date, SEASON_VALUES.weekLengthDays);
      // Prune mid-season FA rejection cooldowns that have aged out:
      // an entry with weekUntilClear ≤ current week is now approachable
      // again. Rebuild via Object.fromEntries rather than deleting from
      // the object during iteration — same behaviour, defensive against
      // a future iteration-style refactor.
      const week = state.calendar.week;
      state.career.midseasonRejections = Object.fromEntries(
        Object.entries(state.career.midseasonRejections)
          .filter(([, w]) => w > week),
      );
      return;
    }
    case 'MATCHDAY_ADVANCED': {
      // Step the calendar to the next cup / European matchday. calendar.week
      // (the league-round cursor) deliberately does NOT move, so league
      // scheduling, standings, break detection and upcomingGap are untouched.
      state.calendar.date = event.toDate;
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
      // Back-fill morale for players loaded from pre-morale saves.
      for (const key of Object.keys(state.career.roster)) {
        const p = state.career.roster[Number(key)];
        if (p.morale === undefined) p.morale = MORALE.baseline;
      }
      state.career.clubs = event.clubs.map(c => ({
        id: c.id,
        squad: [...c.squad],
        salaryBudget: c.salaryBudget,
        staffBudget: c.staffBudget ?? Math.round(c.salaryBudget * STAFF_BUDGET_FRACTION),
      }));
      state.career.nextRosterId = event.nextRosterId;
      return;
    }
    case 'PLAYER_SEASON_STATS_ACCUMULATED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      let s = p.seasonStats;
      if (event.competition === 'europeanCup') {
        if (!p.europeanCupStats) p.europeanCupStats = zeroSeasonStats();
        s = p.europeanCupStats;
      } else if (event.competition === 'europeanShield') {
        if (!p.europeanShieldStats) p.europeanShieldStats = zeroSeasonStats();
        s = p.europeanShieldStats;
      }
      const d = event.statsDelta;
      s.appearances            += d.appearances;
      s.starts                 += d.starts;
      s.tries                  += d.tries;
      s.carries                += d.carries;
      s.metresCarried          += d.metresCarried;
      s.lineBreaks             += d.lineBreaks;
      s.defendersBeaten        += d.defendersBeaten;
      s.offloadsCompleted      += d.offloadsCompleted;
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
      // Roll the match rating (carried in d.ratingSum, one match's worth here)
      // into the rolling last-3 window that drives the recent-form bias.
      p.recentRatings = [d.ratingSum, ...(p.recentRatings ?? [])].slice(0, 3);
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
        offloadsCompleted: cur.offloadsCompleted + d.offloadsCompleted,
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
      if (event.reputationNudge !== undefined) {
        p.reputation = Math.max(0, Math.min(100, p.reputation + event.reputationNudge));
      }
      return;
    }
    case 'PLAYER_RETIRED': {
      const club = state.career.clubs.find(c => c.id === event.clubId);
      if (club) club.squad = club.squad.filter(id => id !== event.rosterId);
      // Free-agent retirements (clubId '') and any released player must also
      // leave the free-agent pool, else they remain signable after retiring.
      state.career.freeAgents = state.career.freeAgents.filter(id => id !== event.rosterId);
      // Drop any dangling pre-agreement — a retired player can't move.
      state.career.pendingMoves = state.career.pendingMoves.filter(m => m.rosterId !== event.rosterId);
      // A retired loan-pool player must not remain signable on the Loan screen.
      if (state.career.loanPool) {
        state.career.loanPool = state.career.loanPool.filter(id => id !== event.rosterId);
      }
      // Flag so the rollover aging loop and weekly morale decay skip them.
      const retiree = state.career.roster[event.rosterId];
      if (retiree) retiree.retired = true;
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
      // Returning from injury carries a fading form penalty (rustiness).
      p.formReturn = { round: state.calendar.week, penalty: FORM_MODEL.injuryReturnPenalty };
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
      // Designate the new marquee. Fail loud if the caller passed a
      // rosterId that's not on this club's squad — that's a logic bug,
      // not a recoverable race (designation only happens from
      // ContractsScreen on Hub, where the squad doesn't mutate under
      // the user). Silent-skip would desync the UI from state.
      if (event.rosterId !== null) {
        const target = state.career.roster[event.rosterId];
        if (!target) {
          throw new Error(`MARQUEE_DESIGNATED: rosterId=${event.rosterId} not in roster`);
        }
        if (!club.squad.includes(event.rosterId)) {
          throw new Error(`MARQUEE_DESIGNATED: rosterId=${event.rosterId} not in ${event.clubId} squad`);
        }
        target.contract.isMarquee = true;
      }
      return;
    }
    case 'MARKET_OPENED': {
      state.career.market = {
        phase: event.phase,
        openedAfterSeason: state.calendar.seasonLabel,
        expiringRosterIds: [...event.expiringRosterIds],
        offers: event.offers.map(o => ({ ...o })),
        bids: [],
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
      // Drop any dangling pre-agreement — a terminated player can't
      // move on the old contract, and the rollover-time TRANSFER_ACTIVATED
      // would otherwise revive a contract that just ended.
      state.career.pendingMoves = state.career.pendingMoves.filter(m => m.rosterId !== event.rosterId);
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
    case 'PRE_AGREEMENT_CANCELLED': {
      state.career.pendingMoves = state.career.pendingMoves.filter(m => m.rosterId !== event.rosterId);
      return;
    }
    case 'TRANSFER_ACTIVATED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      // Remove from old club's squad. Source from the event rather than
      // p.contract.clubId so a future rollover-batch ordering change
      // (e.g. a CONTRACT_TERMINATED before TRANSFER_ACTIVATED) can't
      // desync the swap.
      const oldClub = state.career.clubs.find(c => c.id === event.fromClubId);
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
      const grad = event.player;
      if (grad.morale === undefined) grad.morale = MORALE.baseline;
      state.career.roster[rid] = grad;
      const club = state.career.clubs.find(c => c.id === event.clubId);
      if (club && !club.squad.includes(rid)) club.squad.push(rid);
      if (rid >= state.career.nextRosterId) state.career.nextRosterId = rid + 1;
      return;
    }
    case 'FOREIGN_IMPORT_ARRIVED': {
      // Unsigned new persona. Lands in freeAgents; signing flow picks
      // them up next.
      const rid = event.player.rosterId;
      const imp = event.player;
      if (imp.morale === undefined) imp.morale = MORALE.baseline;
      state.career.roster[rid] = imp;
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
        championTeamId: a.championTeamId ?? null,
        ...(a.premCupChampionTeamId !== undefined ? { premCupChampionTeamId: a.premCupChampionTeamId } : {}),
        ...(a.leaders ? { leaders: cloneLeaders(a.leaders) } : {}),
        ...(a.playerSeasonHistory ? { playerSeasonHistory: clonePlayerHistory(a.playerSeasonHistory) } : {}),
      }));
      if (event.freeAgents) state.career.freeAgents = [...event.freeAgents];
      if (event.market !== undefined) {
        state.career.market = event.market
          ? {
              phase: event.market.phase,
              openedAfterSeason: event.market.openedAfterSeason,
              expiringRosterIds: [...event.market.expiringRosterIds],
              offers: event.market.offers.map(o => ({ ...o })),
              // Pre-v15 saves predate the bids field; default to empty.
              bids: (event.market.bids ?? []).map(b => ({ ...b })),
            }
          : null;
      }
      if (event.pendingMoves) state.career.pendingMoves = event.pendingMoves.map(m => ({ ...m }));
      if (event.preSeasonStep !== undefined) state.career.preSeasonStep = event.preSeasonStep;
      if (event.teamSeasonStats) {
        const restored: Record<string, TeamSeasonStats> = {};
        for (const [teamId, stats] of Object.entries(event.teamSeasonStats)) {
          restored[teamId] = { ...stats };
        }
        state.league.teamSeasonStats = restored;
      }
      if (event.takeoverHistory !== undefined) {
        state.career.takeoverHistory = [...event.takeoverHistory];
      }
      if (event.midseasonRejections !== undefined) {
        state.career.midseasonRejections = { ...event.midseasonRejections };
      }
      if (event.activePoachedIds !== undefined) {
        state.career.activePoachedIds = [...event.activePoachedIds];
      }
      if (event.playoffs !== undefined) {
        state.league.playoffs = event.playoffs
          ? {
              semifinals: [
                { ...event.playoffs.semifinals[0], ...(event.playoffs.semifinals[0].result ? { result: { ...event.playoffs.semifinals[0].result } } : {}) },
                { ...event.playoffs.semifinals[1], ...(event.playoffs.semifinals[1].result ? { result: { ...event.playoffs.semifinals[1].result } } : {}) },
              ],
              final: { ...event.playoffs.final, ...(event.playoffs.final.result ? { result: { ...event.playoffs.final.result } } : {}) },
              championTeamId: event.playoffs.championTeamId,
            }
          : null;
      }
      if (event.premCup !== undefined) {
        state.league.premCup = event.premCup ? cloneCup(event.premCup) : null;
      }
      if (event.europeanCup !== undefined) {
        state.league.europeanCup = event.europeanCup ? cloneEuropean(event.europeanCup) : null;
      }
      if (event.europeanShield !== undefined) {
        state.league.europeanShield = event.europeanShield ? cloneEuropean(event.europeanShield) : null;
      }
      return;
    }
    case 'SEASON_ROLLED_OVER': {
      state.career.archive.push({
        seasonLabel: state.calendar.seasonLabel,
        standings: event.archivedStandings.map(s => ({ ...s })),
        topScorerRosterId: event.topScorerRosterId,
        mvpRosterId: event.mvpRosterId,
        championTeamId: event.championTeamId,
        ...(event.premCupChampionTeamId !== undefined ? { premCupChampionTeamId: event.premCupChampionTeamId } : {}),
        ...(event.europeanCupChampionTeamId !== undefined ? { europeanCupChampionTeamId: event.europeanCupChampionTeamId } : {}),
        ...(event.europeanShieldChampionTeamId !== undefined ? { europeanShieldChampionTeamId: event.europeanShieldChampionTeamId } : {}),
        ...(event.leaders ? { leaders: cloneLeaders(event.leaders) } : {}),
        ...(event.playerSeasonHistory ? { playerSeasonHistory: clonePlayerHistory(event.playerSeasonHistory) } : {}),
      });
      state.career.seasonsCompleted += 1;
      state.calendar.seasonLabel = event.newSeasonLabel;
      state.calendar.week = 1;
      state.league.fixtures = event.newFixtures.map(f => ({ ...f }));
      state.league.results = [];
      state.league.standings = state.league.standings.map(s => zeroStanding(s.teamId));
      state.league.mediaStories = [];
      state.calendar.date = earliestDateForRound(state.league.fixtures, 1) ?? state.calendar.date;
      // Reset per-player season aggregates for the new season. International
      // call-up flags + PGA rest obligations don't survive the rollover (the
      // next season's windows re-select fresh); internationalCaps accumulate.
      for (const id of Object.keys(state.career.roster)) {
        const p = state.career.roster[Number(id)];
        // Release any loan-in players from the managed club's squad before
        // clearing their loanIn flag, so the squad pointer stays consistent.
        if (p.loanIn) {
          const club = state.career.clubs.find(c => c.squad.includes(Number(id)));
          if (club) club.squad = club.squad.filter(rid => rid !== Number(id));
          p.loanIn = undefined;
          if (state.career.loanPool && !state.career.loanPool.includes(Number(id))) {
            state.career.loanPool.push(Number(id));
          }
        }
        p.seasonStats = zeroSeasonStats();
        if (p.europeanCupStats) p.europeanCupStats = undefined;
        if (p.europeanShieldStats) p.europeanShieldStats = undefined;
        if (p.recentRatings) p.recentRatings = undefined;
        if (p.formReturn) p.formReturn = undefined;
        if (p.restObligation) p.restObligation = undefined;
        if (p.internationalDuty) p.internationalDuty = undefined;
        if (p.lionsReturnRound !== undefined) p.lionsReturnRound = undefined;
        if (p.summerTourReturn) p.summerTourReturn = undefined;
        if (p.disciplineAdvice) p.disciplineAdvice = undefined;
        if (p.suspension) p.suspension = undefined;
        if (p.wantsTransfer) p.wantsTransfer = undefined;
        if (p.playingTimePromise) p.playingTimePromise = undefined;
        if (p.consecutiveVeryUnhappyRounds) p.consecutiveVeryUnhappyRounds = undefined;
        if (p.loanOut) p.loanOut = undefined;
        p.moraleChats = 0;
      }
      // Reset team season aggregates for the new season. Re-zero in place
      // for every team that already had a bucket; new teams (rare) get
      // lazy-initialised by the TEAM_SEASON_STATS_ACCUMULATED reducer.
      for (const teamId of Object.keys(state.league.teamSeasonStats)) {
        state.league.teamSeasonStats[teamId] = zeroTeamSeasonStats();
      }
      // Clear the playoff bracket — the new season has not yet earned one.
      // championTeamId has already been carried into the archive entry above.
      state.league.playoffs = null;
      // Clear the Prem Cup — the new season's cup is re-seeded (with redrawn
      // pools) by the PREM_CUP_SEEDED event computeRollover appends after this.
      state.league.premCup = null;
      // Clear European competitions — the new season's comps are re-seeded
      // by EuropeanCoordinator.seedEuropeanComps at the start of each season.
      state.league.europeanCup = null;
      state.league.europeanShield = null;
      // Pending moves should already have been processed via
      // TRANSFER_ACTIVATED events fired by careerRollover before this
      // SEASON_ROLLED_OVER; clear the list as a safety net.
      state.career.pendingMoves = [];
      // Mid-season rejection cooldowns don't survive the rollover —
      // the FA pool itself gets reshuffled, so the per-rosterId locks
      // become stale.
      state.career.midseasonRejections = {};
      // Poach threats are season-scoped — stale ids would drive the Hub
      // Transfers badge and inbox items until the first updatePoachThreats().
      state.career.activePoachedIds = [];
      // Season-only staff budget boost doesn't carry over.
      for (const club of state.career.clubs) {
        if (club.staffBudgetBoost) club.staffBudgetBoost = 0;
      }
      return;
    }
    case 'PLAYOFF_BRACKET_SEEDED': {
      // Idempotent — once seeded, the bracket is fixed for the season.
      if (state.league.playoffs !== null) return;
      state.league.playoffs = {
        semifinals: [
          { ...event.semifinals[0] },
          { ...event.semifinals[1] },
        ],
        final: { ...event.final },
        championTeamId: null,
      };
      return;
    }
    case 'PLAYOFF_RESULT_RECORDED': {
      const playoffs = state.league.playoffs;
      if (!playoffs) return;
      const target = pickPlayoffMatch(playoffs, event.kind);
      if (!target) return;
      if (target.result) return; // already recorded
      target.result = {
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        homeTries: event.homeTries,
        awayTries: event.awayTries,
        playerSide: event.playerSide,
      };
      // Cascade: when a SF resolves, populate the final's matching slot
      // from the SF winner. SF1 winner takes the final's home slot, SF2
      // winner takes the away slot — mirrors the bracket diagram. Guarded
      // against double-population: the slot only writes when currently
      // null, so a stray replay of the same event can't overwrite a
      // committed final.
      if (event.kind === 'semifinal_1' || event.kind === 'semifinal_2') {
        const winnerId = playoffWinnerId(target);
        if (winnerId !== null) {
          if (event.kind === 'semifinal_1' && playoffs.final.homeId === null) {
            playoffs.final.homeId = winnerId;
          } else if (event.kind === 'semifinal_2' && playoffs.final.awayId === null) {
            playoffs.final.awayId = winnerId;
          }
        }
      }
      // Cascade: when the final resolves, write the champion. Same
      // double-population guard as the SF cascade.
      if (event.kind === 'final') {
        const winnerId = playoffWinnerId(target);
        if (winnerId !== null && playoffs.championTeamId === null) {
          playoffs.championTeamId = winnerId;
        }
      }
      return;
    }
    case 'PRE_SEASON_STEP_SET': {
      if (event.step === null) delete state.career.preSeasonStep;
      else state.career.preSeasonStep = event.step;
      return;
    }
    case 'CLUB_BUDGET_SET': {
      const club = state.career.clubs.find(c => c.id === event.clubId);
      if (!club) return;
      club.salaryBudget = event.salaryBudget;
      return;
    }
    case 'CLUB_TAKEOVER': {
      const club = state.career.clubs.find(c => c.id === event.clubId);
      if (!club) return;
      // Boost stacks on whatever CLUB_BUDGET_SET set the budget to.
      // Clamp at EFFECTIVE_CAP — the league-wide ceiling.
      club.salaryBudget = Math.min(club.salaryBudget + event.boostAmount, SENIOR_CAP_TOTAL);
      // Record the takeover so the club is excluded from future random
      // takeover rolls. Defensive against double-add.
      if (!state.career.takeoverHistory.includes(event.clubId)) {
        state.career.takeoverHistory.push(event.clubId);
      }
      return;
    }
    case 'BID_SUBMITTED': {
      if (!state.career.market) return;
      // Idempotent on duplicate IDs — re-submitting an existing bid is a
      // no-op. UI usually withdraws first, but a double-click on Make
      // Offer shouldn't double-up.
      if (state.career.market.bids.some(b => b.id === event.bid.id)) return;
      state.career.market.bids.push({ ...event.bid });
      return;
    }
    case 'BID_WITHDRAWN': {
      if (!state.career.market) return;
      // Remove the bid outright rather than flagging it 'withdrawn'. Bid IDs
      // are deterministic per (season, club, player), so a left-behind
      // withdrawn bid would block a re-submit on the same player (the
      // BID_SUBMITTED duplicate-ID guard would reject it while submitBid
      // reported success). No reader inspects the 'withdrawn' status, and
      // clubBudgetUsage only sums pending bids, so removal is equivalent
      // for accounting and unblocks the re-bid path.
      state.career.market.bids = state.career.market.bids.filter(b => b.id !== event.bidId);
      return;
    }
    case 'BID_RESOLVED': {
      if (!state.career.market) return;
      const bid = state.career.market.bids.find(b => b.id === event.bidId);
      if (!bid) return;
      // Only flip pending → won/lost. Already-resolved or withdrawn
      // bids are left alone (defensive).
      if (bid.status !== 'pending') return;
      bid.status = event.outcome;
      return;
    }
    case 'MIDSEASON_OFFER_REJECTED': {
      state.career.midseasonRejections[event.rosterId] = event.weekUntilClear;
      return;
    }
    case 'POACH_THREATS_SET': {
      state.career.activePoachedIds = [...event.rosterIds];
      return;
    }
    case 'PLAYER_TRAINING_PLAN_SET': {
      state.player.training = { ...event.plan };
      return;
    }
    case 'PLAYER_TRAINED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.condition = Math.max(0, Math.min(100, p.condition + event.conditionDelta));
      for (const [stat, delta] of Object.entries(event.statDeltas)) {
        if (delta === undefined) continue;
        const k = stat as keyof typeof p.baseStats;
        p.baseStats[k] = Math.max(1, Math.min(99, p.baseStats[k] + delta));
      }
      return;
    }
    case 'PLAYER_CONDITION_UPDATED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.condition = Math.max(0, Math.min(100, event.condition));
      return;
    }
    case 'PLAYER_CALLED_UP': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.internationalDuty = { window: event.window };
      p.internationalCaps = (p.internationalCaps ?? 0) + 1;
      return;
    }
    case 'PLAYER_RETURNED_FROM_DUTY': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.internationalDuty = undefined;
      p.condition = Math.max(0, Math.min(100, event.condition));
      // Returning from international duty carries a fading form penalty.
      p.formReturn = { round: state.calendar.week, penalty: FORM_MODEL.intlReturnPenalty };
      if (event.restEligibleRounds && event.restEligibleRounds.length > 0) {
        p.restObligation = { window: event.window, eligibleRounds: [...event.restEligibleRounds] };
      } else {
        p.restObligation = undefined;
      }
      return;
    }
    case 'REST_OBLIGATION_RESOLVED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.restObligation = undefined;
      return;
    }
    case 'LIONS_RETURN_SET': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.lionsReturnRound = event.availableFromRound;
      p.condition = Math.max(0, Math.min(100, event.condition));
      return;
    }
    case 'SUMMER_TOUR_RETURN_SET': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.condition = Math.max(0, Math.min(100, event.condition));
      p.summerTourReturn = true;
      return;
    }
    case 'PREM_CUP_SEEDED': {
      // Idempotent — re-seeding the same season is a no-op.
      if (state.league.premCup && state.league.premCup.seasonLabel === event.seasonLabel) return;
      state.league.premCup = {
        seasonLabel: event.seasonLabel,
        pools: [
          { id: 'A', teamIds: [...event.pools[0].teamIds], standings: event.pools[0].teamIds.map(zeroStanding) },
          { id: 'B', teamIds: [...event.pools[1].teamIds], standings: event.pools[1].teamIds.map(zeroStanding) },
        ],
        fixtures: event.fixtures.map(f => ({ ...f })),
        knockout: null,
      };
      return;
    }
    case 'PREM_CUP_FIXTURE_RECORDED': {
      const cup = state.league.premCup;
      if (!cup) return;
      const fx = cup.fixtures.find(
        f => f.pool === event.pool && f.leg === event.leg && f.homeId === event.homeId && f.awayId === event.awayId,
      );
      if (!fx || fx.result) return; // missing or already recorded
      fx.result = {
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        homeTries: event.homeTries,
        awayTries: event.awayTries,
        playerSide: event.playerSide ?? null,
      };
      const pool = cup.pools.find(p => p.id === event.pool);
      if (!pool) return;
      // Plain find (not findOrCreate): a pool always has its 5 seeded rows,
      // and creating a 6th from a stray teamId would trip the length-5
      // invariant. Bail if either side isn't in this pool.
      const home = pool.standings.find(s => s.teamId === event.homeId);
      const away = pool.standings.find(s => s.teamId === event.awayId);
      if (!home || !away) return;
      const margin = event.homeScore - event.awayScore;
      applyResultToStanding(home, event.homeScore, event.awayScore, event.homeTries, margin);
      applyResultToStanding(away, event.awayScore, event.homeScore, event.awayTries, -margin);
      return;
    }
    case 'PREM_CUP_KNOCKOUT_SEEDED': {
      const cup = state.league.premCup;
      if (!cup || cup.knockout !== null) return; // missing or already seeded
      cup.knockout = {
        semifinals: [{ ...event.semifinals[0] }, { ...event.semifinals[1] }],
        final: { ...event.final },
        championTeamId: null,
      };
      return;
    }
    case 'PREM_CUP_KNOCKOUT_RECORDED': {
      const ko = state.league.premCup?.knockout;
      if (!ko) return;
      const target = pickCupMatch(ko, event.kind);
      if (!target || target.result) return; // missing or already recorded
      target.result = {
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        homeTries: event.homeTries,
        awayTries: event.awayTries,
        playerSide: event.playerSide ?? null,
      };
      // Cascade SF winners into the final's slots (SF1 → home, SF2 → away),
      // guarded against double-population (slot writes only when null).
      if (event.kind === 'semifinal_1' || event.kind === 'semifinal_2') {
        const winnerId = cupWinnerId(target);
        if (winnerId !== null) {
          if (event.kind === 'semifinal_1' && ko.final.homeId === null) ko.final.homeId = winnerId;
          else if (event.kind === 'semifinal_2' && ko.final.awayId === null) ko.final.awayId = winnerId;
        }
      }
      if (event.kind === 'final') {
        const winnerId = cupWinnerId(target);
        if (winnerId !== null && ko.championTeamId === null) ko.championTeamId = winnerId;
      }
      return;
    }
    case 'PLAYER_CUP_DIRECTION_SET': {
      state.player.cupDirection = event.direction;
      return;
    }
    case 'PLAYER_CUP_MANAGE_LIVE_SET': {
      state.player.cupManageLive = event.manageLive;
      return;
    }
    case 'PREM_CUP_ROUND_SHOWN': {
      const cup = state.league.premCup;
      if (!cup) return;
      if (!cup.shownRounds) cup.shownRounds = [];
      if (!cup.shownRounds.includes(event.roundKey)) cup.shownRounds.push(event.roundKey);
      return;
    }
    case 'PREM_CUP_FEATURED_ADDED': {
      const cup = state.league.premCup;
      if (!cup) return;
      if (event.reset) { cup.legFeatured = []; return; }
      if (!cup.legFeatured) cup.legFeatured = [];
      for (const rid of event.rosterIds) {
        if (!cup.legFeatured.includes(rid)) cup.legFeatured.push(rid);
      }
      return;
    }
    case 'PLAYER_CAPTAIN_SET': {
      state.player.captainRosterId = event.rosterId;
      return;
    }
    case 'PLAYER_DISCIPLINE_COUNSELLED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.disciplineAdvice = { mode: 'ease_off', expiresAfterRound: event.expiresAfterRound };
      return;
    }
    case 'PLAYER_SUSPENDED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.suspension = { forRound: event.forRound };
      return;
    }
    case 'BOARD_STATE_SEEDED': {
      state.player.board = {
        confidence: event.confidence,
        objective: event.objective,
        warningIssued: event.warningIssued,
        sacked: event.sacked,
        ...(event.europeanObjective !== undefined
          ? { europeanObjective: event.europeanObjective }
          : {}),
      };
      return;
    }
    case 'BOARD_CONFIDENCE_ADJUSTED': {
      const board = state.player.board;
      if (!board) return;
      board.confidence = Math.max(0, Math.min(100, board.confidence + event.delta));
      return;
    }
    case 'MANAGER_WARNED': {
      if (!state.player.board) return;
      state.player.board.warningIssued = true;
      return;
    }
    case 'MANAGER_SACKED': {
      if (!state.player.board) return;
      state.player.board.sacked = true;
      return;
    }
    case 'PLAYER_MORALE_ADJUSTED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      const current = p.morale ?? MORALE.baseline;
      p.morale = Math.max(0, Math.min(100, current + event.delta));
      if (event.reason === 'manager_chat') {
        p.moraleChats = (p.moraleChats ?? 0) + 1;
        p.moraleNote = undefined; // chat resolves the flagged issue
      }
      // Reset the very-unhappy streak when morale climbs back above the threshold.
      if (p.morale > MORALE.veryUnhappyThreshold && p.consecutiveVeryUnhappyRounds) {
        p.consecutiveVeryUnhappyRounds = 0;
      }
      // Set moraleNote when a negative event fires while the player is troubled.
      if (event.delta < 0 && event.moraleReason && p.morale < 55) {
        setMoraleNote(p, event.moraleReason, state.calendar.week);
      }
      // Clear moraleNote when morale recovers back to OK.
      if (p.morale >= 55) p.moraleNote = undefined;
      return;
    }
    case 'STAFF_POOL_SEEDED': {
      state.career.staff = event.staff;
      state.career.nextStaffId = event.nextStaffId;
      return;
    }
    case 'STAFF_HIRED': {
      const m = (state.career.staff ?? []).find(s => s.id === event.staffId);
      if (!m) return;
      m.clubId    = event.clubId;
      m.annualWage = event.annualWage;
      return;
    }
    case 'STAFF_RELEASED': {
      const m = (state.career.staff ?? []).find(s => s.id === event.staffId);
      if (!m) return;
      m.clubId = null;
      // Clear any scouting assignments that pointed at this staff member.
      if (state.player.scouting) {
        for (const rec of Object.values(state.player.scouting)) {
          if (rec.assignedScoutId === event.staffId) delete rec.assignedScoutId;
        }
      }
      return;
    }
    case 'PLAYER_SCOUT_ASSIGNED': {
      if (!state.player.scouting) state.player.scouting = {};
      const existing = state.player.scouting[event.rosterId];
      state.player.scouting[event.rosterId] = {
        accuracy: existing?.accuracy ?? 0,
        assignedScoutId: event.scoutId,
      };
      return;
    }
    case 'PLAYER_SCOUT_UNASSIGNED': {
      const rec = state.player.scouting?.[event.rosterId];
      if (rec) delete rec.assignedScoutId;
      return;
    }
    case 'SCOUTING_ACCURACY_ADVANCED': {
      const rec = state.player.scouting?.[event.rosterId];
      if (!rec) return;
      rec.accuracy = Math.min(100, Math.max(0, rec.accuracy + event.delta));
      return;
    }
    case 'PLAYER_SCOUTING_RESTORED': {
      state.player.scouting = { ...event.scouting };
      return;
    }
    case 'PLAYER_SCOUTING_REMOVED': {
      delete state.player.scouting?.[event.rosterId];
      return;
    }
    // ── Feature 1.4 — Transfer Requests & Playing-Time Promises ─────────
    case 'PLAYER_VERY_UNHAPPY_TICK': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.consecutiveVeryUnhappyRounds = (p.consecutiveVeryUnhappyRounds ?? 0) + 1;
      return;
    }
    case 'TRANSFER_REQUEST_SUBMITTED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.wantsTransfer = true;
      p.consecutiveVeryUnhappyRounds = 0;
      return;
    }
    case 'PLAYING_TIME_PROMISED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.playingTimePromise = {
        toRound: event.toRound,
        startsRequired: event.startsRequired,
        startsAtPromise: event.startsAtPromise,
      };
      p.wantsTransfer = undefined;
      return;
    }
    case 'TRANSFER_REQUEST_GRANTED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.wantsTransfer = undefined;
      return;
    }
    case 'TRANSFER_REQUEST_REJECTED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.wantsTransfer = undefined;
      const current = p.morale ?? MORALE.baseline;
      p.morale = Math.max(0, Math.min(100, current + MORALE.transferRequestRejectPenalty));
      if (p.morale < 55) setMoraleNote(p, 'transfer_rejected', state.calendar.week);
      return;
    }
    case 'PROMISE_BROKEN': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.playingTimePromise = undefined;
      const current = p.morale ?? MORALE.baseline;
      p.morale = Math.max(0, Math.min(100, current + MORALE.promiseBrokenPenalty));
      if (p.morale < 55) setMoraleNote(p, 'broken_promise', state.calendar.week);
      return;
    }
    // ── Feature 2.3 — Loan System ────────────────────────────────────────
    case 'LOAN_POOL_SEEDED': {
      state.career.loanPool = [...event.rosterIds];
      // Loan-pool players arrive via FOREIGN_IMPORT_ARRIVED which also adds
      // them to freeAgents. Remove them so they're only reachable through the
      // loan flow, not through the regular transfer market.
      const poolSet = new Set(event.rosterIds);
      state.career.freeAgents = state.career.freeAgents.filter(id => !poolSet.has(id));
      return;
    }
    case 'PLAYER_LOANED_OUT': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.loanOut = { partnerClub: event.partnerClub, fromRound: event.fromRound };

      // Morale impact depends on squad rank (by OVR) and age.
      const club = state.career.clubs.find(c => c.squad.includes(event.rosterId));
      if (club) {
        const sorted = club.squad
          .map(rid => state.career.roster[rid])
          .filter((q): q is NonNullable<typeof q> => !!q)
          .sort((a, b) => playerOverall(b.baseStats, b.position) - playerOverall(a.baseStats, a.position));
        const rank = sorted.findIndex(q => q.rosterId === event.rosterId) + 1;
        const age = getAge(p.dob, state.calendar.date) ?? 99;
        let delta = 0;
        if (rank >= 1 && rank <= MORALE.loanStarRank) {
          delta = MORALE.loanStarDelta;
        } else if (rank <= 15) {
          delta = MORALE.loanFirstTeamDelta;
        } else if (age <= MORALE.loanYoungAge) {
          delta = MORALE.loanYoungBackupBoost;
        }
        if (delta !== 0) {
          p.morale = Math.max(0, Math.min(100, (p.morale ?? MORALE.baseline) + delta));
          if (delta < 0 && p.morale < 55) setMoraleNote(p, 'loan', state.calendar.week);
        }
      }
      return;
    }
    case 'PLAYER_RECALLED_FROM_LOAN': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.loanOut = undefined;
      return;
    }
    case 'LOAN_PLAYER_SIGNED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      state.career.loanPool = (state.career.loanPool ?? []).filter(id => id !== event.rosterId);
      const club = state.career.clubs.find(c => c.id === event.clubId);
      if (club && !club.squad.includes(event.rosterId)) club.squad.push(event.rosterId);
      p.loanIn = { fromRound: event.fromRound };
      return;
    }
    case 'LOAN_PLAYER_RELEASED': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      const club = state.career.clubs.find(c => c.squad.includes(event.rosterId));
      if (club) club.squad = club.squad.filter(id => id !== event.rosterId);
      p.loanIn = undefined;
      if (state.career.loanPool && !state.career.loanPool.includes(event.rosterId)) {
        state.career.loanPool.push(event.rosterId);
      }
      return;
    }
    case 'SQUAD_STATUS_SET': {
      const p = state.career.roster[event.rosterId];
      if (!p) return;
      p.squadStatus = event.status;
      return;
    }
    case 'STAFF_BUDGET_BOOSTED': {
      const club = state.career.clubs.find(c => c.id === event.clubId);
      if (!club) return;
      club.staffBudgetBoost = event.boost;
      return;
    }
    case 'EUROPEAN_COMP_SEEDED': {
      const target = event.competition === 'europeanCup' ? 'europeanCup' : 'europeanShield';
      const existing = state.league[target];
      if (existing && existing.seasonLabel === event.seasonLabel) return; // idempotent
      state.league[target] = {
        seasonLabel: event.seasonLabel,
        competition: event.competition,
        pools: event.pools.map(p => ({
          id: p.id,
          teamIds: [...p.teamIds],
          standings: p.teamIds.map(zeroStanding),
        })),
        fixtures: event.fixtures.map(f => ({ ...f })),
        knockout: null,
      };
      return;
    }
    case 'EUROPEAN_FIXTURE_RECORDED': {
      const comp = state.league[event.competition === 'europeanCup' ? 'europeanCup' : 'europeanShield'];
      if (!comp) return;
      const fx = comp.fixtures.find(
        f => f.poolId === event.poolId && f.round === event.round && f.homeId === event.homeId && f.awayId === event.awayId,
      );
      if (!fx || fx.result) return;
      fx.result = {
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        homeTries: event.homeTries,
        awayTries: event.awayTries,
        playerSide: event.playerSide,
      };
      const pool = comp.pools.find(p => p.id === event.poolId);
      if (!pool) return;
      const home = pool.standings.find(s => s.teamId === event.homeId);
      const away = pool.standings.find(s => s.teamId === event.awayId);
      if (!home || !away) return;
      const margin = event.homeScore - event.awayScore;
      applyResultToStanding(home, event.homeScore, event.awayScore, event.homeTries, margin);
      applyResultToStanding(away, event.awayScore, event.homeScore, event.awayTries, -margin);
      return;
    }
    case 'EUROPEAN_KNOCKOUT_SEEDED': {
      const comp = state.league[event.competition === 'europeanCup' ? 'europeanCup' : 'europeanShield'];
      if (!comp || comp.knockout !== null) return;
      comp.knockout = {
        r16: event.r16.map(m => ({ ...m })),
        quarterfinals: event.quarterfinals.map(m => ({ ...m })),
        semifinals: [{ ...event.semifinals[0] }, { ...event.semifinals[1] }],
        final: { ...event.final },
        championTeamId: null,
      };
      return;
    }
    case 'EUROPEAN_OBJECTIVE_SET': {
      if (state.player.board) state.player.board.europeanObjective = event.objective;
      return;
    }
    case 'EUROPEAN_ROUND_SHOWN': {
      const comp = state.league[event.competition];
      if (comp) {
        if (!comp.shownRounds) comp.shownRounds = [];
        if (!comp.shownRounds.includes(event.roundKey)) comp.shownRounds.push(event.roundKey);
      }
      return;
    }
    case 'EUROPEAN_KNOCKOUT_RECORDED': {
      const comp = state.league[event.competition === 'europeanCup' ? 'europeanCup' : 'europeanShield'];
      const ko = comp?.knockout;
      if (!ko) return;
      const matchArr = event.stage === 'r16' ? ko.r16
        : event.stage === 'quarterfinal' ? ko.quarterfinals
        : event.stage === 'semifinal' ? (ko.semifinals as import('../types/gameState').EuropeanKnockoutMatch[])
        : [ko.final];
      const target = matchArr[event.matchIndex];
      if (!target || target.result) return;
      target.result = {
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        homeTries: event.homeTries,
        awayTries: event.awayTries,
        playerSide: event.playerSide,
      };
      // Cascade winners to the next round. Home-side tiebreak (no draws in knockout rugby).
      const winnerId = (event.homeScore >= event.awayScore ? target.homeId : target.awayId) ?? null;
      if (winnerId !== null) {
        if (event.stage === 'r16') {
          const qfIndex = Math.floor(event.matchIndex / 2);
          const isHome = event.matchIndex % 2 === 0;
          const qf = ko.quarterfinals[qfIndex];
          if (qf) {
            if (isHome && !qf.homeId) qf.homeId = winnerId;
            else if (!isHome && !qf.awayId) qf.awayId = winnerId;
          }
        } else if (event.stage === 'quarterfinal') {
          const sfIndex = Math.floor(event.matchIndex / 2);
          const isHome = event.matchIndex % 2 === 0;
          const sf = ko.semifinals[sfIndex];
          if (sf) {
            if (isHome && !sf.homeId) sf.homeId = winnerId;
            else if (!isHome && !sf.awayId) sf.awayId = winnerId;
          }
        } else if (event.stage === 'semifinal') {
          if (event.matchIndex === 0 && !ko.final.homeId) ko.final.homeId = winnerId;
          else if (event.matchIndex === 1 && !ko.final.awayId) ko.final.awayId = winnerId;
        } else {
          ko.championTeamId = winnerId;
        }
      }
      return;
    }
    default: {
      const _: never = event;
      void _;
      return;
    }
  }
}

function pickPlayoffMatch(
  playoffs: { semifinals: [PlayoffMatch, PlayoffMatch]; final: PlayoffMatch },
  kind: 'semifinal_1' | 'semifinal_2' | 'final',
): PlayoffMatch | null {
  if (kind === 'semifinal_1') return playoffs.semifinals[0];
  if (kind === 'semifinal_2') return playoffs.semifinals[1];
  if (kind === 'final')       return playoffs.final;
  return null;
}

// Winner's teamId from a resolved playoff match. Ties intentionally fall
// to the home side: knockout rugby has no draws (extra time + golden
// point) but the model doesn't simulate that yet, so the home-side
// fallback gives a stable result without adding a separate "draw"
// branch. Returns null when the match is unresolved or its team slots
// are still empty.
function playoffWinnerId(match: PlayoffMatch): string | null {
  if (!match.result || !match.homeId || !match.awayId) return null;
  return match.result.homeScore >= match.result.awayScore ? match.homeId : match.awayId;
}

// Deep-clone a PremCupState for restore (fromSave) — mirrors clonePlayoffs.
function cloneCup(cup: PremCupState): PremCupState {
  const cloneKo = (m: CupKnockoutMatch): CupKnockoutMatch => ({
    ...m,
    ...(m.result ? { result: { ...m.result } } : {}),
  });
  return {
    seasonLabel: cup.seasonLabel,
    pools: [
      { id: 'A', teamIds: [...cup.pools[0].teamIds], standings: cup.pools[0].standings.map(s => ({ ...s })) },
      { id: 'B', teamIds: [...cup.pools[1].teamIds], standings: cup.pools[1].standings.map(s => ({ ...s })) },
    ],
    fixtures: cup.fixtures.map(f => ({ ...f, ...(f.result ? { result: { ...f.result } } : {}) })),
    knockout: cup.knockout
      ? {
          semifinals: [cloneKo(cup.knockout.semifinals[0]), cloneKo(cup.knockout.semifinals[1])],
          final: cloneKo(cup.knockout.final),
          championTeamId: cup.knockout.championTeamId,
        }
      : null,
  };
}

function pickCupMatch(
  ko: { semifinals: [CupKnockoutMatch, CupKnockoutMatch]; final: CupKnockoutMatch },
  kind: 'semifinal_1' | 'semifinal_2' | 'final',
): CupKnockoutMatch | null {
  if (kind === 'semifinal_1') return ko.semifinals[0];
  if (kind === 'semifinal_2') return ko.semifinals[1];
  if (kind === 'final')       return ko.final;
  return null;
}

// Winner's teamId from a resolved cup knockout match. Home-side tiebreak,
// same convention as playoffWinnerId (no draws in knockout rugby).
function cupWinnerId(match: CupKnockoutMatch): string | null {
  if (!match.result || !match.homeId || !match.awayId) return null;
  return match.result.homeScore >= match.result.awayScore ? match.homeId : match.awayId;
}

// Deep-clone an EuropeanCompState for restore (CAREER_ARCHIVE_RESTORED).
function cloneEuropean(comp: EuropeanCompState): EuropeanCompState {
  const cloneMatch = (m: EuropeanKnockoutMatch): EuropeanKnockoutMatch => ({
    ...m,
    ...(m.result ? { result: { ...m.result } } : {}),
  });
  return {
    seasonLabel: comp.seasonLabel,
    competition: comp.competition,
    pools: comp.pools.map(p => ({
      id: p.id,
      teamIds: [...p.teamIds],
      standings: p.standings.map(s => ({ ...s })),
    })),
    fixtures: comp.fixtures.map(f => ({ ...f, ...(f.result ? { result: { ...f.result } } : {}) })),
    knockout: comp.knockout
      ? {
          r16: comp.knockout.r16.map(cloneMatch),
          quarterfinals: comp.knockout.quarterfinals.map(cloneMatch),
          semifinals: [cloneMatch(comp.knockout.semifinals[0]), cloneMatch(comp.knockout.semifinals[1])],
          final: cloneMatch(comp.knockout.final),
          championTeamId: comp.knockout.championTeamId,
        }
      : null,
  };
}

function cloneLeaders(l: import('../types/gameState').SeasonAwards): import('../types/gameState').SeasonAwards {
  return {
    topTries:   l.topTries.map(x => ({ ...x })),
    topCarries: l.topCarries.map(x => ({ ...x })),
    topTackles: l.topTackles.map(x => ({ ...x })),
    topRating:  l.topRating.map(x => ({ ...x })),
  };
}

function clonePlayerHistory(
  h: Record<number, import('../types/gameState').ArchivedPlayerSeason>,
): Record<number, import('../types/gameState').ArchivedPlayerSeason> {
  const out: Record<number, import('../types/gameState').ArchivedPlayerSeason> = {};
  for (const k of Object.keys(h)) {
    out[Number(k)] = { ...h[Number(k)] };
  }
  return out;
}

function findOrCreate(standings: TeamStanding[], teamId: string): TeamStanding {
  let s = standings.find(x => x.teamId === teamId);
  if (!s) {
    s = zeroStanding(teamId);
    standings.push(s);
  }
  return s;
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
