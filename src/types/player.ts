export type Position =
  | 'Prop' | 'Hooker' | 'Lock'
  | 'Flanker' | 'Number 8' | 'Back Row'
  | 'Scrum-Half' | 'Fly-Half'
  | 'Centre' | 'Wing' | 'Fullback' | 'Utility Back';

// Position-group lookup. Used wherever code needs to ask "is this player
// a forward or a back" without enumerating the union — auto-pick on
// forced subs, career age-curve heuristics, etc.
const FORWARD_POSITIONS = new Set<Position>([
  'Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8', 'Back Row',
]);

export function isForward(pos: Position): boolean {
  return FORWARD_POSITIONS.has(pos);
}

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

// Canonical PlayerStats key order. Consumers that drive an RNG stream
// while iterating stats (trainingWeek, careerRollover.developStats) MUST
// walk this array rather than Object.keys(baseStats) — the latter
// happens to work today because every baseStats object is constructed
// in this same order, but one save-format change away from a silent
// determinism desync.
export const PLAYER_STAT_KEYS: (keyof PlayerStats)[] = [
  'stamina', 'strength', 'pace', 'agility',
  'handling', 'tackling', 'breakdown', 'kicking',
  'setPiece', 'discipline', 'positioning', 'composure',
];

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
  conversionsMade:        number;
  penaltiesMade:          number;
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
  offloadsAttempted:      number;
  offloadsCompleted:      number;
}

