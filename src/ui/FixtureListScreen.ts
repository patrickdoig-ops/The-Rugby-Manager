import type { RawTeamInput } from '../engine/MatchCoordinator';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { Fixture, FixtureResult, GameState, TeamStanding } from '../types/gameState';
import { sortStandings } from '../game/leagueTable';
import { eventBus } from '../utils/eventBus';

function miniCrest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 65%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="fl-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

function standingsRow(s: TeamStanding, rank: number, teamsById: Map<string, RawTeamInput>, highlight: boolean): string {
  const team = teamsById.get(s.teamId);
  const name = team?.shortName ?? s.teamId;
  const cls = highlight ? 'fl-table-row fl-table-row--me' : 'fl-table-row';
  const diff = `${s.pointsDiff >= 0 ? '+' : ''}${s.pointsDiff}`;
  return `
    <div class="${cls}">
      <span class="fl-table-rank">${rank}</span>
      <span class="fl-table-name">${name}</span>
      <span class="fl-table-num">${s.played}</span>
      <span class="fl-table-num">${s.won}</span>
      <span class="fl-table-num">${s.drawn}</span>
      <span class="fl-table-num">${s.lost}</span>
      <span class="fl-table-num">${diff}</span>
      <span class="fl-table-pts">${s.leaguePoints}</span>
    </div>
  `;
}

export function initFixtureListScreen(
  gameEngine: GameCoordinator,
  allTeams: RawTeamInput[],
  onPlay: (homeTeam: RawTeamInput, awayTeam: RawTeamInput, playerSide: 'home' | 'away', round: number) => void,
  onBack: () => void,
): void {
  const el = document.getElementById('fixture-list');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const playerTeamId = gameEngine.getState().player.teamId;
  const playerTeam = teamsById.get(playerTeamId)!;

  // Player's fixture list: every fixture that includes the player's team, in
  // round order. Built once from GameState — game-engine events drive re-renders.
  function playerFixtures(state: GameState): Array<{ fixture: Fixture; playerSide: 'home' | 'away'; result: FixtureResult | undefined }> {
    return state.league.fixtures
      .filter(f => f.homeId === playerTeamId || f.awayId === playerTeamId)
      .sort((a, b) => a.round - b.round)
      .map(fixture => ({
        fixture,
        playerSide: fixture.homeId === playerTeamId ? 'home' : 'away',
        result: state.league.results.find(r => r.round === fixture.round && r.homeId === fixture.homeId && r.awayId === fixture.awayId),
      }));
  }

  function render(): void {
    const state = gameEngine.getState();
    const totalRounds = state.league.fixtures.reduce((max, f) => Math.max(max, f.round), 0);
    const myFixtures = playerFixtures(state);
    const nextFixture = gameEngine.getCurrentFixture();
    const seasonComplete = nextFixture === null;

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

    const sorted = sortStandings(state.league.standings);
    const tableRows = sorted.map((s, i) =>
      standingsRow(s, i + 1, teamsById, s.teamId === playerTeamId)
    ).join('');

    const footerHtml = seasonComplete
      ? `<p id="fl-season-done">Season complete</p>`
      : `
        <button id="fl-play-next" aria-label="Play next game">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd"/></svg>
          <span>Play next game</span>
        </button>
      `;

    el!.innerHTML = `
      <div id="fl-topbar">
        <button id="fl-back" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Teams</span>
        </button>
        <span id="fl-title">Season Fixtures</span>
        <div style="width:72px"></div>
      </div>
      <div id="fl-eyebrow">${state.calendar.seasonLabel} · ${state.calendar.date} · Week ${state.calendar.week} of ${totalRounds}</div>
      <div id="fl-standings">
        <div class="fl-table-head">
          <span class="fl-table-rank">#</span>
          <span class="fl-table-name">Club</span>
          <span class="fl-table-num">P</span>
          <span class="fl-table-num">W</span>
          <span class="fl-table-num">D</span>
          <span class="fl-table-num">L</span>
          <span class="fl-table-num">PD</span>
          <span class="fl-table-pts">Pts</span>
        </div>
        ${tableRows}
      </div>
      <div id="fl-list">${fixturesHtml}</div>
      <div id="fl-footer">${footerHtml}</div>
    `;

    el!.querySelector<HTMLButtonElement>('#fl-back')!.addEventListener('click', () => {
      onBack();
    });

    if (!seasonComplete) {
      el!.querySelector<HTMLButtonElement>('#fl-play-next')!.addEventListener('click', () => {
        const home = teamsById.get(nextFixture!.homeId)!;
        const away = teamsById.get(nextFixture!.awayId)!;
        const playerSide: 'home' | 'away' = nextFixture!.homeId === playerTeam.id ? 'home' : 'away';
        onPlay(home, away, playerSide, nextFixture!.round);
      });
    }
  }

  // Re-render whenever the season state changes. Subscriptions live for the
  // lifetime of the screen module; they cost nothing while the screen is
  // hidden because the DOM updates only run when render() is called.
  eventBus.on('game:fixtureRecorded', () => render());
  eventBus.on('game:weekAdvanced', () => render());
  eventBus.on('game:initialized', () => render());

  render();
}
