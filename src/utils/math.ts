import type { Player, PlayerStats } from '../types/player';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function avgStat(players: Player[], stat: keyof PlayerStats): number {
  if (players.length === 0) return 0;
  return players.reduce((sum, p) => sum + p.currentStats[stat], 0) / players.length;
}

export function weightedScore(pairs: Array<[number, number]>): number {
  return pairs.reduce((sum, [value, weight]) => sum + value * weight, 0);
}
