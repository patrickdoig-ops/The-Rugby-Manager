import type { Player } from '../types/player';
import { clamp } from '../utils/math';

export function computeRating(player: Player): number {
  const s = player.matchStats;
  const id = player.id;
  let score = 0;

  // Universal contributions
  score += s.tries             * 7.0;
  score += s.lineBreaks        * 2.5;
  score += s.defendersBeaten   * 0.8;
  score += s.turnoversWon      * 2.5;
  score += s.dominantTackles   * 1.0;
  score += s.tacklesMade       * 0.35;
  score += s.kicksMade         * 1.0;
  score += s.metresCarried     * 0.05;
  score -= s.knockOns          * 1.5;
  score -= (s.tacklesAttempted - s.tacklesMade) * 0.5;
  score -= s.penaltiesConceded * 1.2;
  score -= s.kicksMissed       * 0.75;

  // Position bonuses
  if (id === 2 && s.lineoutThrows > 0)
    score += (s.lineoutWins / s.lineoutThrows - 0.75) * 20;

  if (id === 4 || id === 5) {
    score += s.lineoutCatches * 1.5;
    score += s.lineoutSteals  * 3.0;
  }

  if (id <= 3) {
    score += s.scrumPenaltiesWon      * 2.5;
    score -= s.scrumPenaltiesConceded * 2.5;
  }

  if (id >= 6 && id <= 8) {
    score += s.turnoversWon * 1.5;
    score += s.carries      * 0.3;
  }

  if (id === 9)  score += s.passes        * 0.05;
  if (id === 10) score += s.kicksFromHand * 0.25;

  if (id === 11 || id === 14 || id === 15)
    score += s.lineBreaks * 1.5;

  return clamp(6.0 + score / 10.0, 1.0, 10.0);
}
