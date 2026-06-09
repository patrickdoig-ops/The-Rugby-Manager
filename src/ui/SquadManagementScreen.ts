// Squad management for the player's club. Reached from the Hub's Squad
// tile; back navigates to Hub. Lets the manager curate the matchday 23
// outside of the pre-match flow — filter by position group, compare
// similar players, and swap between Starting XV (slots 1-15), Bench
// (16-23), and the Wider Squad (24+).
//
// **Persistence.** Saves through the same seam as PreMatchScreen —
// `GameCoordinator.setPlayerMatchdaySquad` (PLAYER_MATCHDAY_SQUAD_SET) +
// saveGame. `state.player.matchdaySquad` is the round-trip surface: load
// it here, write it here, PreMatch reads it for its initial lineup, and
// any Kick-Off swap there writes the same field. Open Squad after a
// PreMatch swap → see the swap; save here → PreMatch opens with it.
//
// **Edit model.** Two-tap swap, mirroring PreMatchScreen: tap any row
// (starter, bench, or wider squad) to select; tap any other row visible
// in the current position-filter view to swap. Slots (id / squadNumber)
// stay with the position they belong to — the players are what move.
// Local-edit mode until the user taps "Save Squad"; the back arrow opens
// a discard confirmation if there are pending edits.
//
// Initialised once per page lifetime alongside the other in-season
// screens. `showSquadManagement()` (called from main.ts's onSquad before
// `screenRouter.show`) resets the draft from the latest engine state.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput, RawPlayer } from '../types/teamData';
import type { Position, PlayerInjury, RestObligation } from '../types/player';
import { applyMatchdaySquad, extractMatchdaySquad } from '../game/playerSquad';
import { selectBestMatchdaySquad } from '../game/autoSelect';
import { buildTeamFromRoster } from '../game/rosterTeamBuilder';
import { selectionUnavailableIds } from '../game/internationalDutyEngine';
import { playerOverall } from '../engine/RatingEngine';
import { oopSeverity, oopPenaltyPct, SLOT_POSITION } from '../engine/balance';
import { averageRating } from '../game/seasonLeaderboards';
import { POSITION_GROUPS_ORDER, POSITION_TO_GROUP, type PositionGroupId } from '../game/positionGroups';
import { shortName } from '../utils/playerName';
import { saveGame } from './SaveManager';
import { showToast } from './Toast';
import { eventBus } from '../utils/eventBus';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';
import { discardConfirm } from './components/discardConfirm';
import { playHaptic } from './HapticsManager';
import { helpButtonHtml } from './help/helpButton';

export interface InitSquadManagementOpts {
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
  // Tap player name → profile. Tap anywhere else on the row → two-tap
  // swap (existing behaviour). The link handler stops propagation so
  // these two interactions don't collide.
  onPlayerClick?: (rosterId: number) => void;
}

type Tier = 'starter' | 'bench' | 'squad';

type GroupId = PositionGroupId;
const GROUPS = POSITION_GROUPS_ORDER;
const POSITION_GROUPS = POSITION_TO_GROUP;

function ovrClass(ovr: number): string {
  if (ovr >= 85) return 'ovr-elite';
  if (ovr >= 78) return 'ovr-good';
  if (ovr >= 70) return 'ovr-avg';
  if (ovr >= 62) return 'ovr-poor';
  return 'ovr-veryPoor';
}

// Match-rating colour bands — mirrors MatchResultScreen.ts thresholds so
// the AVR badge here reads identically to the per-match rating column on
// the post-match screen.
function ratingClass(r: number): string {
  if (r >= 7.5) return 'rating-high';
  if (r >= 5.5) return 'rating-mid';
  if (r >= 3.5) return 'rating-low';
  return 'rating-poor';
}

function injuryKindLabel(kind: PlayerInjury['kind']): string {
  switch (kind) {
    case 'knock':           return 'Knock';
    case 'concussion':      return 'Concussion';
    case 'muscle_strain':   return 'Muscle strain';
    case 'ligament_sprain': return 'Ligament sprain';
    case 'knee_cartilage':  return 'Knee cartilage';
    case 'shoulder':        return 'Shoulder';
    case 'fracture':        return 'Fracture';
    case 'laceration':      return 'Laceration';
  }
}

