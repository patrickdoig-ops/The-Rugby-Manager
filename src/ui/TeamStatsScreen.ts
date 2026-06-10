// Sortable per-team stat tables grouped into six categories. Reached
// from the League menu. Tap a row → that club's TeamInfo screen
// (reuses the route from LeagueTable). Read-only — all data flows
// from state.league.teamSeasonStats via seasonLeaderboards helpers.
//
// Category chips at the top swap between focused 4-5 column tables —
// avoids a single wide matrix that scrolls horizontally on phones.
// Sort defaults to the headline column descending; click any column
// header to re-sort.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { GameState, TeamSeasonStats } from '../types/gameState';
import { teamSeasonStat, teamPossessionPct, teamTerritoryPct } from '../game/seasonLeaderboards';
import { eventBus } from '../utils/eventBus';
import { formatDateMedium } from '../utils/formatDate';

type CategoryKey = 'attack' | 'defence' | 'kicking' | 'setpiece' | 'possession' | 'discipline';

// Column descriptor — `value` extracts the sortable number from a team's
// stats, `display` renders the visible cell. `compareDesc` is the
// default sort direction (most stats sort high → low; some like
// knock-ons sort high → low too because "more knock-ons" is the
// noteworthy direction even if conceptually negative).
interface ColumnSpec {
  id: string;
  label: string;
  ariaTitle?: string;
  value: (s: TeamSeasonStats) => number;
  display: (s: TeamSeasonStats) => string;
}

interface CategorySpec {
  key: CategoryKey;
  label: string;
  defaultSortColId: string;
  columns: ColumnSpec[];
}

const fmtInt = (n: number): string => Math.round(n).toLocaleString();
const fmtPct = (n: number): string => `${n.toFixed(1)}%`;
const fmtRate = (n: number, denom: number): string => denom > 0 ? (n / denom).toFixed(1) : '—';

