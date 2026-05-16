import { eventBus } from '../utils/eventBus';

export function initScoreboard(): void {
  const homeName     = document.getElementById('home-name')!;
  const awayName     = document.getElementById('away-name')!;
  const homeScore    = document.getElementById('home-score')!;
  const awayScore    = document.getElementById('away-score')!;
  const clockDisplay = document.getElementById('clock-display')!;
  const phaseDisplay = document.getElementById('phase-display')!;

  eventBus.on('engine:stateChange', ({ state }) => {
    homeName.textContent     = state.homeTeam.name;
    awayName.textContent     = state.awayTeam.name;
    homeScore.textContent    = String(state.score.home);
    awayScore.textContent    = String(state.score.away);
    clockDisplay.textContent = `${Math.floor(state.gameMinute)}'`;
    phaseDisplay.textContent = state.phase.replace(/_/g, ' ');
  });
}
