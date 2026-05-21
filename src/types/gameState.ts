// Game-engine (season-scope) state and mutation event union.
//
// Analogous to src/types/match.ts (MatchState + MatchEvent), but operating at
// season scope: calendar, fixtures, results, standings. Owned by
// GameCoordinator; mutated only through applySeasonEvent.
//
// Naming: this union is `SeasonEvent` rather than `GameEvent` because the
// latter is already taken by the in-match commentary log type in
// src/types/match.ts. The two are unrelated.

import type { TeamTactics } from './team';
import type { Player, PlayerStats } from './player';

export interface Fixture {
  round: number;
  homeId: string;
  awayId: string;
  // ISO yyyy-mm-dd. Optional so future random-gen schedules can omit it;
  // when present, the calendar advances to per-round dates rather than the
  // flat +7-day fallback in applySeasonEvent.
  date?: string;
}

export interface SeasonSchedule {
  seasonLabel: string;
  fixtures: Fixture[];
}

export interface FixtureResult {
  round: number;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  playerSide: 'home' | 'away' | null;
}

export interface TeamStanding {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  leaguePoints: number;
}

export interface Calendar {
  date: string;        // ISO yyyy-mm-dd
  week: number;        // 1-based; week 1 = first round
  seasonLabel: string; // e.g. "2025/26 Season"
}

export interface League {
  fixtures: Fixture[];   // all rounds, generated once at season start
  results: FixtureResult[];
  standings: TeamStanding[];
}

// Stable reference to a real player across save/load and across raw-team
// regenerations. Full names are unique league-wide (see CLAUDE.md "Team
// data"), so a name pair is enough — no IDs needed (and IDs shift on
// pre-match swaps).
export interface PlayerRef {
  firstName: string;
  lastName: string;
}

// Per-club roster pointer. `squad` holds rosterIds of every player signed
// to the club. Order is starters-first then bench then wider squad — the
// matchday selector consumes it via applyMatchdaySquad.
export interface ClubState {
  id: string;
  squad: number[];
}

// End-of-season snapshot — final standings + awards. Appended on every
// SEASON_ROLLED_OVER for the season just completed.
export interface ArchivedSeason {
  seasonLabel: string;
  standings: TeamStanding[];
  topScorerRosterId: number | null;
  mvpRosterId: number | null;
}

// A renewal / signing offer surfaced during the end-of-season market
// window. `fromClubId` === `rosterId`'s current club on a renewal offer;
// cross-club poaching (Reg 7) lands in Phase 6 with the same shape.
// `id` is deterministic from (seasonsCompleted, fromClubId, rosterId)
// so save/restore round-trips identically.
export interface TransferOffer {
  id: string;
  fromClubId: string;
  rosterId: number;
  annualWage: number;
  lengthYears: number;        // 1-3
  isMarquee: boolean;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  rejectionReason?: 'wage' | 'ambition' | 'cap_overcommit';
}

// Transient state during the end-of-season market window. Populated by
// MARKET_OPENED, mutated by OFFER_SENT / OFFER_RESPONDED, cleared by
// MARKET_CLOSED. Persisted in v7+ saves so closing the tab mid-window
// resumes at the same state.
export interface MarketState {
  openedAfterSeason: string;  // seasonLabel of the just-completed season
  expiringRosterIds: number[];
  offers: TransferOffer[];
}

// Multi-season career state — the persistent roster of every senior player
// across every club, plus per-club squad pointers and historical archive.
// Seeded once at first-ever new-game start (ROSTER_SEEDED); mutates only
// via PLAYER_*, SEASON_ROLLED_OVER, and Phase 3+ transfer/contract events.
export interface CareerState {
  seasonsCompleted: number;
  archive: ArchivedSeason[];
  clubs: ClubState[];
  roster: Record<number, Player>; // key: rosterId
  nextRosterId: number;
  // Unsigned players whose contracts have expired without renewal.
  // Phase 4 populates the pool; Phase 5 adds the sign-from-pool flow.
  freeAgents: number[];
  // Live during the end-of-season renewal window only; null otherwise.
  market: MarketState | null;
}

export interface GameState {
  calendar: Calendar;
  league: League;
  player: {
    teamId: string;
    // Persisted preferences from the previous pre-match commit. Undefined
    // means "fall back to authored defaults" (DEFAULT_TACTICS for tactics,
    // raw team JSON order for matchdaySquad). Set via PLAYER_TACTICS_SET /
    // PLAYER_MATCHDAY_SQUAD_SET and consumed only by PreMatchScreen.
    tactics?: TeamTactics;
    matchdaySquad?: PlayerRef[]; // length 23: slots 1-15 starters, 16-23 bench
  };
  seed: number;
  career: CareerState;
}

export function emptyCareerState(): CareerState {
  return {
    seasonsCompleted: 0,
    archive: [],
    clubs: [],
    roster: {},
    nextRosterId: 1,
    freeAgents: [],
    market: null,
  };
}

