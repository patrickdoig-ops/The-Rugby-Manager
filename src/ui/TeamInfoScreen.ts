import type { TeamProfile, StarPlayerMeta } from '../types/teamProfile';
import type { TeamTactics } from '../types/team';
import { computeOverallRating } from '../team/teamProfile';
import { playerOverall } from '../engine/RatingEngine';
import type { RawTeamInput } from '../engine/MatchCoordinator';

type RawPlayer = RawTeamInput['players'][number];

const TACTIC_LABELS: Record<keyof TeamTactics, Record<string, string>> = {
  attackingGamePlan: { possession: 'Possession', balanced: 'Balanced', kicking: 'Territorial' },
  attackingStyle:    { keep_it_tight: 'Keep It Tight', balanced: 'Balanced', wide_wide: 'Wide Wide' },
  attackingBreakdown:{ pick_and_drive: 'Commit Numbers', balanced: 'Balanced Ruck', wide_play: 'Wide Play' },
  defendingBreakdown:{ jackal: 'Jackal Steal', counter_ruck: 'Counter Ruck', shadow: 'Shadow Line' },
  backfieldDefence:  { one_back: 'One Back', two_back: 'Two Back', three_back: 'Three Back' },
};

const TACTIC_DIM_LABELS: Record<keyof TeamTactics, string> = {
  attackingGamePlan:  'Attacking plan',
  attackingStyle:     'Attacking style',
  attackingBreakdown: 'Attacking breakdown',
  defendingBreakdown: 'Defensive breakdown',
  backfieldDefence:   'Backfield',
};

function crestHtml(initial: string, color: string, size: number): string {
  const grad = `linear-gradient(160deg, ${color} 0%, color-mix(in oklch, ${color} 65%, black) 100%)`;
  return `
    <div class="ti-crest" style="width:${size}px;height:${size}px;background:${grad};border:2px solid color-mix(in oklch,${color} 55%,transparent)">
      <span>${initial}</span>
    </div>`;
}

function shortStadium(stadium: string): string {
  return stadium.split('(')[0].trim();
}

function shortCoach(coach: string): string {
  return coach.split('(')[0].trim().replace(/[,;]\s*$/, '');
}

function shortNickname(nickname: string): string {
  return nickname.split('(')[0].trim();
}

function clubTilesHtml(profile: TeamProfile): string {
  const tiles: string[] = [];
  if (profile.founded) {
    const age = new Date().getFullYear() - profile.founded;
    tiles.push(`
      <div class="ti-tile">
        <div class="ti-tile-label">Founded</div>
        <div class="ti-tile-value">${profile.founded}</div>
        <div class="ti-tile-foot">${age} years old</div>
      </div>`);
  }
  if (profile.nickname) {
    tiles.push(`
      <div class="ti-tile">
        <div class="ti-tile-label">Nickname</div>
        <div class="ti-tile-value ti-tile-text">${shortNickname(profile.nickname)}</div>
      </div>`);
  }
  if (profile.stadiumCapacity) {
    tiles.push(`
      <div class="ti-tile">
        <div class="ti-tile-label">Stadium capacity</div>
        <div class="ti-tile-value">${profile.stadiumCapacity.toLocaleString()}</div>
        <div class="ti-tile-foot">${shortStadium(profile.stadium)}</div>
      </div>`);
  }
  if (profile.headCoach) {
    tiles.push(`
      <div class="ti-tile">
        <div class="ti-tile-label">Head coach</div>
        <div class="ti-tile-value ti-tile-text">${shortCoach(profile.headCoach)}</div>
      </div>`);
  }
  return tiles.join('');
}

function tacticsChips(t: TeamTactics): string {
  return (Object.keys(TACTIC_DIM_LABELS) as (keyof TeamTactics)[]).map(dim => {
    const value = t[dim];
    const label = TACTIC_LABELS[dim][value] ?? value;
    return `
      <div class="ti-tactic-chip">
        <div class="ti-tactic-dim">${TACTIC_DIM_LABELS[dim]}</div>
        <div class="ti-tactic-val">${label}</div>
      </div>`;
  }).join('');
}

function starCard(s: StarPlayerMeta): string {
  const indexHigh = s.indexHigh.map(stat => `<span class="ti-pill">${stat}</span>`).join('');
  return `
    <div class="ti-star">
      <div class="ti-star-head">
        <div class="ti-star-name">${s.name}</div>
        <div class="ti-star-rating">${s.suggestedRating}</div>
      </div>
      <div class="ti-star-meta">${s.position} · ${s.nationality}</div>
      <div class="ti-star-blurb">${s.blurb}</div>
      ${indexHigh ? `<div class="ti-star-pills">${indexHigh}</div>` : ''}
    </div>`;
}

