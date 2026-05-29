// Full league standings view. Reached from the Hub's League tile; back
// navigates to the Hub. Read-only — standings are mutated by the game
// engine via FIXTURE_RESULT_RECORDED.
//
// Dual-mode: the hub-entry path uses the back arrow (always → Hub). The
// post-match flow calls `showLeagueTablePostMatch(onContinue)` to surface
// a forward "Continue → Hub" CTA in place of the back arrow. Activating
// or clearing the mode also triggers a re-render so the change is
// visible immediately rather than waiting on the next `game:*` event.
//
// View toggle: 'standard' shows league points (P/W/D/L/PD/B/Pts), 'form'
// shows last-5 pills sorted by form points (3-1-0). Toggle state is
// per-session, persists across re-renders.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { FixtureResult, TeamStanding } from '../types/gameState';
import { sortStandings } from '../game/leagueTable';
import { recentForm, type FormResult } from '../game/teamStats';
import { renderFormPipStrip } from './components/formPip';
import { eventBus } from '../utils/eventBus';

const PLAYOFF_SPOTS = 4;

type ViewMode = 'standard' | 'form';

let postMatchOnContinue: (() => void) | null = null;
let renderImpl: (() => void) | null = null;
let viewMode: ViewMode = 'standard';

export function showLeagueTablePostMatch(onContinue: () => void): void {
  postMatchOnContinue = onContinue;
  renderImpl?.();
}

// Hub-entry path: clear any lingering post-match mode and re-render so the
// back-arrow renders cleanly, even if the user just came through the
// post-match Continue chain (which doesn't fire any game:* event between
// clearPostMatchMode() and the next Hub-entry).
export function showLeagueTable(): void {
  postMatchOnContinue = null;
  renderImpl?.();
}

function clearPostMatchMode(): void {
  postMatchOnContinue = null;
}

function teamCrest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="lt-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

// "Bath Rugby" → "Bath", "Newcastle Falcons" → "Newcastle", etc. The
// first token is enough to identify every Prem club at a glance and fits
// inside the trimmed NAME column on a 390px viewport.
function displayName(team: RawTeamInput | undefined, fallbackId: string): string {
  if (!team) return fallbackId;
  return team.name.split(' ')[0];
}

