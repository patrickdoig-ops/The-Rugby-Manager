// The player-dot DOM layer for the 2D pitch: a dumb element pool that renders
// and fades whatever `Placed[]` the pure choreographer hands it (it knows nothing
// about events, phases, or rugby), plus a thin controller PitchView drives and a
// BallWalkFollower seam that lets the carrier dot run the final leg of the ball walk.

import type { GameEvent, MatchState } from '../types/match';
import { MatchPhase } from '../types/engine';
import { SLOT } from '../engine/Slot';
import { toTop, toLeft } from './pitchCoords';
import { choreograph } from './pitchChoreography';

// The seam by which the carrier dot follows the ball's WAAPI walk. PitchView owns
// the walk and calls run/cancel at the same two lifecycle points it manages the
// ball itself; it never learns what (if anything) is following. `run` commits the
// carrier dot's resting anchor (just behind the ball) and offset-animates it
// through PitchView's bespoke carrier keyframes (hold during the passes, then run
// the final carry leg onto the ball).
export interface BallWalkFollower {
  run(finalTopPct: number, finalLeftPct: number, frames: Keyframe[], duration: number, easing: string): void;
  cancel(): void;
}

export interface PitchPlayers {
  applyBeat(event: GameEvent, state: MatchState, attacksTop: boolean): void;
  ballWalkFollower: BallWalkFollower;
  chaserEl: HTMLElement | null;       // kickoff chaser dot placed this beat, for PitchView to animate
  atkScrumHalfEl: HTMLElement | null; // attacking #9 placed at scrum final pos, for PitchView to sweep
  defScrumHalfEl: HTMLElement | null; // defending #9 placed at scrum final pos, for PitchView to sweep
  reset(): void;
}

