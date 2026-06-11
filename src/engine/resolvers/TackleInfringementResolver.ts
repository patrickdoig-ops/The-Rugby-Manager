import type { Player } from '../../types/player';
import { rng } from '../../utils/rng';
import { HIGH_TACKLE } from '../balance';

export type TackleInfringement = 'high_tackle';

// Pure helper called once per completed tackle attempt (skipped on line breaks
// — no completed tackle to be high). Returns 'high_tackle' if the tackler is
// whistled, undefined otherwise. The carry handler decides whether the result
// supersedes the carry outcome. `disciplineMod` is the pct-point shift from the
// defending team's discipline tactic (risky +, cautious −).
export function tackleInfringement(defender: Player, disciplineMod = 0): TackleInfringement | undefined {
  const H = HIGH_TACKLE;
  const pct = Math.max(H.minPct, H.basePct
    + (H.statPivot - defender.currentStats.tackling)   * H.tacklingWeight
    + (H.statPivot - defender.currentStats.discipline) * H.disciplineWeight
    + disciplineMod);
  return rng(1, 100) <= pct ? 'high_tackle' : undefined;
}
