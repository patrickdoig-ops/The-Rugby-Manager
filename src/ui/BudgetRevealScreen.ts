// Owner-set salary budget reveal. Two entry points:
//   - Squad Builder mode → fires immediately after team selection,
//     before SquadOverview. Displays the year-1 seeded budget (no
//     delta, no reasons — just the figure).
//   - End-of-season chain → fires between EndOfSeason and Renewals
//     once budgets have been computed via prepareBudgetsForNextSeason.
//     Displays the new budget + delta vs the previous + reason chips
//     (position, SF appearance, championship, floor/cap clamps).
//
// The screen reads the player's club budget straight off ClubState; the
// delta + reasons are passed in via showBudgetReveal so we don't have
// to re-derive them from the previous season's standings.
//
// Initialised once per page lifetime, like the other in-season screens.

import type { RawTeamInput } from '../types/teamData';
import type { BudgetReason } from '../types/gameState';
import type { GameCoordinator } from '../game/GameCoordinator';
import { clubBudgetUsage } from '../game/teamStats';
import { animateCounter } from './components/counterUp';
import { playId } from './SoundManager';

interface RevealPayload {
  // Display amount in pounds. Sourced from ClubState.salaryBudget at the
  // time the screen is shown — the engine has already applied any
  // CLUB_BUDGET_SET / CLUB_TAKEOVER events.
  budget: number;
  // Change vs the previous budget. Optional — Squad Builder year 1 has
  // no previous, so this is undefined and no delta chip renders.
  delta?: number;
  reasons?: BudgetReason[];
  onContinue: () => void;
}

let active: RevealPayload | null = null;
let renderImpl: (() => void) | null = null;

export function showBudgetReveal(payload: RevealPayload): void {
  active = payload;
  // Off-season reveal carries a delta → ledger sting by direction. The year-1
  // informational reveal has no delta, so it stays silent.
  if (payload.delta !== undefined && payload.delta !== 0) {
    playId(payload.delta > 0 ? 'stinger.budget.up' : 'stinger.budget.down');
  }
  renderImpl?.();
}

function fmtMillions(amount: number): string {
  // £4.15m, £6.40m, £7.80m — two decimal places. Negative values
  // (delta) prefixed with a minus, otherwise no sign.
  const sign = amount < 0 ? '-' : '';
  const v = Math.abs(amount);
  return `${sign}£${(v / 1_000_000).toFixed(2)}m`;
}

function reasonLabel(r: BudgetReason): string {
  switch (r.kind) {
    case 'position':       return `Finished ${ordinal(r.value)}`;
    case 'sf_appearance':  return 'Reached the semi-finals';
    case 'finalist':       return 'Reached the final';
    case 'champion':       return 'Season champions';
    case 'floor_applied':  return 'League minimum applied';
    case 'cap_applied':    return 'League cap applied';
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function teamCrest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="br-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

export function initBudgetRevealScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('budget-reveal');
  if (!el) return;
  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    if (!active) return;
    const state = getGameEngine().getState();
    const team = teamsById.get(state.player.teamId);
    if (!team) return;
    const currentUsage = clubBudgetUsage(state, team.id);
    const headroom = active.budget - currentUsage;
    el!.style.setProperty('--team-color', team.color);

    const deltaChip = active.delta === undefined ? ''
      : active.delta === 0
        ? `<span class="br-delta br-delta--flat">No change</span>`
        : active.delta > 0
          ? `<span class="br-delta br-delta--up">+${fmtMillions(active.delta)}</span>`
          : `<span class="br-delta br-delta--down">${fmtMillions(active.delta)}</span>`;

    const reasonChips = (active.reasons ?? [])
      .map((r, i) => `<span class="br-reason" style="--row-delay:${Math.min(i, 8) * 80}ms">${reasonLabel(r)}</span>`)
      .join('');

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Owner's Budget</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel}</div>
      </div>

      <div id="br-card">
        ${teamCrest(team)}
        <div class="br-club-name">${team.name}</div>
        <div class="br-headline-label">WAGE BUDGET</div>
        <div class="br-headline" data-counter-budget>${fmtMillions(0)}</div>
        ${deltaChip}
        ${reasonChips ? `<div class="br-reasons">${reasonChips}</div>` : ''}
        <div class="br-usage">
          <div class="br-usage-row">
            <span class="br-usage-label">Committed wages</span>
            <span class="br-usage-val">${fmtMillions(currentUsage)}</span>
          </div>
          <div class="br-usage-row">
            <span class="br-usage-label">Headroom for signings</span>
            <span class="br-usage-val ${headroom < 0 ? 'br-usage-val--over' : ''}">${fmtMillions(headroom)}</span>
          </div>
        </div>
        <p class="br-note">The owner has fixed your non-marquee wage spend at this level. Renewals and new signings must stay within budget; marquee wages sit outside.</p>
      </div>

      <div id="br-footer">
        <button id="br-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>`;

    el!.querySelector<HTMLButtonElement>('#br-continue')!.addEventListener('click', () => {
      if (active) active.onContinue();
    });

    // Counter-up the headline budget figure. 600ms delay so it lands
    // after the .br-card tkHeroEnter animation (600ms).
    const budgetEl = el!.querySelector<HTMLElement>('[data-counter-budget]');
    if (budgetEl) {
      animateCounter(budgetEl, 0, active.budget, fmtMillions, { duration: 1200, delay: 600 });
    }
  }

  renderImpl = render;
}
