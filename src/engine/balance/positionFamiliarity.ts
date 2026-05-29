// Position familiarity — the out-of-position penalty.
//
// Rugby has strong positional specialism: only a trained prop/hooker can play
// front row; locks, half-backs, centres and the back three each cluster into
// adjacency groups with varying interchangeability; the back row is inherently
// flexible; utility backs cover much of the backline. We model this as an
// effective-stat multiplier applied to a player's *per-match* baseStats clone
// when they fill a slot that isn't their natural position.
//
// Pure + RNG-free. The penalty is consumed in two places only:
//   - MatchCoordinator.initPlayer (starters, at match build)
//   - applyMatchEvent SUBSTITUTION_APPLIED (the incoming sub)
// Everything else flows automatically because the whole engine reads
// `currentStats`, which StaminaSystem re-derives from the (now-penalised)
// match-clone baseStats every tick.

import type { Position } from '../../types/player';

// The starting-XV target role per jersey slot. Matches the SLOT_SPECS primary
// convention in src/game/autoSelect.ts. Bench slots 16-23 map to their nominal
// role so slotFamiliarity stays defined for the rare defensive lookup.
export const SLOT_POSITION: Record<number, Position> = {
  1: 'Prop',       2: 'Hooker',     3: 'Prop',
  4: 'Lock',       5: 'Lock',
  6: 'Flanker',    7: 'Flanker',    8: 'Number 8',
  9: 'Scrum-Half', 10: 'Fly-Half',
  11: 'Wing',      12: 'Centre',    13: 'Centre',    14: 'Wing',
  15: 'Fullback',
  16: 'Hooker',    17: 'Prop',      18: 'Prop',      19: 'Lock',
  20: 'Flanker',   21: 'Scrum-Half', 22: 'Fly-Half', 23: 'Wing',
};

// Effective-stat multiplier for a player of a given natural position asked to
// play a given target slot position. A self-match is implicitly 1.0; any pair
// not listed below is "makeshift" (MAKESHIFT_MULT) — e.g. a forward in a back
// slot, a prop on the wing.
//
// Tier guide: easy/same-group ~0.96, moderate adjacent ~0.90, distant ~0.84,
// makeshift ~0.72. Front row is near-immovable (a non-specialist there is a
// liability) — only Prop<->Hooker gets a (still heavy) listed value.
export const MAKESHIFT_MULT = 0.72;

export const POSITION_FAMILIARITY: Record<Position, Partial<Record<Position, number>>> = {
  // Front row — maximal specialism. Prop<->Hooker is heavy; everything else makeshift.
  'Prop':       { 'Hooker': 0.78 },
  'Hooker':     { 'Prop': 0.78 },

  // Locks — can cover blindside / №8 at a cost.
  'Lock':       { 'Flanker': 0.88, 'Number 8': 0.88 },

  // Back row — inherently interchangeable across 6/7/8; lock cover is a stretch.
  // 'Back Row' is the versatile loose-forward label: natural anywhere in 6/7/8.
  'Flanker':    { 'Number 8': 0.96, 'Lock': 0.86 },
  'Number 8':   { 'Flanker': 0.96, 'Lock': 0.86 },
  'Back Row':   { 'Flanker': 1.0, 'Number 8': 1.0, 'Lock': 0.86 },

  // Half-backs — distinct, some cross-cover.
  'Scrum-Half': { 'Fly-Half': 0.88 },
  'Fly-Half':   { 'Centre': 0.90, 'Scrum-Half': 0.85, 'Fullback': 0.84 },

  // Centres — interchangeable with each other; cover 10 / wing at a cost.
  'Centre':     { 'Wing': 0.92, 'Fly-Half': 0.88, 'Fullback': 0.88 },

  // Back three — share an athletic profile; cover each other cheaply.
  'Wing':       { 'Fullback': 0.93, 'Centre': 0.90 },
  'Fullback':   { 'Wing': 0.93, 'Centre': 0.86 },

  // Utility back — versatile across the backline by design: natural at 10/12/13/11/14/15,
  // only the specialist scrum-half role carries a penalty.
  'Utility Back': { 'Fly-Half': 1.0, 'Centre': 1.0, 'Wing': 1.0, 'Fullback': 1.0, 'Scrum-Half': 0.90 },
};

// Multiplier for a player of `natural` position playing `target` position.
export function positionFamiliarity(natural: Position, target: Position): number {
  if (natural === target) return 1.0;
  return POSITION_FAMILIARITY[natural]?.[target] ?? MAKESHIFT_MULT;
}

// Convenience: multiplier for a natural position filling a jersey slot.
export function slotFamiliarity(natural: Position, slotId: number): number {
  return positionFamiliarity(natural, SLOT_POSITION[slotId] ?? natural);
}

// True when filling the given slot actually costs the player effectiveness —
// drives the amber out-of-position warning in the squad screens. Tied to the
// penalty itself, so a versatile player (Back Row at flanker, Utility Back at
// fullback) filling a cluster role is NOT flagged.
export function isOutOfPosition(natural: Position, slotId: number): boolean {
  return slotFamiliarity(natural, slotId) < 1.0;
}
