import type { MatchPhase, MatchPeriod, PossessionSide, PenaltyOffence, CardKind, BallQuality, PendingKick } from './engine';
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
  // When set, overrides the phase stored in the DisplaySnapshot for this beat.
  // Used by carry-to-try events so the phase badge shows the carry phase until
  // the TryScored handler's beat fires alongside the confirming commentary.
  displayPhase?: MatchPhase;
  side: PossessionSide;
  sideName: string;
  defSideName?: string;
  primaryPlayer?: Player;
  secondaryPlayer?: Player;
  ballX: number;
  ballY: number;
  // In-phase ball path: the sequence of ball positions the engine moved through
  // while resolving this phase (carry leg, lateral sweep, kick landing). A frozen
  // scalar snapshot — same schema-lifetime rule as ballX/ballY (CLAUDE.md §3); not
  // live state, not range-checked by assertInvariants. The last entry equals
  // ballX/ballY. Only present when the phase moved the ball more than once, so the
  // 2D pitch can animate the ball through each leg instead of one diagonal jump.
  movements?: ReadonlyArray<{ x: number; y: number; t?: number }>;
  // True when the carrier picked the ball up at the START of this phase (a direct
  // pick-up like a pick-and-go) rather than receiving it after a pass chain — the 2D
  // pitch then rides the carrier dot along the whole ball path instead of holding it
  // at the penultimate receive point. Presentation-only.
  carrierFromStart?: boolean;
  // Explicitly placed player trajectories for choreographed phase moves.
  // Bypass the standard animation inference when present.
  choreography?: {
    side: 'h' | 'a';
    id: number;
    movements: { x: number; y: number; t: number }[];
  }[];
  // Captured spatial micro-tick frames for this beat (Upgrade.md § 8.1; WP2).
  // Present only on spatial phases in a live (non-silent) match — silent
  // fixtures skip capture. A frozen scalar snapshot with the same schema-
  // lifetime rule as `movements` (CLAUDE.md § 3): not live state, never range-
  // checked, never saved. The renderer consumes it in WP8 (`playFrames`);
  // harmless extra payload until then. Structurally typed inline (not imported
  // from src/engine/spatial) so the types layer never depends on the engine.
  frames?: ReadonlyArray<{
    t: number;
    ball: { x: number; y: number; h: number; carrierSlot?: number };
    dots: ReadonlyArray<{ x: number; y: number }>;
  }>;
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
  // Live period, snapshot so the Scoreboard can label the clock (ET1/ET2 push
  // past 80'). A frozen scalar per CLAUDE.md §4 — independent of clock.period.
  period: MatchPeriod;
  phase: MatchPhase;
  possession: PossessionSide;
  score: Score;
  ballX: number;
  ballY: number;
  cards: { home: DisplayCards; away: DisplayCards };
  // Team-stats summary block (StatsPanel's stat rows). A structured copy of
  // MatchState.stats taken at production time. Per-player data is NOT snapshot
  // (StatsPanel's player list + detail table read live state); only these
  // three player-derived totals the summary rows need are pre-aggregated.
  stats: MatchStats;
  aggregates: {
    carries:           { home: number; away: number };
    runMetres:         { home: number; away: number };
    passes:            { home: number; away: number };
    offloads:          { home: number; away: number };
    kicks:             { home: number; away: number };
    kickMetres:        { home: number; away: number };
    penaltiesConceded: { home: number; away: number };
  };
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
    // Which of the four periods is live. 'first'/'second' for the regular halves
    // (halfTimeDone distinguishes them for attack direction); 'extra_first'/
    // 'extra_second' for knockout extra time. Drives the clock-in-red target
    // (40/80/90/100) in CLOCK_ADVANCED + checkClockInRed.
    period: MatchPeriod;
  };
  ball: {
    x: number;
    y: number;
    // Current lateral sweep direction: -1 toward y=0, +1 toward y=100. Open
    // play sweeps this way pass-by-pass until it reaches the 15m edge band,
    // then flips. Reset toward the open side on each turnover / set-piece exit.
    // A sign, not a coordinate — not range-checked by assertInvariants.
    lateralDir: -1 | 1;
  };
  engine: {
    isRunning: boolean;
    tickDelayMs: number;
    seed: number;
    firstHalfKicker: PossessionSide;
    humanSide: PossessionSide;
    // rosterId of the human side's match captain, resolved at kick-off from
    // the manager's pre-match nomination. Undefined for headless/AI fixtures
    // and the determinism harness. Read only by CardHandler to name the
    // captain in the referee's team-22 warning — narrative, no game effect.
    humanCaptainRosterId?: number;
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
    // Home venue fill rate (attendance / capacity) at kick-off, used by
    // homeEdge() to scale carryMod / breakdownMod. Defaults to the
    // league-average (~0.79) when no standings data is available (e.g.
    // determinism harnesses, test fixtures).
    homeFillRate: number;
    // True for the season's designated derby fixtures (Derby Weekend / Big
    // Match Weekend). Read by AITacticalDirector.pickEffort() — an AI side
    // opens a derby at high intensity to "set the tone". Defaults to false.
    isDerby: boolean;
    // True for a playoff semi-final (not the final). Used by occasion-commentary
    // hooks alongside isDerby and neutralVenue. Defaults to false.
    isPlayoffSemi: boolean;
    // Skips the per-event assertInvariants() structural sweep for headless AI
    // fixtures (set from `silent`). The sweep is O(matchday squad × stats) and
    // dominates silent-fixture runtime; nothing reads it mid-match in silent
    // mode. A single forced full sweep still runs at MATCH_ENDED as a tripwire
    // before the season snapshot is harvested. Live play + the determinism /
    // telemetry harnesses keep full per-event coverage. Defaults to false.
    skipInvariants: boolean;
    // Referee personality dials, derived from the assigned Referee at match-build
    // time. Both default to 1.0 (neutral — no effect on any roll).
    // refStrictness    — multiplied against every penalty base-rate roll
    //                    (high tackle, breakdown, scrum, open-play offside).
    // refCardThreshold — multiplied against every card-escalation probability
    //                    (TMO yellow weight, team-22 auto-card, maul-collapse yellow).
    refStrictness: number;
    refCardThreshold: number;
    // True when a level score at full time should be resolved by extra time
    // (two 10-minute periods, then a kicking competition) rather than left a
    // draw. Set by the three knockout orchestrators; false for league fixtures.
    allowExtraTime: boolean;
    // Set only when extra time ended with the score STILL level and the kicking
    // competition decided it — names the side that advances. The match score
    // itself stays level (the competition adds no points); the season layer
    // reads this to award the tie. Undefined whenever the score decided it.
    extraTimeWinner?: PossessionSide;
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
  kickReturnIsRegather?: boolean;
  // try-scorer handle: the carrier who crossed the line, set by PhaseRouter when
  // a carry transitions to TryScored and read by handleTryScored the next tick.
  // Threaded through state (not re-derived from the event log) because an AI
  // substitution can land between the two ticks and push the opponent's sub onto
  // the tail of state.events.
  pendingTryScorer?: Player;
  // Outcome and carrier id of the most recent CARRY_RESOLVED, threaded through
  // state so BreakdownEvent can read them without a log-tail scan (a log-tail
  // scan is non-deterministic when a COMMENTARY_LOGGED is inserted between the
  // carry and the breakdown by AI-tactics/sub logic in non-silent mode).
  lastCarryOutcome?: 'line_break' | 'dominant_carry' | 'dominant_tackle' | 'play_on';
  lastCarryCarrierId?: number;
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
  // Team talk modifier — set pre-match and at half-time. Decay is computed
  // at read time (resolvers): fraction = max(0, 1 - (gameMinute - startMinute) / decayMinutes).
  // singleOut is a targeted bonus for one player on one side (optional).
  teamTalkMod: {
    home: { attack: number; defend: number; startMinute: number; decayMinutes: number };
    away: { attack: number; defend: number; startMinute: number; decayMinutes: number };
    singleOut?: { side: 'home' | 'away'; playerId: number; bonus: number; startMinute: number; decayMinutes: number };
  };
  // Per-match play-familiarity recency (WP6 selection). Keyed by side, then play
  // id → a 0..1 "the defence has seen this lately" scalar. Each PLAY_SELECTED bumps
  // the chosen play toward 1 and decays that side's other plays toward 0. Read by
  // selectPlay (lowers a stale play's selection weight) and the overlay abort check
  // (a read play's abort radii widen — defenders react faster). Initialised empty
  // at kick-off; never persisted (the match is transient — no SAVE_VERSION impact).
  playRecency: { home: Record<string, number>; away: Record<string, number> };
  // Count of consecutive wheel outcomes in the current scrum sequence.
  // Incremented by the SCRUM_RESOLVED reducer when outcome === 'wheel';
  // reset to 0 on any other scrum outcome. handleScrum reads this to cap
  // runaway wheel chains — once `SCRUM_VALUES.wheelCap` prior wheels have
  // accumulated, the next wheel is promoted to a penalty (by 3rd-contest
  // margin). The counter resets naturally when the scrum sequence ends,
  // so the next time a scrum is awarded it starts at 0.
  consecutiveWheels: number;
}
