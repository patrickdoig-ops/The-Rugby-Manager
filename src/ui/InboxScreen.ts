import type { GameCoordinator } from '../game/GameCoordinator';
import type { GameState } from '../types/gameState';
import type { RawTeamInput } from '../types/teamData';
import { buildAssistantReport, type InboxItem } from '../game/inbox';
import { markRead } from './inboxRead';
import { loadDismissed, dismissItem } from './inboxDismiss';
import { injectTeamColors } from './teamColors';
import { eventBus } from '../utils/eventBus';

export interface InitInboxScreenOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack:      () => void;
  onSquad:     () => void;
  onContracts: () => void;
  onTransfers: () => void;
  onFixtures:  () => void;
  onLeague:    () => void;
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
    el!.querySelectorAll<HTMLElement>('.inbox-item[data-item-id]').forEach(item => {
      const id = item.dataset.itemId!;
      const content = item.querySelector<HTMLElement>('.inbox-item-content');
      if (!content) return;

      let startX = 0, startY = 0, active = false, isH = false;

      item.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        active = true; isH = false;
        content.style.transition = 'none';
      }, { passive: true });

      item.addEventListener('touchmove', e => {
        if (!active) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (!isH) {
          if (Math.abs(dy) > Math.abs(dx) + 3) {
            active = false;
            content.style.transition = '';
            return;
          }
          if (Math.abs(dx) < 6) return;
          isH = true;
        }
        content.style.transform = `translateX(${Math.min(0, dx)}px)`;
      }, { passive: true });

      const onEnd = () => {
        if (!active || !isH) { active = false; return; }
        active = false;
        const tx = parseFloat(content.style.transform.match(/-?\d+(?:\.\d+)?/)?.[0] ?? '0');
        content.style.transition = 'transform 0.22s ease';
        if (tx < -(item.offsetWidth * 0.38)) {
          content.style.transform = `translateX(-${item.offsetWidth + 4}px)`;
          setTimeout(() => {
            dismissItem(lastKey, id);
            markRead(lastKey, [id]);
            if (lastState) render(lastState);
          }, 220);
        } else {
          content.style.transform = 'translateX(0)';
        }
      };
      item.addEventListener('touchend', onEnd);
      item.addEventListener('touchcancel', onEnd);
    });
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
    };

    const deepLinkLabels: Record<NonNullable<InboxItem['deepLink']>, string> = {
      squad:     'Go to Squad',
      contracts: 'Go to Contracts',
      transfers: 'Review Transfers',
      fixtures:  'View Fixtures',
      league:    'League Table',
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
                    ${item.deepLink ? `<button class="inbox-deeplink" data-link="${item.deepLink}">${deepLinkLabels[item.deepLink]}</button>` : ''}
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
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week}</div>
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

    attachSwipeDismiss();

    // _markCurrentAsRead seals all items (including dismissed) so the badge
    // clears correctly when the user opens the inbox.
    _markCurrentAsRead = () => markRead(key, items.map(i => i.id));
  }

  eventBus.on('game:initialized',     ({ state }) => render(state));
  eventBus.on('game:fixtureRecorded', ({ state }) => render(state));
  eventBus.on('game:weekAdvanced',    ({ state }) => render(state));
  eventBus.on('game:trainingApplied', ({ state }) => render(state));
  eventBus.on('game:bracketSeeded',   ({ state }) => render(state));
  eventBus.on('game:playoffsUpdated', ({ state }) => render(state));

  render(opts.getGameEngine().getState());
}
