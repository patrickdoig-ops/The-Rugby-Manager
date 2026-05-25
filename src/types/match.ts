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
}

export interface TmoReviewState {
  step: 1 | 2 | 3;
  outcome: 'no_card' | 'yellow' | 'red_20';
  offender: Player;
  offendingSide: PossessionSide;
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
    // True when the fixture is played at a neutral venue (the Premiership
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
}
