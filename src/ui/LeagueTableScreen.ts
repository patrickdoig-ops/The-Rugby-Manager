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
import type { TeamStanding } from '../types/gameState';
import { sortStandings } from '../game/leagueTable';
import { eventBus } from '../utils/eventBus';

let postMatchOnContinue: (() => void) | null = null;
let renderImpl: (() => void) | null = null;

export function showLeagueTablePostMatch(onContinue: () => void): void {
  postMatchOnContinue = onContinue;
  renderImpl?.();
}

function clearPostMatchMode(): void {
  postMatchOnContinue = null;
}

function teamCrest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 65%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="lt-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

function standingsRow(s: TeamStanding, rank: number, teamsById: Map<string, RawTeamInput>, highlight: boolean): string {
  const team = teamsById.get(s.teamId);
  const name = team?.shortName ?? s.teamId;
  const cls = highlight ? 'lt-row lt-row--me' : 'lt-row';
  const diff = `${s.pointsDiff >= 0 ? '+' : ''}${s.pointsDiff}`;
  const crest = team ? teamCrest(team) : '<div class="lt-crest"></div>';
  return `
    <div class="${cls}">
      <span class="lt-rank">${rank}</span>
      ${crest}
      <span class="lt-name">${name}</span>
      <span class="lt-num">${s.played}</span>
      <span class="lt-num">${s.won}</span>
      <span class="lt-num">${s.drawn}</span>
      <span class="lt-num">${s.lost}</span>
      <span class="lt-num">${diff}</span>
      <span class="lt-pts">${s.leaguePoints}</span>
    </div>
  `;
}

export function initLeagueTableScreen(
  gameEngine: GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
): void {
  const el = document.getElementById('league-table');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const playerTeamId = gameEngine.getState().player.teamId;

  function render(): void {
    const state = gameEngine.getState();
    const totalRounds = state.league.fixtures.reduce((max, f) => Math.max(max, f.round), 0);
    const sorted = sortStandings(state.league.standings);

    const rows = sorted.map((s, i) =>
      standingsRow(s, i + 1, teamsById, s.teamId === playerTeamId)
    ).join('');

    const inPostMatch = postMatchOnContinue !== null;
    const topbarLeft = inPostMatch
      ? `<div style="width:72px"></div>`
      : `<button id="lt-back" aria-label="Back to hub">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
           <span>Hub</span>
         </button>`;
    const footer = inPostMatch
      ? `<div id="lt-footer">
           <button id="lt-continue">
             <span>Continue</span>
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
           </button>
         </div>`
      : '';

    el!.innerHTML = `
      <div id="lt-topbar">
        ${topbarLeft}
        <span id="lt-title">League Table</span>
        <div style="width:72px"></div>
      </div>
      <div id="lt-eyebrow">${state.calendar.seasonLabel} · Week ${state.calendar.week} of ${totalRounds}</div>
      <div id="lt-table">
        <div class="lt-head">
          <span class="lt-rank">#</span>
          <span class="lt-crest-spacer"></span>
          <span class="lt-name">Club</span>
          <span class="lt-num">P</span>
          <span class="lt-num">W</span>
          <span class="lt-num">D</span>
          <span class="lt-num">L</span>
          <span class="lt-num">PD</span>
          <span class="lt-pts">Pts</span>
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
