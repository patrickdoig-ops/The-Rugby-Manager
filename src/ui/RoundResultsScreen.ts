// Post-match summary of every fixture in the round just completed.
// Reached from the match-result screen's Continue CTA; its own Continue
// CTA advances to the league table (which then has its own Continue → Hub).
//
// Initialised once per page lifetime (like the other in-season screens)
// and re-renders on every `game:fixtureRecorded` so headless AI fixtures
// fill in their scores as they resolve. The `round` to show is set
// imperatively via `setRoundResultsRound(n)` immediately before
// `screenRouter.show('round-results')`.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { Fixture, FixtureResult, GameState } from '../types/gameState';
import { eventBus } from '../utils/eventBus';

let activeRound = 1;
let activeOnContinue: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showRoundResults(round: number, onContinue: () => void): void {
  activeRound = round;
  activeOnContinue = onContinue;
  renderImpl?.();
}

function crest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  const glow = `box-shadow: 0 0 12px color-mix(in oklch, ${team.color} 35%, transparent), inset 0 1px 0 rgba(255,255,255,0.18);`;
  return `<div class="rr-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent);${glow}"><span>${initial}</span></div>`;
}

export function initRoundResultsScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('round-results');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function roundFixtures(state: GameState): Array<{ fixture: Fixture; result: FixtureResult | undefined }> {
    return state.league.fixtures
      .filter(f => f.round === activeRound)
      .map(fixture => ({
        fixture,
        result: state.league.results.find(r =>
          r.round === fixture.round && r.homeId === fixture.homeId && r.awayId === fixture.awayId
        ),
      }));
  }

  function render(): void {
    const state = getGameEngine().getState();
    const playerTeamId = state.player.teamId;
    const fixtures = roundFixtures(state);

    const rowsHtml = fixtures.map(({ fixture, result }, i) => {
      const home = teamsById.get(fixture.homeId)!;
      const away = teamsById.get(fixture.awayId)!;
      const isPlayer = fixture.homeId === playerTeamId || fixture.awayId === playerTeamId;
      const rowDelay = Math.min(i, 16) * 25;
      const mid = result
        ? `<span class="rr-score">${result.homeScore}–${result.awayScore}</span>`
        : `<span class="rr-pending">…</span>`;
      const total = result ? result.homeScore + result.awayScore : 0;
      const hp = total > 0 ? (result!.homeScore / total) * 100 : 50;
      const ap = 100 - hp;
      const marginBar = result
        ? `<div class="rr-margin-bar">
             <div style="width:${hp.toFixed(1)}%;background:${home.color};opacity:${result.homeScore >= result.awayScore ? 1 : 0.45}"></div>
             <div style="width:${ap.toFixed(1)}%;background:${away.color};opacity:${result.awayScore >= result.homeScore ? 1 : 0.45}"></div>
           </div>`
        : `<div class="rr-margin-bar rr-margin-bar--pending"></div>`;
      return `
        <div class="rr-row${isPlayer ? ' rr-row--me' : ''}" style="--row-delay: ${rowDelay}ms">
          <div class="rr-fixture-line">
            <div class="rr-team rr-team--home">
              ${crest(home)}
              <span class="rr-team-name">${home.shortName}</span>
              <span class="rr-venue-pill">H</span>
            </div>
            ${mid}
            <div class="rr-team rr-team--away">
              <span class="rr-team-name">${away.shortName}</span>
              ${crest(away)}
            </div>
          </div>
          ${marginBar}
        </div>
      `;
    }).join('');

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Round ${activeRound} Results</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel}</div>
      </div>
      <div id="rr-list">${rowsHtml}</div>
      <div id="rr-footer">
        <button id="rr-continue" class="cta-pulse">
          <span>League Table</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#rr-continue')!.addEventListener('click', () => {
      activeOnContinue();
    });
  }

  renderImpl = render;

  // Re-render as each headless AI fixture resolves so pending scores fill in.
  eventBus.on('game:fixtureRecorded', () => render());
}
