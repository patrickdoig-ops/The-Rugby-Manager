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
  INJURY_RISK, INTENSITY_EFFECTS, LOAN_DEV_MULTIPLIER, TRAINING_STAT_DELTA, ageMultiplier,
} from '../engine/balance/training';
import { FITNESS_MULT_PER_POINT, FITNESS_INJURY_REDUCTION_PER_POINT } from '../engine/balance/staff';
import { proximityMultiplier } from '../engine/balance/career';
import { playerOverall } from '../engine/RatingEngine';
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
// Returns the rating of the hired fitness staff member for the managed club,
// or 0 if none is hired. Used to scale condition gains + dev chance and
// reduce injury risk for the human club only (AI clubs are unaffected).
function hiredFitnessRating(state: GameState): number {
  const staff = state.career.staff;
  if (!staff) return 0;
  const m = staff.find(s => s.role === 'fitness' && s.clubId === state.player.teamId);
  return m ? m.rating : 0;
}

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

  // Fitness staff rating for the managed club — only that club is affected.
  const fitnessRating = hiredFitnessRating(state);

  // Stable club order keeps rngTransfer deterministic across runs.
  const clubsSorted = [...state.career.clubs].sort((a, b) => a.id.localeCompare(b.id));

  for (const club of clubsSorted) {
    const plan = club.id === userClubId
      ? userPlan
      : pickAIPlan(state, club);
    const clubFitnessRating = club.id === userClubId ? fitnessRating : 0;
    pushClubTrainingEvents(events, state, club, plan, periodDays, seasonOpen, injuredOn, clubFitnessRating);
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
  fitnessRating: number,
): void {
  const intensity = INTENSITY_EFFECTS[plan.intensity];
  const fwdFocus = FORWARDS_FOCUS_STATS[plan.forwardsFocus];
  const bckFocus = BACKS_FOCUS_STATS[plan.backsFocus];

  // Fitness-staff modifiers — only non-zero for the managed club.
  // condMult scales conditionDelta and developmentChance (probability of a +1 gain).
  // injuryFraction is subtracted from injuryRisk before the condition multiplier.
  // No new RNG: both are purely deterministic scale factors on existing rolls.
  const condMult      = fitnessRating > 0 ? 1 + fitnessRating * FITNESS_MULT_PER_POINT : 1.0;
  const injuryFraction = fitnessRating > 0 ? fitnessRating * FITNESS_INJURY_REDUCTION_PER_POINT : 0;

  // Roster ids numeric-ascending so the call sequence is stable.
  const rosterIds = [...club.squad].sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = state.career.roster[rid];
    if (!p) continue;
    // Injured players sit the session out (no condition delta, no dev,
    // no fresh injury risk). They recover via INJURY_TICK_ADVANCED on
    // their own clock.
    if (p.injury) continue;
    // Players away on international duty don't train with their club during
    // an international break — no condition recovery, no development. Their
    // return is resolved separately in GameCoordinator.applyTrainingBlock.
    if (p.internationalDuty) continue;
    // 2025 B&I Lions returnees serving the post-tour stand-down skip club
    // training *through* their return round (`week <= lionsReturnRound`), so
    // they come back at the reduced seed condition and build fitness from the
    // following week. They become selectable a round earlier (`week <
    // lionsReturnRound`, see selectionUnavailableIds).
    if (p.lionsReturnRound !== undefined && state.calendar.week <= p.lionsReturnRound) continue;

    const focus: [keyof PlayerStats, keyof PlayerStats] = isForward(p.position) ? fwdFocus : bckFocus;
    const ageInNewSeason = p.dob ? (getAge(p.dob, seasonOpenDate) ?? 25) : 25;
    const ageMul = ageMultiplier(ageInNewSeason);
    const proxMul = proximityMultiplier(p.potential, playerOverall(p.baseStats, p.position));

    // Loaned-out players simulate regular game time at the partner club.
    // They skip condition recovery and injury risk (handled off-system)
    // but receive a boosted development multiplier.
    const isLoanedOut = !!p.loanOut;
    const effectiveDevChance = isLoanedOut
      ? intensity.developmentChance * LOAN_DEV_MULTIPLIER
      : intensity.developmentChance * condMult;

    // Development rolls — one per stat per player. Walk PLAYER_STAT_KEYS
    // (stable order) so the rngTransfer sequence is identical across
    // seasons / clubs / players that pick the same focus.
    // condMult scales the development chance — no new RNG draw.
    const statDeltas: Partial<PlayerStats> = {};
    rollDevelopmentGains(statDeltas, focus, effectiveDevChance, ageMul, proxMul);

    if (!isLoanedOut) {
      // Flat decay rolls — rest/light only (decayChance > 0). Focused stats are immune;
      // a positive gain from the development pass above takes precedence.
      if (intensity.decayChance > 0) {
        for (const stat of PLAYER_STAT_KEYS) {
          const isFocus = stat === focus[0] || stat === focus[1];
          if (isFocus) continue;
          if (statDeltas[stat] !== undefined) continue;
          if (rngTransferRaw() < intensity.decayChance) {
            statDeltas[stat] = -TRAINING_STAT_DELTA;
          }
        }
      }

      // High-stat maintenance decay — all intensities. Unfocused stats above the
      // threshold face a quadratic decay chance; rotation is the only protection.
      for (const stat of PLAYER_STAT_KEYS) {
        const isFocus = stat === focus[0] || stat === focus[1];
        if (isFocus) continue;
        if (statDeltas[stat] !== undefined) continue;
        const excess = p.baseStats[stat] - DEVELOPMENT.highStatDecayThreshold;
        if (excess <= 0) continue;
        const decayChance = (excess * excess) / DEVELOPMENT.highStatDecayScale;
        if (rngTransferRaw() < decayChance) {
          statDeltas[stat] = -TRAINING_STAT_DELTA;
        }
      }
    }

    out.push({
      type: 'PLAYER_TRAINED',
      rosterId: rid,
      conditionDelta: isLoanedOut ? 0 : intensity.conditionPerDay * periodDays * condMult,
      statDeltas,
    });

    if (!isLoanedOut) {
      // Injury roll — scales inversely with current condition (the lower
      // the freshness, the higher the risk). Fitness staff reduces injuryRisk
      // fractionally before the condition multiplier is applied.
      const baseRisk    = intensity.injuryRisk * (1 - injuryFraction);
      const injuryChance = baseRisk * conditionRiskMultiplier(p.condition);
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

// One development pass over all PLAYER_STAT_KEYS: rolls rngTransferRaw()
// per stat and increments out[stat] on success. Shared between club training
// (pushClubTrainingEvents) and international camp training
// (internationalDutyEngine.resolveInternationalBreak).
export function rollDevelopmentGains(
  out: Partial<PlayerStats>,
  focus: [keyof PlayerStats, keyof PlayerStats],
  devChance: number,
  ageMul: number,
  proxMul: number,
): void {
  for (const stat of PLAYER_STAT_KEYS) {
    const isFocus = stat === focus[0] || stat === focus[1];
    const multiplier = isFocus ? DEVELOPMENT.focusMultiplier : DEVELOPMENT.unfocusedMultiplier;
    const chance = devChance * multiplier * ageMul * proxMul;
    if (chance > 0 && rngTransferRaw() < chance) {
      out[stat] = (out[stat] ?? 0) + 1;
    }
  }
}
