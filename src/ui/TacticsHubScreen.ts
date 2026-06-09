// Standalone tactics screen, reached from the Hub's "Tactics" tile. Lets the
// manager see and set their team's tactics (presets or the advanced editor)
// outside the pre-match flow.
//
// A green full-width "Save" CTA fixed at the bottom commits the edits (→ persist
// + exit). The back arrow mirrors the Squad Management screen: with unsaved
// changes it shows the shared discard-changes sheet (Keep editing / Discard);
// discard leaves WITHOUT saving. Edits are accumulated from the shared
// `ui:tacticsChange` bus event.
//
// Initialised once per page lifetime; `showTacticsScreen()` re-renders it from
// the current player tactics each time the screen is navigated to (mirrors the
// LeagueTableScreen show/render split), so it always reflects the latest state.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { TeamTactics } from '../types/team';
import { DEFAULT_TACTICS } from '../types/team';
import { renderTacticsMenu } from './TacticsMenu';
import { injectTeamColors } from './teamColors';
import { discardConfirm } from './components/discardConfirm';
import { eventBus } from '../utils/eventBus';

export interface InitTacticsHubOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  persist: (tactics: TeamTactics) => void;  // setPlayerTactics + autosave
  onExit: () => void;                         // navigate back to the Hub
}

let renderImpl: (() => void) | null = null;

export function showTacticsScreen(): void {
  renderImpl?.();
}

export function initTacticsHubScreen(opts: InitTacticsHubOpts): void {
  const el = document.getElementById('tactics');
  if (!el) return;

  const teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
  let unsubTactics: (() => void) | null = null;

  function render(): void {
    unsubTactics?.();
    unsubTactics = null;

    const state = opts.getGameEngine().getState();
    const playerTeam = teamsById.get(state.player.teamId);
    if (playerTeam) injectTeamColors(el!, playerTeam);

    const initial: TeamTactics = state.player.tactics ? { ...state.player.tactics } : { ...DEFAULT_TACTICS };
    const initialJson = JSON.stringify(initial);
    let chosenTactics: TeamTactics = { ...initial };
    const isDirty = (): boolean => JSON.stringify(chosenTactics) !== initialJson;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="tactics-back" class="app-back" aria-label="Back to Hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Tactics</span>
          <div class="app-topbar-spacer"></div>
        </div>
      </div>
      <div class="tactics-screen-body"><div id="tactics-host"></div></div>
      <div id="tactics-footer">
        <button id="tactics-save" class="tactics-resume-btn" type="button">Save</button>
      </div>
    `;

    unsubTactics = eventBus.on('ui:tacticsChange', ({ tactics }) => { chosenTactics = tactics; });
    renderTacticsMenu(el!.querySelector<HTMLElement>('#tactics-host')!, chosenTactics, 'home', false);

    const cleanup = (): void => { unsubTactics?.(); unsubTactics = null; };

    el!.querySelector<HTMLButtonElement>('#tactics-save')!.addEventListener('click', () => {
      cleanup();
      opts.persist(chosenTactics);
      opts.onExit();
    });

    el!.querySelector<HTMLButtonElement>('#tactics-back')!.addEventListener('click', async () => {
      if (isDirty()) {
        const discard = await discardConfirm('You have unsaved tactics changes. Leaving now will revert them.');
        if (!discard) return;  // keep editing
      }
      cleanup();
      opts.onExit();
    });
  }

  renderImpl = render;
  render();
}
