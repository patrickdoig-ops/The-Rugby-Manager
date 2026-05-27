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
