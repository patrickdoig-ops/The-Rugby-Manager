// International Duty engine — deterministic, self-sustaining selection of
// national squads from the live rosters, plus the load / return / rest model.
//
// Pure builders (mirroring careerRollover / trainingWeek): each reads the
// current GameState and returns a SeasonEvent[]; GameCoordinator routes them
// through applySeasonEvent. RNG flows through the career stream (rngTransfer);
// stable iteration order (nation order, then rosterId-ascending) keeps the
// call sequence reproducible.
//
// Flow at an international break (Round 6 / Round 11), driven from
// GameCoordinator.applyTrainingBlock:
//   1. selectInternationalSquads → CallUp[] (pure, RNG-free, top-OVR per nation).
//   2. buildCallUpEvents → PLAYER_CALLED_UP per player (sets the transient
//      internationalDuty flag so the break's training block skips them).
//   3. (training block runs — internationals get no club training)
//   4. resolveInternationalBreak → PLAYER_RETURNED_FROM_DUTY (+ PLAYER_INJURED)
//      per player, plus an InternationalBreakSummary for the break screen.
//
// Squad-selection exclusion (mustRestThisRound / restUnavailableIds) and the
// per-round obligation reconciliation (reconcileRestObligations) live here too.

import type { GameState, SeasonEvent } from '../types/gameState';
import type { Player, InternationalWindow } from '../types/player';
import type { InternationalBreakSummary, InternationalCallUpResult } from '../types/training';
import {
  INTERNATIONAL_WINDOWS, NATIONS, INTERNATIONAL_LOAD,
  INTERNATIONAL_INJURY_KINDS, PGA_REST_NATION, LIONS_RETURN_CONDITION,
} from '../engine/balance/international';
import { INJURY_SEVERITY } from '../engine/balance/injuries';
import type { InjurySeverity } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import { rngTransfer, rngTransferRaw } from '../utils/rng';
import { LIONS_2025_TOURISTS } from '../data/lions-2025';