export function zeroStanding(teamId: string): TeamStanding {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointsDiff: 0,
    leaguePoints: 0,
  };
}

export type SeasonEvent =
  | {
      type: 'SEASON_INITIALIZED';
      playerTeamId: string;
      seed: number;
      teamIds: string[];          // drives standings init
      schedule: SeasonSchedule;
    }
  | {
      type: 'FIXTURE_RESULT_RECORDED';
      result: FixtureResult;
    }
  | {
      type: 'WEEK_ADVANCED';
    }
  | {
      type: 'PLAYER_TACTICS_SET';
      tactics: TeamTactics;
    }
  | {
      type: 'PLAYER_MATCHDAY_SQUAD_SET';
      squad: PlayerRef[];
    }
  | {
      type: 'ROSTER_SEEDED';
      roster: Record<number, Player>;
      clubs: ClubState[];
      nextRosterId: number;
    }
  | {
      type: 'PLAYER_SEASON_STATS_ACCUMULATED';
      rosterId: number;
      // Delta added to roster[rosterId].seasonStats. Caller pre-computes
      // each field from one fixture's MatchState (silent and live).
      statsDelta: {
        appearances: number; tries: number; conversions: number;
        penaltiesScored: number; dropGoals: number;
        yellowCards: number; redCards: number;
        tackles: number; missedTackles: number; turnoversWon: number;
        ratingSum: number;
      };
    }
  | {
      type: 'PLAYER_AGED';
      rosterId: number;
      statDeltas: Partial<PlayerStats>;
    }
  | {
      type: 'PLAYER_RETIRED';
      rosterId: number;
      clubId: string;             // for archive context; player stays in roster
    }
  | {
      // Re-points (or clears) a club's marquee slot. Clears the
      // contract.isMarquee flag on the previous marquee in the same
      // club's squad (if any), then sets it on the new one. Passing
      // `rosterId: null` clears without re-designating.
      type: 'MARQUEE_DESIGNATED';
      clubId: string;
      rosterId: number | null;
    }
  | {
      // Opens the end-of-season renewal window. Seeds state.career.market
      // with the list of players whose contracts expire this rollover
      // plus the proposed renewal terms (one TransferOffer per expiring
      // player, status 'pending'). Fired by GameCoordinator.openRenewalWindow.
      type: 'MARKET_OPENED';
      expiringRosterIds: number[];
      offers: TransferOffer[];
    }
  | {
      // Closes the renewal window. Clears state.career.market.
      // Contract decisions (accepts / rejections) fire as separate
      // OFFER_RESPONDED + CONTRACT_EXTENDED / CONTRACT_TERMINATED
      // events before this one.
      type: 'MARKET_CLOSED';
    }
  | {
      // New offer entry added to state.career.market.offers. Phase 4 only
      // ever fires this for renewals; Phases 5-6 reuse the same variant
      // for free-agent signings + cross-club poaching.
      type: 'OFFER_SENT';
      offer: TransferOffer;
    }
  | {
      // Marks an existing offer accepted or rejected. Does not by itself
      // mutate the player's contract — that flows through
      // CONTRACT_EXTENDED (renewals) or CONTRACT_SIGNED (signings, Phase 5+).
      type: 'OFFER_RESPONDED';
      offerId: string;
      accept: boolean;
      reason?: 'wage' | 'ambition' | 'cap_overcommit';
    }
  | {
      // Renewal landed — updates the player's contract terms in place.
      // ClubId is unchanged (same club extending an existing player).
      type: 'CONTRACT_EXTENDED';
      rosterId: number;
      newExpiresOn: string;
      newAnnualWage: number;
    }
  | {
      // Removes a player from their current club's squad and adds them
      // to state.career.freeAgents. Used by Phase 4 for unrenewed
      // expiring contracts ('expired') and Phase 5+ for proactive
      // releases ('released'). 'retired' would be conceptually valid
      // but is currently handled separately via PLAYER_RETIRED.
      type: 'CONTRACT_TERMINATED';
      rosterId: number;
      reason: 'released' | 'expired' | 'retired';
    }
  | {
      // fromSave-only: restores the cumulative career counters that
      // SEASON_ROLLED_OVER would otherwise build incrementally. Keeps
      // every state.career.* write inside applySeasonEvent so the
      // mutation boundary stays clean (CLAUDE.md §5).
      type: 'CAREER_ARCHIVE_RESTORED';
      seasonsCompleted: number;
      archive: ArchivedSeason[];
    }
  | {
      type: 'SEASON_ROLLED_OVER';
      newSeasonLabel: string;
      newFixtures: Fixture[];
      archivedStandings: TeamStanding[];
      topScorerRosterId: number | null;
      mvpRosterId: number | null;
    };
