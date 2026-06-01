// Post-match summary screen: final score, MOTM hero, headline team stats,
// per-player ratings for both squads, an Up Next preview, and a Continue
// button to advance through the post-match chain.

import type { MatchState } from '../types/match';
import type { Team } from '../types/team';
import type { Player } from '../types/player';
import { shortName } from '../utils/playerName';
import { teamTextColor } from '../utils/teamColor';
import { launchConfetti } from './Confetti';
import { playId } from './SoundManager';

export interface NextFixturePreview {
  opponentName:      string;
  opponentInitial:   string;
  opponentColor:     string;
  isHome:            boolean;
  round:             number;
  date?:             string;
}

function pct(a: number, b: number): string {
  const total = a + b;
  if (total === 0) return '50%';
  return `${Math.round((a / total) * 100)}%`;
}

function ratingClass(r: number): string {
  if (r >= 7.5) return 'rating-high';
  if (r >= 5.5) return 'rating-mid';
  if (r >= 3.5) return 'rating-low';
  return 'rating-poor';
}


function crestHtml(team: Team): string {
  const initial = team.shortName[0] ?? '?';
  return `<div class="mr-crest" style="
    background:linear-gradient(160deg,${team.color} 0%,color-mix(in oklch,${team.color} 30%,black) 100%);
    box-shadow: 0 0 26px color-mix(in oklch, ${team.color} 50%, transparent), inset 0 1px 0 rgba(255,255,255,0.20), 0 6px 20px rgba(0,0,0,0.5);
  "><span>${initial}</span></div>`;
}

function findMotm(state: MatchState): { player: Player; team: Team } | null {
  const everyone: Array<{ player: Player; team: Team }> = [
    ...state.homeTeam.players.map(p => ({ player: p, team: state.homeTeam })),
    ...state.homeTeam.substitutedOff.map(p => ({ player: p, team: state.homeTeam })),
    ...state.awayTeam.players.map(p => ({ player: p, team: state.awayTeam })),
    ...state.awayTeam.substitutedOff.map(p => ({ player: p, team: state.awayTeam })),
  ];
  if (everyone.length === 0) return null;
  everyone.sort((a, b) => b.player.rating - a.player.rating);
  const top = everyone[0];
  // Only headline as MOTM when the rating is actually high — anything below
  // 7.5 means the match had no standout and surfacing a 5.x player under a
  // gold-trim trophy card would feel hollow.
  if (top.player.rating < 7.5) return null;
  return top;
}

function renderMotmHero(state: MatchState): string {
  const motm = findMotm(state);
  if (!motm) return '';
  const { player } = motm;
  const stats = player.matchStats;

  const cells: string[] = [];
  if (stats.tries > 0) cells.push(`${stats.tries} T`);
  if (stats.conversionsMade > 0) cells.push(`${stats.conversionsMade}C`);
  if (stats.penaltiesMade > 0) cells.push(`${stats.penaltiesMade}P`);
  if (stats.tacklesMade > 0) cells.push(`${stats.tacklesMade} tackles`);
  if (stats.metresCarried > 0) cells.push(`${stats.metresCarried}m carried`);

  const line = cells
    .map((c, i) => i === 0
      ? `<span class="motm-stat">${c}</span>`
      : `<span class="motm-sep">·</span><span class="motm-stat">${c}</span>`)
    .join('');

  return `
    <section class="mr-motm" aria-label="Man of the Match">
      <div class="motm-num">${player.squadNumber}</div>
      <div class="motm-body">
        <div class="motm-eyebrow">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.637 1.55.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.755-.415-2.211.749-2.305l5.404-.434 2.082-5.005z"/></svg>
          Man of the Match
        </div>
        <div class="motm-name">${shortName(player)}</div>
        <div class="motm-line">${line}</div>
      </div>
      <div class="motm-rating">${player.rating.toFixed(1)}</div>
    </section>
  `;
}

