// Premiership knockout bracket — two semi-finals and a final at Twickenham.
// Reached from the post-match Continue chain after the last regular-season
// fixture is recorded, then re-entered after every playoff result so the
// player can see the cascade fill in. CTA label adapts to the next action:
//   - player has a pending playoff match → "Continue" (next: PreMatch)
//   - player eliminated / no match in current stage → "Watch the Semi-Finals" / "Watch the Final"
//   - champion decided → "Continue" (next: EndOfSeason)
//
// Initialised once per page lifetime, like the other in-season screens.
// renderImpl is captured so showPlayoffBracket() can re-render after a
// state mutation without re-init.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { GameState, PlayoffMatch, PlayoffState } from '../types/gameState';
import { eventBus } from '../utils/eventBus';

let activeOnContinue: () => void = () => {};
let activeCtaLabel: string = 'Continue';
let renderImpl: (() => void) | null = null;

export function showPlayoffBracket(onContinue: () => void, ctaLabel = 'Continue'): void {
  activeOnContinue = onContinue;
  activeCtaLabel = ctaLabel;
  renderImpl?.();
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${dd} ${MONTH_ABBR[d.getUTCMonth()]}`;
}

function crestHtml(team: RawTeamInput | undefined): string {
  if (!team) {
    return `<div class="pb-crest pb-crest--tbc"><span>?</span></div>`;
  }
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="pb-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

function matchSideHtml(
  teamId: string | null,
  seed: 1 | 2 | 3 | 4 | null,
  score: number | null,
  teamsById: Map<string, RawTeamInput>,
  playerId: string,
  align: 'left' | 'right',
  winnerId: string | null,
): string {
  const team = teamId ? teamsById.get(teamId) : undefined;
  const isMe   = teamId !== null && teamId === playerId;
  const isWin  = winnerId !== null && teamId === winnerId;
  const cls = [
    'pb-side',
    `pb-side--${align}`,
    isMe ? 'pb-side--me' : '',
    isWin ? 'pb-side--won' : '',
  ].filter(Boolean).join(' ');
  const name = team?.shortName ?? 'TBC';
  const seedBadge = seed !== null ? `<span class="pb-seed">${seed}</span>` : '';
  const scoreCell = score !== null ? `<span class="pb-score">${score}</span>` : `<span class="pb-score pb-score--empty">–</span>`;
  if (align === 'left') {
    return `<div class="${cls}">${seedBadge}${crestHtml(team)}<span class="pb-name">${name}</span>${scoreCell}</div>`;
  }
  return `<div class="${cls}">${scoreCell}<span class="pb-name">${name}</span>${crestHtml(team)}${seedBadge}</div>`;
}

function matchCardHtml(
  match: PlayoffMatch,
  teamsById: Map<string, RawTeamInput>,
  playerId: string,
  variant: 'sf' | 'final',
): string {
  const winnerId = match.result
    ? (match.result.homeScore >= match.result.awayScore ? match.homeId : match.awayId)
    : null;
  const homeScore = match.result?.homeScore ?? null;
  const awayScore = match.result?.awayScore ?? null;
  const dateChip = `<span class="pb-date">${formatDateShort(match.date)}</span>`;
  const venue = variant === 'final'
    ? `<span class="pb-venue">Twickenham · Neutral</span>`
    : '';
  const label = variant === 'final' ? 'FINAL' : match.kind === 'semifinal_1' ? 'SEMI-FINAL · 1 v 4' : 'SEMI-FINAL · 2 v 3';
  return `
    <div class="pb-card pb-card--${variant}${match.result ? ' pb-card--played' : ''}">
      <div class="pb-card-header">
        <span class="pb-card-label">${label}</span>
        ${dateChip}
      </div>
      <div class="pb-card-body">
        ${matchSideHtml(match.homeId, match.homeSeed, homeScore, teamsById, playerId, 'left',  winnerId)}
        <div class="pb-vs">v</div>
        ${matchSideHtml(match.awayId, match.awaySeed, awayScore, teamsById, playerId, 'right', winnerId)}
      </div>
      ${venue ? `<div class="pb-card-footer">${venue}</div>` : ''}
    </div>`;
}

function championBannerHtml(playoffs: PlayoffState, teamsById: Map<string, RawTeamInput>, playerId: string): string {
  if (!playoffs.championTeamId) return '';
  const champion = teamsById.get(playoffs.championTeamId);
  if (!champion) return '';
  const isMe = playoffs.championTeamId === playerId;
  return `
    <div class="pb-champion${isMe ? ' pb-champion--me' : ''}" style="--team-color:${champion.color}">
      <div class="pb-champion-label">PREMIERSHIP CHAMPIONS</div>
      ${crestHtml(champion)}
      <div class="pb-champion-name">${champion.name}</div>
    </div>`;
}

function bracketSubtitle(playoffs: PlayoffState): string {
  if (playoffs.championTeamId) return 'Season Complete';
  const allSfDone = playoffs.semifinals.every(m => m.result);
  if (allSfDone) return 'Final';
  return 'Semi-Finals';
}

export function initPlayoffBracketScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('playoff-bracket');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state: GameState = getGameEngine().getState();
    const playoffs = state.league.playoffs;
    const playerId = state.player.teamId;

    if (!playoffs) {
      // Defensive: shouldn't happen — main.ts only routes here when the
      // bracket exists. Render a minimal placeholder so the screen isn't
      // a blank rectangle if it does.
      el!.innerHTML = `
        <div class="app-header">
          <div class="app-topbar">
            <div class="app-topbar-spacer"></div>
            <span class="app-title">Playoffs</span>
            <div class="app-topbar-spacer"></div>
          </div>
        </div>
        <div id="pb-empty">No playoff bracket active.</div>
        <div id="pb-footer">
          <button id="pb-continue" class="cta-pulse"><span>${activeCtaLabel}</span></button>
        </div>`;
      el!.querySelector<HTMLButtonElement>('#pb-continue')!.addEventListener('click', () => activeOnContinue());
      return;
    }

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Premiership Playoffs</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · ${bracketSubtitle(playoffs)}</div>
      </div>

      <div id="pb-bracket">
        <div id="pb-semifinals">
          ${matchCardHtml(playoffs.semifinals[0], teamsById, playerId, 'sf')}
          ${matchCardHtml(playoffs.semifinals[1], teamsById, playerId, 'sf')}
        </div>
        <div id="pb-final-wrap">
          ${matchCardHtml(playoffs.final, teamsById, playerId, 'final')}
        </div>
        ${championBannerHtml(playoffs, teamsById, playerId)}
      </div>

      <div id="pb-footer">
        <button id="pb-continue" class="cta-pulse">
          <span>${activeCtaLabel}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>`;

    el!.querySelector<HTMLButtonElement>('#pb-continue')!.addEventListener('click', () => activeOnContinue());
  }

  renderImpl = render;
  // Re-render whenever the bracket updates so a fixture-resolution
  // notification (e.g. AI sim completing) refreshes the visible state.
  eventBus.on('game:bracketSeeded',   () => render());
  eventBus.on('game:playoffsUpdated', () => render());
}
