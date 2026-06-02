// PURE rugby → 2D-pitch geometry for the player-dot layer. No DOM, no engine
// mutation, no RNG: given a beat (GameEvent) + live state, return where each
// involved player's dot should sit, in pitch coords (x,y 0–100). The DOM layer
// (PitchPlayers) maps these through pitchCoords.toTop and renders/fades them.
//
// The engine has NO per-player field coordinates — positions here are an
// inferred, stylized impression (carrier on the ball, support fanned behind,
// defenders just ahead, set-piece packs in formation), not a simulation.

import type { GameEvent, MatchState } from '../types/match';
import type { Player } from '../types/player';
import type { PossessionSide } from '../types/engine';
import { MatchPhase } from '../types/engine';
import { availableForwards } from '../engine/FieldPosition';
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
  isCarrier: boolean; // the on-ball dot — rides the ball walk
}

type Side = 'h' | 'a';

const clampX = (x: number): number => Math.max(2, Math.min(98, x));
const clampY = (y: number): number => Math.max(4, Math.min(96, y));

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
// the two top-level actors then each narration step's primary/secondary. This is
// how the backline pass chain (out_the_back steps) and offload chains surface.
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

// Phases whose ball is in the air / has no on-pitch handler to choreograph.
const NO_DOTS = new Set<MatchPhase>([
  MatchPhase.KickOff, MatchPhase.DropOut22, MatchPhase.BoxKick,
  MatchPhase.TacticalKick, MatchPhase.ConversionKick,
]);

// Router: dispatch by phase. Set pieces draw both full packs; kicks draw nothing;
// everything else (open play, breakdown, maul, penalty, try) fans the involved chain.
export function choreograph(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  if (event.phase === MatchPhase.Scrum)   return scrumLayout(event, state, attacksTop);
  if (event.phase === MatchPhase.Lineout) return lineoutLayout(event, state);
  if (NO_DOTS.has(event.phase))           return [];
  return openPlayLayout(event, state, attacksTop);
}

// Carrier on the ball; support attackers fanned behind (toward own end) and
// spread laterally by order; defenders just ahead, tight to the ball's lateral.
function openPlayLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const actors = harvestActors(event);
  if (actors.length === 0) return [];
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const fwd = attacksTop ? 1 : -1;           // +x toward the attacking in-goal
  const { ballX, ballY } = event;

  const attackers: Player[] = [];
  const defenders: Player[] = [];
  for (const p of actors) (sideOf(p, state) === atkSide ? attackers : defenders).push(p);

  const out: Placed[] = [];
  // Carrier = first attacking actor (primaryPlayer when it's an attacker; else the
  // first attacking chain member — covers interception/high-tackle where the
  // top-level primary is a defender).
  const [carrier, ...support] = attackers;
  if (carrier) out.push(placed(carrier, atkSide, state, ballX, ballY, true));

  support.forEach((p, i) => {
    const spread = support.length > 1 ? (i / (support.length - 1) - 0.5) : 0; // -0.5..0.5
    out.push(placed(p, atkSide, state,
      clampX(ballX - fwd * (2 + (i + 1) * 1.5)),
      clampY(ballY + spread * 24), false));
  });

  const defSide: Side = atkSide === 'h' ? 'a' : 'h';
  defenders.forEach((p, i) => {
    out.push(placed(p, defSide, state,
      clampX(ballX + fwd * (2.5 + i * 1.5)),
      clampY(ballY + (i === 0 ? 0 : (i % 2 ? 6 : -6))), false));
  });
  return out;
}

// Scrum 3-4-1: front row (1,2,3) at the mark, middle four (6,4,5,7), 8 at the back.
const SCRUM_ROWS: Array<{ dx: number; cells: Array<{ slot: number; y: number }> }> = [
  { dx: 1.5, cells: [{ slot: SLOT.PROP_1, y: -3 }, { slot: SLOT.HOOKER, y: 0 }, { slot: SLOT.PROP_3, y: 3 }] },
  { dx: 3.5, cells: [{ slot: SLOT.FLANKER_6, y: -6 }, { slot: SLOT.LOCK_4, y: -2 }, { slot: SLOT.LOCK_5, y: 2 }, { slot: SLOT.FLANKER_7, y: 6 }] },
  { dx: 5.0, cells: [{ slot: SLOT.NUMBER_8, y: 0 }] },
];

function scrumLayout(event: GameEvent, state: MatchState, attacksTop: boolean): Placed[] {
  const fwd = attacksTop ? 1 : -1;
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const defSide: Side = atkSide === 'h' ? 'a' : 'h';
  // Attacking pack behind the mark (toward its own end), defenders mirrored ahead.
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

// Lineout: two lines parallel to the near touchline, stepped along the throw axis.
function lineoutLayout(event: GameEvent, state: MatchState): Placed[] {
  const atkSide: Side = event.side === 'home' ? 'h' : 'a';
  const defSide: Side = atkSide === 'h' ? 'a' : 'h';
  const nearY = event.ballY < 50 ? 0 : 100;
  const inward = nearY === 0 ? 1 : -1;
  return [
    ...lineoutLine(state, atkSide, event.ballX, nearY + inward * 6),
    ...lineoutLine(state, defSide, event.ballX, nearY + inward * 9),
  ];
}

function lineoutLine(state: MatchState, side: Side, ballX: number, lineY: number): Placed[] {
  const team = side === 'h' ? state.homeTeam : state.awayTeam;
  return availableForwards(team, state, possOf(side)).slice(0, 7).map((p, i) =>
    placed(p, side, state, clampX(ballX + (i - 3) * 2.5), clampY(lineY), false));
}
