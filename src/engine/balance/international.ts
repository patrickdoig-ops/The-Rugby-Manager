// International duty tuning — squad selection, in-block load, return penalties,
// and the PGA rest rule. Consumed by src/game/internationalDutyEngine.ts.
//
// Model (see docs/game-engine.md § "International Duty"): the Premiership pauses
// during the Autumn Nations Series (return Round 6) and the Six Nations (return
// Round 11). Selected players skip the club training block over the gap and
// return tired / possibly injured. England heavy-load players also pick up a
// PGA rest obligation.

import type { InternationalWindow, InjuryKind } from '../../types/player';

// Display + matching identity for a modelled international nation.
export interface NationSpec {
  nation: string;            // display name, e.g. 'England'
  // Nationality strings that map to this nation. Authored team JSON uses the
  // country form ('England', 'Wales', 'Scotland', 'South Africa'); the persona
  // generator uses demonyms ('English', 'Welsh', 'Scottish'). Both are listed
  // so selection catches authored + generated players alike.
  aliases: string[];
  ovrThreshold: number;      // minimum overall rating to be considered
  squadCap: number;          // max Prem-based players called up per window
}

export const NATIONS: Record<string, NationSpec> = {
  England:        { nation: 'England',      aliases: ['England', 'English'],   ovrThreshold: 74, squadCap: 28 },
  Wales:          { nation: 'Wales',        aliases: ['Wales', 'Welsh'],       ovrThreshold: 72, squadCap: 12 },
  Scotland:       { nation: 'Scotland',     aliases: ['Scotland', 'Scottish'], ovrThreshold: 72, squadCap: 12 },
  'South Africa': { nation: 'South Africa', aliases: ['South Africa'],         ovrThreshold: 76, squadCap: 12 },
};

export interface WindowSpec {
  returnRound: number;       // the Premiership round players come back for
  tests: number;             // number of internationals in the block
  nations: string[];         // NATIONS keys modelled this window
  restWindowRounds: number;  // size of the PGA rest window, in rounds
}

// Autumn pulls in the Springboks (northern tour); the Six Nations does not.
export const INTERNATIONAL_WINDOWS: Record<InternationalWindow, WindowSpec> = {
  autumn:      { returnRound: 6,  tests: 4, nations: ['England', 'Wales', 'Scotland', 'South Africa'], restWindowRounds: 3 },
  six_nations: { returnRound: 11, tests: 5, nations: ['England', 'Wales', 'Scotland'],                 restWindowRounds: 3 },
};

// The PGA rest obligation applies to England internationals only.
export const PGA_REST_NATION = 'England';

export const INTERNATIONAL_LOAD = {
  // minutesPct (share of the block's Tests a player features in) by selection
  // rank: rank-1 ≈ topMinutesPct, dropping minutesDropPerRank per rank, floored
  // at minMinutesPct, with ±minutesNoise of rngTransfer jitter. So a
  // first-choice captain carries a near-full load; a fringe call-up far less.
  topMinutesPct:      0.95,
  minutesDropPerRank: 0.035,
  minMinutesPct:      0.20,
  minutesNoise:       0.08,

  // Return condition = 100 − conditionPenaltyAtFullLoad × minutesPct ± noise,
  // clamped to [conditionFloor, conditionCeil]. Moderate severity: a full-load
  // international comes back ~55-70 while a rested clubmate sits near 100.
  conditionPenaltyAtFullLoad: 38,
  conditionNoise:             6,
  conditionFloor:             30,
  conditionCeil:              95,

  // Return injury chance = injuryChanceAtFullLoad × minutesPct. Moderate:
  // ~8-12% for a full-load player, scaling down with appearances.
  injuryChanceAtFullLoad: 0.11,

  // England heavy-load threshold (share of minutes) for the PGA rest rule.
  restMinutesThreshold: 0.65,
} as const;

// Injury kinds a player can pick up on international duty (contact / soft
// tissue). Severity + weeks come from INJURY_SEVERITY in balance/injuries.ts.
export const INTERNATIONAL_INJURY_KINDS: InjuryKind[] = ['muscle_strain', 'ligament_sprain', 'knock', 'shoulder'];

// 2025/26 season-open state for returning British & Irish Lions tourists
// (2025 Australia tour, final Test 2 Aug 2025). Under the Professional Game
// Agreement's mandatory ~10-week post-tour rest, tourists were unavailable for
// the opening two Premiership rounds and returned around Round 3 (Freeman /
// Smith / Smith) — Round 4 (Itoje) at reduced match fitness. We model them as
// unavailable until LIONS_RETURN_ROUND and seeded at LIONS_RETURN_CONDITION,
// recovering once they rejoin club training. One-shot at GameCoordinator.
// newSeason; the next Lions tour (2029) is out of scope.
// Return condition is centred on LIONS_RETURN_CONDITION with ±NOISE of
// rngTransfer spread, so tourists come back at a realistic range of fitness
// (some closer to match-ready, others rustier) rather than all on one value.
export const LIONS_RETURN_CONDITION = 78;
export const LIONS_RETURN_CONDITION_NOISE = 10;   // → returns land in [68, 88]
export const LIONS_RETURN_ROUND = 3;

// 2025/26 season-open state for returning England and Wales summer tour
// players. Shorter tours (3 Tests for England, 2 for Wales) mean players
// return slightly fresher than Lions tourists. No PGA stand-down applies —
// England players were only excluded from the two pre-season cup rounds (leg
// 0) by agreement, and were available for league R1 onward.
// Return condition centred on SUMMER_TOUR_RETURN_CONDITION with
// ±SUMMER_TOUR_RETURN_CONDITION_NOISE of rngTransfer spread.
export const SUMMER_TOUR_RETURN_CONDITION = 83;
export const SUMMER_TOUR_RETURN_CONDITION_NOISE = 7;  // → returns land in [76, 90]
