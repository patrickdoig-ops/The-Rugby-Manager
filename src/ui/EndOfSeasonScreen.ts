// End-of-season recap. Reached from the post-match Continue chain when
// the league has no more fixtures for the player's team. Shows final
// standings, the player's season summary, and league-leader cards (top
// scorer by tries, MVP by avg rating with min appearances).
//
// CTA → RolloverScreen (which animates the off-season — aging, retirements
// — and bridges to the next year's Hub).
//
// Initialised once per page lifetime, like the other in-season screens.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { GameState, TeamStanding } from '../types/gameState';
import type { Player } from '../types/player';
import { sortStandings } from '../game/leagueTable';
import { SEASON_AWARDS } from '../engine/balance/career';
import { animateCounter } from './components/counterUp';
import { launchConfetti } from './Confetti';
import { playCue } from './SoundManager';

let activeOnContinue: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showEndOfSeason(onContinue: () => void): void {
  activeOnContinue = onContinue;
  renderImpl?.();
}

function teamCrest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="eos-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

// Gold trophy mark next to the league champion's name. Inline SVG so it
// inherits CSS sizing + currentColor where useful.
const TROPHY_SVG = `<svg class="eos-trophy" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4h10v2h3v3a4 4 0 0 1-4 4 5 5 0 0 1-4.05 4.92V20H15a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h3v-2.08A5 5 0 0 1 7.95 13 4 4 0 0 1 4 9V6h3V4Zm10 4V8h3v1a2 2 0 0 1-2 2v-3Zm-10 0H6v1a2 2 0 0 0 2 2V8H7Z"/></svg>`;

// Top-3 medal discs. Empty string for ranks below 3.
function medalSvg(rank: number): string {
  if (rank > 3) return '';
  const cls = rank === 1 ? 'eos-medal eos-medal--gold'
            : rank === 2 ? 'eos-medal eos-medal--silver'
            :              'eos-medal eos-medal--bronze';
  return `<svg class="${cls}" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="14" r="7"/><path d="M9 2h2l-1 4-1-4Zm4 0h2l-1 4-1-4Z" opacity="0.7"/></svg>`;
}

function clubOf(state: GameState, rosterId: number): string | null {
  const club = state.career.clubs.find(c => c.squad.includes(rosterId));
  return club?.id ?? null;
}

function topScorer(state: GameState): Player | null {
  let best: Player | null = null;
  let mostTries = 0;
  for (const idStr of Object.keys(state.career.roster).sort((a, b) => +a - +b)) {
    const p = state.career.roster[+idStr];
    if (p.seasonStats.tries > mostTries) {
      mostTries = p.seasonStats.tries;
      best = p;
    }
  }
  return best;
}

function mvp(state: GameState): Player | null {
  let best: Player | null = null;
  let bestAvg = -1;
  for (const idStr of Object.keys(state.career.roster).sort((a, b) => +a - +b)) {
    const p = state.career.roster[+idStr];
    if (p.seasonStats.appearances < SEASON_AWARDS.mvpMinAppearances) continue;
    const avg = p.seasonStats.ratingSum / p.seasonStats.appearances;
    if (avg > bestAvg) { bestAvg = avg; best = p; }
  }
  return best;
}

