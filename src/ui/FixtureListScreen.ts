import type { RawTeamInput } from '../engine/MatchEngine';

type Fixture = {
  round: number;
  homeTeam: RawTeamInput;
  awayTeam: RawTeamInput;
  playerSide: 'home' | 'away';
};

function miniCrest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 65%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="fl-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

export function initFixtureListScreen(
  playerTeam: RawTeamInput,
  allTeams: RawTeamInput[],
  onPlay: (homeTeam: RawTeamInput, awayTeam: RawTeamInput, playerSide: 'home' | 'away', round: number) => void,
): void {
  const el = document.getElementById('fixture-list');
  if (!el) return;

  const opponents = allTeams.filter(t => t.id !== playerTeam.id);

  const fixtures: Fixture[] = [
    { round: 1, homeTeam: playerTeam, awayTeam: opponents[0], playerSide: 'home' },
    { round: 2, homeTeam: playerTeam, awayTeam: opponents[1], playerSide: 'home' },
    { round: 3, homeTeam: playerTeam, awayTeam: opponents[2], playerSide: 'home' },
    { round: 4, homeTeam: opponents[0], awayTeam: playerTeam, playerSide: 'away' },
    { round: 5, homeTeam: opponents[1], awayTeam: playerTeam, playerSide: 'away' },
    { round: 6, homeTeam: opponents[2], awayTeam: playerTeam, playerSide: 'away' },
  ];

  el.innerHTML = `
    <div id="fl-topbar">
      <button id="fl-back" aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        <span>Teams</span>
      </button>
      <span id="fl-title">Season Fixtures</span>
      <div style="width:72px"></div>
    </div>
    <div id="fl-eyebrow">2026 Season · 6 Rounds</div>
    <div id="fl-list">
      ${fixtures.map(f => `
        <div class="fl-row${f.round === 1 ? ' fl-row--active' : ' fl-row--locked'}">
          <div class="fl-round">
            <span class="fl-round-label">RND</span>
            <span class="fl-round-num">${f.round}</span>
          </div>
          <div class="fl-matchup">
            <div class="fl-team fl-team--home">
              ${miniCrest(f.homeTeam)}
              <span class="fl-team-name">${f.homeTeam.shortName}</span>
            </div>
            <span class="fl-vs">vs</span>
            <div class="fl-team fl-team--away">
              <span class="fl-team-name">${f.awayTeam.shortName}</span>
              ${miniCrest(f.awayTeam)}
            </div>
          </div>
          ${f.round === 1
            ? `<button class="fl-play-btn" data-round="${f.round}">
                 <span>Play</span>
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd"/></svg>
               </button>`
            : `<div class="fl-locked">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
               </div>`
          }
        </div>
      `).join('')}
    </div>
  `;

  el.querySelector<HTMLButtonElement>('#fl-back')!.addEventListener('click', () => {
    el.style.display = 'none';
    const teamSelector = document.getElementById('team-selector')!;
    teamSelector.style.display = '';
  });

  el.querySelectorAll<HTMLButtonElement>('.fl-play-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const round = Number(btn.dataset.round);
      const fixture = fixtures.find(f => f.round === round)!;
      el.style.display = 'none';
      onPlay(fixture.homeTeam, fixture.awayTeam, fixture.playerSide, fixture.round);
    });
  });
}
