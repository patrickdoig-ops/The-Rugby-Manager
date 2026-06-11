// Per-period training loop, shared by the non-break path
// (GameCoordinator.applyTrainingBlock) and the international-break path
// (InternationalBreakCoordinator.runInternationalBreakBlock). Extracted verbatim
// from GameCoordinator as a free function parameterised by GameState. It mutates
// state through applySeasonEvent (the mutation seam is preserved, not bypassed).
//
// Determinism note: computeTrainingWeek draws on the career stream (rngTransfer);
// callers must invoke runTrainingPeriods in the same order they did when it
// lived on GameCoordinator, or the season-determinism hash shifts.

import type { GameState } from '../types/gameState';
import type { PlayerStats } from '../types/player';
import type { TrainingPlan, PlayerTrainingResult } from '../types/training';
import { applySeasonEvent } from './applySeasonEvent';
import { computeTrainingWeek } from './trainingWeek';

// Each period emits one PLAYER_TRAINING_PLAN_SET then one PLAYER_TRAINED per
// non-injured, non-international player league-wide plus optional PLAYER_INJURED;
// AI clubs get their plan from aiTrainingDirector, re-picked per period. Returns
// the per-player results merged across the block for PostTrainingResultsScreen.
export function runTrainingPeriods(state: GameState, weeks: TrainingPlan[], spans: number[]): Map<number, PlayerTrainingResult> {
  const n = Math.max(1, weeks.length);
  // Per-player accumulator merged across periods. conditionBefore is
  // captured the first period a player trains; conditionAfter tracks the
  // latest; statDeltas sum; newlyInjured latches on any period.
  const acc = new Map<number, PlayerTrainingResult>();

  for (let i = 0; i < n; i++) {
    const plan = weeks[i] ?? weeks[weeks.length - 1];
    const events = computeTrainingWeek(state, plan, spans[i]);

    // Snapshot the to-be-changed stats per trained player before applying.
    const beforeSnap = new Map<number, { condition: number; stats: Partial<PlayerStats> }>();
    for (const ev of events) {
      if (ev.type !== 'PLAYER_TRAINED') continue;
      const p = state.career.roster[ev.rosterId];
      if (!p) continue;
      const stats: Partial<PlayerStats> = {};
      for (const k of Object.keys(ev.statDeltas) as (keyof PlayerStats)[]) {
        stats[k] = p.baseStats[k];
      }
      beforeSnap.set(ev.rosterId, { condition: p.condition ?? 100, stats });
    }

    const injuredThisPeriod = new Set<number>();
    for (const ev of events) {
      if (ev.type === 'PLAYER_INJURED') injuredThisPeriod.add(ev.rosterId);
    }

    for (const ev of events) applySeasonEvent(state, ev);

    for (const ev of events) {
      if (ev.type !== 'PLAYER_TRAINED') continue;
      const p = state.career.roster[ev.rosterId];
      const snap = beforeSnap.get(ev.rosterId);
      if (!p || !snap) continue;
      const existing = acc.get(ev.rosterId);
      const entry = existing ?? {
        rosterId: ev.rosterId,
        conditionBefore: snap.condition,
        conditionAfter: p.condition ?? 100,
        statDeltas: {},
        newlyInjured: false,
      };
      // Real (post-clamp) gains for this period, summed into the block total.
      for (const k of Object.keys(snap.stats) as (keyof PlayerStats)[]) {
        const gain = (p.baseStats[k] ?? 0) - (snap.stats[k] ?? 0);
        if (gain > 0) entry.statDeltas[k] = (entry.statDeltas[k] ?? 0) + gain;
      }
      entry.conditionAfter = p.condition ?? 100;
      if (injuredThisPeriod.has(ev.rosterId)) entry.newlyInjured = true;
      acc.set(ev.rosterId, entry);
    }
  }
  return acc;
}
