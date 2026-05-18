import type { Player } from './player';

export type TeamSide = 'home' | 'away';

export type KickOffStrategy = 'high_ball' | 'short_kick' | 'grubber';
export type AttackingGamePlan = 'possession' | 'balanced' | 'kicking';
export type AttackingBreakdown = 'pick_and_drive' | 'balanced' | 'wide_play';
export type DefendingBreakdown = 'jackal' | 'counter_ruck' | 'shadow';
export type BackfieldDefence = 'one_back' | 'two_back' | 'three_back';

export interface TeamTactics {
  kickOffStrategy: KickOffStrategy;
  attackingGamePlan: AttackingGamePlan;
  attackingBreakdown: AttackingBreakdown;
  defendingBreakdown: DefendingBreakdown;
  backfieldDefence: BackfieldDefence;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  players: Player[];
  bench: Player[];
  substitutedOff: Player[];
  tactics: TeamTactics;
}

export const DEFAULT_TACTICS: TeamTactics = {
  kickOffStrategy: 'high_ball',
  attackingGamePlan: 'balanced',
  attackingBreakdown: 'balanced',
  defendingBreakdown: 'jackal',
  backfieldDefence: 'one_back',
};

