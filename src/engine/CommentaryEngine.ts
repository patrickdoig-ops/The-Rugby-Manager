import type { GameEvent } from '../types/match';
import type { PhaseOutcomeKey } from '../types/narration';
import { pickRandom } from '../utils/rng';
import { PHASE_BANKS, FALLBACK_GENERIC } from '../commentary/banks/en-GB/phases';

// Legacy shim retained for inline sites in MatchCoordinator and PenaltyHandler
// that still build GameEvent literals directly and want a one-shot rendered
// string for a single phase/key. These callers will migrate to renderNarration
// in the next commit, at which point this module is deleted.

function playerLabel(p: { name: string; squadNumber: number } | undefined, fallback: string): string {
  return p ? `${p.name.split(' ').pop()} (#${p.squadNumber})` : fallback;
}

function interpolate(template: string, event: GameEvent): string {
  return template
    .replace(/{primary}/g,   playerLabel(event.primaryPlayer,   'the player'))
    .replace(/{secondary}/g, playerLabel(event.secondaryPlayer, 'the defender'))
    .replace(/{side}/g,      event.sideName)
    .replace(/{defside}/g,   event.defSideName ?? 'the opposition');
}

export function getCommentary(event: GameEvent, key: string): string {
  const phaseBank = PHASE_BANKS[event.phase];
  const lines = phaseBank?.[key as PhaseOutcomeKey] ?? FALLBACK_GENERIC;
  return interpolate(pickRandom(lines), event);
}
