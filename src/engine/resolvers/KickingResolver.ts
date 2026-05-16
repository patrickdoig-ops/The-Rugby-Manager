import type { Player } from '../../types/player';
import type { KickResult } from '../../types/engine';
import { rng } from '../../utils/rng';

export interface KickingResolution {
  result: KickResult;
  kickScore: number;
  catchScore: number;
  ballMovement: number;
}

export function resolveTacticalKick(kicker: Player, defender: Player): KickingResolution {
  const kickScore = kicker.currentStats.kicking + rng(1, 20);

  if (kickScore < 25) {
    return { result: 'poor_kick', kickScore, catchScore: 0, ballMovement: -5 };
  }

  const catchScore = (defender.currentStats.handling + defender.currentStats.positioning) / 2 + rng(1, 20);
  const ballMovement = Math.round((kickScore - 50) / 5);

  if (catchScore < 30) {
    return { result: 'knock_on_catch', kickScore, catchScore, ballMovement };
  }

  return { result: 'good_kick', kickScore, catchScore, ballMovement };
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
