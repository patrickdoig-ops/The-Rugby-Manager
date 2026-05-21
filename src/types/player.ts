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
  yellowCards:            number;
  redCards:               number;
}

// Season-scope aggregates accumulated per fixture (player and silent AI).
// Reset on SEASON_ROLLED_OVER. Used to drive top-scorer / MVP / appearances
// cards in EndOfSeasonScreen. `ratingSum` is an accumulator: avg rating =
// ratingSum / appearances.
export interface PlayerSeasonStats {
  appearances:      number;
  tries:            number;
  conversions:      number;
  penaltiesScored:  number;
  dropGoals:        number;
  yellowCards:      number;
  redCards:         number;
  tackles:          number;
  missedTackles:    number;
  turnoversWon:     number;
  ratingSum:        number;
}

// Contract terms held against a Player. Read-only in Phase 2 of the
// career system — seeded once at roster creation (via
// src/game/contractSeeder.ts or per-player overrides in
// docs/team-data.md), never mutates. Phase 3+ adds renewals and
// signings as dedicated SeasonEvent variants.
export interface PlayerContract {
  clubId: string;          // current club; matches the RawTeamInput.id of the owning club
  expiresOn: string;       // ISO yyyy-mm-dd; convention is 30 June of the season-end year
  annualWage: number;      // £ per year, gross
  isMarquee: boolean;      // true ⇔ this player occupies the club's one marquee slot
}

export interface Player {
  // Matchday slot number, 1–23. Used by match-engine events / RatingEngine /
  // StaminaSystem. Reassigned by applyMatchdaySquad on every pre-match.
  // NOT the persistent identity — use `rosterId` for that.
  id: number;
  squadNumber: number;
  // Globally-unique persistent identity allocated at roster seed time.
  // Stable across substitutions, rollovers, and transfers. Keys
  // GameState.career.roster.
  rosterId: number;
  firstName: string;
  lastName: string;
  dob: string | null;
  nationality: string;
  position: Position;
  baseStats: PlayerStats;
  currentStats: PlayerStats;
  matchStats: PlayerMatchStats;
  seasonStats: PlayerSeasonStats;
  // Career-scope reputation, 0–100. Seeded from overall rating + a
  // marquee bump. Drifts up/down with form / silverware (Phase 3+);
  // read-only in Phase 2.
  reputation: number;
  // Contract terms. Always populated on the persistent roster (via
  // contractSeeder); the matchday-Player copy carries them through too.
  // Read-only in Phase 2.
  contract: PlayerContract;
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
    yellowCards: 0, redCards: 0,
  };
}

export function zeroSeasonStats(): PlayerSeasonStats {
  return {
    appearances: 0, tries: 0, conversions: 0, penaltiesScored: 0, dropGoals: 0,
    yellowCards: 0, redCards: 0, tackles: 0, missedTackles: 0, turnoversWon: 0,
    ratingSum: 0,
  };
}
