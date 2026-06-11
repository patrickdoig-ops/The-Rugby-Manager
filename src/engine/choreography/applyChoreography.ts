// Engine-side authored-choreography pipeline. Given a parsed Phase Animator export and a
// PhaseResult, map the authored frame onto the live pitch and (for first-phase plays)
// reconcile the authored timeline against the engine outcome. Split out of
// FirstPhaseEvent / ScrumEvent so each stage is separately reviewable and the transform
// third is shared rather than duplicated.
//
// All animation is presentation-only: this runs only when `!silent` (the headless AI
// path skips it), so the determinism harnesses don't exercise it — verify by eyeballing an
// authored crash-ball / out-the-back / scrum wheel in the dev server.

import type { MatchState } from '../../types/match';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import type { PhaseResult } from '../events/types';
import type { ParsedChoreography } from '../balance/firstPhaseChoreography';
import { MatchPhase } from '../../types/engine';
import { clamp } from '../../utils/math';
import { SLOT } from '../Slot';
import { tryLocationBand } from '../resolvers/TryLocationResolver';
import { swapPairedSlot } from './transform';

// A timed ball keyframe in live (post-transform) game coordinates. A structural subtype of
// the BALL_REPOSITIONED MatchEvent variant (whose x/y/t are optional) — assignable into a
// MatchEvent[] but with x/y/t always present, so the reconciliation maths needs no guards.
export type AuthoredBallEvent = { type: 'BALL_REPOSITIONED'; x: number; y: number; t: number };
type Choreography = NonNullable<PhaseResult['choreography']>;

// The authored→live frame mapping: the long-axis flip (flipX) and lateral mirror (flipY)
// relative to the authored frame, plus the anchor offset (dx, dy) that pins the whole move
// to the live ball, and the real side strings for the attacking / defending teams.
export interface ChoreoFrame {
  flipX: boolean;
  flipY: boolean;
  dx: number;
  dy: number;
  atkSideStr: 'h' | 'a';
  defSideStr: 'h' | 'a';
}

export function computeFrame(
  parsedChoreo: ParsedChoreography,
  state: MatchState,
  dir: number,
  attackSide: 'home' | 'away',
): ChoreoFrame {
  const attacksTop = dir === 1;
  const nearTop = state.ball.y >= 50;

  const flipX = parsedChoreo.authoredAttacksTop !== attacksTop;
  const flipY = parsedChoreo.authoredNearTop !== nearTop;

  const anchorX = flipX ? 100 - parsedChoreo.authoredAnchorX : parsedChoreo.authoredAnchorX;
  const anchorY = flipY ? 100 - parsedChoreo.authoredAnchorY : parsedChoreo.authoredAnchorY;

  return {
    flipX,
    flipY,
    dx: state.ball.x - anchorX,
    dy: state.ball.y - anchorY,
    atkSideStr: attackSide === 'home' ? 'h' : 'a',
    defSideStr: attackSide === 'home' ? 'a' : 'h',
  };
}

