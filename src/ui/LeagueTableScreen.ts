// Full league standings view. Reached from the Hub's League tile; back
// navigates to the Hub. Read-only — standings are mutated by the game
// engine via FIXTURE_RESULT_RECORDED.
//
// Dual-mode: the hub-entry path uses the back arrow (always → Hub). The
// post-match flow calls `showLeagueTablePostMatch(onContinue)` to surface
// a forward "Continue → Hub" CTA in place of the back arrow. Activating
// or clearing the mode also triggers a re-render so the change is
// visible immediately rather than waiting on the next `game:*` event.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { FixtureResult, TeamStanding } from '../types/gameState';
import { sortStandings } from '../game/leagueTable';
import { recentForm } from '../game/teamStats';
import { eventBus } from '../utils/eventBus';

const PLAYOFF_SPOTS = 4;

let postMatchOnContinue: (() => void) | null = null;
let renderImpl: (() => void) | null = null;

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

function standingsRow(
  s: TeamStanding,
  rank: number,
  teamsById: Map<string, RawTeamInput>,
  highlight: boolean,
  results: FixtureResult[],
): string {
  const team = teamsById.get(s.teamId);
  const name = team?.shortName ?? s.teamId;
  const classes = ['lt-row'];
  if (highlight) classes.push('lt-row--me');
  if (rank === PLAYOFF_SPOTS + 1) classes.push('lt-row--zone-break');
  const diff = `${s.pointsDiff >= 0 ? '+' : ''}${s.pointsDiff}`;
  const crest = team ? teamCrest(team) : '<div class="lt-crest"></div>';
  const form = recentForm(s.teamId, results);
  const formHtml = form.map(r => {
    if (!r) return `<span class="lt-fp lt-fp--empty">–</span>`;
    return `<span class="lt-fp lt-fp--${r.toLowerCase()}">${r}</span>`;
  }).join('');
  const bonusPoints = s.tryBonus + s.losingBonus;
  return `
    <div class="${classes.join(' ')}">
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
      <span class="lt-form">${formHtml}</span>
    </div>
  `;
}

export function initLeagueTableScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
): void {
  const el = document.getElementById('league-table');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = getGameEngine().getState();
    const playerTeamId = state.player.teamId;
    const totalRounds = state.league.fixtures.reduce((max, f) => Math.max(max, f.round), 0);
    const sorted = sortStandings(state.league.standings);

    const results = state.league.results;
    const rows = sorted.map((s, i) =>
      standingsRow(s, i + 1, teamsById, s.teamId === playerTeamId, results)
    ).join('');

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
        <div class="app-eyebrow">${state.calendar.seasonLabel} · Week ${state.calendar.week} of ${totalRounds}</div>
      </div>
      <div id="lt-table">
        <div class="lt-head">
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
          <span class="lt-form" title="Last 5 results">Form</span>
        </div>
        ${rows}
      </div>
      ${footer}
    `;

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
  }

  renderImpl = render;

  eventBus.on('game:fixtureRecorded', () => render());
  eventBus.on('game:weekAdvanced', () => render());
  eventBus.on('game:initialized', () => render());

  render();
}
