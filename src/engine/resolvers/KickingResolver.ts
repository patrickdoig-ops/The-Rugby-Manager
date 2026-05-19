import type { Player } from '../../types/player';
import type { KickResult } from '../../types/engine';
import { rng } from '../../utils/rng';
import { TACTICAL_KICK_VALUES, GOAL_KICK_VALUES } from '../balance';

export interface KickingResolution {
  kickScore: number;
  distance: number;                // metres the kick travels
  outOnTheFullProbability: number; // 0–100; chance kick goes directly out on the full
  touchProbability: number;        // 0–100; chance kick finds touch
}

export function resolveTacticalKick(kicker: Player): KickingResolution {
  const V = TACTICAL_KICK_VALUES;
  const kickScore = kicker.currentStats.kicking + rng(1, 20);
  const goodKick  = kickScore >= V.goodKickThreshold;
  return {
    kickScore,
    distance:                goodKick ? rng(V.goodKickDistance[0], V.goodKickDistance[1]) : rng(V.poorKickDistance[0], V.poorKickDistance[1]),
    outOnTheFullProbability: goodKick ? V.goodKickOutOnFullProb : V.poorKickOutOnFullProb,
    touchProbability:        goodKick ? V.goodKickTouchProb     : V.poorKickTouchProb,
  };
}

export interface GoalKickResolution {
  success: boolean;
  score: number;
  threshold: number;
}

export function resolveGoalKick(kicker: Player, distanceFromPosts: number): GoalKickResolution {
  const { angleWeight, composureWeight, successThreshold } = GOAL_KICK_VALUES;
  const anglePenalty = distanceFromPosts * angleWeight;
  const score = kicker.currentStats.kicking
              + kicker.currentStats.composure * composureWeight
              - anglePenalty
              + rng(1, 100);
  return { success: score >= successThreshold, score, threshold: successThreshold };
}
