import { VERSION } from '../version';
import { loadSave, clearSave } from './SaveManager';
import type { RawTeamInput } from '../types/teamData';
import type { SavedSeason, SavedSeasonResult } from '../game/GameCoordinator';
import { PREMIERSHIP_2025_26 } from '../data/fixtures-2025-26';

// Experimental — set to true once a full light-mode pass is done across
// every screen-specific CSS file. SettingsScreen.ts gates its Display
// section behind a matching constant; flip both to enable.
const LIGHT_MODE_EXPERIMENTAL = false;

const THEME_KEY = 'rugby-manager-theme';

function sunIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>`;
}

function moonIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;
}

function syncThemeBtn(btn: HTMLButtonElement): void {
  const light = document.body.classList.contains('light-mode');
  btn.innerHTML = light ? moonIcon() : sunIcon();
  btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
  btn.setAttribute('aria-pressed', light ? 'true' : 'false');
}

function pitchLinesSvg(): string {
  return `<svg class="home-pitch-lines" aria-hidden="true" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="lineFadeV" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="white" stop-opacity="0"/>
        <stop offset="45%" stop-color="white" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="lineFadeH" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"  stop-color="white" stop-opacity="0"/>
        <stop offset="50%" stop-color="white" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="195" y1="0"   x2="195" y2="844" stroke="url(#lineFadeV)" stroke-width="0.8"/>
    <line x1="0"   y1="211" x2="390" y2="211" stroke="url(#lineFadeH)" stroke-width="0.6"/>
    <line x1="0"   y1="633" x2="390" y2="633" stroke="url(#lineFadeH)" stroke-width="0.6"/>
    <circle cx="195" cy="422" r="90" stroke="url(#lineFadeV)" stroke-width="0.8" fill="none"/>
  </svg>`;
}

function arrowIcon(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 5l7 7-7 7"/>
  </svg>`;
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// Approximate league standings from saved fixture results. The save's
// SavedSeasonResult only carries scores (not tries), so we omit the
// 4-try bonus that real standings include. Wins/draws/losing-bonus are
// faithful, so the rank is correct in the typical case and at most a
// position or two off when bonus-try points cluster — fine for a teaser.
interface SimpleStanding {
  teamId: string;
  pts: number;
  pf: number;
  pa: number;
}

function approximateStandings(teamIds: string[], results: SavedSeasonResult[]): SimpleStanding[] {
  const map = new Map<string, SimpleStanding>(
    teamIds.map(id => [id, { teamId: id, pts: 0, pf: 0, pa: 0 }]),
  );
  for (const r of results) {
    const home = map.get(r.homeId);
    const away = map.get(r.awayId);
    if (!home || !away) continue;
    home.pf += r.homeScore;  home.pa += r.awayScore;
    away.pf += r.awayScore;  away.pa += r.homeScore;
    const margin = Math.abs(r.homeScore - r.awayScore);
    if (r.homeScore > r.awayScore) {
      home.pts += 4;
      if (margin <= 7) away.pts += 1;
    } else if (r.awayScore > r.homeScore) {
      away.pts += 4;
      if (margin <= 7) home.pts += 1;
    } else {
      home.pts += 2;
      away.pts += 2;
    }
  }
  return [...map.values()].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    return (b.pf - b.pa) - (a.pf - a.pa);
  });
}

interface SaveContext {
  teamName: string;
  week: number;
  totalRounds: number;
  rank: number;
  pts: number;
}

function buildSaveContext(save: SavedSeason, allTeams: RawTeamInput[]): SaveContext | null {
  const team = allTeams.find(t => t.id === save.playerTeamId);
  if (!team) return null;
  const totalRounds = (save.fixtures ?? PREMIERSHIP_2025_26.fixtures)
    .reduce((m, f) => Math.max(m, f.round), 0);
  const standings = approximateStandings(allTeams.map(t => t.id), save.results);
  const rankIdx = standings.findIndex(s => s.teamId === save.playerTeamId);
  const player = rankIdx >= 0 ? standings[rankIdx] : null;
  return {
    teamName: team.shortName,
    week: save.currentWeek,
    totalRounds,
    rank: rankIdx + 1,
    pts: player?.pts ?? 0,
  };
}

function confirmModalHtml(ctx: SaveContext): string {
  return `
    <div class="home-confirm-backdrop" id="home-confirm-backdrop">
      <div class="home-confirm">
        <div class="home-confirm-title">Start New Game?</div>
        <div class="home-confirm-body">This will permanently delete your save — ${ctx.teamName}, Week ${ctx.week}${ctx.rank > 0 ? `, ${ctx.rank}${ordinalSuffix(ctx.rank)} place` : ''}. This cannot be undone.</div>
        <div class="home-confirm-actions">
          <button class="home-confirm-btn home-confirm-cancel" id="home-confirm-cancel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            Cancel
          </button>
          <button class="home-confirm-btn home-confirm-proceed" id="home-confirm-proceed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m4.5 12.75 6 6 9-13.5"/></svg>
            New Game
          </button>
        </div>
      </div>
    </div>
  `;
}

