// Assistant Manager settings — reached from the Club menu. A persistent control
// over whether the manager delegates League Cup matches to their assistant (and
// if so, whether the assistant rests the first-choice XV). Replaces the old
// once-per-block in-cycle decision screen: set it here, change it any time.
//
// One-shot init from main.ts; showAssistantManager() re-renders fresh state and
// persists each toggle immediately (FM-style — no Continue, no confirmation).

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { injectTeamColors } from './teamColors';
import { helpButtonHtml } from './help/helpButton';

export interface InitAssistantManagerOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  persist: (manageLive: boolean, direction: 'best' | 'rest_first_15') => void;
  onBack: () => void;
}

let _opts: InitAssistantManagerOpts | null = null;
let _teamsById: Map<string, RawTeamInput> = new Map();

export function showAssistantManager(): void {
  const el = document.getElementById('assistant-manager');
  if (!el || !_opts) return;
  const opts = _opts;
  const state = opts.getGameEngine().getState();
  const playerTeam = _teamsById.get(state.player.teamId);
  if (!playerTeam) return;

  const manageLive = state.player.cupManageLive ?? false;
  const direction = state.player.cupDirection ?? 'best';

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="am-back" class="app-back" aria-label="Back to club">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Club</span>
        </button>
        <span class="app-title">Assistant Manager</span>
        <div class="app-topbar-spacer">${helpButtonHtml('assistant-manager')}</div>
      </div>
      <div class="app-eyebrow">League Cup delegation</div>
    </div>

    <div class="cup-content">
      <div class="cup-direction">
        <div class="cup-direction-title">Who runs your League Cup matches?</div>
        <div class="cup-direction-note">Manage them yourself, or delegate the League Cup to your assistant. This applies to every cup match until you change it.</div>
        <div class="cup-toggle" role="group" aria-label="Cup management">
          <button class="cup-toggle-opt${manageLive ? ' cup-toggle-opt--on' : ''}" data-manage="live">
            <span class="cup-toggle-label">I'll manage them</span>
            <span class="cup-toggle-sub">Pick the squad &amp; play live</span>
          </button>
          <button class="cup-toggle-opt${!manageLive ? ' cup-toggle-opt--on' : ''}" data-manage="assistant">
            <span class="cup-toggle-label">Assistant manages</span>
            <span class="cup-toggle-sub">Simulate the matches</span>
          </button>
        </div>
      </div>

      ${manageLive ? '' : `
      <div class="cup-direction">
        <div class="cup-direction-note">How should the assistant pick the squad?</div>
        <div class="cup-toggle" role="group" aria-label="Cup selection direction">
          <button class="cup-toggle-opt${direction === 'best' ? ' cup-toggle-opt--on' : ''}" data-dir="best">
            <span class="cup-toggle-label">Best available</span>
            <span class="cup-toggle-sub">Field the strongest 23</span>
          </button>
          <button class="cup-toggle-opt${direction === 'rest_first_15' ? ' cup-toggle-opt--on' : ''}" data-dir="rest_first_15">
            <span class="cup-toggle-label">Rest the starters</span>
            <span class="cup-toggle-sub">Keep your first XV fresh</span>
          </button>
        </div>
      </div>`}
    </div>
  `;

  injectTeamColors(el, playerTeam);

  el.querySelector<HTMLButtonElement>('#am-back')!.addEventListener('click', () => opts.onBack());
  el.querySelectorAll<HTMLButtonElement>('[data-manage]').forEach(btn => {
    btn.addEventListener('click', () => {
      opts.persist(btn.dataset.manage === 'live', direction);
      showAssistantManager();
    });
  });
  el.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      opts.persist(manageLive, btn.dataset.dir === 'rest_first_15' ? 'rest_first_15' : 'best');
      showAssistantManager();
    });
  });
}

export function initAssistantManagerScreen(opts: InitAssistantManagerOpts): void {
  _opts = opts;
  _teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
}
