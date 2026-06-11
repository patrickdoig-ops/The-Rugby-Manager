// PURE rugby → 2D-pitch geometry for the player-dot layer. No DOM, no engine
// mutation, no RNG: given a beat (GameEvent) + live state, return where each
// involved player's dot should sit, in pitch coords (x,y 0–100). The DOM layer
// (PitchPlayers) maps these through pitchCoords.toTop/toLeft and renders/fades them.
//
// The engine has NO per-player field coordinates — positions here are an
// inferred, stylized impression (carrier behind the ball, support fanned behind,
// defenders just ahead, set-piece packs in formation), not a simulation.

import type { GameEvent, MatchState } from '../types/match';
import type { Player } from '../types/player';
import type { PossessionSide } from '../types/engine';
import { MatchPhase } from '../types/engine';
import { availableForwards, onFieldPlayers } from '../engine/FieldPosition';
import { SLOT } from '../engine/Slot';
import { textOn } from './teamColors';
import { CARRIER_BEHIND_BALL, TACKLER_AHEAD } from './pitchAnimConstants';
import { swapPairedSlot } from '../engine/choreography/transform';
import type { FormOffsets, Formation, KickoffSpot } from './pitchFormations';
import {
  BOX_KICK_ANNOUNCE, BOX_KICK_FORMS,
  BREAKDOWN_CLEAN, BREAKDOWN_CLEANOUT_PEN, BREAKDOWN_SLOW_BALL, BREAKDOWN_TURNOVER,
  BREAKDOWN_NOT_ROLLING_AWAY, BREAKDOWN_OFFSIDE_AT_RUCK, BREAKDOWN_PENALTY_DEFENDING,
  PENALTY_KICK_TO_TOUCH, PENALTY_KICK_TO_TOUCH_CLOSE, PENALTY_TAP_AND_GO, PENALTY_TAP_AND_KICK_DEAD,
  TACTICAL_KICK_BASE, TACTICAL_KICK_FROZEN,
  KICKOFF_RECV, KICKOFF_KICK, KICKOFF_SHORT_RECV, KICKOFF_SHORT_KICK,
  DROPOUT_ANNOUNCE_KICK, DROPOUT_ANNOUNCE_RECV, DROPOUT_RECEIVE_KICK, DROPOUT_RECEIVE_RECV,
  CONV_ABS, SCRUM_ATK_BACKS, SCRUM_DEF_BACKS, LINEOUT_ATK_BACKS, LINEOUT_DEF_BACKS,
  SCRUM_ROWS, MAUL_HOOKER_DX, MAUL_ATK_ROWS,
} from './pitchFormations';

// Re-export so existing importers (PitchView) keep their current import path.
export { MAUL_HOOKER_DX };

// A placed dot in pitch coords (x = long axis 0–100, y = lateral 0–100).
export interface Placed {
  key: string;        // `${side}:${p.id}` (p.id = matchday slot 1-15) — stable within a match
  jersey: number;
  color: string;      // fill (raw kit colour — dots sit on the green pitch, not the dark UI)
  text: string;       // jersey text colour (contrast)
  x: number;
  y: number;
  isCarrier: boolean; // the on-ball dot (sits behind ball, slightly offset)
  from?: { x: number; y: number }; // start position — PitchView animates the dot from here to its resting (x,y) over the beat (kick-off chase line)
  scrumHalfRole?: 'atk' | 'def'; // scrum SH — PitchView sweeps from loosehead start to behind-#8 final
  isDominantTackler?: boolean;   // tackler on a dominant carry/tackle, who will animate in sync with the ball carrier
}

type Side = 'h' | 'a';

// Field-of-play clamps. Exported so the ball/dot animators in PitchView share the
// exact same bounds instead of re-inlining the [2,98]/[3,97] literals — every baked
// formation depends on these, so a divergent copy would desync the animation.
export const clampX = (x: number): number => Math.max(2, Math.min(98, x));
export const clampY = (y: number): number => Math.max(3, Math.min(97, y));

// Lateral fan offset for a support/defender at index i: alternating sides, stepping
// one rank wider every two players. Shared by openPlayLayout and firstPhaseBacklineLayout.
const fanLateral = (i: number): number => (i % 2 === 0 ? 1 : -1) * Math.ceil((i + 1) / 2) * 8;
// Wider x-clamp that allows the in-goal areas beyond the try lines (x>100 / x<0). `toTop`
// extrapolates there, and [-8,108] keeps the dot inside the pitch element. Use ONLY for
// dots that belong behind a try line (the try scorer; later the conversion defending line)
// — keep every field-of-play dot on the standard `clampX` [2,98].
const clampInGoalX = (x: number): number => Math.max(-8, Math.min(108, x));

// Defenders retreating to their own try line can go slightly into the in-goal to stay onside,
// but should not cross the opposing team's try line.
export const clampDefenderX = (x: number, fwd: number): number => {
  if (fwd === 1) return Math.max(2, Math.min(105, x));
  return Math.max(-5, Math.min(98, x));
};

const sideOf = (p: Player, state: MatchState): Side => {
  const h = state.homeTeam;
  // Mirror applyMatchEvent's team-membership test: a player is "home" if they're
  // on the field, on the bench, or already subbed off — so an actor surfacing in
  // a sub/announcement beat resolves to the right side, not silently to away.
  return h.players.includes(p) || h.bench.includes(p) || h.substitutedOff.includes(p) ? 'h' : 'a';
};

const possOf = (side: Side): PossessionSide => (side === 'h' ? 'home' : 'away');

function placed(p: Player, side: Side, state: MatchState, x: number, y: number, isCarrier: boolean): Placed {
  const team = side === 'h' ? state.homeTeam : state.awayTeam;
  const fill = team.color;
  return {
    key: `${side}:${p.id}`,
    jersey: p.squadNumber,
    color: fill,
    text: textOn(fill),                   // contrast against the fill, not the raw colour
    x, y, isCarrier,
  };
}

// Every player the beat references, deduped by object identity, first-seen order:
// the two top-level actors then each narration step's primary/secondary.
function harvestActors(event: GameEvent): Player[] {
  const seen = new Set<Player>();
  const out: Player[] = [];
  const add = (p?: Player) => { if (p && !seen.has(p)) { seen.add(p); out.push(p); } };
  add(event.primaryPlayer);
  add(event.secondaryPlayer);
  for (const s of event.narration.steps) {
    if (s.kind === 'phase_outcome' || s.kind === 'announcement') { add(s.primary); add(s.secondary); }
  }
  return out;
}

