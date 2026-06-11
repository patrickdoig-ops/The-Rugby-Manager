// European Shield screen — pool tables, fixtures and knockout bracket.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { euroScreenHtml } from './components/europeanViews';
import { eventBus } from '../utils/eventBus';

export interface InitEuropeanShieldScreenOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
  onTeamClick?: (teamId: string) => void;
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
    const team = teamsById.get(state.player.teamId);
    if (team) el!.style.setProperty('--team-color', team.color);
    el!.innerHTML = euroScreenHtml(comp, teamsById, state.player.teamId, 'European Shield', 'es-back', 'european-shield');
    el!.querySelector<HTMLButtonElement>('#es-back')!.addEventListener('click', () => opts.onBack());
    if (opts.onTeamClick) {
      el!.querySelectorAll<HTMLElement>('[data-team-id]').forEach(elt => {
        elt.addEventListener('click', () => opts.onTeamClick!(elt.dataset.teamId!));
      });
    }
  }

  _render = render;

  eventBus.on('game:weekAdvanced',     () => { if (el.offsetParent !== null) render(); });
  eventBus.on('game:initialized',      () => { if (el.offsetParent !== null) render(); });
  eventBus.on('game:seasonRolledOver', () => { if (el.offsetParent !== null) render(); });
}