export function initPitchPlayers(field: HTMLElement): PitchPlayers {
  const pool = new Map<string, HTMLElement>();   // key -> dot (kept while hidden)
  let persistedKeys = new Set<string>();         // keys shown since last phase change
  let currentPhase: string | null = null;        // phase of the last beat
  let prevBallX = 50;                            // event.ballX from the previous beat
  let prevBallY = 50;                            // event.ballY from the previous beat
  let carrierEl: HTMLElement | null = null;      // the on-ball dot for the current beat
  let chaserEl: HTMLElement | null = null;       // kickoff chaser dot (PitchView animates it forward)
  let atkSHEl: HTMLElement | null = null;        // attacking #9 at scrum final pos (PitchView sweeps)
  let defSHEl: HTMLElement | null = null;        // defending #9 at scrum final pos (PitchView sweeps)
  let carrierAnim: Animation | null = null;
  let animatedEl: HTMLElement | null = null;     // the dot carrierAnim is driving (may differ from carrierEl after a beat flip)

  const ensureDot = (key: string, color: string, text: string, jersey: number): HTMLElement => {
    let el = pool.get(key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'pitch-dot';
      // Colour/contrast are fixed for a key (side ⇒ team ⇒ colour) — set once.
      el.style.setProperty('--dot-color', color);
      el.style.setProperty('--dot-text', text);
      field.appendChild(el);
      pool.set(key, el);
    }
    // Jersey can change for a slot across a substitution (bench number), so keep it current.
    el.textContent = String(jersey);
    return el;
  };

  // Thin orchestration: pure choreograph → render/fade. ~12 lines, no rugby logic.
  const applyBeat = (event: GameEvent, state: MatchState, attacksTop: boolean): void => {
    const placed = choreograph(event, state, attacksTop, currentPhase, prevBallX, prevBallY);
    const nextKeys = new Set(placed.map(p => p.key));

    // Key of the attacking #9 whose position we must preserve on the transition
    // beat from a set-piece into FirstPhase — they hold their set-piece position
    // (lineout mark or behind-#8) so the first-phase dot reads as a continuation.
    let setpieceSHKey: string | null = null;

    // On phase change, fade out persisted dots that aren't in the new beat.
    if (event.phase !== currentPhase) {
      // Lineout→Maul: enable top/left transitions so forwards animate from their
      // lineout spread into the maul cluster rather than just appearing there.
      if (currentPhase === MatchPhase.Lineout && event.phase === MatchPhase.Maul) {
        field.classList.add('dot-transitioning');
        setTimeout(() => field.classList.remove('dot-transitioning'), 600);
      }
      // Lineout/Scrum→FirstPhase: keep set-piece forwards visible through the whole
      // first phase — carry persistedKeys forward so they don't clear at the boundary.
      // They fade normally when FirstPhase itself ends.
      const keepLineout = (currentPhase === MatchPhase.Lineout || currentPhase === MatchPhase.Scrum)
        && event.phase === MatchPhase.FirstPhase;
      if (keepLineout) {
        // Attacking #9 must start FirstPhase at their set-piece position (lineout
        // mark or behind their #8 in a scrum). Skip the position update for their
        // dot this beat only; subsequent beats will reposition them normally.
        setpieceSHKey = `${event.side === 'home' ? 'h' : 'a'}:${SLOT.SCRUM_HALF}`;
      } else {
        for (const key of persistedKeys) {
          if (!nextKeys.has(key)) pool.get(key)?.classList.remove('visible');
        }
        persistedKeys = new Set();
      }
      currentPhase = event.phase;
    }

    carrierEl = null;
    chaserEl = null;
    atkSHEl = null;
    defSHEl = null;
    for (const p of placed) {
      persistedKeys.add(p.key);
      const el = ensureDot(p.key, p.color, p.text, p.jersey);
      // Preserve the set-piece #9 position on the Lineout/Scrum→FirstPhase beat.
      if (p.key !== setpieceSHKey) {
        el.style.top = `${toTop(p.x)}%`;
        el.style.left = `${toLeft(p.y)}%`;
      }
      el.classList.add('visible');
      if (p.isCarrier) carrierEl = el;
      if (p.isChaser) chaserEl = el;
      if (p.scrumHalfRole === 'atk') atkSHEl = el;
      if (p.scrumHalfRole === 'def') defSHEl = el;
    }
    prevBallX = event.ballX;
    prevBallY = event.ballY;
  };

  // Reset whatever dot the (now-stopped) carrier animation was driving — tracked
  // separately from carrierEl because applyBeat reassigns carrierEl on the next
  // beat before clearMovement/cancel runs, so cancel() must restore the dot that
  // actually had transition:none, not the current beat's carrier.
  const stopCarrierAnim = () => {
    if (carrierAnim) { carrierAnim.cancel(); carrierAnim = null; }
    if (animatedEl) { animatedEl.style.transition = ''; animatedEl = null; }
  };

  // Carrier dot rides only the FINAL carry leg of the ball walk. PitchView builds
  // keyframes that hold the dot still at the receive point through every pass, then
  // run it onto the ball into contact — so the credited carrier ends on the ball
  // without appearing to be passed along the whole chain. top/left transition is
  // disabled while the WAAPI (transform) owns the dot, guarding against the
  // dot-transitioning class (Lineout→Maul) tweening the committed anchor underneath.
  const ballWalkFollower: BallWalkFollower = {
    run(finalTopPct, finalLeftPct, frames, duration, easing) {
      stopCarrierAnim();
      const el = carrierEl;
      if (!el) return;
      el.style.transition = 'none';
      el.style.top  = `${finalTopPct}%`;
      el.style.left = `${finalLeftPct}%`;
      const anim = el.animate(frames, { duration, easing });
      carrierAnim = anim;
      animatedEl = el;
      anim.onfinish = () => {
        if (carrierAnim !== anim) return;   // superseded by a later beat
        el.style.transition = '';
        carrierAnim = null;
        animatedEl = null;
      };
    },
    cancel() { stopCarrierAnim(); },
  };

  const reset = (): void => {
    ballWalkFollower.cancel();
    field.classList.remove('dot-transitioning');
    for (const el of pool.values()) el.remove();
    pool.clear();
    persistedKeys = new Set();
    currentPhase = null;
    prevBallX = 50;
    prevBallY = 50;
    carrierEl = null;
    chaserEl = null;
    atkSHEl = null;
    defSHEl = null;
  };

  return {
    applyBeat, ballWalkFollower,
    get chaserEl()       { return chaserEl; },
    get atkScrumHalfEl() { return atkSHEl; },
    get defScrumHalfEl() { return defSHEl; },
    reset,
  };
}
