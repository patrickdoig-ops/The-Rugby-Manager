// AI training planner. Two responsibilities:
//
//   1. pickPlan(state, club) — one TrainingPlan per non-user club per week,
//      weighted by squad condition + recent form. RNG flows via rngTransfer
//      (career stream). Caller iterates clubs id-ascending so the call
//      sequence is stable across runs.
//
//   2. suggestPlanForUser(state) — advisory suggestion for the managed club,
//      shown in TrainingScreen when an assistant is hired. Advisory-only:
//      never auto-applied, never mutates state. Uses a deterministic per-week
//      hash (no rngTransfer) so it cannot shift the career stream.

import type { ClubState, GameState } from '../types/gameState';
import type { BacksFocus, ForwardsFocus, TrainingIntensity, TrainingPlan } from '../types/training';
import { rngTransferRaw, hashSeed } from '../utils/rng';
import { AI_TRAINING } from '../engine/balance/training';
import { ASSISTANT_NOISE_MAX } from '../engine/balance/staff';

const FORWARDS_FOCUS_KEYS: ForwardsFocus[] = ['set_piece', 'strength', 'stamina', 'handling'];
const BACKS_FOCUS_KEYS:    BacksFocus[]    = ['tackling', 'defensive_organisation', 'attacking_skills', 'kicking'];

export function pickPlan(state: GameState, club: ClubState): TrainingPlan {
  const intensity = pickIntensity(state, club);
  // Exactly 4 rngTransfer calls per club regardless of branch taken keeps
  // the sequence stable across seasons: 1 intensity + 2 focus picks + the
  // legacy burn below.
  const forwardsFocus = FORWARDS_FOCUS_KEYS[Math.floor(rngTransferRaw() * FORWARDS_FOCUS_KEYS.length)];
  const backsFocus    = BACKS_FOCUS_KEYS   [Math.floor(rngTransferRaw() * BACKS_FOCUS_KEYS.length)];
  // Historic padding roll — pickIntensity once consumed a variable 1-2
  // rolls and this burn evened it out. It now always consumes 1, but the
  // burn must stay: removing it would shift every later career draw.
  rngTransferRaw();
  return { intensity, forwardsFocus, backsFocus };
}

// Tilts:
//   - low squad condition → rest/light bias
//   - poor recent form    → high bias (chase form)
//   - else                → medium baseline
//
// Returns a plain probabilistic choice; AI clubs don't all pick the same
// intensity even at identical inputs because the rng roll varies.
function pickIntensity(state: GameState, club: ClubState): TrainingIntensity {
  const avgCondition = squadAvgCondition(state, club);
  const winRate = recentWinRate(state, club.id);

  // Weights over the four intensities. Defaults to a balanced spread.
  let weights: Record<TrainingIntensity, number> = {
    rest: 1, light: 2, medium: 4, high: 2,
  };

  if (avgCondition < AI_TRAINING.squadConditionTiredThreshold) {
    weights = { rest: 4, light: 4, medium: 2, high: 0 };
  } else if (winRate < AI_TRAINING.poorFormWinRateThreshold) {
    weights = { rest: 0, light: 1, medium: 3, high: 5 };
  }

  const total = weights.rest + weights.light + weights.medium + weights.high;
  let roll = rngTransferRaw() * total;
  if ((roll -= weights.rest)   < 0) return 'rest';
  if ((roll -= weights.light)  < 0) return 'light';
  if ((roll -= weights.medium) < 0) return 'medium';
  return 'high';
}

function squadAvgCondition(state: GameState, club: ClubState): number {
  let total = 0;
  let n = 0;
  for (const rid of club.squad) {
    if (n >= 23) break;
    const p = state.career.roster[rid];
    if (!p || p.injury) continue;
    total += p.condition;
    n++;
  }
  return n === 0 ? 100 : total / n;
}

function recentWinRate(state: GameState, clubId: string): number {
  const last3 = state.league.results
    .filter(r => r.homeId === clubId || r.awayId === clubId)
    .slice(-3);
  if (last3.length === 0) return 0.5;
  let wins = 0;
  for (const r of last3) {
    const isHome = r.homeId === clubId;
    const myScore = isHome ? r.homeScore : r.awayScore;
    const oppScore = isHome ? r.awayScore : r.homeScore;
    if (myScore > oppScore) wins++;
  }
  return wins / last3.length;
}

// Advisory suggestion for the managed club. Returns null if no assistant
// is hired. Uses a deterministic per-week FNV-1a hash for the noise roll
// so it never consumes rngTransfer and cannot shift season determinism.
export function suggestPlanForUser(state: GameState): TrainingPlan | null {
  const staff = state.career.staff;
  if (!staff) return null;
  const assistant = staff.find(s => s.role === 'assistant' && s.clubId === state.player.teamId);
  if (!assistant) return null;

  const club = state.career.clubs.find(c => c.id === state.player.teamId);
  if (!club) return null;

  const avgCondition = squadAvgCondition(state, club);
  const winRate = recentWinRate(state, club.id);

  // Optimal intensity — deterministic (no rng roll).
  let optimal: TrainingIntensity;
  if (avgCondition < AI_TRAINING.squadConditionTiredThreshold) {
    optimal = 'light';
  } else if (winRate < AI_TRAINING.poorFormWinRateThreshold) {
    optimal = 'high';
  } else {
    optimal = 'medium';
  }

  // Noise: sub-optimal probability = ASSISTANT_NOISE_MAX × (1 − rating/100).
  // rating 40 → 24%  rating 75 → 10%  rating 90 → 4%
  // Use a per-week hash so the suggestion is stable across re-renders.
  const noiseProb = ASSISTANT_NOISE_MAX * (1 - assistant.rating / 100);
  const h0 = hashSeed(`${state.calendar.seasonLabel}:${state.calendar.week}:0`) / 4294967296;
  const INTENSITIES: TrainingIntensity[] = ['rest', 'light', 'medium', 'high'];
  let intensity: TrainingIntensity;
  if (h0 < noiseProb) {
    const others = INTENSITIES.filter(v => v !== optimal);
    const h1 = hashSeed(`${state.calendar.seasonLabel}:${state.calendar.week}:1`) / 4294967296;
    intensity = others[Math.floor(h1 * others.length)];
  } else {
    intensity = optimal;
  }

  const h2 = hashSeed(`${state.calendar.seasonLabel}:${state.calendar.week}:2`) / 4294967296;
  const h3 = hashSeed(`${state.calendar.seasonLabel}:${state.calendar.week}:3`) / 4294967296;
  const forwardsFocus = FORWARDS_FOCUS_KEYS[Math.floor(h2 * FORWARDS_FOCUS_KEYS.length)];
  const backsFocus    = BACKS_FOCUS_KEYS   [Math.floor(h3 * BACKS_FOCUS_KEYS.length)];

  return { intensity, forwardsFocus, backsFocus };
}

