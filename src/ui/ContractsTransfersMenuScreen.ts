// In-season Contracts & Transfers sub-menu. Reached from the Hub tile.
// Two tiles → Contracts (existing), Transfers/Transfer Market (existing).
// Badges on each tile surface expiring-contract count and poach-threat count
// respectively. Uses club colours (injectTeamColors) matching the leaf screens.
//
// Initialised once per page lifetime. showContractsTransfersMenu() re-renders
// fresh state on every visit (badges must be up-to-date).

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { GameState } from '../types/gameState';
import { injectTeamColors } from './teamColors';
import { EXPIRING_CONTRACT_WINDOW_MONTHS } from '../engine/balance/transfers';

export interface InitContractsTransfersMenuOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
  onContracts: () => void;
  onTransfers: () => void;
  onScouting: () => void;
}

const ICONS = {
  contracts: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>`,
  transfers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>`,
  scouting:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
};

interface TileSpec {
  id: string;
  label: string;
  sub: string;
  ariaLabel: string;
  iconKey: keyof typeof ICONS;
  handlerKey: 'onContracts' | 'onTransfers' | 'onScouting';
}

const TILES: TileSpec[] = [
  { id: 'ctm-tile-contracts', label: 'Contracts', sub: 'Squad deals & renewals', ariaLabel: 'Contracts',       iconKey: 'contracts', handlerKey: 'onContracts' },
  { id: 'ctm-tile-transfers', label: 'Transfers', sub: 'Free agent market',       ariaLabel: 'Transfer market', iconKey: 'transfers', handlerKey: 'onTransfers' },
  { id: 'ctm-tile-scouting',  label: 'Scouting',  sub: 'Player watchlist',        ariaLabel: 'Scouting',        iconKey: 'scouting',  handlerKey: 'onScouting'  },
];

let _opts: InitContractsTransfersMenuOpts | null = null;
let _teamsById: Map<string, RawTeamInput> = new Map();

export function showContractsTransfersMenu(): void {
  const el = document.getElementById('contracts-transfers-menu');
  if (!el || !_opts) return;
  const opts = _opts;
  const state = opts.getGameEngine().getState();
  const playerTeam = _teamsById.get(state.player.teamId);
  if (!playerTeam) return;

  const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  const expiringCount = countExpiringContracts(state);
  const poachCount = (state.career.activePoachedIds ?? []).length;
  const scoutingCount = Object.keys(state.player.scouting ?? {}).length;
  const badgeCounts: Record<string, number> = {
    'ctm-tile-contracts': expiringCount,
    'ctm-tile-transfers': poachCount,
    'ctm-tile-scouting':  scoutingCount,
  };

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="ctm-back" class="app-back" aria-label="Back to hub">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Hub</span>
        </button>
        <span class="app-title">Contracts &amp; Transfers</span>
        <div class="app-topbar-spacer"></div>
      </div>
      <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week} / ${totalRounds}</div>
    </div>

    <div id="ctm-grid">
      ${TILES.map(t => {
        const badge = badgeCounts[t.id] ?? 0;
        return `
          <button id="${t.id}" class="hub-tile" aria-label="${t.ariaLabel}">
            ${badge > 0 ? `<span class="notification-badge" aria-label="${badge} requiring attention">${badge}</span>` : ''}
            ${ICONS[t.iconKey]}
            <span class="hub-tile-label">${t.label}</span>
            <span class="hub-tile-sub">${t.sub}</span>
          </button>`;
      }).join('')}
    </div>
  `;

  injectTeamColors(el, playerTeam);

  el.querySelector<HTMLButtonElement>('#ctm-back')!.addEventListener('click', () => opts.onBack());
  for (const t of TILES) {
    el.querySelector<HTMLButtonElement>(`#${t.id}`)!.addEventListener('click', () => opts[t.handlerKey]());
  }
}

export function initContractsTransfersMenuScreen(opts: InitContractsTransfersMenuOpts): void {
  _opts = opts;
  _teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
}

function countExpiringContracts(state: GameState): number {
  const club = state.career.clubs.find(c => c.id === state.player.teamId);
  if (!club) return 0;
  const today = new Date(state.calendar.date);
  const leaving = new Set(
    state.career.pendingMoves
      .filter(m => m.toClubId !== state.player.teamId)
      .map(m => m.rosterId),
  );
  let n = 0;
  for (const rid of club.squad) {
    if (leaving.has(rid)) continue;
    const p = state.career.roster[rid];
    const expiresOn = p?.contract.expiresOn;
    if (!expiresOn) continue;
    const exp = new Date(expiresOn);
    const monthsAhead = (exp.getUTCFullYear() - today.getUTCFullYear()) * 12
                      + (exp.getUTCMonth() - today.getUTCMonth());
    if (monthsAhead >= 0 && monthsAhead <= EXPIRING_CONTRACT_WINDOW_MONTHS) n++;
  }
  return n;
}
