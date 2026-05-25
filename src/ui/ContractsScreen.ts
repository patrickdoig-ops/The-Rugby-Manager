// Contracts list for the player's club. Reached from the Hub's Contracts
// tile; back navigates to Hub.
//
// **Layout:**
// Two-line player cards instead of a table — full name + wage on the top
// line, position · age · tags + expiry on the second. OVR badge anchors
// the left side (38×38 tiered colour); marquee toggle star sits on the
// right. Above the list: a dedicated salary-cap section with a 6px fill
// bar (ok / tight / over), a marker line at the effective ceiling, and a
// meta row naming the marquee-excluded player. Sort lives in a chip-tray
// drop-down behind a Sort button in the topbar.
//
// **Phase 3 interactivity:**
// - Cap fill colour: green when under SENIOR_CAP, amber within 5%, red
//   when over. Cap = Σ non-marquee wages.
// - Marquee star is tap-to-toggle: tapping a non-marquee player makes
//   them the new marquee (silently replacing the existing one);
//   tapping the current marquee clears the slot. Goes through
//   GameCoordinator.designateMarquee → MARQUEE_DESIGNATED event.
//
// Initialised once per page lifetime alongside the other in-season
// screens. Re-reads gameEngine.getState() on every render so the data
// reflects the current roster (including renewals / signings landing in
// Phases 4+).

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { Player } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import { getAge } from '../game/age';

type SortKey = 'wage' | 'expiry' | 'ovr' | 'position' | 'age' | 'name';
type SortDir = 'asc' | 'desc';

const SORT_LABELS: Record<SortKey, string> = {
  wage:     'Wage',
  expiry:   'Expiry',
  ovr:      'OVR',
  position: 'Position',
  age:      'Age',
  name:     'Name',
};

type Mode = 'hub' | 'marquee-edit';

let sortKey: SortKey = 'wage';
let sortDir: SortDir = 'desc';
let sortPanelOpen = false;
let mode: Mode = 'hub';
let marqueeEditOnContinue: () => void = () => {};
let renderImpl: (() => void) | null = null;

function fmtWage(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n}`;
}

function fmtExpiry(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
}

function expiresThisSeason(expiresOn: string, calendarDate: string): boolean {
  if (!expiresOn) return false;
  const exp = new Date(expiresOn);
  const today = new Date(calendarDate);
  const monthsAhead = (exp.getUTCFullYear() - today.getUTCFullYear()) * 12
                    + (exp.getUTCMonth() - today.getUTCMonth());
  return monthsAhead >= 0 && monthsAhead <= 10;
}

function ovrClass(ovr: number): string {
  if (ovr >= 85) return 'ovr-elite';
  if (ovr >= 78) return 'ovr-good';
  if (ovr >= 70) return 'ovr-avg';
  return 'ovr-poor';
}

function fmtInjury(kind: string): string {
  return kind.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const STAR_FILLED = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.637 1.55.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.755-.415-2.211.749-2.305l5.404-.434 2.082-5.005z"/></svg>`;
const STAR_OUTLINE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>`;
const SORT_ICON  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M6 12h12M9 18h6"/></svg>`;

