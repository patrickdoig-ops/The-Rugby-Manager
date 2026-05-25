// Two-mode screen:
//
// 1. 'signings' (off-season). Reached from RenewalsScreen's Continue
//    CTA. openSigningWindow has pre-computed one TransferOffer per
//    free agent + poach candidate on state.career.market. Reading
//    from the cached offers — rather than calling signingTermsFor
//    per render — keeps rngTransfer stable across re-renders.
//
// 2. 'scouting' (mid-season). Reached from the Hub Transfers tile.
//    state.career.market is null. Rows are derived live from
//    state.career.freeAgents + poachCandidates(state), with no
//    Sign / Pre-Agree buttons. We deliberately do NOT call
//    signingTermsFor here — it advances rngTransfer and would
//    perturb the next signing window's offers. Current wage +
//    contract expiry stand in as cost hints.
//
// Module-level setter pattern (matches RenewalsScreen / RolloverScreen).

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { Player } from '../types/player';
import type { TransferOffer } from '../types/gameState';
import { playerOverall } from '../engine/RatingEngine';
import { getAge } from '../game/age';
import { poachCandidates } from './../game/aiTransferDirector';
import { showToast } from './Toast';

type SortKey = 'name' | 'pos' | 'age' | 'ovr' | 'wage';
type SortDir = 'asc' | 'desc';
type Mode = 'signings' | 'signings-preseason' | 'scouting';

let sortKey: SortKey = 'ovr';
let sortDir: SortDir = 'desc';
let mode: Mode = 'signings';
let activeOnSubmit: () => void = () => {};
let activeOnFinish: () => void = () => {};
let scoutingOnBack: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showTransferMarket(onSubmit: () => void, onFinish: () => void): void {
  mode = 'signings';
  activeOnSubmit = onSubmit;
  activeOnFinish = onFinish;
  renderImpl?.();
}

export function showTransferMarketPreSeason(onSubmit: () => void, onFinish: () => void): void {
  mode = 'signings-preseason';
  activeOnSubmit = onSubmit;
  activeOnFinish = onFinish;
  renderImpl?.();
}

