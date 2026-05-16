import type { MatchPhase, PossessionSide } from './engine';
import type { Team } from './team';
import type { Player } from './player';

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
  primaryPlayer?: Player;
  secondaryPlayer?: Player;
  ballX: number;
  ballY: number;
  commentary: string;
}

export interface MatchState {
  phase: MatchPhase;
  gameMinute: number;
  score: Score;
  possession: PossessionSide;
  ballX: number;
  ballY: number;
  homeTeam: Team;
  awayTeam: Team;
  stats: MatchStats;
  events: GameEvent[];
  isRunning: boolean;
  isPaused: boolean;
  halfTimeDone: boolean;
  tickDelayMs: number;
}
