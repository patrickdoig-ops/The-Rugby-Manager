import type { PenaltyChoice, PenaltyContext } from './engine';
import type { GameEvent, MatchState } from './match';

export interface ModalPayload {
  type: 'penalty_choice';
  context: PenaltyContext;
  onChoice: (choice: PenaltyChoice) => void;
}

export interface AppEvents {
  'engine:event':       { event: GameEvent };
  'engine:stateChange': { state: MatchState };
  'engine:paused':      { payload: ModalPayload };
  'engine:resumed':     Record<string, never>;
  'engine:finished':    { state: MatchState };
  'ui:speedChange':     { delayMs: number };
}
