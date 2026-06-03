// Player profile screen — reached by tapping any player name across the
// in-season screens (TeamInfo squad rows, Contracts, SquadManagement,
// PlayerStats leaderboards, transfer / retention / signing screens,
// EndOfSeason award cards, Rollover lines).
//
// **Layout** (top to bottom):
//   - Header strip: nationality flag, name, position chip, age, club
//     crest + name, big OVR badge.
//   - Identity grid (3×2): contract · wage / condition · reputation /
//     morale · form. Injury chip and int'l caps append below when present.
//   - Attributes block:
//     - Hex radar (SVG, no library) — 12 axes, polygon = baseStats.
//       Greyed axis labels for position-irrelevant stats.
//     - Grouped attribute bars: Physical / Skill / Mental columns.
//   - Current season panel: appearances + headline counters.
//   - Career history table: one row per past season from
//     state.career.archive[*].playerSeasonHistory[rosterId], with the
//     current season's live tally as a "(in progress)" top row.
//
// **Navigation.** Single open at a time. main.ts owns the
// origin-aware back callback (mirrors goTeamInfoMidSeason in v2.180a).
// Re-renders on game:fixtureRecorded / game:weekAdvanced /
// game:seasonRolledOver so live stats refresh while the screen is open.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { GameState, ArchivedPlayerSeason } from '../types/gameState';
import type { Player, PlayerStats, Position } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import { IRRELEVANT_STATS } from '../engine/balance/rating';
import { getAge } from '../game/age';
import { scoutingBand } from '../game/scouting';
import { eventBus } from '../utils/eventBus';

interface AttributeRow {
  key: keyof PlayerStats;
  label: string;
  short: string;
}

const ATTR_GROUPS: { id: 'physical' | 'skill' | 'mental'; label: string; rows: AttributeRow[] }[] = [
  {
    id: 'physical',
    label: 'Physical',
    rows: [
      { key: 'stamina',  label: 'Stamina',  short: 'STM' },
      { key: 'strength', label: 'Strength', short: 'STR' },
      { key: 'pace',     label: 'Pace',     short: 'PAC' },
      { key: 'agility',  label: 'Agility',  short: 'AGI' },
    ],
  },
  {
    id: 'skill',
    label: 'Skill',
    rows: [
      { key: 'handling',  label: 'Handling',  short: 'HND' },
      { key: 'tackling',  label: 'Tackling',  short: 'TKL' },
      { key: 'breakdown', label: 'Breakdown', short: 'BRK' },
      { key: 'kicking',   label: 'Kicking',   short: 'KCK' },
      { key: 'setPiece',  label: 'Set Piece', short: 'SET' },
    ],
  },
  {
    id: 'mental',
    label: 'Mental',
    rows: [
      { key: 'discipline',  label: 'Discipline',  short: 'DIS' },
      { key: 'positioning', label: 'Positioning', short: 'POS' },
      { key: 'composure',   label: 'Composure',   short: 'CMP' },
    ],
  },
];

// Axis order for the hex radar — clockwise from 12 o'clock. Grouped so
// the same "facet" stats sit adjacent on the polygon (physical at the
// top, skill on the right, mental on the bottom-left).
const RADAR_AXES: AttributeRow[] = [
  { key: 'stamina',     label: 'Stamina',     short: 'STM' },
  { key: 'strength',    label: 'Strength',    short: 'STR' },
  { key: 'pace',        label: 'Pace',        short: 'PAC' },
  { key: 'agility',     label: 'Agility',     short: 'AGI' },
  { key: 'handling',    label: 'Handling',    short: 'HND' },
  { key: 'tackling',    label: 'Tackling',    short: 'TKL' },
  { key: 'breakdown',   label: 'Breakdown',   short: 'BRK' },
  { key: 'kicking',     label: 'Kicking',     short: 'KCK' },
  { key: 'setPiece',    label: 'Set Piece',   short: 'SET' },
  { key: 'discipline',  label: 'Discipline',  short: 'DIS' },
  { key: 'positioning', label: 'Positioning', short: 'POS' },
  { key: 'composure',   label: 'Composure',   short: 'CMP' },
];

