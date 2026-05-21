export type Position =
  | 'Prop' | 'Hooker' | 'Lock'
  | 'Flanker' | 'Number 8' | 'Back Row'
  | 'Scrum-Half' | 'Fly-Half'
  | 'Centre' | 'Wing' | 'Fullback' | 'Utility Back';

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

// Identity element for PlayerMatchStats — co-located with the type so adding
// a new stat is a single-file change (extend the interface + zero it here).
export function zeroMatchStats(): PlayerMatchStats {
  return {
    carries: 0, metresCarried: 0, lineBreaks: 0, defendersBeaten: 0,
    knockOns: 0, passes: 0, tacklesAttempted: 0, tacklesMade: 0,
    dominantTackles: 0, turnoversWon: 0, penaltiesConceded: 0, tries: 0,
    kicksFromHand: 0, kicksAtGoal: 0, kicksMade: 0, kicksMissed: 0,
    lineoutThrows: 0, lineoutWins: 0, lineoutCatches: 0, lineoutSteals: 0,
    scrumPenaltiesWon: 0, scrumPenaltiesConceded: 0,
    kickMetres: 0, rucksHit: 0,
  };
}
