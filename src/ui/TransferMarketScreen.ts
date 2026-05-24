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
import { SENIOR_CAP, EFFECTIVE_CAP_CREDITS } from '../engine/balance/transfers';
import { getAge } from '../game/age';
import { poachCandidates } from './../game/aiTransferDirector';

type SortKey = 'name' | 'pos' | 'age' | 'ovr' | 'wage';
type SortDir = 'asc' | 'desc';
type Mode = 'signings' | 'signings-preseason' | 'scouting';

let sortKey: SortKey = 'ovr';
let sortDir: SortDir = 'desc';
let mode: Mode = 'signings';
let activeOnContinue: () => void = () => {};
let scoutingOnBack: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showTransferMarket(onContinue: () => void): void {
  mode = 'signings';
  activeOnContinue = onContinue;
  renderImpl?.();
}

export function showTransferMarketPreSeason(onContinue: () => void): void {
  mode = 'signings-preseason';
  activeOnContinue = onContinue;
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
      el!.querySelector<HTMLButtonElement>('#tm-continue')!.addEventListener('click', () => activeOnContinue());
      return;
    }

    const calendarDate = state.calendar.date;
    const freeAgentSet = new Set(state.career.freeAgents);
    const pendingMovesSet = new Set(state.career.pendingMoves.map(m => m.rosterId));
    const userSquadSet = new Set(club.squad);

    // Cap projection includes already-signed free agents (live on the
    // squad through their CONTRACT_SIGNED) AND pre-agreed poach wages
    // (live on pendingMoves but not yet on the squad — they'd otherwise
    // sneak past the pill until activation at rollover).
    const liveSquadCap = club.squad
      .map(rid => state.career.roster[rid])
      .filter(p => p && !p.contract.isMarquee)
      .reduce((sum, p) => sum + p!.contract.annualWage, 0);
    const pendingPoachCap = state.career.pendingMoves
      .filter(m => m.toClubId === playerClubId)
      .reduce((sum, m) => sum + m.annualWage, 0);
    const capUsed = liveSquadCap + pendingPoachCap;
    const effectiveCap = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;
    const capStatus =
      capUsed > effectiveCap ? 'over' :
      capUsed > effectiveCap * 0.95 ? 'tight' :
      'ok';
    const capPill = `<span class="tm-cappill tm-cappill--${capStatus}"><span>CAP</span><span>${fmtWage(capUsed)} / ${fmtWage(effectiveCap)}</span></span>`;

    // Split offers into two sections by their fromClubId:
    //   free-agent offers (fromClubId === '') — user can Sign / Undo
    //   poach offers (fromClubId !== '')      — user can Pre-Agree / Undo
    // Show every pending offer so already-signed / already-pre-agreed
    // rows render an Undo button; the membership sets above drive the
    // per-row button state.
    const allRows = market.offers
      .filter(o => o.status === 'pending')
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
    const freeAgentRows = allRows.filter(r => r.offer.fromClubId === '');
    const poachRows = allRows.filter(r => r.offer.fromClubId !== '');

    const renderRow = (offer: TransferOffer, p: Player, action: 'sign' | 'poach'): string => {
      const age = getAge(p.dob, calendarDate);
      const ovr = playerOverall(p.baseStats, p.position);
      const signed = action === 'sign' && userSquadSet.has(p.rosterId) && !freeAgentSet.has(p.rosterId);
      const preAgreed = action === 'poach' && pendingMovesSet.has(p.rosterId);
      const committed = signed || preAgreed;
      // Cap-warning only applies to NEW commitments — undoing never
      // pushes cap up.
      const wouldExceedCap = !committed && (capUsed + offer.annualWage > effectiveCap);
      const buttonLabel = signed
        ? 'Undo Sign'
        : preAgreed
          ? 'Undo Pre-Agree'
          : action === 'sign'
            ? (wouldExceedCap ? 'Sign (over cap)' : 'Sign')
            : (wouldExceedCap ? 'Pre-Agree (over cap)' : 'Pre-Agree');
      const buttonClass = `tm-sign${wouldExceedCap ? ' tm-sign--warn' : ''}${committed ? ' tm-sign--undo' : ''}`;
      const dataAttr = committed
        ? (signed ? `data-unsign="${p.rosterId}"` : `data-cancel="${p.rosterId}"`)
        : `data-${action}="${p.rosterId}"`;
      const ariaLabel = committed
        ? `${signed ? 'Undo signing of' : 'Cancel pre-agreement for'} ${p.firstName} ${p.lastName}`
        : `${action === 'sign' ? 'Sign' : 'Pre-agree'} ${p.firstName} ${p.lastName}`;
      const currentClub = action === 'poach'
        ? `<span class="tm-from">← ${teamsById.get(offer.fromClubId)?.shortName ?? offer.fromClubId}</span>`
        : '';
      return `
        <div class="tm-row${committed ? ' tm-row--committed' : ''}" data-roster-id="${p.rosterId}">
          <span class="tm-name">${p.firstName} ${p.lastName}${currentClub}</span>
          <span class="tm-pos">${shortPos(p.position)}</span>
          <span class="tm-num">${age ?? '—'}</span>
          <span class="tm-num">${ovr}</span>
          <span class="tm-wage">${fmtWage(offer.annualWage)} <span class="tm-len">× ${offer.lengthYears}y</span></span>
          <button class="${buttonClass}" ${dataAttr} aria-label="${ariaLabel}">${buttonLabel}</button>
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

    const isPreSeason = mode === 'signings-preseason';
    const title = isPreSeason ? 'Pre-Season' : 'Transfer Market';
    const eyebrowText = isPreSeason
      ? `${team.name} · ${freeAgentRows.length} free agents · build your squad for Round 1`
      : `${team.name} · ${freeAgentRows.length} free agents · ${poachRows.length} approachable`;

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
    el!.querySelectorAll<HTMLButtonElement>('.tm-sign[data-unsign]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = Number(btn.dataset.unsign);
        if (!Number.isFinite(rid)) return;
        gameEngine.unsignFreeAgent(rid);
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
    el!.querySelectorAll<HTMLButtonElement>('.tm-sign[data-cancel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = Number(btn.dataset.cancel);
        if (!Number.isFinite(rid)) return;
        gameEngine.cancelPreAgreement(rid);
        render();
      });
    });
    el!.querySelector<HTMLButtonElement>('#tm-continue')!.addEventListener('click', () => activeOnContinue());
  }

  // Mid-season scouting view. Read-only — no Sign / Pre-Agree buttons,
  // no rngTransfer consumption (current wage + expiry stand in as cost
  // hints). Calling signingTermsFor here would advance the transfer
  // stream and shift the next signing window's offers.
  function renderScouting(
    state: ReturnType<GameCoordinator['getState']>,
    team: RawTeamInput,
    club: { id: string; squad: number[] },
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
    const effectiveCap = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;
    const capStatus =
      capUsed > effectiveCap ? 'over' :
      capUsed > effectiveCap * 0.95 ? 'tight' :
      'ok';
    const capPill = `<span class="tm-cappill tm-cappill--${capStatus}"><span>CAP</span><span>${fmtWage(capUsed)} / ${fmtWage(effectiveCap)}</span></span>`;

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
      ? '<div class="tm-empty tm-empty--small">No free agents on the market.</div>'
      : freeAgentRows.map(renderScoutRow).join('');
    const poachHtml = poachRows.length === 0
      ? '<div class="tm-empty tm-empty--small">No contracted players in their final 12 months at other clubs.</div>'
      : poachRows.map(renderScoutRow).join('');

    const headerCell = (key: SortKey, label: string, cls: string): string => {
      const active = key === sortKey;
      const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '';
      return `<button class="tm-head ${cls}${active ? ' tm-head--active' : ''}" data-sort="${key}">${label}${arrow ? ` ${arrow}` : ''}</button>`;
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
