// Shared European Cup / Shield render helpers — pool tables, fixture lists,
// and the knockout bracket. Consumed by EuropeanCupScreen + EuropeanShieldScreen.

import type { EuropeanCompState, EuropeanFixture, EuropeanKnockout, EuropeanKnockoutMatch, EuropeanPool } from '../../types/gameState';
import type { RawTeamInput } from '../../types/teamData';
import { sortStandings } from '../../game/leagueTable';

type TeamsById = Map<string, RawTeamInput>;

function teamBadge(team: RawTeamInput | undefined): string {
  if (!team) return '<span class="cup-badge"></span>';
  const initial = team.shortName[0] ?? '?';
  return `<span class="cup-badge" style="background:${team.color}">${initial}</span>`;
}

function shortName(teamId: string | null, byId: TeamsById): string {
  if (!teamId) return 'TBC';
  return byId.get(teamId)?.shortName ?? teamId;
}

function fullName(teamId: string | null, byId: TeamsById): string {
  if (!teamId) return 'TBC';
  return byId.get(teamId)?.name ?? teamId;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function euroPoolTableHtml(pool: EuropeanPool, byId: TeamsById, highlightId: string): string {
  const sorted = sortStandings(pool.standings);
  // Top 2 qualify for knockout
  const rows = sorted.map((s, i) => {
    const team = byId.get(s.teamId);
    const cls = ['cup-trow'];
    if (i < 2) cls.push('cup-trow--qual');
    if (s.teamId === highlightId) cls.push('cup-trow--me');
    const diff = s.pointsDiff > 0 ? `+${s.pointsDiff}` : `${s.pointsDiff}`;
    return `
      <div class="${cls.join(' ')}">
        <span class="cup-trank">${i + 1}</span>
        ${teamBadge(team)}
        <span class="cup-tname">${team?.name ?? s.teamId}</span>
        <span class="cup-tnum">${s.played}</span>
        <span class="cup-tnum cup-tnum--diff">${diff}</span>
        <span class="cup-tpts">${s.leaguePoints}</span>
      </div>`;
  }).join('');
  return `
    <div class="cup-pool">
      <div class="cup-pool-title">Pool ${pool.id}</div>
      <div class="cup-thead">
        <span class="cup-trank">#</span>
        <span class="cup-badge"></span>
        <span class="cup-tname">Club</span>
        <span class="cup-tnum">P</span>
        <span class="cup-tnum">+/−</span>
        <span class="cup-tpts">Pts</span>
      </div>
      ${rows}
    </div>`;
}

export function euroFixtureListHtml(fixtures: EuropeanFixture[], byId: TeamsById, highlightId: string): string {
  if (fixtures.length === 0) return '';
  const byDate = new Map<string, EuropeanFixture[]>();
  for (const f of fixtures) {
    const k = f.date ?? 'TBC';
    (byDate.get(k) ?? byDate.set(k, []).get(k)!).push(f);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, fs]) => {
      const rows = fs.map(f => {
        const home = byId.get(f.homeId);
        const away = byId.get(f.awayId);
        const mine = f.homeId === highlightId || f.awayId === highlightId;
        const score = f.result
          ? `<span class="cup-fx-score">${f.result.homeScore}–${f.result.awayScore}</span>`
          : `<span class="cup-fx-vs">v</span>`;
        return `
          <div class="cup-fx${mine ? ' cup-fx--me' : ''}">
            <span class="cup-fx-side cup-fx-home">${teamBadge(home)}<span class="cup-fx-name">${home?.shortName ?? f.homeId}</span></span>
            ${score}
            <span class="cup-fx-side cup-fx-away"><span class="cup-fx-name">${away?.shortName ?? f.awayId}</span>${teamBadge(away)}</span>
          </div>`;
      }).join('');
      return `<div class="cup-fx-day"><div class="cup-fx-date">${formatDate(date)}</div>${rows}</div>`;
    }).join('');
}