export interface CallUp {
  rosterId: number;
  nation: string;        // NATIONS key
  selectionRank: number; // 1 = first choice within the nation
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ===== Break detection =====

// Returns the international window the calendar has just advanced into (the
// player's upcoming round equals a window's return round), or null. Called
// from applyTrainingBlock, where calendar.week === the post-break round.
export function isInternationalBreak(state: GameState): InternationalWindow | null {
  const round = state.calendar.week;
  for (const key of Object.keys(INTERNATIONAL_WINDOWS) as InternationalWindow[]) {
    if (INTERNATIONAL_WINDOWS[key].returnRound === round) return key;
  }
  return null;
}

// ===== Selection (pure, RNG-free) =====

function nationKeyForPlayer(p: Player, nations: string[]): string | null {
  const nat = p.nationality.toLowerCase();
  for (const key of nations) {
    if (NATIONS[key].aliases.some(a => a.toLowerCase() === nat)) return key;
  }
  return null;
}

// Top-OVR-per-nation selection from every rostered player (those in a club
// squad). Above the per-nation OVR threshold, sorted OVR-desc (tie-break
// rosterId-asc), capped at the nation's squadCap. Returns call-ups sorted
// rosterId-ascending so the downstream resolve RNG order is stable.
export function selectInternationalSquads(state: GameState, window: InternationalWindow): CallUp[] {
  const spec = INTERNATIONAL_WINDOWS[window];

  const rostered = new Set<number>();
  for (const club of state.career.clubs) for (const rid of club.squad) rostered.add(rid);

  const byNation = new Map<string, { rid: number; ovr: number }[]>();
  for (const rid of rostered) {
    const p = state.career.roster[rid];
    if (!p) continue;
    // Injured players aren't called up — they're already unavailable, and a
    // call-up would otherwise overwrite their condition / existing injury.
    if (p.injury) continue;
    const nationKey = nationKeyForPlayer(p, spec.nations);
    if (!nationKey) continue;
    const ovr = playerOverall(p.baseStats, p.position);
    if (ovr < NATIONS[nationKey].ovrThreshold) continue;
    let pool = byNation.get(nationKey);
    if (!pool) { pool = []; byNation.set(nationKey, pool); }
    pool.push({ rid, ovr });
  }

  const callUps: CallUp[] = [];
  for (const nationKey of spec.nations) {
    const pool = byNation.get(nationKey);
    if (!pool) continue;
    pool.sort((a, b) => (b.ovr - a.ovr) || (a.rid - b.rid));
    pool.slice(0, NATIONS[nationKey].squadCap).forEach((entry, i) => {
      callUps.push({ rosterId: entry.rid, nation: nationKey, selectionRank: i + 1 });
    });
  }

  callUps.sort((a, b) => a.rosterId - b.rosterId);
  return callUps;
}

export function buildCallUpEvents(callUps: CallUp[], window: InternationalWindow): SeasonEvent[] {
  return callUps.map(c => ({
    type: 'PLAYER_CALLED_UP' as const,
    rosterId: c.rosterId,
    window,
    selectionRank: c.selectionRank,
  }));
}

// ===== Resolution (RNG via rngTransfer) =====

function pickSeverity(weights: Record<InjurySeverity, number>): InjurySeverity {
  const roll = rngTransfer(1, 100);
  if (roll <= weights.mild) return 'mild';
  if (roll <= weights.mild + weights.moderate) return 'moderate';
  return 'severe';
}

// Resolves every call-up's block outcome: appearances, return condition,
// possible injury, and (England heavy-load only) a rest obligation. Walks the
// call-ups in rosterId order (already sorted by selectInternationalSquads) so
// the rngTransfer sequence is deterministic. Reads players from the roster —
// the transient internationalDuty flag set by PLAYER_CALLED_UP is irrelevant
// here. Returns the events to apply plus the break summary for the UI.
export function resolveInternationalBreak(
  state: GameState,
  callUps: CallUp[],
  window: InternationalWindow,
): { events: SeasonEvent[]; summary: InternationalBreakSummary } {
  const spec = INTERNATIONAL_WINDOWS[window];
  const L = INTERNATIONAL_LOAD;
  const injuredOn = state.calendar.date;
  const playerTeamId = state.player.teamId;

  const events: SeasonEvent[] = [];
  const results: InternationalCallUpResult[] = [];

  for (const c of callUps) {
    const p = state.career.roster[c.rosterId];
    if (!p) continue;

    // 1) Minutes share by selection rank, with jitter.
    const minutesPct = clamp(
      L.topMinutesPct - (c.selectionRank - 1) * L.minutesDropPerRank + (rngTransferRaw() * 2 - 1) * L.minutesNoise,
      L.minMinutesPct, 1,
    );
    const appearances = Math.max(1, Math.round(minutesPct * spec.tests));

    // 2) Return condition (set, not add).
    const condition = Math.round(clamp(
      100 - L.conditionPenaltyAtFullLoad * minutesPct + (rngTransferRaw() * 2 - 1) * L.conditionNoise,
      L.conditionFloor, L.conditionCeil,
    ));

    // 3) Injury roll (chance scales with minutes).
    let injured = false;
    if (rngTransferRaw() < L.injuryChanceAtFullLoad * minutesPct) {
      injured = true;
      const kind = INTERNATIONAL_INJURY_KINDS[rngTransfer(0, INTERNATIONAL_INJURY_KINDS.length - 1)];
      const profile = INJURY_SEVERITY[kind];
      const severity = pickSeverity(profile.weights);
      const [lo, hi] = profile.bands[severity];
      events.push({
        type: 'PLAYER_INJURED',
        rosterId: c.rosterId,
        kind,
        severity,
        weeksRemaining: rngTransfer(lo, hi),
        injuredOn,
        isRecurrence: false,
      });
    }

    // 4) PGA rest obligation — England heavy-load only. Human clubs get the
    //    full 3-round window to choose from; AI clubs get a single round
    //    (force-rested at the return round).
    let restObligated = false;
    let restEligibleRounds: number[] | undefined;
    if (c.nation === PGA_REST_NATION && minutesPct >= L.restMinutesThreshold) {
      restObligated = true;
      const isHuman = p.contract.clubId === playerTeamId;
      restEligibleRounds = isHuman
        ? Array.from({ length: spec.restWindowRounds }, (_, i) => spec.returnRound + i)
        : [spec.returnRound];
    }

    events.push({
      type: 'PLAYER_RETURNED_FROM_DUTY',
      rosterId: c.rosterId,
      window,
      condition,
      ...(restEligibleRounds ? { restEligibleRounds } : {}),
    });

    results.push({
      rosterId: c.rosterId,
      firstName: p.firstName,
      lastName: p.lastName,
      clubId: p.contract.clubId,
      nation: c.nation,
      appearances,
      conditionAfter: condition,
      injured,
      restObligated,
    });
  }

  return { events, summary: { window, callUps: results } };
}

// ===== Rest-obligation availability + reconciliation =====

// True when the player must be force-rested in the current round: their
// obligation includes this round and it's the trigger round (the *last*
// eligible round for a human club — last chance to comply; the *first* for an
// AI club — auto-rest at the return round). Drives squad-selection exclusion.
export function mustRestThisRound(p: Player, state: GameState): boolean {
  const ob = p.restObligation;
  if (!ob || ob.eligibleRounds.length === 0) return false;
  const round = state.calendar.week;
  if (!ob.eligibleRounds.includes(round)) return false;
  const isHuman = p.contract.clubId === state.player.teamId;
  const trigger = isHuman ? Math.max(...ob.eligibleRounds) : Math.min(...ob.eligibleRounds);
  return round === trigger;
}

// rosterIds in a club's squad who must be rested this round. Treated exactly
// like injured players by the squad builders / repair / display predicates.
export function restUnavailableIds(state: GameState, clubId: string): Set<number> {
  const out = new Set<number>();
  const club = state.career.clubs.find(c => c.id === clubId);
  if (!club) return out;
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (p && mustRestThisRound(p, state)) out.add(rid);
  }
  return out;
}

