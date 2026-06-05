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
import type { InjuryKind, InjurySeverity, InternationalWindow, MoraleReason, Player, PlayerStats, SquadStatusKey } from './player';
import type { TrainingPlan } from './training';
import type { BoardAmbition } from './teamData';

// Persistent owner-confidence state for the managed club — the career
// fail-state spine. Seeded at season start from ambition + prior finish,
// moved by results/streaks/objective judgement, and the basis for the
// final-warning → sacking flow. See src/game/board.ts for the logic and
// src/engine/balance/board.ts for the tuning numbers.
export interface BoardState {
  confidence: number;        // 0–100
  objective: BoardAmbition;  // the season target the owner judges against
  warningIssued: boolean;    // final-warning latch, reset each season
  sacked: boolean;           // mid-season sack latch — persisted so a reload
                             // between the result and the game-over screen
                             // can't escape the dismissal. Reset each season.
}

export interface Fixture {
  round: number;
  homeId: string;
  awayId: string;
  // ISO yyyy-mm-dd. Optional so future random-gen schedules can omit it;
  // when present, the calendar advances to per-round dates rather than the
  // flat +7-day fallback in applySeasonEvent.
  date?: string;
  // Set on the two dedicated derby rounds (Derby Weekend + Big Match Weekend).
  // Drives the visual badge on fixture rows in the fixture list.
  isDerby?: true;
  // Alternative venue name when a match is played outside the home club's
  // regular ground. Home advantage is unchanged — the larger venue is still
  // a home fixture.
  venue?: string;
  // Capacity of the alternative venue, shown as display-only flavour.
  venueCapacity?: number;
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
  // Per-side try counts. Needed for try-bonus determination (4+ tries
  // → +1 LP). Optional shape on the type would tempt callers to forget
  // them, so they're required and v10-era saves backfill with 0 on load
  // (see SaveManager).
  homeTries: number;
  awayTries: number;
  playerSide: 'home' | 'away' | null;
  // Per-fixture team stats snapshot. Populated at fixture-record time
  // from MatchSnapshot.homeSummary / awaySummary so RoundResults can
  // surface possession / territory / set-piece breakdowns on tap-expand.
  // Optional because v19 saves don't carry it (back-filled undefined).
  homeStats?: TeamSeasonStats;
  awayStats?: TeamSeasonStats;
  // Computed at record-time from the attendance model. Absent on pre-v24 saves.
  attendance?: number;
}

// A generated media story (newspaper/podcast/TV/YouTuber/X take) about the
// player's club, dropped into the inbox after a fixture. Pure flavour — no
// gameplay effect. `round` is the fixture it reacts to (0 = pre-season
// prediction). Generated deterministically at record time (src/game/media)
// and persisted on League.mediaStories so it survives save/load. Reset at
// SEASON_ROLLED_OVER alongside results.
export interface MediaStory {
  id: string;
  round: number;
  subject: string;
  body: string;
  outlet: string;
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
  // Bonus-point counters surfaced in the league table column. tryBonus
  // and losingBonus both already roll into leaguePoints inside applyToSide;
  // these fields are the running totals so the UI can display them
  // without re-deriving from results history.
  tryBonus: number;
  losingBonus: number;
  leaguePoints: number;
}

export interface Calendar {
  date: string;        // ISO yyyy-mm-dd
  week: number;        // 1-based; week 1 = first round
  seasonLabel: string; // e.g. "2025/26 Season"
}

// Team-scope season aggregates accumulated per fixture. Keyed by teamId.
// Reset on SEASON_ROLLED_OVER alongside Player.seasonStats. The two
// sub-blocks come from different sources at snapshot time:
//   - possession / territory / set-piece / entries from MatchState.stats
//   - tries / line breaks / carries / metres / tackles / kicks / cards
//     summed from PlayerMatchStats across the matchday squad
// (Same split as scripts/telemetry.ts::sumMatchStats — re-derived in
// the post-match collector so the two stay in lock-step.)
export interface TeamSeasonStats {
  matchesPlayed:      number;
  // Possession (raw seconds; pct = possessionSeconds / matchSeconds at read)
  possessionSeconds:  number;
  territorySeconds:   number;
  matchSeconds:       number;
  // Attack
  tries:              number;
  lineBreaks:         number;
  defendersBeaten:    number;
  offloadsCompleted:  number;
  carries:            number;
  metresCarried:      number;
  // Defence
  tacklesAttempted:   number;
  tacklesMade:        number;
  turnoversWon:       number;
  // Kicking from hand
  kicksFromHand:      number;
  kickMetres:         number;
  // Set piece
  lineoutsThrown:     number;
  lineoutsWon:        number;
  scrumsPutIn:        number;
  scrumsWon:          number;
  // Entries 22
  entries22:          number;
  entries22Points:    number;
  // Discipline
  knockOns:           number;
  yellowCards:        number;
  redCards:           number;
}

export function zeroTeamSeasonStats(): TeamSeasonStats {
  return {
    matchesPlayed: 0,
    possessionSeconds: 0, territorySeconds: 0, matchSeconds: 0,
    tries: 0, lineBreaks: 0, defendersBeaten: 0, offloadsCompleted: 0, carries: 0, metresCarried: 0,
    tacklesAttempted: 0, tacklesMade: 0, turnoversWon: 0,
    kicksFromHand: 0, kickMetres: 0,
    lineoutsThrown: 0, lineoutsWon: 0, scrumsPutIn: 0, scrumsWon: 0,
    entries22: 0, entries22Points: 0,
    knockOns: 0, yellowCards: 0, redCards: 0,
  };
}

export interface League {
  fixtures: Fixture[];   // all rounds, generated once at season start
  results: FixtureResult[];
  standings: TeamStanding[];
  // Per-team season aggregates accumulated post-match. Keyed by teamId
  // (RawTeamInput.id). Re-zeroed at SEASON_ROLLED_OVER.
  teamSeasonStats: Record<string, TeamSeasonStats>;
  // Knockout playoffs that follow the regular season. Null while regular
  // fixtures are still being played and after SEASON_ROLLED_OVER resets
  // the slate. Seeded by PLAYOFF_BRACKET_SEEDED once the final regular-
  // season fixture is recorded; populated by PLAYOFF_RESULT_RECORDED as
  // the three knockout matches resolve.
  playoffs: PlayoffState | null;
  // The Prem Cup, contested during the two international breaks. Null until
  // PREM_CUP_SEEDED fires (at newSeason / rollover); reset at
  // SEASON_ROLLED_OVER. Nullable so older saves load unchanged.
  premCup: PremCupState | null;
  // Generated media stories about the player's club, newest appended. Pushed
  // by MEDIA_STORY_PUBLISHED at fixture-record time; the inbox surfaces only
  // the latest round. Re-zeroed at SEASON_ROLLED_OVER.
  mediaStories: MediaStory[];
}

