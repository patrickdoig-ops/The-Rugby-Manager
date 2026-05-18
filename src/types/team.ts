import type { Player } from './player';

export type TeamSide = 'home' | 'away';

export type AttackingGamePlan = 'possession' | 'balanced' | 'kicking';
export type AttackingStyle = 'keep_it_tight' | 'balanced' | 'wide_wide';
export type AttackingBreakdown = 'pick_and_drive' | 'balanced' | 'wide_play';
export type DefendingBreakdown = 'jackal' | 'counter_ruck' | 'shadow';
export type BackfieldDefence = 'one_back' | 'two_back' | 'three_back';

export interface TeamTactics {
  attackingGamePlan: AttackingGamePlan;
  attackingStyle: AttackingStyle;
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
  attackingGamePlan: 'balanced',
  attackingStyle: 'balanced',
  attackingBreakdown: 'balanced',
  defendingBreakdown: 'jackal',
  backfieldDefence: 'one_back',
};