const CATEGORIES: CategorySpec[] = [
  {
    key: 'attack',
    label: 'Attack',
    defaultSortColId: 'tries',
    columns: [
      { id: 'tries',   label: 'TRIES',  value: s => s.tries,           display: s => fmtInt(s.tries) },
      { id: 'carries', label: 'CARRIES',value: s => s.carries,         display: s => fmtInt(s.carries) },
      { id: 'metres',  label: 'METRES', value: s => s.metresCarried,   display: s => fmtInt(s.metresCarried) },
      { id: 'lbs',     label: 'LBs',    ariaTitle: 'Line breaks',
                                        value: s => s.lineBreaks,      display: s => fmtInt(s.lineBreaks) },
      { id: 'db',      label: 'DB',     ariaTitle: 'Defenders beaten',
                                        value: s => s.defendersBeaten, display: s => fmtInt(s.defendersBeaten) },
      { id: 'offloads',label: 'OFFLD', ariaTitle: 'Offloads completed',
                                        value: s => s.offloadsCompleted, display: s => fmtInt(s.offloadsCompleted) },
    ],
  },
  {
    key: 'defence',
    label: 'Defence',
    defaultSortColId: 'tackles',
    columns: [
      { id: 'tackles', label: 'TKLS',   ariaTitle: 'Tackles made',
                                        value: s => s.tacklesMade,     display: s => fmtInt(s.tacklesMade) },
      { id: 'pct',     label: 'TKL%',   ariaTitle: 'Tackle completion percentage',
                                        value: s => s.tacklesAttempted > 0 ? (s.tacklesMade / s.tacklesAttempted) * 100 : 0,
                                        display: s => s.tacklesAttempted > 0 ? fmtPct((s.tacklesMade / s.tacklesAttempted) * 100) : '—' },
      { id: 'turnovers', label: 'TOs',  ariaTitle: 'Turnovers won',
                                        value: s => s.turnoversWon,    display: s => fmtInt(s.turnoversWon) },
    ],
  },
  {
    key: 'kicking',
    label: 'Kicking',
    defaultSortColId: 'kmetres',
    columns: [
      { id: 'kicks',   label: 'KICKS',  value: s => s.kicksFromHand,   display: s => fmtInt(s.kicksFromHand) },
      { id: 'kmetres', label: 'METRES', value: s => s.kickMetres,      display: s => fmtInt(s.kickMetres) },
      { id: 'avg',     label: 'm/KICK', ariaTitle: 'Average metres per kick',
                                        value: s => s.kicksFromHand > 0 ? s.kickMetres / s.kicksFromHand : 0,
                                        display: s => fmtRate(s.kickMetres, s.kicksFromHand) },
    ],
  },
  {
    key: 'setpiece',
    label: 'Set Piece',
    defaultSortColId: 'lopct',
    columns: [
      { id: 'lopct',   label: 'LO%',    ariaTitle: 'Lineout win percentage',
                                        value: s => s.lineoutsThrown > 0 ? (s.lineoutsWon / s.lineoutsThrown) * 100 : 0,
                                        display: s => s.lineoutsThrown > 0 ? fmtPct((s.lineoutsWon / s.lineoutsThrown) * 100) : '—' },
      { id: 'scpct',   label: 'SC%',    ariaTitle: 'Scrum win percentage',
                                        value: s => s.scrumsPutIn > 0 ? (s.scrumsWon / s.scrumsPutIn) * 100 : 0,
                                        display: s => s.scrumsPutIn > 0 ? fmtPct((s.scrumsWon / s.scrumsPutIn) * 100) : '—' },
      { id: 'e22',     label: '22m',    ariaTitle: 'Entries into opposition 22m',
                                        value: s => s.entries22,       display: s => fmtInt(s.entries22) },
      { id: 'pts22',   label: 'PTS/E',  ariaTitle: 'Points per 22m entry',
                                        value: s => s.entries22 > 0 ? s.entries22Points / s.entries22 : 0,
                                        display: s => fmtRate(s.entries22Points, s.entries22) },
    ],
  },
  {
    key: 'possession',
    label: 'Possession',
    defaultSortColId: 'poss',
    columns: [
      { id: 'poss',    label: 'POSS%',  ariaTitle: 'Possession percentage',
                                        value: s => teamPossessionPct(s), display: s => fmtPct(teamPossessionPct(s)) },
      { id: 'terr',    label: 'TERR%',  ariaTitle: 'Territory percentage',
                                        value: s => teamTerritoryPct(s),  display: s => fmtPct(teamTerritoryPct(s)) },
    ],
  },
  {
    key: 'discipline',
    label: 'Discipline',
    defaultSortColId: 'yellows',
    columns: [
      { id: 'knockons', label: 'KO',    ariaTitle: 'Knock-ons',
                                        value: s => s.knockOns,        display: s => fmtInt(s.knockOns) },
      { id: 'yellows',  label: 'YC',    ariaTitle: 'Yellow cards',
                                        value: s => s.yellowCards,     display: s => fmtInt(s.yellowCards) },
      { id: 'reds',     label: 'RC',    ariaTitle: 'Red cards',
                                        value: s => s.redCards,        display: s => fmtInt(s.redCards) },
    ],
  },
];

type SortDir = 'asc' | 'desc';

let activeCategory: CategoryKey = 'attack';
let activeSortColId: string | null = null;
let activeSortDir: SortDir = 'desc';
let renderImpl: (() => void) | null = null;

export function showTeamStats(): void {
  renderImpl?.();
}

