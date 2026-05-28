import type { MatchPhase, PossessionSide, PenaltyOffence, CardKind, BallQuality, PendingKick } from './engine';
import type { Team } from './team';
import type { Player } from './player';
import type { NarrationDescriptor } from './narration';

export interface SinBinEntry {
  player: Player;
  kind: 'yellow' | 'red_20';
  returnMinute: number;
}

export interface CardsState {
  sinBin:        { home: SinBinEntry[]; away: SinBinEntry[] };
  sentOff:       { home: Player[];      away: Player[] };
  teamPenalty22: { home: number;        away: number };
  teamWarned22:  { home: boolean;       away: boolean };
  // In-match injured players, tracked here so the existing offFieldIds() /
  // onFieldPlayers() filter automatically excludes them from selection — every
  // resolver weakens for free. Players are pushed by PLAYER_INJURED_IN_MATCH
  // and removed by SUBSTITUTION_APPLIED (same as sentOff). Severity + weeks
  // are rolled at match teardown via rngTransfer; this in-match list does
  // not carry duration.
  injured:       { home: Player[];      away: Player[] };
  // Monotonic counter bumped by applyMatchEvent on every mutation that
  // changes sinBin / sentOff / injured contents (CARD_ISSUED,
  // SIN_BIN_RETURNED, RED_20_EXPIRED, PLAYER_INJURED_IN_MATCH,
  // SUBSTITUTION_APPLIED). Lets FieldPosition.offFieldIds memoize the
  // derived Set per (cards object, side) so the ~10-15 calls per tick
  // share one allocation instead of rebuilding each time.
  version: number;
}

export interface TmoReviewState {
  step: 1 | 2 | 3;
  outcome: 'no_card' | 'yellow' | 'red_20';
  offender: Player;
  offendingSide: PossessionSide;
}

export interface KickAtGoalState {
  kicker: Player;
  kind: 'conversion' | 'penalty';
  distFromPosts: number;
}

// Set by the PENALTY_AWARDED reducer; read by PenaltyHandler and CardHandler.
// `preFlipPossession` is the side that had the ball before this PENALTY_AWARDED
// flipped possession — used by CardHandler to compute wasDefending.
export interface LastPenaltyState {
  offence: PenaltyOffence;
  offender: Player;
  offendingSide: PossessionSide;
  preFlipPossession: PossessionSide;
  gameMinute: number;
}

// Re-export for downstream consumers that import card types from match.ts.
export type { CardKind };

export interface Score {
  home: number;
  away: number;
}

export interface MatchStats {
  possession: { home: number; away: number };
  territory:  { home: number; away: number };
  tackles:    { home: { attempted: number; made: number }; away: { attempted: number; made: number } };
  handlingErrors: { home: number; away: number };
  scrums:     { home: number; away: number };
  lineouts:   { home: number; away: number };
  tries:      { home: number; away: number };
  // Mauls completed (excludes maul_held turnovers — same convention as
  // `scrums`, which only counts a scrum once it produces a usable
  // possession decision). `maulMetres` is total ground gained from
  // successful drives by the side that caught the lineout.
  mauls:      { home: number; away: number };
  maulMetres: { home: number; away: number };
  ownLineouts: { home: { thrown: number; won: number }; away: { thrown: number; won: number } };
  ownScrums:   { home: { putIn: number; won: number };  away: { putIn: number; won: number } };
  entries22:   {
    home: { count: number; pointsScored: number; active: boolean };
    away: { count: number; pointsScored: number; active: boolean };
  };
}

export interface GameEvent {
  id: string;
  gameMinute: number;
  phase: MatchPhase;
  side: PossessionSide;
  sideName: string;
  defSideName?: string;
  primaryPlayer?: Player;
  secondaryPlayer?: Player;
  ballX: number;
  ballY: number;
  narration: NarrationDescriptor;
  outcome?: string;
}

// Scoreboard card pips, snapshot per side. `name` is the pre-formatted
// shortName for the pip tooltip; `sentOff` carries names only (no kind —
// always a red pip).
export interface DisplayCards {
  sinBin:  { name: string; kind: 'yellow' | 'red_20' }[];
  sentOff: string[];
}

