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
}

export interface PhaseResult {
  nextPhase: MatchPhase;
  // Handlers describe what happened structurally; text rendering happens
  // in the UI subscriber (CommentaryFeed) via renderNarration().
  narration: NarrationDescriptor;
  primaryPlayer?: Player;
  secondaryPlayer?: Player;
  outcome?: string;
  // MatchEvents emitted by the handler. PhaseRouter routes them through
  // applyMatchEvent before composing the outgoing GameEvent.
  events: MatchEvent[];
}
