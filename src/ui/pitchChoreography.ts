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
  if (event.phase === MatchPhase.BoxKick)        return travelingKickLayout(event, state, attacksTop, prevBallX, prevBallY);

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

  return openPlayLayout(event, state, attacksTop);
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
  let kicker: Player | null;
  let onBall: Player | null;
  if (event.phase === MatchPhase.DropOut22) {
    onBall = p1;   // receiver gathers the drop-out at the landing
    kicker = p2;   // chaser tracks down from the kick origin
  } else {
    kicker = p1;
    onBall = p2;
    // No named receiver (goal kick, or a retained regather): the kicker is the
    // on-ball dot at the kick spot, with nobody left at the origin.
    if (!onBall && p1 && sideOf(p1, state) === possSide) { onBall = p1; kicker = null; }
  }

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
// dots accumulate — the layout must stay consistent across all of them, and the full
// formation only appears on the actual kick beat.
function kickOffLayout(event: GameEvent, state: MatchState, _attacksTop: boolean): Placed[] {
  const possSide: Side = event.side === 'home' ? 'h' : 'a';
  const keys = event.narration.steps
    .filter(s => s.kind === 'phase_outcome')
    .map(s => (s as { key: string }).key);
  // coin_toss / announce are also phase_outcome steps, so detect the kick beats by key.
  const SWAP_KEYS = ['clean_receive', 'knock_on', 'poor_kick'];   // possession → receivers
  const swapped     = keys.some(k => SWAP_KEYS.includes(k));
  const isKickBeat  = swapped || keys.includes('short_kick_retain');

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

  // Full kick-off formation ONLY on the actual kick beat — never on the coin-toss /
  // announce beats, whose ball still sits at halfway (which would strand spare dots).
  if (isKickBeat) {
    const recvSide: Side = kickSide === 'h' ? 'a' : 'h';
    const recvOn = onFieldPlayers(recvSide === 'h' ? state.homeTeam : state.awayTeam, state, possOf(recvSide));
    const receiver = event.primaryPlayer;
    // Transform the authored frame onto the real kick: flip the long axis to the real
    // kick direction (ball travel from halfway), and mirror laterally when the ball
    // lands on the low-y side.
    const kickDir = event.ballX <= 50 ? -1 : 1;
    const mirror = event.ballY < 50;
    const tx = (p: [number, number]): [number, number] => [
      clampX(50 - (p[0] - 50) * kickDir),
      clampY(mirror ? 100 - p[1] : p[1]),
    ];
    // Place a dot at its post-chase resting spot (`to`) and tag the kick-off-line
    // start (`from`) so PitchView animates the chase as the ball is in the air.
    const placeChase = (p: Player, side: Side, spot: KickoffSpot): void => {
      const [tx0, ty0] = tx(spot.to);
      const dot = placed(p, side, state, tx0, ty0, false);
      const [fx, fy] = tx(spot.from);
      dot.from = { x: fx, y: fy };
      out.push(dot);
    };
    // Receiving XV in the authored shape; the real catcher runs onto the real landing.
    for (let slot = 1; slot <= 15; slot++) {
      const p = recvOn.find(pl => pl.id === slot);
      if (!p) continue;
      if (receiver && p === receiver) {
        const dot = placed(p, recvSide, state, clampX(event.ballX), clampY(event.ballY), false);
        const [fx, fy] = tx(KICKOFF_RECV[slot].from);
        dot.from = { x: fx, y: fy };
        out.push(dot);
      } else {
        placeChase(p, recvSide, KICKOFF_RECV[slot]);
      }
    }
    // Kicking XV chase line + cover (the kicker is already placed on the centre spot).
    for (let slot = 1; slot <= 15; slot++) {
      const p = kickOn.find(pl => pl.id === slot);
      if (!p || p === kicker) continue;
      placeChase(p, kickSide, KICKOFF_KICK[slot]);
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

  // Attacking pack faces toward its own end (negative fwd), defenders face toward attacking end.
  const out: Placed[] = [
    ...pack(state, atkSide, event.ballX, event.ballY, -fwd),
    ...pack(state, defSide, event.ballX, event.ballY, +fwd),
  ];

  // Both #9s are placed at their FINAL positions (2 units behind their #8 at dx=10)
  // with scrumHalfRole set so PitchView can WAAPI-sweep them from the loosehead
  // start (where they visually appear) to this committed final position.
  const atkSH = onFieldPlayers(atkTeam, state, possOf(atkSide)).find(p => p.id === SLOT.SCRUM_HALF);
  const defSH = onFieldPlayers(defTeam, state, possOf(defSide)).find(p => p.id === SLOT.SCRUM_HALF);
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

  // Throwing team's hooker on the touchline, at throw mark.
  if (atkHooker) {
    out.push(placed(atkHooker, atkSide, state,
      event.ballX,
      nearY === 0 ? 2 : 98,   // just inside the touchline (not clamped to 3)
      false));
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
