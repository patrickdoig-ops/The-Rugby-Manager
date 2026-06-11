import type { GameCoordinator } from '../game/GameCoordinator';
import type { GameState } from '../types/gameState';
import type { MoraleReason } from '../types/player';
import type { RawTeamInput } from '../types/teamData';
import { buildAssistantReport, type InboxItem } from '../game/inbox';
import { markRead } from './inboxRead';
import { loadDismissed, dismissItem } from './inboxDismiss';
import { swipeToDismiss } from './swipeToDismiss';
import { injectTeamColors } from './teamColors';
import { eventBus } from '../utils/eventBus';
import { helpButtonHtml } from './help/helpButton';
import { onScreenShow } from './ScreenRouter';
import { formatDateMedium } from '../utils/formatDate';

// ─── Conversation content keyed by morale reason ─────────────────────────────

const CHAT_LINES: Record<MoraleReason, { player: string; manager: string }> = {
  playing_time: {
    player: '"I want to be playing every week — that\'s why I\'m here."',
    manager: '"You\'re in my plans. Let\'s talk through your role going forward."',
  },
  unused_bench: {
    player: '"I\'m sitting on the bench every week without getting on."',
    manager: '"I hear you. Stay sharp — your opportunity is coming."',
  },
  bad_run: {
    player: '"Results haven\'t been going our way lately. It\'s tough on everyone."',
    manager: '"We\'ll turn this around. I need you focused and ready."',
  },
  broken_promise: {
    player: '"You said I\'d get more game time, and that hasn\'t happened."',
    manager: '"You\'re right to feel that way. Things are going to change."',
  },
  transfer_rejected: {
    player: '"I put that request in because I need a fresh challenge."',
    manager: '"I need you here. Let\'s see what we can do for you."',
  },
  loan: {
    player: '"Going out on loan wasn\'t what I wanted for my career."',
    manager: '"It\'s the right move for your development. I\'m still counting on you."',
  },
};
const CHAT_FALLBACK = {
  player: '"Things haven\'t been great for me recently."',
  manager: '"I appreciate you being open with me. Let\'s work through this together."',
};

