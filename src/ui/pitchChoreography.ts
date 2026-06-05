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
import { colorOnDark, textOn } from './teamColors';

// A placed dot in pitch coords (x = long axis 0–100, y = lateral 0–100).
export interface Placed {
  key: string;        // `${side}:${p.id}` (p.id = matchday slot 1-15) — stable within a match
  jersey: number;
  color: string;      // fill (team colour, readable on dark)
  text: string;       // jersey text colour (contrast)
  x: number;
  y: number;
  isCarrier: boolean; // the on-ball dot (sits behind ball, slightly offset)
  from?: { x: number; y: number }; // start position — PitchView animates the dot from here to its resting (x,y) over the beat (kick-off chase line)
  scrumHalfRole?: 'atk' | 'def'; // scrum SH — PitchView sweeps from loosehead start to behind-#8 final
}

type Side = 'h' | 'a';

const clampX = (x: number): number => Math.max(2, Math.min(98, x));
const clampY = (y: number): number => Math.max(3, Math.min(97, y));

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
  const fill = colorOnDark(team.color);   // the actual rendered dot colour
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
  if (event.phase === MatchPhase.TacticalKick)   return travelingKickLayout(event, state, attacksTop, prevBallX, prevBallY);
  if (event.phase === MatchPhase.ConversionKick) return travelingKickLayout(event, state, attacksTop, prevBallX, prevBallY);
  if (event.phase === MatchPhase.DropOut22)      return travelingKickLayout(event, state, attacksTop, prevBallX, prevBallY);
  if (event.phase === MatchPhase.BoxKick) {
    const keys = outcomeKeys(event);
    // Announce beat: formation around the live ruck (event.ball IS the kick origin).
    if (keys.includes('announce')) return placeFormation(event, state, attacksTop, event.ballX, event.ballY, BOX_KICK_ANNOUNCE);
    // Outcome beat: the ball has flown to the landing, so anchor the kicking
    // formation on the kick origin (the previous beat's ball = the announce ruck).
    const form = BOX_KICK_FORMS.find(f => keys.includes(f.key));
    if (form) return placeFormation(event, state, attacksTop, prevBallX, prevBallY, form.form);
    return travelingKickLayout(event, state, attacksTop, prevBallX, prevBallY);
  }
  // A penalty kicked to touch behaves like a tactical kick to touch (ball out, lineout
  // next) — same layout: only the kicker, no receiver under the ball.
  if (event.phase === MatchPhase.Penalty && kickFindsTouch(event))
    return travelingKickLayout(event, state, attacksTop, prevBallX, prevBallY);

  // Pure-announcement beats (fatigue, card, clock, etc.) have no phase_outcome step
  // and should not place players near the ball.
  if (!event.narration.steps.some(s => s.kind === 'phase_outcome')) {
    const first = event.narration.steps[0];
    if (first?.kind === 'announcement' && first.key === 'fatigue_tiredness')
      return fatigueLayout(event, state);
    return [];
  }

  if (event.phase === MatchPhase.Scrum)   return scrumLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.Lineout) return lineoutLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.Maul)    return maulLayout(event, state, attacksTop);

  // First phase off a set piece: diagonal backline formation anchored at the #9's
  // set-piece ending position (behind #8 or at the lineout feed mark).
  if (event.phase === MatchPhase.FirstPhase
      && (prevPhase === MatchPhase.Scrum || prevPhase === MatchPhase.Lineout)) {
    return firstPhaseBacklineLayout(event, state, attacksTop, prevPhase, prevBallX, prevBallY);
  }

  // Breakdown: authored full-formation frames. Anchored on the live ruck (event.ball).
  if (event.phase === MatchPhase.Breakdown) {
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
    out.push(placed(onBall, sideOf(onBall, state), state, clampX(event.ballX - fwd * 2.5), event.ballY, true));
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
interface Formation { nearTop: boolean; atk: FormOffsets; def: FormOffsets; }

const outcomeKeys = (event: GameEvent): string[] =>
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
  // caught by the receiver, a cleanout penalty that swapped the mark) it flips.
  const dir = (atkSide === possSide ? attacksTop : !attacksTop) ? 1 : -1;
  const mirrorY = form.nearTop !== (anchorY >= 50);
  const atkOn = onFieldPlayers(atkSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(atkSide));
  const defOn = onFieldPlayers(defSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(defSide));

  const out: Placed[] = [];
  const fill = (on: Player[], side: Side, tbl: FormOffsets): void => {
    for (let slot = 1; slot <= 15; slot++) {
      const off = tbl[slot];
      const p = on.find(pl => pl.id === slot);
      if (off && p) out.push(placed(p, side, state,
        clampX(anchorX + off[0] * dir),
        clampY(anchorY + (mirrorY ? -off[1] : off[1])), false));
    }
  };
  fill(atkOn, atkSide, form.atk);
  fill(defOn, defSide, form.def);
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
const BOX_KICK_RETAIN: Formation = { nearTop: false,
  atk: {
    1:  [ -1.22,  18.11],   2:  [ -3.09,  -3.75],   3:  [ -4.24,  39.43],
    4:  [  4.26,  -2.10],   5:  [  4.11,   2.31],   6:  [ -3.52,  24.18],
    7:  [ -3.52,  13.15],   8:  [  2.24,   0.11],   9:  [  0.00,   0.00],
    10: [ -9.57,  19.03],   11: [ -2.80,  -8.00],   12: [-12.31,  37.77],
    13: [-14.18,  54.49],   14: [-15.48,  72.32],   15: [-20.38,  29.51],
  },
  def: {
    1:  [ 14.63,  -8.00],   2:  [  6.27,   0.11],   3:  [ 11.75,  13.52],
    4:  [ 12.04,  36.30],   5:  [ 11.75,  20.13],   6:  [ 11.75,  42.73],
    7:  [  7.14,   3.23],   8:  [ 11.32,  27.67],   9:  [  8.72,  -5.22],
    10: [ 12.04,  52.11],   11: [ 31.92,  78.75],   12: [ 11.75,  62.58],
    13: [ 12.90,  75.63],   14: [ 35.95,  -7.24],   15: [ 40.00,  42.00],
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
  atk: {
    1:  [  2.18,   2.97],   2:  [ -2.72, -15.22],   3:  [ -5.60, -18.71],
    4:  [  3.04,  -0.89],   5:  [  1.32,  -2.17],   6:  [ -3.44,  -9.71],
    7:  [ -4.74, -29.37],   8:  [ -3.15,  11.06],   9:  [  0.00,   0.00],
    10: [-11.07, -14.30],   11: [ -4.01,  19.69],   12: [-11.79, -28.82],
    13: [-12.00, -43.33],   14: [-11.22, -67.77],   15: [-12.00,   1.87],
  },
  def: {
    1:  [ 10.54, -29.37],   2:  [ 10.54, -20.73],   3:  [  6.50,  -0.34],
    4:  [ 11.26, -11.73],   5:  [  5.06,   2.97],   6:  [  9.67, -35.06],
    7:  [  5.49,  -2.91],   8:  [ 11.54, -16.32],   9:  [ 13.56,  -1.07],
    10: [ 18.60, -25.88],   11: [ 30.56, -65.93],   12: [ 10.10, -45.35],
    13: [ 10.25, -67.95],   14: [ 26.38,  17.85],   15: [ 39.49, -15.04],
  },
};
const BOX_KICK_DEFEND_CONTESTED: Formation = { nearTop: true,
  atk: {
    1:  [ -4.63, -13.76],   2:  [ -1.61,  -9.35],   3:  [ -4.63,  -4.20],
    4:  [  4.16,  -2.73],   5:  [  4.59,   3.52],   6:  [ -1.75,  32.00],
    7:  [ -1.61,  22.63],   8:  [  3.58,   0.02],   9:  [  0.00,   0.00],
    10: [-15.01,  -1.45],   11: [-11.98, -48.12],   12: [ -4.06, -25.70],
    13: [ -4.92, -40.03],   14: [  0.70,  12.89],   15: [-15.44,  33.47],
  },
  def: {
    1:  [  8.33,   4.07],   2:  [  8.33,  -2.36],   3:  [ 10.78,  26.48],
    4:  [ 13.52,  -6.22],   5:  [ 13.38, -16.51],   6:  [  6.60,   0.21],
    7:  [ 10.93,  20.24],   8:  [ 13.38, -11.18],   9:  [ 11.36,   9.21],
    10: [ 13.23, -23.86],   11: [ 23.03,  34.75],   12: [ 13.38, -40.77],
    13: [ 13.38, -32.13],   14: [ 27.06, -54.18],   15: [ 23.46, -16.88],
  },
};
const BOX_KICK_DEFEND_KNOCK_ON: Formation = { nearTop: true,
  atk: {
    1:  [ -4.38, -10.58],   2:  [ -2.94, -19.59],   3:  [  3.26,  -5.99],
    4:  [ -2.79, -14.81],   5:  [  3.40,   1.18],   6:  [ -2.94, -35.76],
    7:  [  2.97,  -2.87],   8:  [ -4.38,   8.89],   9:  [  0.00,   0.00],
    10: [ -9.13, -15.73],   11: [ -9.85, -73.24],   12: [ -8.41, -35.94],
    13: [ -9.42, -52.66],   14: [ -0.06,  12.02],   15: [-15.04, -31.71],
  },
  def: {
    1:  [  6.28,  -4.15],   2:  [ 19.54, -12.97],   3:  [ 19.68, -25.10],
    4:  [ 19.10, -30.43],   5:  [ 19.82, -37.96],   6:  [  5.99,  -0.11],
    7:  [ 19.25, -17.93],   8:  [ 19.54, -44.02],   9:  [ 11.32,  -3.23],
    10: [ 18.24, -71.40],   11: [ 29.33,  15.88],   12: [ 18.24, -50.82],
    13: [ 17.52, -59.83],   14: [ 38.55, -71.59],   15: [ 47.92, -27.49],
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
const BREAKDOWN_SLOW_BALL: Formation = { nearTop: false,
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
const BREAKDOWN_TURNOVER: Formation = { nearTop: false,
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
const BREAKDOWN_NOT_ROLLING_AWAY: Formation = { nearTop: true,
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
const BREAKDOWN_OFFSIDE_AT_RUCK: Formation = { nearTop: false,
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
const BREAKDOWN_PENALTY_DEFENDING: Formation = { nearTop: true,
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

  // Kicking team. Pre-kick beats (coin-toss / announce) and a retained short kick-off
  // keep possession with the kicker, so kicker == possession side; the swap outcomes
  // (clean_receive / knock_on / poor_kick) move possession to the receivers, so the
  // kicker is the OPPOSITE side. Derived this way the kicker dot stays the same team —
  // one dot — across the whole kick-off, instead of the pre-kick beats drawing the
  // kicking #10 and the receive beat drawing the other team's #10.
  const kickSide: Side = swapped ? (possSide === 'h' ? 'a' : 'h') : possSide;
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
    // Kick direction (ball travel from halfway) from TEAM ORIENTATION, so it's the same
    // on the announce beat (no landing yet) and the kick beat: the kicker kicks toward
    // its attacking end. attacksTop is the kicker's direction on announce (event.side =
    // kicker) and the receiver's on the kick beat (possession swapped), hence the split.
    const kickDir = swapped ? (attacksTop ? -1 : 1) : (attacksTop ? 1 : -1);
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
    // Receiving XV in the authored shape; on the kick beat the real catcher runs onto
    // the real landing (from its authored start, so it's continuous with the announce beat).
    for (let slot = 1; slot <= 15; slot++) {
      const p = recvOn.find(pl => pl.id === slot);
      if (!p) continue;
      if (receiver && p === receiver) {
        const dot = placed(p, recvSide, state, clampX(event.ballX), clampY(event.ballY), false);
        const [fx, fy] = tx(KICKOFF_RECV[slot].from);
        dot.from = { x: fx, y: fy };
        out.push(dot);
      } else {
        place(p, recvSide, KICKOFF_RECV[slot]);
      }
    }
    // Kicking XV chase line + cover (the kicker is already placed on the centre spot).
    for (let slot = 1; slot <= 15; slot++) {
      const p = kickOn.find(pl => pl.id === slot);
      if (!p || p === kicker) continue;
      place(p, kickSide, KICKOFF_KICK[slot]);
    }
  }

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
  const x = clampX(event.ballX);
  const out: Placed[] = [];
  if (off) out.push(placed(off, sideOf(off, state), state, x, farY,             false));
  if (on)  out.push(placed(on,  sideOf(on,  state), state, x, clampY(farY + inward * 7), false));
  return out;
}

// Fatigue: place the tired player away from the ball so they don't look like
// an actor in the current phase — just flash in and out at midfield.
function fatigueLayout(event: GameEvent, state: MatchState): Placed[] {
  const player = event.primaryPlayer;
  if (!player) return [];
  // Opposite lateral side from the ball, midfield x.
  return [placed(player, sideOf(player, state), state, 50, clampY(event.ballY < 50 ? 70 : 30), false)];
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

  // Carrier sits behind the ball so their circle is visible alongside it.
  if (carrier) out.push(placed(carrier, atkSide, state, clampX(ballX - fwd * 2.5), ballY, true));

  // Support attackers: fan behind the carrier in a wider arc so circles don't overlap.
  // Each player steps 6 x-units further back and is spread laterally by 8 y-units.
  support.forEach((p, i) => {
    const lateralOffset = (i % 2 === 0 ? 1 : -1) * Math.ceil((i + 1) / 2) * 8;
    out.push(placed(p, atkSide, state,
      clampX(ballX - fwd * (8 + i * 6)),
      clampY(ballY + lateralOffset), false));
  });

  const defSide: Side = atkSide === 'h' ? 'a' : 'h';
  defenders.forEach((p, i) => {
    const lateralOffset = (i % 2 === 0 ? 1 : -1) * Math.ceil((i + 1) / 2) * 8;
    out.push(placed(p, defSide, state,
      clampX(ballX + fwd * (3 + i * 6)),
      clampY(ballY + lateralOffset), false));
  });
  return out;
}

// Maul: both packs form around the ball in the same geometry as a scrum.
// Reuses pack() so the same player keys are used — when this follows a lineout,
// PitchPlayers enables top/left transitions and the dots animate from their
// lineout spread positions into this cluster (the Lineout→Maul visual).
function maulLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const fwd = attacksTop ? 1 : -1;
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const defSide: Side = atkSide === 'h' ? 'a' : 'h';
  // Attacking pack uses MAUL_ATK_ROWS so the hooker animates to the back of the maul.
  // Defending pack stays in standard scrum formation (they're defending from the front).
  // No isCarrier flag: the maul drives as a bound unit (the whole pack glides
  // forward to the post-drive cluster via the Layer-3 dot-transitioning class),
  // so we deliberately do NOT peel the hooker off onto the ball via the follower.
  return [
    ...pack(state, atkSide, event.ballX, event.ballY, -fwd, MAUL_ATK_ROWS),
    ...pack(state, defSide, event.ballX, event.ballY, +fwd),
  ];
}

// distNear = lateral distance from the nearer touchline (0 or 100).
// Convert to absolute Y: nearY===100 → 100−distNear; nearY===0 → distNear.
// ATK backs sit behind their pack (ballX − fwd*dX); DEF backs behind theirs (ballX + fwd*dX).
// Winger rule: ATK #14 = near touchline (small distNear), ATK #11 = far; DEF #11 = near, DEF #14 = far.
const SCRUM_ATK_BACKS: Array<{ slot: number; dX: number; distNear: number }> = [
  { slot: SLOT.FLY_HALF,    dX: 15, distNear: 34 },
  { slot: SLOT.CENTRE_12,   dX: 18, distNear: 47 },
  { slot: SLOT.CENTRE_13,   dX: 20, distNear: 64 },
  { slot: SLOT.FULL_BACK,   dX: 31, distNear: 58 },
  { slot: SLOT.WING_11,     dX: 21, distNear: 82 },  // far winger
  { slot: SLOT.WING_14,     dX: 22, distNear:  8 },  // near winger
];
const SCRUM_DEF_BACKS: Array<{ slot: number; dX: number; distNear: number }> = [
  { slot: SLOT.FLY_HALF,    dX: 15, distNear: 35 },
  { slot: SLOT.CENTRE_12,   dX: 17, distNear: 48 },
  { slot: SLOT.CENTRE_13,   dX: 19, distNear: 64 },
  { slot: SLOT.FULL_BACK,   dX: 29, distNear: 47 },
  { slot: SLOT.WING_11,     dX: 21, distNear:  4 },  // near winger
  { slot: SLOT.WING_14,     dX: 20, distNear: 82 },  // far winger
];

// Lineout backs: Y from distNear (reliable across scenarios); X is a fixed depth
// placeholder (lineout X shows too much scenario variance to parameterise precisely).
// ATK backs sit behind their throw (ballX − fwd*dX); DEF backs behind their pack (ballX + fwd*dX).
// #8 is excluded from the 6-man line and placed here instead.
const LINEOUT_ATK_BACKS: Array<{ slot: number; dX: number; distNear: number }> = [
  { slot: SLOT.NUMBER_8,    dX: 12, distNear: 42 },
  { slot: SLOT.FLY_HALF,   dX: 12, distNear: 36 },
  { slot: SLOT.CENTRE_12,  dX: 15, distNear: 47 },
  { slot: SLOT.CENTRE_13,  dX: 15, distNear: 62 },
  { slot: SLOT.FULL_BACK,  dX: 20, distNear: 71 },
  { slot: SLOT.WING_11,    dX: 20, distNear: 80 },  // far winger
  { slot: SLOT.WING_14,    dX: 20, distNear: 20 },  // near winger
];
const LINEOUT_DEF_BACKS: Array<{ slot: number; dX: number; distNear: number }> = [
  { slot: SLOT.NUMBER_8,   dX: 12, distNear: 28 },
  { slot: SLOT.FLY_HALF,  dX: 12, distNear: 38 },
  { slot: SLOT.CENTRE_12, dX: 15, distNear: 50 },
  { slot: SLOT.CENTRE_13, dX: 15, distNear: 62 },
  { slot: SLOT.FULL_BACK, dX: 20, distNear: 61 },
  { slot: SLOT.WING_11,   dX: 20, distNear:  7 },  // near winger
  { slot: SLOT.WING_14,   dX: 20, distNear: 82 },  // far winger
];

// Scrum 3-4-1: front row (1,2,3) at the mark, second row (6,4,5,7), #8 at the back.
// dx values sized so rows don't overlap at typical mobile pitches (~350px tall).
// y values sized so circles within a row don't overlap (~6 y-units between centres).
// dx = depth of each row from the scrum mark. Front rows at dx=2 puts opposing
// front-row centres ~4 units apart — approximately one dot-width at mobile scale
// so they sit touching. Inter-row step of 4 keeps consecutive rows touching too,
// giving the bound-together look across the full scrum.
const SCRUM_ROWS: Array<{ dx: number; cells: Array<{ slot: number; y: number }> }> = [
  { dx: 2,  cells: [{ slot: SLOT.PROP_1, y: -3 }, { slot: SLOT.HOOKER, y: 0 }, { slot: SLOT.PROP_3, y: 3 }] },
  { dx: 6,  cells: [{ slot: SLOT.FLANKER_6, y: -4.5 }, { slot: SLOT.LOCK_4, y: -1.5 }, { slot: SLOT.LOCK_5, y: 1.5 }, { slot: SLOT.FLANKER_7, y: 4.5 }] },
  { dx: 10, cells: [{ slot: SLOT.NUMBER_8, y: 0 }] },
];

// Maul attacking pack: same as scrum but hooker moves to the back (dx=14) — they
// run around from the touchline to become the ball-carrier at the tail of the drive.
const MAUL_ATK_ROWS: Array<{ dx: number; cells: Array<{ slot: number; y: number }> }> = [
  { dx: 2,  cells: [{ slot: SLOT.PROP_1, y: -2 }, { slot: SLOT.PROP_3, y: 2 }] },
  { dx: 6,  cells: [{ slot: SLOT.FLANKER_6, y: -4.5 }, { slot: SLOT.LOCK_4, y: -1.5 }, { slot: SLOT.LOCK_5, y: 1.5 }, { slot: SLOT.FLANKER_7, y: 4.5 }] },
  { dx: 10, cells: [{ slot: SLOT.NUMBER_8, y: 0 }] },
  { dx: 14, cells: [{ slot: SLOT.HOOKER, y: 0 }] },
];

function scrumLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const fwd = attacksTop ? 1 : -1;
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const defSide: Side = atkSide === 'h' ? 'a' : 'h';

  const atkTeam = atkSide === 'h' ? state.homeTeam : state.awayTeam;
  const defTeam = defSide === 'h' ? state.homeTeam : state.awayTeam;

  const nearY  = event.ballY < 50 ? 0 : 100;
  const inward = nearY === 0 ? 1 : -1;
  const toY    = (distNear: number) => clampY(nearY + inward * distNear);

  // Attacking pack faces toward its own end (negative fwd), defenders face toward attacking end.
  const out: Placed[] = [
    ...pack(state, atkSide, event.ballX, event.ballY, -fwd),
    ...pack(state, defSide, event.ballX, event.ballY, +fwd),
  ];

  // Backs for both sides — spread behind their respective packs.
  const atkOn = onFieldPlayers(atkTeam, state, possOf(atkSide));
  const defOn = onFieldPlayers(defTeam, state, possOf(defSide));
  for (const e of SCRUM_ATK_BACKS) {
    const p = atkOn.find(pl => pl.id === e.slot);
    if (p) out.push(placed(p, atkSide, state, clampX(event.ballX - fwd * e.dX), toY(e.distNear), false));
  }
  for (const e of SCRUM_DEF_BACKS) {
    const p = defOn.find(pl => pl.id === e.slot);
    if (p) out.push(placed(p, defSide, state, clampX(event.ballX + fwd * e.dX), toY(e.distNear), false));
  }

  // Both #9s are placed at their FINAL positions (12 units behind their pack).
  // On a dominant penalty, skip the standard loosehead sweep — instead use `from`
  // so both #9s animate stepping away from the scrum (atk forward to claim the
  // penalty, def retreating), starting close to the front row and further infield.
  const atkSH = onFieldPlayers(atkTeam, state, possOf(atkSide)).find(p => p.id === SLOT.SCRUM_HALF);
  const defSH = onFieldPlayers(defTeam, state, possOf(defSide)).find(p => p.id === SLOT.SCRUM_HALF);
  const isDominantPenalty = event.outcome === 'attacking_dominant_penalty'
                         || event.outcome === 'defending_dominant_penalty';
  if (isDominantPenalty) {
    const nearY  = event.ballY < 50 ? 0 : 100;
    const inward = nearY === 0 ? 1 : -1;
    const fromY  = clampY(event.ballY + inward * 9);
    if (atkSH) out.push({ ...placed(atkSH, atkSide, state, clampX(event.ballX - fwd * 12), clampY(event.ballY), false), from: { x: clampX(event.ballX - fwd * 3), y: fromY } });
    if (defSH) out.push({ ...placed(defSH, defSide, state, clampX(event.ballX + fwd * 12), clampY(event.ballY), false), from: { x: clampX(event.ballX + fwd * 2), y: fromY } });
  } else {
    if (atkSH) {
      const dot = placed(atkSH, atkSide, state, clampX(event.ballX - fwd * 12), clampY(event.ballY), false);
      dot.scrumHalfRole = 'atk';
      out.push(dot);
    }
    if (defSH) {
      const dot = placed(defSH, defSide, state, clampX(event.ballX + fwd * 12), clampY(event.ballY), false);
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
      out.push(placed(p, side, state, clampX(ballX + dir * row.dx), clampY(ballY + cell.y), false));
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
      clampX(event.ballX + fwd * 2),
      clampY(nearY + inward * 7),
      false));
  }

  // Six forwards per side (excluding hooker). The lineout runs PERPENDICULAR to the
  // touchline — players spread along Y from the 5m line to the 15m line.
  // ~7 pitch units = 5m from touchline; ~21 pitch units = 15m from touchline.
  const FIVE_M_Y    = nearY + inward * 7;
  const FIFTEEN_M_Y = nearY + inward * 21;

  const atkLine = atkFwds.filter(p => p.id !== SLOT.HOOKER).slice(0, 6);
  const defLine = defFwds.filter(p => p.id !== SLOT.HOOKER).slice(0, 6);

  // Attacking line slightly behind the mark; defending line slightly ahead.
  // Players share the same Y positions (interleaved in real rugby) but different X.
  const lineSpread = (players: Player[], side: Side, xOff: number): void => {
    const n = players.length;
    if (n === 0) return;
    const x = clampX(event.ballX + xOff);
    players.forEach((p, i) => {
      const t = n > 1 ? i / (n - 1) : 0.5;
      out.push(placed(p, side, state, x, clampY(FIVE_M_Y + t * (FIFTEEN_M_Y - FIVE_M_Y)), false));
    });
  };

  lineSpread(atkLine, atkSide, -fwd * 2);
  lineSpread(defLine, defSide, +fwd * 2);

  // Each #9 stands 2m behind their own line (2 more x-units back) and 10m infield
  // from touch (~14 y-units). onFieldPlayers covers backs; availableForwards doesn't.
  const TEN_M_Y = clampY(nearY + inward * 14);
  const atkSH = onFieldPlayers(atkTeam, state, possOf(atkSide)).find(p => p.id === SLOT.SCRUM_HALF);
  const defSH = onFieldPlayers(defTeam, state, possOf(defSide)).find(p => p.id === SLOT.SCRUM_HALF);
  if (atkSH) out.push(placed(atkSH, atkSide, state, clampX(event.ballX - fwd * 4), TEN_M_Y, false));
  if (defSH) out.push(placed(defSH, defSide, state, clampX(event.ballX + fwd * 4), TEN_M_Y, false));

  // Backs for both sides — fixed lateral spread from the lineout touchline;
  // depth is a placeholder (lineout X varies too much by outcome to parameterise).
  const toY = (distNear: number) => clampY(nearY + inward * distNear);
  const atkOn = onFieldPlayers(atkTeam, state, possOf(atkSide));
  const defOn = onFieldPlayers(defTeam, state, possOf(defSide));
  for (const e of LINEOUT_ATK_BACKS) {
    const p = atkOn.find(pl => pl.id === e.slot);
    if (p) out.push(placed(p, atkSide, state, clampX(event.ballX - fwd * e.dX), toY(e.distNear), false));
  }
  for (const e of LINEOUT_DEF_BACKS) {
    const p = defOn.find(pl => pl.id === e.slot);
    if (p) out.push(placed(p, defSide, state, clampX(event.ballX + fwd * e.dX), toY(e.distNear), false));
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
    sh9X = clampX(prevBallX - fwd * 12);
    sh9Y = clampY(prevBallY);
  } else {
    const nearY  = prevBallY < 50 ? 0 : 100;
    const inward = nearY === 0 ? 1 : -1;
    sh9X = clampX(prevBallX - fwd * 4);
    sh9Y = clampY(nearY + inward * 14);
  }

  const out: Placed[] = [];

  // #9 at the set-piece feed.
  const sh = atkOn.find(p => p.id === SLOT.SCRUM_HALF);
  if (sh) out.push(placed(sh, atkSide, state, sh9X, sh9Y, sh === carrier));

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
    const hop = recvHops[i];
    // Sit a touch behind the ball's gain-line hop, progressively deeper as play
    // goes wider — the diagonal read, anchored on the engine's real lateral y.
    out.push(placed(p, atkSide, state, clampX(hop.x - fwd * (2.5 + i * 4)), clampY(hop.y), p === carrier));
  }

  // Carrier safety: if the chain didn't surface the carrier (offload / edge case),
  // place them at the final receive hop so they're never left invisible.
  if (carrier && !out.some(pl => pl.key === `${atkSide}:${carrier.id}`)) {
    const last = recvHops[recvHops.length - 1] ?? hops[hops.length - 1];
    out.push(placed(carrier, atkSide, state, clampX(last.x - fwd * 2.5), clampY(last.y), true));
  }

  // Defenders: event actors on the defending side, placed just ahead of the ball.
  const actors = harvestActors(event);
  actors.filter(p => sideOf(p, state) === defSide).forEach((p, i) => {
    const lat = (i % 2 === 0 ? 1 : -1) * Math.ceil((i + 1) / 2) * 8;
    out.push(placed(p, defSide, state,
      clampX(event.ballX + fwd * (3 + i * 6)),
      clampY(event.ballY + lat), false));
  });

  return out;
}
