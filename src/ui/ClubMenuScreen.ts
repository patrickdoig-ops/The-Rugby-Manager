// In-season Club sub-menu. Reached from the Hub's Club tile.
// Stub: displays the board confidence pill and a back button.
// Uses club colours (injectTeamColors) matching other club-specific screens.
//
// Initialised once per page lifetime. showClubMenu() re-renders fresh
// state on every visit so the board confidence is always current.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { injectTeamColors } from './teamColors';
import { confidenceBand, boardConfidenceFactors } from '../game/board';

export interface InitClubMenuOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
  onStaff: () => void;
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
    const conf = state.player.board.confidence;
    const band = confidenceBand(conf);
    const factors = boardConfidenceFactors(state);
    const factorsHtml = factors.map(f => `
      <div class="cm-factor cm-factor--${f.tone}">
        <span class="cm-factor-dot" aria-hidden="true"></span>
        <div class="cm-factor-body">
          <div class="cm-factor-label">${f.label}</div>
          <div class="cm-factor-detail">${f.detail}</div>
        </div>
      </div>`).join('');
    return `
      <div class="cm-board">
        <div class="cm-board-hero cm-board-hero--${band.key}">
          <div class="cm-board-eyebrow">Board Confidence</div>
          <div class="cm-board-band">${band.label}</div>
          <div class="cm-board-meter"><div class="cm-board-meter-fill" style="width:${Math.round(conf)}%"></div></div>
          <div class="cm-board-num">${Math.round(conf)} / 100</div>
        </div>
        <div class="cm-board-factors">
          <div class="cm-section-label">What's driving it</div>
          ${factorsHtml}
        </div>
        <p class="cm-board-note">The owner's confidence rises when you win — especially against stronger sides — and falls after defeats, hardest when you were favourites. Losing runs hurt most. Meet your season objective and you'll keep the board onside; fall well short and your position comes under threat.</p>
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
      <nav class="cm-nav">
        <button id="cm-nav-staff" class="cm-nav-row" aria-label="Staff hiring">
          <svg class="cm-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.193.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z"/></svg>
          <span class="cm-nav-label">Staff</span>
          <span class="cm-nav-sub">Hire &amp; manage coaching staff</span>
          <svg class="cm-nav-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </nav>
    </div>
  `;

  injectTeamColors(el, playerTeam);

  el.querySelector<HTMLButtonElement>('#cm-back')!.addEventListener('click', () => opts.onBack());
  el.querySelector<HTMLButtonElement>('#cm-nav-staff')!.addEventListener('click', () => opts.onStaff());
}

export function initClubMenuScreen(opts: InitClubMenuOpts): void {
  _opts = opts;
  _teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
}
