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
import { SENIOR_CAP, EFFECTIVE_CAP_CREDITS } from '../engine/balance/transfers';
import { getAge } from '../game/age';

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
  gameEngine: GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('renewals');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = gameEngine.getState();
    const market = state.career.market;
    const playerClubId = state.player.teamId;
    const team = teamsById.get(playerClubId);
    if (!market || !team) {
      // Defensive — shouldn't happen if the nav handler only opens the
      // window when there are offers, but render a sensible empty state.
      el!.innerHTML = `
        <div id="rn-topbar"><div style="width:72px"></div><span id="rn-title">No Renewals</span><div style="width:72px"></div></div>
        <div id="rn-empty">No expiring contracts this off-season.</div>
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
    const effectiveCap = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;
    const capStatus =
      projectedCap > effectiveCap ? 'over' :
      projectedCap > effectiveCap * 0.95 ? 'tight' :
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
      const deltaCls = wageDelta > 0 ? 'rn-delta-pos' : wageDelta < 0 ? 'rn-delta-neg' : '';
      return `
        <div class="rn-row${isRenew ? ' rn-row--renew' : ' rn-row--release'}" data-offer-id="${o.id}">
          <div class="rn-row-main">
            <span class="rn-name">${p.firstName} ${p.lastName}${o.isMarquee ? ' <span class="rn-marquee">★</span>' : ''}</span>
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

    const capPill = `<span class="rn-cappill rn-cappill--${capStatus}"><span>CAP</span><span>${fmtWage(projectedCap)} / ${fmtWage(effectiveCap)}</span></span>`;

    el!.innerHTML = `
      <div id="rn-topbar">
        <div style="width:72px"></div>
        <span id="rn-title">Renewals — ${team.shortName}</span>
        ${capPill}
      </div>
      <div id="rn-eyebrow">${state.calendar.seasonLabel} · ${renewedCount} of ${myOffers.length} keeping</div>

      <div id="rn-list">
        ${myOffers.length === 0
          ? '<div class="rn-empty">No expiring contracts in your squad this off-season.</div>'
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
        decisions.set(offerId, btn.dataset.decision as Decision);
        render();
      });
    });

    el!.querySelector<HTMLButtonElement>('#rn-continue')!.addEventListener('click', () => {
      activeOnContinue(Object.fromEntries(decisions));
    });
  }

  renderImpl = render;
}
