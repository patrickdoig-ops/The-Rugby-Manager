import type { Player } from './player';

export type TeamSide = 'home' | 'away';

export type KickOffStrategy = 'high_ball' | 'short_kick' | 'grubber';
export type AttackingGamePlan = 'possession' | 'balanced' | 'kicking';
export type AttackingBreakdown = 'pick_and_drive' | 'balanced' | 'wide_play';
export type DefendingBreakdown = 'jackal' | 'counter_ruck' | 'shadow';

export interface TeamTactics {
  kickOffStrategy: KickOffStrategy;
  attackingGamePlan: AttackingGamePlan;
  attackingBreakdown: AttackingBreakdown;
  defendingBreakdown: DefendingBreakdown;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  players: Player[];
  tactics: TeamTactics;
}

