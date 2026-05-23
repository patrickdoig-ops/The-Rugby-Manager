import type { Player } from '../../types/player';
import type { KickResult } from '../../types/engine';
import type { BackfieldDefence } from '../../types/team';
import { rng } from '../../utils/rng';
import { TACTICAL_KICK_VALUES, GOAL_KICK_VALUES, FIFTY_22_VALUES } from '../balance';

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

// Deliberate 50/22 attempt — kicker aims at the corner from own half.
// Success: ball bounces in field and into touch inside opp 22 → attacking
// team retains the throw. Failure splits into 'missed_touch' (caught in
// field → KickReturn) and 'touch_elsewhere' (touch outside opp 22 →
// opposition lineout where it went out).
export type FiftyTwoTwoOutcome = 'success' | 'touch_elsewhere' | 'caught_in_field';
export interface FiftyTwoTwoResolution {
  outcome: FiftyTwoTwoOutcome;
  successPct: number;
  distance: number;
}

export function resolveFiftyTwentyTwo(kicker: Player, defenderBackfield: BackfieldDefence): FiftyTwoTwoResolution {
  const V = FIFTY_22_VALUES;
  const baseSuccess = V.baseSuccessPct[defenderBackfield];
  const statMod = (kicker.currentStats.kicking - V.kickerStatPivot) * V.kickerStatWeight;
  const successPct = Math.max(1, Math.min(85, baseSuccess + statMod));
  const distance = rng(V.attemptDistance[0], V.attemptDistance[1]);

  if (rng(1, 100) <= successPct) {
    return { outcome: 'success', successPct, distance };
  }
  // Failed — split between caught (in field) and touch_elsewhere
  const missedTouch = rng(1, 100) <= V.failureMissTouchPct;
  return { outcome: missedTouch ? 'caught_in_field' : 'touch_elsewhere', successPct, distance };
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
