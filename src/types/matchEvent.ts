import type { Player, PlayerStats, InjuryKind } from './player';
import type { GameEvent } from './match';
import type { TeamTactics } from './team';
import { type MatchPhase, type PossessionSide, type PenaltyOffence, type CardKind, type BallQuality, type PendingKick } from './engine';
import type { BackfieldDefence } from './team';

// Domain-level events that describe everything the engine can do to MatchState.
// `applyMatchEvent(state, event)` (src/engine/applyMatchEvent.ts) is the only
// function that mutates MatchState or any Player field; handlers and orchestrators
// build a MatchEvent[] and hand it off for application.

export type MatchEvent =
  // ── Scoring ──────────────────────────────────────────────────────────────
  | { type: 'TRY_SCORED'; scorer: Player; side: PossessionSide }
  | { type: 'CONVERSION_KICKED'; kicker: Player; side: PossessionSide; success: boolean }
  | { type: 'PENALTY_GOAL_KICKED'; kicker: Player; side: PossessionSide; success: boolean }

  // ── Carry / tackle / line break (rich domain event covering all outcomes) ─
  | {
      type: 'CARRY_RESOLVED';
      carrier: Player;
      defender: Player;
      metres: number;            // positive — added to carrier.metresCarried
      direction: 1 | -1;         // attackDir at carry time; ballX += direction*metres (clamped 0–100)
      outcome: 'line_break' | 'dominant_carry' | 'dominant_tackle' | 'play_on';
      defSide: PossessionSide;   // for stats.tackles[defSide]
      // Cover defender who hauls the carrier down on a line break that doesn't
      // reach the try line. Credited with tacklesMade++ in the reducer; the
      // initial defender keeps their missed tackle (tacklesAttempted only).
      // Set only when outcome === 'line_break' && !tryScored.
      coverTackler?: Player;
      // Second defender arriving in support — credited with tacklesAttempted++
      // and tacklesMade++ alongside the primary on every made outcome
      // (dominant_carry / play_on / dominant_tackle). Drawn from defending
      // forwards (back row + locks heavy). Not set on line_break.
      assistTackler?: Player;
    }

  // ── Errors / turnovers ───────────────────────────────────────────────────
  | { type: 'KNOCK_ON'; player: Player; attackSide: PossessionSide }
  | { type: 'TURNOVER_AT_BREAKDOWN'; jackal: Player }

  // Defender intercepts a pass attempt. Reducer flips possession and bumps
  // the interceptor's matchStats.turnoversWon (we reuse that field rather
  // than add a separate `interceptions` counter — an interception IS a
  // turnover and the existing field already drives the jackal leaderboard
  // in telemetry). Caller is expected to also emit KICK_RETURN_CARRIER_SET
  // (interceptor) + BREAKDOWN_MOD_SET (attack: INTERCEPTION_FOLLOW_UP_BONUS,
  // defend: 0) so the next-tick KickReturn handler picks the interceptor up
  // with a front-foot evasion bonus.
  | { type: 'INTERCEPTION'; interceptor: Player; passer: Player; attackSide: PossessionSide }

  // The single seam for "a penalty has been awarded". Emitted by every resolver
  // that detects an infringement; its reducer flips possession to the
  // non-offending side, bumps `offender.matchStats.penaltiesConceded++`, resets
  // `breakdownMod`, and snapshots the cause + pre-flip possession onto
  // `state.lastPenalty`. CardHandler reads lastPenalty to evaluate TMO + team-22.
  | { type: 'PENALTY_AWARDED'; offence: PenaltyOffence; offender: Player; offendingSide: PossessionSide }

  // ── Discipline / cards ───────────────────────────────────────────────────
  // Issued by CardHandler after TMO outcome or team-22 4th-penalty trigger.
  // Reducer bumps yellowCards/redCards on the offender and adds the player to
  // sinBin (yellow/red_20) or sentOff (red_full). returnMinute = clock.gameMinute
  // + SIN_BIN_DURATION[kind] for sin-bin kinds; ignored for red_full.
  | { type: 'CARD_ISSUED'; player: Player; side: PossessionSide; kind: CardKind }
  // Yellow / red_20 timer expired. SIN_BIN_RETURNED removes the entry and the
  // player is back on the field. RED_20_EXPIRED moves the player to sentOff
  // (permanently off; coordinator follows with sub modal).
  | { type: 'SIN_BIN_RETURNED'; player: Player; side: PossessionSide }
  | { type: 'RED_20_EXPIRED'; player: Player; side: PossessionSide }
  // Team-22 counter machinery. CardHandler emits TEAM_PENALTY_22_RECORDED when
  // the just-awarded penalty was conceded by the defending side in their own 22.
  // TEAM_22_WARNING_ISSUED fires once when the 3rd in-22 penalty is reached.
  | { type: 'TEAM_PENALTY_22_RECORDED'; side: PossessionSide }
  | { type: 'TEAM_22_WARNING_ISSUED'; side: PossessionSide }
  // TMO review lifecycle. STARTED sets state.tmoReview with the pre-rolled
  // outcome; TICK_ADVANCED bumps the step (1→2, 2→3); RESOLVED clears it on the
  // 3rd tick (after CARD_ISSUED for non-no_card outcomes).
  | { type: 'TMO_REVIEW_STARTED'; offender: Player; offendingSide: PossessionSide; outcome: 'no_card' | 'yellow' | 'red_20' }
  | { type: 'TMO_REVIEW_TICK_ADVANCED' }
  | { type: 'TMO_REVIEW_RESOLVED' }

  // KickAtGoal micro-phase. STARTED parks the kicker + kind + pre-computed
  // distance on state.kickAtGoal while the engine pauses one tick for the
  // build-up. RESOLVED clears it after KickAtGoalHandler.advance() rolls
  // the kick outcome and transitions phase to KickOff.
  | { type: 'KICK_AT_GOAL_STARTED'; kicker: Player; kind: 'conversion' | 'penalty'; distFromPosts: number }
  | { type: 'KICK_AT_GOAL_RESOLVED' }

  // ── Injuries ─────────────────────────────────────────────────────────────
  // Fired from a phase resolver (today only OpenPlayEvent's tackle outcome)
  // when an injury roll triggers. Reducer pushes the player into
  // state.cards.injured[side] (mirrors sentOff) and sets
  // player.pendingInjuryKind for the teardown severity roll. Player goes off
  // for the rest of the match; coordinator follows with the shared
  // forced-sub flow.
  | { type: 'PLAYER_INJURED_IN_MATCH'; player: Player; side: PossessionSide; kind: InjuryKind }

  // ── Offload (carrier unloads ball in tackle before going to ground) ──────
  // Emitted as a pair: ATTEMPTED bumps offloader.offloadsAttempted; COMPLETED
  // bumps offloader.offloadsCompleted. A separate PASS_COMPLETED rides
  // alongside COMPLETED to credit the pass (same shape as every other
  // completed pass in the engine). A failed offload catch emits the
  // existing KNOCK_ON instead of OFFLOAD_COMPLETED — catcher gets the
  // knock-on attribution.
  | { type: 'OFFLOAD_ATTEMPTED'; offloader: Player; catcher: Player; attackSide: PossessionSide }
  | { type: 'OFFLOAD_COMPLETED'; offloader: Player; catcher: Player; attackSide: PossessionSide }

  // ── Passing / breakdown bookkeeping ──────────────────────────────────────
  | { type: 'PASS_COMPLETED'; passer: Player }
  | { type: 'BREAKDOWN_HIT'; players: Player[] }
  | { type: 'BREAKDOWN_MOD_SET'; attack: number; defend: number }
  | { type: 'BALL_QUALITY_SET'; quality: BallQuality }
  | { type: 'KICK_INTENT_SET'; intent: PendingKick }
  | { type: 'KICK_INTENT_CLEARED' }
  | { type: 'FIFTY_22_ATTEMPTED'; kicker: Player; success: boolean; defenderBackfield: BackfieldDefence }

  // ── Set piece ────────────────────────────────────────────────────────────
  | { type: 'LINEOUT_THROWN'; hooker: Player }
  | {
      type: 'LINEOUT_RESOLVED';
      outcome: 'clean_catch' | 'steal' | 'scrappy_knock_on' | 'crooked_throw';
      hooker: Player;
      attackJumper: Player;
      defendJumper: Player;
      attackSide: PossessionSide;       // side that threw in (pre-flip)
      possessionSideAfter: PossessionSide;
    }
  | {
      type: 'SCRUM_RESOLVED';
      outcome: 'stable_win' | 'wheel' | 'attacking_dominant_penalty' | 'defending_dominant_penalty';
      attackFrontRow: Player[];
      defendFrontRow: Player[];
      attackSide: PossessionSide;       // side that put the ball in (pre-flip)
      possessionSideAfter: PossessionSide;
    }
  | {
      type: 'MAUL_RESOLVED';
      outcome: 'maul_won' | 'maul_held' | 'maul_collapse_penalty';
      attackForwards: Player[];
      defendForwards: Player[];
      attackSide: PossessionSide;       // side that caught the lineout (pre-flip)
      possessionSideAfter: PossessionSide;
      // Metres advanced by the maul before it ended. Positive on maul_won
      // (the attacking side drove forward); 0 on maul_held and
      // maul_collapse_penalty. Adds into state.stats.maulMetres for the
      // attacking side via the MAUL_RESOLVED reducer.
      gainMetres: number;
    }

  // ── Kicking ──────────────────────────────────────────────────────────────
  | { type: 'KICK_FROM_HAND'; kicker: Player; metres: number }
  | { type: 'BALL_REPOSITIONED'; x?: number; y?: number }
  | { type: 'KICK_RETURN_CARRIER_SET'; player?: Player }
  | { type: 'PENDING_TRY_SCORER_SET'; scorer?: Player }

  // ── Possession & phase ───────────────────────────────────────────────────
  | { type: 'POSSESSION_SWAPPED' }
  | { type: 'POSSESSION_SET'; side: PossessionSide }
  | { type: 'PHASE_CHANGED'; phase: MatchPhase }

  // ── Clock & period ───────────────────────────────────────────────────────
  | { type: 'CLOCK_ADVANCED'; delta: number }
  | { type: 'CLOCK_IN_RED_TRIPPED' }
  | { type: 'HALF_TIME_REACHED' }
  | { type: 'MATCH_ENDED' }
  | { type: 'PENALTY_KICK_TO_TOUCH_FLAG_SET'; value: boolean }

  // ── Match-stat bookkeeping (per tick) ────────────────────────────────────
  | { type: 'TICK_BOOKKEEPING'; possessionSide: PossessionSide; territorySide: PossessionSide }
  | { type: 'HANDLING_ERROR'; side: PossessionSide }   // stats.handlingErrors[side]++ without flipping

  // ── 22-entry tracking ────────────────────────────────────────────────────
  | { type: 'ENTRY22_REGISTERED'; side: PossessionSide }
  | { type: 'ENTRY22_CLEARED';    side: PossessionSide }

  // ── Fatigue ──────────────────────────────────────────────────────────────
  | { type: 'FATIGUE_APPLIED'; player: Player; newFatiguePct: number; newCurrentStats: PlayerStats }

  // ── Tactics & subs ───────────────────────────────────────────────────────
  | { type: 'TACTICS_UPDATED'; side: PossessionSide; tactics: TeamTactics }
  | { type: 'SUBSTITUTION_APPLIED'; off: Player; on: Player; teamSide: PossessionSide; benchIdx: number; fieldIdx: number }

  // ── Engine lifecycle ─────────────────────────────────────────────────────
  | { type: 'IS_RUNNING_SET'; value: boolean }
  | { type: 'TICK_DELAY_SET'; value: number }
  | { type: 'FIRST_HALF_KICKER_SET'; side: PossessionSide }
  | { type: 'COMMENTARY_BUFFER_CAP_SET'; value: number }

  // ── Ratings (derived from matchStats) ────────────────────────────────────
  | { type: 'RATINGS_RECALCULATED' }

  // ── Commentary feed (the only mutator of state.events) ───────────────────
  | { type: 'COMMENTARY_LOGGED'; event: GameEvent };
