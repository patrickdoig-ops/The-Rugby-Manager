import type { Player } from '../../types/player';
import type { KickResult } from '../../types/engine';
import { rng } from '../../utils/rng';

export interface KickingResolution {
  kickScore: number;
  distance: number;                // metres the kick travels
  outOnTheFullProbability: number; // 0–100; chance kick goes directly out on the full
  touchProbability: number;        // 0–100; chance kick finds touch
}

export function resolveTacticalKick(kicker: Player): KickingResolution {
  const kickScore = kicker.currentStats.kicking + rng(1, 20);
  const goodKick  = kickScore >= 25;
  return {
    kickScore,
    distance:                goodKick ? rng(30, 50) : rng(10, 20),
    outOnTheFullProbability: goodKick ? 0 : 30,
    touchProbability:        goodKick ? 75 : 30,
  };
}

export interface GoalKickResolution {
  success: boolean;
  score: number;
  threshold: number;
}

export function resolveGoalKick(kicker: Player, distanceFromPosts: number): GoalKickResolution {
  const anglePenalty = distanceFromPosts * 0.3;
  const score = kicker.currentStats.kicking
              + kicker.currentStats.composure * 0.2
              - anglePenalty
              + rng(1, 20);
  const threshold = 65;
  return { success: score >= threshold, score, threshold };
}
