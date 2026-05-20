import type { Player, PlayerStats } from './player';
import type { GameEvent } from './match';
import type { TeamTactics } from './team';
import { type MatchPhase, type PossessionSide, type PenaltyOffence } from './engine';

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
    }

  // ── Errors / turnovers ───────────────────────────────────────────────────
  | { type: 'KNOCK_ON'; player: Player; attackSide: PossessionSide }
  | { type: 'TURNOVER_AT_BREAKDOWN'; jackal: Player }

  // The single seam for "a penalty has been awarded". Emitted by every resolver
  // that detects an infringement; its reducer flips possession to the
  // non-offending side, bumps `offender.matchStats.penaltiesConceded++`, resets
  // `breakdownMod`, and snapshots the cause onto `state.lastPenalty`.
  | { type: 'PENALTY_AWARDED'; offence: PenaltyOffence; offender: Player; offendingSide: PossessionSide }

  // ── Passing / breakdown bookkeeping ──────────────────────────────────────
  | { type: 'PASS_COMPLETED'; passer: Player }
  | { type: 'BREAKDOWN_HIT'; players: Player[] }
  | { type: 'BREAKDOWN_MOD_SET'; attack: number; defend: number }

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

  // ── Kicking ──────────────────────────────────────────────────────────────
  | { type: 'KICK_FROM_HAND'; kicker: Player; metres: number }
  | { type: 'BALL_REPOSITIONED'; x?: number; y?: number }
  | { type: 'KICK_RETURN_CARRIER_SET'; player?: Player }

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

  // ── Ratings (derived from matchStats) ────────────────────────────────────
  | { type: 'RATINGS_RECALCULATED' }

  // ── Commentary feed (the only mutator of state.events) ───────────────────
  | { type: 'COMMENTARY_LOGGED'; event: GameEvent };
