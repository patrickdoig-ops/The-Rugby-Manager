// Matchday-slot constants and predicates.
//
// CLAUDE.md "Architecture" — "Position is generic, not split. The engine
// never branches on `player.position` for match logic — scrum/lineout/
// breakdown/first-phase/fatigue/rating-bonuses all key off `player.id`
// (jersey 1-15)." This module names those slots so callers can drop the
// bare numeric literals without changing the data contract.
//
// Names follow standard rugby jersey convention. Where rugby distinguishes
// sides (loosehead / tighthead, left / right wing, inside / outside centre,
// blindside / openside flanker) the engine treats both slots as
// interchangeable; the names below are neutral (PROP_1 / PROP_3, WING_11 /
// WING_14, CENTRE_12 / CENTRE_13, FLANKER_6 / FLANKER_7) to keep the
// generic framing.

export const SLOT = {
  PROP_1: 1,
  HOOKER: 2,
  PROP_3: 3,
  LOCK_4: 4,
  LOCK_5: 5,
  FLANKER_6: 6,
  FLANKER_7: 7,
  NUMBER_8: 8,
  SCRUM_HALF: 9,
  FLY_HALF: 10,
  WING_11: 11,
  CENTRE_12: 12,
  CENTRE_13: 13,
  WING_14: 14,
  FULL_BACK: 15,
} as const;

export const STARTING_XV_MAX = 15;
export const MATCHDAY_MAX = 23;

// Predicates take a matchday slot (player.id, 1-23). Named `*Slot` to avoid
// collision with the position-string helpers in `src/types/player.ts`
// (`isForward(pos: Position)` checks the position label, not the jersey).
export const isForwardSlot = (id: number): boolean => id >= 1 && id <= 8;
export const isBackSlot = (id: number): boolean => id >= 9 && id <= 15;
export const isFrontRowSlot = (id: number): boolean => id >= 1 && id <= 3;
export const isBackRowSlot = (id: number): boolean => id >= 6 && id <= 8;
export const isMatchdaySlot = (id: number): boolean => id >= 1 && id <= MATCHDAY_MAX;