// Map every authored entity onto the live pitch: flip + anchor each keyframe, swap the
// laterally-paired jersey slot on a single-axis reflection (flipX !== flipY), resolve each
// authored side to the real attacking/defending team, and collect the per-player movement
// paths. The ball entity's keyframes (from kf[1] — kf[0] is the anchor) are gathered
// separately when `collectBall` (first phase needs the ball path; the scrum wheel keeps
// its static ball). `includeSlot` filters which slots animate (first phase: backs only;
// scrum: forwards only) and is tested on the AUTHORED slot, before the pair swap.
export function transformEntities(
  parsedChoreo: ParsedChoreography,
  frame: ChoreoFrame,
  opts: { includeSlot: (slot: number) => boolean; collectBall: boolean },
): { choreography: Choreography; authoredBallEvents: AuthoredBallEvent[] } {
  const { flipX, flipY, dx, dy, atkSideStr, defSideStr } = frame;
  const swapLateral = flipX !== flipY;
  const choreography: Choreography = [];
  const authoredBallEvents: AuthoredBallEvent[] = [];

  const mapPoint = (x: number, y: number): { x: number; y: number } => {
    if (flipX) x = 100 - x;
    if (flipY) y = 100 - y;
    return { x: clamp(x + dx, 0, 100), y: clamp(y + dy, 0, 100) };
  };

  for (const ent of parsedChoreo.entities) {
    if (ent.id === 'ball') {
      if (opts.collectBall) {
        for (let i = 1; i < ent.kf.length; i++) {
          const kf = ent.kf[i];
          const p = mapPoint(kf.x, kf.y);
          authoredBallEvents.push({ type: 'BALL_REPOSITIONED', x: p.x, y: p.y, t: kf.t });
        }
      }
      continue;
    }

    const authoredSideChar = ent.id.charAt(0);
    let authoredSlot = parseInt(ent.id.substring(1), 10);
    if (isNaN(authoredSlot)) continue;
    if (!opts.includeSlot(authoredSlot)) continue;

    if (swapLateral) authoredSlot = swapPairedSlot(authoredSlot);

    const isAuthoredAtk = (authoredSideChar === 'h' && parsedChoreo.authoredAttackingKind === 'home') ||
                          (authoredSideChar === 'a' && parsedChoreo.authoredAttackingKind === 'away');
    const realSideStr = isAuthoredAtk ? atkSideStr : defSideStr;

    const movements = ent.kf.map(kf => {
      const p = mapPoint(kf.x, kf.y);
      return { x: p.x, y: p.y, t: kf.t };
    });

    choreography.push({ side: realSideStr, id: authoredSlot, movements });
  }

  return { choreography, authoredBallEvents };
}

// Insert the authored ball path into the event stream. With a carry, the authored ball
// path replaces the procedural pre-carry repositions and the carry's own ball advance is
// suppressed (the keyframes are authoritative); without a carry the path is appended unless
// a penalty ended the play (then the ball doesn't travel the authored route).
export function spliceBallEvents(res: PhaseResult, authoredBallEvents: AuthoredBallEvent[]): void {
  if (authoredBallEvents.length === 0) return;

  const carryIdx = res.events.findIndex(e => e.type === 'CARRY_RESOLVED');
  if (carryIdx !== -1) {
    const carryEvt = res.events[carryIdx];
    if (carryEvt.type === 'CARRY_RESOLVED') {
      carryEvt.suppressBallMove = true;
    }
    const eventsBeforeCarry = res.events.slice(0, carryIdx);
    const eventsAfterCarry = res.events.slice(carryIdx);

    const filteredBefore = eventsBeforeCarry.filter(e => e.type !== 'BALL_REPOSITIONED');

    res.events = [
      ...filteredBefore,
      ...authoredBallEvents,
      ...eventsAfterCarry,
    ];
  } else {
    const hasPenalty = res.events.some(e => e.type === 'PENALTY_AWARDED');
    if (!hasPenalty) {
      res.events.push(...authoredBallEvents);
    }
  }
}

type KnockOnEvent = Extract<MatchEvent, { type: 'KNOCK_ON' }>;
type InterceptionEvent = Extract<MatchEvent, { type: 'INTERCEPTION' }>;
type CarryResolvedEvent = Extract<MatchEvent, { type: 'CARRY_RESOLVED' }>;

// The outcome events that drive truncation, located once after the ball splice and shared
// by truncateToOutcome (all three) and extendForOffloads (the carry).
export interface OutcomeEvents {
  koEvent: KnockOnEvent | null;
  intEvent: InterceptionEvent | null;
  carryEvent: CarryResolvedEvent | null;
}

export function findOutcomeEvents(res: PhaseResult): OutcomeEvents {
  const firstCarryIdx = res.events.findIndex(e => e.type === 'CARRY_RESOLVED');
  const firstKoIdx = res.events.findIndex(e => e.type === 'KNOCK_ON');
  const firstIntIdx = res.events.findIndex(e => e.type === 'INTERCEPTION');

  const isInitialKo = firstKoIdx !== -1 && (firstCarryIdx === -1 || firstKoIdx < firstCarryIdx);
  const isInitialInt = firstIntIdx !== -1 && (firstCarryIdx === -1 || firstIntIdx < firstCarryIdx);

  return {
    koEvent: isInitialKo ? res.events[firstKoIdx] as KnockOnEvent : null,
    intEvent: isInitialInt ? res.events[firstIntIdx] as InterceptionEvent : null,
    carryEvent: firstCarryIdx !== -1 ? res.events[firstCarryIdx] as CarryResolvedEvent : null,
  };
}

