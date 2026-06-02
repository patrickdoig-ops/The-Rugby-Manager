// In-season Club sub-menu. Reached from the Hub's Club tile.
// Stub: displays the board confidence pill and a back button.
// Uses club colours (injectTeamColors) matching other club-specific screens.
//
// Initialised once per page lifetime. showClubMenu() re-renders fresh
// state on every visit so the board confidence is always current.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { injectTeamColors } from './teamColors';
import { confidenceBand } from '../game/board';

export interface InitClubMenuOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
}

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

  const boardHtml = state.player.board ? (() => {
    const band = confidenceBand(state.player.board.confidence);
    return `
      <div class="cm-board-section">
        <div class="cm-section-label">Board Confidence</div>
        <div class="hub-board-pill hub-board-pill--${band.key}" title="Board confidence: ${Math.round(state.player.board.confidence)}/100">
          <span class="hub-board-pill-label">Board</span>
          <span class="hub-board-pill-val">${band.label}</span>
        </div>
      </div>`;
  })() : '';

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
    <div id="cm-content">
      ${boardHtml}
    </div>
  `;

  injectTeamColors(el, playerTeam);

  el.querySelector<HTMLButtonElement>('#cm-back')!.addEventListener('click', () => opts.onBack());
}

export function initClubMenuScreen(opts: InitClubMenuOpts): void {
  _opts = opts;
  _teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
}