function ovrClass(ovr: number): string {
  if (ovr >= 85) return 'ovr-elite';
  if (ovr >= 78) return 'ovr-good';
  if (ovr >= 70) return 'ovr-avg';
  if (ovr >= 62) return 'ovr-poor';
  return 'ovr-veryPoor';
}

function ratingClass(r: number): string {
  if (r >= 7.5) return 'rating-high';
  if (r >= 5.5) return 'rating-mid';
  if (r >= 3.5) return 'rating-low';
  return 'rating-poor';
}

function fmtWage(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n}`;
}

function fmtExpiry(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fmtInjuryKind(kind: string): string {
  return kind.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function isIrrelevant(stat: keyof PlayerStats, position: Position): boolean {
  return (IRRELEVANT_STATS[position] ?? []).includes(stat);
}

// SVG radar: 12 axes, scaled 0-99 on each. Outputs the inner shape +
// concentric guide rings + axis labels.
// `scoutAccuracy`: null = own squad (exact); number = scouting accuracy (0-100).
function radarSvg(player: Player, scoutAccuracy: number | null): string {
  const cx = 130;
  const cy = 130;
  const r  = 90;
  const valueScale = (v: number): number => Math.max(0, Math.min(99, v)) / 99;
  const angles = RADAR_AXES.map((_, i) => (-Math.PI / 2) + (i * 2 * Math.PI / RADAR_AXES.length));

  const polygonPts = angles.map((a, i) => {
    const raw = player.baseStats[RADAR_AXES[i].key];
    // When scouting, use midpoint of the band so the radar shape is
    // plausibly positioned without revealing the exact value.
    const v = scoutAccuracy !== null
      ? (() => { const [lo, hi] = scoutingBand(raw, scoutAccuracy); return (lo + hi) / 2; })()
      : raw;
    const x = cx + Math.cos(a) * r * valueScale(v);
    const y = cy + Math.sin(a) * r * valueScale(v);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Five concentric guide rings (20 / 40 / 60 / 80 / 100% of max).
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0].map(scale => {
    const ringPts = angles.map(a => {
      const x = cx + Math.cos(a) * r * scale;
      const y = cy + Math.sin(a) * r * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<polygon class="pp-radar-ring" points="${ringPts}"/>`;
  }).join('');

  // Radial axis lines from centre to perimeter — one per axis.
  const spokes = angles.map(a => {
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    return `<line class="pp-radar-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join('');

  // Axis labels positioned just outside the polygon perimeter. Greyed
  // for position-irrelevant axes (forwards: kicking; backs: setPiece).
  const labels = angles.map((a, i) => {
    const axis = RADAR_AXES[i];
    const lr = r + 18;
    const x = cx + Math.cos(a) * lr;
    const y = cy + Math.sin(a) * lr;
    const greyed = isIrrelevant(axis.key, player.position) ? ' pp-radar-label--irrelevant' : '';
    return `<text class="pp-radar-label${greyed}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${axis.short}</text>`;
  }).join('');

  return `
    <svg class="pp-radar" viewBox="0 0 260 260" aria-hidden="true">
      ${rings}
      ${spokes}
      <polygon class="pp-radar-shape" points="${polygonPts}"/>
      ${labels}
    </svg>`;
}

