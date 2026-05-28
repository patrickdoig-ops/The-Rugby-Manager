// Post-training recap. Reached from TrainingScreen's Continue handler in
// the post-match chain (between TrainingScreen and Hub). Shows per-player
// attribute gains, new training injuries, and a condition summary for the
// user's club only. One-shot init from main.ts; showPostTrainingResults
// sets results + onContinue then renders.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { PlayerTrainingResult, TrainingWeekResult } from '../types/training';
import type { PlayerStats } from '../types/player';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';

let activeResults: TrainingWeekResult | null = null;
let activeOnContinue: (() => void) | null = null;
let renderImpl: (() => void) | null = null;

export function showPostTrainingResults(
  results: TrainingWeekResult,
  onContinue: () => void,
): void {
  activeResults = results;
  activeOnContinue = onContinue;
  renderImpl?.();
}

function statLabel(s: keyof PlayerStats): string {
  if (s === 'setPiece') return 'Set Piece';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function focusLabel(s: string): string {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function injuryLabel(kind: string): string {
  return kind.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function heroSubCopy(totalStatGains: number, injuryCount: number, isBlock: boolean): string {
  if (totalStatGains > 0 && injuryCount === 0) return isBlock ? 'A productive training block.' : 'A productive week on the training ground.';
  if (totalStatGains > 0 && injuryCount > 0) return 'Strong gains — but watch the injury list.';
  if (totalStatGains === 0 && injuryCount > 0) return 'Tough week — the squad took some knocks.';
  return 'The squad freshened up — no attribute gains this week.';
}

function runAnimation(el: HTMLElement): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.body.classList.remove('trx-go');

  // hero count-up
  const numEl = el.querySelector<HTMLElement>('.trx-num em');
  const target = numEl ? (parseInt(numEl.textContent ?? '0', 10) || 0) : 0;

  if (reduce || !numEl) {
    if (numEl) numEl.textContent = String(target);
  } else {
    const dur = 850;
    const t0 = performance.now();
    numEl.textContent = '0';
    (function tick(now: number) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      numEl.textContent = String(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(tick);
      else numEl.textContent = String(target);
    })(performance.now());
  }

  // condition bars: animate from the "before" width to the final value
  const fills = el.querySelectorAll<HTMLElement>('.trx-cond-fill[data-to]');
  fills.forEach((barEl, i) => {
    const to = barEl.getAttribute('data-to') + '%';
    if (reduce) { barEl.style.width = to; return; }
    barEl.style.setProperty('--bar-delay', (260 + i * 140) + 'ms');
    requestAnimationFrame(() => requestAnimationFrame(() => { barEl.style.width = to; }));
  });

  // squad-conditioning aggregate bar
  const agg = el.querySelector<HTMLElement>('.trx-recovery-fill[data-to]');
  if (agg) {
    const to = agg.getAttribute('data-to') + '%';
    if (reduce) { agg.style.width = to; }
    else requestAnimationFrame(() => requestAnimationFrame(() => { agg.style.width = to; }));
  }

  // trigger chip-pop + hero-glow keyframes
  document.body.classList.add('trx-go');
}

export function initPostTrainingResultsScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onPlayerClick: (rosterId: number) => void,
): void {
  const el = document.getElementById('training-results');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const results = activeResults;
    const onContinue = activeOnContinue;
    if (!results || !onContinue) return;

    const engine = getGameEngine();
    const state = engine.getState();
    const teamJson = teamsById.get(state.player.teamId);
    if (teamJson) el!.style.setProperty('--team-color', teamJson.color);
    const userClub = state.career.clubs.find(c => c.id === state.player.teamId);
    if (!userClub) return;

    const userSquadSet = new Set(userClub.squad);
    const trainedIds = new Set(results.players.map(p => p.rosterId));
    const userTrained = results.players.filter(p => userSquadSet.has(p.rosterId));

    // Partition
    const withGains     = userTrained.filter(p => Object.keys(p.statDeltas).length > 0);
    const withInjNoGain = userTrained.filter(
      p => p.newlyInjured && Object.keys(p.statDeltas).length === 0,
    );
    const condOnly = userTrained.filter(
      p => Object.keys(p.statDeltas).length === 0 && !p.newlyInjured,
    );
    const satOutCount = userClub.squad.filter(rid => !trainedIds.has(rid)).length;

    // Split gains: standout = 2+ stat deltas; single = exactly 1
    const standout   = withGains
      .filter(p => Object.keys(p.statDeltas).length >= 2)
      .sort((a, b) => {
        const sumA = Object.values(a.statDeltas).reduce((s, v) => s + (v ?? 0), 0);
        const sumB = Object.values(b.statDeltas).reduce((s, v) => s + (v ?? 0), 0);
        return sumB - sumA;
      });
    const singleGain = withGains.filter(p => Object.keys(p.statDeltas).length === 1);

    const totalStatGains = withGains.reduce((s, p) => s + Object.keys(p.statDeltas).length, 0);
    const injuryCount    = userTrained.filter(p => p.newlyInjured).length;
    const isBlock        = results.weeks > 1;

    const avgBefore = condOnly.length > 0
      ? Math.round(condOnly.reduce((s, p) => s + p.conditionBefore, 0) / condOnly.length) : 0;
    const avgAfter  = condOnly.length > 0
      ? Math.round(condOnly.reduce((s, p) => s + p.conditionAfter,  0) / condOnly.length) : 0;

    // Eyebrow
    const eyebrow = isBlock
      ? `Training Block · ${state.calendar.seasonLabel} · ${results.weeks}-Wk Block`
      : `Training Report · ${state.calendar.seasonLabel} · Wk ${state.calendar.week}`;

    // Hero number subline
    const numSubline = withGains.length > 0
      ? `across ${withGains.length} ${withGains.length === 1 ? 'player' : 'players'}`
      : '';

    function gainChips(r: PlayerTrainingResult, startDelay: number): string {
      const entries = Object.entries(r.statDeltas) as [keyof PlayerStats, number][];
      // hero chip = entry with highest delta value (first if tied)
      const sorted = [...entries].sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
      return sorted
        .map(([k, v], j) => {
          const isHero = j === 0;
          const cls = isHero ? 'trx-gain trx-gain--hero' : 'trx-gain';
          return `<span class="${cls}" style="--cd:${startDelay + j * 60}ms"><b>+${v}</b> ${statLabel(k)}</span>`;
        })
        .join('');
    }

    function condBar(r: PlayerTrainingResult, barIndex: number): string {
      const before = Math.round(r.conditionBefore);
      const after  = Math.round(r.conditionAfter);
      const delta  = after - before;
      const downCls = delta < 0 ? ' trx-cond-val--down' : '';
      const deltaStr = delta >= 0 ? `+${delta}` : String(delta);
      return `
        <div class="trx-cond">
          <span class="trx-cond-label">Cond.</span>
          <div class="trx-cond-track">
            <div class="trx-cond-fill" data-to="${after}" style="width:${before}%"></div>
            <div class="trx-cond-mark" style="left:${before}%"></div>
          </div>
          <span class="trx-cond-val${downCls}">${after}%<span class="trx-cond-delta">${deltaStr}</span></span>
        </div>`;
    }

    function standoutCard(r: PlayerTrainingResult, rank: number, cardDelay: number, chipStartDelay: number): string {
      const p = state.career.roster[r.rosterId];
      if (!p) return '';
      const topCls = rank === 1 ? ' trx-card--top' : '';
      return `
        <div class="trx-card${topCls}" style="--d:${cardDelay}ms">
          <div class="trx-card-head">
            <span class="trx-rank">${rank}</span>
            ${playerLinkHtml(`${p.firstName} ${p.lastName}`, r.rosterId)}
            <span class="trx-pos">${p.position}</span>
          </div>
          <div class="trx-gains">${gainChips(r, chipStartDelay)}</div>
          ${condBar(r, rank - 1)}
        </div>`;
    }

    function miniRow(r: PlayerTrainingResult, delay: number, chipDelay: number): string {
      const p = state.career.roster[r.rosterId];
      if (!p) return '';
      const [[k, v]] = Object.entries(r.statDeltas) as [keyof PlayerStats, number][];
      const before = Math.round(r.conditionBefore);
      const after  = Math.round(r.conditionAfter);
      const delta  = after - before;
      const deltaStr = delta >= 0 ? `+${delta}` : String(delta);
      return `
        <div class="trx-mini" style="--d:${delay}ms">
          ${playerLinkHtml(`${p.firstName} ${p.lastName}`, r.rosterId)}
          <span class="trx-pos">${p.position}</span>
          <span class="trx-gain" style="--cd:${chipDelay}ms"><b>+${v}</b> ${statLabel(k)}</span>
          <span class="trx-mini-cond">${after}% <b>${deltaStr}</b></span>
        </div>`;
    }

    function injuryCard(r: PlayerTrainingResult, delay: number): string {
      const p = state.career.roster[r.rosterId];
      if (!p || !p.injury) return '';
      const before = Math.round(r.conditionBefore);
      const after  = Math.round(r.conditionAfter);
      return `
        <div class="trx-injury" style="--d:${delay}ms">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008z"/></svg>
          ${playerLinkHtml(`${p.firstName} ${p.lastName}`, r.rosterId)}
          <span class="trx-pos">${p.position}</span>
          <span class="trx-injury-cond">${before}→${after}%</span>
          <span class="trx-injury-tag">${injuryLabel(p.injury.kind)} · ${p.injury.weeksRemaining}w</span>
        </div>`;
    }

    // Build plan chips
    const intensityLabel = results.plan.intensity.charAt(0).toUpperCase() + results.plan.intensity.slice(1);
    const intensityCls   = `trx-plan-chip trx-plan-chip--${results.plan.intensity}`;
    let planChips = `<span class="${intensityCls}">${isBlock ? `${results.weeks}-Week Block` : intensityLabel + ' intensity'}</span>`;
    planChips += `<span class="trx-plan-chip">Fwds · <b>${focusLabel(results.plan.forwardsFocus)}</b></span>`;
    planChips += `<span class="trx-plan-chip">Backs · <b>${focusLabel(results.plan.backsFocus)}</b></span>`;
    if (injuryCount > 0) planChips += `<span class="trx-plan-chip trx-plan-chip--injury">${injuryCount} ${injuryCount === 1 ? 'injury' : 'injuries'}</span>`;
    if (satOutCount > 0) planChips += `<span class="trx-plan-chip trx-plan-chip--sat">${satOutCount} sat out</span>`;

    // Stagger timings
    let standoutChipStart = 320;
    const standoutHtml = standout.map((r, i) => {
      const cardDelay  = 40 + i * 50;
      const chipStart  = standoutChipStart;
      const numChips   = Object.keys(r.statDeltas).length;
      standoutChipStart += numChips * 60 + 40;
      return standoutCard(r, i + 1, cardDelay, chipStart);
    }).join('');

    let miniChipStart = standoutChipStart;
    const miniHtml = singleGain.map((r, i) => {
      const row = miniRow(r, 130 + i * 25, miniChipStart);
      miniChipStart += 60;
      return row;
    }).join('');

    const injuryHtml = withInjNoGain.map((r, i) => injuryCard(r, 210 + i * 30)).join('');

    const recoveryHtml = condOnly.length > 0 ? `
      <div class="trx-recovery">
        <div class="trx-recovery-head">
          <span class="trx-recovery-label">Recovery training</span>
          <span class="trx-recovery-count">${condOnly.length} ${condOnly.length === 1 ? 'player' : 'players'}</span>
        </div>
        <div class="trx-recovery-note">No attribute gains — squad freshened up for the next round.</div>
        <div class="trx-recovery-bar">
          <div class="trx-recovery-track">
            <div class="trx-recovery-fill" data-to="${avgAfter}" style="width:${avgBefore}%"></div>
            <div class="trx-recovery-mark" style="left:${avgBefore}%"></div>
          </div>
          <span class="trx-recovery-val">${avgAfter}%<em>+${avgAfter - avgBefore}</em></span>
        </div>
      </div>` : '';

    const satoutHtml = satOutCount > 0 ? `
      <div class="trx-satout">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
        ${satOutCount} ${satOutCount === 1 ? 'player' : 'players'} sat out injured this week.
      </div>` : '';

    el!.innerHTML = `
      <div class="trx-hero">
        <div class="trx-hero-eyebrow">
          <span class="trx-dot"></span>${eyebrow}
        </div>
        <div class="trx-headline">
          <span class="trx-num"><em>${totalStatGains}</em></span>
          <span class="trx-headline-label">
            Attribute<br>${totalStatGains === 1 ? 'Gain' : 'Gains'}
            ${numSubline ? `<span>${numSubline}</span>` : ''}
          </span>
        </div>
        <div class="trx-hero-sub">${heroSubCopy(totalStatGains, injuryCount, isBlock)}</div>
        <div class="trx-plan">${planChips}</div>
      </div>

      <div class="trx-content">
        ${standout.length > 0 ? `
          <div class="trx-section-title">Standout gains</div>
          ${standoutHtml}` : ''}

        ${singleGain.length > 0 ? `
          <div class="trx-section-title">${standout.length > 0 ? 'Also improved' : 'Attribute gains'}</div>
          ${miniHtml}` : ''}

        ${withInjNoGain.length > 0 ? `
          <div class="trx-section-title trx-section-title--warn">Training injuries</div>
          ${injuryHtml}` : ''}

        ${condOnly.length > 0 ? `
          <div class="trx-section-title">Squad conditioning</div>
          ${recoveryHtml}` : ''}

        ${satoutHtml}
      </div>

      <div id="trx-footer">
        <button id="trx-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#trx-continue')!.addEventListener('click', () => {
      document.body.classList.remove('trx-go');
      onContinue();
    });

    wirePlayerLinks(el!, onPlayerClick);
    runAnimation(el!);
  }

  renderImpl = render;
}
