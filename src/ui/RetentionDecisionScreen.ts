// Inserted after the AI bid pass when one or more of the user's own
// final-year players are being poached. Lets the user choose, per
// player, whether to make a retention bid (=their current club bids
// alongside the external poach bidders; appeal scoring then decides).
//
// Wage shown is the renewal-discounted asking wage (loyalty
// discount); budget pill reflects the user's projected commitments
// (existing squad + reserved bids + accepted retentions). Hard budget
// gate: rows that would breach budget disable the Retain button.
//
// Continue → resolveSigningRound → SigningResultsScreen.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import { playerOverall } from '../engine/RatingEngine';
import { getAge } from '../game/age';
import { retentionTermsFor } from '../game/aiTransferDirector';
import { clubBudgetUsage } from '../game/teamStats';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';

let activeOnContinue: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showRetentionDecision(onContinue: () => void): void {
  activeOnContinue = onContinue;
  renderImpl?.();
}

function fmtWage(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n}`;
}

// Days between two ISO calendar dates. Both are 'YYYY-MM-DD'.
function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  if (Number.isNaN(from) || Number.isNaN(to)) return 7;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

// Days until the retention deadline. MarketState.deadline is reserved
// for a future persisted field; until then default to 7 from the
// market's openedAfterSeason / calendar date — keeps the pill purely
// decorative but lets us thread it through end-to-end now.
function deadlineDays(calendarDate: string, marketDeadline: string | null): number {
  if (marketDeadline) return daysBetween(calendarDate, marketDeadline);
  return 7;
}

export function initRetentionDecisionScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  // Tap player name → profile. Retain/Withdraw buttons are separate
  // row children and aren't affected by the link click.
  onPlayerClick?: (rosterId: number) => void,
): void {
  const el = document.getElementById('retention-decision');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const gameEngine = getGameEngine();
    const state = gameEngine.getState();
    const playerClubId = state.player.teamId;
    const playerTeam = teamsById.get(playerClubId);
    const club = state.career.clubs.find(c => c.id === playerClubId);
    if (!playerTeam || !club || !state.career.market) return;
    el!.style.setProperty('--team-color', playerTeam.color);

    // Roster of the user's own players currently under poach attack.
    const promptRosterIds = gameEngine.getUserRetentionPrompts();
    if (promptRosterIds.length === 0) {
      // Defensive — caller should have skipped this screen entirely.
      el!.innerHTML = `
        <div class="app-header">
          <div class="app-topbar">
            <div class="app-topbar-spacer"></div>
            <span class="app-title">No Retention Decisions</span>
            <div class="app-topbar-spacer"></div>
          </div>
        </div>
        <div class="rd-empty">No players under poach attack.</div>
        <div id="rd-footer">
          <button id="rd-continue" class="cta-pulse"><span>Continue</span></button>
        </div>
      `;
      el!.querySelector<HTMLButtonElement>('#rd-continue')!.addEventListener('click', () => activeOnContinue());
      return;
    }

    // Set of rosterIds the user has currently flagged for retention.
    const userRetentions = new Set(
      state.career.market.bids
        .filter(b => b.clubId === playerClubId && b.kind === 'retention' && b.status === 'pending')
        .map(b => b.rosterId),
    );

    const baseUsage = clubBudgetUsage(state, playerClubId);
    const budgetCap = club.salaryBudget;
    const capStatus =
      baseUsage > budgetCap ? 'over' :
      baseUsage > budgetCap * 0.95 ? 'tight' :
      'ok';
    const capPill = `<span class="tm-cappill tm-cappill--${capStatus}"><span>BUDGET</span><span>${fmtWage(baseUsage)} / ${fmtWage(budgetCap)}</span></span>`;

    const calendarDate = state.calendar.date;
    const rows = promptRosterIds.map(rid => {
      const p = state.career.roster[rid];
      if (!p) return null;
      const terms = retentionTermsFor(state, rid);
      if (!terms) return null;
      const ovr = playerOverall(p.baseStats, p.position);
      const age = getAge(p.dob, calendarDate);
      const wageDelta = terms.annualWage - p.contract.annualWage;
      const isRetaining = userRetentions.has(rid);
      // Budget gate: a NEW retention would breach if the projected
      // delta pushes over budget. Existing retentions never breach
      // (they're already in the reserved sum via clubBudgetUsage).
      const projectedIfRetain = baseUsage + Math.max(0, wageDelta);
      const wouldExceedCap = !isRetaining && projectedIfRetain > budgetCap;
      // Find the poacher club objects so we can render an inline crest stack.
      const poachers = (state.career.market?.bids ?? [])
        .filter(b => b.rosterId === rid && b.kind === 'poach' && b.status === 'pending')
        .map(b => teamsById.get(b.clubId))
        .filter((t): t is RawTeamInput => !!t);
      const crestStackHtml = poachers.slice(0, 3).map(t => {
        const grad = `linear-gradient(160deg, ${t.color} 0%, color-mix(in oklch, ${t.color} 30%, black) 100%)`;
        return `<span class="team-crest" style="background:${grad}"><span>${t.shortName[0] ?? '?'}</span></span>`;
      }).join('');
      const overflowHtml = poachers.length > 3 ? `<span class="rd-poacher-overflow">+${poachers.length - 3}</span>` : '';
      const poacherInline = poachers.length === 1
        ? `${poachers[0].shortName} interested`
        : `${poachers.length} clubs interested`;
      const poacherHtml = `<span class="rd-poacher-crest-stack">${crestStackHtml}${overflowHtml}</span><span>${poacherInline}</span>`;

      const buttonLabel = isRetaining ? 'Withdraw' : 'Retain';
      const buttonClass = `tm-sign${wouldExceedCap ? ' tm-sign--warn' : ''}${isRetaining ? ' tm-sign--undo' : ''}`;
      const dataAttr = isRetaining ? `data-withdraw="${rid}"` : `data-retain="${rid}"`;
      const wageDeltaStr = wageDelta > 0
        ? `+${fmtWage(wageDelta)}/y`
        : wageDelta < 0 ? `-${fmtWage(-wageDelta)}/y` : `same`;

      const nameInner = onPlayerClick
        ? playerLinkHtml(`${p.firstName} ${p.lastName}`, rid)
        : `${p.firstName} ${p.lastName}`;
      return `
        <div class="rd-row${isRetaining ? ' tm-row--committed' : ''}">
          <span class="rd-name">${nameInner}</span>
          <span class="rd-meta">${p.position} · ${ovr} OVR · ${age ?? '—'}</span>
          <span class="rd-poacher">${poacherHtml}</span>
          <span class="rd-wage">${fmtWage(terms.annualWage)} <span class="rd-delta">(${wageDeltaStr})</span></span>
          <button class="${buttonClass}" ${dataAttr}${wouldExceedCap ? ' disabled' : ''}>${buttonLabel}</button>
        </div>`;
    }).filter((s): s is string => s !== null).join('');

    const market = state.career.market as (typeof state.career.market & { deadline?: string });
    const daysLeft = deadlineDays(state.calendar.date, market?.deadline ?? null);
    const isUrgent = daysLeft <= 3;
    const daysLabel = daysLeft <= 1 ? 'Last day' : `${daysLeft} days`;
    const deadlinePill = `<span class="rd-deadline${isUrgent ? ' rd-deadline--urgent' : ''}">Decide before R${state.calendar.week + 1} · ${daysLabel}</span>`;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Retention Decisions</span>
          ${capPill}
        </div>
        <div class="app-eyebrow">${promptRosterIds.length} of your players being approached${deadlinePill}</div>
      </div>

      <div class="rd-intro">Other clubs have approached your final-year players. Make a retention offer to keep them, or let them go. Players you don't retain may leave at next rollover.</div>

      <div id="rd-list">${rows}</div>

      <div id="rd-footer">
        <button id="rd-continue" class="cta-pulse">
          <span>Continue to results</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelectorAll<HTMLButtonElement>('.tm-sign[data-retain]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = Number(btn.dataset.retain);
        if (!Number.isFinite(rid)) return;
        gameEngine.submitRetentionBid(rid);
        render();
      });
    });
    el!.querySelectorAll<HTMLButtonElement>('.tm-sign[data-withdraw]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = Number(btn.dataset.withdraw);
        if (!Number.isFinite(rid)) return;
        gameEngine.withdrawRetentionBid(rid);
        render();
      });
    });
    el!.querySelector<HTMLButtonElement>('#rd-continue')!.addEventListener('click', () => activeOnContinue());

    if (onPlayerClick) wirePlayerLinks(el!, onPlayerClick);
  }

  renderImpl = render;
}
