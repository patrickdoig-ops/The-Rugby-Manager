// Post-match summary screen: final score, headline team stats, per-player
// ratings for both squads, and a Continue button to advance to the next
// fixture. Replaces the bare overlay that previously sat in index.html.

import type { MatchState } from '../types/match';
import type { Team } from '../types/team';
import type { Player } from '../types/player';
import { shortName } from '../utils/playerName';
import { teamTextColor } from '../utils/teamColor';

function pct(a: number, b: number): string {
  const total = a + b;
  if (total === 0) return '50%';
  return `${Math.round((a / total) * 100)}%`;
}

function tacklePct(t: { attempted: number; made: number }): string {
  if (t.attempted === 0) return '—';
  return `${Math.round((t.made / t.attempted) * 100)}%`;
}

function ratingClass(r: number): string {
  if (r >= 7.5) return 'rating-high';
  if (r >= 5.5) return 'rating-mid';
  if (r >= 3.5) return 'rating-low';
  return 'rating-poor';
}

function teamMetres(team: Team): number {
  // Combine on-field XV + anyone subbed off so a star who left at 60'
  // still contributes to the headline metres tally.
  const all = [...team.players, ...team.substitutedOff];
  return all.reduce((sum, p) => sum + p.matchStats.metresCarried + p.matchStats.kickMetres, 0);
}

function crestHtml(team: Team, size = 48): string {
  const initial = team.shortName[0] ?? '?';
  return `<div class="mr-crest" style="
    width:${size}px;height:${size}px;
    background:linear-gradient(160deg,${team.color} 0%,color-mix(in oklch,${team.color} 65%,black) 100%);
    border:1px solid color-mix(in oklch,${team.color} 50%,transparent);
  "><span>${initial}</span></div>`;
}

