import type { GameCoordinator } from '../game/GameCoordinator';
import type { GameState } from '../types/gameState';
import type { RawTeamInput } from '../types/teamData';
import { buildAssistantReport, type InboxItem } from '../game/inbox';
import { markRead } from './inboxRead';
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

  function saveKey(state: GameState): string {
    return `${state.player.teamId}:${state.seed}`;
  }

  function render(state: GameState): void {
    const items = buildAssistantReport(state, opts.allTeams);

    const playerTeam = opts.allTeams.find(t => t.id === state.player.teamId);
    if (playerTeam) injectTeamColors(el!, playerTeam);

    const byCategory = new Map<InboxItem['category'], InboxItem[]>();
    for (const item of items) {
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

    let rowIndex = 0;
    const sectionsHtml = items.length === 0
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
                <div class="inbox-item inbox-item--${item.category}" style="--row-delay:${delay}ms">
                  <div class="inbox-item-subject">${item.subject}</div>
                  <div class="inbox-item-body">${item.body}</div>
                  ${item.deepLink ? `<button class="inbox-deeplink" data-link="${item.deepLink}">${deepLinkLabels[item.deepLink]}</button>` : ''}
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

    // Update the mark-read closure so it always seals the current item set.
    const key = saveKey(state);
    const ids = items.map(i => i.id);
    _markCurrentAsRead = () => markRead(key, ids);
  }

  eventBus.on('game:initialized',     ({ state }) => render(state));
  eventBus.on('game:fixtureRecorded', ({ state }) => render(state));
  eventBus.on('game:weekAdvanced',    ({ state }) => render(state));
  eventBus.on('game:trainingApplied', ({ state }) => render(state));
  eventBus.on('game:bracketSeeded',   ({ state }) => render(state));
  eventBus.on('game:playoffsUpdated', ({ state }) => render(state));

  render(opts.getGameEngine().getState());
}
