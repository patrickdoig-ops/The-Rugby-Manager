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
