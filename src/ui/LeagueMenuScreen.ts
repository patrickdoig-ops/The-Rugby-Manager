// In-season league sub-menu. Reached from the Hub's League tile.
// Three tiles → League Table (existing), Team Statistics (new), Player
// Statistics (new). Pure navigation surface — no state of its own.
//
// Back arrow returns to Hub. Each leaf's back arrow returns here.
//
// Initialised once per page lifetime, like the other in-season screens.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { sortStandings } from '../game/leagueTable';
import { injectTeamColors } from './teamColors';
import { formatDateMedium } from '../utils/formatDate';
import { helpButtonHtml } from './help/helpButton';

export interface InitLeagueMenuOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
  onTable: () => void;
  onTeamStats: () => void;
  onPlayerStats: () => void;
  onAchievements: () => void;
  onFixtures: () => void;
}

// Heroicons outline 28×28 — same source family as HubScreen so the visual
// language is identical between this and the parent Hub.
const ICONS = {
  table: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5"/></svg>`,
  team:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>`,
  player:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>`,
  achievements: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"/></svg>`,
  cup:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"/></svg>`,
  fixtures:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z"/></svg>`,
};

interface TileSpec {
  id: string;
  label: string;
  sub: string;
  ariaLabel: string;
  iconKey: keyof typeof ICONS;
  handlerKey: 'onTable' | 'onTeamStats' | 'onPlayerStats' | 'onAchievements' | 'onFixtures';
}

const TILES: TileSpec[] = [
  { id: 'lm-tile-table',        label: 'League Table',  sub: 'Standings & form',      ariaLabel: 'League table',      iconKey: 'table',        handlerKey: 'onTable' },
  { id: 'lm-tile-fixtures',     label: 'Fixtures',      sub: 'Season schedule',       ariaLabel: 'Fixtures',          iconKey: 'fixtures',     handlerKey: 'onFixtures' },
  { id: 'lm-tile-team',         label: 'Team Stats',    sub: 'Attack, defence, kick', ariaLabel: 'Team statistics',   iconKey: 'team',         handlerKey: 'onTeamStats' },
  { id: 'lm-tile-player',       label: 'Player Stats',  sub: 'Top 10 leaderboards',   ariaLabel: 'Player statistics', iconKey: 'player',       handlerKey: 'onPlayerStats' },
  { id: 'lm-tile-achievements', label: 'Awards',        sub: 'Career milestones',     ariaLabel: 'Achievements',      iconKey: 'achievements', handlerKey: 'onAchievements' },
];

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

let renderImpl: (() => void) | null = null;

export function showLeagueMenuScreen(): void {
  renderImpl?.();
}

export function initLeagueMenuScreen(opts: InitLeagueMenuOpts): void {
  const el = document.getElementById('league-menu');
  if (!el) return;

  const teamsById = new Map(opts.allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = opts.getGameEngine().getState();
    const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
    const pct = totalRounds > 0 ? (state.calendar.week / totalRounds) * 100 : 0;

    const playerTeam = teamsById.get(state.player.teamId);
    const sorted = sortStandings(state.league.standings);
    const rankIdx = playerTeam ? sorted.findIndex(s => s.teamId === playerTeam.id) : -1;
    const standing = rankIdx >= 0 ? sorted[rankIdx] : null;
    const rank = rankIdx + 1;
    const posColor = playerTeam?.color ?? 'var(--rm-pitch)';

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="lm-back" class="app-back" aria-label="Back to competitions">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Competitions</span>
          </button>
          <span class="app-title">League</span>
          <div class="app-topbar-spacer">${helpButtonHtml('league-menu')}</div>
        </div>
        <div id="lm-standing-bar">
          <div id="lm-standing">
            <div class="hub-standing-item">
              <span class="hub-standing-val" style="color:${posColor}">${rank > 0 ? rank + ordinalSuffix(rank) : '—'}</span>
              <span class="hub-standing-label">Position</span>
            </div>
            <div class="hub-standing-item">
              <span class="hub-standing-val hub-standing-val--chalk">${standing?.leaguePoints ?? 0}</span>
              <span class="hub-standing-label">Points</span>
            </div>
            <div class="hub-standing-item">
              <span class="hub-standing-val hub-standing-val--chalk hub-standing-val--record">${standing?.won ?? 0}W–${standing?.lost ?? 0}L</span>
              <span class="hub-standing-label">Record</span>
            </div>
          </div>
          <div id="lm-progress-wrap">
            <span class="hub-progress-wk">${formatDateMedium(state.calendar.date)}</span>
            <div id="lm-progress"><div id="lm-progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
            <span class="hub-progress-total">R${totalRounds}</span>
          </div>
        </div>
      </div>

      <div id="lm-grid">
        ${TILES.map(t => `
          <button id="${t.id}" class="hub-tile" aria-label="${t.ariaLabel}">
            ${ICONS[t.iconKey]}
            <span class="hub-tile-label">${t.label}</span>
            <span class="hub-tile-sub">${t.sub}</span>
          </button>
        `).join('')}
      </div>
    `;

    if (playerTeam) injectTeamColors(el!, playerTeam);

    el!.querySelector<HTMLButtonElement>('#lm-back')!.addEventListener('click', () => opts.onBack());
    for (const t of TILES) {
      el!.querySelector<HTMLButtonElement>(`#${t.id}`)!.addEventListener('click', () => opts[t.handlerKey]());
    }
  }

  renderImpl = render;
  render();
}