// Router: dispatch by phase. Set pieces draw both full packs; kicks show the kicker;
// substitutions place players near the touchline; fatigue places the player randomly;
// everything else (open play, breakdown, maul, penalty, try) fans the involved chain.
// prevPhase / prevBallX / prevBallY are the previous beat's phase and ball position,
// used to anchor the FirstPhase backline formation when coming off a set piece.
export function choreograph(
  event: GameEvent,
  state: MatchState,
  attacksTop: boolean,
  prevPhase: string | null = null,
  prevBallX = 50,
  prevBallY = 50,
): Placed[] {
  // Substitution beats always show players near the touchline, not the ball.
  if (event.phase === MatchPhase.Substitution) return substitutionLayout(event, state);

  // Kick phases place the kicker at the origin + on-ball player at the landing
  // (kick-offs use their own layout) regardless of whether the narration step is a
  // phase_outcome or announcement.
  if (event.phase === MatchPhase.KickOff)        return kickOffLayout(event, state, attacksTop);
  // All tactical kicks share the good_kick full-formation chase as a base (anchor = kick
  // origin); each outcome can be refined into its own authored frame later. The ball's
  // flight — lob to touch vs in-field landing — is PitchView's job keyed on kickFindsTouch,
  // so a caught kick still lands in-field under this same layout.
  if (event.phase === MatchPhase.TacticalKick) {
    if (kickFindsTouch(event)) {
      return placeFormation(event, state, attacksTop, prevBallX, prevBallY, TACTICAL_KICK_FROZEN);
    }
    const dots = placeFormation(event, state, attacksTop, prevBallX, prevBallY, TACTICAL_KICK_BASE);

    // For a caught kick, the ball lands at event.ballX, event.ballY.
    // The catcher (event.secondaryPlayer) needs to animate from their base defensive position
    // to the actual landing spot, so they visibly run into position to catch the ball.
    const catcher = event.secondaryPlayer;
    if (catcher) {
      const fwd = attacksTop ? 1 : -1;
      const catcherKey = `${sideOf(catcher, state)}:${catcher.id}`;
      const catcherDot = dots.find(d => d.key === catcherKey);
      if (catcherDot) {
        // Run FROM their authored defensive-line placement...
        catcherDot.from = { x: catcherDot.x, y: catcherDot.y };
        // ...TO the actual ball landing spot
        catcherDot.x = clampX(event.ballX - fwd * CARRIER_BEHIND_BALL);
        catcherDot.y = clampY(event.ballY);
        catcherDot.isCarrier = true;
      }
    }

    return dots;
  }
  if (event.phase === MatchPhase.ConversionKick)
    return conversionLayout(event, state, attacksTop, prevBallX, prevBallY);
  if (event.phase === MatchPhase.DropOut22)      return dropOutLayout(event, state, attacksTop, prevBallX, prevBallY);
  if (event.phase === MatchPhase.BoxKick) {
    const keys = outcomeKeys(event);
    // Announce beat: don't place the full formation, just keep the predecessor phase's dots 
    // and reposition the kicker (scrum half). The winger will chase on the outcome beat.
    if (keys.includes('announce')) {
      const out: Placed[] = [];
      const kicker = event.primaryPlayer;
      if (kicker) out.push(placed(kicker, sideOf(kicker, state), state, clampX(event.ballX), clampY(event.ballY), false));
      return out;
    }
    // If the box kick finds touch, freeze the pack at the kick origin.
    if (kickFindsTouch(event)) return placeFormation(event, state, attacksTop, prevBallX, prevBallY, BOX_KICK_ANNOUNCE);
    // Outcome beat: the ball has flown to the landing, so anchor the kicking
    // formation on the kick origin (the previous beat's ball = the announce ruck).
    const form = BOX_KICK_FORMS.find(f => keys.includes(f.key));
    if (form) return placeFormation(event, state, attacksTop, prevBallX, prevBallY, form.form);
    return travelingKickLayout(event, state, attacksTop, prevBallX, prevBallY);
  }
  // A penalty kicked to touch: full 30-player formation — the kicking pack clustered at
  // the mark, the defenders dropped back to cover the kick — anchored on the kick origin
  // (the previous beat's ball = the penalty mark, same anchor the kicker used before).
  // PitchView still lobs the ball out past the touchline and the lineout forms next beat;
  // a6/a15 carry the small post-kick shuffle via defFrom.
  // Tap-and-kick-dead: a static full-formation frame (no player movement) while the ball
  // is lobbed out to end the half. Must precede the generic kick-to-touch branch below,
  // which also matches tap_and_kick_dead via kickFindsTouch. Anchor = the tap mark
  // (event.ball — the engine doesn't reposition the ball for this outcome).
  if (event.phase === MatchPhase.Penalty && outcomeKeys(event).includes('tap_and_kick_dead'))
    return placeFormation(event, state, attacksTop, event.ballX, event.ballY, PENALTY_TAP_AND_KICK_DEAD);

  if (event.phase === MatchPhase.Penalty && kickFindsTouch(event)) {
    // The close-range corner kick (lands ≤10m from the opp try line) has its own
    // authored frame; the generic and long touch-finders share one.
    const form = outcomeKeys(event).includes('kick_to_touch_close')
      ? PENALTY_KICK_TO_TOUCH_CLOSE : PENALTY_KICK_TO_TOUCH;
    return placeFormation(event, state, attacksTop, prevBallX, prevBallY, form);
  }

  // A penalty kick to touch that misses behaves like an open-play tactical kick
  if (event.phase === MatchPhase.Penalty && outcomeKeys(event).includes('kick_to_touch_missed')) {
    return travelingKickLayout(event, state, attacksTop, prevBallX, prevBallY);
  }

  // Penalty tap-and-go: full-formation carry. The whole attacking shape surges forward
  // off the tap (chase via from-tables) while the carrier rides the ball's
  // [tap-mark, final] movements path. Anchored on the tap mark (movements[0] = the
  // pre-carry ball), so the formation rests relative to where the tap was taken.
  if (event.phase === MatchPhase.Penalty && outcomeKeys(event).includes('tap_and_go')) {
    const anchor = event.movements?.[0] ?? { x: event.ballX, y: event.ballY };
    const dots = placeFormation(event, state, attacksTop, anchor.x, anchor.y, PENALTY_TAP_AND_GO);
    // The carrier is driven by the ball-walk follower (rides the movements path), not the
    // chase seam — flag it and clear its `from` so the two animators don't fight the dot.
    const carrier = event.primaryPlayer;
    if (carrier && event.movements && event.movements.length >= 2) {
      const dot = dots.find(d => d.key === `${sideOf(carrier, state)}:${carrier.id}`);
      if (dot) { dot.isCarrier = true; dot.from = undefined; }
    }
    return dots;
  }

  // Pure-announcement beats (fatigue, injury, card, clock, set-piece award, etc.) have no
  // phase_outcome step and place no players. They return [] — PitchPlayers holds the
  // current formation through them (an empty beat doesn't fade the pitch) and adds the
  // injury/fatigue glow to the named player's dot, rather than clearing or relocating it.
  if (!event.narration.steps.some(s => s.kind === 'phase_outcome')) {
    // Exception: the kicks_for_touch announcement is emitted before the penalty
    // resolves. We want to show the players lining up for the kick to touch
    // (the authored pre-kick formation).
    if (event.phase === MatchPhase.Penalty && event.narration.steps.some(s => s.kind === 'announcement' && s.key === 'kicks_for_touch')) {
      return placeFormation(event, state, attacksTop, event.ballX, event.ballY, PENALTY_KICK_TO_TOUCH);
    }
    return [];
  }

  const phaseToCheck = event.displayPhase ?? event.phase;

  if (phaseToCheck === MatchPhase.Scrum)   return scrumLayout(event, state, attacksTop);
  if (phaseToCheck === MatchPhase.Lineout) return lineoutLayout(event, state, attacksTop);
  if (phaseToCheck === MatchPhase.Maul)    return maulLayout(event, state, attacksTop, prevBallX, prevBallY);

  // First phase off a set piece: diagonal backline formation anchored at the #9's
  // set-piece ending position (behind #8 or at the lineout feed mark).
  if (phaseToCheck === MatchPhase.FirstPhase
      && (prevPhase === MatchPhase.Scrum || prevPhase === MatchPhase.Lineout)) {
    return firstPhaseBacklineLayout(event, state, attacksTop, prevPhase, prevBallX, prevBallY);
  }

  // Breakdown: authored full-formation frames. Anchored on the live ruck (event.ball).
  if (phaseToCheck === MatchPhase.Breakdown) {
    const keys = outcomeKeys(event);
    if (keys.includes('clean_ball'))                   return placeFormation(event, state, attacksTop, event.ballX, event.ballY, BREAKDOWN_CLEAN);
    if (keys.includes('slow_ball'))                    return placeFormation(event, state, attacksTop, event.ballX, event.ballY, BREAKDOWN_SLOW_BALL);
    if (keys.includes('turnover'))                     return placeFormation(event, state, attacksTop, event.ballX, event.ballY, BREAKDOWN_TURNOVER);
    if (keys.includes('dangerous_cleanout_penalty'))   return placeFormation(event, state, attacksTop, event.ballX, event.ballY, BREAKDOWN_CLEANOUT_PEN);
    if (keys.includes('not_rolling_away_penalty'))     return placeFormation(event, state, attacksTop, event.ballX, event.ballY, BREAKDOWN_NOT_ROLLING_AWAY);
    if (keys.includes('offside_at_ruck_penalty'))      return placeFormation(event, state, attacksTop, event.ballX, event.ballY, BREAKDOWN_OFFSIDE_AT_RUCK);
    if (keys.includes('penalty_defending'))            return placeFormation(event, state, attacksTop, event.ballX, event.ballY, BREAKDOWN_PENALTY_DEFENDING);
  }

  return openPlayLayout(event, state, attacksTop);
}

