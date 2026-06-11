// Shared geometry helpers for mapping an authored (Phase Animator / baked Formation)
// frame onto the live pitch. Engine-side so both the engine choreography pipeline
// (FirstPhaseEvent, ScrumEvent) and the UI choreographer (pitchChoreography) can
// import it — the engine never imports UI.

// Laterally-paired jersey slots. A single reflection of the frame (exactly one of the
// long-axis flip OR the lateral mirror — i.e. flipX !== flipY) swaps which physical
// side of the field a positional ROLE occupies, so the paired jersey numbers must
// swap with it: the loosehead/tighthead props (1↔3), the blind/open-side flankers
// (6↔7), and the left/right wings (11↔14). A double reflection (both axes) is a 180°
// rotation and preserves handedness, so no swap. Slots with no lateral pair (hooker,
// locks, half-backs, centres, #8, full-back) map to themselves.
const PAIRED_SLOTS: Readonly<Record<number, number>> = {
  1: 3, 3: 1,
  6: 7, 7: 6,
  11: 14, 14: 11,
};

export const swapPairedSlot = (slot: number): number => PAIRED_SLOTS[slot] ?? slot;
