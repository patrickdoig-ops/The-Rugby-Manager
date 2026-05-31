import type { GameCoordinator } from '../game/GameCoordinator';
import type { GameState } from '../types/gameState';
import type { RawTeamInput } from '../types/teamData';
import { buildAssistantReport, type InboxItem } from '../game/inbox';
import { markRead } from './inboxRead';
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
};

export function initInboxScreen(opts: InitInboxScreenOpts): void {
  const el = document.getElementById('inbox');
  if (!el) return;

  function saveKey(state: GameState): string {
    return `${state.player.teamId}:${state.seed}`;
  }

  function render(state: GameState): void {
    const items = buildAssistantReport(state, opts.allTeams);
    const key = saveKey(state);
    markRead(key, items.map(i => i.id));

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

    const sectionsHtml = items.length === 0
      ? `<p class="inbox-empty">No new updates from your assistant.</p>`
      : [...byCategory.entries()].map(([cat, catItems]) => `
          <div class="inbox-section">
            <h3 class="inbox-section-heading">${CATEGORY_LABELS[cat]}</h3>
            ${catItems.map(item => `
              <div class="inbox-item">
                <div class="inbox-item-subject">${item.subject}</div>
                <div class="inbox-item-body">${item.body}</div>
                ${item.deepLink ? `<button class="inbox-deeplink" data-link="${item.deepLink}">${deepLinkLabels[item.deepLink]}</button>` : ''}
              </div>
            `).join('')}
          </div>
        `).join('');

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="inbox-back" class="app-back" aria-label="Back to hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Assistant's Report</span>
          <div class="app-topbar-spacer"></div>
        </div>
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
  }

  eventBus.on('game:initialized',     ({ state }) => render(state));
  eventBus.on('game:fixtureRecorded', ({ state }) => render(state));
  eventBus.on('game:weekAdvanced',    ({ state }) => render(state));
  eventBus.on('game:bracketSeeded',   ({ state }) => render(state));
  eventBus.on('game:playoffsUpdated', ({ state }) => render(state));
}