// Per-round reconciliation of rest obligations. Called from
// recordPlayerMatchResult AFTER the round's results are recorded but BEFORE
// WEEK_ADVANCED, so state.calendar.week is still the just-played round. A
// player whose obligation covers this round and who did NOT feature (human:
// not in the matchday 23; AI: force-rested at their single eligible round)
// has satisfied the obligation → REST_OBLIGATION_RESOLVED.
export function reconcileRestObligations(state: GameState, humanMatchdayIds: ReadonlySet<number>): SeasonEvent[] {
  const round = state.calendar.week;
  const out: SeasonEvent[] = [];
  const ids = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of ids) {
    const p = state.career.roster[rid];
    const ob = p.restObligation;
    if (!ob) continue;
    // Safety net: once the whole window has passed, drop the obligation even
    // if it was never formally satisfied (e.g. a manual selection override).
    if (round > Math.max(...ob.eligibleRounds)) {
      out.push({ type: 'REST_OBLIGATION_RESOLVED', rosterId: rid });
      continue;
    }
    if (!ob.eligibleRounds.includes(round)) continue;
    const isHuman = p.contract.clubId === state.player.teamId;
    const rested = isHuman ? !humanMatchdayIds.has(rid) : round === Math.min(...ob.eligibleRounds);
    if (rested) out.push({ type: 'REST_OBLIGATION_RESOLVED', rosterId: rid });
  }
  return out;
}

// ===== B&I Lions 2025 season-open seeding =====

// Name-matches LIONS_2025_TOURISTS against the seeded roster and returns a
// PLAYER_CONDITION_UPDATED per match, setting each tourist's starting
// condition to LIONS_RETURN_CONDITION. RNG-free. One-shot at the 2025/26
// season open.
export function lionsConditionEvents(state: GameState): SeasonEvent[] {
  const wanted = new Set(LIONS_2025_TOURISTS.map(l => `${l.firstName}|${l.lastName}`.toLowerCase()));
  const out: SeasonEvent[] = [];
  const ids = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of ids) {
    const p = state.career.roster[rid];
    if (wanted.has(`${p.firstName}|${p.lastName}`.toLowerCase())) {
      out.push({ type: 'PLAYER_CONDITION_UPDATED', rosterId: rid, condition: LIONS_RETURN_CONDITION });
    }
  }
  return out;
}
