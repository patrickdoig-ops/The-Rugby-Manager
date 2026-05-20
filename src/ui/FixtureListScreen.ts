import type { RawTeamInput } from '../engine/MatchCoordinator';

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
  onBack: () => void,
): { recordResult(round: number, homeScore: number, awayScore: number): void } {
  const el = document.getElementById('fixture-list');
  if (!el) return { recordResult() {} };

  const opponents = allTeams.filter(t => t.id !== playerTeam.id);
  const TOTAL_ROUNDS = opponents.length * 2;

  // Round-robin alternating venue: player starts at home, venue flips every
  // round, each opponent is faced once at home and once away. First leg cycles
  // through opponents[0..n-1] in rounds 1..n; second leg replays opponents
  // [0..n-1] in rounds n+1..2n, by which point each opponent's venue has flipped.
  const fixtures: Fixture[] = [];
  for (let leg = 0; leg < 2; leg++) {
    for (let i = 0; i < opponents.length; i++) {
      const round = leg * opponents.length + i + 1;
      const playerHome = round % 2 === 1;
      fixtures.push({
        round,
        homeTeam: playerHome ? playerTeam : opponents[i],
        awayTeam: playerHome ? opponents[i] : playerTeam,
        playerSide: playerHome ? 'home' : 'away',
      });
    }
  }

  let currentRound = 1;
  const results = new Map<number, { home: number; away: number }>();

  function render(): void {
    const list = el!.querySelector('#fl-list')!;
    list.innerHTML = fixtures.map(f => {
      const result = results.get(f.round);
      const isComplete = f.round < currentRound;
      const isActive   = f.round === currentRound;
      const rowClass   = isComplete ? 'fl-row--complete' : isActive ? 'fl-row--active' : 'fl-row--locked';
      const midEl      = isComplete && result
        ? `<span class="fl-score">${result.home}–${result.away}</span>`
        : `<span class="fl-vs">vs</span>`;
      return `
        <div class="fl-row ${rowClass}">
          <div class="fl-round">
            <span class="fl-round-label">RND</span>
            <span class="fl-round-num">${f.round}</span>
          </div>
          <div class="fl-matchup">
            <div class="fl-team fl-team--home">
              ${miniCrest(f.homeTeam)}
              <span class="fl-team-name">${f.homeTeam.shortName}</span>
            </div>
            ${midEl}
            <div class="fl-team fl-team--away">
              <span class="fl-team-name">${f.awayTeam.shortName}</span>
              ${miniCrest(f.awayTeam)}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const footer = el!.querySelector('#fl-footer')!;
    if (currentRound > TOTAL_ROUNDS) {
      footer.innerHTML = `<p id="fl-season-done">Season complete</p>`;
    } else {
      footer.innerHTML = `
        <button id="fl-play-next" aria-label="Play next game">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd"/></svg>
          <span>Play next game</span>
        </button>
      `;
      el!.querySelector<HTMLButtonElement>('#fl-play-next')!.addEventListener('click', () => {
        const fixture = fixtures.find(f => f.round === currentRound)!;
        onPlay(fixture.homeTeam, fixture.awayTeam, fixture.playerSide, fixture.round);
      });
    }
  }

  el.innerHTML = `
    <div id="fl-topbar">
      <button id="fl-back" aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        <span>Teams</span>
      </button>
      <span id="fl-title">Season Fixtures</span>
      <div style="width:72px"></div>
    </div>
    <div id="fl-eyebrow">2025/26 Season · ${TOTAL_ROUNDS} Rounds</div>
    <div id="fl-list"></div>
    <div id="fl-footer"></div>
  `;

  el.querySelector<HTMLButtonElement>('#fl-back')!.addEventListener('click', () => {
    onBack();
  });

  render();

  return {
    recordResult(round: number, homeScore: number, awayScore: number): void {
      results.set(round, { home: homeScore, away: awayScore });
      currentRound = round + 1;
      render();
    },
  };
}
