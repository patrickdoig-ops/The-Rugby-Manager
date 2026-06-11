// Prem Cup fixtures screen — read-only browse from the Competitions menu
// (`showCupFixturesBrowse`): full pool tables + both legs' fixtures + the
// knockout bracket if seeded. The old once-per-block live/assistant +
// rest-direction decision moved to the persistent Club → Assistant Manager
// screen. One-shot init from main.ts.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { poolTableHtml, fixtureListHtml, bracketHtml } from './components/cupViews';
import { helpButtonHtml } from './help/helpButton';

type Mode = { kind: 'browse'; onBack: () => void };

let activeMode: Mode | null = null;
let renderImpl: (() => void) | null = null;

export function showCupFixturesBrowse(onBack: () => void): void {
  activeMode = { kind: 'browse', onBack };
  renderImpl?.();
}

export function initCupFixturesScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('cup-fixtures');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const mode = activeMode;
    if (!mode) return;
    const state = getGameEngine().getState();
    const cup = state.league.premCup;
    const myId = state.player.teamId;
    const teamJson = teamsById.get(myId);
    if (teamJson) el!.style.setProperty('--team-color', teamJson.color);

    const pools = cup
      ? `<div class="cup-pools">${poolTableHtml(cup.pools[0], teamsById, myId)}${poolTableHtml(cup.pools[1], teamsById, myId)}</div>`
      : `<div class="intl-empty">The League Cup hasn't started yet.</div>`;

    // Browse mode.
    const allFixtures = cup ? fixtureListHtml(cup.fixtures, teamsById, myId) : '';
    const bracket = cup?.knockout ? `<div class="cup-section-title">Knockouts</div>${bracketHtml(cup.knockout, teamsById, myId)}` : '';
    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="cup-back" class="app-back" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Back</span>
          </button>
          <span class="app-title">League Cup</span>
          <div class="app-topbar-spacer">${helpButtonHtml('cup-fixtures')}</div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel}</div>
      </div>

      <div class="cup-content">
        <div class="cup-section-title">Pools</div>
        ${pools}
        ${bracket}
        <div class="cup-section-title">Fixtures &amp; results</div>
        <div class="cup-fixtures">${allFixtures || '<div class="intl-empty">No fixtures yet.</div>'}</div>
      </div>
    `;
    el!.querySelector<HTMLButtonElement>('#cup-back')!.addEventListener('click', () => {
      mode.onBack();
    });
  }

  renderImpl = render;
}
