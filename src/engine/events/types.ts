import type { MatchPhase } from '../../types/engine';
import type { GameEvent, MatchState } from '../../types/match';
import type { Team } from '../../types/team';
import type { Player } from '../../types/player';

export interface PhaseContext {
  state: MatchState;
  attackTeam: Team;
  defendTeam: Team;
  attackDir(): number;
  isTryScored(): boolean;
  inOpposition22(): boolean;
  inOwn22(): boolean;
  inOwnHalf(): boolean;
  adjustRating(player: Player | undefined, delta: number): void;
  randomPlayer(team: Team): Player;
  pickPlayer(team: Team, ...ids: number[]): Player;
  draftEvent(phase: MatchPhase): GameEvent;
}

export interface PhaseResult {
  nextPhase: MatchPhase;
  commentary: string;
  primaryPlayer?: Player;
  secondaryPlayer?: Player;
}
