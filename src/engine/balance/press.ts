// Press conference tuning — trigger thresholds and answer effect constants.
// Logic: src/game/pressConference.ts; UI: src/ui/PressConferenceScreen.ts.

// Match conditions that trigger a post-match press conference.
export const PRESS_TRIGGER = {
  marginHeavy: 15,   // |score margin| >= this
  boardHeat:   40,   // board.confidence <= this
  lossRun:      2,   // losses in last 3 >= this
  winRun:       3,   // wins in last 3 = this (needs exactly 3 played)
} as const;

// Board-confidence and squad-morale deltas per answer tone.
// Trade-off: positive answers please the board; blunt answers earn player respect.
export const PRESS_ANSWER_EFFECTS: Record<'positive' | 'measured' | 'blunt', { boardDelta: number; moraleDelta: number }> = {
  positive: { boardDelta:  2, moraleDelta: 1 },
  measured: { boardDelta:  0, moraleDelta: 0 },
  blunt:    { boardDelta: -1, moraleDelta: 2 },
};

// Board penalty when the manager skips the press conference entirely.
export const PRESS_SKIP_BOARD_PENALTY = -2;
