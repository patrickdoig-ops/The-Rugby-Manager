// Squad Overview — one-shot screen in the Squad Builder pre-season
// chain. Sits between the 2025-26 transfer unwind and the pre-season
// signing window so the user can see which positions are now thin
// before they start spending cap. Read-only depth chart: for each of
// the 9 user-facing position groups, shows the count and the two
// highest-OVR players (name + age + colour-banded OVR badge). Sections
// with fewer than 2 players are flagged "thin" with an amber accent
// and a "No depth — sign a player" placeholder slot.
//
// Module-level setter pattern (matches RolloverScreen / RenewalsScreen).
// Reads state on every render so resumption (Squad Builder → close tab
// → Continue) lands on the live post-unwind snapshot.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { Player } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import { getAge } from '../game/age';
import {
  POSITION_GROUPS_ORDER, POSITION_TO_GROUP,
  type PositionGroupId,
} from '../game/positionGroups';

let renderImpl: (() => void) | null = null;
let activeOnContinue: () => void = () => {};

export function showSquadOverview(onContinue: () => void): void {
  activeOnContinue = onContinue;
  renderImpl?.();
}

function ovrClass(ovr: number): string {
  if (ovr >= 85) return 'ovr-elite';
  if (ovr >= 78) return 'ovr-good';
  if (ovr >= 70) return 'ovr-avg';
  return 'ovr-poor';
}

export function initSquadOverviewScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('squad-overview');
  if (!el) return;
  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = getGameEngine().getState();
    const playerTeamId = state.player.teamId;
    const club = state.career.clubs.find(c => c.id === playerTeamId);
    const team = teamsById.get(playerTeamId);
    if (!club || !team) return;

    const players: Player[] = club.squad
      .map(rid => state.career.roster[rid])
      .filter((p): p is Player => !!p);

    // Bucket players into the 9 user-facing position groups (skip 'all',
    // which is a SquadManagement filter chip only).
    const buckets = new Map<PositionGroupId, Player[]>();
    for (const p of players) {
      const gid = POSITION_TO_GROUP[p.position];
      const arr = buckets.get(gid) ?? [];
      arr.push(p);
      buckets.set(gid, arr);
    }

    const calendarDate = state.calendar.date;
    let thinCount = 0;

    const sectionsHtml = POSITION_GROUPS_ORDER
      .filter(g => g.id !== 'all')
      .map(group => {
        const bucket = (buckets.get(group.id) ?? [])
          .slice()
          .sort((a, b) =>
            playerOverall(b.baseStats, b.position) - playerOverall(a.baseStats, a.position),
          );
        const count = bucket.length;
        const thin = count < 2;
        if (thin) thinCount++;

        const slots: (Player | null)[] = [bucket[0] ?? null, bucket[1] ?? null];
        const rows = slots.map(p => {
          if (!p) {
            return `<div class="so-row so-row--empty">
              <div class="so-ovr so-ovr--empty"><span class="so-ovr-val">—</span></div>
              <div class="so-row-body">
                <div class="so-row-name">No depth</div>
                <div class="so-row-meta">Sign a player to fill the slot</div>
              </div>
            </div>`;
          }
          const ovr = playerOverall(p.baseStats, p.position);
          const age = getAge(p.dob, calendarDate);
          return `<div class="so-row">
            <div class="so-ovr ${ovrClass(ovr)}">
              <span class="so-ovr-val">${ovr}</span>
              <span class="so-ovr-lbl">OVR</span>
            </div>
            <div class="so-row-body">
              <div class="so-row-name">${p.firstName} ${p.lastName}</div>
              <div class="so-row-meta">${p.position} · Age ${age ?? '—'}</div>
            </div>
          </div>`;
        }).join('');

        return `<section class="so-section${thin ? ' so-section--thin' : ''}">
          <h3 class="so-h3">
            <span class="so-h3-label">${group.label}</span>
            <span class="so-h3-line"></span>
            <span class="so-h3-count">${count}${thin ? ' · thin' : ''}</span>
          </h3>
          <div class="so-rows">${rows}</div>
        </section>`;
      }).join('');

    const eyebrow = thinCount > 0
      ? `${team.name} · ${state.calendar.seasonLabel} · ${thinCount} ${thinCount === 1 ? 'position' : 'positions'} thin`
      : `${team.name} · ${state.calendar.seasonLabel}`;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Squad Overview</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${eyebrow}</div>
      </div>

      <div id="so-scroll">
        ${sectionsHtml}
      </div>

      <div id="so-footer">
        <button id="so-continue" class="cta-pulse">
          <span>Move to Transfer Market</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#so-continue')!.addEventListener('click', () => activeOnContinue());
  }

  renderImpl = render;
}
