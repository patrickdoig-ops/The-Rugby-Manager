// Read-only reference view of the season schedule.
//
// Three modes selectable via the toggle bar above the list:
//   'team' — every fixture for the player's team across the season
//   'next' — the upcoming round across the whole league
//   'all'  — full 18-round schedule, grouped by round
//
// Initialised once per page lifetime; mode persists across re-renders
// triggered by `game:*` events. Reached from the Hub's Fixtures tile;
// back navigates to the Hub.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { Fixture, FixtureResult, GameState } from '../types/gameState';
import { eventBus } from '../utils/eventBus';

type Mode = 'team' | 'next' | 'all';

function miniCrest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="fl-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

export function initFixtureListScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
): void {
  const el = document.getElementById('fixture-list');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  let activeMode: Mode = 'team';

  function resultFor(state: GameState, fixture: Fixture): FixtureResult | undefined {
    return state.league.results.find(r =>
      r.round === fixture.round && r.homeId === fixture.homeId && r.awayId === fixture.awayId
    );
  }

  function fixtureRow(fixture: Fixture, result: FixtureResult | undefined, nextRound: number, playerTeamId: string): string {
    const home = teamsById.get(fixture.homeId)!;
    const away = teamsById.get(fixture.awayId)!;
    const isComplete = !!result;
    const isActive = !isComplete && fixture.round === nextRound;
    const isMine = !isActive && (fixture.homeId === playerTeamId || fixture.awayId === playerTeamId);
    const stateCls = isComplete ? 'fl-row--complete' : isActive ? 'fl-row--active' : 'fl-row--locked';
    const meCls = isMine ? ' fl-row--me' : '';
    const midEl = isComplete
      ? `<span class="fl-score">${result.homeScore}–${result.awayScore}</span>`
      : `<span class="fl-vs">vs</span>`;
    return `
      <div class="fl-row ${stateCls}${meCls}">
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
  }

  function listHtml(state: GameState, nextRound: number, playerTeamId: string): string {
    const sorted = [...state.league.fixtures].sort((a, b) => a.round - b.round);

    if (activeMode === 'team') {
      const mine = sorted.filter(f => f.homeId === playerTeamId || f.awayId === playerTeamId);
      return mine.map(f => fixtureRow(f, resultFor(state, f), nextRound, playerTeamId)).join('');
    }

    if (activeMode === 'next') {
      if (nextRound === -1) return `<div class="fl-empty">Season complete</div>`;
      const fixtures = sorted.filter(f => f.round === nextRound);
      return fixtures.map(f => fixtureRow(f, resultFor(state, f), nextRound, playerTeamId)).join('');
    }

    // 'all' — group by round with a section header per block.
    const byRound = new Map<number, Fixture[]>();
    for (const f of sorted) {
      if (!byRound.has(f.round)) byRound.set(f.round, []);
      byRound.get(f.round)!.push(f);
    }
    return [...byRound.entries()].map(([round, fs]) => `
      <div class="fl-round-header">Round ${round}</div>
      ${fs.map(f => fixtureRow(f, resultFor(state, f), nextRound, playerTeamId)).join('')}
    `).join('');
  }

  function render(): void {
    const gameEngine = getGameEngine();
    const state = gameEngine.getState();
    const playerTeamId = state.player.teamId;
    const playerTeam = teamsById.get(playerTeamId);
    const totalRounds = state.league.fixtures.reduce((max, f) => Math.max(max, f.round), 0);
    const nextFixture = gameEngine.getCurrentFixture();
    const nextRound = nextFixture?.round ?? -1;
    const teamLabel = playerTeam?.shortName ?? 'My team';

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="fl-back" class="app-back" aria-label="Back to hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Season Fixtures</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · ${state.calendar.date} · Week ${state.calendar.week} of ${totalRounds}</div>
      </div>
      <div id="fl-toggle" role="tablist">
        <button class="fl-toggle-btn${activeMode === 'team' ? ' active' : ''}" data-mode="team" role="tab">${teamLabel}</button>
        <button class="fl-toggle-btn${activeMode === 'next' ? ' active' : ''}" data-mode="next" role="tab">Next round</button>
        <button class="fl-toggle-btn${activeMode === 'all'  ? ' active' : ''}" data-mode="all"  role="tab">All fixtures</button>
      </div>
      <div id="fl-list">${listHtml(state, nextRound, playerTeamId)}</div>
    `;

    el!.querySelector<HTMLButtonElement>('#fl-back')!.addEventListener('click', () => onBack());
    el!.querySelector<HTMLElement>('#fl-toggle')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.fl-toggle-btn');
      if (!btn) return;
      const next = btn.dataset.mode as Mode;
      if (next === activeMode) return;
      activeMode = next;
      render();
    });
  }

  eventBus.on('game:fixtureRecorded', () => render());
  eventBus.on('game:weekAdvanced', () => render());
  eventBus.on('game:initialized', () => render());

  render();
}