export function initContractsScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
): void {
  const el = document.getElementById('contracts');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const gameEngine = getGameEngine();
    const state = gameEngine.getState();
    const playerTeamId = state.player.teamId;
    const club = state.career.clubs.find(c => c.id === playerTeamId);
    const team = teamsById.get(playerTeamId);
    if (!club || !team) {
      el!.innerHTML = '<div style="padding:20px;color:var(--rm-text-dim)">No club data.</div>';
      return;
    }

    const calendarDate = state.calendar.date;
    const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
    const players: Player[] = club.squad.map(rid => state.career.roster[rid]).filter((p): p is Player => !!p);
    const sorted = sortPlayers(players, calendarDate);

    const nonMarquee = players.filter(p => !p.contract.isMarquee);
    const marqueePlayer = players.find(p => p.contract.isMarquee);
    const capUsed = nonMarquee.reduce((sum, p) => sum + p.contract.annualWage, 0);
    // Cap pill renders against the owner's salaryBudget (post-Phase-9),
    // not the league's effective cap. The league cap still exists as a
    // harder ceiling but the budget bites first.
    const budgetCap = club.salaryBudget;
    const capStatus =
      capUsed > budgetCap ? 'over' :
      capUsed > budgetCap * 0.95 ? 'tight' :
      'ok';
    const capPct = Math.min((capUsed / budgetCap) * 100, 100);
    const headroom = budgetCap - capUsed;

    const marqueeLabel = marqueePlayer
      ? { text: `${marqueePlayer.lastName} excluded (${fmtWage(marqueePlayer.contract.annualWage)})`, colour: 'var(--rm-pitch)' }
      : { text: 'No marquee designated', colour: 'var(--rm-text-faint)' };

    const headroomLabel = headroom >= 0
      ? `${fmtWage(headroom)} headroom`
      : `${fmtWage(-headroom)} over`;

    const rows = sorted.map(p => {
      const overall = playerOverall(p.baseStats, p.position);
      const age = getAge(p.dob, calendarDate);
      const expiring = expiresThisSeason(p.contract.expiresOn, calendarDate);

      const classes = ['ct-player'];
      if (p.contract.isMarquee) classes.push('ct-player--marquee');
      if (expiring) classes.push('ct-player--expiring');
      if (p.injury) classes.push('ct-player--injured');

      const tagParts: string[] = [];
      if (p.contract.isMarquee) tagParts.push('<span class="ct-tag ct-tag--marquee">Marquee</span>');
      if (expiring) tagParts.push('<span class="ct-tag ct-tag--expires">Expiring</span>');
      if (p.injury) tagParts.push(`<span class="ct-tag ct-tag--injury" title="${fmtInjury(p.injury.kind)} · ${p.injury.weeksRemaining}w remaining">${fmtInjury(p.injury.kind)} · ${p.injury.weeksRemaining}w</span>`);

      const star = p.contract.isMarquee ? STAR_FILLED : STAR_OUTLINE;
      // Marquee toggle is interactive only in the off-season-only
      // 'marquee-edit' mode. In the in-season 'hub' view the marquee
      // is fixed — render a non-interactive slot that still shows the
      // filled star next to the marquee player so the visual marker
      // stays consistent with the marquee tag inline above.
      const marqueeEl = mode === 'marquee-edit'
        ? `<button class="ct-star-btn${p.contract.isMarquee ? ' is-marquee' : ''}" data-marquee-toggle="${p.rosterId}" aria-label="${p.contract.isMarquee ? 'Clear marquee' : 'Designate marquee'}">${star}</button>`
        : `<span class="ct-marquee-slot${p.contract.isMarquee ? ' is-marquee' : ''}" aria-hidden="true">${p.contract.isMarquee ? STAR_FILLED : ''}</span>`;

      return `
        <div class="${classes.join(' ')}" data-roster-id="${p.rosterId}">
          <div class="ct-ovr ${ovrClass(overall)}">
            <span class="ct-ovr-val">${overall}</span>
            <span class="ct-ovr-lbl">OVR</span>
          </div>
          <div class="ct-player-body">
            <div class="ct-row1">
              <span class="ct-player-name">${p.firstName} ${p.lastName}</span>
              <span class="ct-wage">${fmtWage(p.contract.annualWage)}</span>
            </div>
            <div class="ct-row2">
              <span class="ct-player-meta">
                <span>${p.position}</span>
                <span class="ct-meta-sep">·</span>
                <span>Age ${age ?? '—'}</span>
                ${tagParts.length ? `<span class="ct-meta-sep">·</span>${tagParts.join('')}` : ''}
              </span>
              <span class="ct-expiry-block">${fmtExpiry(p.contract.expiresOn)}</span>
            </div>
          </div>
          ${marqueeEl}
        </div>`;
    }).join('');

    const sortOptions = (Object.keys(SORT_LABELS) as SortKey[]).map(k =>
      `<button class="ct-sort-option${k === sortKey ? ' active' : ''}" data-sort="${k}">${SORT_LABELS[k]}</button>`
    ).join('');

    const leftButton = mode === 'marquee-edit'
      ? '<div class="app-topbar-spacer"></div>'
      : `<button id="ct-back" class="app-back" aria-label="Back to hub">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
           <span>Hub</span>
         </button>`;
    const titleText = mode === 'marquee-edit' ? 'Choose Your Marquee' : 'Contracts';
    const footerNote = mode === 'marquee-edit'
      ? 'Tap a star to set your marquee — their wage is excluded from the cap. You can change it again at the end of the season.'
      : 'Marquee is fixed for the season — their wage is excluded from the salary cap';
    const continueCta = mode === 'marquee-edit'
      ? `<button id="ct-continue" class="cta-pulse">
           <span>Continue</span>
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
         </button>`
      : '';

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          ${leftButton}
          <span class="app-title">${titleText}</span>
          <button id="ct-sort-btn" aria-label="Sort">
            ${SORT_ICON}
            <span>${SORT_LABELS[sortKey]}</span>
          </button>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week} / ${totalRounds}</div>
      </div>

      <div id="ct-cap-section">
        <div id="ct-cap-labels">
          <span id="ct-cap-title">Wage Budget</span>
          <span id="ct-cap-numbers">
            <span class="ct-cap-used">${fmtWage(capUsed)}</span>
            <span class="ct-cap-total"> / ${fmtWage(budgetCap)}</span>
          </span>
        </div>
        <div id="ct-cap-track">
          <div id="ct-cap-fill" class="${capStatus}" style="width:${capPct.toFixed(1)}%"></div>
          <div id="ct-cap-marker"></div>
        </div>
        <div class="ct-cap-meta">
          <div class="ct-cap-meta-item">
            <div class="ct-cap-dot ct-cap-dot--marquee"></div>
            <span style="color:${marqueeLabel.colour}">${marqueeLabel.text}</span>
          </div>
          <div class="ct-cap-meta-item ct-cap-meta-headroom">
            <span>${headroomLabel}</span>
          </div>
        </div>
      </div>

      <div id="ct-sort-panel" class="${sortPanelOpen ? 'open' : ''}">${sortOptions}</div>

      <div id="ct-list">${rows}</div>

      <div id="ct-footer" class="${mode === 'marquee-edit' ? 'ct-footer--marquee' : ''}">
        <span id="ct-footer-note">${footerNote}</span>
        ${continueCta}
      </div>
    `;

    if (mode === 'hub') {
      el!.querySelector<HTMLButtonElement>('#ct-back')!.addEventListener('click', () => onBack());
    } else {
      el!.querySelector<HTMLButtonElement>('#ct-continue')!.addEventListener('click', () => marqueeEditOnContinue());
    }

    el!.querySelector<HTMLButtonElement>('#ct-sort-btn')!.addEventListener('click', () => {
      sortPanelOpen = !sortPanelOpen;
      render();
    });

    el!.querySelectorAll<HTMLButtonElement>('.ct-sort-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort as SortKey;
        if (key === sortKey) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = defaultDirFor(key);
        }
        sortPanelOpen = false;
        render();
      });
    });

    if (mode === 'marquee-edit') {
      el!.querySelectorAll<HTMLButtonElement>('.ct-star-btn[data-marquee-toggle]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const rid = Number(btn.dataset.marqueeToggle);
          if (!Number.isFinite(rid)) return;
          const p = state.career.roster[rid];
          if (!p) return;
          gameEngine.designateMarquee(playerTeamId, p.contract.isMarquee ? null : rid);
          render();
        });
      });
    }
  }

  renderImpl = render;
}

export function showContracts(): void {
  mode = 'hub';
  renderImpl?.();
}

// Squad Builder pre-season marquee step. Re-uses the contracts list +
// interactive star toggle but swaps the back arrow for a Continue CTA
// that completes the pre-season flow.
export function showContractsMarqueeEdit(onContinue: () => void): void {
  mode = 'marquee-edit';
  marqueeEditOnContinue = onContinue;
  renderImpl?.();
}

function defaultDirFor(key: SortKey): SortDir {
  // Most useful initial direction per column: name/pos/expiry ascending,
  // numeric stats descending.
  return key === 'name' || key === 'position' || key === 'expiry' ? 'asc' : 'desc';
}

function sortPlayers(players: Player[], calendarDate: string): Player[] {
  const copy = [...players];
  copy.sort((a, b) => {
    const cmp = compare(a, b, calendarDate);
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return copy;
}

function compare(a: Player, b: Player, calendarDate: string): number {
  switch (sortKey) {
    case 'name':     return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
    case 'position': return slotOrder(a.id) - slotOrder(b.id) || a.position.localeCompare(b.position);
    case 'age': {
      const aa = getAge(a.dob, calendarDate) ?? -1;
      const bb = getAge(b.dob, calendarDate) ?? -1;
      return aa - bb;
    }
    case 'ovr':      return playerOverall(a.baseStats, a.position) - playerOverall(b.baseStats, b.position);
    case 'wage':     return a.contract.annualWage - b.contract.annualWage;
    case 'expiry':   return (a.contract.expiresOn || '9999').localeCompare(b.contract.expiresOn || '9999');
  }
}

// For position sort, group by jersey-number order so the screen reads
// like a depth chart (1-prop first, etc.).
function slotOrder(id: number): number {
  if (id >= 1 && id <= 23) return id;
  return 100 + id;
}
