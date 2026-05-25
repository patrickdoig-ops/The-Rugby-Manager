import type { Player } from './player';

export type TeamSide = 'home' | 'away';

export type AttackingGamePlan = 'possession' | 'balanced' | 'kicking';
export type AttackingStyle = 'keep_it_tight' | 'balanced' | 'wide_wide';
export type AttackingBreakdown = 'commit_numbers' | 'balanced' | 'minimal_ruck';
export type DefendingBreakdown = 'jackal' | 'counter_ruck' | 'shadow';
export type BackfieldDefence = 'one_back' | 'two_back' | 'three_back';
// Defensive line shape — the up-and-back press vs the lateral slide.
// blitz   : aggressive line speed; more dominant tackles + more offsides; bigger
//           punishment when the press is beaten (line breaks gain more metres).
// drift   : lateral slide; safer, fewer line breaks; concedes more metres on
//           regular carries; eats wide attacks.
// hybrid  : mix of the two — numerically neutral middle ground.
export type DefensiveLine = 'blitz' | 'drift' | 'hybrid';
// Offload appetite — drives the in-contact unload roll between evasion
// and collision. cautious teams keep the ball off the deck and recycle;
// offload_freely teams keep it alive at the cost of more knock-ons.
// Per-strategy attempt % lives in OFFLOAD_VALUES.attemptPctByStrategy
// (src/engine/balance/offload.ts).
export type OffloadStrategy = 'cautious' | 'balanced' | 'offload_freely';

export interface TeamTactics {
  attackingGamePlan: AttackingGamePlan;
  attackingStyle: AttackingStyle;
  attackingBreakdown: AttackingBreakdown;
  defendingBreakdown: DefendingBreakdown;
  backfieldDefence: BackfieldDefence;
  defensiveLine: DefensiveLine;
  offloadStrategy: OffloadStrategy;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  stadium: string;
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
  defensiveLine: 'hybrid',
  offloadStrategy: 'balanced',
};

