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
// **Edit model.** Two-tap swap, mirroring PreMatchScreen: tap a non-
// starter row to select; tap any other row visible in the current
// position-filter view to swap. Slots (id / squadNumber) stay with the
// position they belong to — the players are what move. Local-edit
// mode until the user taps "Save Squad"; the back arrow opens a discard
// confirmation if there are pending edits.
//
// Initialised once per page lifetime alongside the other in-season
// screens. `showSquadManagement()` (called from main.ts's onSquad before
// `screenRouter.show`) resets the draft from the latest engine state.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput, RawPlayer } from '../types/teamData';
import type { Position, PlayerInjury } from '../types/player';
import { applyMatchdaySquad, extractMatchdaySquad, makeInjuredPredicate } from '../game/playerSquad';
import { buildTeamFromRoster } from '../game/rosterTeamBuilder';
import { playerOverall } from '../engine/RatingEngine';
import { shortName } from '../utils/playerName';
import { saveGame } from './SaveManager';
import { eventBus } from '../utils/eventBus';

export interface InitSquadManagementOpts {
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
}

type Tier = 'starter' | 'bench' | 'squad';

type GroupId =
  | 'all' | 'props' | 'hooker' | 'locks' | 'looseforwards'
  | 'scrumhalves' | 'flyhalves' | 'centres' | 'wings' | 'fullbacks';

interface GroupSpec {
  id: GroupId;
  label: string;
}

const GROUPS: GroupSpec[] = [
  { id: 'all',          label: 'All' },
  { id: 'props',        label: 'Props' },
  { id: 'hooker',       label: 'Hooker' },
  { id: 'locks',        label: 'Locks' },
  { id: 'looseforwards',label: 'Loose Forwards' },
  { id: 'scrumhalves',  label: 'Scrum Halves' },
  { id: 'flyhalves',    label: 'Fly Halves' },
  { id: 'centres',      label: 'Centres' },
  { id: 'wings',        label: 'Wings' },
  { id: 'fullbacks',    label: 'Full Backs' },
];

const POSITION_GROUPS: Record<Position, GroupId> = {
  'Prop':          'props',
  'Hooker':        'hooker',
  'Lock':          'locks',
  'Flanker':       'looseforwards',
  'Number 8':      'looseforwards',
  'Back Row':      'looseforwards',
  'Scrum-Half':    'scrumhalves',
  'Fly-Half':      'flyhalves',
  'Centre':        'centres',
  'Wing':          'wings',
  'Fullback':      'fullbacks',
  'Utility Back':  'centres',
};