// One of the three knockout matches. `homeSeed`/`awaySeed` are the team's
// rank in the final regular-season standings (1-4) — recorded at seed
// time so the bracket UI can render "1 v 4" / "2 v 3" badges. For the
// final, both seeds are null since the matchup is SF-winner-derived.
//
// The final's venue is neutral (Twickenham) — engine-side this is
// signalled via state.engine.neutralVenue, set by MatchCoordinator from
// the call site rather than read off this shape.
export interface PlayoffMatch {
  kind: 'semifinal_1' | 'semifinal_2' | 'final';
  homeId: string | null;
  awayId: string | null;
  homeSeed: 1 | 2 | 3 | 4 | null;
  awaySeed: 1 | 2 | 3 | 4 | null;
  // ISO yyyy-mm-dd. Set at bracket-seed time. SFs synthesised at
  // R18+6 days, final at R18+13 days, anchored to the real-world
  // season playoff cadence.
  date: string;
  result?: {
    homeScore: number;
    awayScore: number;
    homeTries: number;
    awayTries: number;
    // 'home' / 'away' when the player's team is in the match; null for
    // pure AI ties.
    playerSide: 'home' | 'away' | null;
  };
}

export interface PlayoffState {
  // Fixed pair ordering: index 0 is semifinal_1 (1v4), index 1 is
  // semifinal_2 (2v3). The reducer relies on this index → kind mapping
  // when cascading SF winners into the final.
  semifinals: [PlayoffMatch, PlayoffMatch];
  final: PlayoffMatch;
  // Set by PLAYOFF_RESULT_RECORDED when the final resolves. Lives here
  // while the playoffs are active; archived onto ArchivedSeason at
  // SEASON_ROLLED_OVER, after which `playoffs` resets to null.
  championTeamId: string | null;
}

// ── Prem Cup ───────────────────────────────────────────────────────────
// The Prem Rugby Cup, contested entirely during the two international
// breaks (Autumn / Six Nations) and run headless by the Assistant Manager.
// Season-scoped like `playoffs`: seeded once per season, cleared at
// SEASON_ROLLED_OVER; the champion archives onto ArchivedSeason.

// One pool of 5 clubs. `standings` reuses the league TeamStanding shape so
// sortStandings + the league-table renderer work unchanged; it is scoped
// to this pool (NOT part of state.league.standings).
export interface CupPool {
  id: 'A' | 'B';
  teamIds: string[];          // length 5
  standings: TeamStanding[];  // length 5
}

// A pool fixture. `leg` 0 = pre-season block (Sep, before R1), 1 = Autumn
// block, 2 = Six Nations block. `date` is synthetic (inside the block gap)
// and display-only — it never drives calendar advance.
export interface CupFixture {
  pool: 'A' | 'B';
  leg: 0 | 1 | 2;
  homeId: string;
  awayId: string;
  date: string;
  result?: { homeScore: number; awayScore: number; homeTries: number; awayTries: number };
}

// A knockout match — same structure family as PlayoffMatch. Played in the
// Six Nations block after the leg-2 pool stage completes.
export interface CupKnockoutMatch {
  kind: 'semifinal_1' | 'semifinal_2' | 'final';
  homeId: string | null;   // null until the pool stage / SFs resolve
  awayId: string | null;
  date: string;
  result?: { homeScore: number; awayScore: number; homeTries: number; awayTries: number };
}

export interface CupKnockout {
  // SF1 = winner(A) v runner-up(B); SF2 = winner(B) v runner-up(A).
  semifinals: [CupKnockoutMatch, CupKnockoutMatch];
  final: CupKnockoutMatch;
  championTeamId: string | null;
}

