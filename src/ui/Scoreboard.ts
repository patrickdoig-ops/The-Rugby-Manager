import { eventBus } from '../utils/eventBus';
import { CLOCK_VALUES } from '../engine/balance';
import { teamTextColor } from '../utils/teamColor';
import { phaseClass } from '../utils/phaseColor';

function applyCrests(
  homeCrest: HTMLElement, awayCrest: HTMLElement,
  homeCode: HTMLElement, awayCode: HTMLElement,
  homeColor: string, awayColor: string,
  homeShort: string, awayShort: string,
): void {
  const setCrest = (el: HTMLElement, color: string, letter: string) => {
    el.style.background = `linear-gradient(160deg, ${color} 0%, color-mix(in oklch, ${color} 30%, black) 100%)`;
    el.style.borderColor = `color-mix(in oklch, ${color} 50%, transparent)`;
    el.style.boxShadow   = `0 4px 16px color-mix(in oklch, ${color} 28%, transparent), inset 0 1px 0 rgba(255,255,255,0.15)`;
    const span = el.querySelector('span');
    if (span) span.textContent = letter;
  };
  setCrest(homeCrest, homeColor, homeShort[0]);
  setCrest(awayCrest, awayColor, awayShort[0]);

  homeCode.textContent = homeShort;
  homeCode.style.color = teamTextColor(homeColor);
  awayCode.textContent = awayShort;
  awayCode.style.color = teamTextColor(awayColor);
}

export function initScoreboard(): void {
  const homeCrest    = document.getElementById('home-crest')!;
  const awayCrest    = document.getElementById('away-crest')!;
  const homeCode     = document.getElementById('home-code')!;
  const awayCode     = document.getElementById('away-code')!;
  const homeScore    = document.getElementById('home-score')!;
  const awayScore    = document.getElementById('away-score')!;
  const clockDisplay = document.getElementById('clock-display')!;
  const phaseDisplay = document.getElementById('phase-display')!;

  let crestsSet = false;

  eventBus.on('engine:initialized', () => {
    crestsSet = false;
  });

  eventBus.on('engine:stateChange', ({ state }) => {
    if (!crestsSet) {
      crestsSet = true;
      applyCrests(
        homeCrest, awayCrest, homeCode, awayCode,
        state.homeTeam.color, state.awayTeam.color,
        state.homeTeam.shortName, state.awayTeam.shortName,
      );
    }

    homeScore.textContent    = String(state.score.home).padStart(2, '0');
    awayScore.textContent    = String(state.score.away).padStart(2, '0');
    if (state.clock.clockInTheRed) {
      const halfTarget = state.clock.halfTimeDone ? CLOCK_VALUES.fullTimeMinute : CLOCK_VALUES.halfTimeMinute;
      clockDisplay.textContent = `${halfTarget}+${Math.floor(state.clock.gameMinute - halfTarget)}′`;
      clockDisplay.style.color = 'var(--rm-coral)';
    } else {
      clockDisplay.textContent = `${Math.floor(state.clock.gameMinute)}′`;
      clockDisplay.style.color = '';
    }
    phaseDisplay.textContent = state.phase.replace(/_/g, ' ');
    phaseDisplay.className   = `phase-badge ${phaseClass(state.phase)}`;
  });
}
