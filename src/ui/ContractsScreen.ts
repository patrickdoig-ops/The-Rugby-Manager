// Contracts list for the player's club. Reached from the Hub's Contracts
// tile; back navigates to Hub. Shows per-player wage, expiry, marquee
// badge, OVR, age, position. Sortable columns via header clicks.
//
// **Phase 3 interactivity:**
// - Cap pill is live: green when under SENIOR_CAP, amber within 5%, red
//   when over. Cap excludes the marquee's wage (Σ non-marquee wages).
// - Marquee column is tap-to-toggle: tapping a non-marquee player makes
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
import { SENIOR_CAP } from '../engine/balance/transfers';
import { getAge } from '../game/age';

type SortKey = 'name' | 'position' | 'age' | 'ovr' | 'wage' | 'expiry';
type SortDir = 'asc' | 'desc';

let sortKey: SortKey = 'wage';
let sortDir: SortDir = 'desc';
let renderImpl: (() => void) | null = null;

function fmtWage(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n}`;
}

function fmtExpiry(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear() % 100}`;
}


function expiresThisSeason(expiresOn: string, calendarDate: string): boolean {
  if (!expiresOn) return false;
  const exp = new Date(expiresOn);
  const today = new Date(calendarDate);
  // "this season" = expiry within the next 10 months (June of the
  // current season-end year is roughly 10 months out from Sept of
  // the season-start year).
  const monthsAhead = (exp.getUTCFullYear() - today.getUTCFullYear()) * 12
                    + (exp.getUTCMonth() - today.getUTCMonth());
  return monthsAhead >= 0 && monthsAhead <= 10;
}

export function initContractsScreen(
  gameEngine: GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
): void {
  const el = document.getElementById('contracts');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = gameEngine.getState();
    const playerTeamId = state.player.teamId;
    const club = state.career.clubs.find(c => c.id === playerTeamId);
    const team = teamsById.get(playerTeamId);
    if (!club || !team) {
      el!.innerHTML = '<div style="padding:20px;color:var(--rm-text-dim)">No club data.</div>';
      return;
    }

    const calendarDate = state.calendar.date;
    const players: Player[] = club.squad.map(rid => state.career.roster[rid]).filter((p): p is Player => !!p);
    const sorted = sortPlayers(players, calendarDate);

    const capUsed = players.filter(p => !p.contract.isMarquee).reduce((sum, p) => sum + p.contract.annualWage, 0);
    const capStatus =
      capUsed > SENIOR_CAP ? 'over' :
      capUsed > SENIOR_CAP * 0.95 ? 'tight' :
      'ok';
    const capPill = `<span class="ct-cappill ct-cappill--${capStatus}"><span>CAP</span><span>${fmtWage(capUsed)} / ${fmtWage(SENIOR_CAP)}</span></span>`;

    const rows = sorted.map(p => {
      const overall = playerOverall(p.baseStats, p.position);
      const age = getAge(p.dob, calendarDate);
      const expiring = expiresThisSeason(p.contract.expiresOn, calendarDate);
      const star = p.contract.isMarquee
        ? '<span class="ct-marquee" aria-label="Marquee — tap to clear">★</span>'
        : '<span class="ct-marquee-empty" aria-label="Designate marquee">☆</span>';
      const expiringChip = expiring ? '<span class="ct-expiring">EXPIRES</span>' : '';
      return `
        <div class="ct-row${p.contract.isMarquee ? ' ct-row--marquee' : ''}" data-roster-id="${p.rosterId}">
          <span class="ct-name">${p.firstName} ${p.lastName}</span>
          <span class="ct-pos">${shortPos(p.position)}</span>
          <span class="ct-num">${age ?? '—'}</span>
          <span class="ct-num">${overall}</span>
          <span class="ct-wage">${fmtWage(p.contract.annualWage)}</span>
          <span class="ct-expiry">${fmtExpiry(p.contract.expiresOn)}${expiringChip}</span>
          <button class="ct-flag" data-marquee-toggle="${p.rosterId}" aria-label="${p.contract.isMarquee ? 'Clear marquee' : 'Designate marquee'}">${star}</button>
        </div>`;
    }).join('');

    const headerCell = (key: SortKey, label: string, cls: string): string => {
      const active = key === sortKey;
      const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '';
      return `<button class="ct-head ${cls}${active ? ' ct-head--active' : ''}" data-sort="${key}">${label}${arrow ? ` ${arrow}` : ''}</button>`;
    };

    el!.innerHTML = `
      <div id="ct-topbar">
        <button id="ct-back" aria-label="Back to hub">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Hub</span>
        </button>
        <span id="ct-title">Contracts — ${team.shortName}</span>
        ${capPill}
      </div>

      <div id="ct-headrow">
        ${headerCell('name',     'NAME',    'ct-name')}
        ${headerCell('position', 'POS',     'ct-pos')}
        ${headerCell('age',      'AGE',     'ct-num')}
        ${headerCell('ovr',      'OVR',     'ct-num')}
        ${headerCell('wage',     'WAGE',    'ct-wage')}
        ${headerCell('expiry',   'EXPIRES', 'ct-expiry')}
        <span class="ct-head ct-flag">★</span>
      </div>
      <div id="ct-list">${rows}</div>
      <div id="ct-footer">
        <span class="ct-cap-note">Tap ☆ to designate a marquee — that player's wage is excluded from the cap.</span>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#ct-back')!.addEventListener('click', () => onBack());
    el!.querySelectorAll<HTMLButtonElement>('.ct-head[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort as SortKey;
        if (key === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = key; sortDir = defaultDirFor(key); }
        render();
      });
    });
    el!.querySelectorAll<HTMLButtonElement>('.ct-flag[data-marquee-toggle]').forEach(btn => {
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

  renderImpl = render;
}

export function showContracts(): void {
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

function shortPos(pos: string): string {
  switch (pos) {
    case 'Prop':         return 'PR';
    case 'Hooker':       return 'HK';
    case 'Lock':         return 'LK';
    case 'Flanker':      return 'FL';
    case 'Number 8':     return 'N8';
    case 'Back Row':     return 'BR';
    case 'Scrum-Half':   return 'SH';
    case 'Fly-Half':     return 'FH';
    case 'Centre':       return 'CE';
    case 'Wing':         return 'WG';
    case 'Fullback':     return 'FB';
    case 'Utility Back': return 'UB';
    default:             return pos.slice(0, 2).toUpperCase();
  }
}
