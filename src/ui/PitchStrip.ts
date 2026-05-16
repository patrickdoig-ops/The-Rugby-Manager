import { eventBus } from '../utils/eventBus';

export function initPitchStrip(): void {
  const ballMarker   = document.getElementById('ball-marker')!;
  const attackLabel  = document.getElementById('attack-label')!;
  const homeEndLabel = document.getElementById('home-end-label')!;
  const awayEndLabel = document.getElementById('away-end-label')!;

  // Team colours and short names are match constants — initialise once then drop the listener.
  let cancelInit = eventBus.on('engine:stateChange', ({ state }) => {
    homeEndLabel.style.color = state.homeTeam.color;
    awayEndLabel.style.color = state.awayTeam.color;
    homeEndLabel.textContent = state.homeTeam.shortName;
    awayEndLabel.textContent = state.awayTeam.shortName;
    cancelInit();
  });

  // Hot-path listener: only updates that actually change each tick.
  eventBus.on('engine:stateChange', ({ state }) => {
    ballMarker.style.left = `${state.ballX}%`;

    const attackingTeam    = state.possession === 'home' ? state.homeTeam : state.awayTeam;
    const homeAttacksRight = !state.halfTimeDone;
    const arrow = state.possession === 'home'
      ? (homeAttacksRight ? '→' : '←')
      : (homeAttacksRight ? '←' : '→');

    attackLabel.textContent = `${attackingTeam.name} attacking ${arrow}`;
    attackLabel.style.color = attackingTeam.color;
  });
}
