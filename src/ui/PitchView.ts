import { eventBus } from '../utils/eventBus';
import { colorOnDark } from './teamColors';
import { renderCardStack } from './Scoreboard';
import { BALL_SVG } from './PitchStrip';
import { phaseClass } from '../utils/phaseColor';
import { MatchPhase } from '../types/engine';
import type { GameEvent, MatchState } from '../types/match';
import { loadTickDelayMs } from './uiPrefs';
import { lineGapMs } from '../engine/balance';
import { toTop, toLeft, fromTop, fromLeft } from './pitchCoords';
import { initPitchPlayers } from './PitchPlayers';
import { kickFindsTouch, clampX, clampY, MAUL_HOOKER_DX } from './pitchChoreography';
import { SLOT } from '../engine/Slot';

// Which flash a key event warrants, or null for a beat we don't highlight. Kept
// deliberately curated — tries (and conversions, which carry the try phase),
// penalties, and cards — so the pitch doesn't strobe on every box-kick, lineout,
// or restart possession swap. Ball/line/dot coordinate mapping lives in pitchCoords.

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
  const territoryBar     = document.getElementById('pitch-territory-bar')!;
  const territoryHome    = document.getElementById('pitch-territory-home')!;
  const territoryPctHome = document.getElementById('pitch-territory-pct-home')!;
  const territoryPctAway = document.getElementById('pitch-territory-pct-away')!;
  const phaseLabel   = document.getElementById('pitch-phase-label')!;
  const topLabel     = document.getElementById('pitch-top-label')!;
  const bottomLabel  = document.getElementById('pitch-bottom-label')!;
  const cardsTop     = document.getElementById('pitch-cards-top')!;
  const cardsBottom  = document.getElementById('pitch-cards-bottom')!;
  const kickFlight   = document.getElementById('pitch-kick-flight')!;
  const field        = document.getElementById('pitch-2d-field')!;

  ball.innerHTML = BALL_SVG;
  kickFlight.innerHTML = BALL_SVG;

  // Player-dot layer (FM-style numbered circles for the involved players +
  // set-piece formations). Owns its own DOM/choreography; PitchView just feeds it
  // each beat and lets the carrier dot run the final carry leg via its follower seam.
  const players = initPitchPlayers(field);
  const follower = players.ballWalkFollower;
  // applyBeat runs in engine:event (before stateChange), so it reads the previous
  // beat's state for rosters — a one-beat lag matching StatsPanel's accepted lead.
  let cachedState: MatchState | null = null;

  let lastHalfTimeDone: boolean | null = null;
  // Cached from the most recent stateChange so the engine:event handler (which
  // fires before stateChange in the same beat) can determine attack direction.
  let cachedHalfTimeDone = false;
  // The current beat's phase, cached from engine:event for the stateChange handler —
  // display.phase is captured AFTER the phase transition (so it's the next phase), but
  // the lineout ball-on-touchline override needs the beat's own phase.
  let cachedEventPhase: MatchPhase | null = null;
  // The ball's current resting position (% top / left), tracked in-module rather
  // than re-read from ball.style — during an animation the inline style holds the
  // committed target, not the visual position. Ball starts at halfway (x=50,y=50
  // → 50%/50%). Updated by every position set (stateChange + the animators).
  let lastTop = toTop(50);
  let lastLeft = toLeft(50);
  // Set to true while a conversion kick-flight overlay is in progress so we hide the
  // main ball (the flight overlay shows the trajectory) until a LATER beat places it.
  let ballHiddenForKickFlight = false;
  // True only on the beat the flight was triggered — stops the same-beat stateChange
  // (which fires right after engine:event) from un-hiding the ball before it flies.
  let kickFlightThisBeat = false;
  let isPenaltyKickToTouch = false;

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
    const startLeft = toLeft(ballY);
    // Home attacks toward x=100 (top of screen) before half-time; inverted after.
    const attacksTop = (side === 'home') !== cachedHalfTimeDone;
    const targetTop  = attacksTop ? 4 : 96;
    // Success: split the posts (50% = toLeft(50)); failure: fly wide on the same
    // side the kick was taken from.
    const targetLeft = success ? toLeft(50) : (ballY < 50 ? toLeft(8) : toLeft(92));

    kickFlight.style.transition = 'none';
    kickFlight.style.top        = `${startTop}%`;
    kickFlight.style.left       = `${startLeft}%`;
    kickFlight.style.transform  = 'translate(-50%, -50%) scale(1)';
    kickFlight.style.opacity    = '1';
    kickFlight.style.setProperty('--kick-flight-glow', success ? 'var(--rm-stat-4)' : 'var(--rm-stat-1)');
    void kickFlight.offsetWidth; // force reflow to arm the transition
    kickFlight.style.transition = 'top 0.6s ease-in, left 0.6s ease-in, transform 0.6s ease-in, opacity 0.5s ease-in';
    kickFlight.style.top        = `${targetTop}%`;
    kickFlight.style.left       = `${targetLeft}%`;
    kickFlight.style.transform  = 'translate(-50%, -50%) scale(0.25)';
    kickFlight.style.opacity    = '0';
    setTimeout(() => { kickFlight.style.transition = 'none'; }, 700);
    // Hide the main ball immediately so it doesn't linger at the kick spot
    // while the flight overlay animates toward the posts.
    ball.style.opacity = '0';
    ballHiddenForKickFlight = true;
    kickFlightThisBeat = true;
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
    follower.cancel();           // stop the carrier dot riding a superseded walk
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

  const animateMovements = (event: GameEvent, lineCount: number, fwd: number, skipFollower = false) => {
    const kfs = event.movements!;
    const carrierFromStart = event.carrierFromStart ?? false;
    clearMovement();
    movementAnimating = true;
    // Fit the whole path inside the beat window so the ball never lags the
    // commentary; never faster than a readable floor.
    const beatWindow = stepMs * Math.max(1, lineCount);
    const legMs = Math.max(90, Math.min(stepMs, Math.round(beatWindow / kfs.length)));
    const { w, h } = hostDims();
    const final = kfs[kfs.length - 1];
    const finalTop = toTop(final.x), finalLeft = toLeft(final.y);
    // start (current position) then one keyframe per leg, all offset from the anchor.
    const frames: Keyframe[] = [
      { transform: offsetTransform(lastTop, lastLeft, finalTop, finalLeft, w, h) },
      ...kfs.map(kf => {
        const frame: Keyframe = { transform: offsetTransform(toTop(kf.x), toLeft(kf.y), finalTop, finalLeft, w, h) };
        if (kf.t !== undefined) frame.offset = kf.t;
        return frame;
      }),
    ];
    const duration = legMs * kfs.length;
    runAnim(frames, duration, 'linear', finalTop, finalLeft);

    // When the beat carries an authored choreography, the carrier and dominant
    // tackler are driven by the dedicated choreography loop in engine:event (which
    // reads event.choreography directly), so the follower stays out of it. The ball
    // above still animates either way.
    if (skipFollower) return;

    // Carrier dot: ride the final carry leg of the ball walk (or the whole path on a
    // direct pick-up). carrierFinalTop sits fwd*2.5 behind the ball's resting spot.
    const carrierFinalTop = toTop(clampX(final.x - fwd * 2.5));
    const carrierFinalLeft = finalLeft;
    let carrierFrames: Keyframe[];

    const ballPath = [{ x: fromTop(lastTop), y: fromLeft(lastLeft) }, ...kfs];
    const N = kfs.length;
    const carrierPath = ballPath.map(p => ({
      top: toTop(clampX(p.x - fwd * 2.5)),
      left: toLeft(p.y)
    }));

    let carryStartIdx = 0;
    if (!carrierFromStart) {
      for (let i = ballPath.length - 1; i > 0; i--) {
        if (ballPath[i].x !== ballPath[i - 1].x) {
          carryStartIdx = i - 1;
          break;
        }
      }
    }

    if (carrierFromStart) {
      // Direct pick-up (pick-and-go): rides the WHOLE ball path exactly in sync.
      carrierFrames = carrierPath.map((cp, i) => ({
        transform: offsetTransform(cp.top, cp.left, carrierFinalTop, carrierFinalLeft, w, h),
        offset: i / N
      }));
    } else {
      // Passed carry: hold at the receive point, then follow the ball.
      const receiveCp = carrierPath[carryStartIdx];
      carrierFrames = [
        { transform: offsetTransform(receiveCp.top, receiveCp.left, carrierFinalTop, carrierFinalLeft, w, h), offset: 0 },
        ...(carryStartIdx > 0 ? [{ transform: offsetTransform(receiveCp.top, receiveCp.left, carrierFinalTop, carrierFinalLeft, w, h), offset: carryStartIdx / N }] : [])
      ];
      for (let i = carryStartIdx + 1; i <= N; i++) {
        carrierFrames.push({
          transform: offsetTransform(carrierPath[i].top, carrierPath[i].left, carrierFinalTop, carrierFinalLeft, w, h),
          offset: i / N
        });
      }
    }

    follower.run(carrierFinalTop, carrierFinalLeft, carrierFrames, duration, 'linear');

    const domTackler = players.domTacklerEl;
    if (domTackler && players.domTacklerFrom) {
      let tacklerFrames: Keyframe[];
      const tacklerFromTop = toTop(players.domTacklerFrom.x);
      const tacklerFromLeft = toLeft(players.domTacklerFrom.y);
      const tacklerFinalTop = toTop(clampX(fromTop(carrierFinalTop) + fwd * 1.3));
      const tacklerFinalLeft = carrierFinalLeft;

      if (carrierFromStart) {
        tacklerFrames = [
          { transform: offsetTransform(tacklerFromTop, tacklerFromLeft, tacklerFinalTop, tacklerFinalLeft, w, h), offset: 0 },
          { transform: offsetTransform(tacklerFinalTop, tacklerFinalLeft, tacklerFinalTop, tacklerFinalLeft, w, h), offset: 1 }
        ];
      } else {
        const carryStartPct = carryStartIdx / N;
        const receiveCp = carrierPath[carryStartIdx];
        const tacklerReceiveTop = toTop(clampX(fromTop(receiveCp.top) + fwd * 1.3));
        const tacklerReceiveLeft = receiveCp.left;

        tacklerFrames = [
          { transform: offsetTransform(tacklerFromTop, tacklerFromLeft, tacklerFinalTop, tacklerFinalLeft, w, h), offset: 0 },
          ...(carryStartIdx > 0 ? [{ transform: offsetTransform(tacklerReceiveTop, tacklerReceiveLeft, tacklerFinalTop, tacklerFinalLeft, w, h), offset: carryStartPct }] : [])
        ];

        for (let i = carryStartIdx + 1; i <= N; i++) {
          const tTop = toTop(clampX(fromTop(carrierPath[i].top) + fwd * 1.3));
          tacklerFrames.push({
            transform: offsetTransform(tTop, carrierPath[i].left, tacklerFinalTop, tacklerFinalLeft, w, h),
            offset: i / N
          });
        }
      }
      follower.runTackler(tacklerFinalTop, tacklerFinalLeft, tacklerFrames, duration, 'linear');
    }
  };

  const animateKickDecision = (kfs: ReadonlyArray<{ x: number; y: number }>, lineCount: number, fwd: number, event: GameEvent) => {
    clearMovement();
    movementAnimating = true;
    const beatWindow = stepMs * Math.max(1, lineCount);
    const { w, h } = hostDims();
    const final = kfs[kfs.length - 1];
    const finalTop = toTop(final.x), finalLeft = toLeft(final.y);
    const duration = beatWindow;

    const frames: Keyframe[] = [
      { transform: offsetTransform(lastTop, lastLeft, finalTop, finalLeft, w, h), offset: 0 },
      { transform: offsetTransform(lastTop, lastLeft, finalTop, finalLeft, w, h), offset: 0.5 },
      { transform: offsetTransform(finalTop, finalLeft, finalTop, finalLeft, w, h), offset: 1.0 },
    ];
    runAnim(frames, duration, 'linear', finalTop, finalLeft);

    const fhKey = `${event.side === 'home' ? 'h' : 'a'}:${SLOT.FLY_HALF}`;
    const fhEl = field.querySelector(`[data-key="${fhKey}"]`);
    
    let startTop = lastTop;
    let startLeft = lastLeft;
    if (fhEl && (fhEl as HTMLElement).dataset.prevTop && (fhEl as HTMLElement).dataset.prevLeft) {
      startTop = parseFloat((fhEl as HTMLElement).dataset.prevTop!);
      startLeft = parseFloat((fhEl as HTMLElement).dataset.prevLeft!);
    } else {
      startTop = toTop(final.x + fwd * 6);
      startLeft = toLeft(final.y);
    }

    const carrierFinalTop = toTop(clampX(final.x - fwd * 2.5));
    const carrierFinalLeft = finalLeft;

    const carrierFrames: Keyframe[] = [
      { transform: offsetTransform(startTop, startLeft, carrierFinalTop, carrierFinalLeft, w, h), offset: 0 },
      { transform: offsetTransform(carrierFinalTop, carrierFinalLeft, carrierFinalTop, carrierFinalLeft, w, h), offset: 0.5 },
      { transform: offsetTransform(carrierFinalTop, carrierFinalLeft, carrierFinalTop, carrierFinalLeft, w, h), offset: 1.0 },
    ];
    
    follower.run(carrierFinalTop, carrierFinalLeft, carrierFrames, duration, 'linear');
  };

  eventBus.on('ui:speedChange', ({ delayMs }) => {
    stepMs = lineGapMs(delayMs);
  });

  eventBus.on('engine:initialized', () => {
    lastHalfTimeDone   = null;
    cachedHalfTimeDone = false;
    cachedEventPhase   = null;
    cachedState        = null;
    lastTop  = toTop(50);
    lastLeft = toLeft(50);
    ballHiddenForKickFlight = false;
    kickFlightThisBeat = false;
    ball.style.opacity = '';
    clearMovement();
    players.reset();
  });

  eventBus.on('engine:event', ({ event }) => {
    cachedEventPhase = event.phase;
    kickFlightThisBeat = false;
    isPenaltyKickToTouch = event.phase === MatchPhase.Penalty && kickFindsTouch(event);
    const cls = flashClass(event);
    if (cls) fireFlash(toTop(event.ballX), toLeft(event.ballY), cls);

    // Position the involved-player dots BEFORE the ball walk, so the carrier dot
    // exists when animateMovements asks the follower to ride it. attacksTop is the
    // same screen-direction expression triggerKickFlight uses.
    if (cachedState) {
      players.applyBeat(event, cachedState, (event.side === 'home') !== cachedHalfTimeDone);
    }

    // Formation chase: dots the choreographer tagged with a `from` animate from there
    // to their committed resting spot over the beat — the kick-off pack surging
    // forward (and the catcher running onto the ball) as the ball is in the air. Each
    // dot already rests at its (toX,toY); WAAPI offsets it back to (fromX,fromY) and
    // eases forward (the same anchor-and-offset pattern as the ball/scrum-half dots).
    if (players.chaseDots.length) {
      const { w, h } = hostDims();
      const dur = Math.max(300, Math.min(stepMs, 650));
      for (const d of players.chaseDots) {
        d.el.animate([
          { transform: offsetTransform(toTop(d.fromX), toLeft(d.fromY), toTop(d.toX), toLeft(d.toY), w, h) },
          { transform: 'translate(-50%, -50%)' },
        ], { duration: dur, easing: 'ease-out' });
      }
    }

    // Ball animation for this beat, in priority order:
    //  1. An open-field kick → lob it to the landing (scale apex + eased flight).
    //  2. A maul → the whole pack glides forward as a bound unit to the post-drive
    //     cluster and the ball slides to the hooker at the tail; checked BEFORE the
    //     movements branch so a won drive doesn't peel the hooker off onto the ball.
    //  3. A multi-leg phase → walk the ball through each engine movement keyframe.
    //     This covers the FirstPhase off a set piece too: the engine's movements[]
    //     already encode the pass-by-pass lateral sweep AND the carrier's forward
    //     drive, and end exactly at the authoritative ball position — so the ball
    //     follows the same steps the match engine took and never teleports when the
    //     next phase reconciles. (An earlier dot-routing path invented its own
    //     waypoints, diverging from the engine and snapping back at the breakdown.)
    //  4. Otherwise cancel any in-flight animation; stateChange sets the position.
    // The kick check is gated on the ball actually moving, so no-move kick beats
    // (the coin-toss / pre-kick announce) fall through rather than pulsing in place.
    if (KICK_PHASES.has(event.phase) || kickFindsTouch(event)) {
      const tgtTop = toTop(event.ballX);
      // A kick to touch should visibly cross the touchline. The engine resolves the
      // ball to the lineout mark (~5m infield); aim the lob just past the nearer
      // touchline so it reads as going OUT, then the lineout beat forms at the mark.
      const tgtLeft = kickFindsTouch(event)
        ? toLeft(event.ballY < 50 ? -3 : 103)
        : toLeft(event.ballY);
      if (Math.abs(lastTop - tgtTop) > 1 || Math.abs(lastLeft - tgtLeft) > 1) {
        // Ball lobs to the landing; the kick-off pack chase is driven by the
        // chaseDots block above (the choreographer tags those dots with a `from`).
        animateKickArc(tgtTop, tgtLeft);
      } else {
        clearMovement();
      }
    } else if (event.phase === MatchPhase.Maul) {
      // Maul (always off a lineout): the whole pack glides forward into the maul
      // cluster as a bound unit (Layer-3 dot-transitioning, set in applyBeat) while
      // the ball slides to the hooker at the tail of the drive (dx=7.5 behind the
      // mark — in sync with MAUL_ATK_ROWS' hooker depth). Handles WON drives too —
      // event.ballX has already advanced by the gain, so the cluster and ball finish
      // further upfield, reading as a forward drive. Ahead of the movements branch on
      // purpose: a won maul must NOT go through animateMovements, which would peel the
      // hooker off the pack onto the ball.
      clearMovement();
      movementAnimating = true;
      const attacksTop = (event.side === 'home') !== cachedHalfTimeDone;
      const fwd = attacksTop ? 1 : -1;
      const hookerTop  = toTop(clampX(event.ballX - fwd * MAUL_HOOKER_DX));
      const hookerLeft = toLeft(event.ballY);
      const { w, h } = hostDims();
      runAnim([
        { transform: offsetTransform(lastTop, lastLeft, hookerTop, hookerLeft, w, h) },
        { transform: offsetTransform(hookerTop, hookerLeft, hookerTop, hookerLeft, w, h) },
      ], Math.max(200, Math.min(stepMs, 400)), 'ease-in', hookerTop, hookerLeft);
    } else if (event.movements && event.movements.length >= 2) {
      const isKickDecision = event.narration.steps.some(s => s.kind === 'phase_outcome' && s.key === 'kick_decision');
      // A kick-decision with NO authored choreography uses the bespoke kicker-step
      // animation (procedural ball pacing). When a kick_decision choreography IS
      // present, route the ball through animateMovements like every other authored
      // play so it honours the authored `t` offsets and stays in sync with the
      // choreographed dots — animateKickDecision's fixed 0/0.5/1 pacing would not.
      if (isKickDecision && !event.choreography) {
        animateKickDecision(event.movements, event.narration.steps.length,
          ((event.side === 'home') !== cachedHalfTimeDone) ? 1 : -1, event);
      } else {
        animateMovements(event, event.narration.steps.length,
          ((event.side === 'home') !== cachedHalfTimeDone) ? 1 : -1, !!event.choreography);
      }
    } else {
      clearMovement();
    }

    if (event.choreography && event.choreography.length > 0) {
      const { w, h } = hostDims();
      const lineCount = event.narration.steps.length;
      const beatWindow = stepMs * Math.max(1, lineCount);
      let duration = beatWindow;
      if (event.movements && event.movements.length > 0) {
        const legMs = Math.max(90, Math.min(stepMs, Math.round(beatWindow / event.movements.length)));
        duration = legMs * event.movements.length;
      }
      for (const ch of event.choreography) {
        const key = `${ch.side}:${ch.id}`;
        const el = field.querySelector(`[data-key="${key}"]`) as HTMLElement;
        if (!el) continue;

        const finalTop = parseFloat(el.style.top || '0');
        const finalLeft = parseFloat(el.style.left || '0');
        const frames = ch.movements.map((kf: any) => ({
          transform: offsetTransform(toTop(kf.x), toLeft(kf.y), finalTop, finalLeft, w, h),
          offset: kf.t
        }));
        
        el.animate(frames, { duration, easing: 'linear' });
      }
    }

    // Scrum SH sweep: both #9s animate from their loosehead start positions to
    // their committed final positions (2 units behind their #8) during the beat.
    if (event.phase === MatchPhase.Scrum) {
      const attacksTopScrum = (event.side === 'home') !== cachedHalfTimeDone;
      const fwdS = attacksTopScrum ? 1 : -1;
      const { w, h } = hostDims();
      const dur = Math.max(300, Math.min(stepMs, 500));
      // Start 9 units infield from the ball (away from the nearer touchline) so
      // the sweep arc has enough travel to read clearly on mobile.
      const startLooseY = event.ballY + (event.ballY < 50 ? 9 : -9);

      const sweepSH = (el: HTMLElement | null, startPitchX: number) => {
        if (!el) return;
        const startTop  = toTop(clampX(startPitchX));
        const startLeft = toLeft(clampY(startLooseY));
        const finalTop  = parseFloat(el.style.top);
        const finalLeft = parseFloat(el.style.left);
        el.animate([
          { transform: offsetTransform(startTop, startLeft, finalTop, finalLeft, w, h) },
          { transform: 'translate(-50%, -50%)' },
        ], { duration: dur, easing: 'ease-in-out' });
      };

      sweepSH(players.atkScrumHalfEl, event.ballX - fwdS * 2);
      sweepSH(players.defScrumHalfEl, event.ballX + fwdS * 2);
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
    cachedState = state;   // for the next beat's player-dot rosters (engine:event runs first)
    const attackingTeam = display.possession === 'home' ? state.homeTeam : state.awayTeam;
    const attackColor = colorOnDark(attackingTeam.color);

    // Restore ball opacity if it was hidden for a kick-flight overlay — but NOT on the
    // beat that triggered the flight (this stateChange fires immediately after that
    // engine:event), or the ball would un-hide before it flies. A later beat un-hides it.
    if (ballHiddenForKickFlight && !kickFlightThisBeat) {
      ball.style.opacity = '';
      ballHiddenForKickFlight = false;
    }

    // Ball: ballX is absolute (x=100 end at top, x=0 at bottom) — the field is
    // fixed on screen and only the end labels swap at half-time, mirroring the
    // 1D PitchStrip. toTop() maps it onto the 8%–92% field-of-play band so the
    // ball sits on the painted lines. toLeft() maps ballY into the touchline band.
    const topPct  = toTop(display.ballX);
    // At a lineout the ball sits ON the nearer touchline (the throw-in point), not the
    // engine's lineout mark ~5m infield — so it doesn't slide in when the lineout forms,
    // and the throw-in becomes the first leg of the next phase's ball walk.
    const leftPct = cachedEventPhase === MatchPhase.Lineout
      ? toLeft(display.ballY < 50 ? 0 : 100)
      : toLeft(display.ballY);
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
    if (isPenaltyKickToTouch) {
      ball.style.setProperty('--ball-glow', `color-mix(in oklch, var(--rm-stat-4) 80%, transparent)`);
    } else {
      ball.style.setProperty('--ball-glow', `color-mix(in oklch, ${attackColor} 60%, transparent)`);
    }

    // Territory tug-of-war bar — only the home-portion width is volatile; the
    // home/away fill colours are fixed for the match and bound in the gate below.
    const terr = display.stats.territory;
    const total = terr.home + terr.away;
    const homePct = total > 0 ? (terr.home / total) * 100 : 50;
    const awayPct = 100 - homePct;
    territoryHome.style.width = `${homePct}%`;
    territoryPctHome.textContent = `${Math.round(homePct)}%`;
    territoryPctAway.textContent = `${Math.round(awayPct)}%`;
    territoryPctHome.className = `stat-val${homePct > 50 ? ' stat-winner' : ''}`;
    territoryPctAway.className = `stat-val${awayPct > 50 ? ' stat-winner' : ''}`;

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
