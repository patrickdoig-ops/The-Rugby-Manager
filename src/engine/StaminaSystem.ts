import type { Team } from '../types/team';
import type { PlayerStats } from '../types/player';
import { clamp } from '../utils/math';
import { rng } from '../utils/rng';

export function applyFatigue(team: Team, elapsedMinutes: number): void {
  for (const player of team.players) {
    const decayRate = 0.5 + rng(0, 10) / 10;
    const staminaBase = player.baseStats.stamina;
    const actualDecay = decayRate * 4 * (1 - staminaBase / 150);
    player.fatiguePct = clamp(player.fatiguePct - actualDecay, 0, 100);

    const base = player.baseStats;
    const f = player.fatiguePct;

    const copyBase = (): PlayerStats => ({ ...base });
    const stats = copyBase();

    if (f < 70) {
      stats.pace    = Math.round(base.pace    * 0.95);
      stats.agility = Math.round(base.agility * 0.95);
    }
    if (f < 50) {
      stats.pace      = Math.round(base.pace    * 0.87);
      stats.agility   = Math.round(base.agility * 0.87);
      stats.handling  = Math.round(base.handling  * 0.92);
      stats.discipline= Math.round(base.discipline* 0.92);
      stats.composure = Math.round(base.composure * 0.92);
    }
    if (f < 30) {
      stats.pace      = Math.round(base.pace    * 0.75);
      stats.agility   = Math.round(base.agility * 0.75);
      stats.handling  = Math.round(base.handling  * 0.80);
      stats.discipline= Math.round(base.discipline* 0.80);
      stats.composure = Math.round(base.composure * 0.80);
      stats.tackling  = Math.round(base.tackling  * 0.85);
    }

    const clampAll = (s: PlayerStats): PlayerStats =>
      Object.fromEntries(
        Object.entries(s).map(([k, v]) => [k, clamp(v, 1, 100)])
      ) as unknown as PlayerStats;

    player.currentStats = clampAll(stats);
  }
}
