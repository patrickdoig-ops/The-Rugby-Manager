// In-season Club sub-menu. Reached from the Hub's Club tile.
// Two tiles → Board Confidence, Staff — same layout as ContractsTransfersMenuScreen.
//
// Initialised once per page lifetime. showClubMenu() re-renders fresh
// state on every visit.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { injectTeamColors } from './teamColors';

export interface InitClubMenuOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
  onBoardConfidence: () => void;
  onStaff: () => void;
  onFinances: () => void;
}

const ICONS = {
  board: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>`,
  staff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.193.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"/></svg>`,
  finances: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"/></svg>`,
};

interface TileSpec {
  id: string;
  label: string;
  sub: string;
  ariaLabel: string;
  iconKey: keyof typeof ICONS;
  handlerKey: 'onBoardConfidence' | 'onStaff' | 'onFinances';
}

const TILES: TileSpec[] = [
  { id: 'cm-tile-board',     label: 'Board',    sub: 'Owner confidence & objectives', ariaLabel: 'Board Confidence', iconKey: 'board',    handlerKey: 'onBoardConfidence' },
  { id: 'cm-tile-staff',     label: 'Staff',    sub: 'Hire & manage coaching staff',  ariaLabel: 'Staff',            iconKey: 'staff',    handlerKey: 'onStaff' },
  { id: 'cm-tile-finances',  label: 'Finances', sub: 'Budget & salary overview',      ariaLabel: 'Finances',         iconKey: 'finances', handlerKey: 'onFinances' },
];

let _opts: InitClubMenuOpts | null = null;
let _teamsById: Map<string, RawTeamInput> = new Map();

export function showClubMenu(): void {
  const el = document.getElementById('club-menu');
  if (!el || !_opts) return;
  const opts = _opts;
  const state = opts.getGameEngine().getState();
  const playerTeam = _teamsById.get(state.player.teamId);
  if (!playerTeam) return;

  const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="cm-back" class="app-back" aria-label="Back to hub">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Hub</span>
        </button>
        <span class="app-title">Club</span>
        <div class="app-topbar-spacer"></div>
      </div>
      <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week} / ${totalRounds}</div>
    </div>

    <div id="ctm-grid">
      ${TILES.map(t => `
        <button id="${t.id}" class="hub-tile" aria-label="${t.ariaLabel}">
          ${ICONS[t.iconKey]}
          <span class="hub-tile-label">${t.label}</span>
          <span class="hub-tile-sub">${t.sub}</span>
        </button>`).join('')}
    </div>
  `;

  injectTeamColors(el, playerTeam);

  el.querySelector<HTMLButtonElement>('#cm-back')!.addEventListener('click', () => opts.onBack());
  for (const t of TILES) {
    el.querySelector<HTMLButtonElement>(`#${t.id}`)!.addEventListener('click', () => opts[t.handlerKey]());
  }
}

export function initClubMenuScreen(opts: InitClubMenuOpts): void {
  _opts = opts;
  _teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
}