// Kick phases a KickReturn can follow. On a kick → KickReturn transition the return is
// seeded from the predecessor kick formation: keep its dots on screen and glide, rather
// than fading the pack and re-drawing a sparse return layout.
const KICK_PREDECESSORS = new Set<string>([
  MatchPhase.KickOff, MatchPhase.BoxKick, MatchPhase.TacticalKick, MatchPhase.DropOut22, MatchPhase.Penalty,
]);

// What the dot layer (PitchPlayers) should do on a phase-change beat. Pure decision —
// all the rugby phase-name knowledge that the dumb dot pool must not carry lives here:
//  - `snap`: the kick-off / half-time / full-time frames reset wholesale, so they
//    snap-cut (a faster transition reads as a cut, not a drift) rather than glide.
//  - `hold`: keep the predecessor formation on screen (skip fading persisted dots) so
//    only the involved actors move. True when a set piece flows into FirstPhase
//    (forwards hold their pack shape), a kick flows into KickReturn (seed from the kick
//    formation), or the next phase is a held-formation phase (TMO review, PhasePlay,
//    TryScored, Substitution, BoxKick announce). The empty-beat hold (nextKeys.size === 0)
//    stays in applyBeat — it depends on the placed dots, not just the phase.
//  - `preserveKeys`: dot keys whose position must NOT be updated this beat. The attacking
//    #9 starts FirstPhase at its set-piece position (lineout mark / behind #8) so the
//    first-phase dot reads as a continuation; subsequent beats reposition it normally.
// `currentPhase` is the phase of the previous beat.
export interface TransitionDirective { snap: boolean; hold: boolean; preserveKeys: string[]; }
export function transitionDirective(event: GameEvent, currentPhase: string | null): TransitionDirective {
  const phase = event.phase;
  const snap = phase === MatchPhase.KickOff || phase === MatchPhase.HalfTime || phase === MatchPhase.FullTime;

  const keepLineout = (currentPhase === MatchPhase.Lineout || currentPhase === MatchPhase.Scrum || currentPhase === MatchPhase.Maul)
    && phase === MatchPhase.FirstPhase;
  const keepKickFormation = currentPhase !== null && KICK_PREDECESSORS.has(currentPhase)
    && phase === MatchPhase.KickReturn;
  const keepTmo = phase === MatchPhase.TmoReview;
  const keepPhasePlay = phase === MatchPhase.PhasePlay;
  const keepTryScored = phase === MatchPhase.TryScored;
  const keepSubstitution = phase === MatchPhase.Substitution;
  const keepBoxKickAnnounce = phase === MatchPhase.BoxKick
    && event.narration.steps.some(s => s.kind === 'phase_outcome' && (s as { key: string }).key === 'announce');

  const hold = keepLineout || keepKickFormation || keepTmo || keepPhasePlay
    || keepTryScored || keepSubstitution || keepBoxKickAnnounce;

  const preserveKeys = keepLineout
    ? [`${event.side === 'home' ? 'h' : 'a'}:${SLOT.SCRUM_HALF}`]
    : [];

  return { snap, hold, preserveKeys };
}

// A kick that found touch — the ball went OUT and a lineout forms next beat, so
// there's no catch (no on-ball receiver) and PitchView walks the ball across the
// touchline. The engine resolves these to the lineout mark (~5m infield). Covers
// tactical / box kicks AND a penalty kicked to touch (kick_to_touch*, but NOT the
// _missed variant, which is caught in field).
const KICK_TO_TOUCH_KEYS = new Set([
  'good_kick', 'out_on_the_full', 'fifty_twenty_two', 'fifty_twenty_two_attempt_failed_touch',
  'box_kick_to_touch', 'kick_to_touch', 'kick_to_touch_close', 'kick_to_touch_long',
  // Tap-and-kick-dead ends the half by putting the ball out — same ball-out lob in PitchView.
  'tap_and_kick_dead',
]);
export function kickFindsTouch(event: GameEvent): boolean {
  return event.narration.steps.some(s => s.kind === 'phase_outcome' && KICK_TO_TOUCH_KEYS.has((s as { key: string }).key));
}

// Open-field traveling kick — tactical kick (incl. 50:22), box kick, drop-out, and
// the goal-kick spot for conversions. The ball flies from the kicker to the landing,
// so two dots tell that story: the ON-BALL player at the landing (whoever holds the
// ball after the kick == the side now in possession — the receiver on a caught kick,
// the kicker on a retained kick or a goal kick) and the OTHER named actor (the
// kicker, or a beaten chaser) back at the kick origin (the previous beat's ball
// position). Replaces the old layout that always drew event.side's fly-half at the
// landing regardless of who actually kicked or caught it.
function travelingKickLayout(
  event: GameEvent, state: MatchState, attacksTop: boolean,
  prevBallX: number, prevBallY: number,
): Placed[] {
  const possSide: Side = event.side === 'home' ? 'h' : 'a';
  const fwd = attacksTop ? 1 : -1;
  const p1 = event.primaryPlayer ?? null;
  const p2 = event.secondaryPlayer ?? null;

  // Identify the kicker (back at the origin) vs the on-ball player (at the landing).
  // For tactical / box / conversion kicks the primary actor IS the kicker and the
  // secondary (if any) is the receiver / chaser who ends on the ball. Drop-outs name
  // the receiver as primary (the kicker isn't a listed actor), so swap those.
  const findsTouch = kickFindsTouch(event);
  let kicker: Player | null;
  let onBall: Player | null;
  if (event.phase === MatchPhase.DropOut22) {
    onBall = p1;   // receiver gathers the drop-out at the landing
    kicker = p2;   // chaser tracks down from the kick origin
  } else {
    kicker = p1;
    onBall = p2;
    // No named receiver (goal kick, or a retained regather): the kicker is the
    // on-ball dot at the kick spot, with nobody left at the origin. Not for a kick to
    // touch (it goes out — keep the kicker at the origin, place no receiver).
    if (!onBall && p1 && sideOf(p1, state) === possSide && !findsTouch) { onBall = p1; kicker = null; }
  }
  // A kick to touch has no catch — drop the on-ball dot so no defender sits under the
  // ball; only the kicker shows (the lineout forms on the next beat).
  if (findsTouch) onBall = null;

  const out: Placed[] = [];
  // Kicker / beaten chaser back at the kick origin (where the ball started this beat).
  if (kicker) {
    out.push(placed(kicker, sideOf(kicker, state), state, clampX(prevBallX), clampY(prevBallY), false));
  }
  // On-ball player just behind the ball's landing spot, so their circle reads on the ball.
  if (onBall) {
    out.push(placed(onBall, sideOf(onBall, state), state, clampX(event.ballX - fwd * CARRIER_BEHIND_BALL), clampY(event.ballY), true));
  }
  return out;
}

