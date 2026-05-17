import { eventBus } from '../utils/eventBus';

export function initPitchStrip(): void {
  const ballMarker   = document.getElementById('ball-marker')!;
  const attackLabel  = document.getElementById('attack-label')!;
  const homeEndLabel = document.getElementById('home-end-label')!;
  const awayEndLabel = document.getElementById('away-end-label')!;

  let lastHalfTimeDone: boolean | null = null;

  eventBus.on('engine:stateChange', ({ state }) => {
    ballMarker.style.left = `${state.ballX}%`;

    if (state.halfTimeDone !== lastHalfTimeDone) {
      lastHalfTimeDone = state.halfTimeDone;
      const leftTeam  = !state.halfTimeDone ? state.homeTeam : state.awayTeam;
      const rightTeam = !state.halfTimeDone ? state.awayTeam : state.homeTeam;

      homeEndLabel.style.color = leftTeam.color;
      homeEndLabel.textContent = leftTeam.shortName;
      awayEndLabel.style.color = rightTeam.color;
      awayEndLabel.textContent = rightTeam.shortName;
    }

    const attackingTeam    = state.possession === 'home' ? state.homeTeam : state.awayTeam;
    const homeAttacksRight = !state.halfTimeDone;
    const arrow = state.possession === 'home'
      ? (homeAttacksRight ? '→' : '←')
      : (homeAttacksRight ? '←' : '→');

    attackLabel.textContent = `${attackingTeam.name} attacking ${arrow}`;
    attackLabel.style.color = attackingTeam.color;
  });
}
