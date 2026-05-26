// End-of-season renewal window for the player's club. Reached from
// EndOfSeasonScreen's Continue CTA when there are expiring players;
// transitions to RolloverScreen on the next Continue.
//
// Reads state.career.market (populated by openRenewalWindow). For each
// pending offer on the player's club, renders a row with the proposed
// renewal terms and a Renew / Release toggle (default: renew). When
// the user clicks Continue, the parent handler calls closeRenewalWindow
// with the collected decisions; AI clubs' offers are auto-resolved by
// the director in the same call.
//
// Module-level setter + closure state, matching the RolloverScreen
// pattern: init once, set per-window via showRenewals(onContinue),
// re-render on toggle clicks.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { TransferOffer } from '../types/gameState';
import type { Player } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import { getAge } from '../game/age';
import { showToast } from './Toast';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';

type Decision = 'renew' | 'release';

// Keyed by offer ID. Populated on each render from the live market
// state; mutated by row toggle clicks. The parent handler reads it on
// Continue and feeds it to closeRenewalWindow.
let decisions: Map<string, Decision> = new Map();
let activeOnContinue: (decisions: Record<string, Decision>) => void = () => {};
let renderImpl: (() => void) | null = null;

export function showRenewals(onContinue: (decisions: Record<string, Decision>) => void): void {
  activeOnContinue = onContinue;
  decisions = new Map();
  renderImpl?.();
}