// ── Ball-relative formation templates (phase-animator exports) ────────────────
// Each authored frame's t=0 player positions, stored as [dx, dy] offsets from the
// ball, in one canonical frame: the ATTACKING team drives toward +x (top), and the
// ball sits near the touchline named by `nearTop`. At play-time `placeFormation`
// anchors the table on the live ball / ruck (or, for a box-kick outcome, the kick
// origin), flips dx to the attacking team's real direction, and mirrors dy when the
// live ball is on the opposite touchline. Re-author in the phase animator and re-bake
// the offsets to retune — see docs/phase-animator.md § 9.
export const outcomeKeys = (event: GameEvent): string[] =>
  event.narration.steps.filter(s => s.kind === 'phase_outcome').map(s => (s as { key: string }).key);

// Place all 30 players from a Formation template. The attacking side is whoever
// `event.primaryPlayer` belongs to (the kicker / breakdown supporter / cleanout
// offender — always on the attacking team), so a possession-swap outcome still maps
// the kicking pack and the receiving cover to the correct live sides.
function placeFormation(
  event: GameEvent, state: MatchState, attacksTop: boolean,
  anchorX: number, anchorY: number, form: Formation,
): Placed[] {
  const ref = event.primaryPlayer;
  const atkSide: Side = ref ? sideOf(ref, state) : (event.side === 'home' ? 'h' : 'a');
  const defSide: Side = atkSide === 'h' ? 'a' : 'h';
  const possSide: Side = event.side === 'home' ? 'h' : 'a';
  // The attacking team's real long-axis direction. `attacksTop` describes the side in
  // possession (event.side); when the attackers are NOT in possession (a box kick
  // caught by the receiver) it flips. However, defensive breakdown formations
  // (turnovers, defensive penalties) were authored with `atk` (the new attacker)
  // already inverted (positive X offsets). Flipping `dir` for them would cause a double-flip.
  const flipDir = form.defenderIsAttacker ? false : (atkSide !== possSide);
  const dir = (flipDir ? !attacksTop : attacksTop) ? 1 : -1;
  const mirrorY = form.nearTop !== (anchorY >= 50);
  // The canonical Formation frame is authored attacking toward +x, so the long-axis
  // flip relative to it is (dir === -1) and the lateral flip is mirrorY. A reflection
  // on exactly ONE axis swaps the field side a role sits on, so the paired jersey
  // slots (1<->3, 6<->7, 11<->14) swap too — matching the engine pipeline's
  // `flipX !== flipY`. Skipped for defenderIsAttacker frames: those are authored
  // pre-inverted (no clean canonical orientation), so their swap parity is unverified —
  // leave them un-swapped until checked in the animator.
  const swapLateral = !form.defenderIsAttacker && ((dir === -1) !== mirrorY);
  const atkOn = onFieldPlayers(atkSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(atkSide));
  const defOn = onFieldPlayers(defSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(defSide));

  const out: Placed[] = [];
  const cX = form.unclamped ? (x: number) => x : clampX;
  const cY = form.unclamped ? (y: number) => y : clampY;

  const fill = (on: Player[], side: Side, tbl: FormOffsets, fromTbl?: FormOffsets): void => {
    for (let slot = 1; slot <= 15; slot++) {
      // The real player in `slot` reads the authored offset for its laterally-paired
      // slot when the frame is reflected on one axis.
      const tblSlot = swapLateral ? swapPairedSlot(slot) : slot;
      const off = tbl[tblSlot];
      const p = on.find(pl => pl.id === slot);
      if (off && p) {
        const dot = placed(p, side, state,
          cX(anchorX + off[0] * dir),
          cY(anchorY + (mirrorY ? -off[1] : off[1])), false);
        const fromOff = fromTbl?.[tblSlot];
        if (fromOff) dot.from = {
          x: cX(anchorX + fromOff[0] * dir),
          y: cY(anchorY + (mirrorY ? -fromOff[1] : fromOff[1])),
        };
        out.push(dot);
      }
    }
  };
  fill(atkOn, atkSide, form.atk, form.atkFrom);
  fill(defOn, defSide, form.def, form.defFrom);
  return out;
}

// Kick-off: kicker on the centre spot, both XVs in the authored kick-off formation,
// and the real catcher snapped to the real landing. The kick-off spans several beats
// (coin-toss → announce → outcome) with NO phase change between them, so persisted
// dots accumulate. The full formation appears at the START positions on the announce
// beat (static) and animates the chase to the END positions on the actual kick beat;
// using the same kick-direction transform on both (derived from team orientation, not
// the landing) keeps the formation continuous — no jump when the chase fires.
function kickOffLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const possSide: Side = event.side === 'home' ? 'h' : 'a';
  const keys = event.narration.steps
    .filter(s => s.kind === 'phase_outcome')
    .map(s => (s as { key: string }).key);
  // coin_toss / announce are also phase_outcome steps, so detect the kick beats by key.
  const SWAP_KEYS = ['clean_receive', 'knock_on', 'poor_kick'];   // possession → receivers
  const swapped     = keys.some(k => SWAP_KEYS.includes(k));
  const isKickBeat  = swapped || keys.includes('short_kick_retain');
  const isAnnounce  = keys.includes('announce');

  // Kicking team. Because GameEvent.side is now strictly the team that started
  // the phase, possSide is ALWAYS the kicking team across the entire kick-off.
  const kickSide: Side = possSide;
  const kickOn = onFieldPlayers(kickSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(kickSide));
  const kicker = kickOn.find(p => p.id === SLOT.FLY_HALF) ?? kickOn[0];

  const out: Placed[] = [];
  // Kicker over the centre spot — shown on every kick-off beat (incl. pre-kick).
  if (kicker) out.push(placed(kicker, kickSide, state, 50, 50, true));

  // The full formation appears on the announce beat (static, START positions) and the
  // kick beat (END positions + chase). Other pre-kick beats (coin-toss) stay kicker-only.
  if (isKickBeat || isAnnounce) {
    const recvSide: Side = kickSide === 'h' ? 'a' : 'h';
    const recvOn = onFieldPlayers(recvSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(recvSide));
    const receiver = isKickBeat ? event.primaryPlayer : null;
    // Kick direction (ball travel from halfway) from TEAM ORIENTATION. attacksTop
    // is the kicker's direction on every beat.
    const kickDir = attacksTop ? 1 : -1;
    const tx = (p: [number, number]): [number, number] =>
      [clampX(50 - (p[0] - 50) * kickDir), clampY(p[1])];
    // On the kick beat each dot rests at `to` and animates the chase from `from`; on the
    // announce beat it sits statically at `from` (no animation, no landing yet).
    const place = (p: Player, side: Side, spot: KickoffSpot): void => {
      const [x, y] = tx(isKickBeat ? spot.to : spot.from);
      const dot = placed(p, side, state, x, y, false);
      if (isKickBeat) { const [fx, fy] = tx(spot.from); dot.from = { x: fx, y: fy }; }
      out.push(dot);
    };

    // Use short chase tables if the ball landed near the 10m line (dist from 50 <= 20).
    const isShort = Math.abs(event.ballX - 50) <= 20;
    const recvTable = isShort ? KICKOFF_SHORT_RECV : KICKOFF_RECV;
    const kickTable = isShort ? KICKOFF_SHORT_KICK : KICKOFF_KICK;

    // Receiving XV in the authored shape; on the kick beat the real catcher runs onto
    // the real landing (from its authored start, so it's continuous with the announce beat).
    for (let slot = 1; slot <= 15; slot++) {
      const p = recvOn.find(pl => pl.id === slot);
      const spot = recvTable[slot];
      if (!p || !spot) continue;
      if (receiver && p === receiver) {
        const dot = placed(p, recvSide, state, clampX(event.ballX), clampY(event.ballY), false);
        const [fx, fy] = tx(spot.from);
        dot.from = { x: fx, y: fy };
        out.push(dot);
      } else {
        place(p, recvSide, spot);
      }
    }
    // Kicking XV chase line + cover (the kicker is already placed on the centre spot).
    for (let slot = 1; slot <= 15; slot++) {
      const p = kickOn.find(pl => pl.id === slot);
      const spot = kickTable[slot];
      if (!p || p === kicker || !spot) continue;
      place(p, kickSide, spot);
    }
  }

  return out;
}

