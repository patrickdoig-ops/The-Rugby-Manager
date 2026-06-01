// Season-scope mutation seam. The only writer to GameState.
// Mirrors the convention of src/engine/applyMatchEvent.ts — every union
// variant has a single branch, and the exhaustive `default: const _: never`
// catches missing branches at compile time when SeasonEvent grows.

import type { CupKnockoutMatch, Fixture, GameState, PlayoffMatch, PremCupState, SeasonEvent, TeamSeasonStats, TeamStanding } from '../types/gameState';
import { zeroStanding, zeroTeamSeasonStats } from '../types/gameState';
import { zeroSeasonStats } from '../types/player';
import { LEAGUE_POINTS, SEASON_VALUES, SENIOR_CAP, EFFECTIVE_CAP_CREDITS, FORM_MODEL } from '../engine/balance';

// Sum of senior cap + dispensation credits — the league's absolute
// ceiling on any club's non-marquee wage spend. The takeover boost
// clamps to this so a Bath-level budget doesn't break through.
const SENIOR_CAP_TOTAL = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;
import { assertSeasonInvariants } from './seasonInvariants';

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
      return;
    }
    case 'FIXTURE_RESULT_RECORDED': {
      state.league.results.push(event.result);
      const home = findOrCreate(state.league.standings, event.result.homeId);
      const away = findOrCreate(state.league.standings, event.result.awayId);
      const margin = event.result.homeScore - event.result.awayScore;
      applyToSide(home, event.result.homeScore, event.result.awayScore, event.result.homeTries, margin);
      applyToSide(away, event.result.awayScore, event.result.homeScore, event.result.awayTries, -margin);
      return;
    }
    case 'WEEK_ADVANCED': {
      state.calendar.week += 1;
      const nextRoundDate = earliestDateForRound(state.league.fixtures, state.calendar.week);
      state.calendar.date = nextRoundDate ?? addDays(state.calendar.date, SEASON_VALUES.weekLengthDays);
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
      state.career.clubs = event.clubs.map(c => ({ id: c.id, squad: [...c.squad], salaryBudget: c.salaryBudget }));
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
        ...(event.leaders ? { leaders: cloneLeaders(event.leaders) } : {}),
        ...(event.playerSeasonHistory ? { playerSeasonHistory: clonePlayerHistory(event.playerSeasonHistory) } : {}),
      });
      state.career.seasonsCompleted += 1;
      state.calendar.seasonLabel = event.newSeasonLabel;
      state.calendar.week = 1;
      state.league.fixtures = event.newFixtures.map(f => ({ ...f }));
      state.league.results = [];
      state.league.standings = state.league.standings.map(s => zeroStanding(s.teamId));
      state.calendar.date = earliestDateForRound(state.league.fixtures, 1) ?? state.calendar.date;
      // Reset per-player season aggregates for the new season. International
      // call-up flags + PGA rest obligations don't survive the rollover (the
      // next season's windows re-select fresh); internationalCaps accumulate.
      for (const id of Object.keys(state.career.roster)) {
        const p = state.career.roster[Number(id)];
        p.seasonStats = zeroSeasonStats();
        if (p.recentRatings) p.recentRatings = undefined;
        if (p.formReturn) p.formReturn = undefined;
        if (p.restObligation) p.restObligation = undefined;
        if (p.internationalDuty) p.internationalDuty = undefined;
        if (p.lionsReturnRound !== undefined) p.lionsReturnRound = undefined;
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
      // Pending moves should already have been processed via
      // TRANSFER_ACTIVATED events fired by careerRollover before this
      // SEASON_ROLLED_OVER; clear the list as a safety net.
      state.career.pendingMoves = [];
      // Mid-season rejection cooldowns don't survive the rollover —
      // the FA pool itself gets reshuffled, so the per-rosterId locks
      // become stale.
      state.career.midseasonRejections = {};
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
      applyToSide(home, event.homeScore, event.awayScore, event.homeTries, margin);
      applyToSide(away, event.awayScore, event.homeScore, event.awayTries, -margin);
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

function applyToSide(s: TeamStanding, pf: number, pa: number, tries: number, margin: number): void {
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
      s.losingBonus += 1;
    }
  }
  // Try bonus is independent of the result — a 4-try loss still earns it.
  if (tries >= LEAGUE_POINTS.tryBonusThreshold) {
    s.leaguePoints += LEAGUE_POINTS.tryBonusPoints;
    s.tryBonus += 1;
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