let renderImpl: (() => void) | null = null;
// One-shot back-target override. Cleared after the user navigates back —
// so a future plain showSquadManagement() call falls back to the
// init-time onBack (Hub). The PreMatch flow uses this to bring the user
// back to the line-up step instead of Hub.
let activeOnBack: (() => void) | null = null;

export function showSquadManagement(onBack?: () => void): void {
  activeOnBack = onBack ?? null;
  renderImpl?.();
}

export function initSquadManagementScreen(opts: InitSquadManagementOpts): void {
  const el = document.getElementById('squad-management');
  if (!el) return;

  const teamsById = new Map(opts.allTeams.map(t => [t.id, t]));

  // ── Closure-scoped edit state, reset on every entry (showSquadManagement)
  let draftStarters: RawPlayer[] = [];
  let draftBench:    RawPlayer[] = [];
  let draftSquad:    RawPlayer[] = [];
  let selection: { tier: Tier; squadNum: number } | null = null;
  let activeGroup: GroupId = 'all';
  let dirty = false;
  // Per-row 12-stat expand state. Keyed by `${tier}-${squadNum}` since the
  // row's identity is the slot + tier (rosterId would shift on swap).
  const expandedRows = new Set<string>();
  function expandKey(tier: Tier, squadNum: number): string { return `${tier}-${squadNum}`; }

  // Honour a one-shot back override if showSquadManagement set one,
  // then clear it so the next plain show falls back to the init-time
  // onBack target (Hub).
  function triggerBack(): void {
    const target = activeOnBack ?? opts.onBack;
    activeOnBack = null;
    target();
  }

  function resetDraftFromState(): void {
    const state = opts.getGameEngine().getState();
    const teamJson = teamsById.get(state.player.teamId);
    if (!teamJson) return;
    const fresh = buildTeamFromRoster(state, teamJson);
    const club = state.career.clubs.find(c => c.id === teamJson.id);
    // Selection-unavailable players (forced international-duty rest or a Lions
    // post-tour stand-down) are treated like injury for auto-repair.
    const restUnavailable = club ? selectionUnavailableIds(state, teamJson.id) : undefined;
    const repair = club ? { roster: state.career.roster, clubSquadIds: club.squad, unavailableIds: restUnavailable } : undefined;
    const applied = applyMatchdaySquad(fresh, state.player.matchdaySquad, repair);
    draftStarters = (applied.players as RawPlayer[]).map(p => ({ ...p }));
    draftBench    = ((applied.bench ?? []) as RawPlayer[]).map(p => ({ ...p }));
    draftSquad    = ((applied.squad ?? []) as RawPlayer[]).map(p => ({ ...p }));
    selection = null;
    activeGroup = 'all';
    dirty = false;
    expandedRows.clear();
  }

  // Look up the persistent injury (if any) for a draft row by name. Keys
  // are name pairs because the SquadManagementScreen uses RawPlayer
  // throughout (no rosterId on the draft row type), and full names are
  // unique league-wide.
  function injuryFor(p: { firstName: string; lastName: string }): PlayerInjury | undefined {
    const state = opts.getGameEngine().getState();
    const club = state.career.clubs.find(c => c.id === state.player.teamId);
    if (!club) return undefined;
    for (const rid of club.squad) {
      const r = state.career.roster[rid];
      if (r && r.firstName === p.firstName && r.lastName === p.lastName) return r.injury;
    }
    return undefined;
  }

  // Active PGA rest obligation for a draft row (international duty). Surfaced
  // as a "REST" badge so the manager can plan which window round to sit them.
  function restObligationFor(p: { firstName: string; lastName: string }): RestObligation | undefined {
    const state = opts.getGameEngine().getState();
    const club = state.career.clubs.find(c => c.id === state.player.teamId);
    if (!club) return undefined;
    for (const rid of club.squad) {
      const r = state.career.roster[rid];
      if (r && r.firstName === p.firstName && r.lastName === p.lastName) return r.restObligation;
    }
    return undefined;
  }

  // The Premiership round a 2025 Lions returnee becomes available, if they're
  // still on the post-tour stand-down this round. Surfaced with the same REST
  // pill as the international-duty obligation above.
  function lionsStandDownFor(p: { firstName: string; lastName: string }): number | undefined {
    const state = opts.getGameEngine().getState();
    const club = state.career.clubs.find(c => c.id === state.player.teamId);
    if (!club) return undefined;
    for (const rid of club.squad) {
      const r = state.career.roster[rid];
      if (r && r.firstName === p.firstName && r.lastName === p.lastName) {
        return (r.lionsReturnRound !== undefined && state.calendar.week < r.lionsReturnRound)
          ? r.lionsReturnRound
          : undefined;
      }
    }
    return undefined;
  }

  // Average match rating for a draft-row player. Returns null when the
  // player has no appearances this season — distinguishes "0.0 because
  // untouched" from a genuinely poor rating so the row can render an em
  // dash with no colour band instead of binning into rating-poor.
  function avrFor(p: { rosterId?: number }): number | null {
    if (p.rosterId === undefined) return null;
    const state = opts.getGameEngine().getState();
    const r = state.career.roster[p.rosterId];
    if (!r || r.seasonStats.appearances === 0) return null;
    return averageRating(r.seasonStats);
  }

  function cardsFor(p: { rosterId?: number }): { yellow: number; red: number } {
    if (p.rosterId === undefined) return { yellow: 0, red: 0 };
    const state = opts.getGameEngine().getState();
    const r = state.career.roster[p.rosterId];
    if (!r) return { yellow: 0, red: 0 };
    return { yellow: r.seasonStats.yellowCards, red: r.seasonStats.redCards };
  }
  void cardsFor; // retained as a future hook; no longer surfaced as a per-row badge.

  function conditionFor(p: { rosterId?: number }): number | null {
    if (p.rosterId === undefined) return null;
    const state = opts.getGameEngine().getState();
    const r = state.career.roster[p.rosterId];
    if (!r) return null;
    return r.condition;
  }

  function conditionClass(c: number): string {
    if (c >= 90) return 'con-elite';
    if (c >= 75) return 'con-good';
    if (c >= 55) return 'con-avg';
    if (c >= 35) return 'con-poor';
    return 'con-veryPoor';
  }

  function moraleFor(p: { rosterId?: number }): number | null {
    if (p.rosterId === undefined) return null;
    const state = opts.getGameEngine().getState();
    const r = state.career.roster[p.rosterId];
    if (!r) return null;
    return r.morale ?? 65;
  }

  function moraleLabel(m: number): { text: string; cls: string } {
    if (m >= 80) return { text: 'Happy',     cls: 'mor-happy' };
    if (m >= 55) return { text: 'OK',         cls: 'mor-ok' };
    if (m >= 35) return { text: 'Unsettled',  cls: 'mor-unsettled' };
    return             { text: 'Unhappy',     cls: 'mor-unhappy' };
  }

  function listForTier(tier: Tier): RawPlayer[] {
    return tier === 'starter' ? draftStarters
         : tier === 'bench'   ? draftBench
         :                       draftSquad;
  }

  function rowGroup(p: RawPlayer): GroupId {
    return POSITION_GROUPS[p.position] ?? 'centres';
  }

  function visibleGroups(): Set<GroupId> {
    const present = new Set<GroupId>();
    for (const p of [...draftStarters, ...draftBench, ...draftSquad]) {
      present.add(rowGroup(p));
    }
    return present;
  }

  function filtered(tier: Tier): RawPlayer[] {
    const list = listForTier(tier);
    if (activeGroup === 'all') return list;
    return list.filter(p => rowGroup(p) === activeGroup);
  }

  function performSwap(fromTier: Tier, fromSquadNum: number, toTier: Tier, toSquadNum: number): void {
    const fromList = listForTier(fromTier);
    const toList   = listForTier(toTier);
    const fromIdx  = fromList.findIndex(p => p.squadNumber === fromSquadNum);
    const toIdx    = toList.findIndex(p => p.squadNumber === toSquadNum);
    if (fromIdx === -1 || toIdx === -1) return;

    // Reject any swap that would put an injured player into starting XV
    // or bench. Injured players are pinned to the wider squad until they
    // recover. The starter/bench tiers correspond to slots 1-23 (in play
    // on matchday); wider squad is slots 24+. A non-starter (bench /
    // squad) initiator paired with a starter/bench target — both the
    // source and target must be checked.
    const fromPlayer = fromList[fromIdx];
    const toPlayer   = toList[toIdx];
    const fromInj = injuryFor(fromPlayer);
    const toInj   = injuryFor(toPlayer);
    // Players forced to rest this round (international duty, final eligible
    // round) are blocked from the matchday too — same treatment as injury.
    // Advisory rounds (earlier in the window) are not in this set, so the
    // manager can still freely select them.
    const state = opts.getGameEngine().getState();
    const forcedRest = selectionUnavailableIds(state, state.player.teamId);
    const fromRest = fromPlayer.rosterId !== undefined && forcedRest.has(fromPlayer.rosterId);
    const toRest   = toPlayer.rosterId   !== undefined && forcedRest.has(toPlayer.rosterId);
    const intoMatchday = (tier: Tier): boolean => tier === 'starter' || tier === 'bench';
    if (((fromInj || fromRest) && intoMatchday(toTier)) || ((toInj || toRest) && intoMatchday(fromTier))) {
      // No mutation; silently deselect. (Future: surface a brief toast.)
      selection = null;
      return;
    }

    const fromId = fromList[fromIdx].id;
    const toId   = toList[toIdx].id;
    fromList[fromIdx] = { ...toPlayer,   id: fromId, squadNumber: fromId };
    toList[toIdx]     = { ...fromPlayer, id: toId,   squadNumber: toId };
    dirty = true;
    selection = null;
    playHaptic('ui_medium');
  }

  function clearTeam(): void {
    const all = [...draftStarters, ...draftBench, ...draftSquad];
    draftStarters = [];
    draftBench = [];
    draftSquad = all.map((p, i) => ({ ...p, id: 24 + i, squadNumber: 24 + i }));
    dirty = true;
    selection = null;
  }

  function autoPick(): void {
    const state = opts.getGameEngine().getState();
    const teamJson = teamsById.get(state.player.teamId);
    if (!teamJson) return;
    const club = state.career.clubs.find(c => c.id === teamJson.id);
    if (!club) return;
    const rosterIds = selectBestMatchdaySquad(state.career.roster, club.squad, selectionUnavailableIds(state, teamJson.id));
    if (rosterIds.length < 23) return;
    const refs = rosterIds.map(rid => {
      const p = state.career.roster[rid];
      return { firstName: p.firstName, lastName: p.lastName };
    });
    const fresh = buildTeamFromRoster(state, teamJson);
    const applied = applyMatchdaySquad(fresh, refs);
    draftStarters = (applied.players as RawPlayer[]).map(p => ({ ...p }));
    draftBench    = ((applied.bench ?? []) as RawPlayer[]).map(p => ({ ...p }));
    draftSquad    = ((applied.squad ?? []) as RawPlayer[]).map(p => ({ ...p }));
    dirty = true;
    selection = null;
  }

  function render(): void {
    if (!el) return;

    const state = opts.getGameEngine().getState();
    const teamJson = teamsById.get(state.player.teamId);
    if (!teamJson) return;

    if (draftStarters.length === 0) resetDraftFromState();

    const seasonLabel = state.calendar.seasonLabel;
    const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
    const round = Math.min(state.calendar.week, totalRounds || state.calendar.week);

    const visible = visibleGroups();
    const chipsHtml = GROUPS
      .filter(g => g.id === 'all' || visible.has(g.id))
      .map(g => `<button class="sq-chip${g.id === activeGroup ? ' active' : ''}" data-group="${g.id}">${g.label}</button>`)
      .join('');

    const fStarters = filtered('starter');
    const fBench    = filtered('bench');
    const fSquadW   = filtered('squad');

    const totalFiltered = fStarters.length + fBench.length + fSquadW.length;
    const listHtml = totalFiltered === 0
      ? `<div class="empty-state">
           <svg class="empty-state__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
             <path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h18M6 12h12M10 19.5h4"/>
           </svg>
           <div class="empty-state__title">No players in this group</div>
           <div class="empty-state__desc">Try a different position filter, or tap All to see your full squad.</div>
         </div>`
      : [
          section('Starting XV', fStarters, 'starter', 0),
          section('Bench',       fBench,    'bench',   fStarters.length),
          section('Wider Squad', fSquadW,   'squad',   fStarters.length + fBench.length),
        ].join('');

    const saveDisabled = !dirty ? ' disabled' : '';

    // Preserve scroll position across re-render. Tapping a row triggers
    // render() (selection-state change), which rewrites el.innerHTML —
    // without this, the freshly-mounted #sq-list resets to scrollTop 0
    // and the user gets bounced to the top of the squad.
    const prevScroll = el.querySelector<HTMLDivElement>('#sq-list')?.scrollTop ?? 0;

    el.style.setProperty('--team-color', teamJson.color);
    el.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="sq-back" class="app-back" aria-label="Back to hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Squad</span>
          <div class="app-topbar-spacer">${helpButtonHtml('squad-management')}</div>
        </div>
        <div class="app-eyebrow">${teamJson.name} · ${seasonLabel} · Round ${round}</div>
      </div>

      <div id="sq-filter-bar">${chipsHtml}</div>
      <div id="sq-list">${listHtml}</div>

      <div id="sq-footer">
        <div class="sq-footer-btns">
          <button id="sq-auto-pick">Auto-Pick</button>
          <button id="sq-save" class="cta-pulse"${saveDisabled}>Save</button>
        </div>
      </div>
    `;

    // Restore scroll position captured above the innerHTML rewrite so
    // selection / swap re-renders feel in-place.
    if (prevScroll) {
      const newList = el.querySelector<HTMLDivElement>('#sq-list');
      if (newList) newList.scrollTop = prevScroll;
    }

    // Filter chips
    el.querySelectorAll<HTMLButtonElement>('.sq-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        activeGroup = btn.dataset.group as GroupId;
        selection = null;
        render();
      });
    });

    // Player rows
    el.querySelectorAll<HTMLElement>('.sq-player').forEach(row => {
      row.addEventListener('click', () => {
        const tier = row.dataset.tier as Tier | undefined;
        const sn   = Number(row.dataset.squad);
        if (!tier || Number.isNaN(sn)) return;

        // Same row clicked again → deselect
        if (selection && selection.tier === tier && selection.squadNum === sn) {
          selection = null;
          playHaptic('ui_light');
          render();
          return;
        }

        // No selection yet → start one. Any tier may initiate — two
        // starters can swap positions, a starter can pull in a bench /
        // wider-squad player, etc.
        if (selection === null) {
          selection = { tier, squadNum: sn };
          playHaptic('ui_light');
          render();
          return;
        }

        // Selection exists, different row → swap
        performSwap(selection.tier, selection.squadNum, tier, sn);
        render();
      });
    });

    // Back button — discard-aware (shared discard sheet)
    el.querySelector<HTMLButtonElement>('#sq-back')!.addEventListener('click', async () => {
      if (dirty) {
        const discard = await discardConfirm('You have unsaved squad changes. Leaving now will revert them.');
        if (!discard) return;  // keep editing
        dirty = false;
      }
      triggerBack();
    });

    // Per-row 12-stat expand chevron — stopPropagation so the row's
    // swap-source click doesn't also fire when toggling the panel.
    el.querySelectorAll<HTMLButtonElement>('.sq-expand-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tier = btn.dataset.tier as Tier | undefined;
        const sn   = Number(btn.dataset.squad);
        if (!tier || Number.isNaN(sn)) return;
        const key = expandKey(tier, sn);
        if (expandedRows.has(key)) expandedRows.delete(key);
        else expandedRows.add(key);
        render();
      });
    });

    // Auto-Pick button
    el.querySelector<HTMLButtonElement>('#sq-auto-pick')!.addEventListener('click', () => {
      autoPick();
      render();
    });

    // Save button
    const saveBtn = el.querySelector<HTMLButtonElement>('#sq-save');
    if (saveBtn && !saveBtn.disabled) {
      saveBtn.addEventListener('click', () => {
        const playerTeam: RawTeamInput = {
          ...teamJson,
          players: draftStarters,
          bench: draftBench,
          squad: draftSquad,
        };
        const ge = opts.getGameEngine();
        ge.setPlayerMatchdaySquad(extractMatchdaySquad(playerTeam));
        saveGame(ge.toSavePayload());
        dirty = false;
        showToast('Squad saved');
        triggerBack();
      });
    }

    // Player-name links — wired last so they're attached after the
    // row click listener above. The link's own click stopPropagation
    // prevents the outer row swap from also firing.
    if (opts.onPlayerClick) wirePlayerLinks(el, opts.onPlayerClick);
  }

  function section(label: string, items: RawPlayer[], tier: Tier, baseIndex: number): string {
    if (items.length === 0) return '';
    const rows = items.map((p, i) => playerRow(p, tier, baseIndex + i)).join('');
    return `
      <div class="sq-section-head">
        <span class="sq-section-label">${label}</span>
        <div class="sq-section-line"></div>
        <span class="sq-section-count">${items.length}</span>
        <div class="sq-col-headers">
          <span class="sq-col-header sq-col-header--ovr">OVR</span>
          <span class="sq-col-header sq-col-header--con">CON</span>
          <span class="sq-col-header sq-col-header--mor">MOR</span>
          <span class="sq-col-header sq-col-header--avr">AVR</span>
        </div>
      </div>
      ${rows}
    `;
  }

  const STAT_COLS = [
    { key: 'stamina',     lbl: 'STM' }, { key: 'strength',    lbl: 'STR' },
    { key: 'pace',        lbl: 'PAC' }, { key: 'agility',     lbl: 'AGI' },
    { key: 'handling',    lbl: 'HND' }, { key: 'tackling',    lbl: 'TKL' },
    { key: 'breakdown',   lbl: 'BRK' }, { key: 'kicking',     lbl: 'KCK' },
    { key: 'setPiece',    lbl: 'SET' }, { key: 'discipline',  lbl: 'DIS' },
    { key: 'positioning', lbl: 'POS' }, { key: 'composure',   lbl: 'CMP' },
  ];

  function playerRow(p: RawPlayer, tier: Tier, index: number): string {
    const ovr = playerOverall(p.baseStats, p.position);
    const sn  = p.squadNumber ?? p.id;
    const isSelected = selection !== null && selection.tier === tier && selection.squadNum === sn;
    const isSwapTarget = selection !== null && !isSelected;
    const jerseyContent = tier === 'squad' ? '—' : String(sn);
    const injury = injuryFor(p);
    const expanded = expandedRows.has(expandKey(tier, sn));
    const classes = ['sq-player', `sq-player--${tier}`];
    if (isSelected) classes.push('sq-player--selected');
    if (isSwapTarget) classes.push('sq-player--swap-target');
    if (injury) classes.push('row-injured');
    if (expanded) classes.push('sq-player--expanded');
    const injuryBadge = injury
      ? `<span class="injury-badge" title="${injuryKindLabel(injury.kind)} — ${injury.weeksRemaining}w">${injury.weeksRemaining}w</span>`
      : '';
    const rest = !injury ? restObligationFor(p) : undefined;
    const lionsRound = !injury && !rest ? lionsStandDownFor(p) : undefined;
    const restBadge = rest
      ? `<span class="rest-badge" title="International duty — must be rested in one of rounds ${rest.eligibleRounds.join(', ')}">REST</span>`
      : lionsRound !== undefined
        ? `<span class="rest-badge" title="British &amp; Irish Lions — post-tour rest, unavailable until Round ${lionsRound}">REST</span>`
        : '';
    const condition = conditionFor(p);
    const conditionCell = condition === null
      ? `<div class="sq-con sq-con--unrated" title="No condition data">—</div>`
      : `<div class="sq-con ${conditionClass(condition)}" title="Current condition">${Math.round(condition)}%</div>`;
    const morale = moraleFor(p);
    const moraleCell = morale === null
      ? `<div class="sq-mor sq-mor--unrated" title="No morale data"></div>`
      : (() => { const ml = moraleLabel(morale); return `<div class="sq-mor ${ml.cls}" title="${ml.text}"></div>`; })();
    // Out-of-position warning — only on the starting XV (slots 1-15), where
    // the familiarity penalty (balance/positionFamiliarity.ts) is applied at
    // kick-off. Bench cover is judged by where the player actually subs in,
    // not their bench slot, so it's not flagged here.
    const sev = tier === 'starter' ? oopSeverity(p.position, sn) : null;
    const sevLabel = { mild: 'minor', moderate: 'notable', severe: 'major' };
    const oopBadge = sev
      ? `<span class="sq-oop-badge sq-oop-badge--${sev}" title="Out of position (${sevLabel[sev]}, −${oopPenaltyPct(p.position, sn)}%) — natural ${p.position}, selected at ${SLOT_POSITION[sn]}">OOP</span>`
      : '';
    const avr = avrFor(p);
    const avrCell = avr === null
      ? `<div class="sq-avr sq-avr--unrated" title="No appearances yet this season">—</div>`
      : `<div class="sq-avr ${ratingClass(avr)}">${avr.toFixed(1)}</div>`;
    const statsGrid = `
      <div class="sq-stats-grid">
        ${STAT_COLS.map(({ key, lbl }) => {
          const v = (p.baseStats as unknown as Record<string, number>)[key] ?? 0;
          return `<div class="sq-stat-cell ${ovrClass(v)}"><span class="sq-stat-lbl">${lbl}</span><span class="sq-stat-val">${v}</span></div>`;
        }).join('')}
      </div>`;
    const chevron = `
      <button class="sq-expand-btn" data-tier="${tier}" data-squad="${sn}" aria-label="${expanded ? 'Hide attributes' : 'Show attributes'}" aria-expanded="${expanded}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>`;
    // Names get a profile-link only when the draft row carries a
    // rosterId (every row built from buildTeamFromRoster does). The
    // injury badge sits outside the link so a tap on it doesn't open
    // the profile.
    const nameInner = opts.onPlayerClick && typeof p.rosterId === 'number'
      ? playerLinkHtml(shortName(p), p.rosterId)
      : shortName(p);
    const rowDelay = Math.min(index, 16) * 25;
    return `
      <div class="${classes.join(' ')}" data-tier="${tier}" data-squad="${sn}" style="--row-delay: ${rowDelay}ms">
        <div class="sq-jersey sq-jersey--${tier}">${jerseyContent}</div>
        <div class="sq-player-info">
          <span class="sq-player-name sq-player-name--${tier}">${nameInner}${injuryBadge ? ' ' + injuryBadge : ''}${restBadge ? ' ' + restBadge : ''}</span>
          <span class="sq-player-pos sq-player-pos--${tier}">${p.position}${oopBadge}</span>
        </div>
        <div class="sq-ovr ${ovrClass(ovr)}">${ovr}</div>
        ${conditionCell}
        ${moraleCell}
        ${avrCell}
        ${chevron}
        <div class="row-expand-panel sq-expand" data-expanded="${expanded}">
          <div class="row-expand-inner"><div class="sq-expand-body">${statsGrid}</div></div>
        </div>
      </div>
    `;
  }

  renderImpl = () => {
    if (!dirty) {
      resetDraftFromState();
    } else {
      // Returning to the screen mid-edit (e.g. back from player profile) —
      // keep the draft but clear transient UI state that shouldn't survive
      // navigation away from the screen.
      selection = null;
      activeGroup = 'all';
      expandedRows.clear();
    }
    render();
  };

  // Eyebrow needs to refresh after a week advances / season rolls — the
  // edit draft itself is invalidated by entry (showSquadManagement) so we
  // don't clobber a live in-progress edit if one of these fires while
  // the screen is open. Re-render only when nothing is dirty.
  function refreshIfClean(): void {
    if (!dirty) {
      resetDraftFromState();
      render();
    }
  }

  eventBus.on('game:initialized',     () => refreshIfClean());
  eventBus.on('game:weekAdvanced',    () => refreshIfClean());
  eventBus.on('game:fixtureRecorded', () => refreshIfClean());
}
