// Staff hiring screen (1.2). Lists the free-pool candidates plus currently
// hired staff for the managed club. Hire/release buttons go through
// GameCoordinator.hireStaff / releaseStaff.
//
// Initialised once per page lifetime; showStaff() re-renders fresh state
// on every visit.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { StaffMember } from '../types/gameState';
import { STAFF_CAPS } from '../engine/balance/staff';
import { clubBudgetUsage } from '../game/teamStats';
import { injectTeamColors } from './teamColors';

export interface InitStaffScreenOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
}

let _opts: InitStaffScreenOpts | null = null;
let _teamsById: Map<string, RawTeamInput> = new Map();

const ROLE_LABELS: Record<string, string> = {
  assistant: 'Assistant Manager',
  fitness:   'Fitness & Medical',
  scout:     'Scout',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  assistant: 'Improves suggested line-ups and training plans.',
  fitness:   'Lifts training gains and reduces training injury risk.',
  scout:     'Reveals opponent attributes faster and more accurately.',
};

function ratingBand(rating: number): string {
  if (rating >= 80) return 'World Class';
  if (rating >= 65) return 'Excellent';
  if (rating >= 50) return 'Good';
  if (rating >= 35) return 'Average';
  return 'Limited';
}

function formatWage(w: number): string {
  if (w >= 1_000_000) return `£${(w / 1_000_000).toFixed(2)}m`;
  return `£${Math.round(w / 1_000)}k`;
}

function staffCardHtml(m: StaffMember, isHired: boolean, canHire: boolean): string {
  const band = ratingBand(m.rating);
  const action = isHired
    ? `<button class="staff-btn staff-btn--release" data-id="${m.id}">Release</button>`
    : canHire
      ? `<button class="staff-btn staff-btn--hire" data-id="${m.id}">Hire</button>`
      : `<button class="staff-btn staff-btn--hire" data-id="${m.id}" disabled>Hire</button>`;
  return `
    <div class="staff-card${isHired ? ' staff-card--hired' : ''}">
      <div class="staff-card-header">
        <div class="staff-card-name">${m.name}</div>
        ${isHired ? '<span class="staff-badge staff-badge--hired">Hired</span>' : ''}
      </div>
      <div class="staff-card-meta">
        <span class="staff-rating staff-rating--${band.toLowerCase().replace(' ', '-')}">${m.rating} <em>${band}</em></span>
        <span class="staff-wage">${formatWage(m.annualWage)} / yr</span>
      </div>
      ${action}
    </div>`;
}

export function showStaff(): void {
  const el = document.getElementById('staff');
  if (!el || !_opts) return;
  const opts = _opts;
  const engine = opts.getGameEngine();
  const state = engine.getState();
  const playerTeam = _teamsById.get(state.player.teamId);
  if (!playerTeam) return;

  const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  const allStaff = state.career.staff ?? [];
  const clubId = state.player.teamId;

  const hired    = allStaff.filter(m => m.clubId === clubId);
  const freePool = allStaff.filter(m => m.clubId === null);
  const club     = state.career.clubs.find(c => c.id === clubId);
  const budget   = club?.salaryBudget ?? 0;
  const used     = clubBudgetUsage(state, clubId);
  const remaining = budget - used;

  const hiredByRole = new Map<string, number>();
  for (const m of hired) hiredByRole.set(m.role, (hiredByRole.get(m.role) ?? 0) + 1);

  const canHireStaff = (m: StaffMember): boolean => {
    const count = hiredByRole.get(m.role) ?? 0;
    const cap = m.role === 'scout' ? STAFF_CAPS.scouts : 1;
    return count < cap && m.annualWage <= remaining;
  };

  const roles: Array<'assistant' | 'fitness' | 'scout'> = ['assistant', 'fitness', 'scout'];

  const sectionsHtml = roles.map(role => {
    const hiredOfRole   = hired.filter(m => m.role === role);
    const poolOfRole    = freePool.filter(m => m.role === role);
    const cap           = role === 'scout' ? STAFF_CAPS.scouts : 1;
    const countLabel    = `${hiredOfRole.length} / ${cap} hired`;

    const hiredCards = hiredOfRole.map(m => staffCardHtml(m, true, false)).join('');
    const poolCards  = poolOfRole.map(m => staffCardHtml(m, false, canHireStaff(m))).join('');

    return `
      <div class="staff-section">
        <div class="staff-section-header">
          <div class="staff-section-title">${ROLE_LABELS[role]}</div>
          <div class="staff-section-count">${countLabel}</div>
        </div>
        <p class="staff-section-desc">${ROLE_DESCRIPTIONS[role]}</p>
        ${hiredCards}
        ${poolCards.length ? poolCards : '<p class="staff-empty">No candidates available — new pool at season rollover.</p>'}
      </div>`;
  }).join('');

  const budgetPct = budget > 0 ? Math.min(100, Math.round(used / budget * 100)) : 0;
  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="st-back" class="app-back" aria-label="Back to club">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Club</span>
        </button>
        <span class="app-title">Staff</span>
        <div class="app-topbar-spacer"></div>
      </div>
      <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week} / ${totalRounds}</div>
    </div>
    <div id="st-content">
      <div class="staff-budget-pill">
        <span class="staff-budget-label">Salary budget</span>
        <span class="staff-budget-bar-wrap"><span class="staff-budget-bar" style="width:${budgetPct}%"></span></span>
        <span class="staff-budget-figures">${formatWage(used)} used · <strong>${formatWage(remaining)}</strong> remaining</span>
      </div>
      ${sectionsHtml}
    </div>
  `;

  injectTeamColors(el, playerTeam);

  el.querySelector<HTMLButtonElement>('#st-back')!.addEventListener('click', () => opts.onBack());

  el.querySelectorAll<HTMLButtonElement>('.staff-btn--hire').forEach(btn => {
    btn.addEventListener('click', () => {
      engine.hireStaff(btn.dataset.id!);
      showStaff();
    });
  });

  el.querySelectorAll<HTMLButtonElement>('.staff-btn--release').forEach(btn => {
    btn.addEventListener('click', () => {
      engine.releaseStaff(btn.dataset.id!);
      showStaff();
    });
  });
}

export function initStaffScreen(opts: InitStaffScreenOpts): void {
  _opts = opts;
  _teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
}