function fmtWage(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n}`;
}

function shortPos(pos: string): string {
  const map: Record<string, string> = {
    'Prop': 'PR', 'Hooker': 'HK', 'Lock': 'LK', 'Flanker': 'FL',
    'Number 8': 'N8', 'Back Row': 'BR', 'Scrum-Half': 'SH',
    'Fly-Half': 'FH', 'Centre': 'CE', 'Wing': 'WG', 'Fullback': 'FB',
    'Utility Back': 'UB',
  };
  return map[pos] ?? pos.slice(0, 2).toUpperCase();
}

export function initRenewalsScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  // Optional player-name → profile click. Renew/Release toggle buttons
  // stop propagation so the link doesn't fire from those.
  onPlayerClick?: (rosterId: number) => void,
): void {
  const el = document.getElementById('renewals');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = getGameEngine().getState();
    const market = state.career.market;
    const playerClubId = state.player.teamId;
    const team = teamsById.get(playerClubId);
    if (!market || !team) {
      // Defensive — shouldn't happen if the nav handler only opens the
      // window when there are offers, but render a sensible empty state.
      el!.innerHTML = `
        <div class="app-header">
          <div class="app-topbar">
            <div class="app-topbar-spacer"></div>
            <span class="app-title">No Renewals</span>
            <div class="app-topbar-spacer"></div>
          </div>
        </div>
        <div class="empty-state">
          <svg class="empty-state__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"/>
          </svg>
          <div class="empty-state__title">No renewals this off-season</div>
          <div class="empty-state__desc">Every contract in your squad runs through next season. Continue to the signing window.</div>
        </div>
        <div id="rn-footer"><button id="rn-continue" class="cta-pulse"><span>Continue</span></button></div>
      `;
      el!.querySelector<HTMLButtonElement>('#rn-continue')!.addEventListener('click', () => activeOnContinue({}));
      return;
    }

    const calendarDate = state.calendar.date;
    const myOffers: TransferOffer[] = market.offers.filter(o => o.fromClubId === playerClubId && o.status === 'pending');

    // Default unset rows to 'renew' on first render of this window.
    for (const o of myOffers) {
      if (!decisions.has(o.id)) decisions.set(o.id, 'renew');
    }

    // Project the cap after the user's current decisions: start from
    // non-marquee non-expiring wages, add accepted renewals.
    const club = state.career.clubs.find(c => c.id === playerClubId)!;
    const expiringSet = new Set(market.expiringRosterIds);
    let projectedCap = 0;
    for (const rid of club.squad) {
      const p = state.career.roster[rid];
      if (!p || p.contract.isMarquee) continue;
      if (expiringSet.has(rid)) continue;
      projectedCap += p.contract.annualWage;
    }
    for (const o of myOffers) {
      if (decisions.get(o.id) === 'renew' && !o.isMarquee) {
        projectedCap += o.annualWage;
      }
    }
    // The owner's salaryBudget is the cap-relevant ceiling — the
    // league's effective cap (£7.8m) sits above it as a hard limit no
    // budget can exceed. We pill against the budget; an over-budget
    // signing is hard-blocked by signFreeAgent / preAgreePoach in the
    // signing window.
    const budgetCap = club.salaryBudget;
    const capStatus =
      projectedCap > budgetCap ? 'over' :
      projectedCap > budgetCap * 0.95 ? 'tight' :
      'ok';

    const renewedCount = myOffers.filter(o => decisions.get(o.id) === 'renew').length;

    const rows = myOffers.map(o => {
      const p: Player | undefined = state.career.roster[o.rosterId];
      if (!p) return '';
      const age = getAge(p.dob, calendarDate);
      const ovr = playerOverall(p.baseStats, p.position);
      const choice = decisions.get(o.id) ?? 'renew';
      const isRenew = choice === 'renew';
      const wageDelta = o.annualWage - p.contract.annualWage;
      const deltaSign = wageDelta > 0 ? '+' : '';
      const deltaCls = wageDelta > 0 ? 'rn-delta-up' : wageDelta < 0 ? 'rn-delta-down' : '';
      const nameInner = onPlayerClick
        ? playerLinkHtml(`${p.firstName} ${p.lastName}`, p.rosterId)
        : `${p.firstName} ${p.lastName}`;
      return `
        <div class="rn-row${isRenew ? ' rn-row--renew' : ' rn-row--release'}" data-offer-id="${o.id}">
          <div class="rn-row-main">
            <span class="rn-name">${nameInner}${o.isMarquee ? ' <svg class="rn-marquee" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.637 1.55.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.755-.415-2.211.749-2.305l5.404-.434 2.082-5.005z"/></svg>' : ''}</span>
            <span class="rn-meta">${shortPos(p.position)} · ${age ?? '—'} · OVR ${ovr}</span>
          </div>
          <div class="rn-row-terms">
            <span class="rn-current">${fmtWage(p.contract.annualWage)}</span>
            <span class="rn-arrow">→</span>
            <span class="rn-new">${fmtWage(o.annualWage)} <span class="rn-len">× ${o.lengthYears}y</span></span>
            ${wageDelta !== 0 ? `<span class="${deltaCls}">${deltaSign}${fmtWage(Math.abs(wageDelta))}</span>` : ''}
          </div>
          <div class="rn-toggle" role="group" aria-label="Renewal decision">
            <button class="rn-pick${isRenew ? ' rn-pick--active' : ''}" data-decision="renew" aria-pressed="${isRenew}">Renew</button>
            <button class="rn-pick${!isRenew ? ' rn-pick--active' : ''}" data-decision="release" aria-pressed="${!isRenew}">Release</button>
          </div>
        </div>`;
    }).join('');

    const capPill = `<span class="rn-cappill rn-cappill--${capStatus}"><span>BUDGET</span><span>${fmtWage(projectedCap)} / ${fmtWage(budgetCap)}</span></span>`;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Renewals</span>
          ${capPill}
        </div>
        <div class="app-eyebrow">${team.name} · ${state.calendar.seasonLabel} · ${renewedCount} of ${myOffers.length} keeping</div>
      </div>

      <div id="rn-list">
        ${myOffers.length === 0
          ? `<div class="empty-state">
              <svg class="empty-state__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"/>
              </svg>
              <div class="empty-state__title">No renewals this off-season</div>
              <div class="empty-state__desc">Every contract in your squad runs through next season. Continue to the signing window.</div>
            </div>`
          : rows}
      </div>

      <div id="rn-footer">
        <button id="rn-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    // Wire toggle buttons.
    el!.querySelectorAll<HTMLButtonElement>('.rn-pick[data-decision]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest<HTMLDivElement>('.rn-row');
        if (!row) return;
        const offerId = row.dataset.offerId;
        if (!offerId) return;
        const decision = btn.dataset.decision as Decision;
        const prev = decisions.get(offerId) ?? 'renew';
        decisions.set(offerId, decision);
        if (decision !== prev) {
          const offer = myOffers.find(o => o.id === offerId);
          const p = offer ? state.career.roster[offer.rosterId] : undefined;
          if (p) {
            showToast(
              `${p.firstName} ${p.lastName} ${decision === 'renew' ? 'renewed' : 'released'}`,
              decision === 'renew' ? 'success' : 'danger',
            );
          }
        }
        render();

        // Flash the row that just changed. Pitch flash for renew,
        // danger flash for release. Removed on animationend so re-render
        // re-applies cleanly on subsequent toggles.
        if (decision !== prev) {
          requestAnimationFrame(() => {
            const newRow = el!.querySelector<HTMLElement>(`.rn-row[data-offer-id="${offerId}"]`);
            if (newRow) {
              const flashClass = decision === 'release' ? 'row-just-changed--danger' : 'row-just-changed';
              newRow.classList.add('row-just-changed', flashClass);
              newRow.addEventListener('animationend', function onEnd() {
                newRow.classList.remove('row-just-changed', flashClass);
                newRow.removeEventListener('animationend', onEnd);
              });
            }
          });
        }
      });
    });

    el!.querySelector<HTMLButtonElement>('#rn-continue')!.addEventListener('click', () => {
      activeOnContinue(Object.fromEntries(decisions));
    });

    if (onPlayerClick) wirePlayerLinks(el!, onPlayerClick);
  }

  renderImpl = render;
}
