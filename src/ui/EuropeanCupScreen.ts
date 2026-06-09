// European Cup screen — pool tables, fixtures and knockout bracket.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { euroScreenHtml } from './components/europeanViews';
import { eventBus } from '../utils/eventBus';

export interface InitEuropeanCupScreenOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
}

export function initEuropeanCupScreen(opts: InitEuropeanCupScreenOpts): void {
  const el = document.getElementById('european-cup');
  if (!el) return;

  const teamsById = new Map(opts.allTeams.map(t => [t.id, t]));

  function render(): void {
    let comp = null;
    let playerId = '';
    try {
      const state = opts.getGameEngine().getState();
      comp = state.league.europeanCup ?? null;
      playerId = state.player.teamId;
    } catch { /* engine not yet initialised — show placeholder */ }
    el!.innerHTML = euroScreenHtml(comp, teamsById, playerId, 'European Cup', 'ec-back');
    el!.querySelector<HTMLButtonElement>('#ec-back')!.addEventListener('click', () => opts.onBack());
  }

  render();

  const unsub = eventBus.on('game:weekAdvanced', () => { if (el.offsetParent !== null) render(); });
  // Cleanup is not needed for a per-page-lifetime screen, but keep the pattern consistent.
  void unsub;
}
