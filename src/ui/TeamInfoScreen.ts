import type { TeamProfile, StarPlayerMeta } from '../types/teamProfile';
import type { TeamTactics } from '../types/team';
import { computeOverallRating } from '../team/teamProfile';
import { playerOverall } from '../engine/RatingEngine';
import type { RawTeamInput } from '../types/teamData';
import { getAge } from '../game/age';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';

type RawPlayer = RawTeamInput['players'][number];

const TACTIC_LABELS: Record<keyof TeamTactics, Record<string, string>> = {
  attackingGamePlan: { kicking: 'Territorial', balanced: 'Balanced', possession: 'Possession' },
  attackingStyle:    { keep_it_tight: 'Keep It Tight', balanced: 'Balanced', wide_wide: 'Wide Wide' },
  attackingBreakdown:{ commit_numbers: 'Commit Numbers', balanced: 'Balanced Ruck', minimal_ruck: 'Minimal Ruck' },
  defendingBreakdown:{ jackal: 'Jackal Steal', counter_ruck: 'Counter Ruck', shadow: 'Shadow Line' },
  backfieldDefence:  { one_back: 'One Back', two_back: 'Two Back', three_back: 'Three Back' },
  defensiveLine:     { blitz: 'Blitz', hybrid: 'Hybrid', drift: 'Drift' },
  offloadStrategy:   { cautious: 'Cautious', balanced: 'Balanced', offload_freely: 'Offload Freely' },
};

const TACTIC_DIM_LABELS: Record<keyof TeamTactics, string> = {
  attackingGamePlan:  'Attacking plan',
  attackingStyle:     'Attacking style',
  attackingBreakdown: 'Attacking breakdown',
  defendingBreakdown: 'Defensive breakdown',
  backfieldDefence:   'Backfield',
  defensiveLine:      'Defensive line',
  offloadStrategy:    'Offload strategy',
};

function crestHtml(initial: string, color: string): string {
  const grad = `linear-gradient(160deg, ${color} 0%, color-mix(in oklch, ${color} 30%, black) 100%)`;
  return `
    <div class="ti-crest" style="background:${grad};border:2px solid color-mix(in oklch,${color} 55%,transparent)">
      <span>${initial}</span>
    </div>`;
}

function shortCoach(coach: string): string {
  return coach.split('(')[0].trim().replace(/[,;]\s*$/, '');
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

function squadRow(p: RawPlayer, currentDate: string): string {
  const ovr = playerOverall(p.baseStats, p.position);
  const name = `${p.firstName} ${p.lastName}`.trim();
  const age = getAge(p.dob, currentDate);
  const ageLabel = age === null ? '—' : `${age}`;
  // Mid-season entries come from buildTeamFromRoster (with rosterId set);
  // pre-game team-selector entries come straight from the JSON (no
  // rosterId), in which case the name renders as plain text without a
  // profile link — the profile screen needs the career roster to work.
  const hasRosterId = typeof p.rosterId === 'number';
  const nameHtml = hasRosterId
    ? playerLinkHtml(name, p.rosterId as number)
    : name;
  return `
    <div class="ti-squad-row">
      <div class="ti-squad-num">${p.squadNumber ?? p.id}</div>
      <div class="ti-squad-name">${nameHtml}</div>
      <div class="ti-squad-pos">${p.position}</div>
      <div class="ti-squad-age">${ageLabel}</div>
      <div class="ti-squad-ovr">${ovr}</div>
    </div>`;
}

export function initTeamInfoScreen(
  profile: TeamProfile,
  rawTeam: RawTeamInput,
  currentDate: string,
  onBack: () => void,
  // Optional: only wired on mid-season entry (when buildTeamFromRoster
  // gives every row a rosterId). Pre-game (team-selector) entries pass
  // undefined — player names render as plain text and the squad list is
  // a read-only browse.
  onPlayerClick?: (rosterId: number) => void,
): void {
  const el = document.getElementById('team-info');
  if (!el) return;

  const overallRating = computeOverallRating(profile.id);

  const starters = rawTeam.players;
  const bench = rawTeam.bench ?? [];
  const squad = rawTeam.squad ?? [];

  el.innerHTML = `
    <button id="ti-back" class="app-back-floating" aria-label="Back">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      <span>Back</span>
    </button>

    <div id="ti-inner">
      <header id="ti-hero">
        ${crestHtml(profile.shortName[0] ?? '?', profile.color)}
        <h2 id="ti-name">${profile.name}</h2>
      </header>

      <section class="ti-tiles">
        <div class="ti-tile ti-tile-full">
          <div class="ti-tile-label">Overall rating</div>
          <div class="ti-tile-value ti-rating">${overallRating}</div>
        </div>
        ${profile.stadiumCapacity ? `
          <div class="ti-tile ti-tile-sm">
            <div class="ti-tile-label">Stadium capacity</div>
            <div class="ti-tile-value">${profile.stadiumCapacity.toLocaleString()}</div>
            <div class="ti-tile-foot">${profile.stadium.split('(')[0].trim()}</div>
          </div>
        ` : ''}
        ${profile.headCoach ? `
          <div class="ti-tile ti-tile-sm">
            <div class="ti-tile-label">Head coach</div>
            <div class="ti-tile-value">${shortCoach(profile.headCoach)}</div>
          </div>
        ` : ''}
      </section>

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
          <div class="ti-squad-list">${starters.map(p => squadRow(p, currentDate)).join('')}</div>
        </details>
        ${bench.length ? `
          <details class="ti-squad-details">
            <summary>Bench (${bench.length})</summary>
            <div class="ti-squad-list">${bench.map(p => squadRow(p, currentDate)).join('')}</div>
          </details>
        ` : ''}
        ${squad.length ? `
          <details class="ti-squad-details">
            <summary>Wider squad (${squad.length})</summary>
            <div class="ti-squad-list">${squad.map(p => squadRow(p, currentDate)).join('')}</div>
          </details>
        ` : ''}
      </section>
    </div>
  `;

  el.querySelector<HTMLButtonElement>('#ti-back')!.addEventListener('click', () => {
    onBack();
  });

  if (onPlayerClick) {
    wirePlayerLinks(el, onPlayerClick);
  }
}