// `scoutAccuracy`: null = own squad (exact); number = scouting accuracy (0-100).
function attributeBars(player: Player, scoutAccuracy: number | null): string {
  return ATTR_GROUPS.map(group => {
    const rows = group.rows.map(row => {
      const raw = Math.max(0, Math.min(99, player.baseStats[row.key]));
      const irrelevant = isIrrelevant(row.key, player.position);
      if (scoutAccuracy !== null) {
        const [lo, hi] = scoutingBand(raw, scoutAccuracy);
        const mid = (lo + hi) / 2;
        const classes = ['pp-attr-row', `pp-attr-row--${ovrClass(mid)}`, 'pp-attr-row--scouted'];
        if (irrelevant) classes.push('pp-attr-row--irrelevant');
        const barLo = (lo / 99) * 100;
        const barHi = (hi / 99) * 100;
        const valStr = lo === hi ? String(lo) : `${lo}–${hi}`;
        return `
          <div class="${classes.join(' ')}">
            <span class="pp-attr-short">${row.short}</span>
            <span class="pp-attr-label">${row.label}</span>
            <div class="pp-attr-bar pp-attr-bar--band">
              <div class="pp-attr-bar-band" style="left:${barLo.toFixed(1)}%;width:${(barHi - barLo).toFixed(1)}%"></div>
            </div>
            <span class="pp-attr-val pp-attr-val--band">${valStr}</span>
          </div>`;
      }
      const classes = ['pp-attr-row', `pp-attr-row--${ovrClass(raw)}`];
      if (irrelevant) classes.push('pp-attr-row--irrelevant');
      return `
        <div class="${classes.join(' ')}">
          <span class="pp-attr-short">${row.short}</span>
          <span class="pp-attr-label">${row.label}</span>
          <div class="pp-attr-bar"><div class="pp-attr-bar-fill" style="width:${raw}%"></div></div>
          <span class="pp-attr-val">${raw}</span>
        </div>`;
    }).join('');
    return `
      <div class="pp-attr-group">
        <h4 class="pp-attr-group-label">${group.label}</h4>
        ${rows}
      </div>`;
  }).join('');
}

function findClubId(state: GameState, rosterId: number): string | null {
  for (const c of state.career.clubs) {
    if (c.squad.includes(rosterId)) return c.id;
  }
  return null;
}

function clubCrest(team: RawTeamInput, size: 'lg' | 'sm'): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const klass = size === 'lg' ? 'pp-club-crest pp-club-crest--lg' : 'pp-club-crest';
  return `<span class="${klass}" style="background:${grad}"><span>${team.shortName[0] ?? '?'}</span></span>`;
}

// Scouting panel for non-squad external players. Shows accuracy progress,
// the currently assigned scout (if any), and buttons to assign/unassign
// the club's hired scouts.
function scoutingSection(state: GameState, rosterId: number): string {
  const rec = state.player.scouting?.[rosterId];
  const accuracy = rec?.accuracy ?? 0;
  const assignedId = rec?.assignedScoutId;
  const hiredScouts = (state.career.staff ?? []).filter(
    m => m.role === 'scout' && m.clubId === state.player.teamId,
  );

  const accuracyPct = Math.round(accuracy);
  const accuracyBar = `
    <div class="pp-scout-bar-wrap">
      <div class="pp-scout-bar-fill" style="width:${accuracyPct}%"></div>
    </div>`;

  let assignedLine = '';
  if (assignedId) {
    const scout = hiredScouts.find(m => m.id === assignedId);
    assignedLine = scout
      ? `<div class="pp-scout-assigned">Assigned: <strong>${scout.name}</strong>
           <button class="pp-scout-btn pp-scout-btn--unassign" data-action="unassign">Remove</button>
         </div>`
      : '';
  }

  let scoutList = '';
  if (hiredScouts.length === 0) {
    scoutList = `<p class="pp-scout-empty">Hire a scout to accelerate attribute discovery.</p>`;
  } else {
    const rows = hiredScouts.map(m => {
      const isAssigned = m.id === assignedId;
      const otherTarget = !isAssigned && Object.entries(state.player.scouting ?? {}).find(
        ([, r]) => r.assignedScoutId === m.id,
      );
      const subLabel = otherTarget
        ? `(scouting ${state.career.roster[Number(otherTarget[0])]?.lastName ?? '?'})`
        : isAssigned ? '(assigned here)' : '(available)';
      return `
        <div class="pp-scout-row">
          <span class="pp-scout-name">${m.name}</span>
          <span class="pp-scout-sub">${subLabel}</span>
          ${!isAssigned
            ? `<button class="pp-scout-btn pp-scout-btn--assign" data-action="assign" data-scout="${m.id}">Assign</button>`
            : ''}
        </div>`;
    }).join('');
    scoutList = `<div class="pp-scout-list">${rows}</div>`;
  }

  return `
    <section class="pp-section pp-section--scouting">
      <h3 class="pp-section-title">Scouting</h3>
      <div class="pp-scout-accuracy">
        <span class="pp-scout-pct">${accuracyPct}% accuracy</span>
        ${accuracyBar}
      </div>
      ${assignedLine}
      ${scoutList}
    </section>`;
}

