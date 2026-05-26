// AI training planner. One TrainingPlan per non-user club per week,
// weighted by squad condition + recent form + the club's weakest aggregate
// area read from teamSeasonStats. Pure module — RNG flows via rngTransfer
// (career stream). Mirrors aiTransferDirector in spirit: the user's club
// is never touched.
//
// Determinism: caller iterates clubs in id-ascending order (see
// applyTrainingWeek in GameCoordinator); each pickPlan call advances
// rngTransfer the same number of times regardless of inputs so a different
// roster shape doesn't shift the sequence.

import type { ClubState, GameState } from '../types/gameState';
import type { BacksFocus, ForwardsFocus, TrainingIntensity, TrainingPlan } from '../types/training';
import { rngTransferRaw } from '../utils/rng';
import { AI_TRAINING } from '../engine/balance/training';

const FORWARDS_FOCUS_KEYS: ForwardsFocus[] = ['set_piece', 'strength', 'stamina', 'handling'];
const BACKS_FOCUS_KEYS:    BacksFocus[]    = ['tackling', 'defensive_organisation', 'attacking_skills', 'kicking'];

export function pickPlan(state: GameState, club: ClubState): TrainingPlan {
  const intensity = pickIntensity(state, club);
  // 3 rngTransfer calls per club regardless of branch taken keeps the
  // sequence stable across seasons.
  const forwardsFocus = FORWARDS_FOCUS_KEYS[Math.floor(rngTransferRaw() * FORWARDS_FOCUS_KEYS.length)];
  const backsFocus    = BACKS_FOCUS_KEYS   [Math.floor(rngTransferRaw() * BACKS_FOCUS_KEYS.length)];
  // Burn one extra roll so pickIntensity + 2 focus picks always cost 3
  // rngTransfer regardless of which intensity branch was hit (the
  // intensity picker may consume 1 or 2 rolls otherwise).
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
  if (club.squad.length === 0) return 100;
  let total = 0;
  let n = 0;
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (!p) continue;
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