// Per-event "world frame" the visual panels render, snapshot at event-
// production time so the commentary feed can be driven independently of the
// live MatchState (which, once the sim runs ahead of the feed, is further
// along than the line being narrated). Per CLAUDE.md §3, snapshot DTOs keep
// flat ballX/ballY scalars. Per-player data (matchStats, ratings, fatigue)
// is deliberately NOT captured here — StatsPanel's tables read live state.
export interface DisplaySnapshot {
  gameMinute: number;
  halfTimeDone: boolean;
  clockInTheRed: boolean;
  phase: MatchPhase;
  possession: PossessionSide;
  score: Score;
  ballX: number;
  ballY: number;
  cards: { home: DisplayCards; away: DisplayCards };
}

// One unit the presenter shows: a GameEvent paired with the DisplaySnapshot
// captured when it was produced. CommentaryStreamer's beat buffer holds
// these; draining one emits `engine:event` + `engine:stateChange`.
export interface Beat {
  event: GameEvent;
  display: DisplaySnapshot;
}

export interface MatchState {
  clock: {
    gameMinute: number;
    halfTimeDone: boolean;
    clockInTheRed: boolean;
    penaltyKickToTouchLineout: boolean;
  };
  ball: {
    x: number;
    y: number;
  };
  engine: {
    isRunning: boolean;
    tickDelayMs: number;
    seed: number;
    firstHalfKicker: PossessionSide;
    humanSide: PossessionSide;
    // Ring-buffer ceiling for state.events. Defaults to COMMENTARY_BUFFER_CAP
    // (300, sized for the live commentary feed); telemetry runs raise it so
    // the full event log survives for offline analysis.
    commentaryBufferCap: number;
    // True when the fixture is played at a neutral venue (the league
    // final at Twickenham). Read by homeEdge() — when true, the
    // HOME_ADVANTAGE attack/defend bump zeroes out and neither side gets
    // the home edge. Defaults to false; set by MatchCoordinator from
    // the playoff-final call site.
    neutralVenue: boolean;
  };
  phase: MatchPhase;
  possession: PossessionSide;
  score: Score;
  homeTeam: Team;
  awayTeam: Team;
  stats: MatchStats;
  events: GameEvent[];
  breakdownMod: { attack: number; defend: number };
  // Quality of the ball going into the upcoming phase decision. Set by the
  // producing phase (Breakdown today); read by KickDecisionDirector to apply
  // the slow-ball kick-bias modifier. Defaults to 'clean' on match init and
  // after kicks (the receiver is treating it as fresh).
  lastBallQuality: BallQuality;
  // Family + sub-choice for the kick about to be resolved. Set by
  // KickDecisionDirector.buildKickTransition; consumed by the kick handler
  // (TacticalKickEvent / BoxKickEvent) to branch its math. Cleared once
  // the kick resolves.
  pendingKick?: PendingKick;
  kickReturnCarrier?: Player;
  // Set by the PENALTY_AWARDED reducer; read by PenaltyHandler to enrich the
  // PenaltyContext that crosses the bus boundary to the modal. Overwritten on
  // every new penalty award; never cleared.
  lastPenalty?: LastPenaltyState;
  // Card state — sin-bin entries, sent-off players, team-22 counters. See
  // CardsState above. Initialised empty in MatchCoordinator.initMatchState.
  cards: CardsState;
  // In-progress TMO review (3-tick narrative + pre-rolled outcome). Cleared
  // by TMO_REVIEW_RESOLVED on the 3rd tick. Optional because it's only set
  // mid-review.
  tmoReview?: TmoReviewState;
  kickAtGoal?: KickAtGoalState;
  // Count of consecutive wheel outcomes in the current scrum sequence.
  // Incremented by the SCRUM_RESOLVED reducer when outcome === 'wheel';
  // reset to 0 on any other scrum outcome. handleScrum reads this to cap
  // runaway wheel chains — once `SCRUM_VALUES.wheelCap` prior wheels have
  // accumulated, the next wheel is promoted to a penalty (by 3rd-contest
  // margin). The counter resets naturally when the scrum sequence ends,
  // so the next time a scrum is awarded it starts at 0.
  consecutiveWheels: number;
}
