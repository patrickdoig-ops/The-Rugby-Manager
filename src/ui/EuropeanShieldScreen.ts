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

let _render: (() => void) | null = null;

export function showEuropeanShieldScreen(): void {
  _render?.();
}

export function initEuropeanShieldScreen(opts: InitEuropeanShieldScreenOpts): void {
  const el = document.getElementById('european-shield');
  if (!el) return;

  const teamsById = new Map(opts.allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = opts.getGameEngine().getState();
    const comp = state.league.europeanShield ?? null;
    el!.innerHTML = euroScreenHtml(comp, teamsById, state.player.teamId, 'European Shield', 'es-back');
    el!.querySelector<HTMLButtonElement>('#es-back')!.addEventListener('click', () => opts.onBack());
  }

  _render = render;

  eventBus.on('game:weekAdvanced',     () => { if (el.offsetParent !== null) render(); });
  eventBus.on('game:initialized',      () => { if (el.offsetParent !== null) render(); });
  eventBus.on('game:seasonRolledOver', () => { if (el.offsetParent !== null) render(); });
}
