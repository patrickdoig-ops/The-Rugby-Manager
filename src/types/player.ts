export type Position =
  | 'Loosehead Prop' | 'Hooker' | 'Tighthead Prop'
  | 'Left Lock' | 'Right Lock'
  | 'Blindside Flanker' | 'Openside Flanker' | 'Number 8'
  | 'Scrum-Half' | 'Fly-Half'
  | 'Left Wing' | 'Inside Centre' | 'Outside Centre' | 'Right Wing'
  | 'Fullback' | 'Utility Back';

export interface PlayerStats {
  stamina: number;
  strength: number;
  pace: number;
  agility: number;
  handling: number;
  tackling: number;
  breakdown: number;
  kicking: number;
  setPiece: number;
  discipline: number;
  positioning: number;
  composure: number;
}

export interface Player {
  id: number;
  squadNumber: number;
  name: string;
  position: Position;
  baseStats: PlayerStats;
  currentStats: PlayerStats;
  fatiguePct: number;
  rating: number;
  x: number;
  y: number;
}
