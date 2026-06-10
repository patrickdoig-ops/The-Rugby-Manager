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
// Squad-selection exclusion (mustRestThisRound / lionsUnavailable rolled into
// selectionUnavailableIds) and the per-round obligation reconciliation
// (reconcileRestObligations) live here too.

import type { GameState, SeasonEvent } from '../types/gameState';
import type { Player, InternationalWindow, PlayerStats } from '../types/player';
import { isForward } from '../types/player';
import type { InternationalBreakSummary, InternationalCallUpResult, ForwardsFocus, BacksFocus } from '../types/training';
import {
  INTERNATIONAL_WINDOWS, NATIONS, INTERNATIONAL_LOAD,
  INTERNATIONAL_INJURY_KINDS, PGA_REST_NATION,
  LIONS_RETURN_CONDITION, LIONS_RETURN_CONDITION_NOISE, LIONS_RETURN_ROUND,
  SUMMER_TOUR_RETURN_CONDITION, SUMMER_TOUR_RETURN_CONDITION_NOISE,
  SUMMER_TOUR_NATIONS,
} from '../engine/balance/international';
import { INJURY_SEVERITY } from '../engine/balance/injuries';
import {
  BACKS_FOCUS_STATS, FORWARDS_FOCUS_STATS,
  INTENSITY_EFFECTS, ageMultiplier,
} from '../engine/balance/training';
import { rollDevelopmentGains } from './trainingWeek';
import { pickSeverity } from './injuryEffects';
import { proximityMultiplier } from '../engine/balance/career';
import { getAge, parseSeasonStartYear, seasonOpenIso } from './age';
import { playerOverall } from '../engine/RatingEngine';
import { rngTransfer, rngTransferRaw } from '../utils/rng';
import { LIONS_2025_TOURISTS } from '../data/lions-2025';
import {
  ENGLAND_SUMMER_2025_TOURISTS,
  WALES_SUMMER_2025_TOURISTS,
} from '../data/summer-tour-2025';

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
  const seasonOpen = seasonOpenIso(parseSeasonStartYear(state.calendar.seasonLabel));
  const campDevChance = INTENSITY_EFFECTS.high.developmentChance;
  const fwdFocusKeys = Object.keys(FORWARDS_FOCUS_STATS) as ForwardsFocus[];
  const bckFocusKeys = Object.keys(BACKS_FOCUS_STATS) as BacksFocus[];

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

    // 4) Camp training — high-intensity, one random focus per week from the
    //    player's position group. No injury risk (international match injuries
    //    model that already) and no decay (every skill is used at elite level).
    const forward = isForward(p.position);
    const focusKeys = forward ? fwdFocusKeys : bckFocusKeys;
    const ageMul = ageMultiplier(p.dob ? (getAge(p.dob, seasonOpen) ?? 25) : 25);
    const proxMul = proximityMultiplier(p.potential, playerOverall(p.baseStats, p.position));
    const campStatDeltas: Partial<PlayerStats> = {};

    for (let week = 0; week < spec.tests; week++) {
      const focusIdx = Math.floor(rngTransferRaw() * focusKeys.length);
      const focus = forward
        ? FORWARDS_FOCUS_STATS[focusKeys[focusIdx] as ForwardsFocus]
        : BACKS_FOCUS_STATS[focusKeys[focusIdx] as BacksFocus];
      rollDevelopmentGains(campStatDeltas, focus, campDevChance, ageMul, proxMul);
    }

    if (Object.keys(campStatDeltas).length > 0) {
      events.push({
        type: 'PLAYER_TRAINED',
        rosterId: c.rosterId,
        conditionDelta: 0,
        statDeltas: campStatDeltas,
      });
    }

    // 5) PGA rest obligation — England heavy-load only. Human clubs get the
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
      statDeltas: campStatDeltas,
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

// True while a 2025 B&I Lions tourist is serving their post-tour stand-down
// (unavailable for selection until `lionsReturnRound`).
export function lionsUnavailable(p: Player, week: number): boolean {
  return p.lionsReturnRound !== undefined && week < p.lionsReturnRound;
}

// rosterIds in a club's squad who are unavailable for selection this round by
// policy (PGA forced rest after international duty, or a Lions post-tour
// stand-down). Treated exactly like injured players by the squad builders /
// repair / display predicates. Injury itself is checked separately (p.injury).
export function selectionUnavailableIds(state: GameState, clubId: string): Set<number> {
  const out = new Set<number>();
  const club = state.career.clubs.find(c => c.id === clubId);
  if (!club) return out;
  const week = state.calendar.week;
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (p && (mustRestThisRound(p, state) || lionsUnavailable(p, week) || isSuspended(p, week))) out.add(rid);
  }
  return out;
}

function isSuspended(p: Player, week: number): boolean {
  return !!(p.suspension && p.suspension.forRound === week);
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
    // Fail closed for the human club when the matchday squad is unknown (no
    // squad persisted / name-mapping failed → empty set): we can't tell who
    // featured, so don't resolve here. A real persisted 23 always yields a
    // non-empty set; the forced rest on the final round + the post-window
    // safety net above still guarantee the obligation eventually clears.
    const rested = isHuman
      ? (humanMatchdayIds.size > 0 && !humanMatchdayIds.has(rid))
      : round === Math.min(...ob.eligibleRounds);
    if (rested) out.push({ type: 'REST_OBLIGATION_RESOLVED', rosterId: rid });
  }
  return out;
}

// ===== B&I Lions 2025 season-open seeding =====