function dropOutLayout(
  event: GameEvent, state: MatchState, attacksTop: boolean, prevBallX: number, prevBallY: number,
): Placed[] {
  const possSide: Side = event.side === 'home' ? 'h' : 'a';
  const keys = outcomeKeys(event);
  const isAnnounce = keys.includes('announce');
  const isReceive  = keys.includes('clean_receive');
  // Only the two authored beats get the full chase; other outcomes (knock_on, poor_kick)
  // fall back to the generic traveling-kick layout (kicker at origin + receiver at landing).
  if (!isAnnounce && !isReceive) return travelingKickLayout(event, state, attacksTop, prevBallX, prevBallY);

  // Kicking team. Because GameEvent.side is now strictly the team that started
  // the phase, possSide is ALWAYS the kicking team.
  const kickSide: Side = possSide;
  const recvSide: Side = kickSide === 'h' ? 'a' : 'h';
  const kickOn = onFieldPlayers(kickSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(kickSide));
  const recvOn = onFieldPlayers(recvSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(recvSide));

  // Long-axis flip: the authored frame has the kicker attacking −x. attacksTop is the
  // kicker's orientation on every beat. No lateral (y) mirror — the
  // landing side isn't known at announce, matching the kick-off.
  const flip = attacksTop ? -1 : 1;
  const anchorX = event.ballX, anchorY = event.ballY;
  const tx = (off: [number, number]): [number, number] =>
    [clampX(anchorX + off[0] * flip), clampY(anchorY + off[1])];

  const kickTbl = isReceive ? DROPOUT_RECEIVE_KICK : DROPOUT_ANNOUNCE_KICK;
  const recvTbl = isReceive ? DROPOUT_RECEIVE_RECV : DROPOUT_ANNOUNCE_RECV;
  const onBall = event.primaryPlayer;   // announce → kicker; receive → catcher

  const out: Placed[] = [];
  const fill = (on: Player[], side: Side, tbl: Record<number, KickoffSpot>, snapHere: boolean): void => {
    for (let slot = 1; slot <= 15; slot++) {
      const p = on.find(pl => pl.id === slot);
      const spot = tbl[slot];
      if (!p || !spot) continue;
      const [fx, fy] = tx(spot.from);
      if (snapHere && onBall && p === onBall) {
        // On-ball actor snaps to the real ball, chasing in from its authored start.
        const dot = placed(p, side, state, clampX(anchorX), clampY(anchorY), true);
        dot.from = { x: fx, y: fy };
        out.push(dot);
      } else {
        const [tx0, ty0] = tx(spot.to);
        const dot = placed(p, side, state, tx0, ty0, false);
        dot.from = { x: fx, y: fy };
        out.push(dot);
      }
    }
  };
  fill(kickOn, kickSide, kickTbl, isAnnounce);   // kicker is the on-ball actor on announce
  fill(recvOn, recvSide, recvTbl, isReceive);    // catcher is the on-ball actor on receive
  return out;
}

// Raw JSON absolute coordinates for conversion kick. Ball was at x=75, y=88.
function conversionLayout(
  event: GameEvent, state: MatchState, attacksTop: boolean, prevBallX: number, prevBallY: number
): Placed[] {
  const possSide: Side = event.side === 'home' ? 'h' : 'a';
  const defSide: Side = possSide === 'h' ? 'a' : 'h';
  
  const atkOn = onFieldPlayers(possSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(possSide));
  const defOn = onFieldPlayers(defSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(defSide));
  
  const out: Placed[] = [];
  const dir = attacksTop ? 1 : -1;
  const mirrorY = prevBallY < 50;

  const fill = (on: Player[], side: Side, tbl: Record<number, readonly [number, number]>) => {
    for (let slot = 1; slot <= 15; slot++) {
      const p = on.find(pl => pl.id === slot);
      if (!p) continue;

      let x: number, y: number;
      if (side === possSide && slot === 10) {
        x = prevBallX - 2 * dir;
        y = prevBallY;
      } else if (side === defSide && slot === 11) {
        x = attacksTop ? 100 : 0;
        y = prevBallY;
      } else {
        const abs = tbl[slot];
        if (!abs) continue;
        x = attacksTop ? abs[0] : 100 - abs[0];
        y = mirrorY ? 100 - abs[1] : abs[1];
      }
      out.push(placed(p, side, state, x, y, false));
    }
  };

  fill(atkOn, possSide, CONV_ABS.atk);
  fill(defOn, defSide, CONV_ABS.def);
  return out;
}

// Substitution: place the outgoing player (secondaryPlayer) and incoming player
// (primaryPlayer) near the far touchline so they don't crowd the live action.
function substitutionLayout(event: GameEvent, state: MatchState): Placed[] {
  const on  = event.primaryPlayer;   // coming on
  const off = event.secondaryPlayer; // going off
  if (!on && !off) return [];
  // Use the touchline furthest from the ball so subs don't overlap live action.
  const farY = event.ballY <= 50 ? 97 : 3;
  const inward = farY > 50 ? -1 : 1;
  // Stagger multiple substitutions along the touchline based on the player's slot ID
  const baseId = on ? on.id : (off ? off.id : 8);
  const x = clampX(event.ballX + (baseId - 8) * 1.5);
  const out: Placed[] = [];
  if (off) out.push(placed(off, sideOf(off, state), state, x, farY,             false));
  if (on)  out.push(placed(on,  sideOf(on,  state), state, x, clampY(farY + inward * 7), false));
  return out;
}

// Carrier placed slightly behind the ball so the circle and number are visible.
// Support attackers fanned behind in a wider arc. Defenders just ahead.
// For FirstPhase, the scrum-half is injected as the link between set-piece and carry.
function openPlayLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const actors = harvestActors(event);
  if (actors.length === 0) return [];
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const fwd = attacksTop ? 1 : -1;           // +x toward the attacking in-goal
  const { ballX, ballY } = event;

  const attackers: Player[] = [];
  const defenders: Player[] = [];
  for (const p of actors) (sideOf(p, state) === atkSide ? attackers : defenders).push(p);

  // For FirstPhase and Breakdown, inject the scrum-half as the link player if
  // not already in the actor list — at breakdown they appear at the ruck base
  // picking up; at first-phase they show the SH→10 pass chain visually.
  if (event.phase === MatchPhase.FirstPhase || event.phase === MatchPhase.Breakdown) {
    const atkTeam = atkSide === 'h' ? state.homeTeam : state.awayTeam;
    const sh = atkTeam.players.find(p => p.id === SLOT.SCRUM_HALF);
    if (sh && !attackers.includes(sh)) attackers.splice(1, 0, sh);
  }

  const out: Placed[] = [];
  const [carrier, ...support] = attackers;

  // Carrier sits just behind the ball so their circle is visible alongside it. On a try the
  // scorer is placed relative to the TRY LINE (x=100 / x=0): a try requires the ball to REACH
  // the line, and the [0,100] clamp means ballX rests exactly ON it, while the display
  // snapshot grounds the ball inside the in-goal (line + dir*4). Place the scorer `fwd*2.5`
  // past the line (just behind the in-goal ball, clearly over) via the wider in-goal clamp;
  // the standard clampX [2,98] would strand them on-field; the keepTryScored glide eases
  // them across.
  let carrierDot: Placed | null = null;
  if (carrier) {
    const carrierX = event.phase === MatchPhase.TryScored
      ? clampInGoalX((fwd > 0 ? 100 : 0) + fwd * CARRIER_BEHIND_BALL)
      : clampX(ballX - fwd * CARRIER_BEHIND_BALL);
    carrierDot = placed(carrier, atkSide, state, carrierX, ballY, true);
    out.push(carrierDot);
  }

  // Support attackers: fan behind the carrier in a wider arc so circles don't overlap.
  // Each player steps 6 x-units further back and is spread laterally by 8 y-units.
  support.forEach((p, i) => {
    const lateralOffset = fanLateral(i);
    out.push(placed(p, atkSide, state,
      clampX(ballX - fwd * (8 + i * 6)),
      clampY(ballY + lateralOffset), false));
  });

  const defSide: Side = atkSide === 'h' ? 'a' : 'h';
  const tackler = event.secondaryPlayer && sideOf(event.secondaryPlayer, state) === defSide ? event.secondaryPlayer : null;

  defenders.forEach((p, i) => {
    if (p === tackler && carrierDot) {
      // Pin tackler to the ball carrier to visually represent the collision.
      // Derive the tackle spot from the carrier's ACTUAL placed position (on a
      // try that's `fwd*2.5` past the line, not ballX, which rests ON the line)
      // so the tackler lands fwd*1.3 behind the scorer rather than adrift. Give
      // them a `from` at their defensive-line spot so the WAAPI chase animation
      // runs them INTO the tackle over the beat duration.
      const tackleX = clampDefenderX(carrierDot.x + fwd * TACKLER_AHEAD, fwd);
      const defLineX = clampDefenderX(ballX + fwd * 10, fwd);
      const defLineY = clampY(ballY + 4);
      const dot = placed(p, defSide, state, tackleX, carrierDot.y, false);
      dot.from = { x: defLineX, y: defLineY };
      const isDominant = event.outcome === 'dominant_carry' || event.outcome === 'dominant_tackle';
      if (isDominant) dot.isDominantTackler = true;
      out.push(dot);
    } else {
      const lateralOffset = fanLateral(i);
      out.push(placed(p, defSide, state,
        clampDefenderX(ballX + fwd * (3 + i * 6), fwd),
        clampY(ballY + lateralOffset), false));
    }
  });
  return out;
}

