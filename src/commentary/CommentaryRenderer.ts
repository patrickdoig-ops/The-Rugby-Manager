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
  return p ? `${p.lastName} (#${p.squadNumber})` : fallback;
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

function renderStep(step: NarrationStep, event: RenderableEvent, used: Set<string>): string | null {
  if (step.kind === 'phase_outcome') {
    const phaseBank = PHASE_BANKS[step.phase];
    const lines = phaseBank?.[step.key] ?? FALLBACK_GENERIC;
    // Pick-without-replacement within a single event: avoids the
    // verbatim duplicate when a chain step (e.g. offload_attempt) fires
    // twice and pickRandom rolls the same template both times. Falls
    // back to the full bank only when every template has already been
    // used in this event.
    const fresh = lines.filter(l => !used.has(l));
    const pool = fresh.length > 0 ? fresh : lines;
    const picked = pickRandom(pool);
    used.add(picked);
    return interpolate(picked, event.sideName, event.defSideName, step.primary, step.secondary);
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

export function renderNarrationSteps(event: RenderableEvent): string[] {
  const parts: string[] = [];
  const used = new Set<string>();
  for (const step of event.narration.steps) {
    const s = renderStep(step, event, used);
    if (s) parts.push(s);
  }
  return parts;
}
