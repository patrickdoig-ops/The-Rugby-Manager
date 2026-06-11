// Shared Prem Cup render helpers — pool tables, fixture lists, and the
// knockout bracket. Consumed by CupFixturesScreen + CupResultsScreen so the
// two surfaces render the cup identically.

import type { CupFixture, CupKnockout, CupKnockoutMatch, CupPool } from '../../types/gameState';
import type { RawTeamInput } from '../../types/teamData';
import { sortStandings } from '../../game/leagueTable';

type TeamsById = Map<string, RawTeamInput>;

function teamBadge(team: RawTeamInput | undefined): string {
  if (!team) return '<span class="cup-badge"></span>';
  const initial = team.shortName[0] ?? '?';
  return `<span class="cup-badge" style="background:${team.color}">${initial}</span>`;
}

function teamName(teamId: string | null, teamsById: TeamsById): string {
  if (!teamId) return 'TBC';
  return teamsById.get(teamId)?.name ?? teamId;
}

// One pool standings table. Top two rows (qualifiers) get a marker.
export function poolTableHtml(pool: CupPool, teamsById: TeamsById, highlightTeamId: string | null): string {
  const sorted = sortStandings(pool.standings);
  const rows = sorted.map((s, i) => {
    const team = teamsById.get(s.teamId);
    const cls = ['cup-trow'];
    if (i === 2) cls.push('cup-trow--zone-break');
    if (s.teamId === highlightTeamId) cls.push('cup-trow--me');
    return `
      <div class="${cls.join(' ')}">
        <span class="cup-trank">${i + 1}</span>
        ${teamBadge(team)}
        <span class="cup-tname">${team?.name ?? s.teamId}</span>
        <span class="cup-tnum">${s.played}</span>
        <span class="cup-tnum cup-tnum--diff">${s.pointsDiff > 0 ? '+' : ''}${s.pointsDiff}</span>
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

// A list of fixtures grouped by date. Each shows the score when played.
export function fixtureListHtml(fixtures: CupFixture[], teamsById: TeamsById, highlightTeamId: string | null): string {
  if (fixtures.length === 0) return '';
  const byDate = new Map<string, CupFixture[]>();
  for (const f of fixtures) {
    const k = f.date || 'TBC';
    (byDate.get(k) ?? byDate.set(k, []).get(k)!).push(f);
  }
  const dateBlocks = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, fs]) => {
      const rows = fs.map(f => {
        const home = teamsById.get(f.homeId);
        const away = teamsById.get(f.awayId);
        const mine = f.homeId === highlightTeamId || f.awayId === highlightTeamId;
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
  return dateBlocks;
}

// The knockout bracket: two semi-finals feeding the final.
export function bracketHtml(ko: CupKnockout, teamsById: TeamsById, highlightTeamId: string | null): string {
  const matchCard = (m: CupKnockoutMatch, label: string): string => {
    const home = teamName(m.homeId, teamsById);
    const away = teamName(m.awayId, teamsById);
    const mine = m.homeId === highlightTeamId || m.awayId === highlightTeamId;
    const winnerHome = m.result ? m.result.homeScore >= m.result.awayScore : false;
    const hs = m.result ? `${m.result.homeScore}` : '';
    const as = m.result ? `${m.result.awayScore}` : '';
    return `
      <div class="cup-ko${mine ? ' cup-ko--me' : ''}">
        <div class="cup-ko-label">${label}</div>
        <div class="cup-ko-team${m.result && winnerHome ? ' cup-ko-team--win' : ''}"><span>${home}</span><span class="cup-ko-score">${hs}</span></div>
        <div class="cup-ko-team${m.result && !winnerHome ? ' cup-ko-team--win' : ''}"><span>${away}</span><span class="cup-ko-score">${as}</span></div>
      </div>`;
  };
  const champ = ko.championTeamId ? `<div class="cup-champ">🏆 ${teamName(ko.championTeamId, teamsById)} — League Cup Champions</div>` : '';
  return `
    <div class="cup-bracket">
      <div class="cup-bracket-col">
        ${matchCard(ko.semifinals[0], 'Semi-Final 1')}
        ${matchCard(ko.semifinals[1], 'Semi-Final 2')}
      </div>
      <div class="cup-bracket-col cup-bracket-col--final">
        ${matchCard(ko.final, 'Final')}
      </div>
    </div>
    ${champ}`;
}

function formatDate(iso: string): string {
  if (iso === 'TBC' || !iso) return 'Date TBC';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
