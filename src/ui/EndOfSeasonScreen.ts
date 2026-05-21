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

let activeOnContinue: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showEndOfSeason(onContinue: () => void): void {
  activeOnContinue = onContinue;
  renderImpl?.();
}

function teamCrest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 65%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="eos-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
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
  const diff = `${s.pointsDiff >= 0 ? '+' : ''}${s.pointsDiff}`;
  return `
    <ul class="eos-season-list">
      <li><span>Final position</span><strong>${ordinal(rank)}</strong></li>
      <li><span>Played</span><strong>${s.played}</strong></li>
      <li><span>W / D / L</span><strong>${s.won} / ${s.drawn} / ${s.lost}</strong></li>
      <li><span>Points for / against</span><strong>${s.pointsFor} / ${s.pointsAgainst}</strong></li>
      <li><span>Points difference</span><strong>${diff}</strong></li>
      <li><span>League points</span><strong>${s.leaguePoints}</strong></li>
    </ul>`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function initEndOfSeasonScreen(
  gameEngine: GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('end-of-season');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = gameEngine.getState();
    const sorted = sortStandings(state.league.standings);
    const playerId = state.player.teamId;
    const playerRank = sorted.findIndex(s => s.teamId === playerId) + 1;
    const playerStanding = sorted.find(s => s.teamId === playerId);

    const standingsHtml = sorted.map((s, i) => {
      const team = teamsById.get(s.teamId);
      const isMe = s.teamId === playerId;
      return `
        <div class="eos-row${isMe ? ' eos-row--me' : ''}">
          <span class="eos-rank">${i + 1}</span>
          ${team ? teamCrest(team) : '<div class="eos-crest"></div>'}
          <span class="eos-team-name">${team?.shortName ?? s.teamId}</span>
          <span class="eos-pts">${s.leaguePoints}</span>
        </div>`;
    }).join('');

    const top = topScorer(state);
    const mvpPlayer = mvp(state);
    const topCard = top ? leaderCard('TOP SCORER', top, teamsById.get(clubOf(state, top.rosterId) ?? ''),
      `${top.seasonStats.tries} tries`) : leaderEmpty('TOP SCORER');
    const mvpCard = mvpPlayer ? leaderCard('SEASON MVP', mvpPlayer, teamsById.get(clubOf(state, mvpPlayer.rosterId) ?? ''),
      `${(mvpPlayer.seasonStats.ratingSum / mvpPlayer.seasonStats.appearances).toFixed(2)} avg · ${mvpPlayer.seasonStats.appearances} apps`) : leaderEmpty('SEASON MVP');

    el!.innerHTML = `
      <div id="eos-topbar">
        <div style="width:72px"></div>
        <span id="eos-title">Season Complete</span>
        <div style="width:72px"></div>
      </div>
      <div id="eos-eyebrow">${state.calendar.seasonLabel}</div>

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
        <div class="eos-leader-name">—</div>
      </div>`;
  }

  renderImpl = render;
}
