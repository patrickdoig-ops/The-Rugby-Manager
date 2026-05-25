import type { PenaltyChoice, PenaltyContext, KickOffStrategy, PossessionSide } from './engine';
import type { GameEvent, MatchState } from './match';
import type { Team, TeamTactics } from './team';
import type { Player } from './player';
import type { FixtureResult, GameState } from './gameState';

// Forced-substitution choice fired by the engine when a red_20 player's
// 20 minutes expire or when a player picks up an in-match injury. `reason`
// drives the modal copy (different framing for sin-bin expiry vs injury);
// the picking flow is otherwise identical. onChoice receives the picked
// bench squad number, or null if the manager has nobody to bring on.
export interface ForcedSubChoicePayload {
  type: 'forced_substitution_choice';
  side: PossessionSide;
  sentOff: Player;
  bench: Player[];
  reason: 'red_20' | 'injury';
  onChoice: (benchSquadNum: number | null) => void;
}

export type ModalPayload =
  | { type: 'penalty_choice'; context: PenaltyContext; onChoice: (choice: PenaltyChoice) => void; }
  | { type: 'kickoff_choice'; onChoice: (choice: KickOffStrategy) => void; }
  | ForcedSubChoicePayload;

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
  'game:initialized':     { state: GameState };
  'game:fixtureRecorded': { result: FixtureResult; state: GameState };
  'game:weekAdvanced':    { state: GameState };
  'game:seasonComplete':  { state: GameState };
  // Playoffs (Premiership final + semi-finals). bracketSeeded fires once
  // after the final regular-season fixture; playoffsUpdated fires per
  // PLAYOFF_RESULT_RECORDED so the bracket screen + hub re-render.
  'game:bracketSeeded':   { state: GameState };
  'game:playoffsUpdated': { state: GameState };
}

