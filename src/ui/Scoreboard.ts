import { eventBus } from '../utils/eventBus';
import { CLOCK_VALUES } from '../engine/balance';
import { teamTextColor } from '../utils/teamColor';
import { phaseClass } from '../utils/phaseColor';
import type { DisplayCards } from '../types/match';
import { MatchPhase } from '../types/engine';

// Short labels for phases whose underscore-replaced names overflow the
// scoreboard pill at narrow viewports. Falls back to a plain
// `state.phase.replace(/_/g, ' ')` for every other phase.
const PHASE_LABEL: Partial<Record<MatchPhase, string>> = {
  [MatchPhase.ConversionKick]: 'CONVERSION',
};

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

function renderCardStack(stack: HTMLElement, cards: DisplayCards): void {
  const { sinBin, sentOff } = cards;
  if (sinBin.length === 0 && sentOff.length === 0) {
    if (stack.childElementCount > 0) stack.innerHTML = '';
    return;
  }
  const pips: string[] = [];
  for (const entry of sinBin) {
    const cls = entry.kind === 'yellow' ? 'card-pip--yellow' : 'card-pip--red';
    pips.push(`<span class="card-pip ${cls}" title="${entry.name} — ${entry.kind === 'yellow' ? 'sin bin' : '20-min red'}"></span>`);
  }
  for (const name of sentOff) {
    pips.push(`<span class="card-pip card-pip--red" title="${name} — sent off"></span>`);
  }
  stack.innerHTML = pips.join('');
}

export function initScoreboard(): void {
  const homeCrest    = document.getElementById('home-crest')!;
  const awayCrest    = document.getElementById('away-crest')!;
  const homeCode     = document.getElementById('home-code')!;
  const awayCode     = document.getElementById('away-code')!;
  const homeScore    = document.getElementById('home-score')!;
  const awayScore    = document.getElementById('away-score')!;
  const homeCards    = document.getElementById('home-cards')!;
  const awayCards    = document.getElementById('away-cards')!;
  const clockDisplay = document.getElementById('clock-display')!;
  const phaseDisplay = document.getElementById('phase-display')!;

  let crestsSet = false;
  let homeColor = '';
  let awayColor = '';
  let prevHome = -1;
  let prevAway = -1;

  function popScore(el: HTMLElement, newValue: number, prevValue: number, teamColor: string): void {
    el.textContent = String(newValue).padStart(2, '0');
    if (newValue <= prevValue) return;
    el.style.setProperty('--score-kick-color', teamColor);
    el.classList.remove('score--just-scored', 'score--just-scored-fade');
    void el.offsetWidth;
    el.classList.add('score--just-scored');
    setTimeout(() => el.classList.add('score--just-scored-fade'), 480);
  }

  eventBus.on('engine:initialized', () => {
    crestsSet = false;
    homeColor = '';
    awayColor = '';
    prevHome = -1;
    prevAway = -1;
    homeCards.innerHTML = '';
    awayCards.innerHTML = '';
  });

  eventBus.on('engine:stateChange', ({ state, display }) => {
    // Team identity (crests, colours, codes) is fixed for the match — read
    // once off live state. Everything volatile reads the per-event snapshot
    // so the scoreboard tracks the line being narrated.
    if (!crestsSet) {
      crestsSet = true;
      homeColor = state.homeTeam.color;
      awayColor = state.awayTeam.color;
      applyCrests(
        homeCrest, awayCrest, homeCode, awayCode,
        homeColor, awayColor,
        state.homeTeam.shortName, state.awayTeam.shortName,
      );
    }

    popScore(homeScore, display.score.home, prevHome, homeColor);
    popScore(awayScore, display.score.away, prevAway, awayColor);
    prevHome = display.score.home;
    prevAway = display.score.away;
    if (display.clockInTheRed) {
      const halfTarget = display.halfTimeDone ? CLOCK_VALUES.fullTimeMinute : CLOCK_VALUES.halfTimeMinute;
      clockDisplay.textContent = `${halfTarget}+${Math.floor(display.gameMinute - halfTarget)}′`;
      clockDisplay.style.color = 'var(--rm-coral)';
    } else {
      clockDisplay.textContent = `${Math.floor(display.gameMinute)}′`;
      clockDisplay.style.color = '';
    }
    phaseDisplay.textContent = PHASE_LABEL[display.phase] ?? display.phase.replace(/_/g, ' ');
    phaseDisplay.className   = `phase-badge ${phaseClass(display.phase)}`;
    renderCardStack(homeCards, display.cards.home);
    renderCardStack(awayCards, display.cards.away);
  });
}
