// Competitions sub-menu. Reached from the Hub's Competitions tile.
// Four tiles → League, League Cup, European Cup, European Shield.
// Back arrow returns to Hub. Each leaf's back arrow returns here.
//
// Initialised once per page lifetime, like the other in-season screens.

import type { GameCoordinator } from '../game/GameCoordinator';
import { formatDateMedium } from '../utils/formatDate';
import { helpButtonHtml } from './help/helpButton';

export interface InitCompetitionsMenuOpts {
  getGameEngine: () => GameCoordinator;
  onBack: () => void;
  onLeague: () => void;
  onCup: () => void;
  onEuropeanCup: () => void;
  onEuropeanShield: () => void;
}

const ICONS = {
  league: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"/></svg>`,
  cup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"/></svg>`,
  european: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253M3 12a8.959 8.959 0 011.284-4.582m0 0A11.953 11.953 0 0112 10.5c2.998 0 5.74-1.1 7.843-2.918"/></svg>`,
};

interface TileSpec {
  id: string;
  label: string;
  sub: string;
  ariaLabel: string;
  iconKey: keyof typeof ICONS;
  handlerKey: 'onLeague' | 'onCup' | 'onEuropeanCup' | 'onEuropeanShield';
}

const TILES: TileSpec[] = [
  { id: 'cm-tile-league',          label: 'League',           sub: 'Table & stats',          ariaLabel: 'League',          iconKey: 'league',   handlerKey: 'onLeague' },
  { id: 'cm-tile-cup',             label: 'League Cup',       sub: 'Pools & knockouts',      ariaLabel: 'League Cup',      iconKey: 'cup',      handlerKey: 'onCup' },
  { id: 'cm-tile-european-cup',    label: 'European Cup',     sub: 'Pools & knockouts',      ariaLabel: 'European Cup',    iconKey: 'european', handlerKey: 'onEuropeanCup' },
  { id: 'cm-tile-european-shield', label: 'European Shield',  sub: 'Pools & knockouts',      ariaLabel: 'European Shield', iconKey: 'european', handlerKey: 'onEuropeanShield' },
];

export function initCompetitionsMenuScreen(opts: InitCompetitionsMenuOpts): void {
  const el = document.getElementById('competitions-menu');
  if (!el) return;

  function render(): void {
    const state = opts.getGameEngine().getState();
    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="cm-back" class="app-back" aria-label="Back to hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Competitions</span>
          <div class="app-topbar-spacer">${helpButtonHtml('competitions-menu')}</div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · ${formatDateMedium(state.calendar.date)}</div>
      </div>

      <div id="cm-grid">
        ${TILES.map(t => `
          <button id="${t.id}" class="hub-tile" aria-label="${t.ariaLabel}">
            ${ICONS[t.iconKey]}
            <span class="hub-tile-label">${t.label}</span>
            <span class="hub-tile-sub">${t.sub}</span>
          </button>
        `).join('')}
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#cm-back')!.addEventListener('click', () => opts.onBack());
    for (const t of TILES) {
      el!.querySelector<HTMLButtonElement>(`#${t.id}`)!.addEventListener('click', () => opts[t.handlerKey]());
    }
  }

  render();
}
