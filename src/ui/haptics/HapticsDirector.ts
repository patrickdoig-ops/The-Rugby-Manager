// Haptics routing layer — the single subscriber that turns key match moments
// into device buzzes. Mirrors AudioDirector: reads the same signal (the
// GameEvent's `phase` and its narration step `key`s) and calls the Haptics
// engine (playHaptic). Keeping the "which moment buzzes" logic here means the
// engine stays untouched and the rest of the UI never triggers haptics directly.
//
// Scope is deliberately the big moments only — tries, cards, TMO intervention,
// goal-kick made/missed, and the half/full-time whistles — so haptics feel
// meaningful rather than noisy. At most one pattern fires per event.

import { eventBus } from '../../utils/eventBus';
import { MatchPhase } from '../../types/engine';
import type { GameEvent } from '../../types/match';
import { playHaptic } from '../HapticsManager';

function routeMatchEvent(event: GameEvent): void {
  // Phase-anchored moments take priority — a try / final whistle is the headline.
  switch (event.phase) {
    case MatchPhase.TryScored: playHaptic('try'); return;
    case MatchPhase.FullTime:  playHaptic('whistle_full'); return;
    case MatchPhase.HalfTime:  playHaptic('whistle_half'); return;
    default: break;
  }

  // Collect the outcome / announcement keys (tactic_note steps carry a `cause`,
  // not a `key`, so they're skipped) — same pass AudioDirector uses.
  const keys = new Set<string>();
  for (const s of event.narration.steps) {
    if (s.kind === 'phase_outcome' || s.kind === 'announcement') keys.add(s.key);
  }

  // Cards (direct + TMO verdict) outrank the kick/tmo-intervention buzzes.
  if (keys.has('card_yellow') || keys.has('card_red_20') || keys.has('card_red_full') ||
      keys.has('tmo_decision_yellow') || keys.has('tmo_decision_red_20')) {
    playHaptic('card');
    return;
  }

  // Goal kicks (conversions + penalty goals).
  if (keys.has('success')) { playHaptic('goal_made'); return; }
  if (keys.has('miss'))    { playHaptic('goal_miss'); return; }

  // TMO review opening — a light heads-up that a decision is coming.
  if (keys.has('tmo_intervenes')) playHaptic('tmo');
}

let inited = false;
export function initHapticsDirector(): void {
  if (inited) return;
  inited = true;

  eventBus.on('engine:event', ({ event }) => routeMatchEvent(event));
}