function renderStatsCard(state: MatchState): string {
  const { stats, homeTeam, awayTeam } = state;
  const hc = teamTextColor(homeTeam.color);
  const ac = teamTextColor(awayTeam.color);

  const homeMetres = teamMetres(homeTeam);
  const awayMetres = teamMetres(awayTeam);

  const rows: Array<{
    label: string;
    homeVal: string;
    awayVal: string;
    homeNum: number;
    awayNum: number;
    invert?: boolean;
  }> = [
    { label: 'Possession', homeVal: pct(stats.possession.home, stats.possession.away), awayVal: pct(stats.possession.away, stats.possession.home), homeNum: stats.possession.home, awayNum: stats.possession.away },
    { label: 'Territory',  homeVal: pct(stats.territory.home, stats.territory.away),   awayVal: pct(stats.territory.away, stats.territory.home),   homeNum: stats.territory.home,  awayNum: stats.territory.away },
    { label: 'Metres',     homeVal: `${homeMetres}m`,                                  awayVal: `${awayMetres}m`,                                  homeNum: homeMetres,            awayNum: awayMetres },
    { label: 'Tackle %',   homeVal: tacklePct(stats.tackles.home),                     awayVal: tacklePct(stats.tackles.away),                     homeNum: stats.tackles.home.made, awayNum: stats.tackles.away.made },
    { label: 'Tries',      homeVal: String(stats.tries.home),                          awayVal: String(stats.tries.away),                          homeNum: stats.tries.home,      awayNum: stats.tries.away },
  ];

  const rowsHtml = rows.map(r => {
    const total = r.homeNum + r.awayNum;
    const hPct  = total > 0 ? (r.homeNum / total) * 100 : 50;
    const aPct  = 100 - hPct;
    const hWins = r.invert ? r.homeNum < r.awayNum : r.homeNum > r.awayNum;
    const aWins = r.invert ? r.awayNum < r.homeNum : r.awayNum > r.homeNum;
    return `
      <div class="mr-stat-row">
        <div class="mr-stat-row-header">
          <span class="mr-stat-val${hWins ? ' mr-stat-winner' : ''}">${r.homeVal}</span>
          <span class="mr-stat-label">${r.label}</span>
          <span class="mr-stat-val${aWins ? ' mr-stat-winner' : ''}">${r.awayVal}</span>
        </div>
        <div class="mr-stat-bars">
          <div class="mr-stat-bar-h" style="width:${hPct.toFixed(1)}%;background:${hc};opacity:${hWins ? 1 : 0.4}"></div>
          <div class="mr-stat-bar-a" style="width:${aPct.toFixed(1)}%;background:${ac};opacity:${aWins ? 1 : 0.4}"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="mr-card">
      <h2 class="mr-card-title">Key Stats</h2>
      <div class="mr-stats-header">
        <span class="mr-stats-team-code" style="color:${hc}">${homeTeam.shortName}</span>
        <span></span>
        <span class="mr-stats-team-code" style="color:${ac}">${awayTeam.shortName}</span>
      </div>
      ${rowsHtml}
    </section>
  `;
}

function renderRatingsBlock(team: Team, isHome: boolean): string {
  // Everyone who took the field: on-field XV at full-time + anyone subbed off.
  const everyone: Player[] = [...team.players, ...team.substitutedOff];
  const sorted = [...everyone].sort((a, b) => b.rating - a.rating);

  const topRating = sorted[0]?.rating ?? 0;

  const rowsHtml = sorted.map(p => {
    const cls = ratingClass(p.rating);
    const isMotm = p.rating === topRating && p.rating >= 7.5;
    return `
      <div class="mr-player-row">
        <span class="mr-player-num" style="color:${teamTextColor(team.color)}">${p.squadNumber}</span>
        <span class="mr-player-name">${shortName(p)}</span>
        <span class="mr-player-pos">${p.position}</span>
        ${isMotm ? '<span class="mr-player-motm" title="Top rated">★</span>' : '<span class="mr-player-motm"></span>'}
        <span class="mr-player-rating ${cls}">${p.rating.toFixed(1)}</span>
      </div>
    `;
  }).join('');

  return `
    <section class="mr-card">
      <h2 class="mr-card-title">
        <span class="mr-team-dot" style="background:${team.color}"></span>
        ${team.name} <span class="mr-card-subtitle">player ratings</span>
      </h2>
      <div class="mr-ratings-list mr-ratings-list--${isHome ? 'home' : 'away'}">
        ${rowsHtml}
      </div>
    </section>
  `;
}

export function initMatchResultScreen(state: MatchState, round: number, onContinue: () => void): void {
  const el = document.getElementById('match-result');
  if (!el) return;

  const { homeTeam, awayTeam, score } = state;

  el.innerHTML = `
    <div id="mr-body">
      <div class="mr-header">
        <span class="mr-eyebrow">Full Time · Round ${round}</span>
      </div>

      <div class="mr-versus">
        <div class="mr-versus-team">
          ${crestHtml(homeTeam, 56)}
          <div class="mr-versus-name">${homeTeam.shortName}</div>
        </div>
        <div class="mr-scoreline">
          <span class="mr-score" style="color:${score.home >= score.away ? teamTextColor(homeTeam.color) : 'var(--rm-text-muted)'}">${score.home}</span>
          <span class="mr-score-sep">–</span>
          <span class="mr-score" style="color:${score.away >= score.home ? teamTextColor(awayTeam.color) : 'var(--rm-text-muted)'}">${score.away}</span>
        </div>
        <div class="mr-versus-team">
          ${crestHtml(awayTeam, 56)}
          <div class="mr-versus-name">${awayTeam.shortName}</div>
        </div>
      </div>

      <div class="mr-teamline">${homeTeam.name} <span class="mr-teamline-sep">·</span> ${awayTeam.name}</div>

      ${renderStatsCard(state)}
      ${renderRatingsBlock(homeTeam, true)}
      ${renderRatingsBlock(awayTeam, false)}
    </div>

    <div id="mr-footer">
      <button id="mr-continue">
        <span class="mr-continue-label">Continue</span>
        <svg class="mr-continue-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        <span class="mr-continue-spinner" aria-hidden="true"></span>
      </button>
    </div>
  `;

  const btn = el.querySelector<HTMLButtonElement>('#mr-continue')!;
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('mr-continue--simulating');
    btn.querySelector<HTMLSpanElement>('.mr-continue-label')!.textContent = `Simulating round ${round}…`;
    onContinue();
  });
}
