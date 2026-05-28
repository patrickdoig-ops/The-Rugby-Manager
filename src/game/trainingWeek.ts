// Pure builder for the SeasonEvent stream that applies one training week
// (one period of a block) league-wide. Mirrors careerRollover.computeRollover:
// reads the current state, computes events, returns them; the caller
// (GameCoordinator.applyTrainingBlock) routes them through applySeasonEvent,
// once per period of the gap until the next match.
//
// Inputs:
//   - state: current GameState (read-only)
//   - userPlan: the manager's chosen plan for the player's club. AI clubs
//     get their own plan via aiTrainingDirector.pickPlan inside this
//     function.
//   - periodDays: rest days this period spans — condition recovers per day.
//
// RNG: rngTransfer (career stream). Stable iteration order — clubs
// id-ascending, roster ids numeric-ascending — keeps the call sequence
// reproducible.

import type { ClubState, GameState, SeasonEvent } from '../types/gameState';
import type { PlayerStats } from '../types/player';
import { isForward, PLAYER_STAT_KEYS } from '../types/player';
import type { TrainingPlan } from '../types/training';
import {
  BACKS_FOCUS_STATS, DEVELOPMENT, FORWARDS_FOCUS_STATS,
  INJURY_RISK, INTENSITY_EFFECTS, TRAINING_STAT_DELTA,
} from '../engine/balance/training';
import { INJURY_SEVERITY } from '../engine/balance/injuries';
import { rngTransfer, rngTransferRaw } from '../utils/rng';
import { pickPlan as pickAIPlan } from './aiTrainingDirector';
import { getAge, parseSeasonStartYear, seasonOpenIso } from './age';

const TRAINING_INJURY_KINDS = ['muscle_strain', 'ligament_sprain', 'knock'] as const;
type TrainingInjuryKind = typeof TRAINING_INJURY_KINDS[number];

// One training period. `periodDays` is how many rest days this period
// spans — condition recovery scales with it (daily), while development +
// injury rolls fire once for the period (per week). For a single-week gap
// the period spans the actual 6/7/8-day turnaround; a multi-week block is
// split into ~7-day periods by splitGapIntoPeriods (see trainingCalendar).
export function computeTrainingWeek(
  state: GameState,
  userPlan: TrainingPlan,
  periodDays: number,
): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  const userClubId = state.player.teamId;
  const seasonStartYear = parseSeasonStartYear(state.calendar.seasonLabel);
  const seasonOpen = seasonOpenIso(seasonStartYear);
  const injuredOn = state.calendar.date;

  // Persist the manager's plan first so it becomes the default for next
  // week's screen render even if the user doesn't change it.
  events.push({ type: 'PLAYER_TRAINING_PLAN_SET', plan: userPlan });

  // Stable club order keeps rngTransfer deterministic across runs.
  const clubsSorted = [...state.career.clubs].sort((a, b) => a.id.localeCompare(b.id));

  for (const club of clubsSorted) {
    const plan = club.id === userClubId
      ? userPlan
      : pickAIPlan(state, club);
    pushClubTrainingEvents(events, state, club, plan, periodDays, seasonOpen, injuredOn);
  }

  return events;
}

function pushClubTrainingEvents(
  out: SeasonEvent[],
  state: GameState,
  club: ClubState,
  plan: TrainingPlan,
  periodDays: number,
  seasonOpenDate: string,
  injuredOn: string,
): void {
  const intensity = INTENSITY_EFFECTS[plan.intensity];
  const fwdFocus = FORWARDS_FOCUS_STATS[plan.forwardsFocus];
  const bckFocus = BACKS_FOCUS_STATS[plan.backsFocus];

  // Roster ids numeric-ascending so the call sequence is stable.
  const rosterIds = [...club.squad].sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = state.career.roster[rid];
    if (!p) continue;
    // Injured players sit the session out (no condition delta, no dev,
    // no fresh injury risk). They recover via INJURY_TICK_ADVANCED on
    // their own clock.
    if (p.injury) continue;

    const focus: [keyof PlayerStats, keyof PlayerStats] = isForward(p.position) ? fwdFocus : bckFocus;
    const ageInNewSeason = p.dob ? (getAge(p.dob, seasonOpenDate) ?? 25) : 25;
    const ageMul = ageMultiplier(ageInNewSeason);

    // Development rolls — one per stat per player. Walk PLAYER_STAT_KEYS
    // (stable order) so the rngTransfer sequence is identical across
    // seasons / clubs / players that pick the same focus.
    const statDeltas: Partial<PlayerStats> = {};
    for (const stat of PLAYER_STAT_KEYS) {
      const isFocus = stat === focus[0] || stat === focus[1];
      const multiplier = isFocus ? DEVELOPMENT.focusMultiplier : DEVELOPMENT.unfocusedMultiplier;
      const chance = intensity.developmentChance * multiplier * ageMul;
      if (chance > 0 && rngTransferRaw() < chance) {
        statDeltas[stat] = TRAINING_STAT_DELTA;
      }
    }

    out.push({
      type: 'PLAYER_TRAINED',
      rosterId: rid,
      conditionDelta: intensity.conditionPerDay * periodDays,
      statDeltas,
    });

    // Injury roll — scales inversely with current condition (the lower
    // the freshness, the higher the risk).
    const injuryChance = intensity.injuryRisk * conditionRiskMultiplier(p.condition);
    if (injuryChance > 0 && rngTransferRaw() < injuryChance) {
      const kind: TrainingInjuryKind = TRAINING_INJURY_KINDS[rngTransfer(0, TRAINING_INJURY_KINDS.length - 1)];
      const profile = INJURY_SEVERITY[kind];
      const severity = pickSeverityFromWeights(profile.weights);
      const [lo, hi] = profile.bands[severity];
      const weeksRemaining = rngTransfer(lo, hi);
      out.push({
        type: 'PLAYER_INJURED',
        rosterId: rid,
        kind,
        severity,
        weeksRemaining,
        injuredOn,
        isRecurrence: false,
      });
    }
  }
}

function ageMultiplier(age: number): number {
  for (const band of DEVELOPMENT.ageBands) {
    if (age <= band.maxAge) return band.multiplier;
  }
  return DEVELOPMENT.ageBands[DEVELOPMENT.ageBands.length - 1].multiplier;
}

function conditionRiskMultiplier(condition: number): number {
  // 100% condition → 1.0x; 0% condition → INJURY_RISK.conditionMultiplier.
  // Linear interpolation in between.
  const drop = (INJURY_RISK.fullCondition - condition) / INJURY_RISK.fullCondition;
  return 1 + drop * (INJURY_RISK.conditionMultiplier - 1);
}

// Mirrors GameCoordinator.pickSeverity but inlined so trainingWeek.ts is
// the single place training-injury rolls happen (no cross-module
// dependence on the in-match injury seam).
function pickSeverityFromWeights(weights: Record<'mild' | 'moderate' | 'severe', number>): 'mild' | 'moderate' | 'severe' {
  const roll = rngTransfer(1, 100);
  let cum = 0;
  cum += weights.mild;
  if (roll <= cum) return 'mild';
  cum += weights.moderate;
  if (roll <= cum) return 'moderate';
  return 'severe';
}
