// Onboarding helper: works out whether the player can upgrade their assistant
// manager within the staff salary budget, and which free-pool candidate to
// recommend. Mirrors the budget maths in StaffScreen so the tour's advice
// matches what the screen shows. Pure read over GameState.

import type { GameState, StaffMember } from '../../types/gameState';
import { STAFF_BUDGET_FRACTION } from '../../engine/balance/staff';
import { staffBudgetUsage } from '../../game/teamStats';

export interface AssistantAdvice {
  remaining: number;             // staff-budget headroom right now
  current: StaffMember | null;   // currently hired assistant, if any
  candidate: StaffMember | null; // recommended free-pool assistant (null = none worth it)
  viable: boolean;               // a candidate exists within budget
  needRelease: boolean;          // must release the current assistant first (slot full)
}

export function assistantAdvice(state: GameState): AssistantAdvice {
  const clubId = state.player.teamId;
  const staff = state.career.staff ?? [];
  const club = state.career.clubs.find(c => c.id === clubId);
  const budget = (club?.staffBudget ?? Math.round((club?.salaryBudget ?? 0) * STAFF_BUDGET_FRACTION))
    + (club?.staffBudgetBoost ?? 0);
  const remaining = budget - staffBudgetUsage(state, clubId);

  const current = staff.find(m => m.clubId === clubId && m.role === 'assistant') ?? null;
  // Releasing the current assistant frees their wage, so the affordable ceiling
  // for a replacement is the current headroom plus that freed wage.
  const affordable = remaining + (current ? current.annualWage : 0);
  const pool = staff.filter(m => m.clubId === null && m.role === 'assistant' && m.annualWage <= affordable);
  // Only recommend a genuine upgrade on the incumbent (or any affordable hire
  // when the slot is empty).
  const options = current ? pool.filter(m => m.rating > current.rating) : pool;
  const candidate = options.length
    ? options.reduce((best, m) => (m.rating > best.rating ? m : best))
    : null;

  return {
    remaining,
    current,
    candidate,
    viable: candidate != null,
    needRelease: current != null && candidate != null,
  };
}

export function fmtStaffWage(w: number): string {
  if (w >= 1_000_000) return `£${(w / 1_000_000).toFixed(2)}m`;
  if (w < 1_000) return `£${w}`;
  return `£${Math.round(w / 1_000)}k`;
}
