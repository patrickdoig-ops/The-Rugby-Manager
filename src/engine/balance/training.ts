// Training-system tuning. Drives applyTrainingWeek + aiTrainingDirector +
// rollTrainingInjuryEvents. All numbers are v1 baselines — re-balance via
// telemetry once a multi-season pass exists.
//
// Calibration target: a regular starter (≈ 50% condition cost per match)
// stays roughly stable on light training; medium drains them slowly while
// growing focused stats; high gambles condition for the biggest gains.

import type { PlayerStats } from '../../types/player';
import type {
  BacksFocus, ForwardsFocus, TrainingIntensity,
} from '../../types/training';

// Intensity → per-player effect bundle.
//   conditionDelta    — added to Player.condition (clamped 0-100)
//   developmentChance — base probability per stat per week (focused stats
//                       multiply by DEVELOPMENT.focusMultiplier; unfocused
//                       by DEVELOPMENT.unfocusedMultiplier)
//   injuryRisk        — base probability per player per week (scaled by
//                       INJURY_RISK.conditionMultiplier as condition drops)
export const INTENSITY_EFFECTS: Record<TrainingIntensity,
  { conditionDelta: number; developmentChance: number; injuryRisk: number }> = {
  rest:   { conditionDelta: +90, developmentChance: 0.00, injuryRisk: 0.000 },
  light:  { conditionDelta: +60, developmentChance: 0.08, injuryRisk: 0.001 },
  medium: { conditionDelta: +40, developmentChance: 0.18, injuryRisk: 0.004 },
  high:   { conditionDelta: +20, developmentChance: 0.32, injuryRisk: 0.012 },
};

// Focus → the two PlayerStats keys that get the development boost. Forwards
// focuses apply to isForward(position) === true; backs to the rest.
export const FORWARDS_FOCUS_STATS: Record<ForwardsFocus, [keyof PlayerStats, keyof PlayerStats]> = {
  set_piece: ['setPiece', 'strength'],
  strength:  ['strength', 'tackling'],
  stamina:   ['stamina',  'handling'],
  handling:  ['handling', 'composure'],
};

export const BACKS_FOCUS_STATS: Record<BacksFocus, [keyof PlayerStats, keyof PlayerStats]> = {
  tackling:               ['tackling',    'positioning'],
  defensive_organisation: ['positioning', 'discipline'],
  attacking_skills:       ['pace',        'agility'],
  kicking:                ['kicking',     'composure'],
};

// Multipliers + age curve applied on top of INTENSITY_EFFECTS.developmentChance.
export const DEVELOPMENT = {
  // Focused stats roll at base × focusMultiplier. Unfocused at × unfocused.
  focusMultiplier:      3.0,
  unfocusedMultiplier:  0.25,

  // Younger players gain more from training. Indexed by age at the upcoming
  // season's open date (so a 23yo halfway through season N still gets the
  // 24-28 multiplier when we cross his birthday next rollover).
  ageBands: [
    { maxAge: 22, multiplier: 1.6 },
    { maxAge: 28, multiplier: 1.0 },
    { maxAge: 32, multiplier: 0.6 },
    { maxAge: 99, multiplier: 0.25 },
  ],
};

// Injury risk scaling. A player at condition × conditionFactor below
// fullCondition gets risk × conditionMultiplier^factor — i.e. lower
// condition → higher injury risk. The math is intentionally simple: a
// player at 50% condition is ~1.5× more injury-prone than one at 100%.
export const INJURY_RISK = {
  conditionMultiplier: 1.5,        // max multiplier at condition === 0
  fullCondition: 100,
};

// Per-stat caps mirror PLAYER_AGED's clamp logic — actual clamping happens
// in applySeasonEvent's PLAYER_TRAINED branch ([1, 99]). Re-export the
// magnitude for callers' clarity.
export const TRAINING_STAT_DELTA = 1; // +1 per successful development roll

// AI training director tuning. Lives here so all training-related numbers
// stay co-located.
export const AI_TRAINING = {
  // Average condition threshold below which the AI tilts toward rest/light.
  // Pure heuristic, not a hard rule.
  squadConditionTiredThreshold: 70,
  // Form delta (last-3-matches win rate vs 0.5) below which the AI tilts
  // toward high intensity — chasing form rather than coasting.
  poorFormWinRateThreshold: 0.34,
};
