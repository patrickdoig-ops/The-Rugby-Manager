// Staff & scouting collaborator — owns hire/release of staff and the
// scout-assignment + weekly accuracy-advance lifecycle for the managed club.
// Holds the same GameState reference GameCoordinator holds, so mutations are
// visible across both, and writes go through applySeasonEvent (the mutation
// seam is preserved). GameCoordinator keeps thin delegating methods so screens
// that read `getGameEngine: () => GameCoordinator` keep working unchanged.
//
// RNG-free: none of these methods draw on any rng stream.

import type { GameState } from '../types/gameState';
import { applySeasonEvent } from './applySeasonEvent';
import { staffBudgetUsage } from './teamStats';
import { scoutWeeklyGain } from './scouting';
import { STAFF_CAPS, STAFF_BUDGET_FRACTION } from '../engine/balance';

export class StaffCoordinator {
  constructor(private state: GameState) {}

  hireStaff(staffId: string): void {
    const staff = this.state.career.staff ?? [];
    const m = staff.find(s => s.id === staffId);
    if (!m || m.clubId !== null) return;
    const cap = m.role === 'scout' ? STAFF_CAPS.scouts : 1;
    if (staff.filter(s => s.role === m.role && s.clubId !== null).length >= cap) return;
    const club = this.state.career.clubs.find(c => c.id === this.state.player.teamId);
    const staffBudget = club?.staffBudget ?? Math.round((club?.salaryBudget ?? 0) * STAFF_BUDGET_FRACTION);
    if (staffBudgetUsage(this.state, this.state.player.teamId) + m.annualWage > staffBudget) return;
    applySeasonEvent(this.state, {
      type: 'STAFF_HIRED',
      staffId,
      annualWage: m.annualWage,
      clubId: this.state.player.teamId,
    });
  }

  releaseStaff(staffId: string): void {
    const m = (this.state.career.staff ?? []).find(s => s.id === staffId);
    if (!m || m.clubId !== this.state.player.teamId) return;
    // Unassign any targets this scout was tracking before releasing.
    for (const [rIdStr, rec] of Object.entries(this.state.player.scouting ?? {})) {
      if (rec.assignedScoutId === staffId) {
        applySeasonEvent(this.state, { type: 'PLAYER_SCOUT_UNASSIGNED', rosterId: Number(rIdStr) });
      }
    }
    applySeasonEvent(this.state, { type: 'STAFF_RELEASED', staffId });
  }

  assignScout(rosterId: number, scoutId: string): void {
    const staff = this.state.career.staff ?? [];
    const scout = staff.find(s => s.id === scoutId);
    if (!scout || scout.role !== 'scout' || scout.clubId !== this.state.player.teamId) return;
    // Unassign this scout from any current target first.
    for (const [rIdStr, rec] of Object.entries(this.state.player.scouting ?? {})) {
      if (rec.assignedScoutId === scoutId) {
        applySeasonEvent(this.state, { type: 'PLAYER_SCOUT_UNASSIGNED', rosterId: Number(rIdStr) });
      }
    }
    applySeasonEvent(this.state, { type: 'PLAYER_SCOUT_ASSIGNED', rosterId, scoutId });
  }

  unassignScout(rosterId: number): void {
    applySeasonEvent(this.state, { type: 'PLAYER_SCOUT_UNASSIGNED', rosterId });
  }

  removeScouting(rosterId: number): void {
    applySeasonEvent(this.state, { type: 'PLAYER_SCOUTING_REMOVED', rosterId });
  }

  // Weekly scouting accuracy advance, called from the match-result tick once
  // per WEEK_ADVANCED. Each assigned scout nudges its target's accuracy by
  // scoutWeeklyGain(rating). RNG-free; walks scouting entries in object order.
  advanceScoutingAccuracy(): void {
    const scouting = this.state.player.scouting;
    if (!scouting) return;
    const staff = this.state.career.staff ?? [];
    for (const [rIdStr, rec] of Object.entries(scouting)) {
      if (!rec.assignedScoutId) continue;
      if (!this.state.career.roster[Number(rIdStr)]) continue;
      const scout = staff.find(m => m.id === rec.assignedScoutId && m.clubId === this.state.player.teamId);
      if (!scout) continue;
      applySeasonEvent(this.state, {
        type: 'SCOUTING_ACCURACY_ADVANCED',
        rosterId: Number(rIdStr),
        delta: scoutWeeklyGain(scout.rating),
      });
    }
  }
}
