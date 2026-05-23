// 2025-26 Premiership Rugby inbound transfers — Phase B will populate
// this list from Wikipedia (https://en.wikipedia.org/wiki/List_of_2025-26_Premiership_Rugby_transfers).
//
// Each entry describes a player who joined a Premiership club for the
// 2025-26 season. When the user picks Squad Builder mode at game start,
// every name here is matched against the seeded roster, removed from
// their current club, and added to state.career.freeAgents — giving the
// player a re-shaped pre-season pool to sign from.
//
// Name match key is the full name as it appears in the roster
// (firstName + ' ' + lastName), which is unique league-wide
// (CLAUDE.md § "Team data"). `fromClub` is descriptive only — surfaced
// in the UI as context, not used by the engine.

export interface PreSeasonTransfer {
  name: string;
  fromClub?: string;
}

export const PRE_SEASON_TRANSFERS_2025_26: PreSeasonTransfer[] = [];
