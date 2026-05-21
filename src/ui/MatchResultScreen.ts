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

function matchVerdict(home: number, away: number, side: 'home' | 'away'): string {
  const margin = Math.abs(home - away);
  if (home === away) return 'A hard-fought draw.';
  const won = side === 'home' ? home > away : away > home;
  const mag = margin >= 20 ? 'Convincing' : margin >= 8 ? 'Comfortable' : 'Narrow';
  return won
    ? `${mag} victory — ${margin} points to the good.`
    : `${mag} defeat — lost by ${margin} points.`;
}

function renderScorers(state: MatchState): string {
  function lines(team: Team): string {
    const all = [...team.players, ...team.substitutedOff];
    const rows = all
      .filter(p => p.matchStats.tries > 0 || p.matchStats.kicksMade > 0)
      .map(p => {
        const ev: string[] = [];
        if (p.matchStats.tries) {
          ev.push(p.matchStats.tries > 1 ? `${p.matchStats.tries}×T` : 'T');
        }
        if (p.matchStats.kicksMade) {
          ev.push(`${p.matchStats.kicksMade}C`);
        }
        return `<div class="mr-scorer-row">
          <span class="mr-scorer-name">${shortName(p)}</span>
          <span class="mr-scorer-events">${ev.join(' · ')}</span>
        </div>`;
      });
    return rows.length > 0 ? rows.join('') : '<span class="mr-no-scorers">—</span>';
  }
  return `
    <section class="mr-card">
      <h2 class="mr-card-title">Try Scorers</h2>
      <div class="mr-scorers-grid">
        <div class="mr-scorers-team">
          <div class="mr-scorers-team-label" style="color:${teamTextColor(state.homeTeam.color)}">${state.homeTeam.shortName}</div>
          ${lines(state.homeTeam)}
        </div>
        <div class="mr-scorers-divider"></div>
        <div class="mr-scorers-team">
          <div class="mr-scorers-team-label" style="color:${teamTextColor(state.awayTeam.color)}">${state.awayTeam.shortName}</div>
          ${lines(state.awayTeam)}
        </div>
      </div>
    </section>
  `;
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
        ${isMotm
          ? `<span class="mr-player-motm" title="Top rated"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.637 1.55.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.755-.415-2.211.749-2.305l5.404-.434 2.082-5.005z"/></svg></span>`
          : '<span class="mr-player-motm"></span>'}
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

  const homeWinning = score.home >= score.away;
  const humanSide = state.engine.humanSide ?? 'home';
  const verdict = matchVerdict(score.home, score.away, humanSide);

  el.innerHTML = `
    <div id="mr-body">
      <div class="mr-header">
        <span class="mr-eyebrow">Full Time · Round ${round}</span>
        <p class="mr-verdict">${verdict}</p>
      </div>

      <div class="mr-versus">
        <div class="mr-versus-team">
          ${crestHtml(homeTeam, 56)}
          <div class="mr-versus-name">${homeTeam.shortName}</div>
        </div>
        <div class="mr-scoreline">
          <span class="mr-score mr-score--${homeWinning ? 'winner' : 'loser'}" style="${homeWinning ? `color:${teamTextColor(homeTeam.color)}` : ''}">${score.home}</span>
          <span class="mr-score-sep">–</span>
          <span class="mr-score mr-score--${!homeWinning ? 'winner' : 'loser'}" style="${!homeWinning ? `color:${teamTextColor(awayTeam.color)}` : ''}">${score.away}</span>
        </div>
        <div class="mr-versus-team">
          ${crestHtml(awayTeam, 56)}
          <div class="mr-versus-name">${awayTeam.shortName}</div>
        </div>
      </div>

      <div class="mr-teamline">${homeTeam.name} <span class="mr-teamline-sep">·</span> ${awayTeam.name}</div>

      ${renderScorers(state)}
      ${renderStatsCard(state)}
      ${state.engine.humanSide === 'away'
        ? renderRatingsBlock(awayTeam, false) + renderRatingsBlock(homeTeam, true)
        : renderRatingsBlock(homeTeam, true) + renderRatingsBlock(awayTeam, false)}
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
