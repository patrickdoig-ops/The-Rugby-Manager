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
// everything else (open play, breakdown, maul, penalty, try) fans the involved chain.
export function choreograph(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  if (event.phase === MatchPhase.Scrum)          return scrumLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.Lineout)        return lineoutLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.KickOff)        return kickerLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.TacticalKick)   return kickerLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.ConversionKick) return kickerLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.DropOut22)      return kickerLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.BoxKick)        return kickerLayout(event, state, attacksTop);
  return openPlayLayout(event, state, attacksTop);
}

// Show the kicker (the #10 from the kicking side, or primaryPlayer as fallback)
// behind the ball, touching it, so their circle and number are visible.
function kickerLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const team = atkSide === 'h' ? state.homeTeam : state.awayTeam;
  const poss = possOf(atkSide);
  const onField = onFieldPlayers(team, state, poss);
  // Prefer the #10 fly-half, fall back to primaryPlayer, then first on-field player.
  const kicker = onField.find(p => p.id === SLOT.FLY_HALF)
    ?? event.primaryPlayer
    ?? onField[0];
  if (!kicker) return [];
  const fwd = attacksTop ? 1 : -1;
  // Place kicker slightly behind the ball so their circle is visible next to it.
  return [placed(kicker, atkSide, state, clampX(event.ballX - fwd * 2.5), event.ballY, true)];
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

  // For FirstPhase off a set piece, inject the scrum-half as the link player if
  // not already in the actor list — shows the SH→10 pass chain visually.
  if (event.phase === MatchPhase.FirstPhase) {
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

// Scrum 3-4-1: front row (1,2,3) at the mark, second row (6,4,5,7), #8 at the back.
// dx values sized so rows don't overlap at typical mobile pitches (~350px tall).
// y values sized so circles within a row don't overlap (~6 y-units between centres).
const SCRUM_ROWS: Array<{ dx: number; cells: Array<{ slot: number; y: number }> }> = [
  { dx: 7,  cells: [{ slot: SLOT.PROP_1, y: -6 }, { slot: SLOT.HOOKER, y: 0 }, { slot: SLOT.PROP_3, y: 6 }] },
  { dx: 15, cells: [{ slot: SLOT.FLANKER_6, y: -9 }, { slot: SLOT.LOCK_4, y: -3 }, { slot: SLOT.LOCK_5, y: 3 }, { slot: SLOT.FLANKER_7, y: 9 }] },
  { dx: 23, cells: [{ slot: SLOT.NUMBER_8, y: 0 }] },
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

function pack(state: MatchState, side: Side, ballX: number, ballY: number, dir: number): Placed[] {
  const team = side === 'h' ? state.homeTeam : state.awayTeam;
  // availableForwards already returns the on-field forwards as objects keyed by
  // their slot id — index them directly rather than a Set + linear find per cell.
  const bySlot = new Map(availableForwards(team, state, possOf(side)).map(p => [p.id, p]));
  const out: Placed[] = [];
  for (const row of SCRUM_ROWS) {
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

  // Defending hooker in the 5m channel (onside, at the throw mark X position).
  if (defHooker) {
    out.push(placed(defHooker, defSide, state,
      event.ballX,
      clampY(nearY + inward * 7),
      false));
  }

  // Six forwards per side (excluding hooker), spread along X, two parallel lines.
  const ATK_LINE_Y = clampY(nearY + inward * 6);
  const DEF_LINE_Y = clampY(nearY + inward * 14);
  const SPACING = 7;  // x-units between adjacent players

  const atkLine = atkFwds.filter(p => p.id !== SLOT.HOOKER).slice(0, 6);
  const defLine = defFwds.filter(p => p.id !== SLOT.HOOKER).slice(0, 6);

  // Centre the line on ballX; extend forward and backward.
  const lineOffset = (players: Player[], lineY: number, side: Side): void => {
    const half = (players.length - 1) / 2;
    players.forEach((p, i) => {
      out.push(placed(p, side, state,
        clampX(event.ballX + fwd * (i - half) * SPACING),
        lineY, false));
    });
  };

  lineOffset(atkLine, ATK_LINE_Y, atkSide);
  lineOffset(defLine, DEF_LINE_Y, defSide);

  return out;
}
