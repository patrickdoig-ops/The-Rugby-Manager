import type { Player, PlayerStats, Position } from '../types/player';
import { clamp } from '../utils/math';
import { PLAYER_OVERALL_WEIGHTS, RATING_WEIGHTS } from './balance';

// Ability-based overall (0–100) — position-weighted mean of the 12 baseStats,
// normalised by the sum of weights so the output stays on the same 0–100
// scale a simple mean would produce. Stats missing from the position's
// weight table default to 1.0. Used for pre-match roster displays and
// team-level rating aggregation. Distinct from `computeRating` below, which
// is match-performance-based.
export function playerOverall(stats: PlayerStats, position: Position): number {
  const weights = PLAYER_OVERALL_WEIGHTS[position];
  let weightedSum = 0;
  let weightTotal = 0;
  for (const key of Object.keys(stats) as (keyof PlayerStats)[]) {
    const w = weights[key] ?? 1.0;
    weightedSum += stats[key] * w;
    weightTotal += w;
  }
  return Math.round(weightedSum / weightTotal);
}

export function computeRating(player: Player): number {
  const s = player.matchStats;
  const id = player.id;
  const W = RATING_WEIGHTS;
  const u = W.universal;
  let score = 0;

  // Universal contributions
  score += s.tries             * u.tries;
  score += s.lineBreaks        * u.lineBreaks;
  score += s.defendersBeaten   * u.defendersBeaten;
  score += s.turnoversWon      * u.turnoversWon;
  score += s.dominantTackles   * u.dominantTackles;
  score += s.tacklesMade       * u.tacklesMade;
  score += s.kicksMade         * u.kicksMade;
  score += s.metresCarried     * u.metresCarried;
  score += s.knockOns          * u.knockOns;
  score += (s.tacklesAttempted - s.tacklesMade) * u.missedTacklePerMiss;
  score += s.penaltiesConceded * u.penaltiesConceded;
  score += s.kicksMissed       * u.kicksMissed;
  score += s.yellowCards       * u.yellowCards;
  score += s.redCards          * u.redCards;

  // Position bonuses
  if (id === 2) {
    // Maul tries are a team effort — hooker try credit is halved (net 3.5 vs 7.0).
    score -= s.tries * W.position.hooker.tryDiscount;
    if (s.lineoutThrows > 0)
      score += (s.lineoutWins / s.lineoutThrows - W.position.hooker.lineoutWinRateBaseline) * W.position.hooker.lineoutBonusMultiplier;
  }

  if (id === 4 || id === 5) {
    score += s.lineoutCatches * W.position.locks.lineoutCatch;
    score += s.lineoutSteals  * W.position.locks.lineoutSteal;
  }

  if (id <= 3) {
    score += s.scrumPenaltiesWon      * W.position.frontRow.scrumPenaltyWon;
    score += s.scrumPenaltiesConceded * W.position.frontRow.scrumPenaltyConceded;
  }

  if (id >= 6 && id <= 8) {
    score += s.turnoversWon * W.position.backRow.extraTurnoverWon;
    score += s.carries      * W.position.backRow.carry;
  }

  if (id === 9)  score += s.passes        * W.position.scrumHalf.passes;
  if (id === 10) score += s.kicksFromHand * W.position.flyHalf.kicksFromHand;

  if (id === 11 || id === 14 || id === 15)
    score += s.lineBreaks * W.position.backThree.extraLineBreak;

  return clamp(W.base + score / W.divisor, W.min, W.max);
}
