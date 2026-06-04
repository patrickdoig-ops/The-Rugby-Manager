// Prem Cup fixtures screen. Two modes:
//   - showCupFixturesPreBlock(begin, onContinue) — in the break flow. Shows
//     this block's fixtures + both pool tables + the Assistant-Manager
//     direction toggle (best XV / rest the first 15). Continue passes the
//     chosen direction back.
//   - showCupFixturesBrowse(onBack) — mid-season browse from the League menu.
//     Read-only: full pool tables + both legs' fixtures + bracket if seeded.
// One-shot init from main.ts.

import type { BreakBeginResult, PreSeasonBlockResult, GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { poolTableHtml, fixtureListHtml, bracketHtml } from './components/cupViews';

type Mode =
  | { kind: 'pre_block'; begin: BreakBeginResult | PreSeasonBlockResult; onContinue: (direction: 'best' | 'rest_first_15') => void }
  | { kind: 'browse'; onBack: () => void };

let activeMode: Mode | null = null;
let draftDirection: 'best' | 'rest_first_15' = 'best';
let renderImpl: (() => void) | null = null;

export function showCupFixturesPreBlock(
  begin: BreakBeginResult | PreSeasonBlockResult,
  onContinue: (direction: 'best' | 'rest_first_15') => void,
): void {
  activeMode = { kind: 'pre_block', begin, onContinue };
  draftDirection = begin.cupDirection;
  renderImpl?.();
}

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

    if (mode.kind === 'pre_block') {
      const legFixtures = mode.begin.cupFixturesThisBlock;
      const cupLeg = 'cupLeg' in mode.begin ? mode.begin.cupLeg : 0;
      const legLabel = cupLeg === 0 ? 'Pre-Season'
                     : cupLeg === 1 ? 'Pool Stage — Leg 1'
                     :                'Pool Stage — Leg 2 + Knockouts';
      el!.innerHTML = `
        <div class="app-header">
          <div class="app-topbar">
            <div class="app-topbar-spacer"></div>
            <span class="app-title">League Cup</span>
            <div class="app-topbar-spacer"></div>
          </div>
          <div class="app-eyebrow">${legLabel} · ${state.calendar.seasonLabel}</div>
        </div>

        <div class="cup-content">
          <div class="cup-direction">
            <div class="cup-direction-title">Assistant Manager</div>
            <div class="cup-direction-note">The Assistant Manager runs these games. How should they pick the squad?</div>
            <div class="cup-toggle" role="group" aria-label="Cup selection direction">
              <button class="cup-toggle-opt${draftDirection === 'best' ? ' cup-toggle-opt--on' : ''}" data-dir="best">
                <span class="cup-toggle-label">Best available</span>
                <span class="cup-toggle-sub">Field the strongest 23</span>
              </button>
              <button class="cup-toggle-opt${draftDirection === 'rest_first_15' ? ' cup-toggle-opt--on' : ''}" data-dir="rest_first_15">
                <span class="cup-toggle-label">Rest the starters</span>
                <span class="cup-toggle-sub">Keep your first XV fresh</span>
              </button>
            </div>
          </div>

          <div class="cup-section-title">Your block fixtures</div>
          <div class="cup-fixtures">${fixtureListHtml(legFixtures, teamsById, myId) || '<div class="intl-empty">No cup fixtures this block.</div>'}</div>

          <div class="cup-section-title">Pools</div>
          ${pools}
        </div>

        <div class="cup-footer">
          <button id="cup-continue" class="cta-pulse">
            <span>Set training plan</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </button>
        </div>
      `;
      el!.querySelectorAll<HTMLButtonElement>('.cup-toggle-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          draftDirection = btn.dataset.dir === 'rest_first_15' ? 'rest_first_15' : 'best';
          renderImpl?.();
        });
      });
      el!.querySelector<HTMLButtonElement>('#cup-continue')!.addEventListener('click', () => {
        (mode as Extract<Mode, { kind: 'pre_block' }>).onContinue(draftDirection);
      });
      return;
    }

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
          <div class="app-topbar-spacer"></div>
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
      (mode as Extract<Mode, { kind: 'browse' }>).onBack();
    });
  }

  renderImpl = render;
}