let activeRosterId: number | null = null;
let activeOnBack: (() => void) | null = null;
let renderImpl: (() => void) | null = null;

export function showPlayerProfile(rosterId: number, onBack: () => void): void {
  activeRosterId = rosterId;
  activeOnBack   = onBack;
  renderImpl?.();
}

export function initPlayerProfileScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('player-profile');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    if (!el) return;
    if (activeRosterId === null) return;

    const state = getGameEngine().getState();
    const player = state.career.roster[activeRosterId];
    if (!player) {
      el.innerHTML = `
        <button id="pp-back" class="app-back-floating" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Back</span>
        </button>
        <div class="empty-state" style="margin-top:80px">
          <div class="empty-state__title">Player not found</div>
          <div class="empty-state__desc">This player is no longer in the league.</div>
        </div>`;
      el.querySelector<HTMLButtonElement>('#pp-back')!.addEventListener('click', () => activeOnBack?.());
      return;
    }

    const ovr = playerOverall(player.baseStats, player.position);
    const age = getAge(player.dob, state.calendar.date);
    const clubId = findClubId(state, player.rosterId);
    const team = clubId ? teamsById.get(clubId) : null;

    // Determine scouting visibility: null = own squad (exact); number = accuracy.
    const userSquad = state.career.clubs.find(c => c.id === state.player.teamId)?.squad ?? [];
    const isOwnSquad = userSquad.includes(player.rosterId);
    const scoutAccuracy: number | null = isOwnSquad
      ? null
      : (state.player.scouting?.[player.rosterId]?.accuracy ?? 0);

    // Current season tally — always shown, even with 0 apps (renders as
    // em-dashes). The profile is most useful right at the start of a
    // career when there's no data yet.
    const cur = player.seasonStats;
    const curAvg = cur.appearances > 0 ? cur.ratingSum / cur.appearances : null;

    const headerSection = `
      <header class="pp-header">
        <div class="pp-id">
          <div class="pp-id-line1">
            <span class="pp-name">${player.firstName} ${player.lastName}</span>
            ${player.contract.isMarquee
              ? `<span class="pp-marquee" title="Marquee player"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.637 1.55.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.755-.415-2.211.749-2.305l5.404-.434 2.082-5.005z"/></svg></span>`
              : ''}
          </div>
          <div class="pp-id-line2">
            <span class="pp-pos">${player.position}</span>
            <span class="pp-meta-sep">·</span>
            <span>Age ${age ?? '—'}</span>
            <span class="pp-meta-sep">·</span>
            <span>${player.nationality}</span>
          </div>
          ${team
            ? `<div class="pp-id-line3">${clubCrest(team, 'sm')}<span class="pp-club-name">${team.name}</span></div>`
            : `<div class="pp-id-line3 pp-id-line3--fa">Free Agent</div>`}
        </div>
        <div class="pp-ovr-badge ${ovrClass(ovr)}">
          <span class="pp-ovr-val">${ovr}</span>
          <span class="pp-ovr-lbl">OVR</span>
        </div>
      </header>`;

    const conditionPct = Math.max(0, Math.min(100, Math.round(player.condition)));
    const conditionClass =
      conditionPct >= 80 ? 'pp-pip--ok' :
      conditionPct >= 50 ? 'pp-pip--tight' :
                           'pp-pip--low';
    const morale = player.morale ?? 65;
    const moraleLabel = morale >= 80 ? 'Happy' : morale >= 55 ? 'OK' : morale >= 35 ? 'Unsettled' : 'Unhappy';
    const moraleClass = morale >= 80 ? 'pp-pip--ok' : morale >= 55 ? '' : morale >= 35 ? 'pp-pip--tight' : 'pp-pip--low';

    const recent = player.recentRatings ?? [];
    const formAvg = recent.length >= 3 ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
    const formLabel = formAvg === null ? '—'
      : formAvg >= 7.5 ? 'Hot' : formAvg >= 6.5 ? 'Good' : formAvg >= 5.5 ? 'OK' : 'Poor';
    const formClass = formAvg === null ? '' : formAvg >= 7.5 ? 'pp-pip--ok' : formAvg < 5.5 ? 'pp-pip--low' : '';

    const injuryPip = player.injury
      ? `<div class="pp-pip pp-pip--injury" title="${fmtInjuryKind(player.injury.kind)} — ${player.injury.weeksRemaining}w remaining">
           <span class="pp-pip-label">Injury</span>
           <span class="pp-pip-val">${fmtInjuryKind(player.injury.kind)} · ${player.injury.weeksRemaining}w</span>
         </div>`
      : '';

    const identitySection = `
      <section class="pp-identity">
        <div class="pp-pip">
          <span class="pp-pip-label">Contract</span>
          <span class="pp-pip-val">${fmtExpiry(player.contract.expiresOn)}</span>
        </div>
        <div class="pp-pip">
          <span class="pp-pip-label">Wage</span>
          <span class="pp-pip-val">${fmtWage(player.contract.annualWage)} / yr</span>
        </div>
        <div class="pp-pip ${conditionClass}">
          <span class="pp-pip-label">Condition</span>
          <span class="pp-pip-val">${conditionPct}%</span>
        </div>
        <div class="pp-pip">
          <span class="pp-pip-label">Reputation</span>
          <span class="pp-pip-val">${Math.round(player.reputation)}</span>
        </div>
        <div class="pp-pip ${moraleClass}">
          <span class="pp-pip-label">Morale</span>
          <span class="pp-pip-val">${moraleLabel}</span>
        </div>
        <div class="pp-pip ${formClass}">
          <span class="pp-pip-label">Form</span>
          <span class="pp-pip-val">${formLabel}</span>
        </div>
        ${player.internationalCaps ? `
        <div class="pp-pip">
          <span class="pp-pip-label">Int'l Caps</span>
          <span class="pp-pip-val">${player.internationalCaps}</span>
        </div>` : ''}
        ${injuryPip}
      </section>`;

    const scoutSection = isOwnSquad ? '' : scoutingSection(state, player.rosterId);

    const attrsSection = `
      <section class="pp-section">
        <h3 class="pp-section-title">Attributes${scoutAccuracy !== null && scoutAccuracy < 100 ? ' <span class="pp-attrs-scouted-label">(scouted)</span>' : ''}</h3>
        <div class="pp-attr-block">
          <div class="pp-radar-wrap">${radarSvg(player, scoutAccuracy)}</div>
          <div class="pp-attr-cols">${attributeBars(player, scoutAccuracy)}</div>
        </div>
      </section>`;

    // Career history rows — past seasons first, current season as
    // "(in progress)" if the player has any apps this season. Stable
    // chronological order (oldest first) so a reader scrolls from
    // earliest career year down to the current one.
    const historyRows: string[] = [];
    for (const arch of state.career.archive) {
      const entry: ArchivedPlayerSeason | undefined = arch.playerSeasonHistory?.[player.rosterId];
      const clubAtTimeId = entry?.clubId;
      const clubAtTime = clubAtTimeId ? teamsById.get(clubAtTimeId) : null;
      const apps = entry?.apps ?? 0;
      const avg = entry && entry.apps > 0 ? entry.ratingSum / entry.apps : null;
      historyRows.push(`
        <div class="pp-hist-row">
          <span class="pp-hist-season">${arch.seasonLabel.replace(/ Season$/, '')}</span>
          <span class="pp-hist-club">${clubAtTime ? clubCrest(clubAtTime, 'sm') + `<span class="pp-hist-club-name">${clubAtTime.shortName}</span>` : '<span class="pp-hist-club-name">—</span>'}</span>
          <span class="pp-hist-num">${apps || '—'}</span>
          <span class="pp-hist-num">${entry?.tries ?? '—'}</span>
          <span class="pp-hist-rating ${avg !== null ? ratingClass(avg) : ''}">${avg !== null ? avg.toFixed(2) : '—'}</span>
        </div>`);
    }
    if (cur.appearances > 0) {
      historyRows.push(`
        <div class="pp-hist-row pp-hist-row--current">
          <span class="pp-hist-season">${state.calendar.seasonLabel.replace(/ Season$/, '')}<span class="pp-hist-current-tag">In progress</span></span>
          <span class="pp-hist-club">${team ? clubCrest(team, 'sm') + `<span class="pp-hist-club-name">${team.shortName}</span>` : '<span class="pp-hist-club-name">—</span>'}</span>
          <span class="pp-hist-num">${cur.appearances}</span>
          <span class="pp-hist-num">${cur.tries}</span>
          <span class="pp-hist-rating ${curAvg !== null ? ratingClass(curAvg) : ''}">${curAvg !== null ? curAvg.toFixed(2) : '—'}</span>
        </div>`);
    }

    const historySection = historyRows.length > 0
      ? `
        <section class="pp-section">
          <h3 class="pp-section-title">Career History</h3>
          <div class="pp-hist-table">
            <div class="pp-hist-head">
              <span class="pp-hist-season">Season</span>
              <span class="pp-hist-club">Club</span>
              <span class="pp-hist-num">Apps</span>
              <span class="pp-hist-num">Tries</span>
              <span class="pp-hist-rating">Avg</span>
            </div>
            ${historyRows.join('')}
          </div>
        </section>`
      : `
        <section class="pp-section">
          <h3 class="pp-section-title">Career History</h3>
          <div class="pp-hist-empty">No appearances yet — history will appear after the first match.</div>
        </section>`;

    // Current season counters — only render the block if there's at
    // least one appearance. Pre-season the panel just clutters the
    // profile with em-dashes.
    const currentSeasonSection = cur.appearances > 0
      ? `
        <section class="pp-section">
          <h3 class="pp-section-title">This Season</h3>
          <div class="pp-stats-grid">
            ${seasonStat('Apps',         String(cur.appearances))}
            ${seasonStat('Avg Rating',   curAvg !== null ? curAvg.toFixed(2) : '—', curAvg !== null ? ratingClass(curAvg) : '')}
            ${seasonStat('Tries',        String(cur.tries))}
            ${seasonStat('Carries',      String(cur.carries))}
            ${seasonStat('Metres',       String(cur.metresCarried))}
            ${seasonStat('Line Breaks',  String(cur.lineBreaks))}
            ${seasonStat('Tackles',      String(cur.tackles))}
            ${seasonStat('Turnovers',    String(cur.turnoversWon))}
            ${seasonStat('Kick Metres',  String(cur.kickMetres))}
            ${cur.kicksAtGoal > 0
              ? seasonStat('Goal Kicks', `${cur.kicksMade}/${cur.kicksAtGoal}`)
              : ''}
            ${cur.yellowCards > 0 ? seasonStat('Yellow Cards', String(cur.yellowCards)) : ''}
            ${cur.redCards    > 0 ? seasonStat('Red Cards',    String(cur.redCards))    : ''}
          </div>
        </section>`
      : '';

    el.innerHTML = `
      <button id="pp-back" class="app-back-floating" aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        <span>Back</span>
      </button>
      <div class="pp-inner">
        ${headerSection}
        ${identitySection}
        ${scoutSection}
        ${attrsSection}
        ${currentSeasonSection}
        ${historySection}
      </div>`;

    el.querySelector<HTMLButtonElement>('#pp-back')!.addEventListener('click', () => activeOnBack?.());

    const engine = getGameEngine();
    el.querySelectorAll<HTMLButtonElement>('.pp-scout-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'assign' && btn.dataset.scout) {
          engine.assignScout(player.rosterId, btn.dataset.scout);
        } else if (action === 'unassign') {
          engine.unassignScout(player.rosterId);
        }
        render();
      });
    });
  }

  renderImpl = render;

  // Live refresh while the screen is open. Stats update mid-season as
  // fixtures resolve; injury weeks decrement on the week tick. Rollover
  // re-entry goes through showPlayerProfile() so the archive history
  // refresh doesn't need its own subscription.
  eventBus.on('game:fixtureRecorded', () => renderImpl?.());
  eventBus.on('game:weekAdvanced',    () => renderImpl?.());
  eventBus.on('game:initialized',     () => renderImpl?.());
}

function seasonStat(label: string, value: string, valClass = ''): string {
  return `
    <div class="pp-stat">
      <span class="pp-stat-label">${label}</span>
      <span class="pp-stat-val ${valClass}">${value}</span>
    </div>`;
}
