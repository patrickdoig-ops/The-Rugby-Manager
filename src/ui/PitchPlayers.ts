// The player-dot DOM layer for the 2D pitch: a dumb element pool that renders
// and fades whatever `Placed[]` the pure choreographer hands it (it knows nothing
// about events, phases, or rugby), plus a thin controller PitchView drives and a
// BallWalkFollower seam that lets the carrier dot run the final leg of the ball walk.

import type { GameEvent, MatchState } from '../types/match';
import { MatchPhase } from '../types/engine';
import { SLOT } from '../engine/Slot';
import { toTop, toLeft } from './pitchCoords';
import { choreograph } from './pitchChoreography';

// Kick phases a KickReturn can follow. On a kick → KickReturn transition we seed the
// return from the predecessor kick formation: keep its dots on screen and glide, rather
// than fading the pack and re-drawing a sparse return layout.
const KICK_PREDECESSORS = new Set<string>([
  MatchPhase.KickOff, MatchPhase.BoxKick, MatchPhase.TacticalKick, MatchPhase.DropOut22,
]);

// Injury / fatigue announcement beats highlight the named player's dot. The coordinator
// emits these with `side` = the player's OWN team, so the dot key derives directly.
// Returns the dot key + glow class, or null for any other beat.
function glowForBeat(event: GameEvent): { key: string; cls: string } | null {
  const p = event.primaryPlayer;
  if (!p) return null;
  const prefix = event.side === 'home' ? 'h' : 'a';
  for (const s of event.narration.steps) {
    if (s.kind !== 'announcement') continue;
    if (s.key === 'injury_off')       return { key: `${prefix}:${p.id}`, cls: 'glow-injury' };
    if (s.key === 'fatigue_tiredness') return { key: `${prefix}:${p.id}`, cls: 'glow-fatigue' };
  }
  return null;
}