// Cut the authored timeline back to where the engine outcome actually lands, then rescale
// `t` to [0,1] so the WAAPI animation fills the beat. Two regimes:
//  - knock-on / interception: truncate to the authored time when the ball is closest to the
//    receiver (min-distance + 0.5 tolerance scan — the first keyframe within tolerance).
//  - carry: find when the authored ball crosses the engine's final x (after the carrier has
//    caught it, so a pass isn't mistaken for the carry), interpolating the exact crossing.
// The min-distance + tolerance scan is deliberate — a strict radius check regresses it.
// Returns the (possibly rebuilt) authoredBallEvents; mutates res.events and choreography.
export function truncateToOutcome(
  res: PhaseResult,
  choreography: Choreography,
  authoredBallEvents: AuthoredBallEvent[],
  ctx: {
    state: MatchState;
    dir: number;
    atkSideStr: 'h' | 'a';
    defSideStr: 'h' | 'a';
    goCrashBall: boolean;
    outcome: OutcomeEvents;
  },
): AuthoredBallEvent[] {
  const { state, dir, atkSideStr, defSideStr, goCrashBall } = ctx;
  const { koEvent, intEvent, carryEvent } = ctx.outcome;

  let truncateT = 1.0;

  if (koEvent || intEvent) {
    const receiverSlot = koEvent ? koEvent.player.id : (intEvent!.passer.id === SLOT.SCRUM_HALF ? SLOT.FLY_HALF : (goCrashBall ? SLOT.CENTRE_12 : SLOT.CENTRE_13));
    const targetSideStr = koEvent ? atkSideStr : defSideStr;
    const receiverChoreo = choreography.find(c => c.id === receiverSlot && c.side === targetSideStr);
    if (receiverChoreo && receiverChoreo.movements.length > 0) {
      let globalMinDist = 9999;
      for (const bk of authoredBallEvents) {
         const rk = receiverChoreo.movements.find(m => Math.abs(m.t - bk.t) < 0.05) || receiverChoreo.movements[0];
         const d = Math.hypot(bk.x - rk.x, bk.y - rk.y);
         if (d < globalMinDist) globalMinDist = d;
      }
      let minT = 1.0;
      for (const bk of authoredBallEvents) {
         const rk = receiverChoreo.movements.find(m => Math.abs(m.t - bk.t) < 0.05) || receiverChoreo.movements[0];
         const d = Math.hypot(bk.x - rk.x, bk.y - rk.y);
         if (d <= globalMinDist + 0.5) {
           minT = bk.t;
           break;
         }
      }
      truncateT = minT;
    }
  } else if (carryEvent) {
     // Ball-keyframe truncation: compute where the engine says the ball
     // should end up, then find the time in the authored ball path when
     // the ball crosses that x-position. The ball keyframes are already
     // in game coordinates (flipX + dx applied), so the directional
     // comparison with `dir` is always correct.
     const engineFinalX = clamp(state.ball.x + dir * carryEvent.metres, 0, 100);

     // First find when the carrier catches the ball so we don't truncate during the pass
     let catchT = 0;
     const carrierSlot = carryEvent.carrier.id;
     const carrierChoreo = choreography.find(c => c.id === carrierSlot && c.side === atkSideStr);
     if (carrierChoreo && carrierChoreo.movements.length > 0) {
       let globalMinDist = 9999;
       for (const bk of authoredBallEvents) {
          const ck = carrierChoreo.movements.find(m => Math.abs(m.t - bk.t) < 0.05) || carrierChoreo.movements[0];
          const d = Math.hypot(bk.x - ck.x, bk.y - ck.y);
          if (d < globalMinDist) globalMinDist = d;
       }
       for (const bk of authoredBallEvents) {
          const ck = carrierChoreo.movements.find(m => Math.abs(m.t - bk.t) < 0.05) || carrierChoreo.movements[0];
          const d = Math.hypot(bk.x - ck.x, bk.y - ck.y);
          if (d <= globalMinDist + 0.5) {
             catchT = bk.t;
             break;
          }
       }
     }

     if (authoredBallEvents.length > 1) {
       let prevBk = authoredBallEvents[0];
       let found = false;
       for (let i = 1; i < authoredBallEvents.length; i++) {
         const bk = authoredBallEvents[i];
         // Only look for crossings after the pass has reached the carrier
         if (prevBk.t >= catchT) {
           const crosses =
             (dir === 1  && prevBk.x <= engineFinalX && bk.x >= engineFinalX) ||
             (dir === -1 && prevBk.x >= engineFinalX && bk.x <= engineFinalX);
           if (crosses) {
             const totalDist = Math.abs(bk.x - prevBk.x);
             const neededDist = Math.abs(engineFinalX - prevBk.x);
             const frac = totalDist > 0 ? neededDist / totalDist : 0;
             truncateT = prevBk.t + (bk.t - prevBk.t) * frac;
             found = true;
             break;
           }
         }
         prevBk = bk;
       }
       if (!found) truncateT = 1.0;
     }
  }

  if (truncateT < 1.0) {
    // Interpolate keyframes exactly at truncateT before filtering
    for (const c of choreography) {
      let pCk = c.movements[0];
      for (const ck of c.movements) {
        if (ck.t >= truncateT) {
          if (ck.t > truncateT && pCk) {
            const frac = (truncateT - pCk.t) / (ck.t - pCk.t);
            c.movements.push({ t: truncateT, x: pCk.x + (ck.x - pCk.x) * frac, y: pCk.y + (ck.y - pCk.y) * frac });
          }
          break;
        }
        pCk = ck;
      }
    }

    let pBk = authoredBallEvents[0];
    let interpBk: AuthoredBallEvent | null = null;
    for (const bk of authoredBallEvents) {
      if (bk.t >= truncateT) {
        if (bk.t > truncateT && pBk) {
          const frac = (truncateT - pBk.t) / (bk.t - pBk.t);
          interpBk = { type: 'BALL_REPOSITIONED', x: pBk.x + (bk.x - pBk.x) * frac, y: pBk.y + (bk.y - pBk.y) * frac, t: truncateT };
        }
        break;
      }
      pBk = bk;
    }

    if (interpBk) {
      const carryIdx2 = res.events.findIndex(e => e.type === 'CARRY_RESOLVED');
      if (carryIdx2 !== -1) {
        res.events.splice(carryIdx2, 0, interpBk);
      }
      authoredBallEvents.push(interpBk);
    }

    res.events = res.events.filter(e => e.type !== 'BALL_REPOSITIONED' || e.t === undefined || e.t <= truncateT);
    for (const e of res.events) {
      if (e.type === 'BALL_REPOSITIONED' && e.t !== undefined) {
        e.t = e.t / truncateT; // Scale t for WAAPI so ball syncs with player
      }
    }
    for (const c of choreography) {
       c.movements = c.movements.filter(m => m.t <= truncateT).sort((a, b) => a.t - b.t);
       for (const m of c.movements) m.t = m.t / truncateT; // Scale t for WAAPI
    }
    authoredBallEvents = authoredBallEvents.filter(e => e.t <= truncateT).sort((a, b) => a.t - b.t);
    for (const bk of authoredBallEvents) bk.t = bk.t / truncateT;
  }

  return authoredBallEvents;
}

