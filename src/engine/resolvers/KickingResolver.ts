import type { Player } from '../../types/player';
import type { KickResult, AttackingKickSubType } from '../../types/engine';
import type { BackfieldDefence } from '../../types/team';
import { rng } from '../../utils/rng';
import { TACTICAL_KICK_VALUES, GOAL_KICK_VALUES, FIFTY_22_VALUES, ATTACKING_KICK_VALUES, PENALTY_KICK_TO_TOUCH_VALUES } from '../balance';

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

// Penalty kick to touch. From a penalty, the kicking team retains the
// throw from anywhere on the field — no own-22 gate (unlike tactical
// kicks). The only failure mode is the ball NOT finding touch, in
// which case it stays in field and the opposition counter-attacks.
// Two-stage roll: kicker quality decides good vs poor kick (distance
// band + touch-finding probability both shift), then a touch roll.
export interface PenaltyKickToTouchResolution {
  kickScore:  number;
  distance:   number;
  findsTouch: boolean;
}

export function resolvePenaltyKickToTouch(kicker: Player, distanceToTryLine: number): PenaltyKickToTouchResolution {
  const V = PENALTY_KICK_TO_TOUCH_VALUES;
  const kickScore = kicker.currentStats.kicking + rng(1, 20);
  const goodKick  = kickScore >= V.goodKickThreshold;
  
  let touchPct: number = goodKick ? V.goodKickTouchPct : V.poorKickTouchPct;
  
  // Gimme range: kicks to touch from inside the opposition 22m are virtually guaranteed.
  if (distanceToTryLine <= 22) {
    touchPct = 99;
  }
  
  return {
    kickScore,
    distance:   goodKick ? rng(V.goodKickDistance[0], V.goodKickDistance[1]) : rng(V.poorKickDistance[0], V.poorKickDistance[1]),
    findsTouch: rng(1, 100) <= touchPct,
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

export function resolveFiftyTwentyTwo(
  kicker: Player,
  defenderBackfield: BackfieldDefence,
  // Additional success-rate boost from the kicking team's gameplan
  // (TACTIC_MODIFIERS.gamePlanFiftyTwentyTwoBonus). A team committed to a
  // kicking style backs themselves on the corner kick more often — the
  // gate stays defender-backfield-dominant, this just nudges the
  // distribution.
  planBonus: number = 0,
): FiftyTwoTwoResolution {
  const V = FIFTY_22_VALUES;
  const baseSuccess = V.baseSuccessPct[defenderBackfield];
  const statMod = (kicker.currentStats.kicking - V.kickerStatPivot) * V.kickerStatWeight;
  const successPct = Math.max(V.successPctMin, Math.min(V.successPctMax, baseSuccess + statMod + planBonus));
  const distance = rng(V.attemptDistance[0], V.attemptDistance[1]);

  if (rng(1, 100) <= successPct) {
    return { outcome: 'success', successPct, distance };
  }
  // Failed — split between caught (in field) and touch_elsewhere
  const missedTouch = rng(1, 100) <= V.failureMissTouchPct;
  return { outcome: missedTouch ? 'caught_in_field' : 'touch_elsewhere', successPct, distance };
}

// Attacking kicks from #10 — cross-field (aerial contest to far winger)
// or grubber (low rolling kick through the line). Both return one of
// three outcomes: attacker regathers (front-foot opportunity / try),
// defender wins the contest (turnover), or the ball goes dead (knock-on
// /out / can't be played).
export type AttackingKickOutcome = 'attacker_wins' | 'defender_wins' | 'dead';
export interface AttackingKickResolution {
  outcome: AttackingKickOutcome;
  distance: number;
}

export function resolveAttackingKick(subType: AttackingKickSubType, kicker: Player): AttackingKickResolution {
  const V = ATTACKING_KICK_VALUES[subType === 'cross_field' ? 'crossField' : 'grubber'];
  const distance = rng(V.distance[0], V.distance[1]);
  const statMod = (kicker.currentStats.kicking - V.kickerStatPivot) * V.kickerStatWeight;
  const attackerWinsPct = Math.max(ATTACKING_KICK_VALUES.attackerWinsMinPct, Math.min(ATTACKING_KICK_VALUES.attackerWinsMaxPct, V.attackerWinsBase + statMod));
  const deadPct = V.deadBase;
  const roll = rng(1, 100);
  if (roll <= attackerWinsPct) return { outcome: 'attacker_wins', distance };
  if (roll <= attackerWinsPct + deadPct) return { outcome: 'dead', distance };
  return { outcome: 'defender_wins', distance };
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
