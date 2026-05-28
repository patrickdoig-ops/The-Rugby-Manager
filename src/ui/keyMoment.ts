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

// Hero-only — the carry-phase try outcomes plus goal-kick outcomes. Detected
// on `phase_outcome` steps. We don't add these to KEY_ANNOUNCEMENT_KEYS
// because auto-pause should fire exactly once per try (on TryScored) and
// not at all on conversions / penalty goal kicks (which the user is already
// watching unfold). `success` / `miss` are emitted by ConversionKickEvent;
// `kick_for_goal` / `miss` by the PenaltyHandler goal-kick branch.
const HERO_PHASE_OUTCOME_KEYS = new Set<string>([
  'line_break_try', 'dominant_carry_try', 'maul_try',
  'success', 'miss', 'kick_for_goal',
]);

// Announcement keys that warrant hero treatment without triggering auto-pause.
// The TMO verdict announcements land mid-review, after the user has already
// been auto-paused once on `tmo_intervenes`; re-pausing on the verdict would
// double-stop a single moment. Hero styling still applies so the verdict line
// reads as the dramatic resolution.
const HERO_ANNOUNCEMENT_KEYS = new Set<string>([
  'tmo_decision_yellow', 'tmo_decision_red_20', 'tmo_decision_no_card',
  // KickAtGoal micro-phase: the entry tick is a single kicker_steps_up step,
  // and the resolve tick is split into a single kicker_compose beat then a
  // single success/miss beat — each a one-step event, so neither qualifies via
  // "2+ steps". Both announcement keys gate hero on their own here (the result
  // beat is hero via HERO_PHASE_OUTCOME_KEYS) so the whole goal-kick glows.
  'kicker_steps_up', 'kicker_compose',
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
    if (step.kind === 'announcement'   && HERO_ANNOUNCEMENT_KEYS.has(step.key))   return true;
  }
  return false;
}
