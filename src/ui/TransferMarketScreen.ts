// Free-agent signing window (Phase 5). Reached from RenewalsScreen's
// Continue CTA. By the time this screen renders, openSigningWindow
// has pre-computed one TransferOffer per free agent and parked them
// on state.career.market (phase: 'signings'). Reading from the cached
// offers — rather than calling signingTermsFor per render — keeps
// rngTransfer stable across re-renders and matches what
// signFreeAgent / decideAISignings will use.
//
// Module-level setter pattern (matches RenewalsScreen / RolloverScreen).
// Each render reads live state.career.market so a sign action's
// re-render reflects the now-shorter list.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { Player } from '../types/player';
import type { TransferOffer } from '../types/gameState';
import { playerOverall } from '../engine/RatingEngine';
import { SENIOR_CAP, EFFECTIVE_CAP_CREDITS } from '../engine/balance/transfers';
import { poachCandidates, signingTermsFor } from '../game/aiTransferDirector';
import { getAge } from '../game/age';

type SortKey = 'name' | 'pos' | 'age' | 'ovr' | 'wage';
type SortDir = 'asc' | 'desc';

let sortKey: SortKey = 'ovr';
let sortDir: SortDir = 'desc';
let activeOnContinue: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showTransferMarket(onContinue: () => void): void {
  activeOnContinue = onContinue;
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

export function initTransferMarketScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('transfer-market');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const gameEngine = getGameEngine();
    const state = gameEngine.getState();
    const playerClubId = state.player.teamId;
    const team = teamsById.get(playerClubId);
    const club = state.career.clubs.find(c => c.id === playerClubId);
    const market = state.career.market;
    if (!team || !club || !market || market.phase !== 'signings') {
      el!.innerHTML = `
        <div class="app-header">
          <div class="app-topbar">
            <div class="app-topbar-spacer"></div>
            <span class="app-title">No Free Agents</span>
            <div class="app-topbar-spacer"></div>
          </div>
        </div>
        <div class="tm-empty">No signing window open.</div>
        <div id="tm-footer"><button id="tm-continue" class="cta-pulse"><span>Continue</span></button></div>
      `;
      el!.querySelector<HTMLButtonElement>('#tm-continue')!.addEventListener('click', () => activeOnContinue());
      return;
    }

    const calendarDate = state.calendar.date;
    const freeAgentSet = new Set(state.career.freeAgents);
    const availableOffers = market.offers
      .filter(o => o.status === 'pending' && freeAgentSet.has(o.rosterId));

    const capUsed = club.squad
      .map(rid => state.career.roster[rid])
      .filter(p => p && !p.contract.isMarquee)
      .reduce((sum, p) => sum + p!.contract.annualWage, 0);
    const effectiveCap = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;
    const capStatus =
      capUsed > effectiveCap ? 'over' :
      capUsed > effectiveCap * 0.95 ? 'tight' :
      'ok';
    const capPill = `<span class="tm-cappill tm-cappill--${capStatus}"><span>CAP</span><span>${fmtWage(capUsed)} / ${fmtWage(effectiveCap)}</span></span>`;

    // Split offers into two sections by their rosterId membership:
    //   freeAgentRows — players in state.career.freeAgents
    //   poachRows     — contracted players in their final 12 months at another club (Reg 7)
    // openSigningWindow seeds both into market.offers; UI just splits.
    const pendingMovesSet = new Set(state.career.pendingMoves.map(m => m.rosterId));
    const allRows = availableOffers
      .map(offer => {
        const p = state.career.roster[offer.rosterId];
        if (!p) return null;
        return { offer, p };
      })
      .filter((x): x is { offer: TransferOffer; p: Player } => x !== null)
      .sort((a, b) => {
        const cmp = compare(a, b, calendarDate);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    const freeAgentRows = allRows.filter(r => freeAgentSet.has(r.p.rosterId));
    const poachRows = allRows.filter(r => !freeAgentSet.has(r.p.rosterId));

    const renderRow = (offer: TransferOffer, p: Player, action: 'sign' | 'poach'): string => {
      const age = getAge(p.dob, calendarDate);
      const ovr = playerOverall(p.baseStats, p.position);
      const wouldExceedCap = capUsed + offer.annualWage > effectiveCap;
      const pending = pendingMovesSet.has(p.rosterId);
      const buttonLabel = pending
        ? 'Pre-Agreed ✓'
        : action === 'sign'
          ? (wouldExceedCap ? 'Sign (over cap)' : 'Sign')
          : (wouldExceedCap ? 'Pre-Agree (over cap)' : 'Pre-Agree');
      const buttonClass = `tm-sign${wouldExceedCap ? ' tm-sign--warn' : ''}${pending ? ' tm-sign--pending' : ''}`;
      const ariaLabel = pending
        ? `Pre-agreed for ${p.firstName} ${p.lastName}`
        : `${action === 'sign' ? 'Sign' : 'Pre-agree'} ${p.firstName} ${p.lastName}`;
      const currentClub = action === 'poach'
        ? `<span class="tm-from">← ${teamsById.get(p.contract.clubId)?.shortName ?? p.contract.clubId}</span>`
        : '';
      return `
        <div class="tm-row" data-roster-id="${p.rosterId}">
          <span class="tm-name">${p.firstName} ${p.lastName}${currentClub}</span>
          <span class="tm-pos">${shortPos(p.position)}</span>
          <span class="tm-num">${age ?? '—'}</span>
          <span class="tm-num">${ovr}</span>
          <span class="tm-wage">${fmtWage(offer.annualWage)} <span class="tm-len">× ${offer.lengthYears}y</span></span>
          <button class="${buttonClass}" data-${action}="${p.rosterId}"${pending ? ' disabled' : ''} aria-label="${ariaLabel}">${buttonLabel}</button>
        </div>`;
    };

    const freeAgentHtml = freeAgentRows.length === 0
      ? '<div class="tm-empty">No free agents available this off-season.</div>'
      : freeAgentRows.map(({ p, offer }) => renderRow(offer, p, 'sign')).join('');

    const poachHtml = poachRows.length === 0
      ? '<div class="tm-empty tm-empty--small">No contracted players in their final 12 months at other clubs.</div>'
      : poachRows.map(({ p, offer }) => renderRow(offer, p, 'poach')).join('');

    const headerCell = (key: SortKey, label: string, cls: string): string => {
      const active = key === sortKey;
      const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '';
      return `<button class="tm-head ${cls}${active ? ' tm-head--active' : ''}" data-sort="${key}">${label}${arrow ? ` ${arrow}` : ''}</button>`;
    };

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Transfer Market</span>
          ${capPill}
        </div>
        <div class="app-eyebrow">${team.name} · ${freeAgentRows.length} free agents · ${poachRows.length} approachable</div>
      </div>

      <h3 class="tm-section-h">Free Agents</h3>
      <div id="tm-headrow">
        ${headerCell('name', 'NAME', 'tm-name')}
        ${headerCell('pos',  'POS',  'tm-pos')}
        ${headerCell('age',  'AGE',  'tm-num')}
        ${headerCell('ovr',  'OVR',  'tm-num')}
        ${headerCell('wage', 'WAGE', 'tm-wage')}
        <span class="tm-head tm-sign-col">ACTION</span>
      </div>
      <div id="tm-list">${freeAgentHtml}</div>

      <h3 class="tm-section-h tm-section-h--poach">Final-12-Month Contracts (Reg 7 Pre-Agreement)</h3>
      <div id="tm-poach-list">${poachHtml}</div>

      <div id="tm-footer">
        <button id="tm-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelectorAll<HTMLButtonElement>('.tm-head[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort as SortKey;
        if (key === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = key; sortDir = defaultDirFor(key); }
        render();
      });
    });
    el!.querySelectorAll<HTMLButtonElement>('.tm-sign[data-sign]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = Number(btn.dataset.sign);
        if (!Number.isFinite(rid)) return;
        gameEngine.signFreeAgent(rid);
        render();
      });
    });
    el!.querySelectorAll<HTMLButtonElement>('.tm-sign[data-poach]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = Number(btn.dataset.poach);
        if (!Number.isFinite(rid)) return;
        gameEngine.preAgreePoach(rid);
        render();
      });
    });
    el!.querySelector<HTMLButtonElement>('#tm-continue')!.addEventListener('click', () => activeOnContinue());
  }

  renderImpl = render;
}

function defaultDirFor(key: SortKey): SortDir {
  return key === 'name' || key === 'pos' ? 'asc' : 'desc';
}

function compare(
  a: { offer: TransferOffer; p: Player },
  b: { offer: TransferOffer; p: Player },
  calendarDate: string,
): number {
  switch (sortKey) {
    case 'name':
      return `${a.p.lastName} ${a.p.firstName}`.localeCompare(`${b.p.lastName} ${b.p.firstName}`);
    case 'pos':
      return a.p.position.localeCompare(b.p.position);
    case 'age': {
      const aa = getAge(a.p.dob, calendarDate) ?? 999;
      const bb = getAge(b.p.dob, calendarDate) ?? 999;
      return aa - bb;
    }
    case 'ovr':
      return playerOverall(a.p.baseStats, a.p.position) - playerOverall(b.p.baseStats, b.p.position);
    case 'wage':
      return a.offer.annualWage - b.offer.annualWage;
  }
}
