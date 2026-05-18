export enum MatchPhase {
  KickOff        = 'KICK_OFF',
  PhasePlay      = 'PHASE_PLAY',
  FirstPhase     = 'FIRST_PHASE',
  KickReturn     = 'KICK_RETURN',
  Breakdown      = 'BREAKDOWN',
  Scrum          = 'SCRUM',
  Lineout        = 'LINEOUT',
  TacticalKick   = 'TACTICAL_KICK',
  BoxKick        = 'BOX_KICK',
  Penalty        = 'PENALTY',
  ConversionKick = 'CONVERSION_KICK',
  TryScored      = 'TRY_SCORED',
  HalfTime       = 'HALF_TIME',
  FullTime       = 'FULL_TIME',
  Substitution   = 'SUBSTITUTION',
}

export type PossessionSide = 'home' | 'away';
export type KickOffStrategy = 'high_ball' | 'short_kick' | 'grubber';

export type BreakdownResult = 'clean_ball' | 'slow_ball' | 'turnover' | 'penalty_defending';
export type ScrumResult     = 'stable_win' | 'wheel' | 'attacking_dominant_penalty' | 'defending_dominant_penalty';
export type LineoutResult   = 'clean_catch' | 'steal' | 'scrappy_knock_on' | 'crooked_throw';
export type KickOffResult   = 'clean_receive' | 'knock_on' | 'short_kick_retain' | 'poor_kick';
export type CollisionResult = 'dominant_carry' | 'dominant_tackle' | 'broken_tackle';
export type KickResult      = 'good_kick' | 'poor_kick' | 'knock_on_catch';
export type PenaltyChoice   = 'kick_for_goal' | 'kick_to_touch' | 'tap_and_go';

export interface PenaltyContext {
  phase: MatchPhase;
  ballX: number;
  ballY: number;
  inOpposition22: boolean;
  attackingSide: PossessionSide;
}
