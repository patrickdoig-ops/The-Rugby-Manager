// Injury builders shared by the match-result tick, the playoff tick, and the
// international-break cup sims. Pure "read state → return SeasonEvent[]"
// functions (the caller applies them through applySeasonEvent), parameterised
// by GameState so multiple season sub-coordinators can reuse them without a
// shared `this`. Extracted verbatim from GameCoordinator — behaviour-preserving.
//
// Determinism note: rollNewInjuryEvents draws on the career stream (rngTransfer)
// in rosterId-ascending order. Callers must invoke these in the same order they
// did when these lived on GameCoordinator, or the season-determinism hash shifts.

import type { GameState, SeasonEvent } from '../types/gameState';
import type { InjurySeverity } from '../types/player';
import type { PlayerStatsSnapshot } from './seasonStatsCollector';
import { rngTransfer } from '../utils/rng';
import { INJURY_SEVERITY } from '../engine/balance';

// Roll severity + weeks for every in-match injury surfaced in the given
// snapshots. Uses rngTransfer (career stream) so the rolls are independent
// of the match outcome stream. Walks rosterId-ascending so the call order
// is stable across runs.
//
// Recurrence detection is deferred to a future iteration — v1 always
// emits isRecurrence: false. The tuning constants
// (INJURY_RECURRENCE_TIME_LOSS_MULT, etc.) are kept as scaffolding.
export function rollNewInjuryEvents(state: GameState, snapshots: PlayerStatsSnapshot[]): SeasonEvent[] {
  const injured = snapshots
    .filter(s => s.injuryKind !== undefined)
    .sort((a, b) => a.rosterId - b.rosterId);
  const out: SeasonEvent[] = [];
  const injuredOn = state.calendar.date;
  for (const s of injured) {
    const kind = s.injuryKind!;
    const profile = INJURY_SEVERITY[kind];
    const severity = pickSeverity(profile.weights);
    const [lo, hi] = profile.bands[severity];
    const weeksRemaining = rngTransfer(lo, hi);
    out.push({
      type: 'PLAYER_INJURED',
      rosterId: s.rosterId,
      kind,
      severity,
      weeksRemaining,
      injuredOn,
      isRecurrence: false,
    });
  }
  return out;
}

// Decrement every roster player's `injury.weeksRemaining` by one; fire
// PLAYER_RECOVERED for any whose counter would reach zero. No RNG —
// pure walk in rosterId order.
// gapStartIso, when supplied, scopes the tick to injuries sustained at or
// before the start of the rest gap (the previous match). Injuries sustained
// *during* the gap — training injuries and international-duty injuries, both
// dated at the upcoming round — are skipped so a long gap (e.g. the ~5-week
// Autumn / ~8-week Six Nations break) doesn't retroactively heal an injury
// that only just happened.
export function tickInjuryEvents(state: GameState, gapStartIso?: string): SeasonEvent[] {
  const out: SeasonEvent[] = [];
  const rosterIds = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of rosterIds) {
    const p = state.career.roster[rid];
    if (!p.injury) continue;
    if (gapStartIso && p.injury.injuredOn > gapStartIso) continue;
    if (p.injury.weeksRemaining <= 1) {
      // Decrement to 0 then clear the field. INJURY_TICK_ADVANCED runs
      // first so the per-event trace shows the decrement step.
      if (p.injury.weeksRemaining === 1) {
        out.push({ type: 'INJURY_TICK_ADVANCED', rosterId: rid });
      }
      out.push({ type: 'PLAYER_RECOVERED', rosterId: rid });
    } else {
      out.push({ type: 'INJURY_TICK_ADVANCED', rosterId: rid });
    }
  }
  return out;
}

// Picks a severity bucket from a per-kind weight table. Uses rngTransfer
// (career stream). Weights sum to 100 by convention; the picker reads
// them in mild → moderate → severe order.
function pickSeverity(weights: Record<InjurySeverity, number>): InjurySeverity {
  const roll = rngTransfer(1, 100);
  let cum = 0;
  cum += weights.mild;
  if (roll <= cum) return 'mild';
  cum += weights.moderate;
  if (roll <= cum) return 'moderate';
  return 'severe';
}
