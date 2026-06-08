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
        catcherDot.x = clampX(event.ballX - fwd * 2.5);
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
    out.push(placed(onBall, sideOf(onBall, state), state, clampX(event.ballX - fwd * 2.5), clampY(event.ballY), true));
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
type FormOffsets = Record<number, readonly [number, number]>;
// atkFrom / defFrom: start offsets for dots that move during the beat (same transform as
// atk/def). When present, PitchView animates each dot from its `from` to its resting spot
// via the chaseDots seam — identical to the kick-off / drop-out chase mechanism.
interface Formation { nearTop: boolean; atk: FormOffsets; def: FormOffsets; atkFrom?: FormOffsets; defFrom?: FormOffsets; unclamped?: boolean;
  // True for defensive-breakdown frames whose `atk` table was authored with the new
  // attacker (a defender who won the ball) already inverted — placeFormation must NOT
  // flip `dir` for these or it double-flips them onto the wrong side.
  defenderIsAttacker?: boolean; }

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
  const atkOn = onFieldPlayers(atkSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(atkSide));
  const defOn = onFieldPlayers(defSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(defSide));

  const out: Placed[] = [];
  const cX = form.unclamped ? (x: number) => x : clampX;
  const cY = form.unclamped ? (y: number) => y : clampY;

  const fill = (on: Player[], side: Side, tbl: FormOffsets, fromTbl?: FormOffsets): void => {
    for (let slot = 1; slot <= 15; slot++) {
      const off = tbl[slot];
      const p = on.find(pl => pl.id === slot);
      if (off && p) {
        const dot = placed(p, side, state,
          cX(anchorX + off[0] * dir),
          cY(anchorY + (mirrorY ? -off[1] : off[1])), false);
        const fromOff = fromTbl?.[slot];
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

const BOX_KICK_ANNOUNCE: Formation = { nearTop: true,
  atk: {
    1:  [ -2.07, -18.58],   2:  [ -2.22, -13.62],   3:  [  5.27,   0.90],
    4:  [  2.39,   0.90],   5:  [  3.54,  -2.77],   6:  [ -9.13, -66.17],
    7:  [ -2.79,   9.90],   8:  [ -2.51,  -7.55],   9:  [ -2.00,   0.00],
    10: [ -7.40, -14.53],   11: [ -9.13, -75.54],   12: [ -9.85, -29.23],
    13: [-10.72, -43.38],   14: [ -4.38,  15.78],   15: [-16.19, -17.84],
  },
  def: {
    1:  [  6.57,  -2.22],   2:  [ 16.08, -11.78],   3:  [ 14.93,  13.21],
    4:  [ 15.94, -15.82],   5:  [  6.28,  -7.55],   6:  [  7.29,   1.82],
    7:  [ 16.80, -68.74],   8:  [ 15.94, -20.23],   9:  [ 11.76,  -0.57],
    10: [ 22.13, -13.80],   11: [ 29.77,  15.05],   12: [ 14.93, -28.68],
    13: [ 14.78, -43.57],   14: [ 40.43, -70.94],   15: [ 44.46,  -5.90],
  },
};
const BOX_KICK_RETAIN: Formation = { nearTop: true,
  // Resting positions (t=1). Anchor = kick origin (46, 91).
  atk: {
    1:  [  6.38, -16.07],   2:  [ -3.00,   4.00],   3:  [ -0.55, -38.62],
    4:  [  4.00,   2.00],   5:  [  4.00,  -2.00],   6:  [  1.31, -22.99],
    7:  [  6.26, -12.16],   8:  [  2.00,   0.00],   9:  [  0.00,   0.00],
    10: [ -5.17, -18.39],   11: [ 19.32,   1.49],   12: [ -8.80, -36.09],
    13: [ -7.49, -52.69],   14: [-17.87, -66.07],   15: [-17.92,  -8.33],
  },
  // Chase start positions (t=0) — only for dots that move. PitchView animates each from here.
  atkFrom: {
    1:  [ -1.00, -18.00],   3:  [ -4.00, -39.00],   6:  [ -4.00, -24.00],
    7:  [ -4.00, -13.00],   10: [-10.00, -19.00],   11: [ -3.00,   6.00],
    12: [-12.00, -38.00],   13: [-14.00, -54.00],   14: [-15.00, -72.00],
    15: [-20.00, -30.00],
  },
  def: {
    1:  [ 20.18,   5.47],   2:  [  6.00,   0.00],   3:  [ 17.87,  -9.98],
    4:  [ 14.35, -36.17],   5:  [ 16.39, -17.65],   6:  [ 13.25, -43.57],
    7:  [  7.00,  -3.00],   8:  [ 14.06, -24.03],   9:  [ 14.07,   2.52],
    10: [ 15.55, -52.78],   11: [ 33.82, -68.30],   12: [ 14.47, -61.06],
    13: [ 13.00, -76.00],   14: [ 25.62,   1.70],   15: [ 35.72, -24.02],
  },
  defFrom: {
    1:  [ 15.00,   6.00],   3:  [ 12.00, -14.00],   4:  [ 12.00, -36.00],
    5:  [ 12.00, -20.00],   6:  [ 12.00, -43.00],   8:  [ 11.00, -28.00],
    9:  [  9.00,   5.00],   10: [ 12.00, -52.00],   11: [ 32.00, -79.00],
    12: [ 12.00, -63.00],   14: [ 36.00,   6.00],   15: [ 40.00, -42.00],
  },
};
const BOX_KICK_TO_TOUCH: Formation = { nearTop: true,
  atk: {
    1:  [ -1.77, -22.03],   2:  [ -2.06, -15.05],   3:  [  8.60,  -1.09],
    4:  [ -3.50,  -4.58],   5:  [  6.30,  -0.35],   6:  [ -5.00, -13.03],
    7:  [ -2.92,  -8.80],   8:  [  3.71,  -0.17],   9:  [  0.00,   0.00],
    10: [ -5.00, -30.48],   11: [ -5.00, -84.50],   12: [ -5.00, -38.20],
    13: [ -5.00, -47.94],   14: [ -3.21,   5.00],   15: [ -5.00, -19.46],
  },
  def: {
    1:  [ 10.62,   0.94],   2:  [ 17.25, -24.79],   3:  [ 17.54, -29.20],
    4:  [ 11.77, -10.64],   5:  [ 16.67, -34.71],   6:  [  9.76,  -4.03],
    7:  [ 16.82, -18.54],   8:  [ 16.82, -42.06],   9:  [ 13.93,  -5.31],
    10: [ 34.97,  -7.70],   11: [ 28.92,   5.00],   12: [ 17.25, -50.70],
    13: [ 17.25, -61.72],   14: [ 31.80, -84.87],   15: [ 35.11, -36.18],
  },
};
const BOX_KICK_DEFEND_CATCH: Formation = { nearTop: true,
  // Resting positions (t=1). Anchor = kick origin (12, 79). atk = catching team (away in authored frame).
  atk: {
    1:  [  2.00,   3.00],   2:  [  2.62, -14.54],   3:  [ -1.38, -16.98],
    4:  [  3.00,  -1.00],   5:  [  1.00,  -2.00],   6:  [  9.93,  -7.14],
    7:  [  2.19, -29.92],   8:  [  7.17,  14.47],   9:  [  0.00,   0.00],
    10: [ -8.34, -10.89],   11: [ 19.17,   3.69],   12: [ -5.74, -29.01],
    13: [ -4.83, -43.37],   14: [ -5.12, -66.50],   15: [ -4.45,   8.63],
  },
  atkFrom: {
    2:  [ -3.00, -15.00],   3:  [ -6.00, -19.00],   6:  [ -3.00, -10.00],
    7:  [ -5.00, -29.00],   8:  [ -3.00,  11.00],   10: [-10.00, -14.00],
    11: [ -4.00,  18.00],   12: [-10.00, -29.00],   13: [-10.00, -43.00],
    14: [-10.00, -68.00],   15: [-10.00,   2.00],
  },
  def: {
    1:  [ 18.61, -28.19],   2:  [ 20.01, -22.12],   3:  [  7.00,   0.00],
    4:  [ 22.11, -12.26],   5:  [  5.00,   3.00],   6:  [ 20.44, -39.27],
    7:  [  5.00,  -3.00],   8:  [ 19.50, -16.83],   9:  [ 14.00,  -1.00],
    10: [ 34.27, -26.27],   11: [ 37.72, -64.94],   12: [ 20.83, -42.43],
    13: [ 17.69, -68.81],   14: [ 31.52,   9.91],   15: [ 31.09,  -3.91],
  },
  defFrom: {
    1:  [ 11.00, -29.00],   2:  [ 11.00, -21.00],   4:  [ 11.00, -12.00],
    6:  [ 10.00, -35.00],   8:  [ 12.00, -16.00],   10: [ 19.00, -26.00],
    11: [ 31.00, -66.00],   12: [ 10.00, -45.00],   13: [ 10.00, -68.00],
    14: [ 26.00,  18.00],   15: [ 39.00, -15.00],
  },
};
const BOX_KICK_DEFEND_CONTESTED: Formation = { nearTop: false,
  // Resting positions (t=1). Anchor = kick origin (24, 5). atk = kicking team (home #9 at origin).
  atk: {
    1:  [  0.70,  15.89],   2:  [  7.52,   8.83],   3:  [ -5.00,   4.00],
    4:  [  4.00,   3.00],   5:  [  5.00,  -2.00],   6:  [ -2.00,  -2.00],
    7:  [  4.35,  -5.00],   8:  [  4.00,   0.00],   9:  [  0.00,   0.00],
    10: [-11.45,  35.95],   11: [ -1.39,  56.21],   12: [  0.56,  30.41],
    13: [ -1.22,  44.02],   14: [ 16.99,  -2.26],   15: [-13.56,   0.58],
  },
  atkFrom: {
    1:  [ -5.00,  14.00],   2:  [ -2.00,   9.00],   7:  [ -2.00,  -2.00],
    10: [-15.00,   1.00],   11: [-12.00,  48.00],   12: [ -4.00,  26.00],
    13: [ -5.00,  40.00],   14: [  1.00,  -2.00],   15: [-15.00,  -2.00],
  },
  def: {
    1:  [  8.00,  -2.00],   2:  [  8.00,   2.00],   3:  [ 11.00,  -2.00],
    4:  [ 18.54,   6.49],   5:  [ 19.53,  20.04],   6:  [  7.00,   0.00],
    7:  [ 11.00,  -2.00],   8:  [ 14.34,  10.28],   9:  [ 11.00,  -2.00],
    10: [ 19.58,  26.34],   11: [ 23.00,  -2.00],   12: [ 21.70,  49.63],
    13: [ 18.40,  35.36],   14: [ 28.69,  58.04],   15: [ 31.17,   7.02],
  },
  defFrom: {
    4:  [ 14.00,   6.00],   5:  [ 13.00,  17.00],   8:  [ 13.00,  11.00],
    10: [ 13.00,  24.00],   12: [ 13.00,  41.00],   13: [ 13.00,  32.00],
    14: [ 27.00,  54.00],   15: [ 23.00,  17.00],
  },
};
const BOX_KICK_DEFEND_KNOCK_ON: Formation = { nearTop: true,
  // Resting positions (t=1). Anchor = kick origin (20, 83). atk = kicking team (home #9 at origin).
  atk: {
    1:  [  0.33, -11.18],   2:  [  1.29, -19.84],   3:  [  3.00,  -6.00],
    4:  [  6.04, -15.97],   5:  [  3.00,   1.00],   6:  [  2.36, -34.99],
    7:  [  3.00,  -3.00],   8:  [  6.15,  11.63],   9:  [  0.00,   0.00],
    10: [ -9.00, -16.00],   11: [ -4.57, -73.30],   12: [ -4.54, -32.47],
    13: [ -4.28, -51.77],   14: [ 16.25,   2.86],   15: [-12.60, -37.87],
  },
  atkFrom: {
    1:  [ -4.00, -11.00],   2:  [ -3.00, -20.00],   4:  [ -3.00, -15.00],
    6:  [ -3.00, -36.00],   8:  [ -4.00,   9.00],   11: [-10.00, -73.00],
    12: [ -8.00, -36.00],   13: [ -9.00, -53.00],   14: [  0.00,  12.00],
    15: [-15.00, -32.00],
  },
  def: {
    1:  [  6.00,  -4.00],   2:  [ 25.48,  -6.17],   3:  [ 25.79, -18.18],
    4:  [ 26.96, -25.80],   5:  [ 25.07, -34.41],   6:  [  6.00,   0.00],
    7:  [ 25.02, -10.79],   8:  [ 23.47, -43.16],   9:  [ 15.99,  -4.21],
    10: [ 21.10, -69.63],   11: [ 21.71,   2.51],   12: [ 22.64, -51.39],
    13: [ 21.01, -59.81],   14: [ 42.02, -57.19],   15: [ 46.19,  -4.44],
  },
  defFrom: {
    2:  [ 20.00, -13.00],   3:  [ 20.00, -25.00],   4:  [ 19.00, -30.00],
    5:  [ 20.00, -38.00],   7:  [ 19.00, -18.00],   8:  [ 20.00, -44.00],
    9:  [ 11.00,  -3.00],   10: [ 18.00, -71.00],   11: [ 29.00,  14.00],
    12: [ 18.00, -51.00],   13: [ 18.00, -60.00],   14: [ 39.00, -72.00],
    15: [ 48.00, -27.00],
  },
};
const BOX_KICK_FORMS: Array<{ key: string; form: Formation }> = [
  { key: 'attack_retain',          form: BOX_KICK_RETAIN },
  { key: 'box_kick_to_touch',      form: BOX_KICK_TO_TOUCH },
  { key: 'defend_catch_contested', form: BOX_KICK_DEFEND_CONTESTED },
  { key: 'defend_catch',           form: BOX_KICK_DEFEND_CATCH },
  { key: 'defend_knock_on',        form: BOX_KICK_DEFEND_KNOCK_ON },
];

// Breakdown (ruck-anchored). The attacking pack drives toward +x; the defenders
// contest from the goal-side. Only the two authored outcomes use these.
const BREAKDOWN_CLEAN: Formation = { nearTop: false,
  atk: {
    1:  [-13.43,  14.94],   2:  [-13.43,  23.58],   3:  [-13.72,  34.05],
    4:  [ -2.91,   3.74],   5:  [ -2.00,   0.00],   6:  [ -2.48,  -3.25],
    7:  [-14.58,  40.67],   8:  [-12.42,  18.43],   9:  [ -6.66,   0.43],
    10: [-15.30,  19.17],   11: [-26.68,   3.18],   12: [-21.93,  36.07],
    13: [-25.82,  53.16],   14: [-18.04,  74.84],   15: [-35.47,  29.83],
  },
  def: {
    1:  [  2.71,  29.64],   2:  [  3.00,  18.25],   3:  [  3.57,   7.23],
    4:  [  2.85,  23.21],   5:  [  3.14,  -7.66],   6:  [  3.14,  36.63],
    7:  [  2.85,  -2.70],   8:  [  2.28,   0.61],   9:  [  8.33,   0.24],
    10: [  3.00,  43.24],   11: [  4.00,  70.62],   12: [  3.57,  51.32],
    13: [  3.00,  57.76],   14: [  7.89, -16.48],   15: [  9.00,  23.21],
  },
};
const BREAKDOWN_CLEANOUT_PEN: Formation = { nearTop: true,
  atk: {
    1:  [ -4.58,  -9.24],   2:  [-12.06, -18.01],   3:  [ -4.27,   2.84],
    4:  [-12.52, -11.77],   5:  [ -3.00,   8.00],   6:  [-12.21, -24.43],
    7:  [-11.75,  25.04],   8:  [ -3.66,  -3.01],   9:  [ -1.52,   0.50],
    10: [-12.21, -40.60],   11: [-21.68, -63.00],   12: [-12.06,  14.52],
    13: [-12.37, -34.37],   14: [-21.38,  27.19],   15: [-23.97, -20.34],
  },
  def: {
    1:  [  1.23,   1.08],   2:  [  0.92,  -1.25],   3:  [  8.25, -15.47],
    4:  [  8.25, -23.27],   5:  [ 11.77, -33.40],   6:  [  6.27,  -8.27],
    7:  [ 14.67,  15.89],   8:  [ 12.53, -40.02],   9:  [  7.18,   0.69],
    10: [ 12.99, -19.57],   11: [ 12.53,  23.87],   12: [ 21.08, -31.45],
    13: [ 24.90, -48.98],   14: [ 15.59, -65.54],   15: [ 23.37, -11.19],
  },
};

// Breakdown: slow_ball. ATK = attacker's supporter (primary); anchor = live ruck.
const BREAKDOWN_SLOW_BALL: Formation = { nearTop: true,
  atk: {
    1:  [-11.26,  -6.41],   2:  [-10.25,  15.46],   3:  [ -2.00,   0.00],
    4:  [-11.26, -14.49],   5:  [ -0.60,   3.88],   6:  [ -9.96,  20.24],
    7:  [ -1.03,  -3.47],   8:  [ -9.39, -10.27],   9:  [ -5.50,  -0.71],
    10: [-19.62,   1.13],  11:  [-16.45, -46.09],  12:  [-16.88, -10.45],
    13: [-18.75, -30.66],  14:  [-10.97,  29.24],  15:  [-21.35, -19.82],
  },
  def: {
    1:  [  8.33,  13.62],   2:  [  8.62,  18.22],   3:  [  7.04, -12.10],
    4:  [  6.46,  -8.98],   5:  [  6.17, -16.70],   6:  [  3.29,  -2.92],
    7:  [  2.57,   0.58],   8:  [  2.43,   4.43],   9:  [  9.49,  -0.53],
    10: [ 10.49, -19.82],  11:  [ 30.09,  30.71],  12:  [ 10.64, -31.21],
    13: [ 11.07, -44.99],  14:  [ 40.61, -47.01],  15:  [ 52.00, -11.00],
  },
};
// Breakdown: turnover. ATK = jackal (defender who stole ball = primaryPlayer); anchor = live ruck.
const BREAKDOWN_TURNOVER: Formation = { nearTop: true, defenderIsAttacker: true,
  atk: {
    1:  [  1.42,   3.35],   2:  [ 10.93, -11.90],   3:  [ 12.66, -16.49],
    4:  [ 10.49,  11.62],   5:  [ 10.35,  16.22],   6:  [  1.13,  -2.89],
    7:  [  1.13,   0.60],   8:  [ 10.35, -19.98],   9:  [  8.05,   0.05],
    10: [ 10.49, -26.78],  11:  [ 25.77,  33.67],  12:  [ 13.81, -36.70],
    13: [ 13.81, -55.08],  14:  [ 42.00, -43.00],  15:  [ 49.83, -12.45],
  },
  def: {
    1:  [-10.11,  13.46],   2:  [-11.40, -18.14],   3:  [-11.55, -10.24],
    4:  [ -9.24, -14.10],   5:  [ -1.32,   3.17],   6:  [ -9.96,  18.42],
    7:  [ -2.00,   0.00],   8:  [ -1.61,  -3.08],   9:  [ -6.07,   0.05],
    10: [-16.59, -14.84],  11:  [-20.48, -56.00],  12:  [-17.74, -25.49],
    13: [-19.04, -37.99],  14:  [-18.03,  32.02],  15:  [-22.93,   0.05],
  },
};
// Breakdown: not_rolling_away_penalty. ATK = jackal (defender = primaryPlayer); anchor = live ruck.
const BREAKDOWN_NOT_ROLLING_AWAY: Formation = { nearTop: false, defenderIsAttacker: true,
  atk: {
    1:  [  3.00,  13.51],   2:  [  3.00,   2.80],   3:  [  2.03,  -2.85],
    4:  [  2.79,   6.70],   5:  [ -0.42,   3.38],   6:  [  2.95,  20.92],
    7:  [  1.57,   0.07],   8:  [  0.35,  -2.65],   9:  [  3.00,  -9.86],
    10: [  2.79,  27.54],  11:  [  2.95,  65.33],  12:  [  2.33,  35.14],
    13: [  2.79,  40.79],  14:  [  3.00, -17.65],  15:  [  2.79,  51.50],
  },
  def: {
    1:  [ -2.55,   0.46],   2:  [-12.33,  14.68],   3:  [-20.73,  35.14],
    4:  [ -9.27,  19.55],   5:  [-13.09,  23.25],   6:  [ -2.40,  -2.65],
    7:  [-19.51,  39.62],   8:  [ -3.16,   3.97],   9:  [ -7.90,   0.66],
    10: [-18.29,  18.97],  11:  [-10.04, -16.87],  12:  [-24.70,  38.06],
    13: [-29.44,  54.42],  14:  [-34.63,  72.73],  15:  [-20.12,  44.29],
  },
};
// Breakdown: offside_at_ruck_penalty. ATK = random defender (primaryPlayer); anchor = live ruck.
const BREAKDOWN_OFFSIDE_AT_RUCK: Formation = { nearTop: true, defenderIsAttacker: true,
  atk: {
    1:  [  9.34, -21.69],   2:  [  9.95, -13.51],   3:  [  7.97, -17.21],
    4:  [  1.55,   1.49],   5:  [  2.62,  -0.66],   6:  [ 13.16, -31.82],
    7:  [ 19.42,  22.52],   8:  [  0.94,  -2.80],   9:  [  6.14,  -0.85],
    10: [ 15.15, -18.97],  11:  [ 29.81, -55.00],  12:  [ 20.19, -30.07],
    13: [ 24.31, -40.98],  14:  [ 15.61,  29.93],  15:  [ 14.69,  15.90],
  },
  def: {
    1:  [ -3.64,  -9.03],   2:  [ -3.64, -13.71],   3:  [ -3.64,   8.89],
    4:  [ -1.00,   0.00],   5:  [ -4.00, -18.77],   6:  [ -1.65,  -2.99],
    7:  [ -1.50,   3.04],   8:  [ -3.79,  17.46],   9:  [ -4.00,   0.32],
    10: [ -3.95, -33.19],  11:  [ -4.00,  33.04],  12:  [ -4.00, -41.76],
    13: [ -3.18,  25.45],  14:  [ -4.00, -54.03],  15:  [ -3.95, -26.17],
  },
};
// Breakdown: penalty_defending. ATK = offending attacker (supporter = primaryPlayer); anchor = live ruck.
const BREAKDOWN_PENALTY_DEFENDING: Formation = { nearTop: false,
  atk: {
    1:  [ -1.87,   0.94],   2:  [ -2.64,   5.23],   3:  [-21.88,  30.94],
    4:  [-12.26,  15.36],   5:  [-15.01,  19.84],   6:  [ -3.10,  -3.34],
    7:  [-22.03,  37.76],   8:  [-15.47,  11.46],   9:  [ -8.90,   1.92],
    10: [-17.91,  15.36],  11:  [-20.20, -21.65],  12:  [-26.92,  33.86],
    13: [-29.06,  46.72],  14:  [-20.51,  66.59],  15:  [-27.53,  14.97],
  },
  def: {
    1:  [  1.03,  24.51],   2:  [  1.33,  17.70],   3:  [  1.18, -10.74],
    4:  [  1.64,   5.23],   5:  [  1.18,  -1.78],   6:  [  1.18,  -6.07],
    7:  [  0.00,   0.00],   8:  [  1.95,   1.53],   9:  [  0.00,   8.00],
    10: [  1.79,  41.27],  11:  [  2.00,  63.67],  12:  [  1.33,  47.50],
    13: [  1.18, -16.78],  14:  [  1.03, -24.77],  15:  [  2.00,  33.86],
  },
};

// Penalty kicked to touch — full formation, authored in the phase animator. Anchor =
// kick origin (penalty mark). atk = kicking team (the kicker's side), driving toward +x
// in the canonical frame; def = defending team dropped downfield to cover the kick to
// touch. The ball is lobbed to the lineout mark by PitchView; only a6/a15 shuffle (defFrom).
const PENALTY_KICK_TO_TOUCH: Formation = { nearTop: true,
  atk: {
    1:  [ -1.94,  39.79],   2:  [ -3.01,  34.55],   3:  [ -1.47,  18.10],
    4:  [ -2.59,   9.69],   5:  [ -2.40,  26.23],   6:  [ -3.60, -15.47],
    7:  [ -1.01,  13.51],   8:  [ -2.75,  29.71],   9:  [ -1.37,  21.56],
    10: [ -2.12,  -0.36],   11: [-14.55,  27.04],   12: [ -2.91, -26.02],
    13: [ -4.06, -37.72],   14: [-13.94, -47.93],   15: [-14.07,  -0.74],
  },
  def: {
    1:  [ 14.55,   2.13],   2:  [ 15.24,  18.82],   3:  [ 16.03, -15.27],
    4:  [ 14.33,   8.90],   5:  [ 14.06,  26.77],   6:  [ 33.21,  44.35],
    7:  [ 14.91,  38.94],   8:  [ 15.00,  -5.00],   9:  [ 36.75,  -4.98],
    10: [ 46.00,  20.10],   11: [ 37.92, -34.13],   12: [ 34.57,  13.31],
    13: [ 15.91, -29.93],   14: [ 50.68,  45.00],   15: [ 42.73,  45.00],
  },
  defFrom: {
    6:  [ 30.93,  45.00],   15: [ 43.72,  45.00],
  },
};

// Penalty kicked to touch CLOSE — the corner kick (lands ≤10m from the opp try line).
// Same seam as PENALTY_KICK_TO_TOUCH but a distinct authored frame; fully static (no
// post-kick shuffle in this sample).
const PENALTY_KICK_TO_TOUCH_CLOSE: Formation = { nearTop: true,
  atk: {
    1:  [ -3.31,  20.03],   2:  [ -3.37,  26.77],   3:  [ -3.68, -15.28],
    4:  [ -3.46,  -6.49],   5:  [ -3.17,  23.41],   6:  [ -3.19,  13.07],
    7:  [ -2.96,   8.51],   8:  [ -3.66, -11.66],   9:  [ -9.23,   6.35],
    10: [  0.00,   0.00],   11: [-16.26,  27.52],   12: [ -3.64, -24.31],
    13: [ -3.23, -39.48],   14: [-22.91, -60.89],   15: [-24.14, -17.63],
  },
  def: {
    1:  [ 16.02, -27.37],   2:  [ 14.82,  -5.29],   3:  [ 14.72, -19.77],
    4:  [ 14.83, -11.26],   5:  [ 14.19,  20.00],   6:  [ 14.90,  12.19],
    7:  [ 15.25,  28.00],   8:  [ 14.90,   2.96],   9:  [ 19.58,   8.55],
    10: [ 28.00,  -9.32],   11: [ 24.04, -66.84],   12: [ 16.89, -39.93],
    13: [ 17.04, -57.87],   14: [ 27.68,  28.00],   15: [ 27.35,   7.29],
  },
};

// Penalty tap-and-go — full-formation carry. Anchor = tap mark (the pre-carry ball).
// atk = tapping team driving toward +x (canonical); def = defenders retreating 10m and
// re-setting. Every dot shuffles forward (from-tables); the carrier's `from` is stripped
// at dispatch so the ball-walk follower rides it onto the ball instead.
const PENALTY_TAP_AND_GO: Formation = { nearTop: true,
  atk: {
    1:  [ -2.57, -14.76],   2:  [  1.90,  -4.49],   3:  [  4.72,  -2.88],
    4:  [ -1.86,  16.60],   5:  [ -5.14,  28.68],   6:  [ -2.62, -11.61],
    7:  [  2.31,  -0.01],   8:  [ -2.49,  13.75],   9:  [ -5.75,   0.91],
    10: [-14.25, -11.42],   11: [-20.96, -48.92],   12: [-18.25, -22.65],
    13: [-18.92, -35.10],   14: [ -4.29,  36.27],   15: [-31.83, -22.02],
  },
  atkFrom: {
    1:  [ -5.07, -15.61],   2:  [ -4.61,  -2.17],   3:  [ -0.80,   0.15],
    4:  [ -4.99,  14.11],   5:  [-11.31,  27.62],   6:  [ -4.94, -11.38],
    7:  [ -5.04,   3.31],   8:  [ -4.66,  16.80],   9:  [-14.30,   2.01],
    10: [-20.30, -11.98],   11: [-25.73, -48.13],   12: [-22.03, -23.99],
    13: [-24.70, -36.46],   14: [-12.17,  35.94],   15: [-34.06, -26.30],
  },
  def: {
    1:  [  8.02,  -6.91],   2:  [ 10.95,   4.48],   3:  [ 11.70, -12.19],
    4:  [  8.59,   0.26],   5:  [  7.98,  -3.69],   6:  [ 12.77,   9.43],
    7:  [ 11.21,  21.30],   8:  [ 10.91,  14.37],   9:  [ 19.10,  -4.20],
    10: [ 21.27, -20.52],   11: [ 13.27,  37.70],   12: [ 11.55, -28.07],
    13: [ 12.42, -36.93],   14: [ 12.04, -51.10],   15: [ 21.86,  17.97],
  },
  defFrom: {
    1:  [ 12.78,  -7.80],   2:  [ 12.80,   3.84],   3:  [ 13.35, -11.84],
    4:  [ 13.18,   0.68],   5:  [ 12.90,  -3.20],   6:  [ 13.35,   8.92],
    7:  [ 12.61,  22.71],   8:  [ 12.66,  12.75],   9:  [ 21.44,  -3.17],
    10: [ 22.94, -21.30],   11: [ 14.90,  37.15],   12: [ 13.58, -29.08],
    13: [ 13.57, -36.92],   14: [ 13.52, -50.45],   15: [ 23.67,  18.10],
  },
};

// Penalty tap-and-kick-dead — static full formation (no player movement) while the ball
// is lobbed out to end the half. Anchor = the tap mark. atk = kicking team (toward +x in
// the canonical frame); def = the defending team standing off.
const PENALTY_TAP_AND_KICK_DEAD: Formation = { nearTop: true,
  atk: {
    1:  [ -5.30,   8.52],   2:  [ -7.27,  12.16],   3:  [ -6.57,  19.41],
    4:  [ -8.00,  -1.25],   5:  [ -4.80, -10.00],   6:  [ -8.00,   5.16],
    7:  [ -5.86,  -4.65],   8:  [ -7.69,  -6.68],   9:  [ -7.48,  16.09],
    10: [ -2.00,   0.00],   11: [ -8.00,  24.00],   12: [ -8.00, -28.00],
    13: [ -8.00, -42.91],   14: [ -7.42, -64.14],   15: [ -8.00, -17.73],
  },
  def: {
    1:  [ 18.76, -29.22],   2:  [ 18.75, -14.30],   3:  [ 19.09,   8.27],
    4:  [ 20.29, -21.58],   5:  [ 18.40,  -6.94],   6:  [ 17.65, -35.70],
    7:  [ 17.03,   2.89],   8:  [ 17.38,  17.04],   9:  [ 27.40,  -4.55],
    10: [ 38.89, -16.53],   11: [ 30.88, -57.89],   12: [ 17.72, -42.24],
    13: [ 17.60, -49.74],   14: [ 17.59,  24.00],   15: [ 28.16,  24.00],
  },
};

// Tactical kick base — full-formation chase, baked from the good_kick (to-touch) export
// and shared by ALL tactical-kick outcomes as a starting point (refine per-outcome in the
// animator later, then dispatch on the key). Anchor = kick origin (prevBall). atk =
// kicking team driving toward +x (canonical); def = defenders covering downfield. Every
// dot chases forward (from-tables) except the far winger (15). The ball's flight (out to
// touch vs in-field) is PitchView's, keyed on kickFindsTouch, so caught kicks fit too.
const TACTICAL_KICK_BASE: Formation = { nearTop: true,
  atk: {
    1:  [ 13.55, -27.08],   2:  [ 12.24, -36.14],   3:  [ 11.10,   8.43],
    4:  [ 13.18,   3.48],   5:  [ 10.61,  17.00],   6:  [ 12.32, -48.63],
    7:  [ 12.01,  -1.17],   8:  [ 10.96, -19.07],   9:  [  6.18,  12.06],
    10: [  5.64,  -0.32],   11: [  0.81, -65.73],   12: [  5.39, -18.45],
    13: [  3.56, -38.47],   14: [ 22.54,  12.22],   15: [-13.22, -16.19],
  },
  atkFrom: {
    1:  [  5.77, -30.51],   2:  [  6.50, -36.24],   3:  [  5.71,   8.11],
    4:  [  6.19,   4.41],   5:  [  6.39,  16.17],   6:  [  6.22, -49.89],
    7:  [  6.22,  -1.12],   8:  [  5.79, -23.47],   9:  [  2.92,   6.51],
    10: [  0.00,   0.00],   11: [ -9.00, -67.00],   12: [ -2.72, -21.45],
    13: [ -5.11, -40.05],   14: [ -5.31,  13.98],   15: [-16.00, -33.00],
  },
  def: {
    1:  [ 21.11,   1.45],   2:  [ 17.20,  10.33],   3:  [ 25.01,  17.00],
    4:  [ 18.64, -12.97],   5:  [ 21.19, -18.51],   6:  [ 21.73,  -7.36],
    7:  [ 23.94, -23.72],   8:  [ 21.91,  -2.95],   9:  [ 26.67,   5.83],
    10: [ 29.42, -29.86],   11: [ 31.12,   2.37],   12: [ 24.49, -38.41],
    13: [ 25.08, -51.15],   14: [ 24.67, -67.74],   15: [ 33.23, -50.56],
  },
  defFrom: {
    1:  [ 13.64,   1.73],   2:  [ 15.77,   8.71],   3:  [ 16.01,  15.62],
    4:  [ 15.29, -13.18],   5:  [ 15.28, -19.02],   6:  [ 14.84,  -4.30],
    7:  [ 15.49, -25.65],   8:  [ 13.10,  -0.84],   9:  [ 23.06,  -0.50],
    10: [ 14.67, -30.19],   11: [ 35.18,  -6.23],   12: [ 15.87, -39.87],
    13: [ 16.74, -52.23],   14: [ 18.09, -69.62],
  },
};

const TACTICAL_KICK_FROZEN: Formation = {
  nearTop: TACTICAL_KICK_BASE.nearTop,
  atk: TACTICAL_KICK_BASE.atkFrom ?? TACTICAL_KICK_BASE.atk,
  def: TACTICAL_KICK_BASE.defFrom ?? TACTICAL_KICK_BASE.def,
};

// Kick-off formation, authored in the phase animator (KICK_OFF / clean_receive) and
// keyed by position slot 1–15. Authored frame: RECEIVING team in the low-x half,
// KICKING team lined up across halfway, ball kicked toward low x (kickDir = −1),
// landing on the high-y touchline. `kickOffLayout` flips it to the real kick
// direction + landing side and snaps the real catcher to the real landing. Re-author
// in the animator and paste new values here to retune.
// Each slot carries a `from` (kick-off line) and `to` (post-chase) position, so the
// pack animates the chase as the ball is in the air. Players that hold station have
// from == to.
type KickoffSpot = { from: [number, number]; to: [number, number] };
const KICKOFF_RECV: Record<number, KickoffSpot> = {
  1:  { from: [36, 77], to: [30, 72] },  2:  { from: [35, 91],  to: [29, 93] },
  3:  { from: [37, 17], to: [26, 23] },  4:  { from: [38, 75],  to: [34, 71] },
  5:  { from: [40, 19], to: [31, 31] },  6:  { from: [39, 46],  to: [27, 55] },
  7:  { from: [39, 88], to: [32, 92] },  8:  { from: [27, 80],  to: [18, 78] },
  9:  { from: [15, 72], to: [13, 65] },  10: { from: [15, 7],   to: [15, 7]  },
  11: { from: [33, 1],  to: [21, 2]  },  12: { from: [35, 44],  to: [23, 44] },
  13: { from: [26, 50], to: [15, 50] },  14: { from: [16, 97],  to: [19, 84] },
  15: { from: [15, 38], to: [15, 38] },
};
const KICKOFF_KICK: Record<number, KickoffSpot> = {
  1:  { from: [55, 93],  to: [38, 93] },  2:  { from: [54, 100], to: [41, 89] },
  3:  { from: [56, 9],   to: [44, 9]  },  4:  { from: [56, 22],  to: [42, 27] },
  5:  { from: [54, 87],  to: [36, 87] },  6:  { from: [55, 74],  to: [34, 77] },
  7:  { from: [55, 80],  to: [29, 82] },  8:  { from: [56, 16],  to: [44, 16] },
  9:  { from: [64, 63],  to: [58, 67] },  10: { from: [53, 50],  to: [43, 55] },
  11: { from: [79, 100], to: [54, 99] },  12: { from: [69, 22],  to: [63, 29] },
  13: { from: [72, 86],  to: [47, 81] },  14: { from: [81, 1],   to: [72, 31] },
  15: { from: [80, 51],  to: [65, 75] },
};

const KICKOFF_SHORT_RECV: Record<number, KickoffSpot> = {
  1:  { from: [36, 77], to: [40, 75] },  2:  { from: [35, 91],  to: [39, 88] },
  3:  { from: [37, 17], to: [41, 20] },  4:  { from: [38, 75],  to: [40, 73] },
  5:  { from: [40, 19], to: [40, 23] },  6:  { from: [39, 46],  to: [40, 48] },
  7:  { from: [39, 88], to: [40, 85] },  8:  { from: [27, 80],  to: [32, 78] },
  9:  { from: [15, 72], to: [20, 68] },  10: { from: [15, 7],   to: [15, 7]  },
  11: { from: [33, 1],  to: [35, 3]  },  12: { from: [35, 44],  to: [38, 44] },
  13: { from: [26, 50], to: [30, 50] },  14: { from: [16, 97],  to: [22, 90] },
  15: { from: [15, 38], to: [15, 38] },
};

const KICKOFF_SHORT_KICK: Record<number, KickoffSpot> = {
  1:  { from: [55, 93],  to: [45, 93] },  2:  { from: [54, 100], to: [45, 95] },
  3:  { from: [56, 9],   to: [47, 12]  },  4:  { from: [56, 22],  to: [46, 25] },
  5:  { from: [54, 87],  to: [45, 87] },  6:  { from: [55, 74],  to: [46, 76] },
  7:  { from: [55, 80],  to: [44, 81] },  8:  { from: [56, 16],  to: [47, 16] },
  9:  { from: [64, 63],  to: [60, 65] },  10: { from: [53, 50],  to: [50, 52] },
  11: { from: [79, 100], to: [65, 99] },  12: { from: [69, 22],  to: [65, 27] },
  13: { from: [72, 86],  to: [60, 83] },  14: { from: [81, 1],   to: [75, 15] },
  15: { from: [80, 51],  to: [70, 60] },
};

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

// 22m drop-out — authored in the phase animator across two beats (announce + clean_receive),
// each a from→to chase. Unlike the kick-off (always at halfway, anchored on 50,50), the
// drop-out is anchored on the REAL ball: the kicker's own 22 on the announce beat, the
// landing on the clean_receive beat. Offsets are stored relative to the authored ball at
// the matching position (announce = the kick origin; receive = the landing). The kicking
// team (KICK tables) and receiving team (RECV tables) are baked in one canonical frame
// (kicker attacking −x); `flip` maps that onto the real kicker orientation, x-axis only —
// no lateral mirror, matching the kick-off. Each slot rests at `to` and animates from `from`
// (the chase seam); the on-ball actor (kicker on announce, catcher on receive) snaps to the
// real ball. Re-author in the animator and paste new offset tables here to retune.
const DROPOUT_ANNOUNCE_KICK: Record<number, KickoffSpot> = {
  1: { from: [-16.5,  10.1], to: [-18.5,  10.9] },   2: { from: [-17.9, -25.1], to: [-18.9, -24.7] },
  3: { from: [-18.0, -21.8], to: [-19.4, -20.6] },   4: { from: [-19.1,  44.0], to: [-19.4,  39.6] },
  5: { from: [-16.7,  21.0], to: [-18.9,  24.0] },   6: { from: [-15.9,  35.6], to: [-18.2,  32.3] },
  7: { from: [-17.0,  16.6], to: [-18.6,  17.5] },   8: { from: [-18.0, -28.6], to: [-18.6, -28.8] },
  9: { from: [-11.9,   4.5], to: [-12.8,   1.8] },   10: { from: [-18.8,  0.9], to: [-18.8,  0.9] },
  11: { from: [-12.4,  43.3], to: [-14.7,  38.8] },  12: { from: [ -9.3,  20.3], to: [-14.8,  19.5] },
  13: { from: [-12.7, -21.2], to: [-15.3, -19.9] },  14: { from: [-12.1, -40.5], to: [-12.8, -36.8] },
  15: { from: [ -7.5,  -0.8], to: [ -6.9,   1.0] },
};
const DROPOUT_ANNOUNCE_RECV: Record<number, KickoffSpot> = {
  1: { from: [-57.8,  -5.1], to: [-41.5,  20.1] },   2: { from: [-56.8,   0.9], to: [-38.3, -29.2] },
  3: { from: [-57.8,   6.9], to: [-37.4,  40.5] },   4: { from: [-59.8,  -2.1], to: [-38.8,  18.5] },
  5: { from: [-59.8,   3.9], to: [-36.5,   0.8] },   6: { from: [-55.8,  -9.1], to: [-35.3, -27.1] },
  7: { from: [-55.8,  10.9], to: [-34.4,  37.8] },   8: { from: [-61.8,   0.9], to: [-62.9,   1.8] },
  9: { from: [-59.8,   2.9], to: [-62.6,  19.7] },   10: { from: [-62.8, -7.1], to: [-62.5, -18.3] },
  11: { from: [-68.8, -33.1], to: [-59.1, -42.8] },  12: { from: [-64.8, -15.1], to: [-53.9, -28.2] },
  13: { from: [-66.8, -23.1], to: [-53.6,  29.0] },  14: { from: [-65.8,  30.9], to: [-58.8,  46.9] },
  15: { from: [-75.8,   0.9], to: [-75.9,   3.3] },
};
const DROPOUT_RECEIVE_KICK: Record<number, KickoffSpot> = {
  1: { from: [ 41.4,   7.5], to: [ 25.5,   4.3] },   2: { from: [ 40.2, -30.7], to: [ 35.6, -31.1] },
  3: { from: [ 40.2, -25.5], to: [ 31.6, -23.8] },   4: { from: [ 39.7,  35.2], to: [ 30.5,  35.8] },
  5: { from: [ 41.4,  20.2], to: [ 34.3,  19.9] },   6: { from: [ 42.0,  28.4], to: [ 37.1,  28.8] },
  7: { from: [ 41.7,  12.5], to: [ 28.5,  14.1] },   8: { from: [ 40.2, -34.6], to: [ 34.5, -38.1] },
  9: { from: [ 45.2, -10.5], to: [ 29.6, -11.1] },   10: { from: [ 39.5, -13.5], to: [ 42.6, -0.9] },
  11: { from: [ 45.5,  35.8], to: [ 38.8,  35.6] },  12: { from: [ 45.7,  18.2], to: [ 50.1,   9.5] },
  13: { from: [ 44.9, -22.2], to: [ 38.6, -22.0] },  14: { from: [ 44.7, -49.4], to: [ 35.7, -55.7] },
  15: { from: [ 52.7, -13.5], to: [ 50.5, -29.9] },
};
const DROPOUT_RECEIVE_RECV: Record<number, KickoffSpot> = {
  1: { from: [ 18.3,  17.1], to: [ 15.3,  20.2] },   2: { from: [ 19.8, -42.0], to: [ 16.8, -42.5] },
  3: { from: [ 21.4,  32.5], to: [ 13.7,  33.6] },   4: { from: [ 20.3,  14.5], to: [ 17.5,  14.3] },
  5: { from: [ 21.7, -14.0], to: [ 17.1, -11.4] },   6: { from: [ 23.2, -39.0], to: [ 21.5, -37.5] },
  7: { from: [ 24.0,  29.5], to: [ 19.2,  31.2] },   8: { from: [ -3.0, -13.0], to: [ -1.5,  -8.1] },
  9: { from: [ -0.3,  12.3], to: [  0.5,  11.0] },   10: { from: [ -2.3, -29.6], to: [ -2.3, -29.6] },
  11: { from: [  0.8, -55.1], to: [  0.8, -55.1] },  12: { from: [  6.9, -33.1], to: [  6.9, -33.1] },
  13: { from: [  8.2,  24.9], to: [  3.6,  23.6] },  14: { from: [  1.5,  34.3], to: [  1.5,  34.3] },
  15: { from: [-14.2,  -8.1], to: [ -1.2,  -0.1] },
};

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
const CONV_ABS: Record<'atk' | 'def', Record<number, readonly [number, number]>> = {
  atk: {
    1:  [ 42.00,  44.00],   2:  [ 45.66,  50.38],   3:  [ 42.00,  56.00],
    4:  [ 40.00,  47.00],   5:  [ 40.00,  53.00],   6:  [ 45.29,  44.43],
    7:  [ 45.00,  56.36],   8:  [ 38.00,  50.00],   9:  [ 29.10,  48.64],
    10: [ 73.00,  88.00],   // Track ball dynamically
    11: [ 23.75,  60.06],   12: [ 29.86,  40.67],   13: [ 23.34,  37.83],
    14: [ 29.30,  56.39],   15: [ 23.01,  48.85],
  },
  def: {
    1:  [105.36,  58.70],   2:  [102.91,  42.89],   3:  [100.62,  60.47],
    4:  [105.13,  61.96],   5:  [101.34,  56.89],   6:  [102.43,  62.95],
    7:  [104.43,  40.85],   8:  [101.70,  54.45],   9:  [105.84,  43.37],
    10: [105.92,  54.61],   11: [100.49,  88.16],   // Track ball dynamically
    12: [105.70,  47.25],   13: [105.53,  51.26],   14: [101.41,  45.48],   15: [101.50,  50.35],
  }
};

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
  // scorer is placed relative to the TRY LINE (x=100 / x=0), NOT the grounded ballX: the try
  // is awarded with a 5m leniency so ballX can sit short of the line, and the display snapshot
  // pushes the ball off the line too (line + dir*4). Place the scorer `fwd*2.5` past the line
  // (just behind the in-goal ball, clearly over) via the wider in-goal clamp; the standard
  // clampX [2,98] would strand them on-field, and the keepTryScored glide eases them across.
  if (carrier) {
    const carrierX = event.phase === MatchPhase.TryScored
      ? clampInGoalX((fwd > 0 ? 100 : 0) + fwd * 2.5)
      : clampX(ballX - fwd * 2.5);
    out.push(placed(carrier, atkSide, state, carrierX, ballY, true));
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
    if (p === tackler && carrier) {
      // Pin tackler to the ball carrier to visually represent the collision.
      // Give them a `from` at their defensive-line spot so the WAAPI chase
      // animation runs them INTO the tackle over the beat duration.
      const carrierX = event.phase === MatchPhase.TryScored
        ? clampInGoalX(ballX + fwd * 2.5)
        : clampX(ballX - fwd * 2.5);
      const tackleX = clampDefenderX(carrierX + fwd * 1.3, fwd);
      const defLineX = clampDefenderX(ballX + fwd * 10, fwd);
      const defLineY = clampY(ballY + 4);
      const dot = placed(p, defSide, state, tackleX, ballY, false);
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

// distNear = lateral distance from the nearer touchline (0 or 100).
// Convert to absolute Y: nearY===100 → 100−distNear; nearY===0 → distNear.
// ATK backs sit behind their pack (ballX − fwd*dX); DEF backs behind theirs (ballX + fwd*dX).
// Winger rule: ATK #14 = near touchline (small distNear), ATK #11 = far; DEF #11 = near, DEF #14 = far.
const SCRUM_ATK_BACKS: Array<{ slot: number; dX: number; dY: number }> = [
  { slot: SLOT.FLY_HALF,    dX: 6.5,  dY: 32.3 },
  { slot: SLOT.CENTRE_12,   dX: 11.7, dY: 46.6 },
  { slot: SLOT.CENTRE_13,   dX: 16.3, dY: 32.3 },
  { slot: SLOT.FULL_BACK,   dX: 15.4, dY: 63.5 },
  { slot: SLOT.WING_11,     dX: 18.9, dY: 11.6 },
  { slot: SLOT.WING_14,     dX: 18.7, dY: 76.0 },
];
const SCRUM_DEF_BACKS: Array<{ slot: number; dX: number; dY: number }> = [
  { slot: SLOT.FLY_HALF,    dX: 10.5, dY: 30.7 },
  { slot: SLOT.CENTRE_12,   dX: 10.0, dY: 45.9 },
  { slot: SLOT.CENTRE_13,   dX: 10.4, dY: 61.0 },
  { slot: SLOT.FULL_BACK,   dX: 27.8, dY: 62.2 },
  { slot: SLOT.WING_11,     dX: 10.0, dY: 76.6 },
  { slot: SLOT.WING_14,     dX: 27.6, dY: 16.3 },
];

// Lineout backs: Y from dY (anchored to ball); X is a fixed depth
// placeholder (lineout X shows too much scenario variance to parameterise precisely).
// ATK backs sit behind their throw (ballX − fwd*dX); DEF backs behind their pack (ballX + fwd*dX).
// #8 is excluded from the 6-man line and placed here instead.
const LINEOUT_ATK_BACKS: Array<{ slot: number; dX: number; dY: number }> = [
  { slot: SLOT.FLY_HALF,    dX: 6.5,  dY: 32.3 },
  { slot: SLOT.CENTRE_12,   dX: 11.7, dY: 46.6 },
  { slot: SLOT.CENTRE_13,   dX: 16.3, dY: 32.3 },
  { slot: SLOT.FULL_BACK,   dX: 15.4, dY: 63.5 },
  { slot: SLOT.WING_11,     dX: 18.9, dY: 11.6 },
  { slot: SLOT.WING_14,     dX: 18.7, dY: 76.0 },
];
const LINEOUT_DEF_BACKS: Array<{ slot: number; dX: number; dY: number }> = [
  { slot: SLOT.FLY_HALF,   dX: 10.5, dY: 30.7 },
  { slot: SLOT.CENTRE_12,  dX: 10.0, dY: 45.9 },
  { slot: SLOT.CENTRE_13,  dX: 10.4, dY: 61.0 },
  { slot: SLOT.FULL_BACK,  dX: 27.8, dY: 62.2 },
  { slot: SLOT.WING_11,    dX: 10.0, dY: 76.6 },
  { slot: SLOT.WING_14,    dX: 27.6, dY: 16.3 },
];

// Scrum 3-4-1: front row (1,2,3) at the mark, second row (6,4,5,7), #8 at the back.
// dx = depth of each row from the scrum mark. Rows are packed tightly so the eight
// forwards read as one bound mass rather than spaced-out dots: front row at dx=1.3
// (opposing front rows ~2.6 apart — overlapping into the bind), second row at dx=3.3,
// #8 at dx=5.2. y values sized so circles within a row sit shoulder-to-shoulder.
const SCRUM_ROWS: Array<{ dx: number; cells: Array<{ slot: number; y: number }> }> = [
  { dx: 1.3, cells: [{ slot: SLOT.PROP_1, y: -3 }, { slot: SLOT.HOOKER, y: 0 }, { slot: SLOT.PROP_3, y: 3 }] },
  { dx: 3.3, cells: [{ slot: SLOT.FLANKER_6, y: -4.5 }, { slot: SLOT.LOCK_4, y: -1.5 }, { slot: SLOT.LOCK_5, y: 1.5 }, { slot: SLOT.FLANKER_7, y: 4.5 }] },
  { dx: 5.2, cells: [{ slot: SLOT.NUMBER_8, y: 0 }] },
];

// Depth (x-units) the hooker sits behind the maul mark, at the tail of the drive.
// PitchView slides the maul ball to this same depth — shared so the dot and ball
// can't drift apart.
export const MAUL_HOOKER_DX = 7.5;

// Maul attacking pack: same tight spacing as the scrum pack but the hooker moves to
// the back (MAUL_HOOKER_DX) — they run around from the touchline to become the
// ball-carrier at the tail of the drive.
const MAUL_ATK_ROWS: Array<{ dx: number; cells: Array<{ slot: number; y: number }> }> = [
  { dx: 1.3, cells: [{ slot: SLOT.PROP_1, y: -2 }, { slot: SLOT.PROP_3, y: 2 }] },
  { dx: 3.3, cells: [{ slot: SLOT.FLANKER_6, y: -4.5 }, { slot: SLOT.LOCK_4, y: -1.5 }, { slot: SLOT.LOCK_5, y: 1.5 }, { slot: SLOT.FLANKER_7, y: 4.5 }] },
  { dx: 5.2, cells: [{ slot: SLOT.NUMBER_8, y: 0 }] },
  { dx: MAUL_HOOKER_DX, cells: [{ slot: SLOT.HOOKER, y: 0 }] },
];

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
        const first = p.movements[0];
        const last = p.movements[p.movements.length - 1];
        const dot = placed(pl, p.side, state, clampX(last.x), clampY(last.y), false);
        if (p.movements.length > 1) {
          dot.from = { x: clampX(first.x), y: clampY(first.y) };
        }
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
          const first = moves[0];
          const last = moves[moves.length - 1];
          let finalX = last.x;
          let finalY = last.y;
          if (pl === carrier) {
            const engineFinalBall = hops[hops.length - 1] ?? { x: last.x, y: last.y };
            finalX = engineFinalBall.x - fwd * 2.5;
            finalY = engineFinalBall.y;
          }
          const dot = placed(pl, p.side, state, clampX(finalX), clampY(finalY), pl === carrier);
          if (moves.length > 1) {
            dot.from = { x: clampX(first.x), y: clampY(first.y) };
          }
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
    out.push(placed(p, atkSide, state, clampX(hop.x - fwd * (2.5 + i * 4)), clampY(hop.y), p === carrier));
  }

  // Carrier safety: if the chain didn't surface the carrier (offload / edge case),
  // place them at the final receive hop so they're never left invisible.
  if (carrier && !out.some(pl => pl.key === `${atkSide}:${carrier.id}`) && !choreographedKeys.has(`${atkSide}:${carrier.id}`)) {
    const last = recvHops[recvHops.length - 1] ?? hops[hops.length - 1];
    out.push(placed(carrier, atkSide, state, clampX(last.x - fwd * 2.5), clampY(last.y), true));
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
        const tackleX = clampDefenderX(carrierPl.x + fwd * 1.3, fwd);
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
