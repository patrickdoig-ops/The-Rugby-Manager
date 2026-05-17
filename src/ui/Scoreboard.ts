import { eventBus } from '../utils/eventBus';

function phaseClass(phase: string): string {
  switch (phase) {
    case 'TryScored':                                      return 'phase-try';
    case 'Penalty': case 'GoalKick':                       return 'phase-penalty';
    case 'Scrum':                                          return 'phase-scrum';
    case 'Lineout': case 'BoxKick': case 'TacticalKick':
    case 'KickOff': case 'ConversionKick':                 return 'phase-kick';
    case 'HalfTime': case 'FullTime':                      return 'phase-terminal';
    default:                                               return 'phase-play';
  }
}

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
    phaseDisplay.className   = `phase-badge ${phaseClass(state.phase)}`;
  });
}