// Maul: both packs form around the ball in the same geometry as a scrum.
// Reuses pack() so the same player keys are used — when this follows a lineout,
// PitchPlayers enables top/left transitions and the dots animate from their
// lineout spread positions into this cluster (the Lineout→Maul visual).
function maulLayout(event: GameEvent, state: MatchState, attacksTop: boolean, prevBallX: number, prevBallY: number): Placed[] {
  const fwd = attacksTop ? 1 : -1;
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const defSide: Side = atkSide === 'h' ? 'a' : 'h';
  const atkTeam = atkSide === 'h' ? state.homeTeam : state.awayTeam;
  const defTeam = defSide === 'h' ? state.homeTeam : state.awayTeam;

  // The maul forms from a lineout. The lineout mark was prevBallX, prevBallY.
  // We use prevBallY to determine the near touchline for the backs.
  const nearY = prevBallY < 50 ? 0 : 100;
  const inward = nearY === 0 ? 1 : -1;
  const toY = (distNear: number) => clampY(nearY + inward * distNear);

  // Attacking pack uses MAUL_ATK_ROWS so the hooker animates to the back of the maul.
  // Defending pack stays in standard scrum formation (they're defending from the front).
  // No isCarrier flag: the maul drives as a bound unit (the whole pack glides
  // forward to the post-drive cluster via the Layer-3 dot-transitioning class),
  // so we deliberately do NOT peel the hooker off onto the ball via the follower.
  const out: Placed[] = [
    ...pack(state, atkSide, event.ballX, event.ballY, -fwd, MAUL_ATK_ROWS),
    ...pack(state, defSide, event.ballX, event.ballY, +fwd),
  ];

  // Backs stay in their lineout positions. We anchor their X from prevBallX
  // and Y from prevBallY.
  const atkOn = onFieldPlayers(atkTeam, state, possOf(atkSide));
  const defOn = onFieldPlayers(defTeam, state, possOf(defSide));
  for (const e of LINEOUT_ATK_BACKS) {
    const p = atkOn.find(pl => pl.id === e.slot);
    if (p) out.push(placed(p, atkSide, state, clampX(prevBallX - fwd * e.dX), toY(e.dY), false));
  }
  for (const e of LINEOUT_DEF_BACKS) {
    const p = defOn.find(pl => pl.id === e.slot);
    if (p) out.push(placed(p, defSide, state, clampDefenderX(prevBallX + fwd * e.dX, fwd), toY(e.dY), false));
  }

  // Scrum-halves stay in their lineout positions.
  const atkSH = atkOn.find(p => p.id === SLOT.SCRUM_HALF);
  const defSH = defOn.find(p => p.id === SLOT.SCRUM_HALF);
  const TEN_M_Y = clampY(nearY + inward * 14);
  if (atkSH) out.push(placed(atkSH, atkSide, state, clampX(prevBallX - fwd * 4), TEN_M_Y, false));
  if (defSH) out.push(placed(defSH, defSide, state, clampDefenderX(prevBallX + fwd * 4, fwd), TEN_M_Y, false));

  return out;
}

function scrumLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const fwd = attacksTop ? 1 : -1;
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const defSide: Side = atkSide === 'h' ? 'a' : 'h';

  const atkTeam = atkSide === 'h' ? state.homeTeam : state.awayTeam;
  const defTeam = defSide === 'h' ? state.homeTeam : state.awayTeam;

  const scrumY = Math.max(5, Math.min(95, event.ballY));

  const nearY  = scrumY < 50 ? 0 : 100;
  const inward = nearY === 0 ? 1 : -1;
  const toY    = (distNear: number) => clampY(nearY + inward * distNear);

  const out: Placed[] = [];
  const choreographedKeys = new Set<string>();

  if (event.choreography) {
    for (const p of event.choreography) {
      const team = p.side === 'h' ? state.homeTeam : state.awayTeam;
      const pl = team.players.find(x => x.id === p.id);
      if (pl && p.movements && p.movements.length > 0) {
        // No `from`: a choreographed dot is driven by PitchView's choreography
        // loop (its keyframes already encode the start). Setting `from` would
        // ALSO push it to chaseDots, so two animators would fight the element.
        const last = p.movements[p.movements.length - 1];
        const dot = placed(pl, p.side, state, clampX(last.x), clampY(last.y), false);
        out.push(dot);
        choreographedKeys.add(`${p.side}:${p.id}`);
      }
    }
  }

  // Base pack (fallback for any un-choreographed forwards)
  const baseAtkPack = pack(state, atkSide, event.ballX, scrumY, -fwd);
  for (const pl of baseAtkPack) {
    if (!choreographedKeys.has(pl.key)) out.push(pl);
  }
  const baseDefPack = pack(state, defSide, event.ballX, scrumY, +fwd);
  for (const pl of baseDefPack) {
    if (!choreographedKeys.has(pl.key)) out.push(pl);
  }

  const atkOn = onFieldPlayers(atkTeam, state, possOf(atkSide));
  const defOn = onFieldPlayers(defTeam, state, possOf(defSide));
  for (const e of SCRUM_ATK_BACKS) {
    const p = atkOn.find(pl => pl.id === e.slot);
    if (p && !choreographedKeys.has(`${atkSide}:${p.id}`)) {
      out.push(placed(p, atkSide, state, clampX(event.ballX - fwd * e.dX), clampY(scrumY + inward * e.dY), false));
    }
  }
  for (const e of SCRUM_DEF_BACKS) {
    const p = defOn.find(pl => pl.id === e.slot);
    if (p && !choreographedKeys.has(`${defSide}:${p.id}`)) {
      out.push(placed(p, defSide, state, clampDefenderX(event.ballX + fwd * e.dX, fwd), clampY(scrumY + inward * e.dY), false));
    }
  }

  const atkSH = onFieldPlayers(atkTeam, state, possOf(atkSide)).find(p => p.id === SLOT.SCRUM_HALF);
  const defSH = onFieldPlayers(defTeam, state, possOf(defSide)).find(p => p.id === SLOT.SCRUM_HALF);
  const isDominantPenalty = event.outcome === 'attacking_dominant_penalty'
                         || event.outcome === 'defending_dominant_penalty';
  if (isDominantPenalty) {
    const fromY  = clampY(scrumY + inward * 9);
    if (atkSH && !choreographedKeys.has(`${atkSide}:${atkSH.id}`)) {
      out.push({ ...placed(atkSH, atkSide, state, clampX(event.ballX - fwd * 2.0), clampY(scrumY), false), from: { x: clampX(event.ballX - fwd * 2.0), y: fromY } });
    }
    if (defSH && !choreographedKeys.has(`${defSide}:${defSH.id}`)) {
      out.push({ ...placed(defSH, defSide, state, clampDefenderX(event.ballX + fwd * 9.0, fwd), clampY(scrumY), false), from: { x: clampDefenderX(event.ballX + fwd * 2.0, fwd), y: fromY } });
    }
  } else {
    if (atkSH && !choreographedKeys.has(`${atkSide}:${atkSH.id}`)) {
      const dot = placed(atkSH, atkSide, state, clampX(event.ballX - fwd * 2.0), clampY(scrumY), false);
      dot.scrumHalfRole = 'atk';
      out.push(dot);
    }
    if (defSH && !choreographedKeys.has(`${defSide}:${defSH.id}`)) {
      const dot = placed(defSH, defSide, state, clampDefenderX(event.ballX + fwd * 9.0, fwd), clampY(scrumY), false);
      dot.scrumHalfRole = 'def';
      out.push(dot);
    }
  }

  return out;
}

