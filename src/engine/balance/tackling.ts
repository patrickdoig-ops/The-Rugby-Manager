// Tackler-selection weights. Two axes:
//   1. Primary defender — drawn from the on-field defenders using a weight
//      table chosen by the carrier's channel (hard / midfield / wide) or
//      a flat table on KickReturn.
//   2. Assist tackler — second defender credited on every made tackle.
//      Always drawn from defending forwards (back row + locks dominate),
//      excluding whoever was picked as primary.
//
// Indexed by matchday slot (1-15). A missing entry contributes 0 weight —
// that slot never gets picked from this table. Picker logic in
// `src/engine/FieldPosition.ts::pickWeighted`.

// Hard channel — forward carry (slots 1-8) or scrum-half pickup at the
// ruck. Defending back row and locks make the bulk of the tackle; front
// row contribute when bound into the line; backs rarely involved.
export const HARD_CARRY_DEFENDER_WEIGHTS: Readonly<Partial<Record<number, number>>> = {
  1: 7, 2: 8, 3: 7,            // front row
  4: 14, 5: 14,                // locks
  6: 18, 7: 18, 8: 15,         // back row
  12: 4, 13: 3,                // close-channel centres folding back
};

// Midfield channel — fly-half (10) or inside centre (12) carries.
// Defending 12 and 13 lead; back row arrives to assist; locks fold across.
export const MIDFIELD_CARRY_DEFENDER_WEIGHTS: Readonly<Partial<Record<number, number>>> = {
  4: 4, 5: 4,
  6: 12, 7: 12, 8: 8,
  10: 3,
  12: 18, 13: 12,
};

// Wide channel — outside centre (13), wings (11/14), fullback (15) carries.
// Wings and fullback do most of the defending; centre 13 covers; back row
// rarely involved (they're at the breakdown, not out wide).
export const WIDE_CARRY_DEFENDER_WEIGHTS: Readonly<Partial<Record<number, number>>> = {
  6: 3, 7: 3,
  11: 18, 13: 12, 14: 18, 15: 14,
};

// Kick-return chase pack — flat forward-weighted, no carrier awareness.
// Back row and hookers (the typical chase pack) do most of the chase-and-
// tackle work; wings and fullback chip in on wide returns.
export const KICK_RETURN_DEFENDER_WEIGHTS: Readonly<Partial<Record<number, number>>> = {
  1: 6, 2: 10, 3: 6,
  4: 10, 5: 10,
  6: 18, 7: 18, 8: 14,
  11: 4, 14: 4, 15: 3,
};

// Assist tackler — second player credited on every made tackle. Always
// drawn from defending forwards (back row + locks dominate; hooker
// occasionally). Props are rarely "arriving support" — they're already
// bound into the defensive line at first contact.
export const ASSIST_TACKLER_WEIGHTS: Readonly<Partial<Record<number, number>>> = {
  2: 5,
  4: 10, 5: 10,
  6: 20, 7: 20, 8: 15,
};