// Procedurally extend the authored timeline past its end for offload passes (and the
// offloaded carrier's run). Each offload adds a pass keyframe to the catcher's intercept
// point and, unless the offload was knocked on, a run keyframe to the catcher's final
// tackle point — with a no-forward-pass guard. If the extension overran t=1 it rescales
// everything back into [0,1]. Mutates res.events, choreography, and authoredBallEvents.
export function extendForOffloads(
  res: PhaseResult,
  choreography: Choreography,
  authoredBallEvents: AuthoredBallEvent[],
  carryEvent: CarryResolvedEvent | null,
  ctx: { state: MatchState; dir: number },
): void {
  const { state, dir } = ctx;
  const hasOffloadAttempt = res.events.some(e => e.type === 'OFFLOAD_ATTEMPTED');
  if (!hasOffloadAttempt || !carryEvent) return;

  let currentT = 1.0;

  const carries = res.events.filter((e): e is CarryResolvedEvent => e.type === 'CARRY_RESOLVED');
  const offloads = res.events.filter((e): e is Extract<MatchEvent, { type: 'OFFLOAD_ATTEMPTED' }> => e.type === 'OFFLOAD_ATTEMPTED');

  for (let i = 0; i < offloads.length; i++) {
    const offloadEvt = offloads[i];
    const catcher = offloadEvt.catcher;
    if (!catcher) continue;

    // NOTE: this block was previously dormant because `catcherSideStr` was 'home'/'away'
    // while `c.side` was 'h'/'a'. The crash it exposed (`carries[j]` undefined) was
    // because `offloads` included BOTH 'OFFLOAD_COMPLETED' and 'OFFLOAD_ATTEMPTED',
    // doubling the array length and causing out-of-bounds indexing into `carries`.
    const catcherSideStr: string = offloadEvt.attackSide === 'home' ? 'h' : 'a';
    const catcherChoreo = choreography.find(c => c.id === catcher.id && c.side === catcherSideStr);
    if (!catcherChoreo || catcherChoreo.movements.length === 0) continue;

    const lastCatcherK = catcherChoreo.movements[catcherChoreo.movements.length - 1];

    // Ensure no forward pass (Checking Run). The catch happens after the
    // offloading carrier's carry, so the ball has advanced by carries[0..i].
    let previousMetres = 0;
    for (let j = 0; j <= i; j++) {
      previousMetres += carries[j].metres;
    }
    const engineCurrentX = clamp(state.ball.x + dir * previousMetres, 0, 100);

    if ((dir === 1 && lastCatcherK.x >= engineCurrentX) || (dir === -1 && lastCatcherK.x <= engineCurrentX)) {
      lastCatcherK.x = clamp(engineCurrentX - dir * 1.5, 0, 100);
    }

    // Pre-calculate final run position so we can intercept the player on the run
    let catchX = lastCatcherK.x;
    const catchY = lastCatcherK.y;
    let catcherFinalX = catchX;
    const catcherFinalY = catchY;

    // The catcher's own carry is the NEXT carry after the offloader's
    // (carries[i+1]). It is absent only when this offload was knocked on —
    // the chain returns before emitting a carry for the catcher — in which
    // case there is no forward run, just the pass to the (dropped) catch.
    const nextCarry = carries[i + 1];
    if (nextCarry) {
      let accumulatedMetres = 0;
      for (let j = 0; j <= i + 1; j++) {
        accumulatedMetres += carries[j].metres;
      }
      catcherFinalX = clamp(state.ball.x + dir * accumulatedMetres, 0, 100);

      // Player interpolates from lastCatcherK to catcherFinalX over 0.40s (0.15 + 0.25).
      // At t = 0.15 (catch time), they are at 37.5% of the distance.
      catchX = lastCatcherK.x + (catcherFinalX - lastCatcherK.x) * (0.15 / 0.40);
    }

    // 1. Pass the ball to the catcher's intercept point
    currentT += 0.15;
    const passEvent: AuthoredBallEvent = { type: 'BALL_REPOSITIONED', x: catchX, y: catchY, t: currentT };

    const offloadIdx = res.events.indexOf(offloadEvt);
    if (offloadIdx !== -1) {
      res.events.splice(offloadIdx + 1, 0, passEvent);
    } else {
      authoredBallEvents.push(passEvent);
    }

    // 2. Catcher runs with the ball to the final tackle point. Skipped when
    // this offload was knocked on (no catcher carry — nextCarry is absent).
    if (nextCarry) {
      currentT += 0.25;

      catcherChoreo.movements.push({ t: currentT, x: catcherFinalX, y: catcherFinalY });
      const runEvent: AuthoredBallEvent = { type: 'BALL_REPOSITIONED', x: catcherFinalX, y: catcherFinalY, t: currentT };

      // The runEvent is the authoritative ball position for the catcher's
      // carry (catcherFinalX already includes its metres). Suppress the
      // CARRY_RESOLVED's own ball advance so it isn't double-counted on top
      // of the explicit keyframe — otherwise the ball overshoots the catcher
      // dot, which rests at catcherFinalX.
      nextCarry.suppressBallMove = true;

      const carryIdx = res.events.indexOf(nextCarry);
      if (carryIdx !== -1) {
        res.events.splice(carryIdx, 0, runEvent);
      } else {
        authoredBallEvents.push(runEvent);
      }
    }
  }

  const maxT = currentT;
  if (maxT > 1.0) {
    for (const e of res.events) {
      if (e.type === 'BALL_REPOSITIONED' && e.t !== undefined) e.t /= maxT;
    }
    for (const c of choreography) {
      for (const m of c.movements) m.t /= maxT;
    }
    for (const bk of authoredBallEvents) bk.t /= maxT;
  }
}