// Football-style 3-1-0 form points over the last `n` results. Bonus-free
// so it isolates result quality from try-scoring streaks; matches what
// most viewers expect when they see a "form" table.
function formPoints(form: Array<FormResult | null>): number {
  return form.reduce<number>((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
}

function standardRow(
  s: TeamStanding,
  rank: number,
  teamsById: Map<string, RawTeamInput>,
  highlight: boolean,
): string {
  const team = teamsById.get(s.teamId);
  const name = displayName(team, s.teamId);
  const classes = ['lt-row'];
  if (highlight) classes.push('lt-row--me');
  if (rank === PLAYOFF_SPOTS + 1) classes.push('lt-row--zone-break');
  const diff = `${s.pointsDiff >= 0 ? '+' : ''}${s.pointsDiff}`;
  const crest = team ? teamCrest(team) : '<div class="lt-crest"></div>';
  const bonusPoints = s.tryBonus + s.losingBonus;
  // Click target: data-team-id is read by the click + keydown handlers
  // in init. role=button + tabindex make the div keyboard-accessible
  // without changing the existing grid layout.
  const label = team ? `View ${team.name} info` : `View ${s.teamId} info`;
  const rowDelay = Math.min(rank - 1, 16) * 25;
  return `
    <div class="${classes.join(' ')}" role="button" tabindex="0" data-team-id="${s.teamId}" aria-label="${label}" style="--row-delay: ${rowDelay}ms">
      <span class="lt-rank">${rank}</span>
      ${crest}
      <span class="lt-name">${name}</span>
      <span class="lt-num">${s.played}</span>
      <span class="lt-num">${s.won}</span>
      <span class="lt-num">${s.drawn}</span>
      <span class="lt-num">${s.lost}</span>
      <span class="lt-num">${diff}</span>
      <span class="lt-num" title="Bonus points (try bonuses ${s.tryBonus} · losing bonuses ${s.losingBonus})">${bonusPoints}</span>
      <span class="lt-pts">${s.leaguePoints}</span>
    </div>
  `;
}

function formRow(
  s: TeamStanding,
  rank: number,
  teamsById: Map<string, RawTeamInput>,
  highlight: boolean,
  results: FixtureResult[],
): string {
  const team = teamsById.get(s.teamId);
  const name = displayName(team, s.teamId);
  const classes = ['lt-row'];
  if (highlight) classes.push('lt-row--me');
  const crest = team ? teamCrest(team) : '<div class="lt-crest"></div>';
  const form = recentForm(s.teamId, results);
  const formHtml = renderFormPipStrip(form, 'sm');
  const pts = formPoints(form);
  const label = team ? `View ${team.name} info` : `View ${s.teamId} info`;
  const rowDelay = Math.min(rank - 1, 16) * 25;
  return `
    <div class="${classes.join(' ')}" role="button" tabindex="0" data-team-id="${s.teamId}" aria-label="${label}" style="--row-delay: ${rowDelay}ms">
      <span class="lt-rank">${rank}</span>
      ${crest}
      <span class="lt-name">${name}</span>
      <span class="lt-form">${formHtml}</span>
      <span class="lt-pts" title="Form points (W=3, D=1, L=0 over last 5)">${pts}</span>
    </div>
  `;
}

function sortByForm(standings: TeamStanding[], results: FixtureResult[]): TeamStanding[] {
  return [...standings].sort((a, b) => {
    const aForm = recentForm(a.teamId, results);
    const bForm = recentForm(b.teamId, results);
    const aPts = formPoints(aForm);
    const bPts = formPoints(bForm);
    if (aPts !== bPts) return bPts - aPts;
    // Tiebreak: more wins in the window, then by overall league points
    // (so two teams with identical form ordering get a sensible fallback).
    const aWins = aForm.filter(r => r === 'W').length;
    const bWins = bForm.filter(r => r === 'W').length;
    if (aWins !== bWins) return bWins - aWins;
    return b.leaguePoints - a.leaguePoints;
  });
}

export function initLeagueTableScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
  // Row click → open the named team's TeamInfo screen. main.ts owns
  // the navigation target; the screen just emits the teamId. Same
  // behaviour in both standard + form view modes, and in post-match
  // mode (the back arrow from TeamInfo re-shows this screen in its
  // current mode, including the post-match Continue chain).
  onTeamClick: (teamId: string) => void,
): void {
  const el = document.getElementById('league-table');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = getGameEngine().getState();
    const playerTeamId = state.player.teamId;
    const totalRounds = state.league.fixtures.reduce((max, f) => Math.max(max, f.round), 0);
    const results = state.league.results;

    const sorted = viewMode === 'standard'
      ? sortStandings(state.league.standings)
      : sortByForm(state.league.standings, results);

    const rows = sorted.map((s, i) => viewMode === 'standard'
      ? standardRow(s, i + 1, teamsById, s.teamId === playerTeamId)
      : formRow(s, i + 1, teamsById, s.teamId === playerTeamId, results)
    ).join('');

    const headRow = viewMode === 'standard'
      ? `<div class="lt-head">
           <span class="lt-rank">#</span>
           <span class="lt-crest-spacer"></span>
           <span class="lt-name">Club</span>
           <span class="lt-num" title="Played">P</span>
           <span class="lt-num" title="Won">W</span>
           <span class="lt-num" title="Drawn">D</span>
           <span class="lt-num" title="Lost">L</span>
           <span class="lt-num" title="Points difference">PD</span>
           <span class="lt-num" title="Bonus points (try + losing)">B</span>
           <span class="lt-pts" title="League points">Pts</span>
         </div>`
      : `<div class="lt-head">
           <span class="lt-rank">#</span>
           <span class="lt-crest-spacer"></span>
           <span class="lt-name">Club</span>
           <span class="lt-form">Last 5</span>
           <span class="lt-pts" title="Form points (W=3, D=1, L=0)">Pts</span>
         </div>`;

    const inPostMatch = postMatchOnContinue !== null;
    const topbarLeft = inPostMatch
      ? `<div class="app-topbar-spacer"></div>`
      : `<button id="lt-back" class="app-back" aria-label="Back to hub">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
           <span>Hub</span>
         </button>`;
    const footer = inPostMatch
      ? `<div id="lt-footer">
           <button id="lt-continue" class="cta-pulse">
             <span>Continue</span>
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
           </button>
         </div>`
      : '';

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          ${topbarLeft}
          <span class="app-title">League Table</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week} / ${totalRounds}</div>
      </div>
      <div class="lt-toggle" role="tablist">
        <button class="lt-toggle__btn ${viewMode === 'standard' ? 'lt-toggle__btn--active' : ''}" data-mode="standard" role="tab" aria-selected="${viewMode === 'standard'}">Standard</button>
        <button class="lt-toggle__btn ${viewMode === 'form' ? 'lt-toggle__btn--active' : ''}" data-mode="form" role="tab" aria-selected="${viewMode === 'form'}">Form</button>
      </div>
      <div id="lt-table" data-mode="${viewMode}">
        ${headRow}
        ${rows}
      </div>
      ${footer}
    `;

    el!.querySelectorAll<HTMLButtonElement>('.lt-toggle__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.mode as ViewMode;
        if (next === viewMode) return;
        viewMode = next;
        render();
      });
    });

    if (!inPostMatch) {
      el!.querySelector<HTMLButtonElement>('#lt-back')!.addEventListener('click', () => {
        onBack();
      });
    } else {
      el!.querySelector<HTMLButtonElement>('#lt-continue')!.addEventListener('click', () => {
        const fn = postMatchOnContinue!;
        clearPostMatchMode();
        fn();
      });
    }

    // Row click → TeamInfo. Both pointer + keyboard (Enter / Space)
    // paths fire the same callback; rows carry role="button" + tabindex
    // so they're focusable in the page tab order.
    el!.querySelectorAll<HTMLElement>('.lt-row[data-team-id]').forEach(row => {
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
  }

  renderImpl = render;

  eventBus.on('game:fixtureRecorded', () => render());
  eventBus.on('game:weekAdvanced', () => render());
  eventBus.on('game:initialized', () => render());

  render();
}