function gearIcon(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`;
}

export function initHomeScreen(
  onStart: () => void,
  onContinue: () => void,
  onSettings: () => void,
  allTeams: RawTeamInput[] = [],
): void {
  const el = document.getElementById('home-screen');
  if (!el) return;

  // Restore the user's preferred theme from the previous session.
  // While the experimental flag is OFF we force-clear any previously
  // stored "light" preference so users who toggled it earlier aren't
  // stranded on a half-finished light theme.
  if (!LIGHT_MODE_EXPERIMENTAL && localStorage.getItem(THEME_KEY) === 'light') {
    localStorage.removeItem(THEME_KEY);
    document.body.classList.remove('light-mode');
  } else if (LIGHT_MODE_EXPERIMENTAL && localStorage.getItem(THEME_KEY) === 'light') {
    document.body.classList.add('light-mode');
  }

  const save = loadSave();
  const hasSave = save !== null;
  const ctx = save ? buildSaveContext(save, allTeams) : null;

  el.innerHTML = `
    ${pitchLinesSvg()}

    <div id="home-chrome">
      <div id="home-status">
        <span class="home-live-dot"></span>
        <span class="home-status-text">2025/26 Season</span>
      </div>
      <div id="home-chrome-actions">
        ${LIGHT_MODE_EXPERIMENTAL ? '<button id="theme-toggle"></button>' : ''}
        <button id="settings-btn" aria-label="Settings">${gearIcon()}</button>
      </div>
    </div>

    <div id="home-hero">
      <div class="home-eyebrow">&#9658;&nbsp; A Simulated Rugby Season</div>
      <h1 id="home-title">Rugby<br>Manager</h1>
      <div class="home-version-row">
        <span class="home-version-badge">v${VERSION}</span>
        <span class="home-version-hr"></span>
      </div>
      <p id="home-tagline">
        <strong>Build your squad. Call the shots.</strong>
        Every phase, every decision, every point.
      </p>
    </div>

    <div id="home-cta">
      <button id="start-game-btn" class="cta-pulse">
        <span class="btn-label">Start New Game</span>
        ${arrowIcon()}
      </button>
      <button id="continue-game-btn"${hasSave ? '' : ' disabled'} class="${hasSave ? '' : 'home-cta--disabled'}">
        <div class="continue-btn-row">
          <span class="btn-label">Continue</span>
          ${arrowIcon()}
        </div>
        ${ctx ? `<span class="home-save-context">${ctx.teamName} · Wk ${ctx.week} / ${ctx.totalRounds}${ctx.rank > 0 ? ` · ${ctx.rank}${ordinalSuffix(ctx.rank)}` : ''} · ${ctx.pts} pts</span>` : ''}
      </button>
    </div>
  `;

  if (LIGHT_MODE_EXPERIMENTAL) {
    const themeBtn = el.querySelector<HTMLButtonElement>('#theme-toggle')!;
    syncThemeBtn(themeBtn);

    themeBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
      localStorage.setItem(THEME_KEY, document.body.classList.contains('light-mode') ? 'light' : 'dark');
      syncThemeBtn(themeBtn);
    });
  }

  el.querySelector<HTMLButtonElement>('#start-game-btn')!.addEventListener('click', () => {
    if (hasSave && ctx) {
      // Mount the confirmation overlay; it removes itself on either action.
      el.insertAdjacentHTML('beforeend', confirmModalHtml(ctx));
      const backdrop = el.querySelector<HTMLDivElement>('#home-confirm-backdrop')!;
      const cleanup = (): void => backdrop.remove();
      backdrop.querySelector<HTMLButtonElement>('#home-confirm-cancel')!
        .addEventListener('click', cleanup);
      backdrop.querySelector<HTMLButtonElement>('#home-confirm-proceed')!
        .addEventListener('click', () => {
          clearSave();
          cleanup();
          onStart();
        });
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) cleanup();
      });
    } else {
      onStart();
    }
  });

  el.querySelector<HTMLButtonElement>('#settings-btn')!.addEventListener('click', () => {
    onSettings();
  });

  const continueBtn = el.querySelector<HTMLButtonElement>('#continue-game-btn')!;
  continueBtn.addEventListener('click', () => {
    if (continueBtn.disabled) return;
    onContinue();
  });
}
