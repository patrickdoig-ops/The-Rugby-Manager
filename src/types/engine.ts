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
  TmoReview      = 'TMO_REVIEW',
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
export type PenaltyChoice   = 'kick_for_goal' | 'kick_to_touch' | 'tap_and_go' | 'tap_and_kick_dead';

// Quality of the ball going INTO a phase decision. Set by the producing phase
// (Breakdown clean/slow outcomes today; future stages may add 'set_piece'
// + 'from_kick'). Read by KickDecisionDirector to apply the slow-ball
// kick-bias modifier.
export type BallQuality = 'clean' | 'slow' | 'set_piece' | 'from_kick';

// Cause taxonomy for a penalty award. Set by the resolver that detected the
// offence, carried on PENALTY_AWARDED, and snapshotted onto state.lastPenalty
// so PenaltyHandler / the modal / the commentary feed can describe why the
// whistle blew. Adding a new offence is a 3-step extension: add the variant
// here, give it a row in OFFENCE_SPEC (src/engine/balance/discipline.ts) so
// the TMO gate picks it up, and emit it from the appropriate phase event.
export type PenaltyOffence =
  | 'breakdown_infringement'
  | 'scrum_infringement'
  | 'high_tackle'
  | 'offside_at_ruck'
  | 'obstruction'
  | 'dangerous_cleanout'
  | 'not_rolling_away';

// Card severity. Yellow = 10-min sin-bin, returns. red_20 = 20-min sin-bin,
// no return but team may sub from bench. red_full = permanent sent off
// (very rare; no trigger today). Future card-issuing offences extend
// PenaltyOffence rather than this union.
export type CardKind = 'yellow' | 'red_20' | 'red_full';

export interface PenaltyContext {
  phase: MatchPhase;
  ballX: number;
  ballY: number;
  inOpposition22: boolean;
  attackingSide: PossessionSide;
  clockInTheRed: boolean;
  halfTimeDone: boolean;
  offence: PenaltyOffence;
  offenderName: string;
  offenderPosition: string;
}
