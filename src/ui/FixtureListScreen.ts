// Read-only reference view of the player's full season schedule.
//
// Since the Hub took over the active "Go to next match" CTA, this screen is
// passive: it lists every fixture for the player's team in round order with
// scores filled in for completed matches. Reached from the Hub's Fixtures
// tile; back navigates to the Hub.

import type { RawTeamInput } from '../engine/MatchCoordinator';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { Fixture, FixtureResult, GameState } from '../types/gameState';
import { eventBus } from '../utils/eventBus';

function miniCrest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 65%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="fl-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

export function initFixtureListScreen(
  gameEngine: GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
): void {
  const el = document.getElementById('fixture-list');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const playerTeamId = gameEngine.getState().player.teamId;

  function playerFixtures(state: GameState): Array<{ fixture: Fixture; result: FixtureResult | undefined }> {
    return state.league.fixtures
      .filter(f => f.homeId === playerTeamId || f.awayId === playerTeamId)
      .sort((a, b) => a.round - b.round)
      .map(fixture => ({
        fixture,
        result: state.league.results.find(r => r.round === fixture.round && r.homeId === fixture.homeId && r.awayId === fixture.awayId),
      }));
  }

  function render(): void {
    const state = gameEngine.getState();
    const totalRounds = state.league.fixtures.reduce((max, f) => Math.max(max, f.round), 0);
    const myFixtures = playerFixtures(state);
    const nextFixture = gameEngine.getCurrentFixture();

    const fixturesHtml = myFixtures.map(({ fixture, result }) => {
      const home = teamsById.get(fixture.homeId)!;
      const away = teamsById.get(fixture.awayId)!;
      const isComplete = !!result;
      const isActive = !isComplete && fixture.round === nextFixture?.round;
      const rowClass = isComplete ? 'fl-row--complete' : isActive ? 'fl-row--active' : 'fl-row--locked';
      const midEl = isComplete
        ? `<span class="fl-score">${result.homeScore}–${result.awayScore}</span>`
        : `<span class="fl-vs">vs</span>`;
      return `
        <div class="fl-row ${rowClass}">
          <div class="fl-round">
            <span class="fl-round-label">RND</span>
            <span class="fl-round-num">${fixture.round}</span>
          </div>
          <div class="fl-matchup">
            <div class="fl-team fl-team--home">
              ${miniCrest(home)}
              <span class="fl-team-name">${home.shortName}</span>
            </div>
            ${midEl}
            <div class="fl-team fl-team--away">
              <span class="fl-team-name">${away.shortName}</span>
              ${miniCrest(away)}
            </div>
          </div>
        </div>
      `;
    }).join('');

    el!.innerHTML = `
      <div id="fl-topbar">
        <button id="fl-back" aria-label="Back to hub">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Hub</span>
        </button>
        <span id="fl-title">Season Fixtures</span>
        <div style="width:72px"></div>
      </div>
      <div id="fl-eyebrow">${state.calendar.seasonLabel} · ${state.calendar.date} · Week ${state.calendar.week} of ${totalRounds}</div>
      <div id="fl-list">${fixturesHtml}</div>
    `;

    el!.querySelector<HTMLButtonElement>('#fl-back')!.addEventListener('click', () => {
      onBack();
    });
  }

  // Re-render whenever the season state changes. Subscriptions live for the
  // lifetime of the screen module; they cost nothing while the screen is
  // hidden because the DOM updates only run when render() is called.
  eventBus.on('game:fixtureRecorded', () => render());
  eventBus.on('game:weekAdvanced', () => render());
  eventBus.on('game:initialized', () => render());

  render();
}