// On a try, the authored grounding y wins over the procedural tryLandingY: the final timed
// ball keyframe IS the authentic grounding spot, so the untimed try BALL_REPOSITIONED (and
// the try-location commentary band) are realigned to it — otherwise the conversion lines up
// off a different spot than where the animation grounded the ball.
export function reconcileTryY(res: PhaseResult, authoredBallEvents: AuthoredBallEvent[]): void {
  if (res.nextPhase !== MatchPhase.TryScored) return;
  if (authoredBallEvents.length === 0) return;

  let finalY = authoredBallEvents[authoredBallEvents.length - 1].y;
  // Refine from res.events because the offload-extension block splices its
  // run keyframes into res.events WITHOUT mirroring them into
  // authoredBallEvents — but only TIMED keyframes (t defined) may refine
  // the grounding y. The procedural try grounding (t === undefined,
  // y = tryLandingY) is the very event we're about to override; letting it
  // into this scan made the override circular, the procedural y silently
  // won, and the conversion lined up off a different spot than where the
  // authored animation grounded the ball. The animation takes precedence.
  for (const e of res.events) {
    if (e.type === 'BALL_REPOSITIONED' && e.t !== undefined && e.y !== undefined) finalY = e.y;
  }

  const tryRepoEvent = res.events.find(
    (e): e is Extract<MatchEvent, { type: 'BALL_REPOSITIONED' }> =>
      e.type === 'BALL_REPOSITIONED' && e.t === undefined,
  );
  if (tryRepoEvent) {
    tryRepoEvent.y = finalY;
  }

  if (res.narration && res.narration.steps) {
    const tryLocStep = res.narration.steps.find(
      (s): s is Extract<NarrationStep, { kind: 'announcement' }> =>
        s.kind === 'announcement' && s.key.startsWith('try_location_'),
    );
    if (tryLocStep) {
      tryLocStep.key = `try_location_${tryLocationBand(finalY)}`;
    }
  }
}

