// Authored attacking shapes (WP5 § 9 — shape editor consumption). A team can set
// into a hand-authored FORMATION instead of the procedural pod/backline fan; the
// spatial engine positions the named slots into the shape and its decision layer
// still makes the passing calls (Upgrade.md § 6 — authored Layer-1 skeleton,
// emergent decisions). Shapes are authored in the Phase Animator's shape editor
// ("Export spatial shape") and pasted here.
//
// Coordinates are mark-relative and ATTACK-ORIENTED so one shape works anywhere:
//   fwd — along the attack direction; NEGATIVE = behind the gain line (where backs
//         set up), 0 = on the gain line (the ruck).
//   lat — toward the OPEN side (positive); the engine mirrors it to whichever side
//         is actually open at runtime (`openSign`), so a shape authored to one side
//         plays correctly off either touchline.
// Only the slots a shape NAMES are driven by it; the rest fall back to the
// procedural shape. Selected by the team's effective `attackingStyle` (undefined →
// procedural). This is the shape-editor data seam; the WP6 playbook layers named
// set-moves on top.

import type { AttackingStyle } from '../../types/team';

export interface AuthoredShape {
  name: string;
  slots: Record<number, { fwd: number; lat: number }>;
}

export const AUTHORED_ATTACK_SHAPES: Partial<Record<AttackingStyle, AuthoredShape>> = {
  // Seeded demo + the fix for the bunched backline: a back line spread across ~60 m
  // of the pitch — first receiver flat-ish off 10, centres + open wing fanning wide
  // and deeper, a blindside winger held short, the full-back arriving deep. Replace
  // / extend this by authoring in the shape editor and exporting.
  wide_wide: {
    name: 'wide spread backline',
    slots: {
      9:  { fwd: -1,  lat: 0 },    // scrum-half at the ruck base
      10: { fwd: -5,  lat: 8 },    // fly-half — first receiver
      12: { fwd: -7,  lat: 20 },   // inside centre
      13: { fwd: -9,  lat: 33 },   // outside centre
      11: { fwd: -11, lat: 46 },   // open wing — out wide
      14: { fwd: -7,  lat: -15 },  // blindside wing
      15: { fwd: -15, lat: 27 },   // full-back arriving deep
    },
  },
};
