// Three-mode screen:
//
// 1. 'signings' (off-season). Reached from RenewalsScreen's Continue
//    CTA. openSigningWindow has pre-computed one TransferOffer per
//    free agent + poach candidate on state.career.market. Competitive
//    bidding round-by-round.
//
// 2. 'signings-preseason' (Squad Builder). Same flow as 'signings',
//    FA-only (no Reg 7 in pre-season).
//
// 3. 'signings-midseason' (Hub → Transfers). User submits FA offers;
//    each is rolled against the appeal-score-based acceptance
//    probability. No AI competition, no Reg 7. Single round →
//    SigningResults → Hub.
//
// Module-level setter pattern (matches RenewalsScreen / RolloverScreen).

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { Player } from '../types/player';
import type { TransferOffer } from '../types/gameState';
import { playerOverall } from '../engine/RatingEngine';
import { getAge } from '../game/age';
import { showToast } from './Toast';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';
import { createRowExpander } from './components/rowExpand';
import { appealScore, weightedLeaguePosition } from '../game/signingResolver';
import { averageRating } from '../game/seasonLeaderboards';
import { APPEAL_WEIGHTS } from '../engine/balance/transfers';
import type { TransferBid, GameState } from '../types/gameState';

type SortKey = 'name' | 'pos' | 'age' | 'ovr' | 'wage';
type SortDir = 'asc' | 'desc';
type Mode = 'signings' | 'signings-preseason' | 'signings-midseason';
type Tab = 'free-agents' | 'poach';

let sortKey: SortKey = 'ovr';
let sortDir: SortDir = 'desc';
let mode: Mode = 'signings';
// Free Agents vs Reg 7 toggle. Persists across re-renders within the
// screen lifetime so submitting an offer doesn't bounce the user back
// to the FA tab. Reset to 'free-agents' on every show*() entry point
// since that's the most actionable starting view.
let activeTab: Tab = 'free-agents';
let activeOnSubmit: () => void = () => {};
let activeOnFinish: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showTransferMarket(onSubmit: () => void, onFinish: () => void): void {
  mode = 'signings';
  activeTab = 'free-agents';
  activeOnSubmit = onSubmit;
  activeOnFinish = onFinish;
  renderImpl?.();
}

export function showTransferMarketPreSeason(onSubmit: () => void, onFinish: () => void): void {
  mode = 'signings-preseason';
  activeTab = 'free-agents';
  activeOnSubmit = onSubmit;
  activeOnFinish = onFinish;
  renderImpl?.();
}