// Hold the attacking scrum-half (#9) still at its feed position until it has delivered the
// pass to #10, then let it run its authored support line. `passT` is the authored time the
// ball completes its first leg (arrives at #10 = the first authored ball keyframe). Without
// this the #9 starts drifting forward from t=0, before the pass is even made. Applied on the
// authored timeline (before any truncation rescale). Presentation-only.
export function holdScrumHalfUntilPass(choreography: Choreography, atkSideStr: 'h' | 'a', passT: number): void {
  if (!(passT > 0)) return;
  const sh = choreography.find(c => c.id === SLOT.SCRUM_HALF && c.side === atkSideStr);
  if (!sh || sh.movements.length === 0) return;
  const start = sh.movements[0];
  const after = sh.movements.filter(m => m.t > passT);
  sh.movements = [
    { t: 0, x: start.x, y: start.y },
    { t: passT, x: start.x, y: start.y },
    ...after,
  ];
}

// Land the actual tackler adjacent to the carrier's final position so the collision reads.
// The authored defender path ends wherever it was authored, but the engine outcome (after
// truncation) stops the ball somewhere else — `res.secondaryPlayer` is the engine's real
// tackler (the cover defender on a line break, the primary defender otherwise), so snap that
// dot's last keyframe just ahead of the carrier's final ball position. Skipped on a try (no
// tackler) and when the tackler is a forward (not in the backs-only choreography).
// Presentation-only.
export function snapTacklerToCarrier(
  res: PhaseResult,
  choreography: Choreography,
  authoredBallEvents: AuthoredBallEvent[],
  defSideStr: 'h' | 'a',
  dir: number,
): void {
  if (res.nextPhase === MatchPhase.TryScored) return;
  const tacklerPlayer = res.secondaryPlayer;
  if (!tacklerPlayer) return;
  const last = authoredBallEvents[authoredBallEvents.length - 1];
  if (!last) return;
  const tackler = choreography.find(c => c.id === tacklerPlayer.id && c.side === defSideStr);
  if (!tackler || tackler.movements.length === 0) return;
  const lastK = tackler.movements[tackler.movements.length - 1];
  lastK.x = clamp(last.x + dir * 1.5, 0, 100);
  lastK.y = last.y;
}

