// Club takeover reveal. Fires in the off-season chain after
// BudgetRevealScreen when one or more CLUB_TAKEOVER events landed at
// the end of the just-finished season. The player's own club gets a
// dedicated flavoured card; every other takeover gets a smaller "rest
// of the league" entry below.
//
// Sequence:
//   - The Newcastle Red Bull takeover at the year-1 → year-2 rollover
//     is hardcoded; flavor: 'red_bull'.
//   - From year 3+ a small chance (TAKEOVER_VALUES.randomChancePct%)
//     per not-yet-taken-over club triggers an 'investor'-flavor takeover.
//
// Initialised once per page lifetime. showTakeoverReveal sets the
// payload then re-renders.

import type { RawTeamInput } from '../types/teamData';
import type { TakeoverFlavor } from '../types/gameState';
import type { GameCoordinator } from '../game/GameCoordinator';

export interface TakeoverEntry {
  clubId: string;
  boostAmount: number;
  flavor: TakeoverFlavor;
}

interface RevealPayload {
  takeovers: TakeoverEntry[];
  onContinue: () => void;
}

let active: RevealPayload | null = null;
let renderImpl: (() => void) | null = null;

export function showTakeoverReveal(payload: RevealPayload): void {
  active = payload;
  renderImpl?.();
}

function fmtMillions(amount: number): string {
  return `£${(amount / 1_000_000).toFixed(1)}m`;
}

function flavorBlurb(flavor: TakeoverFlavor, clubName: string): { headline: string; sub: string } {
  if (flavor === 'red_bull') {
    return {
      headline: `${clubName} taken over by Red Bull`,
      sub: 'A high-profile global investor steps in. The owner has signed off on a wage-budget bump for next season.',
    };
  }
  return {
    headline: `${clubName} taken over by a new investor`,
    sub: 'Fresh capital arrives in the boardroom. The owner has signed off on a wage-budget bump for next season.',
  };
}

function teamCrest(team: RawTeamInput, large = false): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="tk-crest${large ? ' tk-crest--lg' : ''}" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

export function initTakeoverRevealScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('takeover-reveal');
  if (!el) return;
  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    if (!active) return;
    const state = getGameEngine().getState();
    const playerId = state.player.teamId;

    // Split takeovers into the player's own (hero card) vs the rest.
    const mine = active.takeovers.find(t => t.clubId === playerId);
    const others = active.takeovers.filter(t => t.clubId !== playerId);
    const playerTeam = teamsById.get(playerId);
    el!.style.setProperty('--team-color', playerTeam?.color ?? '#777');

    const heroCard = mine ? (() => {
      const team = teamsById.get(mine.clubId);
      if (!team) return '';
      const blurb = flavorBlurb(mine.flavor, team.name);
      return `
        <div class="tk-hero" style="--team-color:${team.color}">
          ${teamCrest(team, true)}
          <div class="tk-hero-headline">${blurb.headline}</div>
          <div class="tk-hero-boost">+${fmtMillions(mine.boostAmount)} to wage budget</div>
          <div class="tk-hero-sub">${blurb.sub}</div>
        </div>`;
    })() : '';

    const otherCards = others.length === 0 ? '' : `
      <div class="tk-others-label">${mine ? 'ALSO IN THE LEAGUE' : 'AROUND THE LEAGUE'}</div>
      <div class="tk-others">
        ${others.map(t => {
          const team = teamsById.get(t.clubId);
          if (!team) return '';
          const blurb = flavorBlurb(t.flavor, team.name);
          return `
            <div class="tk-other-row">
              ${teamCrest(team)}
              <div class="tk-other-text">
                <div class="tk-other-headline">${blurb.headline}</div>
                <div class="tk-other-boost">+${fmtMillions(t.boostAmount)} budget</div>
              </div>
            </div>`;
        }).join('')}
      </div>`;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Takeover</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel}</div>
      </div>

      <div id="tk-body">
        ${heroCard}
        ${otherCards}
      </div>

      <div id="tk-footer">
        <button id="tk-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>`;

    el!.querySelector<HTMLButtonElement>('#tk-continue')!.addEventListener('click', () => {
      if (active) active.onContinue();
    });
  }

  renderImpl = render;
}
