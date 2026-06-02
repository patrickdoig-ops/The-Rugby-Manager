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
export function choreograph(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  // Substitution beats always show players near the touchline, not the ball.
  if (event.phase === MatchPhase.Substitution) return substitutionLayout(event, state);

  // Kick phases always show the kicker (and receiver for kick-offs) regardless
  // of whether the narration step is a phase_outcome or announcement.
  if (event.phase === MatchPhase.KickOff)        return kickOffLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.TacticalKick)   return kickerLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.ConversionKick) return kickerLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.DropOut22)      return kickerLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.BoxKick)        return kickerLayout(event, state, attacksTop);

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
  return openPlayLayout(event, state, attacksTop);
}

// Show the kicker (#10 from the kicking side) behind the ball so their circle
// and number are visible alongside it.
function kickerLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const team = atkSide === 'h' ? state.homeTeam : state.awayTeam;
  const onField = onFieldPlayers(team, state, possOf(atkSide));
  const kicker = onField.find(p => p.id === SLOT.FLY_HALF)
    ?? event.primaryPlayer
    ?? onField[0];
  if (!kicker) return [];
  const fwd = attacksTop ? 1 : -1;
  return [placed(kicker, atkSide, state, clampX(event.ballX - fwd * 2.5), event.ballY, true)];
}

// Kick-off layout across two beats:
//   Beat 1 (announce): kicker + chaser placeholder at halfway center, ready to run.
//   Beat 2 (resolution): receiver at landing; chaser 10 units forward of halfway at
//   landing Y — the dot-transitioning class (set by PitchPlayers) CSS-animates the
//   chaser from their beat-1 position along the x-axis toward the receiver.
function kickOffLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const fwd = attacksTop ? 1 : -1;
  const team = atkSide === 'h' ? state.homeTeam : state.awayTeam;
  const onField = onFieldPlayers(team, state, possOf(atkSide));
  const kicker = onField.find(p => p.id === SLOT.FLY_HALF) ?? onField[0];
  if (!kicker) return [];

  const out: Placed[] = [placed(kicker, atkSide, state, clampX(50 - fwd * 2.5), 50, true)];

  const chaser = event.secondaryPlayer;

  if (chaser) {
    // Resolution beat: receiver at landing, chaser 10 units ahead of halfway.
    const receiver = event.primaryPlayer;
    if (receiver && receiver !== kicker) {
      out.push(placed(receiver, sideOf(receiver, state), state, event.ballX, event.ballY, false));
    }
    out.push(placed(chaser, sideOf(chaser, state), state, clampX(50 + fwd * 10), event.ballY, false));
  } else {
    // Announce beat: show a chaser placeholder at halfway center so the CSS
    // transition on beat 2 has a starting position to animate from.
    const placeholder = onField.find(p => p.id === SLOT.NUMBER_8)
      ?? onField.find(p => p.id === SLOT.FLANKER_7)
      ?? onField.find(p => p.id === SLOT.FLANKER_6)
      ?? onField.find(p => p !== kicker);
    if (placeholder) out.push(placed(placeholder, atkSide, state, 50, 50, false));
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
  // Attacking pack faces toward its own end (negative fwd), defenders face toward attacking end.
  return [
    ...pack(state, atkSide, event.ballX, event.ballY, -fwd),
    ...pack(state, defSide, event.ballX, event.ballY, +fwd),
  ];
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