function ovrClass(ovr: number): string {
  if (ovr >= 85) return 'ovr-elite';
  if (ovr >= 78) return 'ovr-good';
  if (ovr >= 70) return 'ovr-avg';
  if (ovr >= 62) return 'ovr-poor';
  return 'ovr-veryPoor';
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

export function showSquadManagement(): void {
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
  let discardOpen = false;

  function resetDraftFromState(): void {
    const state = opts.getGameEngine().getState();
    const teamJson = teamsById.get(state.player.teamId);
    if (!teamJson) return;
    const fresh = buildTeamFromRoster(state, teamJson);
    const club = state.career.clubs.find(c => c.id === teamJson.id);
    const isInjured = club ? makeInjuredPredicate(state.career.roster, club.squad) : undefined;
    const applied = applyMatchdaySquad(fresh, state.player.matchdaySquad, isInjured);
    draftStarters = (applied.players as RawPlayer[]).map(p => ({ ...p }));
    draftBench    = ((applied.bench ?? []) as RawPlayer[]).map(p => ({ ...p }));
    draftSquad    = ((applied.squad ?? []) as RawPlayer[]).map(p => ({ ...p }));
    selection = null;
    activeGroup = 'all';
    dirty = false;
    discardOpen = false;
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
    const intoMatchday = (tier: Tier): boolean => tier === 'starter' || tier === 'bench';
    if ((fromInj && intoMatchday(toTier)) || (toInj && intoMatchday(fromTier))) {
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
      ? `<div class="sq-empty">No players in this group</div>`
      : [
          section('Starting XV', fStarters, 'starter'),
          section('Bench',       fBench,    'bench'),
          section('Wider Squad', fSquadW,   'squad'),
        ].join('');

    const saveDisabled = !dirty ? ' disabled' : '';
    const confirmHtml = discardOpen ? discardConfirmHtml() : '';

    el.style.setProperty('--team-color', teamJson.color);
    el.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="sq-back" class="app-back" aria-label="Back to hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Squad</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${teamJson.name} · ${seasonLabel} · Round ${round}</div>
      </div>

      <div id="sq-filter-bar">${chipsHtml}</div>
      <div id="sq-list">${listHtml}</div>

      <div id="sq-footer">
        <button id="sq-save" class="cta-pulse"${saveDisabled}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" pointer-events="none" aria-hidden="true"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save Squad
        </button>
      </div>

      ${confirmHtml}
    `;

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
          render();
          return;
        }

        // No selection yet → start one (starters can't initiate; only targets)
        if (selection === null) {
          if (tier === 'starter') return;
          selection = { tier, squadNum: sn };
          render();
          return;
        }

        // Selection exists, different row → swap
        performSwap(selection.tier, selection.squadNum, tier, sn);
        render();
      });
    });

    // Back button — discard-aware
    el.querySelector<HTMLButtonElement>('#sq-back')!.addEventListener('click', () => {
      if (dirty) {
        discardOpen = true;
        render();
      } else {
        opts.onBack();
      }
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
        opts.onBack();
      });
    }

    // Discard confirm
    if (discardOpen) {
      el.querySelector<HTMLButtonElement>('#sq-discard-cancel')!.addEventListener('click', () => {
        discardOpen = false;
        render();
      });
      el.querySelector<HTMLButtonElement>('#sq-discard-confirm')!.addEventListener('click', () => {
        discardOpen = false;
        opts.onBack();
      });
      const backdrop = el.querySelector<HTMLDivElement>('#sq-discard-backdrop');
      backdrop?.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          discardOpen = false;
          render();
        }
      });
    }
  }

  function section(label: string, items: RawPlayer[], tier: Tier): string {
    if (items.length === 0) return '';
    const rows = items.map(p => playerRow(p, tier)).join('');
    return `
      <div class="sq-section-head">
        <span class="sq-section-label">${label}</span>
        <div class="sq-section-line"></div>
        <span class="sq-section-count">${items.length}</span>
      </div>
      ${rows}
    `;
  }

  function playerRow(p: RawPlayer, tier: Tier): string {
    const ovr = playerOverall(p.baseStats, p.position);
    const sn  = p.squadNumber ?? p.id;
    const isSelected = selection !== null && selection.tier === tier && selection.squadNum === sn;
    const isSwapTarget = selection !== null && !isSelected;
    const jerseyContent = tier === 'squad' ? '—' : String(sn);
    const injury = injuryFor(p);
    const classes = ['sq-player', `sq-player--${tier}`];
    if (isSelected) classes.push('sq-player--selected');
    if (isSwapTarget) classes.push('sq-player--swap-target');
    if (injury) classes.push('row-injured');
    const injuryBadge = injury
      ? `<span class="injury-badge" title="${injuryKindLabel(injury.kind)} — ${injury.weeksRemaining}w">${injury.weeksRemaining}w</span>`
      : '';
    return `
      <div class="${classes.join(' ')}" data-tier="${tier}" data-squad="${sn}">
        <div class="sq-jersey sq-jersey--${tier}">${jerseyContent}</div>
        <div class="sq-player-info">
          <span class="sq-player-name sq-player-name--${tier}">${shortName(p)}${injuryBadge ? ' ' + injuryBadge : ''}</span>
          <span class="sq-player-pos sq-player-pos--${tier}">${p.position}</span>
        </div>
        <div class="sq-ovr ${ovrClass(ovr)}">${ovr}</div>
      </div>
    `;
  }

  function discardConfirmHtml(): string {
    return `
      <div class="sq-discard-backdrop" id="sq-discard-backdrop">
        <div class="sq-discard">
          <div class="sq-discard-title">Discard changes?</div>
          <div class="sq-discard-body">You have unsaved squad changes. Leaving now will revert them.</div>
          <div class="sq-discard-actions">
            <button class="sq-discard-btn sq-discard-cancel" id="sq-discard-cancel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
              Keep editing
            </button>
            <button class="sq-discard-btn sq-discard-confirm" id="sq-discard-confirm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
              Discard
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderImpl = () => {
    resetDraftFromState();
    render();
  };

  // Eyebrow needs to refresh after a week advances / season rolls — the
  // edit draft itself is invalidated by entry (showSquadManagement) so we
  // don't clobber a live in-progress edit if one of these fires while
  // the screen is open. Re-render only when nothing is dirty.
  function refreshIfClean(): void {
    if (!dirty && !discardOpen) {
      resetDraftFromState();
      render();
    }
  }

  eventBus.on('game:initialized',     () => refreshIfClean());
  eventBus.on('game:weekAdvanced',    () => refreshIfClean());
  eventBus.on('game:fixtureRecorded', () => refreshIfClean());
}
