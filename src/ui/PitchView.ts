import { eventBus } from '../utils/eventBus';
import { colorOnDark } from './teamColors';
import { renderCardStack } from './Scoreboard';
import { BALL_SVG } from './PitchStrip';
import { phaseClass } from '../utils/phaseColor';
import type { GameEvent } from '../types/match';

// Which flash a key event warrants, or null for a beat we don't highlight. Kept
// deliberately curated (try / penalty / card) so the pitch doesn't strobe on
// every box-kick or lineout; routine possession swaps surface as the subtler
// turnover flash driven from the stateChange handler.
function flashClass(event: GameEvent): string | null {
  for (const step of event.narration.steps) {
    if (step.kind === 'announcement' && step.key.startsWith('card_')) return 'flash-card';
  }
  const pc = phaseClass(event.displayPhase ?? event.phase);
  if (pc === 'phase-try')     return 'flash-try';
  if (pc === 'phase-penalty') return 'flash-penalty';
  return null;
}

export function initPitchView(): void {
  const ball         = document.getElementById('pitch-2d-ball')!;
  const flash        = document.getElementById('pitch-flash')!;
  const shade        = document.getElementById('pitch-territory-shade')!;
  const territoryBar  = document.getElementById('pitch-territory-bar')!;
  const territoryHome = document.getElementById('pitch-territory-home')!;
  const phaseLabel   = document.getElementById('pitch-phase-label')!;
  const topLabel     = document.getElementById('pitch-top-label')!;
  const bottomLabel  = document.getElementById('pitch-bottom-label')!;
  const cardsTop     = document.getElementById('pitch-cards-top')!;
  const cardsBottom  = document.getElementById('pitch-cards-bottom')!;

  ball.innerHTML = BALL_SVG;

  let lastHalfTimeDone: boolean | null = null;
  let lastPossession: string | null = null;

  // Position + colour the flash element at a pitch coordinate, then retrigger
  // its keyframe via a forced reflow (same idiom as Scoreboard.popScore).
  const fireFlash = (topPct: number, leftPct: number, cls: string) => {
    flash.style.top  = `${topPct}%`;
    flash.style.left = `${leftPct}%`;
    flash.className = '';
    void flash.offsetWidth;
    flash.className = `flashing ${cls}`;
  };

  eventBus.on('engine:initialized', () => {
    lastHalfTimeDone = null;
    lastPossession = null;
  });

  eventBus.on('engine:event', ({ event }) => {
    const cls = flashClass(event);
    if (!cls) return;
    // The field rotates 180° in the second half; map the event's own
    // ball coords through the same transform the marker uses.
    const flip = lastHalfTimeDone === true;
    const topPct  = flip ? event.ballX : 100 - event.ballX;
    const leftPct = flip ? 100 - event.ballY : event.ballY;
    fireFlash(topPct, leftPct, cls);
  });

  eventBus.on('engine:stateChange', ({ state, display }) => {
    // All volatile data reads the beat-synced snapshot so the pitch matches the
    // narrated line; team identity (colours, shortNames) is fixed for the match
    // and read off live state — mirrors PitchStrip.
    const flip = display.halfTimeDone;

    // Ball: ballX (0 = home try line) drives the long/vertical axis, ballY the
    // short/horizontal axis. In the first half home defends the bottom, so a
    // low ballX sits low on the field; the half-time flip is a 180° rotation.
    const topPct  = flip ? display.ballX : 100 - display.ballX;
    const leftPct = flip ? 100 - display.ballY : display.ballY;
    ball.style.top  = `${topPct}%`;
    ball.style.left = `${leftPct}%`;

    const attackingTeam = display.possession === 'home' ? state.homeTeam : state.awayTeam;
    ball.style.color = colorOnDark(attackingTeam.color);

    // Territory tug-of-war bar — home portion width from the territory split.
    const terr = display.stats.territory;
    const total = terr.home + terr.away;
    const homePct = total > 0 ? (terr.home / total) * 100 : 50;
    territoryHome.style.width = `${homePct}%`;
    territoryHome.style.background = colorOnDark(state.homeTeam.color);
    territoryBar.style.background = colorOnDark(state.awayTeam.color);

    // Shade the half the ball is currently in, tinted by the team in possession.
    const ballInTopHalf = topPct < 50;
    shade.style.top    = ballInTopHalf ? '0' : '50%';
    shade.style.background = `color-mix(in oklch, ${colorOnDark(attackingTeam.color)} 16%, transparent)`;

    // Phase + attacking-team + direction label.
    const arrow = display.possession === 'home'
      ? (!flip ? '↑' : '↓')
      : (!flip ? '↓' : '↑');
    phaseLabel.textContent = `${display.phase.replace(/_/g, ' ')} · ${attackingTeam.shortName} ${arrow}`;
    phaseLabel.className = phaseClass(display.phase);

    // Card pips per side, reusing the scoreboard renderer. Home pips sit on the
    // end home defends (bottom in the first half, top after the flip).
    renderCardStack(flip ? cardsTop : cardsBottom, display.cards.home);
    renderCardStack(flip ? cardsBottom : cardsTop, display.cards.away);

    if (display.halfTimeDone !== lastHalfTimeDone) {
      lastHalfTimeDone = display.halfTimeDone;
      const bottomTeam = !flip ? state.homeTeam : state.awayTeam;
      const topTeam    = !flip ? state.awayTeam : state.homeTeam;
      topLabel.textContent    = topTeam.shortName;
      topLabel.style.color    = colorOnDark(topTeam.color);
      bottomLabel.textContent = bottomTeam.shortName;
      bottomLabel.style.color = colorOnDark(bottomTeam.color);
    }

    // Turnover flash — a possession change lights the current ball zone.
    if (lastPossession !== null && display.possession !== lastPossession) {
      fireFlash(topPct, leftPct, 'flash-turnover');
    }
    lastPossession = display.possession;
  });
}
