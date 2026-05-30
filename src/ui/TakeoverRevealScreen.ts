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
import { animateCounter } from './components/counterUp';
import { launchConfetti } from './Confetti';
import { playId } from './SoundManager';

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

function flavorBlurb(flavor: TakeoverFlavor, clubName: string): { eyebrow: string; headline: string; sub: string; byline: string } {
  if (flavor === 'red_bull') {
    return {
      eyebrow: 'Breaking',
      headline: `New investors take over ${clubName}`,
      sub: 'A high-profile global investor steps in. The owner has signed off on a wage-budget bump for next season.',
      byline: 'The Sports Gazette · Boardroom desk',
    };
  }
  return {
    eyebrow: 'Boardroom',
    headline: `${clubName} taken over by a new investor`,
    sub: 'Fresh capital arrives in the boardroom. The owner has signed off on a wage-budget bump for next season.',
    byline: 'The Sports Gazette · Boardroom desk',
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
    if (playerTeam) el!.style.setProperty('--team-color', playerTeam.color);

    const heroCard = mine ? (() => {
      const team = teamsById.get(mine.clubId);
      if (!team) return '';
      const blurb = flavorBlurb(mine.flavor, team.name);
      const flavorClass = mine.flavor === 'red_bull' ? ' tk-hero--redbull' : ' tk-hero--investor';
      return `
        <div class="tk-hero${flavorClass}" style="--team-color:${team.color}">
          <div class="tk-hero-eyebrow">${blurb.eyebrow}</div>
          ${teamCrest(team, true)}
          <div class="tk-hero-headline">${blurb.headline}</div>
          <div class="tk-hero-boost">+<span class="tk-boost-num">£0.0m</span> to wage budget</div>
          <div class="tk-hero-sub">${blurb.sub}</div>
          <div class="tk-hero-byline">${blurb.byline}</div>
        </div>`;
    })() : '';

    const otherCards = others.length === 0 ? '' : `
      <div class="tk-others-label">${mine ? 'ALSO IN THE LEAGUE' : 'AROUND THE LEAGUE'}</div>
      <div class="tk-others">
        ${others.map((t, i) => {
          const team = teamsById.get(t.clubId);
          if (!team) return '';
          const blurb = flavorBlurb(t.flavor, team.name);
          const rowDelay = Math.min(i, 8) * 60;
          return `
            <div class="tk-other-row" style="--row-delay:${rowDelay}ms">
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

    if (mine) {
      const numEl = el!.querySelector<HTMLSpanElement>('.tk-boost-num');
      if (numEl) {
        animateCounter(numEl, 0, mine.boostAmount, fmtMillions, { duration: 1200, delay: 700 });
      }
      // Player's own club taken over — fire confetti + a soft chime.
      // Confetti is gated by prefers-reduced-motion; the chime always
      // plays (audio is not motion per the v2.220a policy).
      const prm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      const myTeam = teamsById.get(mine.clubId);
      if (!prm && myTeam) {
        window.setTimeout(() => launchConfetti(myTeam.color, 'normal'), 300);
      }
      window.setTimeout(() => playId('stinger.takeover'), 250);
    }
  }

  renderImpl = render;
}
