// Game-over screen: the manager has been sacked. Reached from two places:
//   - mid-season — after a result drains board confidence past the sack
//     threshold (with a prior final warning), routed from the post-match
//     chain in main.ts before the Hub.
//   - end-of-season — after the objective swing leaves confidence at/below
//     the season-end threshold, routed from the end-of-season chain.
//
// Terminal: the save is finished. Offers New Game (back to team selection)
// or Main Menu (home). Initialised once per page lifetime.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import { sortStandings } from '../game/leagueTable';
import { playId } from './SoundManager';

interface SackPayload {
  reason: 'midseason' | 'endOfSeason';
  onNewGame: () => void;
  onMainMenu: () => void;
}

let active: SackPayload | null = null;
let renderImpl: (() => void) | null = null;

export function showSack(payload: SackPayload): void {
  active = payload;
  playId('stinger.budget.down');
  renderImpl?.();
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function initSackScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('sacked');
  if (!el) return;
  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    if (!active) return;
    const state = getGameEngine().getState();
    const team = teamsById.get(state.player.teamId);
    if (team) el!.style.setProperty('--team-color', team.color);

    const sorted = sortStandings(state.league.standings);
    const rank = sorted.findIndex(s => s.teamId === state.player.teamId) + 1;
    const standing = sorted.find(s => s.teamId === state.player.teamId);
    const record = standing ? `${standing.won}W–${standing.drawn}D–${standing.lost}L` : '';

    const lead = active.reason === 'midseason'
      ? 'The board has run out of patience. After a run of results well below expectations, the owner has relieved you of your duties with immediate effect.'
      : 'The board has decided not to continue your tenure. The season fell short of the owner\'s expectations, and a change of direction has been made.';

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Dismissed</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel}</div>
      </div>

      <div id="sack-content">
        <div id="sack-card">
          <div class="sack-headline">You've been sacked</div>
          <div class="sack-club">${team?.name ?? state.player.teamId}</div>
          <p class="sack-lead">${lead}</p>
          ${rank > 0 ? `
          <div class="sack-summary">
            <div class="sack-summary-item">
              <span class="sack-summary-val">${ordinal(rank)}</span>
              <span class="sack-summary-label">League position</span>
            </div>
            <div class="sack-summary-item">
              <span class="sack-summary-val">${record}</span>
              <span class="sack-summary-label">Record</span>
            </div>
          </div>` : ''}
        </div>
      </div>

      <div id="sack-footer">
        <button id="sack-newgame" class="cta-pulse">
          <span>New Game</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
        <button id="sack-menu" class="sack-secondary">Main Menu</button>
      </div>`;

    el!.querySelector<HTMLButtonElement>('#sack-newgame')!.addEventListener('click', () => active?.onNewGame());
    el!.querySelector<HTMLButtonElement>('#sack-menu')!.addEventListener('click', () => active?.onMainMenu());
  }

  renderImpl = render;
}
