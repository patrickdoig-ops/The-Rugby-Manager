// Zone-aware tactics resolution — the seam that lets advanced (per-zone) tactics
// flow through the engine. Each accessor takes the live state + the team and
// returns the value that applies *right now*, given where the ball is.
//
// Behaviour-preserving contract: when a team has no advanced override for a
// dimension, the accessor short-circuits to the preset enum WITHOUT reading the
// ball or computing a zone — so preset matches are byte-identical and consume
// no extra work. The zone is only computed when an advanced override is set.
//
// Perspective: zoneForSide is relative to the team's OWN try line, so an
// attacking dim read off the ball-carrier and a defensive dim read off the
// defending team both resolve "own22" to that team's own deep territory.

import type { MatchState } from '../types/match';
import type {
  Team,
  AttackingBreakdown,
  DefendingBreakdown,
  BackfieldDefence,
  DefensiveLine,
  AttackingStyle,
  OffloadStrategy,
  Intensity,
  Discipline,
  AttackingGamePlan,
} from '../types/team';
import type { PossessionSide } from '../types/engine';
import { zoneForSide } from './FieldPosition';
import { FIFTY_22_COMMITMENT } from './balance';

function sideOf(state: MatchState, team: Team): PossessionSide {
  return team === state.homeTeam ? 'home' : 'away';
}

// Piecewise-linear interpolation through three bucket anchors at slider
// positions 0 / 50 / 100. Anchoring exactly on a bucket reproduces that
// bucket's value, so a slider seeded from a preset is byte-identical to it.
function lerp3(lo: number, mid: number, hi: number, t: number): number {
  return t <= 50 ? lo + (mid - lo) * (t / 50) : mid + (hi - mid) * ((t - 50) / 50);
}

// Bucket order per slider dimension: [slider 0, slider 50, slider 100].
// Exported so the UI seed (advancedTactics.ts) maps a preset enum to the
// matching slider position from the same source of truth.
export const STYLE_ORDER:      readonly [AttackingStyle, AttackingStyle, AttackingStyle]    = ['keep_it_tight', 'balanced', 'wide_wide'];
export const OFFLOAD_ORDER:    readonly [OffloadStrategy, OffloadStrategy, OffloadStrategy] = ['cautious', 'balanced', 'offload_freely'];
export const INTENSITY_ORDER:  readonly [Intensity, Intensity, Intensity]                  = ['light', 'balanced', 'high'];
export const DISCIPLINE_ORDER: readonly [Discipline, Discipline, Discipline]               = ['cautious', 'balanced', 'risky'];

// ── Discrete per-zone dimensions — return the effective enum for the zone ──

export function effAttackingBreakdown(state: MatchState, team: Team): AttackingBreakdown {
  const adv = team.tactics.advanced?.attackingBreakdown;
  return adv ? adv[zoneForSide(state, sideOf(state, team))] : team.tactics.attackingBreakdown;
}

export function effDefendingBreakdown(state: MatchState, team: Team): DefendingBreakdown {
  const adv = team.tactics.advanced?.defendingBreakdown;
  return adv ? adv[zoneForSide(state, sideOf(state, team))] : team.tactics.defendingBreakdown;
}

export function effBackfieldDefence(state: MatchState, team: Team): BackfieldDefence {
  const adv = team.tactics.advanced?.backfieldDefence;
  return adv ? adv[zoneForSide(state, sideOf(state, team))] : team.tactics.backfieldDefence;
}

export function effDefensiveLine(state: MatchState, team: Team): DefensiveLine {
  const adv = team.tactics.advanced?.defensiveLine;
  return adv ? adv[zoneForSide(state, sideOf(state, team))] : team.tactics.defensiveLine;
}

// Effective attacking STYLE as a discrete bucket (for the spatial pod shape). The
// advanced override is a continuous per-zone slider (0 = keep_it_tight … 1 =
// wide_wide), bucketed into the three presets at the thirds.
export function effAttackingStyle(state: MatchState, team: Team): AttackingStyle {
  const adv = team.tactics.advanced?.attackingStyle;
  if (!adv) return team.tactics.attackingStyle;
  const t = adv[zoneForSide(state, sideOf(state, team))];
  return t < 1 / 3 ? 'keep_it_tight' : t < 2 / 3 ? 'balanced' : 'wide_wide';
}

// ── Continuous slider dimensions — return the interpolated modifier value ──
// Each takes the same per-bucket table the preset path reads (Record keyed by
// the dimension's enum) and returns either the preset bucket value (no
// override) or the interpolated value for the slider position.

// Per-zone sliders (need the team's current zone).
export function effStyleScalar(state: MatchState, team: Team, table: Record<AttackingStyle, number>): number {
  const adv = team.tactics.advanced?.attackingStyle;
  if (!adv) return table[team.tactics.attackingStyle];
  const t = adv[zoneForSide(state, sideOf(state, team))];
  return lerp3(table[STYLE_ORDER[0]], table[STYLE_ORDER[1]], table[STYLE_ORDER[2]], t);
}

export function effOffloadScalar(state: MatchState, team: Team, table: Record<OffloadStrategy, number>): number {
  const adv = team.tactics.advanced?.offloadStrategy;
  if (!adv) return table[team.tactics.offloadStrategy];
  const t = adv[zoneForSide(state, sideOf(state, team))];
  return lerp3(table[OFFLOAD_ORDER[0]], table[OFFLOAD_ORDER[1]], table[OFFLOAD_ORDER[2]], t);
}

// Single (non-zoned) sliders — whole-pitch effort levers, no zone lookup.
export function effIntensityScalar(team: Team, table: Record<Intensity, number>): number {
  const adv = team.tactics.advanced?.intensity;
  if (adv === undefined) return table[team.tactics.intensity];
  return lerp3(table[INTENSITY_ORDER[0]], table[INTENSITY_ORDER[1]], table[INTENSITY_ORDER[2]], adv);
}

export function effDisciplineScalar(team: Team, table: Record<Discipline, number>): number {
  const adv = team.tactics.advanced?.discipline;
  if (adv === undefined) return table[team.tactics.discipline];
  return lerp3(table[DISCIPLINE_ORDER[0]], table[DISCIPLINE_ORDER[1]], table[DISCIPLINE_ORDER[2]], adv);
}

// Game-plan residuals beyond kick frequency/type. In advanced mode there is no
// game-plan slider — each residual is folded into its adjacent control, so this
// returns a fixed `advancedValue`: kick distance → 0 (kicker stat governs it),
// handling pressure → 0 (Offload owns handling risk), forward fatigue → 1
// (the Attacking-breakdown pick owns forward fatigue). Preset matches keep the
// flat gameplan table, so they're byte-identical.
export function effGamePlanResidual(team: Team, presetTable: Record<AttackingGamePlan, number>, advancedValue: number): number {
  return team.tactics.advanced ? advancedValue : presetTable[team.tactics.attackingGamePlan];
}

// 50:22 accuracy bonus — folded into the zone's 50:22 kick-type weight in
// advanced mode (commit more of your kick mix to 50:22 → execute it better);
// preset matches keep the flat gameplan table.
export function effFiftyTwoBonus(state: MatchState, team: Team, presetTable: Record<AttackingGamePlan, number>): number {
  const adv = team.tactics.advanced;
  if (!adv) return presetTable[team.tactics.attackingGamePlan];
  const weight = adv.kicking[zoneForSide(state, sideOf(state, team))].types.fifty_22;
  return Math.min(FIFTY_22_COMMITMENT.maxBonus, weight * FIFTY_22_COMMITMENT.weightFactor);
}
