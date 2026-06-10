// Board confidence detail screen. Reached from the Club sub-menu.
// Shows the owner's confidence meter, colour-coded band, driving factors,
// and a plain-English explainer. Re-renders on every visit.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { injectTeamColors } from './teamColors';
import { confidenceBand, boardConfidenceFactors } from '../game/board';
import { helpButtonHtml } from './help/helpButton';

export interface InitBoardConfidenceOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
}

let _opts: InitBoardConfidenceOpts | null = null;
let _teamsById: Map<string, RawTeamInput> = new Map();

export function showBoardConfidence(): void {
  const el = document.getElementById('board-confidence');
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
  })() : '<p class="cm-board-note">Board data not available.</p>';

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="bc-back" class="app-back" aria-label="Back to club">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Club</span>
        </button>
        <span class="app-title">Board</span>
        <div class="app-topbar-spacer">${helpButtonHtml('board-confidence')}</div>
      </div>
      <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week} / ${totalRounds}</div>
    </div>
    <div id="cm-content">
      ${boardHtml}
    </div>
  `;

  injectTeamColors(el, playerTeam);

  el.querySelector<HTMLButtonElement>('#bc-back')!.addEventListener('click', () => opts.onBack());
}

export function initBoardConfidenceScreen(opts: InitBoardConfidenceOpts): void {
  _opts = opts;
  _teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
}
