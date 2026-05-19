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
  attackDir(): 1 | -1;
  isTryScored(): boolean;
  inOpposition22(): boolean;
  inOppositionHalf(): boolean;
  inOwn22(): boolean;
  inOwnHalf(): boolean;
  randomPlayer(team: Team): Player;
  pickPlayer(team: Team, ...ids: number[]): Player;
  draftEvent(phase: MatchPhase): GameEvent;
  kickOffStrategy: KickOffStrategy;
}

export interface PhaseResult {
  nextPhase: MatchPhase;
  // Handlers describe what happened structurally; PhaseRouter renders the
  // text via src/commentary/CommentaryRenderer.ts and writes it onto the
  // outgoing GameEvent.commentary field.
  narration: NarrationDescriptor;
  primaryPlayer?: Player;
  secondaryPlayer?: Player;
  outcome?: string;
  // MatchEvents emitted by the handler. PhaseRouter routes them through
  // applyMatchEvent before composing the outgoing GameEvent.
  events: MatchEvent[];
}