function pack(state: MatchState, side: Side, ballX: number, ballY: number, dir: number, rows = SCRUM_ROWS): Placed[] {
  const team = side === 'h' ? state.homeTeam : state.awayTeam;
  // availableForwards already returns the on-field forwards as objects keyed by
  // their slot id — index them directly rather than a Set + linear find per cell.
  const bySlot = new Map(availableForwards(team, state, possOf(side)).map(p => [p.id, p]));
  const out: Placed[] = [];
  for (const row of rows) {
    for (const cell of row.cells) {
      const p = bySlot.get(cell.slot);
      if (!p) continue;                                      // binned/off → gap (fine)
      out.push(placed(p, side, state, clampInGoalX(ballX + dir * row.dx), clampY(ballY + cell.y), false));
    }
  }
  return out;
}

// Lineout: two parallel lines of forwards (excl. hooker) along the throw axis (X),
// spaced 7 x-units apart so circles don't overlap. The throwing team's hooker stands
// on the touchline; the defending hooker stands in the 5m channel at the same X.
function lineoutLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const defSide: Side = atkSide === 'h' ? 'a' : 'h';
  const nearY = event.ballY < 50 ? 0 : 100;
  const inward = nearY === 0 ? 1 : -1;
  const fwd = attacksTop ? 1 : -1;

  const atkTeam = atkSide === 'h' ? state.homeTeam : state.awayTeam;
  const defTeam = defSide === 'h' ? state.homeTeam : state.awayTeam;
  const atkFwds = availableForwards(atkTeam, state, possOf(atkSide));
  const defFwds = availableForwards(defTeam, state, possOf(defSide));

  const atkHooker = atkFwds.find(p => p.id === SLOT.HOOKER);
  const defHooker = defFwds.find(p => p.id === SLOT.HOOKER);

  const out: Placed[] = [];

  // Throwing team's hooker just OFF the pitch at the throw mark (they stand in touch
  // to throw in). y < 0 / > 100 extrapolates past the touchline via toLeft.
  // On a crooked throw, they step back onto the touchline (from off-pitch) so the
  // bad throw reads visually distinct from a clean lineout.
  if (atkHooker) {
    const offPitchY = nearY === 0 ? -2 : 102;
    if (event.outcome === 'crooked_throw') {
      out.push({ ...placed(atkHooker, atkSide, state, event.ballX, nearY, false), from: { x: event.ballX, y: offPitchY } });
    } else {
      out.push(placed(atkHooker, atkSide, state, event.ballX, offPitchY, false));
    }
  }

  // Defending hooker at the near end of the lineout (5m line), slightly ahead of the mark.
  if (defHooker) {
    out.push(placed(defHooker, defSide, state,
      clampDefenderX(event.ballX + fwd * 2, fwd),
      clampY(nearY + inward * 7),
      false));
  }

  // Six forwards per side (excluding hooker). The lineout runs PERPENDICULAR to the
  // touchline — players spread along Y from the 5m line to the 15m line.
  // ~7 pitch units = 5m from touchline; ~21 pitch units = 15m from touchline.
  const FIVE_M_Y    = nearY + inward * 7;
  const FIFTEEN_M_Y = nearY + inward * 21;

  const atkLine = atkFwds.filter(p => p.id !== SLOT.HOOKER).slice(0, 7);
  const defLine = defFwds.filter(p => p.id !== SLOT.HOOKER).slice(0, 7);

  // Attacking line slightly behind the mark; defending line slightly ahead.
  // Players share the same Y positions (interleaved in real rugby) but different X.
  const lineSpread = (players: Player[], side: Side, xOff: number, useDefClamp: boolean = false): void => {
    const n = players.length;
    if (n === 0) return;
    const x = useDefClamp ? clampDefenderX(event.ballX + xOff, fwd) : clampX(event.ballX + xOff);
    players.forEach((p, i) => {
      const t = n > 1 ? i / (n - 1) : 0.5;
      out.push(placed(p, side, state, x, clampY(FIVE_M_Y + t * (FIFTEEN_M_Y - FIVE_M_Y)), false));
    });
  };

  lineSpread(atkLine, atkSide, -fwd * 2, false);
  lineSpread(defLine, defSide, +fwd * 2, true);

  // Each #9 stands 2m behind their own line (2 more x-units back) and 10m infield
  // from touch (~14 y-units). onFieldPlayers covers backs; availableForwards doesn't.
  const TEN_M_Y = clampY(nearY + inward * 14);
  const atkSH = onFieldPlayers(atkTeam, state, possOf(atkSide)).find(p => p.id === SLOT.SCRUM_HALF);
  const defSH = onFieldPlayers(defTeam, state, possOf(defSide)).find(p => p.id === SLOT.SCRUM_HALF);
  if (atkSH) out.push(placed(atkSH, atkSide, state, clampX(event.ballX - fwd * 4), TEN_M_Y, false));
  if (defSH) out.push(placed(defSH, defSide, state, clampDefenderX(event.ballX + fwd * 4, fwd), TEN_M_Y, false));

  // Backs for both sides — fixed lateral spread from the lineout touchline;
  // depth is a placeholder (lineout X varies too much by outcome to parameterise).
  const atkOn = onFieldPlayers(atkTeam, state, possOf(atkSide));
  const defOn = onFieldPlayers(defTeam, state, possOf(defSide));
  for (const e of LINEOUT_ATK_BACKS) {
    const p = atkOn.find(pl => pl.id === e.slot);
    if (p) out.push(placed(p, atkSide, state, clampX(event.ballX - fwd * e.dX), clampY(event.ballY + inward * e.dY), false));
  }
  for (const e of LINEOUT_DEF_BACKS) {
    const p = defOn.find(pl => pl.id === e.slot);
    if (p) out.push(placed(p, defSide, state, clampDefenderX(event.ballX + fwd * e.dX, fwd), clampY(event.ballY + inward * e.dY), false));
  }

  return out;
}

