// Deterministic player form inputs.
//
// Computes the career-derived part of a player's match-day form — the bias
// (recent ratings + freshness + return-from-absence rustiness) and the
// volatility multiplier (age + marquee). These are threaded onto the matchday
// RawPlayer by rosterTeamBuilder; MatchCoordinator.initPlayer combines them
// with a single random draw to produce the final form modifier.
//
// Pure and deterministic: no RNG, no mutation. The random perturbation lives in
// the engine, so adding this bias cannot perturb the form RNG stream order.

import { FORM_MODEL, MORALE } from '../engine/balance';
import type { GameState } from '../types/gameState';
import type { Player } from '../types/player';
import { getAge } from './age';
import { leagueRound } from './leagueRound';

export interface FormInputs {
  bias: number;
  volatility: number;
}

function recentRatingBias(recent: number[] | undefined): number {
  if (!recent || recent.length < FORM_MODEL.minApps) return 0;
  const avg = recent.reduce((a, r) => a + r, 0) / recent.length;
  const raw = (avg - FORM_MODEL.ratingBaseline) * FORM_MODEL.ratingSlope;
  return Math.max(-FORM_MODEL.ratingBiasClamp, Math.min(FORM_MODEL.ratingBiasClamp, raw));
}

function conditionBias(condition: number): number {
  const raw = (condition - FORM_MODEL.conditionNeutral) * FORM_MODEL.conditionSlope;
  return Math.max(-FORM_MODEL.conditionCap, Math.min(FORM_MODEL.conditionCap, raw));
}

function returnBias(formReturn: Player['formReturn'], currentRound: number): number {
  if (!formReturn) return 0;
  const elapsed = currentRound - formReturn.round;
  const fade = Math.max(0, 1 - elapsed / FORM_MODEL.returnFadeRounds);
  return formReturn.penalty * fade;
}

function moraleBias(morale: number | undefined): number {
  const m = morale ?? MORALE.baseline;
  const raw = (m - MORALE.formNeutral) * MORALE.formSlope;
  return Math.max(-MORALE.formCap, Math.min(MORALE.formCap, raw));
}

function ageVolatility(age: number | null): number {
  if (age === null) return 1;
  if (age <= FORM_MODEL.youngAge) return FORM_MODEL.youngVolatility;
  if (age >= FORM_MODEL.veteranAge) return FORM_MODEL.veteranVolatility;
  return 1;
}

export function computeFormInputs(state: GameState, p: Player): FormInputs {
  const currentRound = leagueRound(state);
  const bias =
    recentRatingBias(p.recentRatings) +
    conditionBias(p.condition) +
    returnBias(p.formReturn, currentRound) +
    moraleBias(p.morale);

  const age = getAge(p.dob, state.calendar.date);
  const volatility = ageVolatility(age) * (p.contract.isMarquee ? FORM_MODEL.marqueeVolatility : 1);

  return { bias, volatility };
}
