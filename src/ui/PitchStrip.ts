import { eventBus } from '../utils/eventBus';

const BALL_SVG = `<svg width="26" height="16" viewBox="0 0 30 18" style="display:block">
  <ellipse cx="15" cy="9" rx="14" ry="7.5" fill="var(--rm-amber)"
    stroke="color-mix(in oklch,var(--rm-amber) 40%,black)" stroke-width="0.8"/>
  <path d="M3 9 L27 9" stroke="rgba(255,255,255,0.55)" stroke-width="0.8" stroke-linecap="round"/>
  <g stroke="rgba(255,255,255,0.55)" stroke-width="0.8" stroke-linecap="round">
    <path d="M10 7.5L10 10.5"/><path d="M14 7L14 11"/>
    <path d="M18 7L18 11"/><path d="M22 7.5L22 10.5"/>
  </g>
</svg>`;

export function initPitchStrip(): void {
  const ballMarker   = document.getElementById('ball-marker')!;
  const attackLabel  = document.getElementById('attack-label')!;
  const homeEndLabel = document.getElementById('home-end-label')!;
  const awayEndLabel = document.getElementById('away-end-label')!;

  ballMarker.innerHTML = BALL_SVG;

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

    attackLabel.textContent = `${attackingTeam.shortName} attacking ${arrow}`;
    attackLabel.style.color = '';
  });
}
