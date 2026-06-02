import { eventBus } from '../utils/eventBus';
import { colorOnDark } from './teamColors';
import { renderCardStack } from './Scoreboard';
import { BALL_SVG } from './PitchStrip';
import { phaseClass } from '../utils/phaseColor';
import type { GameEvent } from '../types/match';

// Which flash a key event warrants, or null for a beat we don't highlight. Kept
// deliberately curated — tries (and conversions, which carry the try phase),
// penalties, and cards — so the pitch doesn't strobe on every box-kick, lineout,
// or restart possession swap.
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
  });

  eventBus.on('engine:event', ({ event }) => {
    const cls = flashClass(event);
    if (!cls) return;
    // Map the event's own ball coords with the same absolute transform the
    // marker uses (x=100 end at top); the field is fixed, only labels swap.
    fireFlash(100 - event.ballX, event.ballY, cls);
  });

  eventBus.on('engine:stateChange', ({ state, display }) => {
    // All volatile data reads the beat-synced snapshot so the pitch matches the
    // narrated line; team identity (colours, shortNames) is fixed for the match
    // and read off live state — mirrors PitchStrip.
    const flip = display.halfTimeDone;
    const attackingTeam = display.possession === 'home' ? state.homeTeam : state.awayTeam;
    const attackColor = colorOnDark(attackingTeam.color);

    // Ball: ballX is absolute (x=100 end at top, x=0 at bottom) — the field is
    // fixed on screen and only the end labels swap at half-time, mirroring the
    // 1D PitchStrip. ballY drives the short/horizontal axis.
    const topPct  = 100 - display.ballX;
    const leftPct = display.ballY;
    ball.style.top  = `${topPct}%`;
    ball.style.left = `${leftPct}%`;
    // The shared BALL_SVG paints itself from --rm-amber; override that token on
    // the ball element so the glow takes the possessing side's colour.
    ball.style.setProperty('--ball-glow', `color-mix(in oklch, ${attackColor} 60%, transparent)`);

    // Territory tug-of-war bar — only the home-portion width is volatile; the
    // home/away fill colours are fixed for the match and bound in the gate below.
    const terr = display.stats.territory;
    const total = terr.home + terr.away;
    territoryHome.style.width = `${total > 0 ? (terr.home / total) * 100 : 50}%`;

    // Shade the half the ball is currently in, tinted by the team in possession.
    shade.style.top = topPct < 50 ? '0' : '50%';
    shade.style.background = `color-mix(in oklch, ${attackColor} 16%, transparent)`;

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

    // End labels + fixed territory-bar colours only need (re)setting when the
    // half-time state changes — including the initial null→false transition.
    if (display.halfTimeDone !== lastHalfTimeDone) {
      lastHalfTimeDone = display.halfTimeDone;
      territoryHome.style.background = colorOnDark(state.homeTeam.color);
      territoryBar.style.background  = colorOnDark(state.awayTeam.color);
      const bottomTeam = !flip ? state.homeTeam : state.awayTeam;
      const topTeam    = !flip ? state.awayTeam : state.homeTeam;
      topLabel.textContent    = topTeam.shortName;
      topLabel.style.color    = colorOnDark(topTeam.color);
      bottomLabel.textContent = bottomTeam.shortName;
      bottomLabel.style.color = colorOnDark(bottomTeam.color);
    }
  });
}