// First phase off a set piece: backs placed at the engine's REAL lateral sweep
// positions, not a synthesised fan. `event.movements` is the ball's pass-by-pass
// path — index 0 is the set-piece feed, the final entry is the carrier's post-
// carry position, and every entry between is one backline pass landing (the
// receiving back's lateral position). We map the narration pass chain (#10 then
// each pass's receiver) onto those receive hops, so each dot sits where the ball
// actually went; only a small depth stagger (deeper as play goes wider) is
// synthesised for the diagonal read. The carrier rides the final carry leg onto
// the ball via PitchView's follower, so its placed spot here is just a seed.
//
// The #9's dot position is preserved in the DOM by PitchPlayers (setpieceSHKey
// guard), so we still return a Placed for them at the set-piece coords.
function firstPhaseBacklineLayout(
  event: GameEvent, state: MatchState, attacksTop: boolean,
  prevPhase: string, prevBallX: number, prevBallY: number,
): Placed[] {
  // No multi-leg sweep (knock-on / interception / penalty first phase) → there's
  // no engine pass-path to anchor on; fall back to the generic open-play layout.
  const hops = event.movements;
  if (!hops || hops.length < 3) return openPlayLayout(event, state, attacksTop);

  const fwd     = attacksTop ? 1 : -1;
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const defSide: Side = atkSide === 'h' ? 'a' : 'h';
  const atkTeam = atkSide === 'h' ? state.homeTeam : state.awayTeam;
  const atkOn   = onFieldPlayers(atkTeam, state, possOf(atkSide));
  const carrier = event.primaryPlayer;

  // #9's set-piece ending position (mirrors scrumLayout / lineoutLayout so the
  // preserved dot matches). The feed origin for the sweep.
  let sh9X: number, sh9Y: number;
  if (prevPhase === MatchPhase.Scrum) {
    sh9X = clampX(prevBallX - fwd * 2.0);
    sh9Y = clampY(prevBallY);
  } else {
    const nearY  = prevBallY < 50 ? 0 : 100;
    const inward = nearY === 0 ? 1 : -1;
    sh9X = clampX(prevBallX - fwd * 4);
    sh9Y = clampY(nearY + inward * 14);
  }

  const out: Placed[] = [];

  // If the engine provided explicit choreography (e.g. uploaded Phase Animator template),
  // bypass inference for those players and map their start/end points exactly.
  const choreographedKeys = new Set<string>();
  if (event.choreography) {
    for (const p of event.choreography) {
      const pl = (p.side === 'h' ? state.homeTeam : state.awayTeam).players.find(x => x.id === p.id);
      if (pl) {
        const moves = p.movements;
        if (moves.length > 0) {
          const last = moves[moves.length - 1];
          let finalX = last.x;
          let finalY = last.y;
          if (pl === carrier) {
            const engineFinalBall = hops[hops.length - 1] ?? { x: last.x, y: last.y };
            finalX = engineFinalBall.x - fwd * CARRIER_BEHIND_BALL;
            finalY = engineFinalBall.y;
          }
          // No `from`: a choreographed dot is driven by PitchView's choreography
          // loop (its keyframes already encode the start). Setting `from` would
          // ALSO push it to chaseDots, so two animators would fight the element.
          const dot = placed(pl, p.side, state, clampX(finalX), clampY(finalY), pl === carrier);
          out.push(dot);
          choreographedKeys.add(`${p.side}:${p.id}`);
        }
      }
    }
  }

  // #9 at the set-piece feed.
  const sh = atkOn.find(p => p.id === SLOT.SCRUM_HALF);
  if (sh && !choreographedKeys.has(`h:${sh.id}`) && !choreographedKeys.has(`a:${sh.id}`)) {
    out.push(placed(sh, atkSide, state, sh9X, sh9Y, sh === carrier));
  }

  // Receivers in pass order, read straight from the narration chain: #10 is the
  // first pass step's primary, then each step's secondary (#12 for a crash ball;
  // #13 then the wing for wide play). Aligns one-to-one with the receive hops.
  const receivers: Player[] = [];
  for (const s of event.narration.steps) {
    if (s.kind !== 'phase_outcome') continue;
    if (s.key !== 'crash_ball' && s.key !== 'out_the_back') continue;
    if (receivers.length === 0 && s.primary) receivers.push(s.primary);
    if (s.secondary) receivers.push(s.secondary);
  }

  // Receive hops = the ball path minus the feed (index 0) and the final carry leg.
  const recvHops = hops.slice(1, hops.length - 1);
  const n = Math.min(receivers.length, recvHops.length);
  for (let i = 0; i < n; i++) {
    const p = receivers[i];
    if (choreographedKeys.has(`h:${p.id}`) || choreographedKeys.has(`a:${p.id}`)) continue;
    const hop = recvHops[i];
    // Sit a touch behind the ball's gain-line hop, progressively deeper as play
    // goes wider — the diagonal read, anchored on the engine's real lateral y.
    out.push(placed(p, atkSide, state, clampX(hop.x - fwd * (CARRIER_BEHIND_BALL + i * 4)), clampY(hop.y), p === carrier));
  }

  // Carrier safety: if the chain didn't surface the carrier (offload / edge case),
  // place them at the final receive hop so they're never left invisible.
  if (carrier && !out.some(pl => pl.key === `${atkSide}:${carrier.id}`) && !choreographedKeys.has(`${atkSide}:${carrier.id}`)) {
    const last = recvHops[recvHops.length - 1] ?? hops[hops.length - 1];
    out.push(placed(carrier, atkSide, state, clampX(last.x - fwd * CARRIER_BEHIND_BALL), clampY(last.y), true));
  }

  // Defenders: event actors on the defending side, placed just ahead of the ball.
  const actors = harvestActors(event);
  const defSideActors = actors.filter(p => sideOf(p, state) === defSide);
  const tackler = event.secondaryPlayer && sideOf(event.secondaryPlayer, state) === defSide ? event.secondaryPlayer : null;

  defSideActors.forEach((p, i) => {
    if (choreographedKeys.has(`h:${p.id}`) || choreographedKeys.has(`a:${p.id}`)) return;
    if (p === tackler && carrier) {
      // Pin tackler to the ball carrier — animate from defensive-line spot
      const carrierPl = out.find(pl => pl.key === `${atkSide}:${carrier.id}`);
      if (carrierPl) {
        const tackleX = clampDefenderX(carrierPl.x + fwd * TACKLER_AHEAD, fwd);
        const defLineX = clampDefenderX(event.ballX + fwd * 10, fwd);
        const defLineY = clampY(event.ballY + 4);
        const dot = placed(p, defSide, state, tackleX, carrierPl.y, false);
        dot.from = { x: defLineX, y: defLineY };
        const isDominant = event.outcome === 'dominant_carry' || event.outcome === 'dominant_tackle';
        if (isDominant) dot.isDominantTackler = true;
        out.push(dot);
        return;
      }
    }
    const lat = fanLateral(i);
    out.push(placed(p, defSide, state,
      clampDefenderX(event.ballX + fwd * (3 + i * 6), fwd),
      clampY(event.ballY + lat), false));
  });

  // Inject the predecessor set-piece forwards/unplaced backs so they remain perfectly stationary
  // even if the user triggers the phase directly in Endless Match without a real predecessor beat.
  const placedKeys = new Set(out.map(pl => pl.key));
  const fakeEvent = { ...event, ballX: prevBallX, ballY: prevBallY } as GameEvent;
  let baseLayout: Placed[] = [];
  if (prevPhase === MatchPhase.Scrum) {
    baseLayout = scrumLayout(fakeEvent, state, attacksTop);
  } else if (prevPhase === MatchPhase.Lineout) {
    baseLayout = lineoutLayout(fakeEvent, state, attacksTop);
  } else if (prevPhase === MatchPhase.Maul) {
    baseLayout = maulLayout(fakeEvent, state, attacksTop, prevBallX, prevBallY);
  }

  for (const p of baseLayout) {
    if (!placedKeys.has(p.key)) {
      out.push(p);
    }
  }

  return out;
}
