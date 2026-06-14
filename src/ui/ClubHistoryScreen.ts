// Club History screen. Reached from the Club sub-menu.
// Read-only — no mutations. Shows three sections:
//   1. Season history — reverse-chronological list of archived seasons.
//   2. Club records — top-3 per category derived from archive.
//   3. Hall of Fame — players inducted at retirement.
//
// Initialised once per page lifetime; showClubHistory() re-renders fresh
// state on every visit.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { injectTeamColors } from './teamColors';
import { helpButtonHtml } from './help/helpButton';
import { formatDateMedium } from '../utils/formatDate';

export interface InitClubHistoryOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
}

let _opts: InitClubHistoryOpts | null = null;
let _teamsById: Map<string, RawTeamInput> = new Map();

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function showClubHistory(): void {
  const el = document.getElementById('club-history');
  if (!el || !_opts) return;
  const opts = _opts;
  const state = opts.getGameEngine().getState();
  const clubId = state.player.teamId;
  const playerTeam = _teamsById.get(clubId);
  if (!playerTeam) return;

  const archive = state.career.archive;
  const hof = state.career.hallOfFame ?? [];

  if (archive.length === 0) {
    el.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="ch-back" class="app-back" aria-label="Back to club">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Club</span>
          </button>
          <span class="app-title">Club History</span>
          <div class="app-topbar-spacer">${helpButtonHtml('club-history')}</div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · ${formatDateMedium(state.calendar.date)}</div>
      </div>
      <div class="ch-empty">
        <p>No history yet — play some seasons to start building your club's legacy!</p>
      </div>
    `;
    injectTeamColors(el, playerTeam);
    el.querySelector<HTMLButtonElement>('#ch-back')!.addEventListener('click', () => opts.onBack());
    return;
  }

  // ── Season history (reverse chronological) ──────────────────────────────
  const historyRows = [...archive].reverse().map(season => {
    const myStanding = season.standings.find(s => s.teamId === clubId);
    const position = myStanding
      ? season.standings.slice().sort((a, b) => b.leaguePoints - a.leaguePoints || b.pointsDiff - a.pointsDiff)
          .findIndex(s => s.teamId === clubId) + 1
      : null;
    const pts = myStanding?.leaguePoints ?? 0;

    const trophies: string[] = [];
    if (season.championTeamId === clubId) trophies.push('Premiership Champions');
    if (season.premCupChampionTeamId === clubId) trophies.push('League Cup');
    if (season.europeanCupChampionTeamId === clubId) trophies.push('European Cup');
    if (season.europeanShieldChampionTeamId === clubId) trophies.push('European Shield');
    const trophyHtml = trophies.length > 0
      ? `<span class="ch-trophy">${trophies.join(', ')}</span>`
      : '';

    const posText = position !== null ? ordinal(position) : '—';

    return `
      <div class="ch-history-row">
        <div class="ch-history-season">${season.seasonLabel}</div>
        <div class="ch-history-detail">
          <span class="ch-pos">${posText}</span>
          <span class="ch-pts">${pts} pts</span>
          ${trophyHtml}
        </div>
      </div>`;
  }).join('');

  // ── Club records ─────────────────────────────────────────────────────────
  // Aggregate per player from playerSeasonHistory, only counting seasons at
  // the managed club. Track top-3 for tries and appearances.
  const playerApps: Record<number, number> = {};
  const playerTries: Record<number, number> = {};

  for (const season of archive) {
    if (!season.playerSeasonHistory) continue;
    for (const [ridStr, ps] of Object.entries(season.playerSeasonHistory)) {
      if (ps.clubId !== clubId) continue;
      const rid = Number(ridStr);
      playerApps[rid] = (playerApps[rid] ?? 0) + ps.apps;
      playerTries[rid] = (playerTries[rid] ?? 0) + ps.tries;
    }
  }

  // Most points scored in a single season (team total: league points)
  const mostPtsEntry = [...archive]
    .map(s => {
      const st = s.standings.find(x => x.teamId === clubId);
      return { label: s.seasonLabel, value: st?.leaguePoints ?? 0 };
    })
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  function top3ById(map: Record<number, number>, label: string): string {
    const sorted = Object.entries(map)
      .map(([rid, v]) => ({ rid: Number(rid), v }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3);
    if (sorted.length === 0) return '';
    return sorted.map((e, i) => {
      const p = state.career.roster[e.rid];
      const name = p ? `${p.firstName} ${p.lastName}` : `#${e.rid}`;
      return `<div class="ch-record-row"><span class="ch-record-rank">${i + 1}.</span> <span class="ch-record-name">${name}</span> <span class="ch-record-val">${e.v} ${label}</span></div>`;
    }).join('');
  }

  const appsHtml = top3ById(playerApps, 'apps');
  const triesHtml = top3ById(playerTries, 'tries');

  const ptsRecordHtml = mostPtsEntry.map((e, i) =>
    `<div class="ch-record-row"><span class="ch-record-rank">${i + 1}.</span> <span class="ch-record-name">${e.label}</span> <span class="ch-record-val">${e.value} pts</span></div>`,
  ).join('');

  const recordsHtml = `
    <div class="ch-section">
      <div class="ch-section-label">Most Appearances</div>
      ${appsHtml || '<p class="ch-empty-note">No data yet.</p>'}
    </div>
    <div class="ch-section">
      <div class="ch-section-label">Most Career Tries</div>
      ${triesHtml || '<p class="ch-empty-note">No data yet.</p>'}
    </div>
    <div class="ch-section">
      <div class="ch-section-label">Most League Points in a Season</div>
      ${ptsRecordHtml || '<p class="ch-empty-note">No data yet.</p>'}
    </div>`;

  // ── Hall of Fame ──────────────────────────────────────────────────────────
  const hofHtml = hof.length === 0
    ? '<p class="ch-empty-note">No inductees yet — players retire into the Hall of Fame after 50 appearances or 20 tries for the club.</p>'
    : hof.map(e => `
      <div class="ch-hof-row">
        <div class="ch-hof-name">${e.name}</div>
        <div class="ch-hof-detail">
          <span class="ch-hof-pos">${e.position}</span>
          <span class="ch-hof-stat">${e.appearances} apps</span>
          <span class="ch-hof-stat">${e.tries} tries</span>
        </div>
      </div>`).join('');

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="ch-back" class="app-back" aria-label="Back to club">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Club</span>
        </button>
        <span class="app-title">Club History</span>
        <div class="app-topbar-spacer">${helpButtonHtml('club-history')}</div>
      </div>
      <div class="app-eyebrow">${state.calendar.seasonLabel} · ${formatDateMedium(state.calendar.date)}</div>
    </div>

    <div id="ch-content">
      <div class="ch-section">
        <div class="ch-section-label">Season History</div>
        ${historyRows}
      </div>
      <div class="ch-section">
        <div class="ch-section-label">Club Records</div>
        ${recordsHtml}
      </div>
      <div class="ch-section">
        <div class="ch-section-label">Hall of Fame</div>
        ${hofHtml}
      </div>
    </div>
  `;

  injectTeamColors(el, playerTeam);
  el.querySelector<HTMLButtonElement>('#ch-back')!.addEventListener('click', () => opts.onBack());
}

export function initClubHistoryScreen(opts: InitClubHistoryOpts): void {
  _opts = opts;
  _teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
}
