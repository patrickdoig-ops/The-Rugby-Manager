import { eventBus } from '../utils/eventBus';
import { colorOnDark } from './teamColors';
import { renderCardStack } from './Scoreboard';
import { BALL_SVG } from './PitchStrip';
import { phaseClass } from '../utils/phaseColor';
import { MatchPhase } from '../types/engine';
import type { GameEvent } from '../types/match';
import { loadTickDelayMs } from './uiPrefs';
import { lineGapMs } from '../engine/balance';

// Which flash a key event warrants, or null for a beat we don't highlight. Kept
// deliberately curated — tries (and conversions, which carry the try phase),
// penalties, and cards — so the pitch doesn't strobe on every box-kick, lineout,
// or restart possession swap.
// The 100m field of play occupies the 8%–92% band of the field height; the
// 0–8% / 92–100% margins are the in-goal areas (where the end labels sit). Both
// the ball marker and the painted lines map through this, so the ball always
// sits on the right marking. x=100 → 8% (one try line), x=0 → 92% (the other).
const INGOAL_PCT = 8;
const PLAY_SPAN = 84;
const toTop = (ballX: number): number => INGOAL_PCT + ((100 - ballX) / 100) * PLAY_SPAN;

// Open-field kick phases whose ball flight gets the lob treatment (scale up to an
// apex, settle on landing). Goal kicks (ConversionKick / Penalty) are NOT here —
// they keep their dedicated kick-flight overlay (triggerKickFlight).
const KICK_PHASES = new Set<MatchPhase>([
  MatchPhase.KickOff, MatchPhase.BoxKick, MatchPhase.TacticalKick, MatchPhase.DropOut22,
]);

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
  const kickFlight   = document.getElementById('pitch-kick-flight')!;

  ball.innerHTML = BALL_SVG;
  kickFlight.innerHTML = BALL_SVG;

  let lastHalfTimeDone: boolean | null = null;
  // Cached from the most recent stateChange so the engine:event handler (which
  // fires before stateChange in the same beat) can determine attack direction.
  let cachedHalfTimeDone = false;
  // The ball's current resting position (% top / left), tracked in-module rather
  // than re-read from ball.style — during an animation the inline style holds the
  // committed target, not the visual position. Ball starts at halfway (x=50,y=50
  // → 50%/50%). Updated by every position set (stateChange + the animators).
  let lastTop = 50;
  let lastLeft = 50;

  // Position + colour the flash element at a pitch coordinate, then retrigger
  // its keyframe via a forced reflow (same idiom as Scoreboard.popScore).
  const fireFlash = (topPct: number, leftPct: number, cls: string) => {
    flash.style.top  = `${topPct}%`;
    flash.style.left = `${leftPct}%`;
    flash.className = '';
    void flash.offsetWidth;
    flash.className = `flashing ${cls}`;
  };

  // Animate the kick-flight overlay from the kick position toward the posts
  // (success = through centre, failure = wide). The element is a copy of the
  // main ball that scales down and fades out, giving a "going into the
  // distance" read without touching the main ball's CSS transitions.
  const triggerKickFlight = (ballX: number, ballY: number, success: boolean, side: string) => {
    const startTop  = toTop(ballX);
    const startLeft = ballY;
    // Home attacks toward x=100 (top of screen) before half-time; inverted after.
    const attacksTop = (side === 'home') !== cachedHalfTimeDone;
    const targetTop  = attacksTop ? 4 : 96;
    // Success: split the posts (50%); failure: fly wide on the same side the
    // kick was taken from, so a right-of-centre kick misses right.
    const targetLeft = success ? 50 : (ballY < 50 ? 12 : 88);

    kickFlight.style.transition = 'none';
    kickFlight.style.top        = `${startTop}%`;
    kickFlight.style.left       = `${startLeft}%`;
    kickFlight.style.transform  = 'translate(-50%, -50%) scale(1)';
    kickFlight.style.opacity    = '1';
    void kickFlight.offsetWidth; // force reflow to arm the transition
    kickFlight.style.transition = 'top 0.6s ease-in, left 0.6s ease-in, transform 0.6s ease-in, opacity 0.5s ease-in';
    kickFlight.style.top        = `${targetTop}%`;
    kickFlight.style.left       = `${targetLeft}%`;
    kickFlight.style.transform  = 'translate(-50%, -50%) scale(0.25)';
    kickFlight.style.opacity    = '0';
    setTimeout(() => { kickFlight.style.transition = 'none'; }, 700);
  };

  // Per-movement ball animation. A phase can move the ball through several legs
  // (carry upfield, then sweep wide); GameEvent.movements carries that path so the
  // ball walks leg-by-leg instead of jumping diagonally to the final spot. Open-
  // field kicks lob to the landing (scale apex). Both animate compositor-only
  // `transform` (the ball's top/left are committed to the resting position once,
  // then a translate offset slides it) so a dense passage never thrashes layout.
  // Paced on its own clock, decoupled from the commentary line cadence (which
  // CommentaryFeed / CommentaryStreamer own) — leg-count need not equal line-count.
  // The per-leg duration tracks the same speed-derived cadence the feed uses.
  let stepMs = lineGapMs(loadTickDelayMs());
  // In-flight WAAPI animation (walk or lob), if any — cancelled when interrupted.
  let arcAnim: Animation | null = null;
  // True while an animation owns the ball — the stateChange handler then leaves
  // the ball alone (the animation ends exactly at display.ballX/ballY = the final
  // keyframe / landing, which the animator has committed to lastTop/lastLeft).
  let movementAnimating = false;

  const clearMovement = () => {
    if (arcAnim) { arcAnim.cancel(); arcAnim = null; }
    movementAnimating = false;
    ball.style.transition = '';  // restore the default CSS ease for single-jump beats
  };

  // Pitch pixel dimensions (the ball's offsetParent), read once per animation to
  // convert %-of-pitch deltas into the px translate the keyframes use.
  const hostDims = (): { w: number; h: number } => {
    const host = ball.offsetParent as HTMLElement | null;
    return { w: host?.clientWidth ?? 0, h: host?.clientHeight ?? 0 };
  };

  // Transform that visually places the ball at (top,left)% while its layout box
  // rests at the (finalTop,finalLeft)% anchor — the centring −50% plus a px
  // translate for the offset from the anchor, plus an optional scale (kick lift).
  const offsetTransform = (
    top: number, left: number, finalTop: number, finalLeft: number,
    w: number, h: number, scale = 1,
  ): string => {
    const dx = ((left - finalLeft) / 100) * w;
    const dy = ((top - finalTop) / 100) * h;
    return `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`;
  };

  // Commit the ball's resting position (no CSS tween — the WAAPI transform owns
  // the motion) and record it as the tracked last position.
  const restAt = (topPct: number, leftPct: number) => {
    ball.style.transition = 'none';
    ball.style.top  = `${topPct}%`;
    ball.style.left = `${leftPct}%`;
    lastTop = topPct;
    lastLeft = leftPct;
  };

  // Run a transform keyframe animation that starts visually at lastTop/lastLeft,
  // ends at the final anchor, and commits the anchor as the resting position.
  const runAnim = (frames: Keyframe[], duration: number, easing: string, finalTop: number, finalLeft: number) => {
    restAt(finalTop, finalLeft);
    const anim = ball.animate(frames, { duration, easing });
    arcAnim = anim;
    anim.onfinish = () => {
      if (arcAnim !== anim) return;   // superseded by a later beat
      movementAnimating = false;
      arcAnim = null;
      ball.style.transition = '';
    };
  };

  // Kick lob: a kick from directly above is a straight line, so the "arc" is a
  // scale lift (up to an apex and back) over the straight travel — reads as a ball
  // in the air rather than a flat carry slide.
  const animateKickArc = (tgtTop: number, tgtLeft: number) => {
    clearMovement();
    movementAnimating = true;
    const dur = Math.max(300, Math.min(stepMs, 650));
    const { w, h } = hostDims();
    const midTop = (lastTop + tgtTop) / 2, midLeft = (lastLeft + tgtLeft) / 2;
    runAnim([
      { transform: offsetTransform(lastTop, lastLeft, tgtTop, tgtLeft, w, h, 1) },
      { transform: offsetTransform(midTop, midLeft, tgtTop, tgtLeft, w, h, 1.5), offset: 0.5 },
      { transform: offsetTransform(tgtTop, tgtLeft, tgtTop, tgtLeft, w, h, 1) },
    ], dur, 'ease-in-out', tgtTop, tgtLeft);
  };

  const animateMovements = (kfs: ReadonlyArray<{ x: number; y: number }>, lineCount: number) => {
    clearMovement();
    movementAnimating = true;
    // Fit the whole path inside the beat window so the ball never lags the
    // commentary; never faster than a readable floor.
    const beatWindow = stepMs * Math.max(1, lineCount);
    const legMs = Math.max(90, Math.min(stepMs, Math.round(beatWindow / kfs.length)));
    const { w, h } = hostDims();
    const final = kfs[kfs.length - 1];
    const finalTop = toTop(final.x), finalLeft = final.y;
    // start (current position) then one keyframe per leg, all offset from the anchor.
    const frames: Keyframe[] = [
      { transform: offsetTransform(lastTop, lastLeft, finalTop, finalLeft, w, h) },
      ...kfs.map(kf => ({ transform: offsetTransform(toTop(kf.x), kf.y, finalTop, finalLeft, w, h) })),
    ];
    runAnim(frames, legMs * kfs.length, 'linear', finalTop, finalLeft);
  };

  eventBus.on('ui:speedChange', ({ delayMs }) => {
    stepMs = lineGapMs(delayMs);
  });

  eventBus.on('engine:initialized', () => {
    lastHalfTimeDone    = null;
    cachedHalfTimeDone  = false;
    lastTop = 50;
    lastLeft = 50;
    clearMovement();
  });

  eventBus.on('engine:event', ({ event }) => {
    const cls = flashClass(event);
    if (cls) fireFlash(toTop(event.ballX), event.ballY, cls);

    // Ball animation for this beat, in priority order:
    //  1. An open-field kick → lob it to the landing (scale apex + eased flight).
    //  2. A multi-leg phase → walk the ball through each movement keyframe.
    //  3. Otherwise cancel any in-flight animation; stateChange sets the position.
    // The kick check is gated on the ball actually moving, so no-move kick beats
    // (the coin-toss / pre-kick announce) fall through rather than pulsing in place.
    if (KICK_PHASES.has(event.phase)) {
      const tgtTop = toTop(event.ballX), tgtLeft = event.ballY;
      if (Math.abs(lastTop - tgtTop) > 1 || Math.abs(lastLeft - tgtLeft) > 1) {
        animateKickArc(tgtTop, tgtLeft);
      } else {
        clearMovement();
      }
    } else if (event.movements && event.movements.length >= 2) {
      animateMovements(event.movements, event.narration.steps.length);
    } else {
      clearMovement();
    }

    // Kick-at-goal result: animate the ball flying toward (or past) the posts.
    for (const step of event.narration.steps) {
      if (step.kind !== 'phase_outcome') continue;
      if (step.phase !== MatchPhase.ConversionKick && step.phase !== MatchPhase.Penalty) continue;
      if (step.key !== 'success' && step.key !== 'kick_for_goal' && step.key !== 'miss') continue;
      triggerKickFlight(event.ballX, event.ballY, step.key !== 'miss', event.side);
      break;
    }
  });

  eventBus.on('engine:stateChange', ({ state, display }) => {
    // All volatile data reads the beat-synced snapshot so the pitch matches the
    // narrated line; team identity (colours, shortNames) is fixed for the match
    // and read off live state — mirrors PitchStrip.
    const flip = display.halfTimeDone;
    cachedHalfTimeDone = flip;
    const attackingTeam = display.possession === 'home' ? state.homeTeam : state.awayTeam;
    const attackColor = colorOnDark(attackingTeam.color);

    // Ball: ballX is absolute (x=100 end at top, x=0 at bottom) — the field is
    // fixed on screen and only the end labels swap at half-time, mirroring the
    // 1D PitchStrip. toTop() maps it onto the 8%–92% field-of-play band so the
    // ball sits on the painted lines. ballY drives the short/horizontal axis.
    const topPct  = toTop(display.ballX);
    const leftPct = display.ballY;
    // While an animation is running it owns the ball and ends exactly here
    // (display.ballX/ballY = the final keyframe / landing) — don't fight it.
    // Otherwise set the resting position (CSS-eased) and track it.
    if (!movementAnimating) {
      ball.style.top  = `${topPct}%`;
      ball.style.left = `${leftPct}%`;
      lastTop = topPct;
      lastLeft = leftPct;
    }
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
      // Full team name, large, in each in-goal — names the end a side defends.
      topLabel.textContent    = topTeam.name;
      topLabel.style.color    = colorOnDark(topTeam.color);
      bottomLabel.textContent = bottomTeam.name;
      bottomLabel.style.color = colorOnDark(bottomTeam.color);
    }
  });
}
