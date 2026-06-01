// Build a matchday RawTeamInput from the persistent career roster.
//
// Team identity (name, color, stadium, suggestedTactics) comes from the
// `teamJson` argument — these are immutable per-club facts that live in
// the JSON. Player data (id 1-N by slot, baseStats, position) is resolved
// from `state.career.roster` via the per-club `ClubState.squad` rosterId
// pointer list. Each RawPlayer carries its `rosterId` so
// MatchCoordinator.initPlayer can attach it to the matchday Player; the
// matchday `id` (1-23) stays a slot number.
//
// Convention: ClubState.squad is ordered starters-first (slots 1-15),
// bench (16-23), wider squad (24+). PreMatchScreen's saved matchday
// selection (applyMatchdaySquad) reorders this for the player's team;
// the AI side always uses the canonical order.
//
// Pure: no RNG, no mutation. Idempotent.

import type { GameState } from '../types/gameState';
import type { Player } from '../types/player';
import type { RawPlayer, RawTeamInput } from '../types/teamData';
import { selectBestMatchdaySquad } from './autoSelect';
import { selectionUnavailableIds } from './internationalDutyEngine';
import { computeFormInputs } from './playerForm';
import { DISCIPLINE_COUNSEL } from '../engine/balance';

export function buildTeamFromRoster(
  state: GameState,
  teamJson: RawTeamInput,
  // Extra rosterIds to treat as unavailable on top of selectionUnavailableIds
  // (injured + PGA-rest + Lions). The cup path passes its international-duty
  // set here so on-duty players sink to the wider squad and never fill a
  // matchday slot when the team is built via this fallback.
  extraUnavailable?: ReadonlySet<number>,
): RawTeamInput {
  const club = state.career.clubs.find(c => c.id === teamJson.id);
  if (!club) return teamJson;

  // Stable partition: available players first (in club.squad order), then
  // injured / rest-obligated last. Slots are assigned 1..N over the
  // partitioned list, so unavailable players sink to the wider-squad section
  // and the auto-built 23 only contains available players.
  const unavailable = selectionUnavailableIds(state, teamJson.id);
  if (extraUnavailable) for (const rid of extraUnavailable) unavailable.add(rid);
  const fit: number[] = [];
  const injured: number[] = [];
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (p?.injury || unavailable.has(rid)) injured.push(rid);
    else fit.push(rid);
  }
  const ordered = [...fit, ...injured];

  const rosterPlayers = ordered.map((rid, idx) => {
    const p = state.career.roster[rid];
    if (!p) return null;
    return rawFromRosterPlayer(state, p, idx + 1);
  }).filter((p): p is RawPlayer => p !== null);

  return {
    ...teamJson,
    players: rosterPlayers.slice(0, 15),
    bench:   rosterPlayers.slice(15, 23),
    squad:   rosterPlayers.slice(23),
  };
}

// Auto-selected variant: orders the matchday 23 by best-OVR-per-position
// using src/game/autoSelect.ts. Slots 24+ (wider squad) hold every other
// roster member in club.squad order. Used by the silent AI fixture path
// so AI teams always field their strongest available 23, with positional
// cover honoured by the SLOT_SPECS table.
//
// Falls back to buildTeamFromRoster if the club has fewer than 23 fit
// players (selectBestMatchdaySquad returns a short list in that case).
export function buildAutoSelectedTeamFromRoster(
  state: GameState,
  teamJson: RawTeamInput,
): RawTeamInput {
  const club = state.career.clubs.find(c => c.id === teamJson.id);
  if (!club) return teamJson;

  const unavailable = selectionUnavailableIds(state, teamJson.id);
  const selected = selectBestMatchdaySquad(state.career.roster, club.squad, unavailable);
  if (selected.length !== 23) return buildTeamFromRoster(state, teamJson);

  const used = new Set(selected);
  const remaining = club.squad.filter(rid => !used.has(rid));
  return assembleTeam(state, teamJson, [...selected, ...remaining]);
}

// Cup variant: builds the strongest available 23 for a Prem Cup fixture,
// excluding players on international duty (set during the break) on top of
// the usual injured / rest-obligated exclusions. `restRosterIds` (the
// user's first-choice XV in "rest the starters" mode) are additionally
// held out — but if that leaves fewer than 23 fit players the restriction
// is dropped so the club still fields a valid team rather than a short one.
export function buildCupTeamFromRoster(
  state: GameState,
  teamJson: RawTeamInput,
  restRosterIds?: readonly number[],
): RawTeamInput {
  const club = state.career.clubs.find(c => c.id === teamJson.id);
  if (!club) return teamJson;

  const base = new Set(selectionUnavailableIds(state, teamJson.id));
  for (const rid of club.squad) {
    if (state.career.roster[rid]?.internationalDuty) base.add(rid);
  }
  const withRest = new Set(base);
  if (restRosterIds) for (const rid of restRosterIds) withRest.add(rid);

  let selected = selectBestMatchdaySquad(state.career.roster, club.squad, withRest);
  if (selected.length !== 23 && restRosterIds && restRosterIds.length > 0) {
    // Resting the first-choice XV left the bench too thin — field the best
    // available (including some starters) rather than an incomplete 23.
    selected = selectBestMatchdaySquad(state.career.roster, club.squad, base);
  }
  // Thin-squad fallback: pass `base` (which includes international-duty
  // players) so the partition still excludes them — an on-duty player must
  // never be fielded in a cup match even when the available pool is short.
  if (selected.length !== 23) return buildTeamFromRoster(state, teamJson, base);

  const used = new Set(selected);
  const remaining = club.squad.filter(rid => !used.has(rid));
  return assembleTeam(state, teamJson, [...selected, ...remaining]);
}

// Assemble a RawTeamInput from an ordered rosterId list: slots 1-15
// starters, 16-23 bench, 24+ wider squad.
function assembleTeam(state: GameState, teamJson: RawTeamInput, ordered: number[]): RawTeamInput {
  const rosterPlayers = ordered.map((rid, idx) => {
    const p = state.career.roster[rid];
    if (!p) return null;
    return rawFromRosterPlayer(state, p, idx + 1);
  }).filter((p): p is RawPlayer => p !== null);

  return {
    ...teamJson,
    players: rosterPlayers.slice(0, 15),
    bench:   rosterPlayers.slice(15, 23),
    squad:   rosterPlayers.slice(23),
  };
}

function rawFromRosterPlayer(state: GameState, p: Player, slot: number): RawPlayer {
  const { bias, volatility } = computeFormInputs(state, p);
  const baseStats = { ...p.baseStats };
  // Discipline counselling — apply the temporary modifier to the baseStats clone
  // so the effect survives StaminaSystem's per-tick currentStats re-derive from baseStats.
  if (p.disciplineAdvice?.mode === 'ease_off' && state.calendar.week <= p.disciplineAdvice.expiresAfterRound) {
    baseStats.discipline = Math.min(100, baseStats.discipline + DISCIPLINE_COUNSEL.disciplineBoost);
    baseStats.tackling   = Math.max(1,   baseStats.tackling   + DISCIPLINE_COUNSEL.tacklingPenalty);
  }
  return {
    id: slot,
    rosterId: p.rosterId,
    squadNumber: slot,
    firstName: p.firstName,
    lastName: p.lastName,
    dob: p.dob,
    nationality: p.nationality,
    position: p.position,
    baseStats,
    condition: p.condition,
    formBias: bias,
    formVolatility: volatility,
  };
}
