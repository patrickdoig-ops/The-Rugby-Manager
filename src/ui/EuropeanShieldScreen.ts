// European Shield screen — pool tables, fixtures and knockout bracket.
// Stub: renders a coming-soon placeholder until Phase 5 is complete.

import type { GameCoordinator } from '../game/GameCoordinator';

export interface InitEuropeanShieldScreenOpts {
  getGameEngine: () => GameCoordinator;
  onBack: () => void;
}

export function initEuropeanShieldScreen(opts: InitEuropeanShieldScreenOpts): void {
  const el = document.getElementById('european-shield');
  if (!el) return;

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="es-back" class="app-back" aria-label="Back to competitions">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Competitions</span>
        </button>
        <span class="app-title">European Shield</span>
        <div class="app-topbar-spacer"></div>
      </div>
    </div>
    <div style="padding:2rem;text-align:center;color:var(--color-chalk-dim)">Coming soon</div>
  `;

  el.querySelector<HTMLButtonElement>('#es-back')!.addEventListener('click', () => opts.onBack());
}
