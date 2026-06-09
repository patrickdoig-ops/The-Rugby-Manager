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
// Effort/attitude levers — sustained toggles the manager dials up or down.
// intensity : ask for extra physical effort at the contest (a small breakdown
//             edge) at the cost of faster fatigue drain; `light` eases off to
//             protect player condition when the game is won or lost.
// discipline: how many chances the team takes at the breakdown. `risky` wins
//             more turnovers but concedes more penalties; `cautious` is safe
//             but loses that edge. (Distinct from the per-player `discipline`
//             stat on PlayerStats — this is a team-level tactic.)
export type Intensity = 'high' | 'balanced' | 'light';
export type Discipline = 'risky' | 'balanced' | 'cautious';

// Advanced ("fully numeric") tactics. When `TeamTactics.advanced` is present
// the manager has opted out of the 3-way presets and is calibrating the raw
// numbers directly. Phase 1 covers the kicking game only — per-zone kick
// frequency and per-zone kick-type mix — which the KickDecisionDirector reads
// in place of the preset-keyed KICK_PROBABILITIES / FAMILY_WEIGHTS tables.
// Absent ⇒ legacy preset behaviour (the only path the AI and old saves take).
export interface ZoneKickProfile {
  // Baseline kick-or-carry probability in this zone (0–100). Game-state
  // adjustments (slow-ball bonus, full-time close-out) still layer on top.
  frequency: number;
  // Relative weights across the four kick families when a kick fires. The
  // engine normalises by their sum, so they need not total 100; the UI shows
  // each as a normalised percentage of the mix.
  types: { clearance: number; territory: number; fifty_22: number; attacking: number };
}
export interface AdvancedKicking {
  own22: ZoneKickProfile;
  ownHalf: ZoneKickProfile;
  oppHalf: ZoneKickProfile;
  opp22: ZoneKickProfile;
}
// A value per pitch zone (the same four blocks as the kicking matrix). Used for
// the per-zone advanced dimensions: `T` is an enum for discrete picks
// (attacking/defending breakdown, backfield, defensive line) or `number` (a
// 0–100 slider position) for the continuous per-zone dimensions.
export interface ZoneOf<T> {
  own22: T;
  ownHalf: T;
  oppHalf: T;
  opp22: T;
}

export interface AdvancedTactics {
  kicking: AdvancedKicking;
  // Per-zone continuous sliders (0–100; interpolated through the preset
  // buckets — 0 = first option, 50 = middle, 100 = last).
  attackingStyle?: ZoneOf<number>;
  offloadStrategy?: ZoneOf<number>;
  // Per-zone discrete picks (one preset bucket per zone). Defensive dims read
  // the defending team's own-end zone; attacking dims the ball-carrier's.
  attackingBreakdown?: ZoneOf<AttackingBreakdown>;
  defendingBreakdown?: ZoneOf<DefendingBreakdown>;
  backfieldDefence?: ZoneOf<BackfieldDefence>;
  defensiveLine?: ZoneOf<DefensiveLine>;
  // Single (non-zoned) sliders — whole-match disposition levers.
  // gamePlan (possession ↔ kicking) drives the residual execution bonuses the
  // preset Game Plan carried beyond kick frequency/type: kick distance, 50:22
  // accuracy, possession handling pressure, and forward fatigue.
  intensity?: number;
  discipline?: number;
  gamePlan?: number;
}

export interface TeamTactics {
  attackingGamePlan: AttackingGamePlan;
  attackingStyle: AttackingStyle;
  attackingBreakdown: AttackingBreakdown;
  defendingBreakdown: DefendingBreakdown;
  backfieldDefence: BackfieldDefence;
  defensiveLine: DefensiveLine;
  offloadStrategy: OffloadStrategy;
  intensity: Intensity;
  discipline: Discipline;
  advanced?: AdvancedTactics;
}

// The nine preset dimensions, excluding the structural `advanced` override.
// Used where code enumerates the 3-way preset dimensions (labels, menu rows).
export type PresetTacticDim = Exclude<keyof TeamTactics, 'advanced'>;

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
  intensity: 'balanced',
  discipline: 'balanced',
};

