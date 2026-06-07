import type { MatchPhase, KickOffStrategy } from '../../types/engine';
import type { GameEvent, MatchState } from '../../types/match';
import type { Team } from '../../types/team';
import type { Player } from '../../types/player';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationDescriptor } from '../../types/narration';

export interface PhaseContext {
  state: MatchState;
  attackTeam: Team;
  defendTeam: Team;
  // Field-position helpers (attackDir, isTryScoredAt, inOpposition22, etc.)
  // are pure functions in `src/engine/FieldPosition.ts` that take `state` as
  // an argument. Handlers import them directly — no closures threaded
  // through this context (CLAUDE.md §4 prefers pure functions over methods
  // when state can be passed directly).
  randomPlayer(team: Team): Player;
  pickPlayer(team: Team, ...ids: number[]): Player;
  draftEvent(phase: MatchPhase): GameEvent;
  kickOffStrategy: KickOffStrategy;
  // Headless/AI fixtures (no UI). When true, presentation-only detail is skipped:
  // per-pass lateral hops collapse to a single BALL_REPOSITIONED (see emitSweepHops)
  // and PhaseRouter skips building GameEvent.movements. Outcomes are unaffected.
  silent: boolean;
}

export interface PhaseResult {
  nextPhase: MatchPhase;
  // Handlers describe what happened structurally; text rendering happens
  // in the UI subscriber (CommentaryFeed) via renderNarration().
  narration: NarrationDescriptor;
  primaryPlayer?: Player;
  secondaryPlayer?: Player;
  outcome?: string;
  // True when the carrier picked up at the start of the phase (direct pick-up, e.g.
  // pick-and-go) rather than receiving a pass — copied to GameEvent.carrierFromStart
  // so the 2D pitch rides the carrier the whole way. Presentation-only.
  carrierFromStart?: boolean;
  // Explicitly placed player trajectories for choreographed phase moves.
  // Bypass the standard animation inference when present.
  choreography?: {
    side: 'h' | 'a';
    id: number; // slot 1-15
    movements: { x: number; y: number; t: number; }[];
  }[];
  // MatchEvents emitted by the handler. PhaseRouter routes them through
  // applyMatchEvent before composing the outgoing GameEvent.
  events: MatchEvent[];
}
