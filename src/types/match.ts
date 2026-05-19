import type { MatchPhase, PossessionSide } from './engine';
import type { Team } from './team';
import type { Player } from './player';
import type { NarrationDescriptor } from './narration';

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
}

export interface GameEvent {
  id: string;
  gameMinute: number;
  phase: MatchPhase;
  side: PossessionSide;
  sideName: string;
  defSideName?: string;
  primaryPlayer?: Player;
  secondaryPlayer?: Player;
  ballX: number;
  ballY: number;
  narration: NarrationDescriptor;
  outcome?: string;
}

export interface MatchState {
  clock: {
    gameMinute: number;
    halfTimeDone: boolean;
    clockInTheRed: boolean;
    penaltyKickToTouchLineout: boolean;
  };
  ball: {
    x: number;
    y: number;
  };
  engine: {
    isRunning: boolean;
    isPaused: boolean;
    tickDelayMs: number;
    seed: number;
  };
  phase: MatchPhase;
  possession: PossessionSide;
  score: Score;
  homeTeam: Team;
  awayTeam: Team;
  stats: MatchStats;
  events: GameEvent[];
  breakdownMod: { attack: number; defend: number };
  kickReturnCarrier?: Player;
}
