// European Final screen — blocking overlay shown when a European competition
// final resolves. Displays the result and the champion. Launches confetti
// if the player's team won. Must be dismissed before the weekly flow continues.
//
// Initialised once per page lifetime (initInSeasonScreens). showEuropeanFinal
// re-renders with the current round ref and CTA callback before navigating.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator, EuropeanRoundRef } from '../game/GameCoordinator';
import { launchConfetti } from './Confetti';
import { knockoutWinnerId } from '../game/knockoutWinner';

let _render: (() => void) | null = null;
let _onContinue: () => void = () => {};
let _roundRef: EuropeanRoundRef | null = null;
let _continuing = false;

export function showEuropeanFinal(roundRef: EuropeanRoundRef, onContinue: () => void): void {
  _roundRef = roundRef;
  _onContinue = onContinue;
  _continuing = false;
  _render?.();
}

export function initEuropeanFinalScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('european-final');
  if (!el) return;
  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const rr = _roundRef;
    if (!rr) { el!.innerHTML = ''; return; }
    const state = getGameEngine().getState();
    const comp = state.league[rr.competition];
    const ko = comp?.knockout;
    if (!ko?.final.result) { el!.innerHTML = ''; return; }

    const final = ko.final;
    const champId = ko.championTeamId;
    const playerTeamId = state.player.teamId;
    const playerWon = champId === playerTeamId;
    const champTeam = champId ? teamsById.get(champId) : undefined;
    const champName = champTeam?.name ?? champId ?? 'Unknown';
    const champColor = champTeam?.color ?? '#c9b400';

    const homeTeam = final.homeId ? teamsById.get(final.homeId) : undefined;
    const awayTeam = final.awayId ? teamsById.get(final.awayId) : undefined;
    const homeWon = final.result && final.homeId && final.awayId
      ? knockoutWinnerId(final.homeId, final.awayId, final.result.homeScore, final.result.awayScore, final.result.kickWinner) === final.homeId
      : true;
    const homeInitial = homeTeam?.shortName[0] ?? '?';
    const awayInitial = awayTeam?.shortName[0] ?? '?';

    el!.innerHTML = `
      <div class="euro-final-wrap">
        <div class="euro-final-comp">${rr.compLabel}</div>
        <div class="euro-final-title">Final</div>

        <div class="euro-final-match">
          <div class="euro-final-side${homeWon ? ' euro-final-side--win' : ''}">
            ${homeTeam ? `<div class="euro-final-badge" style="background:${homeTeam.color}">${homeInitial}</div>` : ''}
            <div class="euro-final-name">${homeTeam?.name ?? (final.homeId ?? 'TBC')}</div>
            <div class="euro-final-score">${final.result?.homeScore ?? ''}</div>
          </div>
          <div class="euro-final-sep">–</div>
          <div class="euro-final-side${!homeWon ? ' euro-final-side--win' : ''}">
            <div class="euro-final-score">${final.result?.awayScore ?? ''}</div>
            <div class="euro-final-name">${awayTeam?.name ?? (final.awayId ?? 'TBC')}</div>
            ${awayTeam ? `<div class="euro-final-badge" style="background:${awayTeam.color}">${awayInitial}</div>` : ''}
          </div>
        </div>

        <div class="euro-final-champ-row">
          ${champTeam ? `<div class="euro-final-champ-badge" style="background:${champColor}">${champTeam.shortName[0] ?? '?'}</div>` : ''}
          <div class="euro-final-champ-text">
            <div class="euro-final-champ-label">Champion</div>
            <div class="euro-final-champ-name">${champName}</div>
          </div>
        </div>

        ${playerWon ? '<div class="euro-final-you">🏆 Your team are the champions!</div>' : ''}

        <button id="euro-final-continue" class="cta-pulse euro-final-cta">
          <span>Continue</span>
        </button>
      </div>
    `;

    if (playerWon && champColor) {
      setTimeout(() => launchConfetti(champColor, 'storm'), 200);
    }

    el!.querySelector<HTMLButtonElement>('#euro-final-continue')!.addEventListener('click', () => {
      if (_continuing) return;
      _continuing = true;
      _onContinue();
    });
  }

  _render = render;
}
