import type { AttackingStyle } from '../../types/team';

// PhasePlay hard-carry path: weighted pick over available forwards.
// Back row + props dominate; locks second; hooker rare.
export const HARD_CARRIER_WEIGHTS: Readonly<Partial<Record<number, number>>> = {
  1: 12, 3: 12,            // props
  2: 4,                    // hooker
  4: 8, 5: 8,              // locks
  6: 18, 7: 18, 8: 15,     // back row
};

// KickReturn pod-pickup pool: the catcher pops to a back-row pod runner who
// hits up to set the next platform. Back row do most of the work; locks
// occasionally arrive. Props + hooker NOT in the pool — they're trailing.
export const POD_PICKUP_WEIGHTS: Readonly<Partial<Record<number, number>>> = {
  4: 6, 5: 6,              // locks (light)
  6: 18, 7: 18, 8: 15,     // back row (heavy)
};

// Probability that a kick-return catcher pops to a pod runner instead of
// carrying themselves. Tight teams build platforms; expansive teams let
// the backs run.
export const POD_PICKUP_PCT: Readonly<Record<AttackingStyle, number>> = {
  keep_it_tight: 50,
  balanced: 30,
  wide_wide: 15,
};

// Pick-and-go carrier pool: forward picks the ball at the base of a ruck
// and drives. Back row + props only — hooker is at the ruck, locks usually
// bind / cleanout. Weights mirror the hard-carry table's back-row dominance
// but exclude locks + hooker.
export const PICK_AND_GO_WEIGHTS: Readonly<Partial<Record<number, number>>> = {
  1: 8, 3: 8,              // props
  6: 18, 7: 18, 8: 15,     // back row
};

// Probability that PhasePlay goes pick-and-go (rolled BEFORE the
// hard-carry / wide decision). Tight teams grind through phases; wide
// teams almost never pick-and-go.
export const PICK_AND_GO_PCT: Readonly<Record<AttackingStyle, number>> = {
  keep_it_tight: 30,
  balanced: 12,
  wide_wide: 3,
};
