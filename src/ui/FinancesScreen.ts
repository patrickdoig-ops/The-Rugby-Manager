// Club Finances screen. Shows player salary budget vs committed wages,
// staff budget vs spend, and a one-way slider to transfer unused player
// salary headroom to staff budget for the current season.
//
// Initialised once per page lifetime; showFinancesScreen() re-renders
// fresh state on every visit.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { STAFF_BUDGET_FRACTION } from '../engine/balance/staff';
import { staffBudgetUsage } from '../game/teamStats';
import { injectTeamColors } from './teamColors';
import { helpButtonHtml } from './help/helpButton';

export interface InitFinancesScreenOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
}

let _opts: InitFinancesScreenOpts | null = null;
let _teamsById: Map<string, RawTeamInput> = new Map();

function formatWage(w: number): string {
  if (w >= 1_000_000) return `£${(w / 1_000_000).toFixed(2)}m`;
  return `£${Math.round(w / 1_000).toFixed(0)}k`;
}

export function showFinancesScreen(): void {
  const el = document.getElementById('club-finances');
  if (!el || !_opts) return;
  const opts = _opts;
  const engine = opts.getGameEngine();
  const state = engine.getState();
  const clubId = state.player.teamId;
  const playerTeam = _teamsById.get(clubId);
  if (!playerTeam) return;

  const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  const club = state.career.clubs.find(c => c.id === clubId);
  if (!club) return;

  // Player salary budget
  const players = club.squad.map(rid => state.career.roster[rid]).filter(Boolean);
  const nonMarquee = players.filter(p => !p.contract.isMarquee);
  const marqueePlayer = players.find(p => p.contract.isMarquee);
  const playerCapUsed = nonMarquee.reduce((sum, p) => sum + p.contract.annualWage, 0);
  const playerBudget = club.salaryBudget;
  const playerHeadroom = playerBudget - playerCapUsed;
  const playerPct = Math.min(100, playerBudget > 0 ? Math.round(playerCapUsed / playerBudget * 100) : 0);
  const playerStatus = playerCapUsed > playerBudget ? 'over' : playerCapUsed > playerBudget * 0.95 ? 'tight' : 'ok';

  // Staff budget
  const baseStaffBudget = club.staffBudget ?? Math.round(playerBudget * STAFF_BUDGET_FRACTION);
  const currentBoost = club.staffBudgetBoost ?? 0;
  const effectiveStaffBudget = baseStaffBudget + currentBoost;
  const staffUsed = staffBudgetUsage(state, clubId);
  const staffRemaining = effectiveStaffBudget - staffUsed;
  const staffPct = Math.min(100, effectiveStaffBudget > 0 ? Math.round(staffUsed / effectiveStaffBudget * 100) : 0);

  // Transfer slider bounds: max is current player headroom (can't transfer more than available)
  const maxBoost = Math.max(0, playerHeadroom);
  // Clamp persisted boost to current headroom in case wages were added since last transfer
  const sliderValue = Math.min(currentBoost, maxBoost);
  const sliderDisabled = maxBoost <= 0 && currentBoost <= 0 ? 'disabled' : '';

  const marqueeNote = marqueePlayer
    ? `<span class="fin-marquee-note">${marqueePlayer.lastName} excluded (${formatWage(marqueePlayer.contract.annualWage)}/yr)</span>`
    : '';

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="fin-back" class="app-back" aria-label="Back to club">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Club</span>
        </button>
        <span class="app-title">Finances</span>
        <div class="app-topbar-spacer">${helpButtonHtml('club-finances')}</div>
      </div>
      <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week} / ${totalRounds}</div>
    </div>

    <div id="fin-content">

      <div class="fin-section-label">Player Salary Budget</div>
      <div class="fin-budget-card">
        <div class="fin-card-row">
          <span class="fin-card-committed">${formatWage(playerCapUsed)} committed</span>
          <span class="fin-card-budget">of ${formatWage(playerBudget)}</span>
        </div>
        <div class="fin-bar-track">
          <div class="fin-bar-fill fin-bar-fill--${playerStatus}" style="width:${playerPct}%"></div>
        </div>
        <div class="fin-card-footer">
          <span class="fin-headroom fin-headroom--${playerStatus}">
            ${playerHeadroom >= 0 ? formatWage(playerHeadroom) + ' headroom' : formatWage(-playerHeadroom) + ' over budget'}
          </span>
          ${marqueeNote}
        </div>
      </div>

      <div class="fin-section-label">Staff Budget</div>
      <div class="fin-budget-card">
        <div class="fin-card-row">
          <span class="fin-card-committed">${formatWage(staffUsed)} used</span>
          <span class="fin-card-budget">of ${formatWage(effectiveStaffBudget)}</span>
        </div>
        <div class="fin-bar-track">
          <div class="fin-bar-fill fin-bar-fill--staff" style="width:${staffPct}%"></div>
        </div>
        <div class="fin-card-footer">
          <span class="fin-headroom">${formatWage(staffRemaining)} remaining</span>
          ${currentBoost > 0 ? `<span class="fin-boost-chip">+${formatWage(currentBoost)} transferred</span>` : ''}
        </div>
      </div>

      <div class="fin-section-label">Transfer to Staff Budget</div>
      <div class="fin-transfer-card">
        <p class="fin-transfer-desc">Move unused player salary budget into staff this season. One-way and season-only — cannot be reversed or carried over.</p>
        <div class="fin-slider-row">
          <span class="fin-slider-edge">£0</span>
          <input
            type="range"
            id="fin-boost-slider"
            class="fin-slider"
            min="0"
            max="${maxBoost}"
            step="5000"
            value="${sliderValue}"
            ${sliderDisabled}
            aria-label="Transfer amount"
          >
          <span class="fin-slider-edge">${formatWage(maxBoost)}</span>
        </div>
        ${maxBoost <= 0 && currentBoost <= 0 ? '<p class="fin-slider-note">No player salary headroom available to transfer.</p>' : ''}
        <div class="fin-transfer-summary">
          <div class="fin-transfer-row">
            <span class="fin-transfer-label">Transfer</span>
            <span class="fin-transfer-val" id="fin-boost-val">${formatWage(sliderValue)}</span>
          </div>
          <div class="fin-transfer-row">
            <span class="fin-transfer-label">Effective staff budget</span>
            <span class="fin-transfer-val" id="fin-staff-effective">${formatWage(baseStaffBudget + sliderValue)}</span>
          </div>
        </div>
      </div>

    </div>
  `;

  injectTeamColors(el, playerTeam);

  el.querySelector<HTMLButtonElement>('#fin-back')!.addEventListener('click', () => opts.onBack());

  const slider = el.querySelector<HTMLInputElement>('#fin-boost-slider');
  if (slider) {
    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      el.querySelector<HTMLElement>('#fin-boost-val')!.textContent = formatWage(val);
      el.querySelector<HTMLElement>('#fin-staff-effective')!.textContent = formatWage(baseStaffBudget + val);
    });

    slider.addEventListener('change', () => {
      engine.setStaffBudgetBoost(Number(slider.value));
      showFinancesScreen();
    });
  }
}

export function initFinancesScreen(opts: InitFinancesScreenOpts): void {
  _opts = opts;
  _teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
}
