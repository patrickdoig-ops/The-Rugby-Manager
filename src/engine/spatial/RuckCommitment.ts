// WP4 heuristic ruck commitment (Upgrade.md § 5.6).
//
// On tackle completion the breakdown forms at the ruck mark. Every nearby agent
// scores commit-vs-reform; the committed bodies' COUNT and QUALITY feed the
// existing BreakdownResolver as INPUTS (the resolver's contest formula is
// unchanged — see docs/match-engine.md § "Breakdown"). Committed agents steer to
// the ruck mark; everyone else gets a reform target (defenders fold back toward
// the line, attackers reset their shape) — so the persistent World shows the
// breakdown forming and the off-ball players reshaping (continuity, § 3).
//
// MUTATION BOUNDARY: this writes only to the World (agent intent.target / role)
// — engine-internal substrate, exactly like seedFormation / reanchorDefence. It
// returns the committed sets as plain data; the BreakdownEvent handler maps them
// to Players and feeds resolveBreakdown. NO MatchState write happens here.
//
// RNG CONTRACT: the only randomness is rngSpatial (the commit-score noise band) —
// confined to src/engine/spatial/ (CLAUDE.md § 7). The BreakdownResolver's own
// rng() outcome-stream draws are UNCHANGED and live in the handler; this file
// never touches the outcome stream.

import { rngSpatial } from '../../utils/rng';
import type { PossessionSide } from '../../types/engine';
import type { DefendingBreakdown } from '../../types/team';
import { RUCK_ELIGIBILITY, RUCK_COMMIT, RUCK_DEFEND_CAP } from '../balance/spatialRuck';
import { AGENTS_PER_SIDE } from './World';
import type { World } from './World';
import type { Agent } from './types';

export interface RuckCommitmentInput {
  attackSide: PossessionSide;
  defendSide: PossessionSide;
  attackDir: 1 | -1;
  mark: { x: number; y: number };  // the ruck mark (where contact resolved)
  carrierSlot: number;             // attacking matchday slot of the tackled carrier
  attackCap: number;               // breakdownSupporterCount for the attacking plan
  defendPlan: DefendingBreakdown;  // keys the defensive commit cap (RUCK_DEFEND_CAP)
}

export interface RuckCommitment {
  // Committed attacking cleaners, best-commit-first (the resolver's supporters).
  committedAttackers: Agent[];
  // Committed defenders contesting the ruck (counter-ruck pack / poachers).
  committedDefenders: Agent[];
  // The single best-placed defender over the ball — the jackal the resolver
  // contests against (highest commit score among committed defenders).
  jackal: Agent | null;
  // Real measured carrier isolation: distance to nearest support at the mark.
  carrierIsolation: number;
}

// One agent's commit score (0–100-ish). Combines the four § 5.6 factors. The
// caller decides commit-vs-reform from this + the override.
interface Scored {
  agent: Agent;
  score: number;
  spec: number;     // (breakdown − pivot), reused for the override
}

// Distance from the carrier to its nearest same-side support in the World. The
// REAL measured isolation that drives both sides' commit priority (§ 5.6).
function carrierIsolationDist(world: World, carrier: Agent): number {
  let best = Infinity;
  for (let i = 0; i < world.agents.length; i++) {
    const a = world.agents[i];
    if (a.side !== carrier.side) continue;
    if (a.slot === carrier.slot) continue;
    if (a.role === 'empty') continue;
    const d = Math.hypot(a.pos.x - carrier.pos.x, a.pos.y - carrier.pos.y);
    if (d < best) best = d;
  }
  return best === Infinity ? RUCK_COMMIT.isolationFull : best;
}

