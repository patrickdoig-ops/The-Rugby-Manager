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

export interface PlayerMatchStats {
  carries:                number;
  metresCarried:          number;
  lineBreaks:             number;
  defendersBeaten:        number;
  knockOns:               number;
  passes:                 number;
  tacklesAttempted:       number;
  tacklesMade:            number;
  dominantTackles:        number;
  turnoversWon:           number;
  penaltiesConceded:      number;
  tries:                  number;
  kicksFromHand:          number;
  kicksAtGoal:            number;
  kicksMade:              number;
  kicksMissed:            number;
  lineoutThrows:          number;
  lineoutWins:            number;
  lineoutCatches:         number;
  lineoutSteals:          number;
  scrumPenaltiesWon:      number;
  scrumPenaltiesConceded: number;
  kickMetres:             number;
  rucksHit:               number;
}

export interface Player {
  id: number;
  squadNumber: number;
  firstName: string;
  lastName: string;
  dob: string | null;
  nationality: string;
  position: Position;
  baseStats: PlayerStats;
  currentStats: PlayerStats;
  matchStats: PlayerMatchStats;
  fatiguePct: number;
  formModifier: number;
  rating: number;
  x: number;
  y: number;
}