// First-phase authored play: full reconciliation pipeline. Backs only (forwards hold the
// set-piece shape), ball path collected. No-op when no play is registered for the key.
export function applyFirstPhaseChoreography(
  res: PhaseResult,
  parsedChoreo: ParsedChoreography | undefined,
  ctx: { state: MatchState; dir: number; attackSide: 'home' | 'away'; goCrashBall: boolean },
): PhaseResult {
  if (!parsedChoreo) return res;

  const frame = computeFrame(parsedChoreo, ctx.state, ctx.dir, ctx.attackSide);
  const { choreography, authoredBallEvents: initialBall } = transformEntities(parsedChoreo, frame, {
    // Skip forwards (slots 1–8) so they hold the set-piece UI layout rather than animating to (0,0).
    includeSlot: slot => slot < 1 || slot > 8,
    collectBall: true,
  });
  let authoredBallEvents = initialBall;

  // Hold #9 still until it has passed to #10 (the first authored ball leg) — before any
  // t-rescale, so passT is the authored pass time.
  holdScrumHalfUntilPass(choreography, frame.atkSideStr, authoredBallEvents[0]?.t ?? 0);

  spliceBallEvents(res, authoredBallEvents);

  const outcome = findOutcomeEvents(res);
  authoredBallEvents = truncateToOutcome(res, choreography, authoredBallEvents, {
    state: ctx.state, dir: ctx.dir,
    atkSideStr: frame.atkSideStr, defSideStr: frame.defSideStr,
    goCrashBall: ctx.goCrashBall, outcome,
  });
  extendForOffloads(res, choreography, authoredBallEvents, outcome.carryEvent, { state: ctx.state, dir: ctx.dir });
  reconcileTryY(res, authoredBallEvents);
  // Land the real tackler next to the carrier's final position (presentation-only).
  snapTacklerToCarrier(res, choreography, authoredBallEvents, frame.defSideStr, ctx.dir);

  return { ...res, choreography };
}

// Scrum wheel authored play: forwards only, static ball (no path), no outcome
// reconciliation — just the shared frame transform.
export function applyScrumChoreography(
  res: PhaseResult,
  parsedChoreo: ParsedChoreography | undefined,
  state: MatchState,
  dir: number,
  attackSide: 'home' | 'away',
): PhaseResult {
  if (!parsedChoreo) return res;

  const frame = computeFrame(parsedChoreo, state, dir, attackSide);
  const { choreography } = transformEntities(parsedChoreo, frame, {
    // Only animate forwards (1–8). Backs remain in their un-choreographed positions.
    includeSlot: slot => slot <= 8,
    collectBall: false,
  });

  return { ...res, choreography };
}