// Isolation factor 0–1: 0 when support is on the carrier's shoulder, 1 when the
// nearest support is at/beyond isolationFull.
function isolationFactor(dist: number): number {
  const f = dist / RUCK_COMMIT.isolationFull;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

// Score every eligible agent on one side and return them sorted best-commit-first.
// Eligible = within eligibilityRadius of the mark, not the carrier, not a deep
// back parked in the backfield (a back well behind the mark isn't reaching the
// ruck). `isolation01` is the shared carrier-isolation factor (both sides read it).
function scoreSide(
  world: World,
  side: PossessionSide,
  mark: { x: number; y: number },
  carrierSlot: number,
  cap: number,
  isolation01: number,
): Scored[] {
  const base = side === 'home' ? 0 : AGENTS_PER_SIDE;
  const scored: Scored[] = [];
  for (let i = 0; i < AGENTS_PER_SIDE; i++) {
    const agent = world.agents[base + i];
    if (agent.role === 'empty') continue;
    if (agent.slot === carrierSlot) continue;
    const d = Math.hypot(agent.pos.x - mark.x, agent.pos.y - mark.y);
    if (d > RUCK_ELIGIBILITY.eligibilityRadius) continue;
    // A deep back far behind the mark is kick cover, not a cleaner — but a back
    // near the ruck (e.g. a covering centre) can still commit, so the eligibility
    // radius already gates them; no extra exclusion needed beyond the carrier.
    // Forwards naturally dominate via the breakdown-stat specialisation below.
    // Draw the commit-score noise INLINE in slot iteration order so the rngSpatial
    // draw sequence is stable (the frozen determinism contract, Upgrade.md § 11).
    const specDelta = agent.breakdown - RUCK_COMMIT.specPivot;
    const score = RUCK_COMMIT.specWeight * specDelta
                + RUCK_COMMIT.isolationWeight * isolation01
                + rngSpatial(-RUCK_COMMIT.noiseBand, RUCK_COMMIT.noiseBand);
    scored.push({ agent, score, spec: specDelta });
  }
  void cap;
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function commitRuck(world: World, input: RuckCommitmentInput): RuckCommitment {
  const attackBase = input.attackSide === 'home' ? 0 : AGENTS_PER_SIDE;
  const carrier = world.agents[attackBase + input.carrierSlot - 1];
  const isolationDist = carrierIsolationDist(world, carrier);
  const iso01 = isolationFactor(isolationDist);

  const attackCap = clampInt(input.attackCap, RUCK_COMMIT.minAttackCommit, RUCK_COMMIT.maxAttackCommit);
  const defendCap = clampInt(RUCK_DEFEND_CAP[input.defendPlan], RUCK_COMMIT.minDefendCommit, RUCK_COMMIT.maxDefendCommit);

  // Score both sides (home then away iteration order preserved inside scoreSide).
  const attackScored = scoreSide(world, input.attackSide, input.mark, input.carrierSlot, attackCap, iso01);
  const defendScored = scoreSide(world, input.defendSide, input.mark, input.carrierSlot, defendCap, iso01);

  const committedAttackers = selectCommitted(attackScored, attackCap, RUCK_COMMIT.minAttackCommit, RUCK_COMMIT.maxAttackCommit, iso01);
  const committedDefenders = selectCommitted(defendScored, defendCap, RUCK_COMMIT.minDefendCommit, RUCK_COMMIT.maxDefendCommit, iso01);

  // Steer committed agents to the ruck mark; reform everyone else (§ 5.6). These
  // are intent.targets the persistent World runs on the next continuation beat —
  // the breakdown forms, off-ball players reshape, nothing teleports.
  steerCommitment(world, input, committedAttackers, committedDefenders);

  const jackal = committedDefenders.length > 0 ? committedDefenders[0] : null;

  if (process.env['RUCK_DEBUG']) {
    const g = globalThis as unknown as { _ra?: number; _rd?: number; _rn?: number; _ri?: number };
    g._ra = (g._ra ?? 0) + committedAttackers.length;
    g._rd = (g._rd ?? 0) + committedDefenders.length;
    g._ri = (g._ri ?? 0) + isolationDist;
    g._rn = (g._rn ?? 0) + 1;
  }

  return { committedAttackers, committedDefenders, jackal, carrierIsolation: isolationDist };
}

// Pick the committed set. The team tactical cap IS the intended body count
// (`breakdownSupporterCount` for attack, RUCK_DEFEND_CAP for defence) — that is
// what keeps the average committed count matching the proven resolver's
// participant count, so the contest distribution (and the turnover/penalty bands)
// holds. Two modulations on top:
//   • Isolation REDUCES the count — when the carrier is isolated (support didn't
//     arrive) the side gets ONE fewer body, the genesis of the jackal turnover.
//   • Override ADDS one — a high-breakdown specialist beside an isolated carrier
//     commits even past the cap (the openside who can't ignore the poach chance).
// Result bounded to [min, max]. Input is sorted best-commit-first.
function selectCommitted(scored: Scored[], cap: number, min: number, max: number, iso01: number): Agent[] {
  // Isolation drop: a strongly-isolated carrier (iso01 near 1) loses one body.
  // The threshold keeps normal rucks (support on the shoulder, iso01 ≈ 0) at full
  // cap, so only genuinely exposed carriers thin out.
  const isoDrop = iso01 >= RUCK_COMMIT.isolationDropFactor ? 1 : 0;
  let target = cap - isoDrop;

  // Override: the best-scored eligible specialist (sorted first) commits beyond
  // the (possibly isolation-reduced) cap when spec + threat clears the bar — so an
  // isolated carrier still draws a specialist cleaner / jackal in.
  if (scored.length > 0) {
    const top = scored[0];
    const overrideScore = RUCK_COMMIT.overrideSpecWeight * top.spec + RUCK_COMMIT.isolationWeight * iso01;
    if (overrideScore >= RUCK_COMMIT.overrideThreshold) target += 1;
  }

  if (target < min) target = min;
  if (target > max) target = max;

  const committed: Agent[] = [];
  for (let k = 0; k < scored.length && committed.length < target; k++) {
    committed.push(scored[k].agent);
  }
  // Floor: never return fewer than `min` if eligible agents exist (always present
  // the ball / always field a jackal).
  for (let k = 0; committed.length < min && k < scored.length; k++) {
    if (!committed.includes(scored[k].agent)) committed.push(scored[k].agent);
  }
  return committed;
}

// Steer committed agents onto the ruck mark (clustered just on their side of it)
// and reform everyone else: committed defenders/attackers converge; uncommitted
// defenders fold back toward the defensive line, uncommitted attackers reset to a
// loose support depth. Engine-internal intent writes only — MovementSystem moves
// them on the next continuation beat. Allocation-light: reuses existing target
// Vec2s where present.
function steerCommitment(
  world: World,
  input: RuckCommitmentInput,
  committedAttackers: Agent[],
  committedDefenders: Agent[],
): void {
  const committed = new Set<Agent>([...committedAttackers, ...committedDefenders]);
  for (const a of committedAttackers) {
    setTarget(a, input.mark.x - input.attackDir * 0.5, input.mark.y);
    a.role = 'corridor';
  }
  for (const d of committedDefenders) {
    setTarget(d, input.mark.x + input.attackDir * 0.5, input.mark.y);
  }
  // Reform: uncommitted defenders fold back to the line standOff in front of the
  // mark; uncommitted attackers reset to a support depth behind the mark. These
  // are placeholder reform targets (full pods/line model are WP2/WP5) — enough
  // that the persistent World visibly reshapes between breakdown and next carry.
  const defBase = input.defendSide === 'home' ? 0 : AGENTS_PER_SIDE;
  for (let i = 0; i < AGENTS_PER_SIDE; i++) {
    const d = world.agents[defBase + i];
    if (d.role === 'empty' || committed.has(d)) continue;
    // Fold toward the line just in front of the mark, holding the defender's
    // current lateral channel so the line spreads naturally.
    setTarget(d, input.mark.x + input.attackDir * 3.0, d.pos.y);
  }
  const attBase = input.attackSide === 'home' ? 0 : AGENTS_PER_SIDE;
  for (let i = 0; i < AGENTS_PER_SIDE; i++) {
    const a = world.agents[attBase + i];
    if (a.role === 'empty' || committed.has(a) || a.slot === input.carrierSlot) continue;
    // Reset to support depth behind the mark on the attacker's own side.
    setTarget(a, input.mark.x - input.attackDir * 6.0, a.pos.y);
  }
}

function setTarget(agent: Agent, x: number, y: number): void {
  if (agent.intent.target) {
    agent.intent.target.x = clampX(x);
    agent.intent.target.y = clampY(y);
  } else {
    agent.intent.target = { x: clampX(x), y: clampY(y) };
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clampX(v: number): number {
  return v < 2 ? 2 : v > 98 ? 98 : v;
}
function clampY(v: number): number {
  return v < 3 ? 3 : v > 97 ? 97 : v;
}
