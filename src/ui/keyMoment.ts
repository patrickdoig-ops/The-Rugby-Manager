import type { GameEvent } from '../types/match';
import { MatchPhase } from '../types/engine';

// Phases that always count as a key moment regardless of narration content.
const KEY_PHASES = new Set<MatchPhase>([MatchPhase.TryScored, MatchPhase.FullTime]);

// Card + TMO announcement keys that trigger auto-pause AND hero treatment.
// `card_ref_summons` joins the set so the direct-card two-step event still
// counts as a hero moment if a future renderer ever evaluates only the first
// step (today the second step keeps the event flagged regardless).
const KEY_ANNOUNCEMENT_KEYS = new Set<string>([
  'card_ref_summons',
  'card_yellow', 'card_red_20', 'card_red_full',
  'tmo_intervenes',
]);

// Hero-only — the carry-phase try outcomes. Detected on `phase_outcome` steps.
// We don't add these to KEY_ANNOUNCEMENT_KEYS because auto-pause must fire
// exactly once per try (on the TryScored event), not also on the carry phase.
const HERO_PHASE_OUTCOME_KEYS = new Set<string>([
  'line_break_try', 'dominant_carry_try', 'maul_try',
]);

export function isAutoPauseEvent(event: GameEvent): boolean {
  if (KEY_PHASES.has(event.phase)) return true;
  for (const step of event.narration.steps) {
    if (step.kind === 'announcement' && KEY_ANNOUNCEMENT_KEYS.has(step.key)) return true;
  }
  return false;
}

export function isHeroEvent(event: GameEvent): boolean {
  if (isAutoPauseEvent(event)) return true;
  for (const step of event.narration.steps) {
    if (step.kind === 'phase_outcome' && HERO_PHASE_OUTCOME_KEYS.has(step.key)) return true;
  }
  return false;
}