function squadRow(p: RawPlayer): string {
  const ovr = playerOverall(p.baseStats, p.position);
  const name = `${p.firstName} ${p.lastName}`.trim();
  return `
    <div class="ti-squad-row">
      <div class="ti-squad-num">${p.squadNumber ?? p.id}</div>
      <div class="ti-squad-name">${name}</div>
      <div class="ti-squad-pos">${p.position}</div>
      <div class="ti-squad-ovr">${ovr}</div>
    </div>`;
}

export function initTeamInfoScreen(
  profile: TeamProfile,
  rawTeam: RawTeamInput,
  onBack: () => void,
): void {
  const el = document.getElementById('team-info');
  if (!el) return;

  const overallRating = computeOverallRating(profile.id);
  const form = profile.seasonForm;
  const showForm = form.played > 0;

  const starters = rawTeam.players;
  const bench = rawTeam.bench ?? [];
  const squad = rawTeam.squad ?? [];

  el.innerHTML = `
    <button id="ti-back" aria-label="Back">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      <span>Back</span>
    </button>

    <div id="ti-inner">
      <header id="ti-hero">
        ${crestHtml(profile.shortName[0] ?? '?', profile.color, 96)}
        <h2 id="ti-name">${profile.name}</h2>
        <div id="ti-code">${[
          profile.shortName,
          profile.nickname ? shortNickname(profile.nickname) : null,
          profile.founded ? `Est. ${profile.founded}` : null,
          shortStadium(profile.stadium),
        ].filter(Boolean).join(' · ')}</div>
      </header>

      <section class="ti-tiles">
        <div class="ti-tile">
          <div class="ti-tile-label">Overall rating</div>
          <div class="ti-tile-value ti-rating">${overallRating}</div>
          <div class="ti-tile-foot">Top-23 squad average</div>
        </div>
        ${showForm ? `
          <div class="ti-tile">
            <div class="ti-tile-label">Season form</div>
            <div class="ti-tile-value">${form.won}-${form.drawn}-${form.lost}</div>
            <div class="ti-tile-foot">${form.played} played · ${form.leaguePoints} pts · ${form.pointsDiff >= 0 ? '+' : ''}${form.pointsDiff} PD</div>
          </div>
        ` : ''}
      </section>

      ${(profile.founded || profile.nickname || profile.stadiumCapacity || profile.headCoach) ? `
        <section class="ti-section">
          <h3 class="ti-section-title">Club</h3>
          <div class="ti-tiles ti-tiles-club">${clubTilesHtml(profile)}</div>
        </section>
      ` : ''}

      ${profile.blurb ? `
        <section class="ti-section">
          <h3 class="ti-section-title">About</h3>
          <p class="ti-blurb">${profile.blurb}</p>
        </section>
      ` : ''}

      <section class="ti-section">
        <h3 class="ti-section-title">Playing style</h3>
        <div class="ti-tactics-grid">${tacticsChips(profile.suggestedTactics)}</div>
        ${profile.statBias.length ? `
          <div class="ti-bias">
            <div class="ti-bias-label">Stat bias</div>
            <div class="ti-bias-pills">${profile.statBias.map(s => `<span class="ti-pill">${s}</span>`).join('')}</div>
          </div>
        ` : ''}
      </section>

      ${profile.stars.length ? `
        <section class="ti-section">
          <h3 class="ti-section-title">Star players</h3>
          <div class="ti-stars">${profile.stars.map(starCard).join('')}</div>
        </section>
      ` : ''}

      ${profile.honours ? `
        <section class="ti-section">
          <h3 class="ti-section-title">Honours</h3>
          <p class="ti-honours">${profile.honours}</p>
        </section>
      ` : ''}

      <section class="ti-section">
        <h3 class="ti-section-title">Squad</h3>
        <details class="ti-squad-details">
          <summary>Starting XV (15)</summary>
          <div class="ti-squad-list">${starters.map(squadRow).join('')}</div>
        </details>
        ${bench.length ? `
          <details class="ti-squad-details">
            <summary>Bench (${bench.length})</summary>
            <div class="ti-squad-list">${bench.map(squadRow).join('')}</div>
          </details>
        ` : ''}
        ${squad.length ? `
          <details class="ti-squad-details">
            <summary>Wider squad (${squad.length})</summary>
            <div class="ti-squad-list">${squad.map(squadRow).join('')}</div>
          </details>
        ` : ''}
      </section>
    </div>
  `;

  el.querySelector<HTMLButtonElement>('#ti-back')!.addEventListener('click', () => {
    onBack();
  });
}
