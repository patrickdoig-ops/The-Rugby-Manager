// European Shield screen — pool tables, fixtures and knockout bracket.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { euroScreenHtml } from './components/europeanViews';
import { eventBus } from '../utils/eventBus';

export interface InitEuropeanShieldScreenOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
}

export function initEuropeanShieldScreen(opts: InitEuropeanShieldScreenOpts): void {
  const el = document.getElementById('european-shield');
  if (!el) return;

  const teamsById = new Map(opts.allTeams.map(t => [t.id, t]));

  function render(): void {
    let comp = null;
    let playerId = '';
    try {
      const state = opts.getGameEngine().getState();
      comp = state.league.europeanShield ?? null;
      playerId = state.player.teamId;
    } catch { /* engine not yet initialised — show placeholder */ }
    el!.innerHTML = euroScreenHtml(comp, teamsById, playerId, 'European Shield', 'es-back');
    el!.querySelector<HTMLButtonElement>('#es-back')!.addEventListener('click', () => opts.onBack());
  }

  render();

  const unsub = eventBus.on('game:weekAdvanced', () => { if (el.offsetParent !== null) render(); });
  void unsub;
}