function renderCardsLine(state: MatchState): string {
  // Walk every player who took the field on either side — carded players
  // who were later subbed off live in team.substitutedOff, so the list
  // has to span both buckets. matchStats.{yellowCards,redCards} is the
  // source of truth (incremented by CARD_ISSUED in applyMatchEvent).
  type Row = { p: Player; kind: 'yellow' | 'red' };
  function teamRows(team: Team): Row[] {
    const out: Row[] = [];
    for (const p of [...team.players, ...team.substitutedOff]) {
      if (p.matchStats.yellowCards > 0) out.push({ p, kind: 'yellow' });
      if (p.matchStats.redCards > 0)    out.push({ p, kind: 'red'    });
    }
    return out;
  }
  const homeRows = teamRows(state.homeTeam);
  const awayRows = teamRows(state.awayTeam);
  if (homeRows.length === 0 && awayRows.length === 0) return '';
  function column(rows: Row[]): string {
    if (rows.length === 0) return '<span class="mr-no-scorers">—</span>';
    return rows.map(r => `
      <div class="mr-scorer-row">
        <span class="mr-scorer-name"><span class="mr-card-pip mr-card-pip--${r.kind}"></span>${shortName(r.p)}</span>
      </div>
    `).join('');
  }
  return `
    <section class="mr-card mr-card--cards">
      <h2 class="mr-card-title">Cards</h2>
      <div class="mr-scorers-grid">
        <div class="mr-scorers-team">
          <div class="mr-scorers-team-label" style="color:${teamTextColor(state.homeTeam.color)}">${state.homeTeam.shortName}</div>
          ${column(homeRows)}
        </div>
        <div class="mr-scorers-divider"></div>
        <div class="mr-scorers-team">
          <div class="mr-scorers-team-label" style="color:${teamTextColor(state.awayTeam.color)}">${state.awayTeam.shortName}</div>
          ${column(awayRows)}
        </div>
      </div>
    </section>
  `;
}

function renderInjuriesLine(state: MatchState): string {
  type Row = { p: Player; kind: string };
  function teamRows(team: Team): Row[] {
    const out: Row[] = [];
    for (const p of [...team.players, ...team.substitutedOff]) {
      if (p.pendingInjuryKind) out.push({ p, kind: p.pendingInjuryKind.replace(/_/g, ' ') });
    }
    return out;
  }
  const homeRows = teamRows(state.homeTeam);
  const awayRows = teamRows(state.awayTeam);
  if (homeRows.length === 0 && awayRows.length === 0) return '';
  function column(rows: Row[]): string {
    if (rows.length === 0) return '<span class="mr-no-scorers">—</span>';
    return rows.map(r => `
      <div class="mr-scorer-row">
        <span class="mr-scorer-name">${shortName(r.p)}</span>
        <span class="mr-injury-kind">${r.kind}</span>
      </div>
    `).join('');
  }
  return `
    <section class="mr-card mr-card--injuries">
      <h2 class="mr-card-title">Injuries</h2>
      <div class="mr-scorers-grid">
        <div class="mr-scorers-team">
          <div class="mr-scorers-team-label" style="color:${teamTextColor(state.homeTeam.color)}">${state.homeTeam.shortName}</div>
          ${column(homeRows)}
        </div>
        <div class="mr-scorers-divider"></div>
        <div class="mr-scorers-team">
          <div class="mr-scorers-team-label" style="color:${teamTextColor(state.awayTeam.color)}">${state.awayTeam.shortName}</div>
          ${column(awayRows)}
        </div>
      </div>
    </section>
  `;
}