export function showTransferMarketMidseason(onSubmit: () => void, onFinish: () => void): void {
  mode = 'signings-midseason';
  activeTab = 'free-agents';
  activeOnSubmit = onSubmit;
  activeOnFinish = onFinish;
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
  // Tap player name → profile. Make-Offer / Withdraw / Cooldown
  // buttons are separate row children, so the row-stopping nature of
  // the player-link click doesn't reach them.
  onPlayerClick?: (rosterId: number) => void,
): void {
  const el = document.getElementById('transfer-market');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  // Per-row expand — keyed by rosterId. Only the row body opens the
  // panel; Make Offer / Withdraw / player-link clicks bypass the
  // controller via the standard button/.player-link rule in
  // rowExpand.ts.
  const expander = createRowExpander({
    rowSelector: '.tm-row',
    onChange: () => render(),
  });

  function render(): void {
    const gameEngine = getGameEngine();
    const state = gameEngine.getState();
    const playerClubId = state.player.teamId;
    const team = teamsById.get(playerClubId);
    const club = state.career.clubs.find(c => c.id === playerClubId);
    if (!team || !club) return;

    const market = state.career.market;
    const isSigningPhase = !!market && (market.phase === 'signings' || market.phase === 'signings-midseason');
    if (!market || !isSigningPhase) {
      el!.innerHTML = `
        <div class="app-header">
          <div class="app-topbar">
            <div class="app-topbar-spacer"></div>
            <span class="app-title">No Free Agents</span>
            <div class="app-topbar-spacer"></div>
          </div>
        </div>
        <div class="empty-state">
          <svg class="empty-state__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
          </svg>
          <div class="empty-state__title">No free agents available</div>
          <div class="empty-state__desc">Check back after the next round of fixtures — new players become available as contracts expire across the league.</div>
        </div>
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

    const isMidseason = market.phase === 'signings-midseason';
    const currentWeek = state.calendar.week;
    const renderRow = (offer: TransferOffer, p: Player, action: 'sign' | 'poach', index: number): string => {
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
      // Mid-season FA cooldown — a player who just declined the user's
      // offer is locked behind a "Not interested" chip until WEEK_ADVANCED
      // prunes the entry. Only applies mid-season (off-season has no
      // cooldown — the appealScore there is the gate).
      const cooldownLock = isMidseason
        && action === 'sign'
        && (state.career.midseasonRejections[p.rosterId] ?? 0) > currentWeek;
      // Budget warning: only fires for NEW bids (existing pending bids
      // already reserve their wage; withdrawing never breaches budget).
      const wouldExceedCap = !hasPendingBid && !alreadyWon && !cooldownLock
        && (capUsed + offer.annualWage > budgetCap);
      // Button states:
      //   - "Make Offer" — no bid yet, can afford
      //   - "Make Offer" (warn class) — no bid yet, would breach budget
      //   - "Withdraw" — pending bid by user, awaiting resolution
      //   - "Signed" / "Pre-Agreed" — already won at a prior resolution
      //     (read-only chip; row is faded)
      //   - "Not interested" — mid-season cooldown after a recent decline
      //     (disabled chip; row is faded)
      let buttonLabel: string;
      let buttonClass: string;
      let dataAttr: string;
      let ariaLabel: string;
      if (alreadyWon) {
        buttonLabel = action === 'sign' ? 'Signed' : 'Pre-Agreed';
        buttonClass = 'tm-sign tm-sign--won';
        dataAttr = `data-won="${p.rosterId}"`;
        ariaLabel = `${action === 'sign' ? 'Signed' : 'Pre-agreed'} ${p.firstName} ${p.lastName}`;
      } else if (cooldownLock) {
        buttonLabel = 'Not interested';
        buttonClass = 'tm-sign tm-sign--cooldown';
        dataAttr = `data-cooldown="${p.rosterId}"`;
        ariaLabel = `${p.firstName} ${p.lastName} declined recently — try again next round`;
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
      const committedClass = hasPendingBid || alreadyWon || cooldownLock ? ' tm-row--committed' : '';
      const currentClub = action === 'poach'
        ? `<span class="tm-from">← ${teamsById.get(offer.fromClubId)?.shortName ?? offer.fromClubId}</span>`
        : '';
      const nameInner = onPlayerClick
        ? playerLinkHtml(`${p.firstName} ${p.lastName}`, p.rosterId)
        : `${p.firstName} ${p.lastName}`;
      const rowDelay = Math.min(index, 16) * 25;
      const rowId = String(p.rosterId);
      const isExpanded = expander.isExpanded(rowId);
      const expandPanel = renderTmExpandPanel(state, p, offer, playerClubId, action);
      return `
        <div class="tm-row${committedClass}" data-row-id="${rowId}" style="--row-delay: ${rowDelay}ms">
          <div class="tm-row-main">
            <span class="tm-name">${nameInner}${currentClub}</span>
            <span class="tm-pos">${shortPos(p.position)}</span>
            <span class="tm-num">${age ?? '—'}</span>
            <span class="tm-num">${ovr}</span>
            <span class="tm-wage">${fmtWage(offer.annualWage)} <span class="tm-len">× ${offer.lengthYears}y</span></span>
            <button class="${buttonClass}" ${dataAttr} aria-label="${ariaLabel}"${alreadyWon || cooldownLock ? ' disabled' : ''}>${buttonLabel}</button>
          </div>
          <div class="row-expand-panel tm-expand" data-expanded="${isExpanded}">
            <div class="row-expand-inner"><div class="tm-expand-body">${expandPanel}</div></div>
          </div>
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
      : freeAgentRows.map(({ p, offer }, i) => renderRow(offer, p, 'sign', i)).join('');

    const poachHtml = poachRows.length === 0
      ? `<div class="empty-state">
          <svg class="empty-state__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
          </svg>
          <div class="empty-state__title">No final-12-month contracts around the league</div>
          <div class="empty-state__desc">Approachable players appear here when their current deal enters its last year.</div>
        </div>`
      : poachRows.map(({ p, offer }, i) => renderRow(offer, p, 'poach', i)).join('');

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
    const title = isPreSeason ? 'Pre-Season' : 'Transfers';
    const eyebrowText = isPreSeason
      ? `${freeAgentRows.length} free agents · build your squad for Round 1`
      : isMidseason
        ? `${freeAgentRows.length} free agents available`
        : `${freeAgentRows.length} free agents · ${poachRows.length} approachable`;

    // Preserve scroll position across re-render. Clicking Sign / Undo
    // triggers a full re-render; without this the list jumps back to the
    // top, which is disorienting when the user has scrolled to a player
    // deep in the list.
    const prevListScroll = el!.querySelector<HTMLDivElement>('#tm-list')?.scrollTop ?? 0;
    const prevPoachScroll = el!.querySelector<HTMLDivElement>('#tm-poach-list')?.scrollTop ?? 0;

    // Pre-season and mid-season have no Reg 7 section, so no toggle —
    // render the FA list straight. In a regular off-season signings
    // window both lists exist; the segmented toggle gates which is
    // visible.
    const showToggle = !isPreSeason && !isMidseason;
    const toggleHtml = showToggle ? `
      <div class="tm-toggle" role="tablist">
        <button class="tm-toggle__btn ${activeTab === 'free-agents' ? 'tm-toggle__btn--active' : ''}" data-tab="free-agents" role="tab" aria-selected="${activeTab === 'free-agents'}">Free Agents <span class="tm-toggle__count">${freeAgentRows.length}</span></button>
        <button class="tm-toggle__btn ${activeTab === 'poach' ? 'tm-toggle__btn--active' : ''}" data-tab="poach" role="tab" aria-selected="${activeTab === 'poach'}">Reg 7 <span class="tm-toggle__count">${poachRows.length}</span></button>
      </div>
    ` : '';

    const headerRow = `
      <div id="tm-headrow">
        ${headerCell('name', 'NAME', 'tm-name')}
        ${headerCell('pos',  'POS',  'tm-pos')}
        ${headerCell('age',  'AGE',  'tm-num')}
        ${headerCell('ovr',  'OVR',  'tm-num')}
        ${headerCell('wage', 'WAGE', 'tm-wage')}
        <span class="tm-head tm-sign-col">ACTION</span>
      </div>`;

    const showFA = !showToggle || activeTab === 'free-agents';
    const showPoach = showToggle && activeTab === 'poach';

    if (team) el!.style.setProperty('--team-color', team.color);
    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">${title}</span>
          ${capPill}
        </div>
        <div class="app-eyebrow">${eyebrowText}</div>
      </div>

      ${toggleHtml}

      ${showFA ? `
        ${headerRow}
        <div id="tm-list">${freeAgentHtml}</div>
      ` : ''}

      ${showPoach ? `
        ${headerRow}
        <div id="tm-poach-list">${poachHtml}</div>
      ` : ''}

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

    el!.querySelectorAll<HTMLButtonElement>('.tm-toggle__btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.tab as Tab;
        if (next === activeTab) return;
        activeTab = next;
        render();
      });
    });

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
        const isPoach = !!btn.closest('#tm-poach-list');
        const ok = gameEngine.submitBid(rid);
        if (ok && p) showToast(`Offer made for ${p.firstName} ${p.lastName}`, 'info');
        render();
        requestAnimationFrame(() => {
          const newRow = el!.querySelector<HTMLDivElement>(`.tm-row[data-roster-id="${rid}"]`);
          if (newRow && ok) {
            newRow.style.setProperty('--tm-tag-label', isPoach ? "'REG 7'" : "'OFFER'");
            newRow.style.setProperty('--tm-tag-color', isPoach ? 'var(--rm-stat-5)' : 'var(--rm-pitch)');
            newRow.classList.add('tm-row--just-signed');
            setTimeout(() => newRow.classList.add('tm-row--tag-fading'), 1400);
            setTimeout(() => newRow.classList.remove('tm-row--just-signed', 'tm-row--tag-fading'), 1900);
          }
        });
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

    if (onPlayerClick) wirePlayerLinks(el!, onPlayerClick);

    const list = el!.querySelector<HTMLElement>('#tm-list');
    if (list) expander.attach(list);
  }

  renderImpl = render;
}

