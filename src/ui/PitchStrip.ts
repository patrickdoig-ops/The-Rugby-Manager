import { eventBus } from '../utils/eventBus';

export function initPitchStrip(): void {
  const ballMarker    = document.getElementById('ball-marker')!;
  const attackLabel   = document.getElementById('attack-label')!;
  const homeEndLabel  = document.getElementById('home-end-label')!;
  const awayEndLabel  = document.getElementById('away-end-label')!;

  eventBus.on('engine:stateChange', ({ state }) => {
    // Slide ball along the strip
    ballMarker.style.left = `${state.ballX}%`;

    // Team end labels (coloured with team colours)
    homeEndLabel.style.color = state.homeTeam.color;
    awayEndLabel.style.color = state.awayTeam.color;
    homeEndLabel.textContent = state.homeTeam.shortName;
    awayEndLabel.textContent = state.awayTeam.shortName;

    // Attack direction label below the strip
    const attackingTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
    const homeAttacksRight = !state.halfTimeDone;
    const arrow = state.possession === 'home'
      ? (homeAttacksRight ? '→' : '←')
      : (homeAttacksRight ? '←' : '→');

    attackLabel.textContent = `${attackingTeam.name} attacking ${arrow}`;
    attackLabel.style.color = attackingTeam.color;
  });
}
