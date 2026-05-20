// 22-entry detection: an entry begins when a team has possession inside the
// opposition 22 and ends only when they lose possession. Going back outside
// the 22 with the ball is NOT an exit. Idempotent — enforces the invariant
// that only the current possessor can have an active flag.

import type { MatchState } from '../types/match';
import type { PossessionSide } from '../types/engine';
import { applyMatchEvent } from './applyMatchEvent';
import { inOpposition22 } from './FieldPosition';

export function detectEntry22Changes(state: MatchState): void {
  const cur = state.possession;
  const other: PossessionSide = cur === 'home' ? 'away' : 'home';
  if (state.stats.entries22[other].active) {
    applyMatchEvent(state, { type: 'ENTRY22_CLEARED', side: other });
  }
  if (inOpposition22(state) && !state.stats.entries22[cur].active) {
    applyMatchEvent(state, { type: 'ENTRY22_REGISTERED', side: cur });
  }
}