export function showTransferMarketScouting(onBack: () => void): void {
  mode = 'scouting';
  scoutingOnBack = onBack;
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
    if (!team || !club) return;

    if (mode === 'scouting') {
      renderScouting(state, team, club, playerClubId);
      return;
    }

    const market = state.career.market;
    if (!market || market.phase !== 'signings') {
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
      el!.querySelector<HTMLButtonElement>('#tm-continue')!.addEventListener('click', () => activeOnFinish());
      return;
    }

    const calendarDate = state.calendar.date;
    const freeAgentSet = new Set(state.career.freeAgents);
    const pendingMovesSet = new Set(state.career.pendingMoves.map(m => m.rosterId));
    const userSquadSet = new Set(club.squad);
    // User's currently-pending bids (the ones reserving budget).
    const userBidRosterIds = new Set(
      market.bids
        .filter(b => b.clubId === playerClubId && b.status === 'pending' && b.kind !== 'retention')
        .map(b => b.rosterId),
    );

    // Cap projection includes already-signed free agents (live on the
    // squad through their CONTRACT_SIGNED), pre-agreed poach wages (on
    // pendingMoves), AND pending bids reserved against the budget.
    // Mirrors clubBudgetUsage on the engine side.
    const liveSquadCap = club.squad
      .map(rid => state.career.roster[rid])
      .filter(p => p && !p.contract.isMarquee)
      .reduce((sum, p) => sum + p!.contract.annualWage, 0);
    const pendingPoachCap = state.career.pendingMoves
      .filter(m => m.toClubId === playerClubId)
      .reduce((sum, m) => sum + m.annualWage, 0);
    const pendingBidsCap = market.bids
      .filter(b => b.clubId === playerClubId && b.status === 'pending' && b.kind !== 'retention')
      .reduce((sum, b) => sum + b.annualWage, 0);
    const capUsed = liveSquadCap + pendingPoachCap + pendingBidsCap;
    // The pill is the owner-set salaryBudget (cap-relevant total). The
    // league's effective cap sits above as a hard ceiling no budget
    // exceeds, so showing the smaller number is the right user signal.
    const budgetCap = club.salaryBudget;
    const capStatus =
      capUsed > budgetCap ? 'over' :
      capUsed > budgetCap * 0.95 ? 'tight' :
      'ok';
    const capPill = `<span class="tm-cappill tm-cappill--${capStatus}"><span>BUDGET</span><span>${fmtWage(capUsed)} / ${fmtWage(budgetCap)}</span></span>`;

    // Split offers into two sections by their fromClubId:
    //   free-agent offers (fromClubId === '') — user can Sign / Undo
    //   poach offers (fromClubId !== '')      — user can Pre-Agree / Undo
    // Show every pending offer so already-signed / already-pre-agreed
    // rows render an Undo button; the membership sets above drive the
    // per-row button state.
    // Drop rows for players who are no longer available after prior
    // resolution rounds:
    //   - FA offers: signed by anyone (user OR a rival AI) — they're
    //     out of state.career.freeAgents.
    //   - Poach offers: pre-agreed by anyone — they're now in
    //     state.career.pendingMoves, the deal is locked, no further
    //     bidding allowed in this window.
    // Without this filter the row would still render (the cached
    // offer stays `status: 'pending'` until MARKET_CLOSED), and Make
    // Offer would silently no-op because submitBid rejects players
    // who aren't FA / poach-eligible.
    const allRows = market.offers
      .filter(o => o.status === 'pending')
      .map(offer => {
        const p = state.career.roster[offer.rosterId];
        if (!p) return null;
        const isPoach = offer.fromClubId !== '';
        if (isPoach) {
          if (pendingMovesSet.has(offer.rosterId)) return null;
        } else {
          if (!freeAgentSet.has(offer.rosterId)) return null;
        }
        return { offer, p };
      })
      .filter((x): x is { offer: TransferOffer; p: Player } => x !== null)
      .sort((a, b) => {
        const cmp = compare(a, b, calendarDate);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    const freeAgentRows = allRows.filter(r => r.offer.fromClubId === '');
    const poachRows = allRows.filter(r => r.offer.fromClubId !== '');

    const renderRow = (offer: TransferOffer, p: Player, action: 'sign' | 'poach'): string => {
      const age = getAge(p.dob, calendarDate);
      const ovr = playerOverall(p.baseStats, p.position);
      // "Committed" no longer means signed — under the bid model it means
      // the user has a pending bid for this player (reserving budget,
      // awaiting resolution). Resolved winners get filtered out below
      // (they're on the squad / pendingMoves, no longer in offers as
      // pending), so this only fires for bids still in play.
      const alreadySigned = action === 'sign' && userSquadSet.has(p.rosterId) && !freeAgentSet.has(p.rosterId);
      const alreadyPreAgreed = action === 'poach' && pendingMovesSet.has(p.rosterId);
      const alreadyWon = alreadySigned || alreadyPreAgreed;
      const hasPendingBid = userBidRosterIds.has(p.rosterId);
      // Budget warning: only fires for NEW bids (existing pending bids
      // already reserve their wage; withdrawing never breaches budget).
      const wouldExceedCap = !hasPendingBid && !alreadyWon && (capUsed + offer.annualWage > budgetCap);
      // Button states:
      //   - "Make Offer" — no bid yet, can afford
      //   - "Make Offer" (warn class) — no bid yet, would breach budget
      //   - "Withdraw" — pending bid by user, awaiting resolution
      //   - "Signed" / "Pre-Agreed" — already won at a prior resolution
      //     (read-only chip; row is faded)
      let buttonLabel: string;
      let buttonClass: string;
      let dataAttr: string;
      let ariaLabel: string;
      if (alreadyWon) {
        buttonLabel = action === 'sign' ? 'Signed' : 'Pre-Agreed';
        buttonClass = 'tm-sign tm-sign--won';
        dataAttr = `data-won="${p.rosterId}"`;
        ariaLabel = `${action === 'sign' ? 'Signed' : 'Pre-agreed'} ${p.firstName} ${p.lastName}`;
      } else if (hasPendingBid) {
        buttonLabel = 'Withdraw';
        buttonClass = 'tm-sign tm-sign--undo';
        dataAttr = `data-withdraw="${p.rosterId}"`;
        ariaLabel = `Withdraw offer for ${p.firstName} ${p.lastName}`;
      } else {
        buttonLabel = 'Make Offer';
        buttonClass = `tm-sign${wouldExceedCap ? ' tm-sign--warn' : ''}`;
        dataAttr = `data-bid="${p.rosterId}"`;
        ariaLabel = `Make offer for ${p.firstName} ${p.lastName}${wouldExceedCap ? ' (over budget)' : ''}`;
      }
      const committedClass = hasPendingBid || alreadyWon ? ' tm-row--committed' : '';
      const currentClub = action === 'poach'
        ? `<span class="tm-from">← ${teamsById.get(offer.fromClubId)?.shortName ?? offer.fromClubId}</span>`
        : '';
      return `
        <div class="tm-row${committedClass}" data-roster-id="${p.rosterId}">
          <span class="tm-name">${p.firstName} ${p.lastName}${currentClub}</span>
          <span class="tm-pos">${shortPos(p.position)}</span>
          <span class="tm-num">${age ?? '—'}</span>
          <span class="tm-num">${ovr}</span>
          <span class="tm-wage">${fmtWage(offer.annualWage)} <span class="tm-len">× ${offer.lengthYears}y</span></span>
          <button class="${buttonClass}" ${dataAttr} aria-label="${ariaLabel}"${alreadyWon ? ' disabled' : ''}>${buttonLabel}</button>
        </div>`;
    };

    const freeAgentHtml = freeAgentRows.length === 0
      ? `<div class="empty-state">
           <svg class="empty-state__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
             <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
           </svg>
           <div class="empty-state__title">No free agents available</div>
           <div class="empty-state__desc">Check back after the next round of fixtures — new players become available as contracts expire across the league.</div>
         </div>`
      : freeAgentRows.map(({ p, offer }) => renderRow(offer, p, 'sign')).join('');

    const poachHtml = poachRows.length === 0
      ? '<div class="tm-empty tm-empty--small">No contracted players in their final 12 months at other clubs.</div>'
      : poachRows.map(({ p, offer }) => renderRow(offer, p, 'poach')).join('');

    const headerCell = (key: SortKey, label: string, cls: string): string => {
      const active = key === sortKey;
      const arrowSvg = active
        ? (sortDir === 'asc'
            ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-left:3px"><path d="m18 15-6-6-6 6"/></svg>`
            : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-left:3px"><path d="m6 9 6 6 6-6"/></svg>`)
        : '';
      return `<button class="tm-head ${cls}${active ? ' tm-head--active' : ''}" data-sort="${key}">${label}${arrowSvg}</button>`;
    };

    const isPreSeason = mode === 'signings-preseason';
    const title = isPreSeason ? 'Pre-Season' : 'Transfer Market';
    const eyebrowText = isPreSeason
      ? `${team.name} · ${freeAgentRows.length} free agents · build your squad for Round 1`
      : `${team.name} · ${freeAgentRows.length} free agents · ${poachRows.length} approachable`;

    // Preserve scroll position across re-render. Clicking Sign / Undo
    // triggers a full re-render; without this the list jumps back to the
    // top, which is disorienting when the user has scrolled to a player
    // deep in the list.
    const prevListScroll = el!.querySelector<HTMLDivElement>('#tm-list')?.scrollTop ?? 0;
    const prevPoachScroll = el!.querySelector<HTMLDivElement>('#tm-poach-list')?.scrollTop ?? 0;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">${title}</span>
          ${capPill}
        </div>
        <div class="app-eyebrow">${eyebrowText}</div>
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

      ${isPreSeason ? '' : `
        <h3 class="tm-section-h tm-section-h--poach">Final-12-Month Contracts (Reg 7 Pre-Agreement)</h3>
        <div id="tm-poach-list">${poachHtml}</div>
      `}

      <div id="tm-footer">
        <button id="tm-finish" class="tm-footer-secondary" aria-label="Finish signing window">
          <span>Finish</span>
        </button>
        <button id="tm-submit" class="cta-pulse" ${userBidRosterIds.size === 0 ? 'disabled' : ''}>
          <span>${userBidRosterIds.size === 0 ? 'Submit offers' : `Submit ${userBidRosterIds.size} offer${userBidRosterIds.size === 1 ? '' : 's'}`}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    const newList = el!.querySelector<HTMLDivElement>('#tm-list');
    if (newList && prevListScroll) newList.scrollTop = prevListScroll;
    const newPoach = el!.querySelector<HTMLDivElement>('#tm-poach-list');
    if (newPoach && prevPoachScroll) newPoach.scrollTop = prevPoachScroll;

    el!.querySelectorAll<HTMLButtonElement>('.tm-head[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort as SortKey;
        if (key === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = key; sortDir = defaultDirFor(key); }
        render();
      });
    });
    el!.querySelectorAll<HTMLButtonElement>('.tm-sign[data-bid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = Number(btn.dataset.bid);
        if (!Number.isFinite(rid)) return;
        const p = gameEngine.getState().career.roster[rid];
        const ok = gameEngine.submitBid(rid);
        if (ok && p) showToast(`Offer made for ${p.firstName} ${p.lastName}`, 'info');
        render();
      });
    });
    el!.querySelectorAll<HTMLButtonElement>('.tm-sign[data-withdraw]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = Number(btn.dataset.withdraw);
        if (!Number.isFinite(rid)) return;
        gameEngine.withdrawBid(rid);
        render();
      });
    });
    el!.querySelector<HTMLButtonElement>('#tm-submit')!.addEventListener('click', () => activeOnSubmit());
    el!.querySelector<HTMLButtonElement>('#tm-finish')!.addEventListener('click', () => activeOnFinish());
  }

  // Mid-season scouting view. Read-only — no Sign / Pre-Agree buttons,
  // no rngTransfer consumption (current wage + expiry stand in as cost
  // hints). Calling signingTermsFor here would advance the transfer
  // stream and shift the next signing window's offers.
  function renderScouting(
    state: ReturnType<GameCoordinator['getState']>,
    team: RawTeamInput,
    club: { id: string; squad: number[]; salaryBudget: number },
    playerClubId: string,
  ): void {
    const calendarDate = state.calendar.date;
    const pendingSet = new Set(state.career.pendingMoves.map(m => m.rosterId));

    type ScoutItem = { p: Player; currentWage: number; expiresOn: string; kind: 'free-agent' | 'poach' };
    const items: ScoutItem[] = [];
    for (const rid of state.career.freeAgents) {
      const p = state.career.roster[rid];
      if (!p) continue;
      items.push({ p, currentWage: p.contract.annualWage, expiresOn: p.contract.expiresOn, kind: 'free-agent' });
    }
    for (const rid of poachCandidates(state)) {
      const p = state.career.roster[rid];
      if (!p) continue;
      if (p.contract.clubId === playerClubId) continue; // can't approach own squad
      if (pendingSet.has(rid)) continue; // already pre-agreed elsewhere
      items.push({ p, currentWage: p.contract.annualWage, expiresOn: p.contract.expiresOn, kind: 'poach' });
    }
    items.sort((a, b) => {
      const cmp = compareScout(a, b, calendarDate);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    const freeAgentRows = items.filter(it => it.kind === 'free-agent');
    const poachRows = items.filter(it => it.kind === 'poach');

    const capUsed = club.squad
      .map(rid => state.career.roster[rid])
      .filter((p): p is Player => !!p && !p.contract.isMarquee)
      .reduce((sum, p) => sum + p.contract.annualWage, 0);
    const budgetCap = club.salaryBudget;
    const capStatus =
      capUsed > budgetCap ? 'over' :
      capUsed > budgetCap * 0.95 ? 'tight' :
      'ok';
    const capPill = `<span class="tm-cappill tm-cappill--${capStatus}"><span>BUDGET</span><span>${fmtWage(capUsed)} / ${fmtWage(budgetCap)}</span></span>`;

    const renderScoutRow = (it: ScoutItem): string => {
      const age = getAge(it.p.dob, calendarDate);
      const ovr = playerOverall(it.p.baseStats, it.p.position);
      const clubLabel = it.kind === 'poach'
        ? `<span class="tm-from">← ${teamsById.get(it.p.contract.clubId)?.shortName ?? it.p.contract.clubId}</span>`
        : '<span class="tm-from">Free Agent</span>';
      return `
        <div class="tm-row" data-roster-id="${it.p.rosterId}">
          <span class="tm-name">${it.p.firstName} ${it.p.lastName}${clubLabel}</span>
          <span class="tm-pos">${shortPos(it.p.position)}</span>
          <span class="tm-num">${age ?? '—'}</span>
          <span class="tm-num">${ovr}</span>
          <span class="tm-wage">${fmtWage(it.currentWage)} <span class="tm-len">current</span></span>
        </div>`;
    };

    const freeAgentHtml = freeAgentRows.length === 0
      ? `<div class="empty-state">
           <svg class="empty-state__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
             <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
           </svg>
           <div class="empty-state__title">No free agents on the market</div>
           <div class="empty-state__desc">The market refreshes between seasons. Watch for contracts entering their final 12 months below.</div>
         </div>`
      : freeAgentRows.map(renderScoutRow).join('');
    const poachHtml = poachRows.length === 0
      ? '<div class="tm-empty tm-empty--small">No contracted players in their final 12 months at other clubs.</div>'
      : poachRows.map(renderScoutRow).join('');

    const headerCell = (key: SortKey, label: string, cls: string): string => {
      const active = key === sortKey;
      const arrowSvg = active
        ? (sortDir === 'asc'
            ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-left:3px"><path d="m18 15-6-6-6 6"/></svg>`
            : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-left:3px"><path d="m6 9 6 6 6-6"/></svg>`)
        : '';
      return `<button class="tm-head ${cls}${active ? ' tm-head--active' : ''}" data-sort="${key}">${label}${arrowSvg}</button>`;
    };

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="tm-back" class="app-back" aria-label="Back to hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Transfer Market</span>
          ${capPill}
        </div>
        <div class="app-eyebrow">${team.name} · ${freeAgentRows.length} free agents · ${poachRows.length} approachable</div>
      </div>

      <div class="tm-scout-banner">Scouting view — the signing window opens after the final round of the season. Wages shown are players' current deals.</div>

      <h3 class="tm-section-h">Free Agents</h3>
      <div id="tm-headrow">
        ${headerCell('name', 'NAME', 'tm-name')}
        ${headerCell('pos',  'POS',  'tm-pos')}
        ${headerCell('age',  'AGE',  'tm-num')}
        ${headerCell('ovr',  'OVR',  'tm-num')}
        ${headerCell('wage', 'WAGE', 'tm-wage')}
      </div>
      <div id="tm-list">${freeAgentHtml}</div>

      <h3 class="tm-section-h tm-section-h--poach">Final-12-Month Contracts (Reg 7 Approachable)</h3>
      <div id="tm-poach-list">${poachHtml}</div>
    `;

    el!.querySelectorAll<HTMLButtonElement>('.tm-head[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort as SortKey;
        if (key === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = key; sortDir = defaultDirFor(key); }
        renderImpl?.();
      });
    });
    el!.querySelector<HTMLButtonElement>('#tm-back')!.addEventListener('click', () => scoutingOnBack());
  }

  renderImpl = render;
}

function compareScout(
  a: { p: Player; currentWage: number },
  b: { p: Player; currentWage: number },
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
      return a.currentWage - b.currentWage;
  }
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
