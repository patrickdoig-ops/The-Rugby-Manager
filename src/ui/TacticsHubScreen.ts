// Standalone tactics screen, reached from the Hub's "Tactics" tile. Lets the
// manager see and set their team's tactics (presets or the advanced editor)
// outside the pre-match flow. Edits are accumulated from the shared
// `ui:tacticsChange` bus event and committed via `onSaveAndExit` when the
// back arrow is tapped, so they carry into the next match.
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
import { eventBus } from '../utils/eventBus';

let renderImpl: (() => void) | null = null;

export function showTacticsScreen(): void {
  renderImpl?.();
}

export function initTacticsHubScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onSaveAndExit: (tactics: TeamTactics) => void,
): void {
  const el = document.getElementById('tactics');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  let unsubTactics: (() => void) | null = null;

  function render(): void {
    unsubTactics?.();
    unsubTactics = null;

    const state = getGameEngine().getState();
    const playerTeam = teamsById.get(state.player.teamId);
    if (playerTeam) injectTeamColors(el!, playerTeam);
    const saved = state.player.tactics;
    let chosenTactics: TeamTactics = saved ? { ...saved } : { ...DEFAULT_TACTICS };

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="tactics-back" class="app-back" aria-label="Save and return to Hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Tactics</span>
          <div class="app-topbar-spacer"></div>
        </div>
      </div>
      <div class="tactics-screen-body"><div id="tactics-host"></div></div>
    `;

    unsubTactics = eventBus.on('ui:tacticsChange', ({ tactics }) => { chosenTactics = tactics; });
    renderTacticsMenu(el!.querySelector<HTMLElement>('#tactics-host')!, chosenTactics, 'home', false);

    el!.querySelector<HTMLButtonElement>('#tactics-back')!.addEventListener('click', () => {
      unsubTactics?.();
      unsubTactics = null;
      onSaveAndExit(chosenTactics);
    });
  }

  renderImpl = render;
  render();
}
