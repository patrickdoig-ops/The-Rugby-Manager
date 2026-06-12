// Prem Cup results recap — shown after the international-break block plays
// out, before the training-impact + international-return recaps. Renders the
// block's cup results, the updated pool tables, and (leg 2) the knockout
// bracket with the champion. One-shot init from main.ts.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { poolTableHtml, fixtureListHtml, bracketHtml } from './components/cupViews';
import { helpButtonHtml } from './help/helpButton';

let activeLeg: 0 | 1 | 2 | null = null;
let activeOnContinue: (() => void) | null = null;
let renderImpl: (() => void) | null = null;

export function showCupResults(leg: 0 | 1 | 2, onContinue: () => void): void {
  activeLeg = leg;
  activeOnContinue = onContinue;
  renderImpl?.();
}

export function initCupResultsScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('cup-results');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const leg = activeLeg;
    const onContinue = activeOnContinue;
    if (leg === null || !onContinue) return;
    const state = getGameEngine().getState();
    const cup = state.league.premCup;
    const myId = state.player.teamId;
    const teamJson = teamsById.get(myId);
    if (teamJson) el!.style.setProperty('--team-color', teamJson.color);

    const legFixtures = cup ? cup.fixtures.filter(f => f.leg === leg && f.result) : [];
    const mineThisBlock = legFixtures.filter(f => f.homeId === myId || f.awayId === myId);

    const pools = cup
      ? `<div class="cup-pools">${poolTableHtml(cup.pools[0], teamsById, myId)}${poolTableHtml(cup.pools[1], teamsById, myId)}</div>`
      : '';
    const bracket = leg === 2 && cup?.knockout
      ? `<div class="cup-section-title">Knockouts</div>${bracketHtml(cup.knockout, teamsById, myId)}`
      : '';

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">League Cup Results</span>
          <div class="app-topbar-spacer">${helpButtonHtml('cup-results')}</div>
        </div>
        <div class="app-eyebrow">${leg === 0 ? 'Pre-Season' : leg === 1 ? 'Pool Stage — Leg 1' : 'Pool Stage — Leg 2 + Knockouts'} · ${state.calendar.seasonLabel}</div>
      </div>

      <div class="cup-content">
        <div class="cup-section-title">Your block results</div>
        <div class="cup-fixtures">${fixtureListHtml(mineThisBlock, teamsById, myId) || '<div class="intl-empty">No cup fixtures this block.</div>'}</div>

        ${bracket}

        <div class="cup-section-title">Pools</div>
        ${pools}
      </div>

      <div class="cup-footer">
        <button id="cup-results-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#cup-results-continue')!.addEventListener('click', () => onContinue());
  }

  renderImpl = render;
}