export interface PremCupState {
  seasonLabel: string;
  pools: [CupPool, CupPool];   // index 0 = A, index 1 = B
  fixtures: CupFixture[];      // 40 pool fixtures (20/pool: leg0 4 + leg1 8 + leg2 8)
  knockout: CupKnockout | null; // null until the leg-2 pool stage completes
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
//
// `salaryBudget` is the owner-set cap on non-marquee wages — distinct
// from the league's effective cap (EFFECTIVE_CAP £7.8m), which is the
// absolute ceiling. The budget bites first: signings + renewals are
// hard-constrained against this value (CLAUDE.md § Budgets). Seeded
// from CLUB_SALARY_BUDGETS_2025_26 at ROSTER_SEEDED, adjusted each
// rollover by performance via CLUB_BUDGET_SET, and topped up by
// CLUB_TAKEOVER when a club gets a Red Bull-style cash injection.
export interface ClubState {
  id: string;
  squad: number[];
  salaryBudget: number;
  staffBudget?: number;
  staffBudgetBoost?: number; // season-only transfer from player salary headroom to staff
}

// One row of an archived per-category leaderboard — top-N at end of season.
export interface SeasonLeader {
  rosterId: number;
  value: number;
}

// Top-3 per category captured at SEASON_ROLLED_OVER. Lets historic
// leaderboards survive a roll even though state.career.roster's
// seasonStats are re-zeroed for the new season.
export interface SeasonAwards {
  topTries:    SeasonLeader[];
  topCarries:  SeasonLeader[];
  topTackles:  SeasonLeader[];
  topRating:   SeasonLeader[];  // by ratingSum / appearances, min appearances guard
}

// Per-player season snapshot archived at SEASON_ROLLED_OVER. Keyed by
// rosterId on the parent ArchivedSeason.playerSeasonHistory map. Captures
// the headline numbers + the club the player was at that season-end so
// PlayerProfileScreen's Career History table can render a "club at the
// time" column even after the player moves clubs in subsequent years.
// Players with zero appearances are omitted from the map to keep the
// payload small (a 480-player league has ~100 unused bench / wider squad
// players that never see the pitch in any given season).
export interface ArchivedPlayerSeason {
  clubId: string;            // contract.clubId at the moment of archive
  apps: number;
  ratingSum: number;         // avg = ratingSum / apps
  tries: number;
  carries: number;
  metresCarried: number;
  lineBreaks: number;
  tackles: number;
  turnoversWon: number;
  kicksMade: number;
  kicksAtGoal: number;
  yellowCards: number;
  redCards: number;
}

// End-of-season snapshot — final standings + awards. Appended on every
// SEASON_ROLLED_OVER for the season just completed.
export interface ArchivedSeason {
  seasonLabel: string;
  standings: TeamStanding[];
  topScorerRosterId: number | null;   // kept for back-compat; equals leaders.topTries[0]?.rosterId
  mvpRosterId: number | null;         // kept for back-compat; equals leaders.topRating[0]?.rosterId
  leaders?: SeasonAwards;             // top-3 per category. Optional so v8 archives load.
  // The playoff champion (league Final winner) for this season.
  // Null when archived without a playoff run — covers pre-v13 saves
  // whose archive entries predate the playoffs system.
  championTeamId: string | null;
  // The Prem Cup champion for this season. Optional so archives written
  // before the cup system load unchanged (renders as "—" in history).
  premCupChampionTeamId?: string | null;
  // Per-player season snapshot, keyed by rosterId. Only players who
  // took the field (apps > 0) are present. Optional so v18 and older
  // archive entries load without the field — PlayerProfileScreen
  // renders an empty Career History for historical seasons in that
  // case. v19+ saves always include it (possibly empty for a
  // played-but-recorded-zero edge case).
  playerSeasonHistory?: Record<number, ArchivedPlayerSeason>;
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
  // The player's resolved squad status at offer-generation time. Informs
  // the renewal UI and feeds into acceptance probability (status mismatch).
  squadStatus?: SquadStatusKey;
}

// Transient state during the end-of-season market window. Populated by
// MARKET_OPENED, mutated by OFFER_SENT / OFFER_RESPONDED, cleared by
// MARKET_CLOSED. Persisted in v7+ saves so closing the tab mid-window
// resumes at the same state.
//
// `phase` discriminates the market kinds:
//   'renewals'          — end-of-season renewal window; one offer per
//                         expiring player league-wide.
//   'signings'          — end-of-season free-agent + Reg 7 window; one
//                         offer per free agent + poach candidate.
//   'signings-midseason' — Hub → Transfers mid-season free-agent
//                         signings. Free-agent offers only; no Reg 7.
//                         User-only bids (no AI competition mid-season).
//   'poach-midseason'   — mid-season Reg 7 approach window; one offer per
//                         the user's own at-risk player, AI poach bids
//                         pre-submitted, user retains or lets them
//                         pre-agree to leave at the next rollover.
// v7 saves load with `phase` defaulting to 'renewals' for backward
// compat. v15 saves with phase === 'signings' continue to work; v16
// added the third variant.
export interface MarketState {
  phase: 'renewals' | 'signings' | 'signings-midseason' | 'poach-midseason';
  openedAfterSeason: string;  // seasonLabel of the just-completed season
  expiringRosterIds: number[]; // empty during the signings phase
  offers: TransferOffer[];
  // Competing bids submitted within the signing window. Each Make Offer
  // (user) or AI bid pass creates entries here; resolution at the end
  // of each round picks winners by appeal score. Always present so the
  // reducer can append unconditionally; renewal-phase markets keep an
  // empty array. v15+ field.
  bids: TransferBid[];
}

// A single club's bid for a free agent / poach candidate / retention.
// Multiple bids per player are expected (the whole point — competitive
// bidding). All bids for one player share the same `annualWage` (the
// player's asking wage from market.offers); appeal scoring picks the
// winner, not wage size.
//
// `kind` discriminates:
//   - 'free_agent' : bid for a player in state.career.freeAgents
//   - 'poach'      : Reg 7 pre-agreement attempt (player at another club's
//                    final-12-month roster). Wins activate at the next
//                    rollover via PRE_AGREEMENT_SIGNED → TRANSFER_ACTIVATED.
//   - 'retention'  : the player's current club bidding to keep them
//                    against an external poach. Wins fire CONTRACT_EXTENDED
//                    in place — player stays put with a new deal.
//
// `status`:
//   - 'pending'    : in play, will be resolved at the next Submit
//   - 'won'        : resolution awarded this bid (signing fired)
//   - 'lost'       : resolution went to a different club (wage refunded)
//   - 'withdrawn'  : user clicked Withdraw before resolution
export interface TransferBid {
  id: string;                                      // deterministic from (rosterId, clubId)
  rosterId: number;
  clubId: string;
  annualWage: number;
  lengthYears: number;
  kind: 'free_agent' | 'poach' | 'retention';
  status: 'pending' | 'won' | 'lost' | 'withdrawn';
}

// Cross-Prem pre-agreement (Phase 6 / Reg 7). A player whose contract
// enters its final 12 months can be approached by another club; if both
// sides agree, the move activates at the *next* SEASON_ROLLED_OVER
// rather than immediately. The player completes the current season at
// their existing club before switching.
export interface PreAgreement {
  rosterId: number;
  fromClubId: string;     // current club (for the year they'll still play)
  toClubId: string;       // new club at next rollover
  annualWage: number;     // wage at new club
  lengthYears: number;    // 1-3
}

// ── Staff system (1.2) ───────────────────────────────────────────────────────
export type StaffRole = 'assistant' | 'fitness' | 'scout';

export interface StaffMember {
  id: string;          // stable UUID-style string; unique across all staff
  role: StaffRole;
  name: string;
  rating: number;      // 0–100
  annualWage: number;
  clubId: string | null; // null = free pool (unhired); managed-club id = hired
}

// ── Scouting system (1.1) ────────────────────────────────────────────────────
// Per-target knowledge record. `accuracy` runs 0–100; 0 means "only heard
// of them" (±10 bands on every attribute), 100 means exact (own-squad
// level). `assignedScoutId` names the hired scout currently working on this
// target; absent means the target is being passively held, not actively
// advanced this week.
export interface ScoutingRecord {
  accuracy: number;
  assignedScoutId?: string;
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
  // Pending cross-club moves agreed in the just-completed off-season
  // but not yet activated (Reg 7 — Phase 6). careerRollover processes
  // them on SEASON_ROLLED_OVER: each agreement turns into a CONTRACT_TERMINATED
  // on the old club + CONTRACT_SIGNED on the new club.
  pendingMoves: PreAgreement[];
  // Squad Builder mode resumption flag. Set to 'overview' when the
  // unwind has just applied and the Squad Overview is showing,
  // 'signings' when the pre-season signing window is open, 'marquee'
  // when that window has closed and the marquee step is pending,
  // undefined otherwise (the common case — outside Squad Builder,
  // this is always undefined). continueGame reads this to route the
  // user back to the right pre-season screen if they closed the tab
  // mid-flow.
  preSeasonStep?: 'overview' | 'signings' | 'marquee';
  // ClubIds that have been taken over (Red Bull at year 2; random
  // investor takeovers from year 3+). Each club can only be taken over
  // once in their lifetime — the eligibility check on the random roll
  // skips clubs already in this list. Stable across saves.
  takeoverHistory: string[];
  // Mid-season free-agent rejection cooldowns. Keyed by rosterId; the
  // value is the earliest state.calendar.week at which the player can
  // be re-approached. WEEK_ADVANCED prunes entries that have aged out;
  // SEASON_ROLLED_OVER clears the whole map (rejections don't survive
  // the rollover, since the FA pool itself gets reshuffled).
  midseasonRejections: Record<number, number>;
  // RosterIds of the user's own players currently under AI poach threat
  // (assessed at each WEEK_ADVANCED). Drives the Transfers tile badge on
  // the Hub. Cleared when the mid-season market opens and at rollover.
  activePoachedIds: number[];
  // Staff pool + hired staff for the managed club. Free-pool entries have
  // clubId null; hired entries carry the managed club id. Additive-optional:
  // legacy saves load with this absent → treated as empty (no staff/pool).
  staff?: StaffMember[];
  // Monotonically-increasing counter for staff IDs, mirrors nextRosterId.
  // Absent on legacy saves → treated as 1.
  nextStaffId?: number;
  // Feature 2.3 — Loan System. RosterIds of generated loan-available
  // players, seeded once per season at newSeason() via loanPoolGenerator.
  // Absent until first seeded (legacy saves and pre-loan saves load fine).
  loanPool?: number[];
}

// Per-club budget-change reason chips for the BudgetRevealScreen.
// Carried on the CLUB_BUDGET_SET event so the screen renders the
// "why" without re-deriving from standings. The reducer doesn't look
// at this field — it's purely a display payload.
export type BudgetReason =
  | { kind: 'position';        value: number }   // final league position 1-10
  | { kind: 'sf_appearance' }                    // lost in the semi-finals
  | { kind: 'finalist' }                         // reached the final (but didn't win)
  | { kind: 'champion' }
  | { kind: 'floor_applied' }                    // budget was clamped UP to the floor
  | { kind: 'cap_applied' };                     // budget was clamped DOWN to the effective cap

// Carried on CLUB_TAKEOVER. 'red_bull' is the hardcoded Newcastle
// year-2 takeover; 'investor' is the random year-3+ pathway.
export type TakeoverFlavor = 'red_bull' | 'investor';

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
    // Manager's training plan for the current week. Undefined ⇔ fall back to
    // DEFAULT_TRAINING_PLAN. Persists between weeks (last week's choice is
    // next week's default). Set via PLAYER_TRAINING_PLAN_SET.
    training?: TrainingPlan;
    // Assistant-Manager direction for the user's Prem Cup matches during the
    // international breaks. 'best' fields the strongest available 23;
    // 'rest_first_15' keeps the user's first-choice league starters out so
    // they stay fresh. Undefined ⇔ 'best'. Set via PLAYER_CUP_DIRECTION_SET.
    cupDirection?: 'best' | 'rest_first_15';
    // rosterId of the manager's nominated match captain. Undefined ⇔ no
    // explicit pick → resolveCaptainRosterId() falls back to the
    // highest-composure starter. Set via PLAYER_CAPTAIN_SET. Narrative-only:
    // the captain is named in the referee's team-22 warning, no mechanical
    // effect on the match.
    captainRosterId?: number;
    // Owner-confidence state for the managed club. Present once seeded at
    // season start (BOARD_STATE_SEEDED); undefined only on legacy saves
    // written before this system, where consumers fall back gracefully.
    board?: BoardState;
    // Per-target scouting knowledge. Keyed by rosterId. Absent = no entry
    // (treated as accuracy 0). Own-squad players are always fully visible
    // and have no entry here. Not present on legacy saves — falls back
    // gracefully (no scouting progress, no assigned scouts).
    scouting?: Record<number, ScoutingRecord>;
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
    pendingMoves: [],
    takeoverHistory: [],
    midseasonRejections: {},
    activePoachedIds: [],
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
    tryBonus: 0,
    losingBonus: 0,
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
  // Board confidence (the managed club's owner-confidence spine). Seeded
  // wholesale at season start / save-restore; adjusted on results; warned
  // latches the final warning; sacked latches the mid-season dismissal so a
  // reload can't escape it. The end-of-season sack is decided by the pure
  // GameCoordinator.judgeSeasonObjective() and writes no state.
  | {
      type: 'BOARD_STATE_SEEDED';
      confidence: number;
      objective: BoardAmbition;
      warningIssued: boolean;
      sacked: boolean;
    }
  | {
      type: 'BOARD_CONFIDENCE_ADJUSTED';
      delta: number;
      reason: string;
    }
  | {
      type: 'MANAGER_WARNED';
    }
  | {
      type: 'MANAGER_SACKED';
    }
  | {
      type: 'MEDIA_STORY_PUBLISHED';
      story: MediaStory;
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
      // Shape mirrors PlayerSeasonStats (minus the appearances pseudo-counter
      // which is always +1 per event today).
      statsDelta: {
        appearances:            number;
        starts:                 number;
        tries:                  number;
        carries:                number;
        metresCarried:          number;
        lineBreaks:             number;
        defendersBeaten:        number;
        passes:                 number;
        // Reserved for the goal-kicking split (see CLAUDE.md known gap);
        // always 0 today.
        conversions:            number;
        penaltiesScored:        number;
        dropGoals:              number;
        kicksFromHand:          number;
        kickMetres:             number;
        kicksAtGoal:            number;
        kicksMade:              number;
        tackles:                number;
        missedTackles:          number;
        dominantTackles:        number;
        turnoversWon:           number;
        lineoutThrows:          number;
        lineoutWins:            number;
        lineoutCatches:         number;
        lineoutSteals:          number;
        scrumPenaltiesWon:      number;
        scrumPenaltiesConceded: number;
        rucksHit:               number;
        yellowCards:            number;
        redCards:               number;
        ratingSum:              number;
      };
    }
  | {
      // Delta added to league.teamSeasonStats[teamId]. Caller pre-computes
      // the team-scope numbers from one fixture's MatchState — the
      // possession / territory / set-piece block comes from state.stats
      // directly, the attack / defence / kicking block is summed across
      // the team's matchday squad (mirrors telemetry sumMatchStats).
      // Two events fire per match (one home, one away).
      type: 'TEAM_SEASON_STATS_ACCUMULATED';
      teamId: string;
      statsDelta: TeamSeasonStats;
    }
  | {
      type: 'PLAYER_AGED';
      rosterId: number;
      statDeltas: Partial<PlayerStats>;
      reputationNudge?: number;
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
      // Opens a market window. Three phases share the shape:
      //   'renewals' — end-of-season; one offer per expiring player
      //     league-wide. User decides for own club; AI auto-resolves
      //     for the rest at close.
      //   'signings' — end-of-season; one offer per free agent + Reg 7
      //     poach candidate. Competitive bidding round-by-round.
      //   'signings-midseason' — Hub → Transfers; one offer per free
      //     agent (no Reg 7). User-only bids; rejected players go on
      //     career.midseasonRejections for a one-week cooldown.
      //   'poach-midseason' — mid-season Reg 7; one offer per the user's
      //     own at-risk player, AI poach bids pre-submitted at open.
      type: 'MARKET_OPENED';
      phase: 'renewals' | 'signings' | 'signings-midseason' | 'poach-midseason';
      expiringRosterIds: number[]; // empty when phase is a signings variant
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
      // expiring contracts ('expired'), Phase 5+ for proactive
      // releases ('released'), and Squad Builder mode for unwinding
      // the 2025-26 inbound transfers ('pre_season_unwind'). 'retired'
      // would be conceptually valid but is currently handled
      // separately via PLAYER_RETIRED.
      type: 'CONTRACT_TERMINATED';
      rosterId: number;
      reason: 'released' | 'expired' | 'retired' | 'pre_season_unwind';
    }
  | {
      // Signs a free-agent player to a new club. Removes the rosterId
      // from state.career.freeAgents, adds them to ClubState.squad,
      // sets contract.clubId + expiresOn + annualWage. isMarquee on
      // the contract is set from the offer (the signing club may
      // intend this signing as their marquee — call the
      // MARQUEE_DESIGNATED event separately if so).
      type: 'CONTRACT_SIGNED';
      rosterId: number;
      clubId: string;
      expiresOn: string;
      annualWage: number;
    }
  | {
      // Reg 7 pre-agreement: a contracted player at one club signs to
      // join another at the next rollover. Pushed to
      // state.career.pendingMoves; activated by careerRollover.
      type: 'PRE_AGREEMENT_SIGNED';
      agreement: PreAgreement;
    }
  | {
      // Reverses a PRE_AGREEMENT_SIGNED within the same signing window.
      // Drops the pending move for the given rosterId. UI-driven undo
      // path on TransferMarketScreen; no equivalent for already-activated
      // moves (those are permanent once rollover applies them).
      type: 'PRE_AGREEMENT_CANCELLED';
      rosterId: number;
    }
  | {
      // Activates a pre-agreement at rollover time. Atomic squad swap:
      // remove rosterId from the old club, add to the new, update
      // contract. Does NOT touch freeAgents — the player goes
      // straight from one squad to another. `fromClubId` is carried on
      // the event (rather than derived from the player's current
      // contract at apply time) so RolloverScreen's Outbound section
      // and any future audit consumers see the move's origin even if
      // the contract has already been rewritten.
      type: 'TRANSFER_ACTIVATED';
      rosterId: number;
      fromClubId: string;
      toClubId: string;
      annualWage: number;
      expiresOn: string;
    }
  | {
      // Phase 7: new academy graduate joining a senior squad. Player
      // record is allocated nextRosterId at the moment of the event.
      // ClubId is the academy club's senior side (no transfer flow —
      // home-grown players go straight onto the senior roster). Wage +
      // expiry on the player.contract are set by personaGenerator
      // (rookie fixed wage + 2-year deal).
      type: 'ACADEMY_GRADUATED';
      clubId: string;
      player: Player;
    }
  | {
      // Phase 7: foreign import enters the free-agent pool with a
      // pre-set asking-wage. Player.contract.clubId is '' (unsigned).
      // Phase 5+ signing flow consumes them like any other free agent.
      type: 'FOREIGN_IMPORT_ARRIVED';
      player: Player;
    }
  | {
      // fromSave-only: restores cumulative state that would otherwise be
      // built incrementally across the season but can't be rebuilt from
      // FIXTURE_RESULT_RECORDED replay alone. Keeps every state write
      // inside applySeasonEvent so the mutation boundary stays clean
      // (CLAUDE.md §5).
      //
      // `freeAgents` + `market` arrived in v7 (Phase 4); `pendingMoves`
      // in v8 (Phase 6); `teamSeasonStats` in v9 (season-stats
      // architecture). Older saves omit them and the fields stay at
      // their initial defaults ([] / null / [] / per-team zeroes).
      type: 'CAREER_ARCHIVE_RESTORED';
      seasonsCompleted: number;
      archive: ArchivedSeason[];
      freeAgents?: number[];
      market?: MarketState | null;
      pendingMoves?: PreAgreement[];
      teamSeasonStats?: Record<string, TeamSeasonStats>;
      preSeasonStep?: 'overview' | 'signings' | 'marquee';
      // v13+: the active playoff bracket. null when no bracket exists
      // (regular season is mid-flight or has not yet started). Undefined
      // means "leave alone" — older saves (pre-v13) omit the field and
      // the reducer doesn't touch state.league.playoffs.
      playoffs?: PlayoffState | null;
      // v14+: clubIds taken over in prior seasons (Newcastle Red Bull
      // year 2; random investors year 3+). Undefined on pre-v14 saves;
      // the reducer leaves the field at its empty default in that case.
      takeoverHistory?: string[];
      // v16+: per-rosterId mid-season cooldown map. Undefined on pre-v16
      // saves; the reducer leaves the field at {} in that case.
      midseasonRejections?: Record<number, number>;
      // v24+: background poach-threat list. Undefined on pre-v24 saves;
      // the reducer leaves the field at [] in that case.
      activePoachedIds?: number[];
      // The active Prem Cup (league-scope state that can't be rebuilt from
      // FIXTURE_RESULT_RECORDED replay — cup results aren't in save.results).
      // null when no cup is active; undefined means "leave alone" so saves
      // written before the cup system don't touch state.league.premCup.
      premCup?: PremCupState | null;
    }
  | {
      // Persistent injury landed on a roster player. Fired at match
      // teardown (one per in-match injury), severity + weeks rolled via
      // rngTransfer. Reducer writes state.career.roster[rosterId].injury.
      type: 'PLAYER_INJURED';
      rosterId: number;
      kind: InjuryKind;
      severity: InjurySeverity;
      weeksRemaining: number;
      injuredOn: string;
      isRecurrence: boolean;
    }
  | {
      // One week of recovery elapsed for an injured roster player.
      // Reducer decrements weeksRemaining (floor 0). Fired by
      // GameCoordinator alongside WEEK_ADVANCED for every roster player
      // currently carrying an injury.
      type: 'INJURY_TICK_ADVANCED';
      rosterId: number;
    }
  | {
      // Recovery completed (weeksRemaining hit 0). Reducer clears
      // state.career.roster[rosterId].injury.
      type: 'PLAYER_RECOVERED';
      rosterId: number;
    }
  | {
      type: 'SEASON_ROLLED_OVER';
      newSeasonLabel: string;
      newFixtures: Fixture[];
      archivedStandings: TeamStanding[];
      topScorerRosterId: number | null;
      mvpRosterId: number | null;
      // The playoff champion for the just-completed season. Sourced from
      // state.league.playoffs.championTeamId by computeRollover. Null
      // when the season ended without playoffs (legacy path) so the
      // archive entry is still consistent.
      championTeamId: string | null;
      // The Prem Cup champion for the just-completed season. Sourced from
      // state.league.premCup.knockout.championTeamId by computeRollover.
      // Optional so older event-replay paths can omit it.
      premCupChampionTeamId?: string | null;
      // Top-3 per category captured before the roster's seasonStats are
      // re-zeroed. Optional so older event-replay paths (or hand-crafted
      // events in tests) can omit it.
      leaders?: SeasonAwards;
      // Per-player season snapshot captured before seasonStats are
      // re-zeroed. Drives PlayerProfileScreen's Career History table.
      // Optional so older event-replay paths can omit it; the archive
      // entry then renders an empty history column on the profile.
      playerSeasonHistory?: Record<number, ArchivedPlayerSeason>;
    }
  | {
      // Seeds the knockout bracket from the final regular-season standings
      // (top 4). Fired once by GameCoordinator after the last R18 fixture
      // is recorded. Idempotent — if state.league.playoffs is already
      // set, the reducer no-ops.
      type: 'PLAYOFF_BRACKET_SEEDED';
      semifinals: [PlayoffMatch, PlayoffMatch];
      final: PlayoffMatch;
    }
  | {
      // Records the result of one knockout match. The reducer cascades:
      //   - on a SF result, once both SFs are complete, the final's
      //     homeId/awayId are set from the SF winners (SF1 → home,
      //     SF2 → away).
      //   - on the final's result, championTeamId is set.
      type: 'PLAYOFF_RESULT_RECORDED';
      kind: 'semifinal_1' | 'semifinal_2' | 'final';
      homeScore: number;
      awayScore: number;
      homeTries: number;
      awayTries: number;
      playerSide: 'home' | 'away' | null;
    }
  | {
      // Squad Builder resumption: writes state.career.preSeasonStep so
      // a Continue from a closed tab can route the user back to the
      // right pre-season screen. `null` clears the flag (mode complete).
      type: 'PRE_SEASON_STEP_SET';
      step: 'overview' | 'signings' | 'marquee' | null;
    }
  | {
      // Sets a single club's salaryBudget for the upcoming season.
      // Fired once per club at the start of the off-season chain
      // (after EndOfSeason, before Renewals). `salaryBudget` is the
      // post-clamp final value — performance-derived base, floored at
      // BUDGET_VALUES.floor from year 2 onwards, ceilinged at
      // EFFECTIVE_CAP. `delta` is the change vs the previous budget;
      // `reasons` is a display-only payload consumed by BudgetRevealScreen.
      type: 'CLUB_BUDGET_SET';
      clubId: string;
      salaryBudget: number;
      delta: number;
      reasons: BudgetReason[];
    }
  | {
      // Adds a takeover boost to a single club's salaryBudget. Fired
      // after all CLUB_BUDGET_SET events so the boost stacks on the
      // performance-derived value. Clamped at EFFECTIVE_CAP. Hardcoded
      // for Newcastle at the year-1 → year-2 rollover (`'red_bull'`
      // flavor); thereafter rolled per club via rngTransfer
      // (`'investor'` flavor). Adds the clubId to
      // state.career.takeoverHistory so the club can't be taken over
      // again in the same career.
      type: 'CLUB_TAKEOVER';
      clubId: string;
      boostAmount: number;
      flavor: TakeoverFlavor;
    }
  | {
      // Adds a competing bid for a player in the active signing window.
      // Fired both by the user (Make Offer) and by the AI's per-round
      // bid pass. The bid id is deterministic from (rosterId, clubId,
      // round) so re-submitting after a withdraw doesn't duplicate
      // (the reducer skips duplicates).
      type: 'BID_SUBMITTED';
      bid: TransferBid;
    }
  | {
      // Removes a pending bid. User-driven (Withdraw button) for now;
      // AI bids are not withdrawn between submission and resolution.
      type: 'BID_WITHDRAWN';
      bidId: string;
    }
  | {
      // Marks a pending bid as won or lost. Fired in batch at
      // resolveSigningRound. The winning bid for each contested player
      // also triggers the appropriate contract event (CONTRACT_SIGNED /
      // PRE_AGREEMENT_SIGNED / CONTRACT_EXTENDED) — see the resolver.
      type: 'BID_RESOLVED';
      bidId: string;
      outcome: 'won' | 'lost';
    }
  | {
      // Mid-season free-agent declined the user's offer. Writes a
      // cooldown entry on career.midseasonRejections so the UI can lock
      // the row until the next WEEK_ADVANCED. `weekUntilClear` is the
      // first calendar.week value at which the player becomes
      // approachable again (typically currentWeek + 1).
      type: 'MIDSEASON_OFFER_REJECTED';
      rosterId: number;
      weekUntilClear: number;
    }
  | {
      // Replaces state.career.activePoachedIds with the supplied list.
      // Fired at WEEK_ADVANCED (background threat assessment) and with []
      // when the mid-season market opens. Also cleared at SEASON_ROLLED_OVER.
      type: 'POACH_THREATS_SET';
      rosterIds: number[];
    }
  | {
      // Writes state.player.training. Same shape + semantics as
      // PLAYER_TACTICS_SET: persists the manager's choice so it becomes
      // next week's default.
      type: 'PLAYER_TRAINING_PLAN_SET';
      plan: TrainingPlan;
    }
  | {
      // Applies one week of training to a single roster player. Reducer
      // adds conditionDelta to Player.condition (clamped 0-100) and each
      // statDelta to the matching baseStats key (clamped 1-99). Same
      // shape as PLAYER_AGED for stats; the condition field is the new
      // inter-match freshness layer.
      type: 'PLAYER_TRAINED';
      rosterId: number;
      conditionDelta: number;
      statDeltas: Partial<PlayerStats>;
    }
  | {
      // Match-end snapshot of one player's final fatigue, persisted back
      // to the roster as their inter-match condition. Set, not add.
      // Emitted by collectConditionEvents for every player who took the
      // field; bench players who didn't appear get no event and keep
      // their accumulated condition.
      type: 'PLAYER_CONDITION_UPDATED';
      rosterId: number;
      condition: number;
    }
  | {
      // A player has been selected for international duty for the given
      // window. Reducer sets the transient `internationalDuty` flag (so the
      // break's training block skips them) and bumps `internationalCaps`.
      // Fired league-wide inside GameCoordinator.applyTrainingBlock at the
      // Autumn (Round 6) / Six Nations (Round 11) break.
      type: 'PLAYER_CALLED_UP';
      rosterId: number;
      window: InternationalWindow;
      selectionRank: number;       // 1 = first choice; drives the load model
    }
  | {
      // A player has returned from the international block. Reducer clears the
      // transient `internationalDuty` flag, sets `condition` (the reduced
      // freshness they come back with — set, not add), and — when
      // `restEligibleRounds` is present (England heavy-load only) — sets the
      // PGA `restObligation`. Any return injury fires as a separate
      // PLAYER_INJURED event.
      type: 'PLAYER_RETURNED_FROM_DUTY';
      rosterId: number;
      window: InternationalWindow;
      condition: number;
      restEligibleRounds?: number[];
    }
  | {
      // The PGA rest obligation has been satisfied (the player was rested in
      // one of the eligible rounds) or expired. Reducer clears
      // `restObligation`. Fired by the per-round reconciliation in
      // GameCoordinator.recordPlayerMatchResult.
      type: 'REST_OBLIGATION_RESOLVED';
      rosterId: number;
    }
  | {
      // 2025/26 season-open seed for a returning 2025 B&I Lions tourist.
      // Reducer sets `Player.lionsReturnRound` (post-tour rest end) and the
      // reduced return `condition`. Fired once per matched tourist at
      // GameCoordinator.newSeason.
      type: 'LIONS_RETURN_SET';
      rosterId: number;
      availableFromRound: number;
      condition: number;
    }
  | {
      // 2025/26 season-open seed for a returning England or Wales summer-tour
      // player. Reducer sets `Player.summerTourReturn` and the reduced return
      // `condition`. Fired once per matched player at GameCoordinator.newSeason.
      type: 'SUMMER_TOUR_RETURN_SET';
      rosterId: number;
      condition: number;
    }
  | {
      // Seeds the Prem Cup for the season: the two pools + the full set of
      // 40 pool fixtures (both legs). Fired once per season — at newSeason
      // (year 1, hardcoded pools) and inside computeRollover (year 2+,
      // pools redrawn via rngTransfer). Idempotent on a matching
      // seasonLabel — re-seeding the same season no-ops.
      type: 'PREM_CUP_SEEDED';
      seasonLabel: string;
      pools: [{ id: 'A'; teamIds: string[] }, { id: 'B'; teamIds: string[] }];
      fixtures: CupFixture[];
    }
  | {
      // Records one pool fixture result and applies it to that pool's
      // standings (same 4/2/0 + try-bonus + losing-bonus rules as the
      // league, via the shared applyToSide helper). Idempotent on an
      // already-resulted fixture.
      type: 'PREM_CUP_FIXTURE_RECORDED';
      pool: 'A' | 'B';
      leg: 0 | 1 | 2;
      homeId: string;
      awayId: string;
      homeScore: number;
      awayScore: number;
      homeTries: number;
      awayTries: number;
    }
  | {
      // Seeds the cup knockout bracket from the final pool standings after
      // the leg-2 pool stage completes. SF1 = winner(A) v runner-up(B),
      // SF2 = winner(B) v runner-up(A). Idempotent once set.
      type: 'PREM_CUP_KNOCKOUT_SEEDED';
      semifinals: [CupKnockoutMatch, CupKnockoutMatch];
      final: CupKnockoutMatch;
    }
  | {
      // Records one cup knockout result. Cascades like PLAYOFF_RESULT_RECORDED:
      // SF winners fill the final's home/away slots (SF1 → home, SF2 → away),
      // the final winner sets championTeamId.
      type: 'PREM_CUP_KNOCKOUT_RECORDED';
      kind: 'semifinal_1' | 'semifinal_2' | 'final';
      homeScore: number;
      awayScore: number;
      homeTries: number;
      awayTries: number;
    }
  | {
      // Persists the Assistant-Manager cup direction (best vs rest the
      // first-choice 15) to state.player.cupDirection. Same shape +
      // semantics as PLAYER_TRAINING_PLAN_SET — the choice becomes the
      // remembered default for the next break.
      type: 'PLAYER_CUP_DIRECTION_SET';
      direction: 'best' | 'rest_first_15';
    }
  | {
      // Persists the manager's nominated match captain to
      // state.player.captainRosterId. `rosterId: undefined` clears the pick
      // (reverts to the auto-resolved highest-composure starter).
      type: 'PLAYER_CAPTAIN_SET';
      rosterId: number | undefined;
    }
  | {
      // Manager counselled a player about their discipline (inbox action).
      // Sets Player.disciplineAdvice so the match-builder boosts their
      // effective discipline stat and slightly reduces tackling for
      // DISCIPLINE_COUNSEL.durationRounds rounds.
      type: 'PLAYER_DISCIPLINE_COUNSELLED';
      rosterId: number;
      expiresAfterRound: number;
    }
  | {
      // Player hit the season yellow-card accumulation ban threshold.
      // Blocks selection for forRound via selectionUnavailableIds.
      // Fired by GameCoordinator.recordPlayerMatchResult after stats
      // accumulation.
      type: 'PLAYER_SUSPENDED';
      rosterId: number;
      forRound: number;
    }
  | {
      // Adjusts a roster player's morale by `delta`, clamped to [0, 100].
      // `reason` is a string tag used for diagnostics (not stored).
      // Fired by GameCoordinator after each fixture (playing-time, result,
      // standout), each WEEK_ADVANCED (decay toward baseline), and
      // boostPlayerMorale (inbox "have a chat" CTA).
      type: 'PLAYER_MORALE_ADJUSTED';
      rosterId: number;
      delta: number;
      reason: string;
      // Populated on negative-delta fixture events so applySeasonEvent can
      // set player.moraleNote when morale drops below OK.
      moraleReason?: MoraleReason;
    }
  // ── Staff hiring (1.2) ───────────────────────────────────────────────
  | {
      // Replaces the full staff array (free pool + hired) at season start /
      // rollover. `staff` contains all free-pool entries (clubId null); any
      // previously hired staff are carried forward by GameCoordinator before
      // this event fires, so the reducer simply sets career.staff = staff.
      type: 'STAFF_POOL_SEEDED';
      staff: StaffMember[];
      nextStaffId: number;
    }
  | {
      // Marks a staff member as hired by the managed club. `annualWage` may
      // differ from the listed wage (negotiation not modelled in Tier 1 — it
      // equals the pool wage exactly; carried here for forward-compatibility).
      type: 'STAFF_HIRED';
      staffId: string;
      annualWage: number;
      clubId: string;
    }
  | {
      // Returns a hired staff member to the free pool (clubId → null).
      // The member stays in career.staff so the UI can show they were
      // released; the pool is refreshed at the next rollover.
      type: 'STAFF_RELEASED';
      staffId: string;
    }
  | {
      // Assigns a hired scout to actively track a target player. Creates
      // the scouting entry if absent (accuracy 0). A scout can only be
      // assigned to one target; the previous target loses assignedScoutId
      // (accuracy is retained).
      type: 'PLAYER_SCOUT_ASSIGNED';
      rosterId: number;
      scoutId: string;
    }
  | {
      // Removes the scout assignment from a target. The accuracy record
      // is retained so partial scouting survives a reassignment.
      type: 'PLAYER_SCOUT_UNASSIGNED';
      rosterId: number;
    }
  | {
      // Weekly tick: adds `delta` accuracy points to an assigned target.
      // Clamped to 0–100 in the reducer.
      type: 'SCOUTING_ACCURACY_ADVANCED';
      rosterId: number;
      delta: number;
    }
  | {
      // Save-restore only. Bulk-replaces state.player.scouting verbatim.
      type: 'PLAYER_SCOUTING_RESTORED';
      scouting: Record<number, ScoutingRecord>;
    }
  | {
      // Manager dismisses a player from the Scouting watchlist. Deletes
      // the whole record — implicitly releases any assigned scout.
      type: 'PLAYER_SCOUTING_REMOVED';
      rosterId: number;
    }
  // ── Feature 1.4 — Transfer Requests & Playing-Time Promises ─────────
  | {
      // Player's morale has been at or below MORALE.veryUnhappyThreshold for
      // one more consecutive round. Reducer increments
      // Player.consecutiveVeryUnhappyRounds. Fired by GameCoordinator after
      // each fixture for qualifying human-club players who don't already have
      // wantsTransfer set.
      type: 'PLAYER_VERY_UNHAPPY_TICK';
      rosterId: number;
    }
  | {
      // Player has been very unhappy for MORALE.transferRequestStreak
      // consecutive rounds and has formally submitted a transfer request.
      // Reducer sets Player.wantsTransfer = true and resets
      // consecutiveVeryUnhappyRounds to 0. Fires a corresponding inbox story.
      type: 'TRANSFER_REQUEST_SUBMITTED';
      rosterId: number;
    }
  | {
      // Manager promised a player they will start at least startsRequired
      // times in the next toRound rounds. Reducer sets Player.playingTimePromise
      // and clears wantsTransfer.
      type: 'PLAYING_TIME_PROMISED';
      rosterId: number;
      toRound: number;
      startsRequired: number;
      startsAtPromise: number; // snapshot of seasonStats.starts at this moment
    }
  | {
      // Manager agreed to the transfer request — player is released.
      // Reducer clears Player.wantsTransfer. The caller (GameCoordinator)
      // also fires CONTRACT_TERMINATED so the player enters the free-agent
      // pool through the normal market path.
      type: 'TRANSFER_REQUEST_GRANTED';
      rosterId: number;
    }
  | {
      // Manager rejected the transfer request. Reducer clears
      // Player.wantsTransfer and applies MORALE.transferRequestRejectPenalty.
      type: 'TRANSFER_REQUEST_REJECTED';
      rosterId: number;
    }
  | {
      // A playing-time promise expired without the player receiving the
      // committed starts. Reducer clears Player.playingTimePromise and applies
      // MORALE.promiseBrokenPenalty. Fired by GameCoordinator at the round
      // toRound if the starts delta was not met.
      type: 'PROMISE_BROKEN';
      rosterId: number;
    }
  // ── Feature 2.3 — Loan System ────────────────────────────────────────
  | {
      // Seeds the season's loan-available player pool. Reducer sets
      // career.loanPool to the provided roster ids (players already added to
      // career.roster by the generator). Fired once per season at newSeason().
      type: 'LOAN_POOL_SEEDED';
      rosterIds: number[];
    }
  | {
      // Sends a squad player on loan to their club's partnership club.
      // Reducer sets Player.loanOut. The player stays on the squad but is
      // excluded from matchday selection.
      type: 'PLAYER_LOANED_OUT';
      rosterId: number;
      partnerClub: string;
      fromRound: number;
    }
  | {
      // Recalls a loaned-out player. Reducer clears Player.loanOut.
      // The player is immediately available for selection.
      type: 'PLAYER_RECALLED_FROM_LOAN';
      rosterId: number;
    }
  | {
      // Signs a player from the season's loan pool to the managed club.
      // Reducer removes rosterId from career.loanPool, adds to the club's
      // squad, and sets Player.loanIn.
      type: 'LOAN_PLAYER_SIGNED';
      rosterId: number;
      clubId: string;
      fromRound: number;
    }
  | {
      // Releases a loan-in player back to the pool (end-of-season or
      // recalled by generating engine). Reducer removes the player from
      // the club's squad, clears Player.loanIn, and adds rosterId back to
      // career.loanPool. Also fired en masse at SEASON_ROLLED_OVER.
      type: 'LOAN_PLAYER_RELEASED';
      rosterId: number;
    }
  | {
      // Manager sets (or changes) a player's squad status. Reducer writes
      // Player.squadStatus. Persists across SEASON_ROLLED_OVER — the status
      // is a contract-level attribute, not a transient seasonal flag.
      type: 'SQUAD_STATUS_SET';
      rosterId: number;
      status: SquadStatusKey;
    }
  | {
      // Manager transfers a portion of unused player salary headroom to the
      // staff budget for the current season. `boost` is the new absolute
      // value (replaces any prior boost). Season-only — cleared at
      // SEASON_ROLLED_OVER. One-way: player → staff only.
      type: 'STAFF_BUDGET_BOOSTED';
      clubId: string;
      boost: number;
    };