// Season-scope aggregates accumulated per fixture (player and silent AI).
// Reset on SEASON_ROLLED_OVER. Drives EndOfSeasonScreen cards + the
// leaderboards in src/game/seasonLeaderboards.ts. `ratingSum` is an
// accumulator: avg rating = ratingSum / appearances.
//
export interface PlayerSeasonStats {
  appearances:            number;
  // Attack
  tries:                  number;
  carries:                number;
  metresCarried:          number;
  lineBreaks:             number;
  defendersBeaten:        number;
  offloadsCompleted:      number;
  passes:                 number;
  // Goal kicking
  conversions:            number;
  penaltiesScored:        number;
  dropGoals:              number;
  // Kicking from hand
  kicksFromHand:          number;
  kickMetres:             number;
  kicksAtGoal:            number;
  kicksMade:              number;
  // Defence
  tackles:                number;
  missedTackles:          number;
  dominantTackles:        number;
  turnoversWon:           number;
  // Set piece
  lineoutThrows:          number;
  lineoutWins:            number;
  lineoutCatches:         number;
  lineoutSteals:          number;
  scrumPenaltiesWon:      number;
  scrumPenaltiesConceded: number;
  // Discipline + work rate
  rucksHit:               number;
  yellowCards:            number;
  redCards:               number;
  // Performance rating accumulator
  ratingSum:              number;
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

// Injury kinds (calibrated to professional rugby epidemiology — ligament
// sprains, muscle strains, and concussions account for ~60% of all match
// injuries). The kind picks the severity band (mild/moderate/severe)
// weights via INJURY_KIND_PROFILE in balance/injuries.ts.
export type InjuryKind =
  | 'knock' | 'concussion' | 'muscle_strain' | 'ligament_sprain'
  | 'knee_cartilage' | 'shoulder' | 'fracture' | 'laceration';

export type InjurySeverity = 'mild' | 'moderate' | 'severe';

// The two international windows that overlap the Premiership season and pull
// players away from their clubs. 'autumn' = Autumn Nations Series in November
// (England / Wales / Scotland + the Springbok northern tour); 'six_nations' =
// the Six Nations in Feb–March (England / Wales / Scotland — South Africa is
// absent). The Premiership pauses during both, so the effects land when the
// players return for Round 6 / Round 11.
export type InternationalWindow = 'autumn' | 'six_nations';

// PGA-style rest obligation carried by an *England* international who featured
// heavily in an international block. The player must sit out at least one of
// `eligibleRounds`; the engine force-excludes them on the last (human club) /
// first (AI club) eligible round if they haven't already been rested. Cleared
// by REST_OBLIGATION_RESOLVED the moment they're rested and en masse at
// SEASON_ROLLED_OVER. England players only — the PGA is an RFU/Premiership
// agreement, so Welsh / Scottish / South African returnees never carry one.
export interface RestObligation {
  window: InternationalWindow;
  eligibleRounds: number[];      // the up-to-three Premiership rounds the rest may fall in
}

// Career-scope persistent injury record. Lives on the career-roster Player
// (state.career.roster[rosterId].injury). Written at match teardown by
// PLAYER_INJURED, decremented weekly by INJURY_TICK_ADVANCED, cleared by
// PLAYER_RECOVERED. Absent ⇔ player is fit.
export interface PlayerInjury {
  kind: InjuryKind;
  severity: InjurySeverity;
  weeksRemaining: number;
  injuredOn: string;       // ISO date — for tooltip + recurrence detection
  isRecurrence: boolean;
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
  // Persistent inter-match freshness, 0-100. Seeded at 100; snapshotted from
  // each player's final in-match fatigue via PLAYER_CONDITION_UPDATED, then
  // adjusted weekly by training (PLAYER_TRAINED). Read at MatchCoordinator.
  // initPlayer time as the starting fatiguePct, so a tired starter actually
  // starts the next match tired.
  condition: number;
  // Soft OVR ceiling seeded at game-start (OVR + age-based headroom via
  // POTENTIAL_HEADROOM in balance/career.ts). Growth in both rollover and
  // training is scaled down to near-zero as the player's OVR approaches this
  // value. Decline fires at full rate regardless. Optional for back-compat
  // with pre-v21 saves (SaveManager back-fills it on load).
  potential?: number;
  // Career-scope persistent injury (only meaningful on the roster Player).
  // Optional ⇔ player is fit. Decremented on WEEK_ADVANCED, cleared by
  // PLAYER_RECOVERED. See PlayerInjury above.
  injury?: PlayerInjury;
  // Transient in-match flag: set when this player is injured during the
  // running match. Read at match teardown to fire PLAYER_INJURED season
  // events with severity rolled via rngTransfer. Never serialised; absent
  // outside of an in-progress match.
  pendingInjuryKind?: InjuryKind;
  // Transient call-up flag: present only while the player is away with their
  // national team during an international break (set + cleared inside
  // GameCoordinator.applyTrainingBlock). Drives the training-skip for the
  // break so internationals get no club condition recovery / development.
  // Never serialised — like pendingInjuryKind.
  internationalDuty?: { window: InternationalWindow };
  // Persistent PGA rest obligation (England internationals only). Set on
  // return by PLAYER_RETURNED_FROM_DUTY, cleared by REST_OBLIGATION_RESOLVED.
  // Absent ⇔ no obligation. See RestObligation.
  restObligation?: RestObligation;
  // Career-scope international appearances accumulated across windows. Bumped
  // by PLAYER_CALLED_UP. Optional ⇔ never selected; powers a PlayerProfile
  // stat and lets the duty engine evolve a sense of history over seasons.
  internationalCaps?: number;
  // 2025/26 only: the Premiership round a returning 2025 B&I Lions tourist
  // becomes available, after the PGA mandatory post-tour rest. While
  // `calendar.week < lionsReturnRound` the player is unavailable for selection
  // and skips club training (so they return at their reduced seed condition).
  // Set once at newSeason, cleared at SEASON_ROLLED_OVER. Absent ⇔ not a 2025
  // Lions returnee. See LIONS_RETURN_ROUND.
  lionsReturnRound?: number;
}

// Identity element for PlayerMatchStats — co-located with the type so adding
// a new stat is a single-file change (extend the interface + zero it here).
export function zeroMatchStats(): PlayerMatchStats {
  return {
    carries: 0, metresCarried: 0, lineBreaks: 0, defendersBeaten: 0,
    knockOns: 0, passes: 0, tacklesAttempted: 0, tacklesMade: 0,
    dominantTackles: 0, turnoversWon: 0, penaltiesConceded: 0, tries: 0,
    kicksFromHand: 0, kicksAtGoal: 0, kicksMade: 0, kicksMissed: 0,
    conversionsMade: 0, penaltiesMade: 0,
    lineoutThrows: 0, lineoutWins: 0, lineoutCatches: 0, lineoutSteals: 0,
    scrumPenaltiesWon: 0, scrumPenaltiesConceded: 0,
    kickMetres: 0, rucksHit: 0,
    yellowCards: 0, redCards: 0,
    offloadsAttempted: 0, offloadsCompleted: 0,
  };
}

export function zeroSeasonStats(): PlayerSeasonStats {
  return {
    appearances: 0,
    tries: 0, carries: 0, metresCarried: 0, lineBreaks: 0, defendersBeaten: 0, offloadsCompleted: 0, passes: 0,
    conversions: 0, penaltiesScored: 0, dropGoals: 0,
    kicksFromHand: 0, kickMetres: 0, kicksAtGoal: 0, kicksMade: 0,
    tackles: 0, missedTackles: 0, dominantTackles: 0, turnoversWon: 0,
    lineoutThrows: 0, lineoutWins: 0, lineoutCatches: 0, lineoutSteals: 0,
    scrumPenaltiesWon: 0, scrumPenaltiesConceded: 0,
    rucksHit: 0, yellowCards: 0, redCards: 0,
    ratingSum: 0,
  };
}
