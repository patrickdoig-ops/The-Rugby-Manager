import type { PenaltyChoice, PenaltyContext, KickOffStrategy } from './engine';
import type { GameEvent, MatchState } from './match';
import type { Team, TeamTactics } from './team';

export type ModalPayload =
  | { type: 'penalty_choice'; context: PenaltyContext; onChoice: (choice: PenaltyChoice) => void; }
  | { type: 'kickoff_choice'; onChoice: (choice: KickOffStrategy) => void; };

export interface AppEvents {
  'engine:initialized': Record<string, never>;
  'engine:event':       { event: GameEvent };
  'engine:stateChange': { state: MatchState };
  'engine:paused':      { payload: ModalPayload };
  'engine:resumed':     Record<string, never>;
  'engine:finished':    { state: MatchState };
  'ui:speedChange':     { delayMs: number };
  'ui:tacticsChange':   { teamId: string; tactics: TeamTactics };
  'ui:openTacticsModal':{ tactics: TeamTactics; teamId: 'home' | 'away' };
  'ui:tacticsClosed':   Record<string, never>;
  'ui:openSubsModal':   { team: Team };
  'ui:substitution':    { benchSquadNum: number; fieldSquadNum: number };
  'ui:subsClosed':      Record<string, never>;
}

