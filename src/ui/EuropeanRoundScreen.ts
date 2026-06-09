// European round viewer — shown in the weekly flow when a European pool or
// knockout round has completed and the player needs to step through it.
// Displays all fixtures for the round across the relevant competition, then
// lets the player tap Continue to return to the weekly flow.
//
// Initialised once per page lifetime (initInSeasonScreens). showEuropeanRound
// re-renders with the current round ref and CTA callback before navigating.

import type { RawTeamInput } from '../types/teamData';
import type { EuropeanKnockoutMatch } from '../types/gameState';
import type { GameCoordinator, EuropeanRoundRef } from '../game/GameCoordinator';
import { euroFixtureListHtml, euroPoolTableHtml } from './components/europeanViews';
import { helpButtonHtml } from './help/helpButton';

let _render: (() => void) | null = null;
let _onContinue: () => void = () => {};
let _roundRef: EuropeanRoundRef | null = null;

export function showEuropeanRound(roundRef: EuropeanRoundRef, onContinue: () => void): void {
  _roundRef = roundRef;
  _onContinue = onContinue;
  _render?.();
}

export function initEuropeanRoundScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('european-round');
  if (!el) return;
  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const rr = _roundRef;
    if (!rr) { el!.innerHTML = ''; return; }
    const state = getGameEngine().getState();
    const comp = state.league[rr.competition];
    if (!comp) { el!.innerHTML = ''; return; }

    const playerTeamId = state.player.teamId;
    let fixturesHtml = '';

    if (rr.roundKey.startsWith('pool:')) {
      const roundNum = parseInt(rr.roundKey.split(':')[1] ?? '1', 10);
      const fxs = comp.fixtures.filter(f => f.round === roundNum);
      fixturesHtml = euroFixtureListHtml(fxs, teamsById, playerTeamId);
      // Show pool standings below fixtures for context
      const standings = comp.pools.map(p =>
        euroPoolTableHtml(p, teamsById, playerTeamId),
      ).join('');
      fixturesHtml += `<div class="cup-section-title">Pool Standings</div><div class="cup-pools">${standings}</div>`;
    } else {
      const ko = comp.knockout;
      if (ko) {
        const matches =
          rr.roundKey === 'r16' ? ko.r16
          : rr.roundKey === 'qf' ? ko.quarterfinals
          : rr.roundKey === 'sf' ? (ko.semifinals as Array<typeof ko.r16[0]>)
          : [ko.final];
        fixturesHtml = buildKoRoundHtml(matches, teamsById, playerTeamId);
      }
    }

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <span class="app-title">${rr.compLabel}</span>
          <div class="app-topbar-spacer">${helpButtonHtml('european-round')}</div>
        </div>
        <div class="app-eyebrow">${rr.label}</div>
      </div>
      <div class="cup-content">
        <div class="cup-section-title">Results</div>
        <div class="cup-fixtures">${fixturesHtml}</div>
      </div>
      <div class="euro-round-footer">
        <button id="euro-round-continue" class="cta-pulse">
          <span>Continue</span>
        </button>
      </div>
    `;
    el!.querySelector<HTMLButtonElement>('#euro-round-continue')!.addEventListener('click', () => {
      _onContinue();
    });
  }

  _render = render;
}

function buildKoRoundHtml(
  matches: EuropeanKnockoutMatch[],
  teamsById: Map<string, RawTeamInput>,
  highlightId: string,
): string {
  return matches.map(m => {
    const home = m.homeId ? (teamsById.get(m.homeId)?.shortName ?? m.homeId) : 'TBC';
    const away = m.awayId ? (teamsById.get(m.awayId)?.shortName ?? m.awayId) : 'TBC';
    const homeBadge = m.homeId ? teamBadge(teamsById.get(m.homeId)) : '<span class="cup-badge"></span>';
    const awayBadge = m.awayId ? teamBadge(teamsById.get(m.awayId)) : '<span class="cup-badge"></span>';
    const mine = m.homeId === highlightId || m.awayId === highlightId;
    const score = m.result
      ? `<span class="cup-fx-score">${m.result.homeScore}–${m.result.awayScore}</span>`
      : '<span class="cup-fx-vs">v</span>';
    return `
      <div class="cup-fx${mine ? ' cup-fx--me' : ''}">
        <span class="cup-fx-side cup-fx-home">${homeBadge}<span class="cup-fx-name">${home}</span></span>
        ${score}
        <span class="cup-fx-side cup-fx-away"><span class="cup-fx-name">${away}</span>${awayBadge}</span>
      </div>`;
  }).join('');
}

function teamBadge(team: RawTeamInput | undefined): string {
  if (!team) return '<span class="cup-badge"></span>';
  const initial = team.shortName[0] ?? '?';
  return `<span class="cup-badge" style="background:${team.color}">${initial}</span>`;
}
