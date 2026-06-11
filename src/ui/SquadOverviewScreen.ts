// Squad Overview — read-only depth chart used in two places: the
// Squad Builder pre-season chain (between the 2025-26 transfer unwind
// and the signing window) and the end-of-season chain (between
// Renewals closing and the signings window opening). Either way, the
// goal is for the user to see which positions are thin before they
// start spending cap.
//
// For each of the 9 user-facing position groups the section renders
// every player in that group, top-OVR first (name + age + colour-banded
// OVR badge). Sections with fewer players than the depth target
// (POSITION_GROUP_DEPTH_TARGET) are padded with "No depth" placeholder
// rows up to the target and flagged "thin" with an amber accent.
// Sections at or above the depth target render all their players with
// no placeholders — every row you see corresponds to a real player
// counted in the section header.
//
// Module-level setter pattern (matches RolloverScreen / RenewalsScreen).
// Reads state on every render so resumption (close tab → Continue)
// lands on the live snapshot.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { Player } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import { getAge } from '../game/age';
import {
  POSITION_GROUPS_ORDER, POSITION_TO_GROUP, POSITION_GROUP_DEPTH_TARGET,
  type PositionGroupId,
} from '../game/positionGroups';
import { helpButtonHtml } from './help/helpButton';

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
  if (ovr >= 62) return 'ovr-poor';
  return 'ovr-veryPoor';
}

const STAT_COLS = [
  { key: 'stamina',     lbl: 'STM' }, { key: 'strength',    lbl: 'STR' },
  { key: 'pace',        lbl: 'PAC' }, { key: 'agility',     lbl: 'AGI' },
  { key: 'handling',    lbl: 'HND' }, { key: 'tackling',    lbl: 'TKL' },
  { key: 'breakdown',   lbl: 'BRK' }, { key: 'kicking',     lbl: 'KCK' },
  { key: 'setPiece',    lbl: 'SET' }, { key: 'discipline',  lbl: 'DIS' },
  { key: 'positioning', lbl: 'POS' }, { key: 'composure',   lbl: 'CMP' },
];

export function initSquadOverviewScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('squad-overview');
  if (!el) return;
  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  const expandedRows = new Set<string>();

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
        // Depth target = 2 × starting-XV slots that pull from this
        // group (per POSITION_GROUP_DEPTH_TARGET). Section is "thin"
        // when the squad has fewer players than that target — i.e. the
        // bench can't be covered from senior depth alone.
        const depthTarget = POSITION_GROUP_DEPTH_TARGET[group.id];
        const thin = count < depthTarget;
        if (thin) thinCount++;

        // Render every player in the bucket (top-OVR first), then pad
        // with empty placeholders up to the depth target. When the
        // bucket exceeds the depth target the section grows; when it
        // falls short the trailing placeholder rows surface the gap.
        const slotCount = Math.max(count, depthTarget);
        const slots: (Player | null)[] = [];
        for (let i = 0; i < slotCount; i++) slots.push(bucket[i] ?? null);

        const rows = slots.map((p, i) => {
          const delay = `style="--row-delay:${i * 25}ms"`;
          if (!p) {
            return `<div class="so-row so-row--empty" ${delay}>
              <div class="so-ovr so-ovr--empty"><span class="so-ovr-val">—</span></div>
              <div class="so-row-body">
                <div class="so-row-name">No depth</div>
                <div class="so-row-meta">Sign a player to fill the slot</div>
              </div>
            </div>`;
          }
          const ovr = playerOverall(p.baseStats, p.position);
          const age = getAge(p.dob, calendarDate);
          const key = String(p.rosterId);
          const expanded = expandedRows.has(key);
          const statsGrid = `<div class="sq-stats-grid so-stats-grid">
            ${STAT_COLS.map(({ key: k, lbl }) => {
              const v = (p.baseStats as unknown as Record<string, number>)[k] ?? 0;
              return `<div class="sq-stat-cell ${ovrClass(v)}"><span class="sq-stat-lbl">${lbl}</span><span class="sq-stat-val">${v}</span></div>`;
            }).join('')}
          </div>`;
          return `<div class="so-row" ${delay}>
            <div class="so-ovr ${ovrClass(ovr)}">
              <span class="so-ovr-val">${ovr}</span>
              <span class="so-ovr-lbl">OVR</span>
            </div>
            <div class="so-row-body">
              <div class="so-row-name">${p.firstName} ${p.lastName}</div>
              <div class="so-row-meta">${p.position} · Age ${age ?? '—'}</div>
            </div>
            <button class="row-expand-chevron so-expand-btn" data-roster-id="${key}" aria-label="${expanded ? 'Hide attributes' : 'Show attributes'}" aria-expanded="${expanded}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="row-expand-panel so-expand" data-expanded="${expanded}">
              <div class="row-expand-inner"><div class="so-expand-body">${statsGrid}</div></div>
            </div>
          </div>`;
        }).join('');

        const thinHint = thin
          ? `<div class="so-thin-hint"><strong>Thin at ${group.label}</strong>Only ${count} senior ${group.label.toLowerCase()} on the books. Prioritise transfer targets.</div>`
          : '';

        return `<section class="so-section${thin ? ' so-section--thin' : ''}">
          <h3 class="so-h3">
            <span class="so-h3-label">${group.label}</span>
            <span class="so-h3-line"></span>
            <span class="so-h3-count">
              <span class="so-h3-count-val">${count}</span>
              <span class="so-h3-count-lbl">Total in squad</span>
            </span>
          </h3>
          <div class="so-rows">${rows}</div>
          ${thinHint}
        </section>`;
      }).join('');

    const eyebrow = thinCount > 0
      ? `${team.name} · ${state.calendar.seasonLabel} · ${thinCount} ${thinCount === 1 ? 'position' : 'positions'} thin`
      : `${team.name} · ${state.calendar.seasonLabel}`;

    const savedScroll = el!.querySelector<HTMLElement>('#so-scroll')?.scrollTop ?? 0;

    el!.style.setProperty('--team-color', team.color);
    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Squad Overview</span>
          <div class="app-topbar-spacer">${helpButtonHtml('squad-overview')}</div>
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

    if (savedScroll > 0) {
      const scrollEl = el!.querySelector<HTMLElement>('#so-scroll');
      if (scrollEl) scrollEl.scrollTop = savedScroll;
    }

    el!.querySelector<HTMLButtonElement>('#so-continue')!.addEventListener('click', () => activeOnContinue());

    el!.querySelectorAll<HTMLButtonElement>('.so-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.rosterId!;
        if (expandedRows.has(key)) expandedRows.delete(key);
        else expandedRows.add(key);
        render();
      });
    });
  }

  renderImpl = render;
}