function koMatchCard(m: EuropeanKnockoutMatch, label: string, byId: TeamsById, highlightId: string): string {
  const home = fullName(m.homeId, byId);
  const away = fullName(m.awayId, byId);
  const mine = m.homeId === highlightId || m.awayId === highlightId;
  const homeWin = m.result ? m.result.homeScore > m.result.awayScore : false;
  const awayWin = m.result ? m.result.awayScore > m.result.homeScore : false;
  const hs = m.result ? `${m.result.homeScore}` : '';
  const as = m.result ? `${m.result.awayScore}` : '';
  return `
    <div class="cup-ko${mine ? ' cup-ko--me' : ''}">
      <div class="cup-ko-label">${label}${m.date ? ` · ${formatDate(m.date)}` : ''}</div>
      <div class="cup-ko-team${m.result && homeWin ? ' cup-ko-team--win' : ''}"><span>${home}</span><span class="cup-ko-score">${hs}</span></div>
      <div class="cup-ko-team${m.result && awayWin ? ' cup-ko-team--win' : ''}"><span>${away}</span><span class="cup-ko-score">${as}</span></div>
    </div>`;
}

export function euroKnockoutHtml(ko: EuropeanKnockout, byId: TeamsById, highlightId: string, compName: string): string {
  const r16 = ko.r16.map((m, i) => koMatchCard(m, `R16 Match ${i + 1}`, byId, highlightId)).join('');
  const qf  = ko.quarterfinals.map((m, i) => koMatchCard(m, `QF ${i + 1}`, byId, highlightId)).join('');
  const sf  = ko.semifinals.map((m, i) => koMatchCard(m, `SF ${i + 1}`, byId, highlightId)).join('');
  const fin = koMatchCard(ko.final, 'Final', byId, highlightId);
  const champ = ko.championTeamId
    ? `<div class="cup-champ">🏆 ${fullName(ko.championTeamId, byId)} — ${compName} Champions</div>`
    : '';
  return `
    <div class="cup-section-title">Round of 16</div>
    <div class="euro-ko-grid">${r16}</div>
    <div class="cup-section-title">Quarter-Finals</div>
    <div class="euro-ko-grid">${qf}</div>
    <div class="cup-section-title">Semi-Finals &amp; Final</div>
    <div class="cup-bracket">
      <div class="cup-bracket-col">${sf}</div>
      <div class="cup-bracket-col cup-bracket-col--final">${fin}</div>
    </div>
    ${champ}`;
}

export function euroScreenHtml(
  comp: EuropeanCompState | null,
  byId: TeamsById,
  highlightId: string,
  compName: string,
  backId: string,
): string {
  if (!comp) {
    return `
      <div class="app-header">
        <div class="app-topbar">
          <button id="${backId}" class="app-back" aria-label="Back to competitions">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Competitions</span>
          </button>
          <span class="app-title">${compName}</span>
          <div class="app-topbar-spacer"></div>
        </div>
      </div>
      <div style="padding:2rem;text-align:center;color:var(--color-chalk-dim)">Season not yet started.</div>
    `;
  }

  const poolsHtml = comp.pools.map(p => euroPoolTableHtml(p, byId, highlightId)).join('');

  // Group fixtures by pool for a cleaner read
  const poolFixtureBlocks = comp.pools.map(p => {
    const pf = comp.fixtures.filter(f => f.poolId === p.id);
    return `
      <div class="cup-section-title">Pool ${p.id} Fixtures</div>
      <div class="cup-fixtures">${euroFixtureListHtml(pf, byId, highlightId)}</div>`;
  }).join('');

  const koSection = comp.knockout
    ? `<div class="cup-section-title">Knockout Stage</div>${euroKnockoutHtml(comp.knockout, byId, highlightId, compName)}`
    : '';

  return `
    <div class="app-header">
      <div class="app-topbar">
        <button id="${backId}" class="app-back" aria-label="Back to competitions">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Competitions</span>
        </button>
        <span class="app-title">${compName}</span>
        <div class="app-topbar-spacer"></div>
      </div>
      <div class="app-eyebrow">${comp.seasonLabel}</div>
    </div>

    <div class="cup-content">
      <div class="cup-section-title">Pool Standings</div>
      <div class="cup-pools">${poolsHtml}</div>

      ${poolFixtureBlocks}

      ${koSection}
    </div>
  `;
}
