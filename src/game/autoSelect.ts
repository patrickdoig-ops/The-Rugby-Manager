// Matchday-squad auto-selection.
//
// Two pure exports, both deterministic and RNG-free:
//
//   - selectBestMatchdaySquad(roster, clubSquadIds): full auto-pick. For
//     each of the 23 jersey slots, picks the highest-OVR fit player whose
//     position matches the slot (primary first, then fallback chain).
//     Used by the silent AI fixture path on every match week so the AI
//     always fields its best available 23 — and the matchday lineup
//     reflects evolving rosters across seasons.
//
//   - repairInjuredMatchdaySquad(currentRosterIds, roster, clubSquadIds):
//     surgical injury swap. Walks the current 23; keeps every fit player
//     locked in their slot; for each injured slot, picks the best
//     same-position replacement from the wider club roster using the
//     same SLOT_SPECS table. Used by the human pre-match path so the
//     manager's curated selection is preserved on every fit slot and
//     only the unavailable players get auto-swapped.
//
// Future hook: selectBestMatchdaySquad is also the intended engine for a
// human-facing "Auto-Select" button (in PreMatchScreen or
// SquadManagementScreen). See docs/game-engine.md § "Auto-selection".
//
// Both functions return rosterId arrays in slot order (1..23). The
// PlayerRef[] ↔ rosterId[] conversion happens at the persistence
// boundary in playerSquad.ts.

import type { Player, Position } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';

interface SlotSpec {
  slot: number;
  primary: Position;
  fallback: Position[];
}

// Position-by-slot convention (matches the team JSON shape and the
// roster-seed convention in rosterTeamBuilder.ts):
//   Starting XV — 1/3 Prop, 2 Hooker, 4-5 Lock, 6-7 Flanker, 8 Number 8,
//                 9 Scrum-Half, 10 Fly-Half, 11/14 Wing, 12-13 Centre,
//                 15 Fullback.
//   Bench       — 5 forwards / 3 backs split (real-world matchday norm):
//                 16 Hooker, 17-18 Prop, 19 Lock, 20 Flanker,
//                 21 Scrum-Half, 22 Fly-Half, 23 Wing.
//
// Fallback chains let the picker drop down a tier when no specialist
// is available (Back Row covers Flanker/Number 8; Utility Back covers
// any back slot). The last-resort "any remaining player by OVR" branch
// lives in pickForSlot and only triggers when every listed position is
// exhausted.
export const SLOT_SPECS: readonly SlotSpec[] = [
  { slot: 1,  primary: 'Prop',       fallback: [] },
  { slot: 2,  primary: 'Hooker',     fallback: [] },
  { slot: 3,  primary: 'Prop',       fallback: [] },
  { slot: 4,  primary: 'Lock',       fallback: [] },
  { slot: 5,  primary: 'Lock',       fallback: [] },
  { slot: 6,  primary: 'Flanker',    fallback: ['Back Row'] },
  { slot: 7,  primary: 'Flanker',    fallback: ['Back Row'] },
  { slot: 8,  primary: 'Number 8',   fallback: ['Back Row', 'Flanker'] },
  { slot: 9,  primary: 'Scrum-Half', fallback: [] },
  { slot: 10, primary: 'Fly-Half',   fallback: ['Utility Back'] },
  { slot: 11, primary: 'Wing',       fallback: ['Utility Back'] },
  { slot: 12, primary: 'Centre',     fallback: ['Utility Back'] },
  { slot: 13, primary: 'Centre',     fallback: ['Utility Back'] },
  { slot: 14, primary: 'Wing',       fallback: ['Utility Back'] },
  { slot: 15, primary: 'Fullback',   fallback: ['Utility Back'] },
  { slot: 16, primary: 'Hooker',     fallback: [] },
  { slot: 17, primary: 'Prop',       fallback: [] },
  { slot: 18, primary: 'Prop',       fallback: [] },
  { slot: 19, primary: 'Lock',       fallback: [] },
  { slot: 20, primary: 'Flanker',    fallback: ['Back Row', 'Number 8'] },
  { slot: 21, primary: 'Scrum-Half', fallback: [] },
  { slot: 22, primary: 'Fly-Half',   fallback: ['Utility Back', 'Centre'] },
  { slot: 23, primary: 'Wing',       fallback: ['Utility Back', 'Fullback', 'Centre'] },
];

