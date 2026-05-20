import type { Player } from '../types/player';
import type { NarrationDescriptor, NarrationStep } from '../types/narration';
import { pickRandom, commentaryChance } from '../utils/rng';
import { PHASE_BANKS, FALLBACK_GENERIC } from './banks/en-GB/phases';
import { getTacticNoteLines } from './banks/en-GB/tacticNotes';
import { getAnnouncementTemplate } from './banks/en-GB/announcements';

// What the renderer needs from an event. GameEvent satisfies this naturally.
export interface RenderableEvent {
  sideName: string;
  defSideName?: string;
  narration: NarrationDescriptor;
}

function playerLabel(p: Player | undefined, fallback: string): string {
  if (!p) return fallback;
  const surname = p.lastName ?? p.name?.split(' ').pop() ?? '';
  return `${surname} (#${p.squadNumber})`;
}

function interpolate(
  template: string,
  sideName: string,
  defSideName: string | undefined,
  primary: Player | undefined,
  secondary: Player | undefined,
): string {
  return template
    .replace(/{primary}/g,   playerLabel(primary,   'the player'))
    .replace(/{secondary}/g, playerLabel(secondary, 'the defender'))
    .replace(/{side}/g,      sideName)
    .replace(/{defside}/g,   defSideName ?? 'the opposition');
}

function renderStep(step: NarrationStep, event: RenderableEvent): string | null {
  if (step.kind === 'phase_outcome') {
    const phaseBank = PHASE_BANKS[step.phase];
    const lines = phaseBank?.[step.key] ?? FALLBACK_GENERIC;
    return interpolate(pickRandom(lines), event.sideName, event.defSideName, step.primary, step.secondary);
  }
  if (step.kind === 'tactic_note') {
    if (!commentaryChance(step.chancePct)) return null;
    const lines = getTacticNoteLines(step.cause, step.params);
    if (lines.length === 0) return null;
    return pickRandom(lines);
  }
  // announcement
  const tpl = getAnnouncementTemplate(step.key, step.params);
  if (!tpl) return null;
  return interpolate(tpl, event.sideName, event.defSideName, step.primary, step.secondary);
}

export function renderNarration(event: RenderableEvent): string {
  const parts: string[] = [];
  for (const step of event.narration.steps) {
    const s = renderStep(step, event);
    if (s) parts.push(s);
  }
  return parts.join(' ');
}
