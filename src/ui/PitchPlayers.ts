// The player-dot DOM layer for the 2D pitch: a dumb element pool that renders
// and fades whatever `Placed[]` the pure choreographer hands it (it knows nothing
// about events, phases, or rugby), plus a thin controller PitchView drives and a
// BallWalkFollower seam that lets the carrier dot ride the ball's per-leg walk.

import type { GameEvent, MatchState } from '../types/match';
import { toTop, toLeft } from './pitchCoords';
import { choreograph } from './pitchChoreography';

// The seam by which the carrier dot follows the ball's WAAPI walk. PitchView owns
// the walk and calls start/cancel at the same two lifecycle points it manages the
// ball itself; it never learns what (if anything) is following.
export interface BallWalkFollower {
  start(frames: Keyframe[], duration: number, easing: string): void;
  cancel(): void;
}

export interface PitchPlayers {
  applyBeat(event: GameEvent, state: MatchState, attacksTop: boolean): void;
  ballWalkFollower: BallWalkFollower;
  reset(): void;
}

export function initPitchPlayers(field: HTMLElement): PitchPlayers {
  const pool = new Map<string, HTMLElement>();   // key -> dot (kept while hidden)
  let persistedKeys = new Set<string>();         // keys shown since last phase change
  let currentPhase: string | null = null;        // phase of the last beat
  let carrierEl: HTMLElement | null = null;      // the on-ball dot for the current beat
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
    const placed = choreograph(event, state, attacksTop);
    const nextKeys = new Set(placed.map(p => p.key));

    // On phase change, fade out persisted dots that aren't in the new beat.
    if (event.phase !== currentPhase) {
      for (const key of persistedKeys) {
        if (!nextKeys.has(key)) pool.get(key)?.classList.remove('visible');
      }
      persistedKeys = new Set();
      currentPhase = event.phase;
    }

    carrierEl = null;
    for (const p of placed) {
      persistedKeys.add(p.key);
      const el = ensureDot(p.key, p.color, p.text, p.jersey);
      el.style.top = `${toTop(p.x)}%`;
      el.style.left = `${toLeft(p.y)}%`;
      el.classList.add('visible');
      if (p.isCarrier) carrierEl = el;
    }
  };

  // Reset whatever dot the (now-stopped) carrier animation was driving — tracked
  // separately from carrierEl because applyBeat reassigns carrierEl on the next
  // beat before clearMovement/cancel runs, so cancel() must restore the dot that
  // actually had transition:none, not the current beat's carrier.
  const stopCarrierAnim = () => {
    if (carrierAnim) { carrierAnim.cancel(); carrierAnim = null; }
    if (animatedEl) { animatedEl.style.transition = ''; animatedEl = null; }
  };

  // Carrier dots no longer ride the ball walk — they fade in at their placed
  // position (slightly behind the ball). This eliminates the artefact where
  // the carrier appeared to travel with every pass in the chain.
  const ballWalkFollower: BallWalkFollower = {
    start(_frames, _duration, _easing) { /* intentional no-op */ },
    cancel() { stopCarrierAnim(); },
  };

  const reset = (): void => {
    ballWalkFollower.cancel();
    for (const el of pool.values()) el.remove();
    pool.clear();
    persistedKeys = new Set();
    currentPhase = null;
    carrierEl = null;
  };

  return { applyBeat, ballWalkFollower, reset };
}