function showChatModal(playerName: string, reason: MoraleReason | undefined, onConfirm: () => void): void {
  const lines = reason ? CHAT_LINES[reason] : CHAT_FALLBACK;
  const overlay = document.createElement('div');
  overlay.className = 'inbox-chat-overlay';
  overlay.innerHTML = `
    <div class="inbox-chat-modal">
      <div class="inbox-chat-name">${playerName}</div>
      <div class="inbox-chat-line inbox-chat-player">
        <span class="inbox-chat-who">Player</span>
        <span class="inbox-chat-text">${lines.player}</span>
      </div>
      <div class="inbox-chat-line inbox-chat-manager">
        <span class="inbox-chat-who">You</span>
        <span class="inbox-chat-text">${lines.manager}</span>
      </div>
      <button class="inbox-chat-close">Close</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.inbox-chat-close')!.addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
  // Tap outside the modal also closes.
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { overlay.remove(); onConfirm(); }
  });
}

export interface InitInboxScreenOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack:      () => void;
  onSquad:     () => void;
  onContracts: () => void;
  onTransfers: () => void;
  onFixtures:  () => void;
  onLeague:    () => void;
  onLoans:     () => void;
}

const CATEGORY_LABELS: Record<InboxItem['category'], string> = {
  league:    'League',
  medical:   'Treatment Room',
  transfers: 'Transfers',
  contracts: 'Contracts',
  match:     'Next Match',
  squad:     'Squad',
  media:     'Media',
};

// Called by goInbox() in main.ts when the user actively opens the screen.
// Marks all current items as read so the hub unread badge clears on next render.
let _markCurrentAsRead: (() => void) | undefined;
export function markInboxRead(): void {
  _markCurrentAsRead?.();
}

export function initInboxScreen(opts: InitInboxScreenOpts): void {
  const el = document.getElementById('inbox');
  if (!el) return;

  let lastState: GameState | null = null;
  let lastKey = '';

  function saveKey(state: GameState): string {
    return `${state.player.teamId}:${state.seed}`;
  }

  function attachSwipeDismiss(): void {
    swipeToDismiss(
      el!,
      '.inbox-item[data-item-id]',
      item => item.querySelector<HTMLElement>('.inbox-item-content'),
      item => {
        const id = item.dataset.itemId!;
        dismissItem(lastKey, id);
        markRead(lastKey, [id]);
        if (lastState) render(lastState);
      },
    );
  }

  function render(state: GameState): void {
    lastState = state;
    const key = saveKey(state);
    lastKey = key;

    const items = buildAssistantReport(state, opts.allTeams);
    const dismissed = loadDismissed(key);
    const visibleItems = items.filter(i => !dismissed.has(i.id));

    const playerTeam = opts.allTeams.find(t => t.id === state.player.teamId);
    if (playerTeam) injectTeamColors(el!, playerTeam);

    const byCategory = new Map<InboxItem['category'], InboxItem[]>();
    for (const item of visibleItems) {
      if (!byCategory.has(item.category)) byCategory.set(item.category, []);
      byCategory.get(item.category)!.push(item);
    }

    const deepLinkHandlers: Record<NonNullable<InboxItem['deepLink']>, () => void> = {
      squad:     opts.onSquad,
      contracts: opts.onContracts,
      transfers: opts.onTransfers,
      fixtures:  opts.onFixtures,
      league:    opts.onLeague,
      loans:     opts.onLoans,
    };

    const deepLinkLabels: Record<NonNullable<InboxItem['deepLink']>, string> = {
      squad:     'Go to Squad',
      contracts: 'Go to Contracts',
      transfers: 'Review Transfers',
      fixtures:  'View Fixtures',
      league:    'League Table',
      loans:     'Loan Management',
    };

    const DISMISS_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

    let rowIndex = 0;
    const sectionsHtml = visibleItems.length === 0
      ? `<div class="empty-state">
          <svg class="empty-state__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <div class="empty-state__title">All clear</div>
          <div class="empty-state__desc">Nothing to report. Injury news, contract alerts, and tactical notes will appear here.</div>
        </div>`
      : [...byCategory.entries()].map(([cat, catItems]) => `
          <div class="inbox-section">
            <div class="inbox-section-heading">${CATEGORY_LABELS[cat]}</div>
            ${catItems.map(item => {
              const delay = Math.min(rowIndex++, 16) * 25;
              return `
                <div class="inbox-item inbox-item--${item.category}" style="--row-delay:${delay}ms" data-item-id="${item.id}">
                  <div class="inbox-item-dismiss-bg" aria-hidden="true">${DISMISS_ICON}</div>
                  <div class="inbox-item-content">
                    <div class="inbox-item-subject">${item.subject}</div>
                    <div class="inbox-item-body">${item.body}</div>
                    ${item.counselAction
                      ? `<button class="inbox-counsel" data-rosterid="${item.counselAction.rosterId}">Speak to Player</button>`
                      : item.moraleBoostAction
                        ? `<div class="inbox-actions">
                             <button class="inbox-morale-boost" data-rosterid="${item.moraleBoostAction.rosterId}">Have a Chat</button>
                             ${item.deepLink ? `<button class="inbox-deeplink" data-link="${item.deepLink}">${deepLinkLabels[item.deepLink]}</button>` : ''}
                           </div>`
                        : item.transferRequestAction
                          ? `<div class="inbox-actions inbox-transfer-actions">
                               <button class="inbox-transfer-promise" data-rosterid="${item.transferRequestAction.rosterId}">Promise game time</button>
                               <button class="inbox-transfer-grant" data-rosterid="${item.transferRequestAction.rosterId}">Grant request</button>
                               <button class="inbox-transfer-reject" data-rosterid="${item.transferRequestAction.rosterId}">Reject</button>
                             </div>`
                          : item.deepLink ? `<button class="inbox-deeplink" data-link="${item.deepLink}">${deepLinkLabels[item.deepLink]}</button>` : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>
        `).join('');

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="inbox-back" class="app-back" aria-label="Back to hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Inbox</span>
          <div class="app-topbar-spacer">${helpButtonHtml('inbox')}</div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · ${formatDateMedium(state.calendar.date)}</div>
      </div>
      <div class="inbox-body">
        ${sectionsHtml}
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#inbox-back')!.addEventListener('click', () => opts.onBack());
    el!.querySelectorAll<HTMLButtonElement>('.inbox-deeplink').forEach(btn => {
      const link = btn.dataset.link as NonNullable<InboxItem['deepLink']>;
      btn.addEventListener('click', () => deepLinkHandlers[link]?.());
    });

    el!.querySelectorAll<HTMLButtonElement>('.inbox-counsel').forEach(btn => {
      const rosterId = Number(btn.dataset.rosterid);
      btn.addEventListener('click', () => {
        const engine = opts.getGameEngine();
        engine.counselPlayer(rosterId);
        render(engine.getState());
      });
    });

    el!.querySelectorAll<HTMLButtonElement>('.inbox-morale-boost').forEach(btn => {
      const rosterId = Number(btn.dataset.rosterid);
      btn.addEventListener('click', () => {
        const engine = opts.getGameEngine();
        const state = engine.getState();
        const player = Object.values(state.career.roster).find(p => p?.rosterId === rosterId);
        showChatModal(
          player ? `${player.firstName} ${player.lastName}` : 'Player',
          player?.moraleNote?.reason,
          () => { engine.boostPlayerMorale(rosterId); render(engine.getState()); },
        );
      });
    });

    el!.querySelectorAll<HTMLButtonElement>('.inbox-transfer-promise').forEach(btn => {
      const rosterId = Number(btn.dataset.rosterid);
      btn.addEventListener('click', () => {
        const engine = opts.getGameEngine();
        engine.makePlayingTimePromise(rosterId);
        render(engine.getState());
      });
    });

    el!.querySelectorAll<HTMLButtonElement>('.inbox-transfer-grant').forEach(btn => {
      const rosterId = Number(btn.dataset.rosterid);
      btn.addEventListener('click', () => {
        const engine = opts.getGameEngine();
        engine.grantTransferRequest(rosterId);
        render(engine.getState());
      });
    });

    el!.querySelectorAll<HTMLButtonElement>('.inbox-transfer-reject').forEach(btn => {
      const rosterId = Number(btn.dataset.rosterid);
      btn.addEventListener('click', () => {
        const engine = opts.getGameEngine();
        engine.rejectTransferRequest(rosterId);
        render(engine.getState());
      });
    });

    attachSwipeDismiss();

    // _markCurrentAsRead seals all items (including dismissed) so the badge
    // clears correctly when the user opens the inbox.
    _markCurrentAsRead = () => markRead(key, items.map(i => i.id));
  }

  // Hidden-screen renders are deferred: mark dirty and replay on the next
  // inbox show (rendering a hidden screen on every game:* event is wasted
  // innerHTML churn).
  let needsRender = false;
  const renderOrDefer = (state: GameState): void => {
    if (el.offsetParent !== null) {
      render(state);
    } else {
      lastState = state;
      needsRender = true;
    }
  };
  eventBus.on('game:initialized',     ({ state }) => renderOrDefer(state));
  eventBus.on('game:fixtureRecorded', ({ state }) => renderOrDefer(state));
  eventBus.on('game:weekAdvanced',    ({ state }) => renderOrDefer(state));
  eventBus.on('game:trainingApplied', ({ state }) => renderOrDefer(state));
  eventBus.on('game:bracketSeeded',   ({ state }) => renderOrDefer(state));
  eventBus.on('game:playoffsUpdated', ({ state }) => renderOrDefer(state));
  onScreenShow(id => {
    if (id === 'inbox' && needsRender && lastState) {
      needsRender = false;
      render(lastState);
    }
  });

  render(opts.getGameEngine().getState());
}