interface Ranked {
  rosterId: number;
  position: Position;
  ovr: number;
}

function rankFit(
  roster: Record<number, Player>,
  clubSquadIds: number[],
  unavailableIds?: ReadonlySet<number>,
): Ranked[] {
  const out: Ranked[] = [];
  for (const rid of clubSquadIds) {
    const p = roster[rid];
    if (!p || p.injury || unavailableIds?.has(rid)) continue;
    out.push({
      rosterId: rid,
      position: p.position,
      ovr: playerOverall(p.baseStats, p.position),
    });
  }
  return out;
}

// Higher OVR wins; ties broken by lower rosterId (stable, deterministic).
function isBetter(a: Ranked, b: Ranked | null): boolean {
  if (!b) return true;
  if (a.ovr !== b.ovr) return a.ovr > b.ovr;
  return a.rosterId < b.rosterId;
}

function pickForSlot(
  spec: SlotSpec,
  pool: Ranked[],
  used: Set<number>,
): Ranked | null {
  for (const pos of [spec.primary, ...spec.fallback]) {
    let best: Ranked | null = null;
    for (const p of pool) {
      if (used.has(p.rosterId)) continue;
      if (p.position !== pos) continue;
      if (isBetter(p, best)) best = p;
    }
    if (best) return best;
  }
  // Last-resort fallback: take any remaining player by OVR.
  let best: Ranked | null = null;
  for (const p of pool) {
    if (used.has(p.rosterId)) continue;
    if (isBetter(p, best)) best = p;
  }
  return best;
}

// Returns up to 23 rosterIds in slot order (1..23). Walks SLOT_SPECS
// greedily; for each slot picks the best fit candidate at the primary
// position, then drops through the fallback chain. Returns fewer than
// 23 entries only if the fit pool is exhausted — callers should treat
// that as "auto-select infeasible" and fall back to their default
// auto-build.
export function selectBestMatchdaySquad(
  roster: Record<number, Player>,
  clubSquadIds: number[],
  unavailableIds?: ReadonlySet<number>,
): number[] {
  const pool = rankFit(roster, clubSquadIds, unavailableIds);
  const used = new Set<number>();
  const result: number[] = [];
  for (const spec of SLOT_SPECS) {
    const pick = pickForSlot(spec, pool, used);
    if (!pick) break;
    result.push(pick.rosterId);
    used.add(pick.rosterId);
  }
  return result;
}

// Surgical swap: keeps every fit player in their existing slot; for
// each slot whose current occupant is injured (or missing from the
// roster), picks the best same-position replacement from the wider
// club squad.
//
// Returns a 23-length array. Any slot that couldn't be repaired (no
// eligible replacement) holds the original rosterId — callers that
// care about that edge case should re-check fit-ness on the result.
// If the input isn't already a length-23 array, falls through to
// selectBestMatchdaySquad.
export function repairInjuredMatchdaySquad(
  currentRosterIds: number[],
  roster: Record<number, Player>,
  clubSquadIds: number[],
  unavailableIds?: ReadonlySet<number>,
): number[] {
  if (currentRosterIds.length !== 23) {
    return selectBestMatchdaySquad(roster, clubSquadIds, unavailableIds);
  }

  const used = new Set<number>();
  const result: number[] = new Array(23);
  const needs: number[] = [];

  for (let i = 0; i < 23; i++) {
    const rid = currentRosterIds[i];
    const p = roster[rid];
    if (p && !p.injury && !unavailableIds?.has(rid)) {
      result[i] = rid;
      used.add(rid);
    } else {
      needs.push(i);
    }
  }

  if (needs.length === 0) return result;

  const pool = rankFit(roster, clubSquadIds, unavailableIds);
  for (const idx of needs) {
    const pick = pickForSlot(SLOT_SPECS[idx], pool, used);
    if (pick) {
      result[idx] = pick.rosterId;
      used.add(pick.rosterId);
    } else {
      // No replacement found — leave the original (likely injured)
      // rosterId so downstream code surfaces the gap visibly rather
      // than silently dropping a slot.
      result[idx] = currentRosterIds[idx];
    }
  }
  return result;
}