function playerStandingRow(s: TeamStanding | undefined, rank: number): string {
  if (!s) return '';
  // Numeric stats get data-counter-* attributes so init() can tween them
  // up from 0; non-numeric cells (Final position ordinal, W/D/L bundle)
  // render straight.
  return `
    <ul class="eos-season-list">
      <li><span>Final position</span><strong>${ordinal(rank)}</strong></li>
      <li><span>Played</span><strong data-counter-int="${s.played}" data-counter-delay="1200">0</strong></li>
      <li><span>W / D / L</span><strong>${s.won} / ${s.drawn} / ${s.lost}</strong></li>
      <li><span>Points for / against</span><strong><span data-counter-int="${s.pointsFor}" data-counter-delay="1300">0</span> / <span data-counter-int="${s.pointsAgainst}" data-counter-delay="1300">0</span></strong></li>
      <li><span>Points difference</span><strong data-counter-int-signed="${s.pointsDiff}" data-counter-delay="1400">0</strong></li>
      <li><span>League points</span><strong data-counter-int="${s.leaguePoints}" data-counter-delay="1500">0</strong></li>
    </ul>`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function initEndOfSeasonScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('end-of-season');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = getGameEngine().getState();
    const sorted = sortStandings(state.league.standings);
    const playerId = state.player.teamId;
    const playerRank = sorted.findIndex(s => s.teamId === playerId) + 1;
    const playerStanding = sorted.find(s => s.teamId === playerId);
    const playerTeam = teamsById.get(playerId);
    if (playerTeam) el!.style.setProperty('--team-color', playerTeam.color);

    const standingsHtml = sorted.map((s, i) => {
      const team = teamsById.get(s.teamId);
      const isMe = s.teamId === playerId;
      const rank = i + 1;
      const rowDelay = Math.min(i, 10) * 50;
      return `
        <div class="eos-row${isMe ? ' eos-row--me' : ''}" style="--row-delay:${rowDelay}ms">
          <span class="eos-rank">${medalSvg(rank)}<span>${rank}</span></span>
          ${team ? teamCrest(team) : '<div class="eos-crest"></div>'}
          <span class="eos-team-name">${team?.shortName ?? s.teamId}</span>
          <span class="eos-pts" data-counter-pts="${s.leaguePoints}" data-counter-delay="${rowDelay + 240}">0</span>
        </div>`;
    }).join('');

    const top = topScorer(state);
    const mvpPlayer = mvp(state);
    const topCard = top ? leaderCard('TOP SCORER', top, teamsById.get(clubOf(state, top.rosterId) ?? ''),
      `${top.seasonStats.tries} tries`) : leaderEmpty('TOP SCORER');
    const mvpCard = mvpPlayer ? leaderCard('SEASON MVP', mvpPlayer, teamsById.get(clubOf(state, mvpPlayer.rosterId) ?? ''),
      `${(mvpPlayer.seasonStats.ratingSum / mvpPlayer.seasonStats.appearances).toFixed(2)} avg · ${mvpPlayer.seasonStats.appearances} apps`) : leaderEmpty('SEASON MVP');

    const championId = state.league.playoffs?.championTeamId ?? null;
    const championTeam = championId ? teamsById.get(championId) : undefined;
    const championIsMe = championId !== null && championId === playerId;
    // Reserve the dot-confetti for AI-champion seasons. The player-as-
    // champion path fires the real canvas Confetti.ts after render
    // (handled below) so the dots and the canvas don't both flood.
    const confettiHtml = championTeam && !championIsMe
      ? `<div class="eos-confetti" aria-hidden="true">${'<span></span>'.repeat(14)}</div>`
      : '';
    const championSection = championTeam
      ? `
        <section class="eos-section eos-champion-section">
          <div class="eos-champion${championIsMe ? ' eos-champion--me' : ''}" style="--team-color:${championTeam.color}">
            <div class="eos-champion-label"><span class="eos-label-text">LEAGUE CHAMPIONS</span></div>
            <div class="eos-champion-crest" style="background:linear-gradient(160deg,${championTeam.color} 0%,color-mix(in oklch,${championTeam.color} 30%,black) 100%);border:1px solid color-mix(in oklch,${championTeam.color} 45%,transparent)">${championTeam.shortName[0] ?? '?'}</div>
            <div class="eos-champion-name">${TROPHY_SVG}<span>${championTeam.name}</span></div>
            <div class="eos-champion-season">${state.calendar.seasonLabel} Champions</div>
            ${confettiHtml}
          </div>
        </section>`
      : '';

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Season Complete</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel}</div>
      </div>

      ${championSection}

      <div id="eos-grid">
        <section class="eos-section eos-standings">
          <h3 class="eos-h3">Final Standings</h3>
          <div class="eos-table">${standingsHtml}</div>
        </section>
        <section class="eos-section eos-your-season">
          <h3 class="eos-h3">Your Season</h3>
          ${playerStandingRow(playerStanding, playerRank)}
        </section>
      </div>

      <section class="eos-section">
        <h3 class="eos-h3">League Leaders</h3>
        <div class="eos-leaders">${topCard}${mvpCard}</div>
      </section>

      <div id="eos-footer">
        <button id="eos-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#eos-continue')!.addEventListener('click', () => activeOnContinue());

    const labelText = el!.querySelector<HTMLSpanElement>('.eos-label-text');
    if (labelText) {
      const full = labelText.textContent ?? '';
      labelText.textContent = '';
      let i = 0;
      function typeNext() {
        if (i >= full.length) return;
        labelText!.textContent = full.slice(0, i + 1);
        i++;
        setTimeout(typeNext, 32);
      }
      setTimeout(typeNext, 200);
    }

    // Counter-up: every numeric cell tagged with data-counter-*
    // tweens from 0 to the encoded target. data-counter-delay is the
    // ms delay so each row's tween lines up with its row-stagger entry.
    el!.querySelectorAll<HTMLElement>('[data-counter-pts]').forEach(node => {
      const target = Number(node.dataset.counterPts ?? '0');
      const delay  = Number(node.dataset.counterDelay ?? '0');
      animateCounter(node, 0, target, v => `${Math.round(v)}`, { duration: 700, delay });
    });
    el!.querySelectorAll<HTMLElement>('[data-counter-int]').forEach(node => {
      const target = Number(node.dataset.counterInt ?? '0');
      const delay  = Number(node.dataset.counterDelay ?? '0');
      animateCounter(node, 0, target, v => `${Math.round(v)}`, { duration: 900, delay });
    });
    el!.querySelectorAll<HTMLElement>('[data-counter-int-signed]').forEach(node => {
      const target = Number(node.dataset.counterIntSigned ?? '0');
      const delay  = Number(node.dataset.counterDelay ?? '0');
      animateCounter(node, 0, target, v => {
        const n = Math.round(v);
        return n >= 0 ? `+${n}` : `${n}`;
      }, { duration: 900, delay });
    });

    // Sound: whistle on screen enter (end of season). When the player
    // is champion, layer a crowd roar at the moment the champion banner
    // peaks (~800ms after screen enter). The roar fires even under
    // prefers-reduced-motion — audio is independent of motion per
    // the v2.220a policy.
    window.setTimeout(() => playCue('whistle'), 100);
    if (championIsMe) {
      window.setTimeout(() => playCue('crowdRoar'), 800);
    }

    // Confetti.ts canvas burst reserved for player-as-champion only.
    // Suppressed under reduced motion.
    const prm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (championIsMe && playerTeam && !prm) {
      window.setTimeout(() => launchConfetti(playerTeam.color, 'storm'), 700);
    }
  }

  function leaderCard(label: string, p: Player, team: RawTeamInput | undefined, metric: string): string {
    return `
      <div class="eos-leader">
        <div class="eos-leader-label">${label}</div>
        <div class="eos-leader-name">${p.firstName} ${p.lastName}</div>
        <div class="eos-leader-meta">${team?.shortName ?? '—'} · ${p.position}</div>
        <div class="eos-leader-metric">${metric}</div>
      </div>`;
  }

  function leaderEmpty(label: string): string {
    return `
      <div class="eos-leader eos-leader--empty">
        <div class="eos-leader-label">${label}</div>
        <div class="eos-leader-name eos-leader-name--empty">No qualifying players</div>
        <div class="eos-leader-meta">Minimum appearance threshold not met</div>
      </div>`;
  }

  renderImpl = render;
}