function renderScorers(state: MatchState): string {
  function lines(team: Team): string {
    const all = [...team.players, ...team.substitutedOff];
    const rows = all
      .filter(p => p.matchStats.tries > 0 || p.matchStats.conversionsMade > 0 || p.matchStats.penaltiesMade > 0)
      .map(p => {
        const ev: string[] = [];
        if (p.matchStats.tries) {
          ev.push(p.matchStats.tries > 1 ? `${p.matchStats.tries}×T` : 'T');
        }
        if (p.matchStats.conversionsMade) {
          ev.push(`${p.matchStats.conversionsMade}C`);
        }
        if (p.matchStats.penaltiesMade) {
          ev.push(`${p.matchStats.penaltiesMade}P`);
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
      <h2 class="mr-card-title">Scorers</h2>
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

  const hCarries  = teamStat(homeTeam, 'carries');
  const aCarries  = teamStat(awayTeam, 'carries');
  const hRunM     = teamStat(homeTeam, 'metresCarried');
  const aRunM     = teamStat(awayTeam, 'metresCarried');
  const hPasses   = teamStat(homeTeam, 'passes');
  const aPasses   = teamStat(awayTeam, 'passes');
  const hOffloads = teamStat(homeTeam, 'offloadsCompleted');
  const aOffloads = teamStat(awayTeam, 'offloadsCompleted');
  const hKicks    = teamStat(homeTeam, 'kicksFromHand');
  const aKicks    = teamStat(awayTeam, 'kicksFromHand');
  const hKickM    = teamStat(homeTeam, 'kickMetres');
  const aKickM    = teamStat(awayTeam, 'kickMetres');
  const hMissed   = Math.max(0, stats.tackles.home.attempted - stats.tackles.home.made);
  const aMissed   = Math.max(0, stats.tackles.away.attempted - stats.tackles.away.made);
  const hPens     = teamStat(homeTeam, 'penaltiesConceded');
  const aPens     = teamStat(awayTeam, 'penaltiesConceded');

  const rows: Array<{
    label:   string;
    hint?:   string;
    homeVal: string;
    awayVal: string;
    homeNum: number;
    awayNum: number;
    invert?: boolean;
    extended?: boolean;
  }> = [
    { label: 'Possession', homeVal: pct(stats.possession.home, stats.possession.away), awayVal: pct(stats.possession.away, stats.possession.home), homeNum: stats.possession.home, awayNum: stats.possession.away },
    { label: 'Territory',  homeVal: pct(stats.territory.home, stats.territory.away),   awayVal: pct(stats.territory.away, stats.territory.home),   homeNum: stats.territory.home,  awayNum: stats.territory.away },
    { label: 'Tries',      homeVal: String(stats.tries.home),                          awayVal: String(stats.tries.away),                          homeNum: stats.tries.home,      awayNum: stats.tries.away },
    { label: 'Tackle %',   homeVal: tacklePctLabel(stats.tackles.home),                awayVal: tacklePctLabel(stats.tackles.away),                homeNum: stats.tackles.home.made, awayNum: stats.tackles.away.made },
    // ↓ shown only when the "Show all stats" toggle is expanded.
    { label: '22 entries',     homeVal: String(stats.entries22.home.count),  awayVal: String(stats.entries22.away.count),  homeNum: stats.entries22.home.count, awayNum: stats.entries22.away.count, extended: true },
    { label: 'Points / entry', homeVal: pointsPerEntry(stats.entries22.home), awayVal: pointsPerEntry(stats.entries22.away), homeNum: stats.entries22.home.pointsScored, awayNum: stats.entries22.away.pointsScored, extended: true },
    { label: 'Carries',        homeVal: String(hCarries),                     awayVal: String(aCarries),                     homeNum: hCarries,    awayNum: aCarries,    extended: true },
    { label: 'Carry metres',   homeVal: `${hRunM}m`,                          awayVal: `${aRunM}m`,                          homeNum: hRunM,       awayNum: aRunM,       extended: true },
    { label: 'Passes',         homeVal: String(hPasses),                      awayVal: String(aPasses),                      homeNum: hPasses,     awayNum: aPasses,     extended: true },
    { label: 'Offloads',       homeVal: String(hOffloads),                    awayVal: String(aOffloads),                    homeNum: hOffloads,   awayNum: aOffloads,   extended: true },
    { label: 'Kicks',          homeVal: String(hKicks),                       awayVal: String(aKicks),                       homeNum: hKicks,      awayNum: aKicks,      extended: true },
    { label: 'Kick metres',    homeVal: `${hKickM}m`,                         awayVal: `${aKickM}m`,                         homeNum: hKickM,      awayNum: aKickM,      extended: true },
    { label: 'Errors',         homeVal: String(stats.handlingErrors.home),    awayVal: String(stats.handlingErrors.away),    homeNum: stats.handlingErrors.home,   awayNum: stats.handlingErrors.away,   invert: true, extended: true },
    { label: 'Tackles made',   homeVal: String(stats.tackles.home.made),      awayVal: String(stats.tackles.away.made),      homeNum: stats.tackles.home.made,     awayNum: stats.tackles.away.made,     extended: true },
    { label: 'Missed tackles', homeVal: String(hMissed),                      awayVal: String(aMissed),                      homeNum: hMissed,                     awayNum: aMissed,                     invert: true, extended: true },
    { label: 'Lineouts',       homeVal: String(stats.lineouts.home),          awayVal: String(stats.lineouts.away),          homeNum: stats.lineouts.home,         awayNum: stats.lineouts.away,         extended: true },
    { label: 'Lineout success', homeVal: setPieceLabel(stats.ownLineouts.home), awayVal: setPieceLabel(stats.ownLineouts.away), homeNum: stats.ownLineouts.home.won, awayNum: stats.ownLineouts.away.won, extended: true },
    { label: 'Scrums',         homeVal: String(stats.scrums.home),            awayVal: String(stats.scrums.away),            homeNum: stats.scrums.home,           awayNum: stats.scrums.away,           extended: true },
    { label: 'Scrum success',  homeVal: setPieceLabel(stats.ownScrums.home),   awayVal: setPieceLabel(stats.ownScrums.away),   homeNum: stats.ownScrums.home.won,   awayNum: stats.ownScrums.away.won,   extended: true },
    { label: 'Penalties conceded', homeVal: String(hPens),                    awayVal: String(aPens),                        homeNum: hPens,                       awayNum: aPens,                       invert: true, extended: true },
  ];

  const rowsHtml = rows.map(r => {
    const total = r.homeNum + r.awayNum;
    const hPct  = total > 0 ? (r.homeNum / total) * 100 : 50;
    const aPct  = 100 - hPct;
    const hWins = r.invert ? r.homeNum < r.awayNum : r.homeNum > r.awayNum;
    const aWins = r.invert ? r.awayNum < r.homeNum : r.awayNum > r.homeNum;
    const labelHtml = r.hint
      ? `<span class="mr-stat-label"><span class="key">${r.label}</span><span class="hint">${r.hint}</span></span>`
      : `<span class="mr-stat-label"><span class="key">${r.label}</span></span>`;
    return `
      <div class="mr-stat-row${r.extended ? ' mr-stat-row--extended' : ''}">
        <div class="mr-stat-row-header">
          <span class="mr-stat-val${hWins ? ' mr-stat-winner' : ''}">${r.homeVal}</span>
          ${labelHtml}
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
    <section class="mr-card mr-stats-card">
      <h2 class="mr-card-title">Key Stats</h2>
      <div class="mr-stats-header">
        <span class="mr-stats-team-code" style="color:${hc}">${homeTeam.shortName}</span>
        <span></span>
        <span class="mr-stats-team-code" style="color:${ac}">${awayTeam.shortName}</span>
      </div>
      ${rowsHtml}
      <button class="mr-stats-toggle" aria-expanded="false" type="button">
        <span class="mr-stats-toggle-label">Show all stats</span>
        <svg class="mr-stats-toggle-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
    </section>
  `;
}

function teamStat(team: Team, key: 'carries' | 'metresCarried' | 'passes' | 'offloadsCompleted' | 'kicksFromHand' | 'kickMetres' | 'penaltiesConceded'): number {
  let sum = 0;
  for (const p of team.players) sum += p.matchStats[key];
  for (const p of team.substitutedOff) sum += p.matchStats[key];
  return sum;
}

function setPieceLabel(s: { won: number; thrown?: number; putIn?: number }): string {
  const total = s.thrown ?? s.putIn ?? 0;
  if (total === 0) return '—';
  return `${s.won}/${total}`;
}

function pointsPerEntry(e: { count: number; pointsScored: number }): string {
  if (e.count === 0) return '—';
  return (e.pointsScored / e.count).toFixed(1);
}

function tacklePctLabel(t: { attempted: number; made: number }): string {
  if (t.attempted === 0) return '—';
  return `${Math.round((t.made / t.attempted) * 100)}%`;
}

function renderRatingsBlock(team: Team, isHome: boolean): string {
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

function formatUpNextDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return '';
  const day   = d.getUTCDate();
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${day} ${month}`;
}

function renderUpNext(next: NextFixturePreview | null): string {
  if (!next) return '';
  const venue = next.isHome ? 'Home' : 'Away';
  const date  = formatUpNextDate(next.date);
  const meta  = date ? `${venue} · ${date}` : venue;
  return `
    <button class="mr-upnext" aria-label="Up next: ${next.opponentName} ${venue.toLowerCase()}">
      <div class="mr-upnext-body">
        <div class="mr-upnext-crest" style="background:linear-gradient(160deg,${next.opponentColor},color-mix(in oklch,${next.opponentColor} 30%, black))">
          <span>${next.opponentInitial}</span>
        </div>
        <div class="mr-upnext-text">
          <span class="mr-upnext-eyebrow">Up Next · R${next.round}</span>
          <span class="mr-upnext-line">${next.opponentName}<span class="mr-upnext-meta"> · ${meta}</span></span>
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--rm-text-muted);flex-shrink:0"><path d="m9 6 6 6-6 6"/></svg>
    </button>
  `;
}

export function initMatchResultScreen(
  state: MatchState,
  round: number,
  nextFixture: NextFixturePreview | null,
  onContinue: () => void,
): void {
  const el = document.getElementById('match-result');
  if (!el) return;

  const { homeTeam, awayTeam, score } = state;

  const homeWinning = score.home >= score.away;
  const winColor  = homeWinning ? homeTeam.color : awayTeam.color;
  const loseColor = homeWinning ? awayTeam.color : homeTeam.color;

  // Inject team-colour CSS vars so the atmospheric backdrop, score glow,
  // and tinted loser score all pick the right hues.
  el.style.setProperty('--mr-win',  winColor);
  el.style.setProperty('--mr-lose', loseColor);

  el.innerHTML = `
    <div id="mr-body">
      <div class="mr-header">
        <span class="mr-eyebrow">Full Time · Round ${round}</span>
      </div>

      <div class="mr-versus">
        <div class="mr-versus-team">
          ${crestHtml(homeTeam)}
          <div class="mr-versus-name">${homeTeam.name}</div>
        </div>
        <div class="mr-scoreline">
          <span class="mr-score mr-score--${homeWinning ? 'winner' : 'loser'}">${score.home}</span>
          <span class="mr-score-sep">–</span>
          <span class="mr-score mr-score--${!homeWinning ? 'winner' : 'loser'}">${score.away}</span>
        </div>
        <div class="mr-versus-team">
          ${crestHtml(awayTeam)}
          <div class="mr-versus-name">${awayTeam.name}</div>
        </div>
      </div>

      ${renderMotmHero(state)}
      ${renderScorers(state)}
      ${renderCardsLine(state)}
      ${renderInjuriesLine(state)}
      ${renderStatsCard(state)}
      ${state.engine.humanSide === 'away'
        ? renderRatingsBlock(awayTeam, false) + renderRatingsBlock(homeTeam, true)
        : renderRatingsBlock(homeTeam, true) + renderRatingsBlock(awayTeam, false)}
      ${renderUpNext(nextFixture)}
    </div>

    <div id="mr-footer">
      <button id="mr-continue" class="cta-pulse">
        <span class="mr-continue-label">Continue</span>
        <svg class="mr-continue-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        <span class="mr-continue-spinner" aria-hidden="true"></span>
      </button>
    </div>
  `;

  const isHumanHome = state.engine.humanSide === 'home';
  const humanScore = isHumanHome ? score.home : score.away;
  const oppScore   = isHumanHome ? score.away : score.home;
  playId(humanScore > oppScore ? 'music.result.win' : 'music.result.loss');
  if (humanScore > oppScore) {
    const margin = humanScore - oppScore;
    const intensity = margin <= 5 ? 'light' : margin >= 21 ? 'storm' : 'normal';
    const humanTeam = isHumanHome ? homeTeam : awayTeam;
    setTimeout(() => launchConfetti(humanTeam.color, intensity), 300);
  }

  const btn = el.querySelector<HTMLButtonElement>('#mr-continue')!;
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('mr-continue--simulating');
    btn.querySelector<HTMLSpanElement>('.mr-continue-label')!.textContent = `Simulating round ${round}…`;
    onContinue();
  });

  // Expand/collapse toggle on the Key Stats card. Hidden rows live in
  // .mr-stat-row--extended; CSS keys off .mr-stats-card--expanded on
  // the section.
  const statsCard = el.querySelector<HTMLElement>('.mr-stats-card');
  const statsToggle = el.querySelector<HTMLButtonElement>('.mr-stats-toggle');
  if (statsCard && statsToggle) {
    statsToggle.addEventListener('click', () => {
      const expanded = statsCard.classList.toggle('mr-stats-card--expanded');
      statsToggle.setAttribute('aria-expanded', String(expanded));
      const label = statsToggle.querySelector<HTMLSpanElement>('.mr-stats-toggle-label');
      if (label) label.textContent = expanded ? 'Show key stats' : 'Show all stats';
    });
  }
}