// Expand panel for a target player: appeal score breakdown for the
// user's club + condition/injury + season stats + reputation bar.
// `appealScore` is the real resolver function from signingResolver.ts;
// we construct a hypothetical bid with the user's clubId so the score
// matches what an actual submitted bid would carry into the resolver.
function renderTmExpandPanel(
  state: GameState,
  p: Player,
  offer: TransferOffer,
  userClubId: string,
  action: 'sign' | 'poach',
): string {
  const hypotheticalBid: TransferBid = {
    id: `preview-${p.rosterId}-${userClubId}`,
    rosterId: p.rosterId,
    clubId: userClubId,
    annualWage: offer.annualWage,
    lengthYears: offer.lengthYears,
    kind: action === 'sign' ? 'free_agent' : 'poach',
    status: 'pending',
  };
  const appeal = appealScore(state, hypotheticalBid, p);

  // Per-term breakdown — mirror the resolver formula so the UI is a
  // faithful read of why this club appeals (or not). Read straight off
  // the same APPEAL_WEIGHTS the resolver uses.
  const club = state.career.clubs.find(c => c.id === userClubId);
  const squad = club?.squad ?? [];
  let ovrSum = 0;
  let ovrCount = 0;
  for (const rid of squad) {
    const sp = state.career.roster[rid];
    if (!sp) continue;
    ovrSum += playerOverall(sp.baseStats, sp.position);
    ovrCount += 1;
  }
  const squadAvgOvr = ovrCount > 0 ? ovrSum / ovrCount : 0;
  let positionCount = 0;
  for (const rid of squad) {
    const sp = state.career.roster[rid];
    if (sp && sp.position === p.position) positionCount += 1;
  }
  const positionShortage = Math.max(0, Math.min(3, APPEAL_WEIGHTS.needTargetPerPosition - positionCount));
  const lastSeasonPosition = weightedLeaguePosition(state, userClubId);
  const isCurrentClub = p.contract.clubId === userClubId;

  const ovrTerm = squadAvgOvr * APPEAL_WEIGHTS.ovrWeight;
  const needTerm = positionShortage * APPEAL_WEIGHTS.needWeight;
  const ambitionTerm = (5.5 - lastSeasonPosition) * APPEAL_WEIGHTS.ambitionWeight;
  const loyaltyTerm = isCurrentClub ? APPEAL_WEIGHTS.loyaltyBonus : 0;

  const ss = p.seasonStats;
  const avr = ss.appearances > 0 ? averageRating(ss) : null;
  const reputation = p.reputation ?? 50;
  const condition = Math.round(p.condition ?? 100);
  const injuryLine = p.injury
    ? `<div class="tm-expand-injury">Injured · ${p.injury.kind.replace(/_/g, ' ')} · ${p.injury.weeksRemaining}w</div>`
    : '';

  return `
    <div class="tm-expand-grid">
      <div class="tm-expand-block">
        <div class="tm-expand-label">YOUR APPEAL · ${appeal.toFixed(1)}</div>
        <div class="tm-appeal-rows">
          <div class="tm-appeal-row"><span>Squad strength</span><strong>${ovrTerm >= 0 ? '+' : ''}${ovrTerm.toFixed(1)}</strong></div>
          <div class="tm-appeal-row"><span>Position need</span><strong>${needTerm >= 0 ? '+' : ''}${needTerm.toFixed(1)}</strong></div>
          <div class="tm-appeal-row"><span>League standing</span><strong>${ambitionTerm >= 0 ? '+' : ''}${ambitionTerm.toFixed(1)}</strong></div>
          ${loyaltyTerm > 0 ? `<div class="tm-appeal-row"><span>Loyalty</span><strong>+${loyaltyTerm.toFixed(1)}</strong></div>` : ''}
        </div>
      </div>
      <div class="tm-expand-block">
        <div class="tm-expand-label">THIS SEASON</div>
        <div class="tm-stats-grid">
          <div class="tm-mini-stat"><span>${ss.appearances}</span><label>Apps</label></div>
          <div class="tm-mini-stat"><span>${ss.tries}</span><label>Tries</label></div>
          <div class="tm-mini-stat"><span>${ss.tackles}</span><label>Tackles</label></div>
          <div class="tm-mini-stat"><span>${avr !== null ? avr.toFixed(1) : '—'}</span><label>Avg rate</label></div>
        </div>
        ${injuryLine}
      </div>
      <div class="tm-expand-block tm-expand-bars">
        <div class="tm-bar-row">
          <div class="tm-bar-label">CONDITION</div>
          <div class="tm-bar"><div class="tm-bar-fill" style="width:${condition}%"></div></div>
          <div class="tm-bar-val">${condition}</div>
        </div>
        <div class="tm-bar-row">
          <div class="tm-bar-label">REPUTATION</div>
          <div class="tm-bar"><div class="tm-bar-fill tm-bar-fill--rep" style="width:${reputation}%"></div></div>
          <div class="tm-bar-val">${reputation}</div>
        </div>
      </div>
    </div>`;
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
