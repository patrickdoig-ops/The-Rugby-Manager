// Training-system manager preferences. Persisted on GameState.player.training
// (mirroring tactics + matchdaySquad). One choice per week per club; the AI
// derives its own via aiTrainingDirector.pickPlan.

export type TrainingIntensity =
  | 'rest'
  | 'light'
  | 'medium'
  | 'high';

export type ForwardsFocus =
  | 'set_piece'
  | 'strength'
  | 'stamina'
  | 'handling';

export type BacksFocus =
  | 'tackling'
  | 'defensive_organisation'
  | 'attacking_skills'
  | 'kicking';

export interface TrainingPlan {
  intensity: TrainingIntensity;
  forwardsFocus: ForwardsFocus;
  backsFocus: BacksFocus;
}

export const DEFAULT_TRAINING_PLAN: TrainingPlan = {
  intensity: 'medium',
  forwardsFocus: 'set_piece',
  backsFocus: 'tackling',
};

// Per-player result after one training week. Only produced for players who
// were fit to train (no pre-existing injury). statDeltas reflects actual
// post-clamp gains — a +1 that was absorbed by the 99 ceiling is omitted.
export interface PlayerTrainingResult {
  rosterId: number;
  conditionBefore: number;
  conditionAfter: number;
  statDeltas: Partial<import('./player').PlayerStats>;
  newlyInjured: boolean;
}

// League-wide results returned by GameCoordinator.applyTrainingBlock.
// `plan` is the final week's plan (focus is shared across the block);
// `weeks` is the number of training weeks the gap spanned. The screen
// filters results.players to the user's club squad.
export interface TrainingWeekResult {
  plan: TrainingPlan;
  players: PlayerTrainingResult[];
  weeks: number;
}
