// Achievements list. Reached from the Hub's Achievements tile; back navigates
// to Hub. Read-only — the AchievementEngine owns unlocking. Renders the catalog
// grouped by category (Match / Season / Career), unlocked rows highlighted and
// locked rows dimmed with their description as the hint to chase.
//
// Initialised once per page lifetime alongside the other in-season screens.
// Re-reads the unlocked store on every render so a just-popped toast is
// reflected when the screen is next opened. On native a "View in Game Centre"
// button surfaces the system overlay.

import { ACHIEVEMENTS, type AchievementCategory, type AchievementDef } from '../achievements/achievementDefs';
import { loadUnlocked } from '../achievements/achievementStore';
import { getGameCenter, gameCenterAvailable } from '../achievements/GameCenterBridge';

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  match:  'Match',
  season: 'Season',
  career: 'Career',
};
const CATEGORY_ORDER: AchievementCategory[] = ['match', 'season', 'career'];

const TROPHY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"/></svg>`;
const LOCK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>`;

let renderImpl: (() => void) | null = null;

export function initAchievementsScreen(onBack: () => void): void {
  const el = document.getElementById('achievements');
  if (!el) return;

  function rowHtml(def: AchievementDef, unlocked: boolean): string {
    const icon = unlocked ? TROPHY_ICON : LOCK_ICON;
    return `
      <div class="ach-row${unlocked ? ' ach-row--unlocked' : ''}">
        <div class="ach-icon">${icon}</div>
        <div class="ach-body">
          <div class="ach-title">${def.title}</div>
          <div class="ach-desc">${def.description}</div>
        </div>
        ${unlocked ? '<div class="ach-check" aria-label="Unlocked"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg></div>' : ''}
      </div>`;
  }

  function render(): void {
    const unlocked = loadUnlocked();
    const total = ACHIEVEMENTS.length;
    const earned = ACHIEVEMENTS.filter(a => a.id in unlocked).length;

    const sections = CATEGORY_ORDER.map(cat => {
      const defs = ACHIEVEMENTS.filter(a => a.category === cat);
      if (defs.length === 0) return '';
      const rows = defs.map(d => rowHtml(d, d.id in unlocked)).join('');
      return `
        <div class="ach-section">
          <div class="ach-section-label">${CATEGORY_LABELS[cat]}</div>
          ${rows}
        </div>`;
    }).join('');

    const gcButton = gameCenterAvailable()
      ? `<button id="ach-gc-btn" class="ach-gc-btn">View in Game Centre</button>`
      : '';

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="ach-back" class="app-back" aria-label="Back to hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Achievements</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${earned} / ${total} unlocked</div>
      </div>

      <div id="ach-list">
        ${sections}
        ${gcButton}
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#ach-back')!.addEventListener('click', () => onBack());
    el!.querySelector<HTMLButtonElement>('#ach-gc-btn')?.addEventListener('click', () => {
      void getGameCenter().showAchievements();
    });
  }

  renderImpl = render;
  render();
}

// Re-render from the live unlocked store. Called by the nav handler before
// showing the screen so a just-unlocked achievement is reflected.
export function showAchievements(): void {
  renderImpl?.();
}