// A dot flagged with a `from` position this beat, for PitchView to animate from
// `from` to its committed resting spot (the kick-off chase line surging forward).
export interface ChaseDot { el: HTMLElement; fromX: number; fromY: number; toX: number; toY: number; }

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
  chaseDots: ChaseDot[];              // dots with a `from` this beat, for PitchView to animate (kick-off chase)
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
  let chaseDots: ChaseDot[] = [];                // dots with a `from` this beat (kick-off chase)
  let atkSHEl: HTMLElement | null = null;        // attacking #9 at scrum final pos (PitchView sweeps)
  let defSHEl: HTMLElement | null = null;        // defending #9 at scrum final pos (PitchView sweeps)
  // The dot currently carrying an injury/fatigue glow, cleared on the next beat.
  // `glowReshown` is true when we re-showed an off-field injured dot just for the glow,
  // so it can be hidden again once its announcement passes.
  let glowEl: HTMLElement | null = null;
  let glowKey: string | null = null;
  let glowReshown = false;
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

    // Clear the previous beat's injury/fatigue glow. If we re-showed an off-field injured
    // dot purely for the glow and it isn't part of this beat's formation, hide it again.
    if (glowEl) {
      glowEl.classList.remove('glow-injury', 'glow-fatigue');
      if (glowReshown && glowKey && !nextKeys.has(glowKey)) glowEl.classList.remove('visible');
      glowEl = null; glowKey = null; glowReshown = false;
    }

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
      // FirstPhase→Breakdown: the set-piece pack has been held at its scrum/lineout
      // positions through the whole first phase (see keepLineout below). The breakdown
      // beat is the first to reposition the forwards (into the authored ruck formation),
      // so glide them there from wherever the set piece left them rather than snapping.
      // CSS animates from the dots' actual current positions, so the blend is correct
      // for either predecessor without any per-predecessor forward data.
      if (currentPhase === MatchPhase.FirstPhase && event.phase === MatchPhase.Breakdown) {
        field.classList.add('dot-transitioning');
        setTimeout(() => field.classList.remove('dot-transitioning'), 600);
      }
      // Lineout/Scrum→FirstPhase: keep set-piece forwards visible through the whole
      // first phase — carry persistedKeys forward so they don't clear at the boundary.
      // They fade normally when FirstPhase itself ends.
      const keepLineout = (currentPhase === MatchPhase.Lineout || currentPhase === MatchPhase.Scrum)
        && event.phase === MatchPhase.FirstPhase;
      // Kick→KickReturn: seed the return from the predecessor kick formation. Keep all
      // its dots on screen (carry persistedKeys forward) and enable the glide, so the
      // involved actors (openPlayLayout) ease from their kick positions to their return
      // spots while the rest hold where the kick left them. CSS animates from each dot's
      // live position, so one path covers every kick predecessor without per-predecessor data.
      const keepKickFormation = currentPhase !== null && KICK_PREDECESSORS.has(currentPhase)
        && event.phase === MatchPhase.KickReturn;
      // TMO review: the review beats place no players (announcement-only), so hold the
      // predecessor formation frozen on screen rather than fading everyone. It
      // fades/repositions normally when the review resolves (try / penalty / scrum).
      const keepTmo = event.phase === MatchPhase.TmoReview;
      // PhasePlay: hold the predecessor formation (usually the breakdown) and let only
      // the involved actors (openPlayLayout) move, so don't fade on the way in either.
      const keepPhasePlay = event.phase === MatchPhase.PhasePlay;
      // The kick→return seed glides from the predecessor positions; the holds keep the
      // non-movers exactly in place, so only the kick case enables the transition here
      // (phase play enables it per-beat below, for its movers).
      if (keepKickFormation) {
        field.classList.add('dot-transitioning');
        setTimeout(() => field.classList.remove('dot-transitioning'), 600);
      }
      if (keepLineout) {
        // Attacking #9 must start FirstPhase at their set-piece position (lineout
        // mark or behind their #8 in a scrum). Skip the position update for their
        // dot this beat only; subsequent beats will reposition them normally.
        setpieceSHKey = `${event.side === 'home' ? 'h' : 'a'}:${SLOT.SCRUM_HALF}`;
      } else if (!keepKickFormation && !keepTmo && !keepPhasePlay && nextKeys.size > 0) {
        for (const key of persistedKeys) {
          if (!nextKeys.has(key)) pool.get(key)?.classList.remove('visible');
        }
        persistedKeys = new Set();
      }
      // else (keepKickFormation / keepTmo / keepPhasePlay / empty announcement beat):
      // hold — skip the fade, carry persistedKeys. An empty beat (nextKeys.size === 0,
      // an injury/fatigue/card/set-piece-award announcement) keeps the formation on
      // screen rather than clearing the pitch while the line is read.
      currentPhase = event.phase;
    }

    // PhasePlay animates only its movers: enable the glide every beat (not just on the
    // way in) so the involved actors (openPlayLayout) ease from their held positions to
    // the ball-relative spots, while every other dot keeps its top/left and stays put
    // (no position change → no transition fires). The carrier rides the ball via the
    // follower, which sets transition:none on its own dot so the glide can't fight it.
    if (event.phase === MatchPhase.PhasePlay) {
      field.classList.add('dot-transitioning');
      setTimeout(() => field.classList.remove('dot-transitioning'), 600);
    }

    carrierEl = null;
    chaseDots = [];
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
      if (p.from) chaseDots.push({ el, fromX: p.from.x, fromY: p.from.y, toX: p.x, toY: p.y });
      if (p.scrumHalfRole === 'atk') atkSHEl = el;
      if (p.scrumHalfRole === 'def') defSHEl = el;
    }

    // Injury / fatigue glow on the named player's dot. The fatigued player is still on
    // the field (in the held formation); the injured player was removed at the tackle, so
    // their dot has faded — re-show it at its last on-field position (the incident spot)
    // for the duration of the announcement, then the cleanup above hides it next beat.
    const glow = glowForBeat(event);
    if (glow) {
      const el = pool.get(glow.key);
      if (el) {
        glowReshown = !el.classList.contains('visible');
        el.classList.add('visible', glow.cls);
        glowEl = el;
        glowKey = glow.key;
      }
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
    chaseDots = [];
    atkSHEl = null;
    defSHEl = null;
    glowEl = null;
    glowKey = null;
    glowReshown = false;
  };

  return {
    applyBeat, ballWalkFollower,
    get chaseDots()      { return chaseDots; },
    get atkScrumHalfEl() { return atkSHEl; },
    get defScrumHalfEl() { return defSHEl; },
    reset,
  };
}
