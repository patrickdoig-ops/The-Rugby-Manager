import { eventBus } from '../utils/eventBus';
import { colorOnDark } from './teamColors';

export const BALL_SVG = `<svg width="26" height="16" viewBox="0 0 30 18" style="display:block">
  <ellipse cx="15" cy="9" rx="14" ry="7.5" fill="var(--ball-color, var(--rm-amber))"
    stroke="color-mix(in oklch,var(--ball-color, var(--rm-amber)) 40%,black)" stroke-width="0.8"/>
  <path d="M3 9 L27 9" stroke="rgba(255,255,255,0.55)" stroke-width="0.8" stroke-linecap="round"/>
</svg>`;

export function initPitchStrip(): void {
  const ballMarker   = document.getElementById('ball-marker')!;
  const attackLabel  = document.getElementById('attack-label')!;
  const homeEndLabel = document.getElementById('home-end-label')!;
  const awayEndLabel = document.getElementById('away-end-label')!;

  ballMarker.innerHTML = BALL_SVG;

  let lastHalfTimeDone: boolean | null = null;

  eventBus.on('engine:initialized', () => {
    lastHalfTimeDone = null;
  });

  eventBus.on('engine:stateChange', ({ state, display }) => {
    // Ball position, half, and possession read the per-event snapshot so the
    // marker tracks the narrated line; team identity (colours, shortNames)
    // is fixed for the match and read off live state.
    ballMarker.style.left = `${display.ballX}%`;

    if (display.halfTimeDone !== lastHalfTimeDone) {
      lastHalfTimeDone = display.halfTimeDone;
      const leftTeam  = !display.halfTimeDone ? state.homeTeam : state.awayTeam;
      const rightTeam = !display.halfTimeDone ? state.awayTeam : state.homeTeam;

      homeEndLabel.style.color = colorOnDark(leftTeam.color);
      homeEndLabel.textContent = leftTeam.shortName;
      awayEndLabel.style.color = colorOnDark(rightTeam.color);
      awayEndLabel.textContent = rightTeam.shortName;
    }

    const attackingTeam    = display.possession === 'home' ? state.homeTeam : state.awayTeam;
    const homeAttacksRight = !display.halfTimeDone;
    const arrow = display.possession === 'home'
      ? (homeAttacksRight ? '→' : '←')
      : (homeAttacksRight ? '←' : '→');

    attackLabel.textContent = `${attackingTeam.shortName} attacking ${arrow}`;
    attackLabel.style.color = '';
  });
}