export function initTeamStatsScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
  onTeamClick: (teamId: string) => void,
): void {
  const el = document.getElementById('team-stats');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function currentCategory(): CategorySpec {
    return CATEGORIES.find(c => c.key === activeCategory) ?? CATEGORIES[0];
  }

  function teamCrest(team: RawTeamInput): string {
    const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
    const initial = team.shortName[0] ?? '?';
    return `<div class="ts-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
  }

  function render(): void {
    const state: GameState = getGameEngine().getState();
    const playerTeamId = state.player.teamId;
    const cat = currentCategory();
    const sortColId = activeSortColId ?? cat.defaultSortColId;
    const sortCol = cat.columns.find(c => c.id === sortColId) ?? cat.columns[0];

    // Build rows for every team that has a stats bucket; sort by the
    // selected column. Direction defaults to desc on first switch into
    // a category, flips on second click of the same header.
    const rows = allTeams.map(team => {
      const stats = teamSeasonStat(state, team.id);
      return { team, stats };
    });
    rows.sort((a, b) => {
      const av = sortCol.value(a.stats);
      const bv = sortCol.value(b.stats);
      if (av === bv) return a.team.id.localeCompare(b.team.id);
      return activeSortDir === 'desc' ? bv - av : av - bv;
    });

    const headerCells = cat.columns.map(col => {
      const isActive = col.id === sortColId;
      const arrow = isActive
        ? (activeSortDir === 'desc'
            ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-left:3px"><path d="m6 9 6 6 6-6"/></svg>`
            : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-left:3px"><path d="m18 15-6-6-6 6"/></svg>`)
        : '';
      const title = col.ariaTitle ? ` title="${col.ariaTitle}"` : '';
      return `<button class="ts-head ts-col${isActive ? ' ts-head--active' : ''}" data-col="${col.id}"${title}>${col.label}${arrow}</button>`;
    }).join('');

    const bodyRows = rows.map((r, i) => {
      const isMe = r.team.id === playerTeamId;
      const cells = cat.columns.map(col => `<span class="ts-col ts-val">${col.display(r.stats)}</span>`).join('');
      const label = `View ${r.team.name} info`;
      const rowDelay = Math.min(i, 16) * 25;
      return `
        <div class="ts-row${isMe ? ' ts-row--me' : ''}" role="button" tabindex="0" data-team-id="${r.team.id}" aria-label="${label}" style="--row-delay: ${rowDelay}ms">
          <span class="ts-rank">${i + 1}</span>
          ${teamCrest(r.team)}
          <span class="ts-name">${r.team.name.split(' ')[0]}</span>
          ${cells}
        </div>`;
    }).join('');

    const chips = CATEGORIES.map(c =>
      `<button class="ts-chip${c.key === activeCategory ? ' ts-chip--active' : ''}" data-cat="${c.key}">${c.label}</button>`
    ).join('');

    // Phase the row template's grid via inline style so the head + body
    // share the same column count without duplicating CSS for each
    // category.
    const cols = cat.columns.length;
    const gridCols = `22px 22px 1fr ${'minmax(40px, auto) '.repeat(cols).trim()}`;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="ts-back" class="app-back" aria-label="Back to league menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>League</span>
          </button>
          <span class="app-title">Team Stats</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · ${formatDateMedium(state.calendar.date)}</div>
      </div>

      <div id="ts-chips">${chips}</div>

      <div id="ts-table" style="--ts-grid:${gridCols}">
        <div class="ts-head-row">
          <span class="ts-rank">#</span>
          <span class="ts-crest-spacer"></span>
          <span class="ts-name">Club</span>
          ${headerCells}
        </div>
        ${bodyRows}
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#ts-back')!.addEventListener('click', () => onBack());

    el!.querySelectorAll<HTMLButtonElement>('.ts-chip[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.cat as CategoryKey;
        if (next === activeCategory) return;
        activeCategory = next;
        activeSortColId = null; // reset to category's default sort column
        activeSortDir = 'desc';
        render();
      });
    });

    el!.querySelectorAll<HTMLButtonElement>('.ts-head[data-col]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.col!;
        if (next === sortColId) {
          activeSortDir = activeSortDir === 'desc' ? 'asc' : 'desc';
        } else {
          activeSortColId = next;
          activeSortDir = 'desc';
        }
        render();
      });
    });

    el!.querySelectorAll<HTMLElement>('.ts-row[data-team-id]').forEach(row => {
      const teamId = row.dataset.teamId;
      if (!teamId) return;
      row.addEventListener('click', () => onTeamClick(teamId));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTeamClick(teamId);
        }
      });
    });

    void teamsById; // typeguard — teamsById currently unused; kept for future enrichment (team.color in row tinting)
  }

  renderImpl = render;
  // Skip renders while hidden — showTeamStats re-renders on navigation.
  const renderIfVisible = (): void => { if (el.offsetParent !== null) render(); };
  eventBus.on('game:fixtureRecorded', renderIfVisible);
  eventBus.on('game:weekAdvanced', renderIfVisible);
  eventBus.on('game:initialized', renderIfVisible);

  render();
}