// Name-matches LIONS_2025_TOURISTS against the seeded roster and returns a
// LIONS_RETURN_SET per match, marking each tourist as on post-tour stand-down
// until LIONS_RETURN_ROUND and seeding a per-player return condition centred on
// LIONS_RETURN_CONDITION with ±LIONS_RETURN_CONDITION_NOISE of rngTransfer
// spread. Walked rosterId-ascending so the roll sequence is reproducible.
// One-shot at the 2025/26 season open.
export function lionsReturnEvents(state: GameState): SeasonEvent[] {
  const wanted = new Set(LIONS_2025_TOURISTS.map(l => `${l.firstName}|${l.lastName}`.toLowerCase()));
  const out: SeasonEvent[] = [];
  const ids = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of ids) {
    const p = state.career.roster[rid];
    if (wanted.has(`${p.firstName}|${p.lastName}`.toLowerCase())) {
      const condition = clamp(
        LIONS_RETURN_CONDITION + rngTransfer(-LIONS_RETURN_CONDITION_NOISE, LIONS_RETURN_CONDITION_NOISE),
        0, 100,
      );
      out.push({
        type: 'LIONS_RETURN_SET',
        rosterId: rid,
        availableFromRound: LIONS_RETURN_ROUND,
        condition,
      });
    }
  }
  return out;
}

// ===== England & Wales summer tour 2025 season-open seeding =====

// Name-matches England and Wales summer-tour players against the seeded roster
// Emits SUMMER_TOUR_RETURN_SET per touring player at season open.
// 2025/26: name-matches the curated real-world tour lists for accuracy.
// 2026+:   dynamically selects top-N Premiership players per nation by OVR,
//          mirroring the selectInternationalSquads pattern. Walked
//          rosterId-ascending so the roll sequence is reproducible.
export function summerTourReturnEvents(state: GameState): SeasonEvent[] {
  const seasonStartYear = parseSeasonStartYear(state.calendar.seasonLabel);
  const wantedIds = seasonStartYear === 2025
    ? hardcodedSummerTourIds(state)
    : dynamicSummerTourIds(state);

  const out: SeasonEvent[] = [];
  const ids = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
  for (const rid of ids) {
    if (!wantedIds.has(rid)) continue;
    const condition = clamp(
      SUMMER_TOUR_RETURN_CONDITION + rngTransfer(-SUMMER_TOUR_RETURN_CONDITION_NOISE, SUMMER_TOUR_RETURN_CONDITION_NOISE),
      0, 100,
    );
    out.push({ type: 'SUMMER_TOUR_RETURN_SET', rosterId: rid, condition });
  }
  return out;
}

// 2025/26: match the curated name lists for the real England & Wales summer tours.
function hardcodedSummerTourIds(state: GameState): Set<number> {
  const allTourists = [...ENGLAND_SUMMER_2025_TOURISTS, ...WALES_SUMMER_2025_TOURISTS];
  const wanted = new Set(allTourists.map(t => `${t.firstName}|${t.lastName}`.toLowerCase()));
  const out = new Set<number>();
  for (const [rid, p] of Object.entries(state.career.roster)) {
    if (p && wanted.has(`${p.firstName}|${p.lastName}`.toLowerCase())) out.add(Number(rid));
  }
  return out;
}

// 2026+: top Premiership-based England/Wales players by OVR. Skips injured
// players (mirrors selectInternationalSquads). No Lions exclusion needed until
// the 2029 tour is in scope.
function dynamicSummerTourIds(state: GameState): Set<number> {
  const rostered = new Set<number>();
  for (const club of state.career.clubs) for (const rid of club.squad) rostered.add(rid);

  const nationKeys = Object.keys(SUMMER_TOUR_NATIONS);
  const byNation = new Map<string, { rid: number; ovr: number }[]>();
  for (const rid of rostered) {
    const p = state.career.roster[rid];
    if (!p || p.injury) continue;
    const nat = p.nationality.toLowerCase();
    const key = nationKeys.find(k => SUMMER_TOUR_NATIONS[k].aliases.some(a => a.toLowerCase() === nat));
    if (!key) continue;
    let pool = byNation.get(key);
    if (!pool) { pool = []; byNation.set(key, pool); }
    pool.push({ rid, ovr: playerOverall(p.baseStats, p.position) });
  }

  const out = new Set<number>();
  for (const key of nationKeys) {
    const pool = byNation.get(key) ?? [];
    pool.sort((a, b) => b.ovr - a.ovr || a.rid - b.rid);
    for (const { rid } of pool.slice(0, SUMMER_TOUR_NATIONS[key].squadCap)) out.add(rid);
  }
  return out;
}

// Returns rosterIds for summer-tour players in a club's squad. Uses the
// summerTourReturn flag set by SUMMER_TOUR_RETURN_SET (already applied before
// runPreSeasonBlock runs), so it works regardless of how players were selected
// (hardcoded 2025 names or dynamic OVR-based for year 2+).
export function getSummerTourRosterIds(state: GameState, clubId: string): Set<number> {
  const club = state.career.clubs.find(c => c.id === clubId);
  if (!club) return new Set();
  const out = new Set<number>();
  for (const rid of club.squad) {
    if (state.career.roster[rid]?.summerTourReturn) out.add(rid);
  }
  return out;
}

// Returns the set of rosterIds for England summer-tour players in the managed
// club's squad. Used by runPreSeasonBlock to exclude them from leg-0 cup
// selection (England players were not permitted to play pre-season cup rounds
// by agreement). Computed fresh each call — no state mutation.
export function getEnglandSummerTourRosterIds(state: GameState, clubId: string): Set<number> {
  const wanted = new Set(ENGLAND_SUMMER_2025_TOURISTS.map(t => `${t.firstName}|${t.lastName}`.toLowerCase()));
  const club = state.career.clubs.find(c => c.id === clubId);
  if (!club) return new Set();
  const out = new Set<number>();
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (p && wanted.has(`${p.firstName}|${p.lastName}`.toLowerCase())) out.add(rid);
  }
  return out;
}
