// Training selector. Two modes:
//   - showTrainingPostMatch(onContinue) — post-match flow between LeagueTable
//     and Hub. Renders a *block*: one card per training week of the gap until
//     the player's next match (1 for a normal turnaround, more across the
//     Autumn Nations / Six Nations breaks). Each week has its own intensity;
//     forwards/backs focus is shared across the block. Continue applies the
//     block via GameCoordinator.applyTrainingBlock and returns the results.
//   - showTrainingMidweek(onBack) — Hub-tile entry. Single default-plan
//     editor; Back persists the plan (no training executed) and returns.
//
// Condition recovers per rest day, so the screen shows the day-span of each
// week and a projected post-block squad freshness. A short turnaround (≤6
// days) defaults to a lighter session with an advisory banner; a multi-week
// break flags the development window.
//
// One-shot init from main.ts. Re-renders on `game:trainingApplied` and
// `game:weekAdvanced` so condition pills reflect live state.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type {
  BacksFocus, ForwardsFocus, TrainingIntensity, TrainingPlan, TrainingWeekResult,
} from '../types/training';
import { DEFAULT_TRAINING_PLAN } from '../types/training';
import { isForward } from '../types/player';
import { INTENSITY_EFFECTS } from '../engine/balance';
import { upcomingGap, splitGapIntoPeriods } from '../game/trainingCalendar';
import { suggestPlanForUser } from '../game/aiTrainingDirector';
import { eventBus } from '../utils/eventBus';
import { injectTeamColors } from './teamColors';
import { discardConfirm } from './components/discardConfirm';

const SHORT_WEEK_DAYS = 6; // turnaround at or below this nudges toward Light

// `runBlock`, when supplied (an international break), runs the cup + training
// block via GameCoordinator.runInternationalBreakBlock instead of the plain
// applyTrainingBlock. It's async (the cup fixtures simulate headless), so the
// Continue handler awaits it.
interface PostMatchOpts {
  playoffLabel?: string;
  runBlock?: (weeks: TrainingPlan[]) => Promise<TrainingWeekResult>;
}

type Mode =
  | { kind: 'post_match'; onContinue: (results: TrainingWeekResult) => void; playoffLabel?: string; runBlock?: (weeks: TrainingPlan[]) => Promise<TrainingWeekResult> }
  | { kind: 'mid_week';   onBack:     () => void };

let activeMode: Mode | null = null;
let draftPlan: TrainingPlan = { ...DEFAULT_TRAINING_PLAN };  // shared focus + mid-week plan
let draftWeekIntensities: TrainingIntensity[] = [];          // post-match per-week intensity
let draftHydrated = false;
let renderImpl: (() => void) | null = null;

export function showTrainingPostMatch(onContinue: (results: TrainingWeekResult) => void, opts?: PostMatchOpts): void {
  activeMode = { kind: 'post_match', onContinue, playoffLabel: opts?.playoffLabel, runBlock: opts?.runBlock };
  renderImpl?.();
}

export function showTrainingMidweek(onBack: () => void): void {
  activeMode = { kind: 'mid_week', onBack };
  renderImpl?.();
}

interface IntensityCopy {
  value: TrainingIntensity;
  label: string;
  blurb: string;
}
const INTENSITIES: IntensityCopy[] = [
  { value: 'rest',   label: 'Rest',   blurb: 'Full recovery. No development, no risk.' },
  { value: 'light',  label: 'Light',  blurb: 'Solid recovery, modest development.' },
  { value: 'medium', label: 'Medium', blurb: 'Balanced. Slow drain, real growth.' },
  { value: 'high',   label: 'High',   blurb: 'Heavy load. Best gains, real injury risk.' },
];

interface FocusCopy<F> {
  value: F;
  label: string;
  blurb: string;
}
const FORWARDS_FOCUSES: FocusCopy<ForwardsFocus>[] = [
  { value: 'set_piece', label: 'Set Piece', blurb: 'Scrum, lineout, maul drills.' },
  { value: 'strength',  label: 'Strength',  blurb: 'Contact area + carrying power.' },
  { value: 'stamina',   label: 'Stamina',   blurb: 'Conditioning + ball-in-hand work.' },
  { value: 'handling',  label: 'Handling',  blurb: 'Passing chains, offload patterns.' },
];
const BACKS_FOCUSES: FocusCopy<BacksFocus>[] = [
  { value: 'tackling',                label: 'Tackling',     blurb: 'Line speed + dominant hits.' },
  { value: 'defensive_organisation',  label: 'Defence',      blurb: 'Positioning + decision-making.' },
  { value: 'attacking_skills',        label: 'Attack',       blurb: 'Footwork + pace work.' },
  { value: 'kicking',                 label: 'Kicking',      blurb: 'Tactical + restarts.' },
];

export function initTrainingScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('training');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const engine = getGameEngine();
    const state = engine.getState();
    const playerTeam = teamsById.get(state.player.teamId);
    if (playerTeam) injectTeamColors(el!, playerTeam);
    const mode = activeMode;
    if (!mode) return;

    const gap = upcomingGap(state);
    const spans = splitGapIntoPeriods(gap.days, gap.weeks);

    // Hydrate working drafts from persisted state at first render after a
    // mode change. (Don't reset on every render — that would wipe an
    // in-progress edit when a game:* event fires.)
    if (!draftHydrated) {
      draftPlan = { ...(state.player.training ?? DEFAULT_TRAINING_PLAN) };
      // Advisory nudge: a short single-week turnaround defaults to Light;
      // every other week starts on the manager's standing intensity.
      draftWeekIntensities = spans.map((_, i) => {
        if (gap.weeks === 1 && gap.days <= SHORT_WEEK_DAYS) return 'light';
        return draftPlan.intensity;
      });
      draftHydrated = true;
    }

    const playerClubId = state.player.teamId;
    const club = state.career.clubs.find(c => c.id === playerClubId);
    const squad = club?.squad ?? [];
    const fitSquad = squad.map(rid => state.career.roster[rid]).filter(p => p && !p.injury);
    const avgCondition = fitSquad.length === 0
      ? 100
      : Math.round(fitSquad.reduce((acc, p) => acc + p.condition, 0) / fitSquad.length);
    const lowCondition = fitSquad
      .filter(p => p.condition < 50)
      .sort((a, b) => a.condition - b.condition)
      .slice(0, 3)
      .map(p => `${p.lastName} ${p.condition.toFixed(0)}%`);
    const fwdCount = fitSquad.filter(p => isForward(p.position)).length;
    const bckCount = fitSquad.length - fwdCount;

    if (mode.kind === 'post_match') {
      renderPostMatch(el!, state, mode, gap, spans, fitSquad, avgCondition, lowCondition, fwdCount, bckCount, engine);
    } else {
      renderMidWeek(el!, state, mode, avgCondition, lowCondition, fwdCount, bckCount, engine);
    }
  }

  renderImpl = render;
  eventBus.on('game:trainingApplied', () => render());
  eventBus.on('game:weekAdvanced',    () => render());
}

function renderPostMatch(
  el: HTMLElement,
  state: ReturnType<GameCoordinator['getState']>,
  mode: Extract<Mode, { kind: 'post_match' }>,
  gap: { weeks: number; days: number },
  spans: number[],
  fitSquad: { condition: number }[],
  avgCondition: number,
  lowCondition: string[],
  fwdCount: number,
  bckCount: number,
  engine: GameCoordinator,
): void {
  const projected = projectFreshness(fitSquad, draftWeekIntensities, spans);

  const banner = gap.weeks === 1 && gap.days <= SHORT_WEEK_DAYS
    ? `<div class="tr-banner tr-banner--warn">Short week — ${gap.days} days until the next match. A lighter session recovers more freshness.</div>`
    : gap.weeks >= 2
      ? `<div class="tr-banner">Set your training plan for the ${gap.weeks}-week block (${gap.days} days).</div>`
      : '';

  const weekCards = spans.map((days, i) => `
    <section class="tr-week-card">
      <div class="tr-week-head">
        <span class="tr-week-title">${gap.weeks === 1 ? 'This week' : `Week ${i + 1}`}</span>
        <span class="tr-week-days">${days} day${days === 1 ? '' : 's'}</span>
      </div>
      <div class="tr-chip-row">
        ${INTENSITIES.map(opt => intensityChip(opt, draftWeekIntensities[i], i)).join('')}
      </div>
    </section>`).join('');

  const eyebrow = mode.playoffLabel
    ? `${state.calendar.seasonLabel} · ${mode.playoffLabel}`
    : `${state.calendar.seasonLabel} · WK ${state.calendar.week}`;

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <div class="app-topbar-spacer"></div>
        <span class="app-title">${gap.weeks > 1 ? 'Training Block' : 'Training Week'}</span>
        <div class="app-topbar-spacer"></div>
      </div>
      <div class="app-eyebrow">${eyebrow}</div>
    </div>

    <div id="tr-body">
      <div id="tr-condition">
        <div class="tr-cond-row">
          <span class="tr-cond-label">Squad freshness</span>
          <span class="tr-cond-val tr-cond-val--${freshnessClass(avgCondition)}">${avgCondition}% <span class="tr-cond-proj">→ ${projected}%</span></span>
        </div>
        ${lowCondition.length > 0
          ? `<div class="tr-cond-low">Tired: ${lowCondition.join(' · ')}</div>`
          : `<div class="tr-cond-low">No tired players.</div>`}
      </div>

      ${suggestionBanner(state)}
      ${banner}

      <div class="tr-weeks">${weekCards}</div>

      <section class="tr-section">
        <h2 class="tr-section-title">Forwards focus · ${fwdCount} players</h2>
        <div class="tr-chip-row" id="tr-fwd-row">
          ${FORWARDS_FOCUSES.map(f => focusChip('fwd', f, draftPlan.forwardsFocus)).join('')}
        </div>
      </section>

      <section class="tr-section">
        <h2 class="tr-section-title">Backs focus · ${bckCount} players</h2>
        <div class="tr-chip-row" id="tr-bck-row">
          ${BACKS_FOCUSES.map(f => focusChip('bck', f, draftPlan.backsFocus)).join('')}
        </div>
      </section>
    </div>

    <div id="tr-footer">
      <button id="tr-continue" class="cta-pulse">
        <span class="tr-continue-label">Apply Training</span>
        <svg class="tr-continue-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        <span class="tr-continue-spinner" aria-hidden="true"></span>
      </button>
    </div>
  `;

  wireChips(el, () => renderImpl?.());

  el.querySelector<HTMLButtonElement>('#tr-continue')!.addEventListener('click', (e) => {
    const weeks: TrainingPlan[] = draftWeekIntensities.map(intensity => ({
      intensity,
      forwardsFocus: draftPlan.forwardsFocus,
      backsFocus: draftPlan.backsFocus,
    }));
    if (mode.runBlock) {
      // International break: the cup fixtures simulate headless, so the block
      // is async. Show a loading state and yield one macrotask (setTimeout 0)
      // so the browser repaints the spinner before the sim chain starts.
      const btn = e.currentTarget as HTMLButtonElement;
      const runBlock = mode.runBlock;
      btn.disabled = true;
      btn.classList.add('tr-continue--simulating');
      btn.querySelector<HTMLSpanElement>('.tr-continue-label')!.textContent = 'Simulating cup…';
      setTimeout(() => {
        void runBlock(weeks).then(results => {
          draftHydrated = false;
          mode.onContinue(results);
        }).catch((err: unknown) => {
          // A cup/training block failure (e.g. an invariant trip — not an
          // engine:error, which the crash overlay would already surface)
          // mustn't leave the Continue button stuck. Re-enable + log.
          console.error('International break block failed:', err);
          btn.disabled = false;
          btn.classList.remove('tr-continue--simulating');
          btn.querySelector<HTMLSpanElement>('.tr-continue-label')!.textContent = 'Apply Training';
        });
      }, 0);
      return;
    }
    const results = engine.applyTrainingBlock(weeks);
    draftHydrated = false; // next entry re-reads from state
    mode.onContinue(results);
  });
}

function renderMidWeek(
  el: HTMLElement,
  state: ReturnType<GameCoordinator['getState']>,
  mode: Extract<Mode, { kind: 'mid_week' }>,
  avgCondition: number,
  lowCondition: string[],
  fwdCount: number,
  bckCount: number,
  engine: GameCoordinator,
): void {
  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="tr-back" class="app-back" aria-label="Back to hub">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Hub</span>
        </button>
        <span class="app-title">Training Plan</span>
        <div class="app-topbar-spacer"></div>
      </div>
      <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week}</div>
    </div>

    <div id="tr-body">
      <div id="tr-condition">
        <div class="tr-cond-row">
          <span class="tr-cond-label">Squad freshness</span>
          <span class="tr-cond-val tr-cond-val--${freshnessClass(avgCondition)}">${avgCondition}%</span>
        </div>
        ${lowCondition.length > 0
          ? `<div class="tr-cond-low">Tired: ${lowCondition.join(' · ')}</div>`
          : `<div class="tr-cond-low">No tired players.</div>`}
      </div>

      ${suggestionBanner(state)}

      <section class="tr-section">
        <h2 class="tr-section-title">Default intensity</h2>
        <div class="tr-chip-row" id="tr-intensity-row">
          ${INTENSITIES.map(i => intensityChip(i, draftPlan.intensity)).join('')}
        </div>
      </section>

      <section class="tr-section">
        <h2 class="tr-section-title">Forwards focus · ${fwdCount} players</h2>
        <div class="tr-chip-row" id="tr-fwd-row">
          ${FORWARDS_FOCUSES.map(f => focusChip('fwd', f, draftPlan.forwardsFocus)).join('')}
        </div>
      </section>

      <section class="tr-section">
        <h2 class="tr-section-title">Backs focus · ${bckCount} players</h2>
        <div class="tr-chip-row" id="tr-bck-row">
          ${BACKS_FOCUSES.map(f => focusChip('bck', f, draftPlan.backsFocus)).join('')}
        </div>
      </section>
    </div>

    <div id="tr-footer">
      <button id="tr-save" class="cta-pulse">Save</button>
    </div>
  `;

  wireChips(el, () => renderImpl?.());

  el.querySelector<HTMLButtonElement>('#tr-back')!.addEventListener('click', async () => {
    const saved = engine.getState().player.training ?? DEFAULT_TRAINING_PLAN;
    const dirty = draftHydrated && (
      draftPlan.intensity !== saved.intensity ||
      draftPlan.forwardsFocus !== saved.forwardsFocus ||
      draftPlan.backsFocus !== saved.backsFocus
    );
    if (dirty) {
      const discard = await discardConfirm('You have unsaved training plan changes. Leaving now will revert them.');
      if (!discard) return;  // keep editing
      draftHydrated = false;
    }
    mode.onBack();
  });

  el.querySelector<HTMLButtonElement>('#tr-save')!.addEventListener('click', () => {
    engine.setPlayerTrainingPlan({ ...draftPlan });
    draftHydrated = false;
    mode.onBack();
  });
}

function wireChips(el: HTMLElement, rerender: () => void): void {
  el.querySelectorAll<HTMLButtonElement>('.tr-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;
      const value = btn.dataset.value;
      if (!group || !value) return;
      if (group === 'intensity') {
        const wk = btn.dataset.week;
        if (wk !== undefined) draftWeekIntensities[Number(wk)] = value as TrainingIntensity;
        else draftPlan.intensity = value as TrainingIntensity;
      }
      if (group === 'fwd') draftPlan.forwardsFocus = value as ForwardsFocus;
      if (group === 'bck') draftPlan.backsFocus = value as BacksFocus;
      rerender();
    });
  });
}

// Project squad-average freshness after the block, given the chosen per-week
// intensities. Condition recovers conditionPerDay × dayspan each period,
// clamped at 100.
function projectFreshness(
  fitSquad: { condition: number }[],
  intensities: TrainingIntensity[],
  spans: number[],
): number {
  if (fitSquad.length === 0) return 100;
  let total = 0;
  for (const p of fitSquad) {
    let c = p.condition;
    for (let i = 0; i < intensities.length; i++) {
      c = Math.min(100, c + INTENSITY_EFFECTS[intensities[i]].conditionPerDay * spans[i]);
    }
    total += c;
  }
  return Math.round(total / fitSquad.length);
}

function freshnessClass(v: number): 'low' | 'mid' | 'high' {
  return v < 60 ? 'low' : v < 80 ? 'mid' : 'high';
}

function suggestionBanner(state: Parameters<typeof suggestPlanForUser>[0]): string {
  const plan = suggestPlanForUser(state);
  if (!plan) return '';
  const iLabel = INTENSITIES.find(i => i.value === plan.intensity)?.label ?? plan.intensity;
  const fwdLabel = FORWARDS_FOCUSES.find(f => f.value === plan.forwardsFocus)?.label ?? plan.forwardsFocus;
  const bckLabel = BACKS_FOCUSES.find(b => b.value === plan.backsFocus)?.label ?? plan.backsFocus;
  return `<div class="tr-banner tr-banner--suggest">Coach suggests: <strong>${iLabel}</strong> · Fwds: ${fwdLabel} · Bks: ${bckLabel}</div>`;
}

function intensityChip(opt: IntensityCopy, selected: TrainingIntensity, week?: number): string {
  const active = opt.value === selected;
  const weekAttr = week === undefined ? '' : ` data-week="${week}"`;
  return `
    <button type="button" class="tr-chip${active ? ' tr-chip--active' : ''}" data-group="intensity" data-value="${opt.value}"${weekAttr} aria-pressed="${active}">
      <span class="tr-chip-label">${opt.label}</span>
      <span class="tr-chip-blurb">${opt.blurb}</span>
    </button>`;
}

function focusChip<F extends string>(group: 'fwd' | 'bck', opt: FocusCopy<F>, selected: F): string {
  const active = opt.value === selected;
  return `
    <button type="button" class="tr-chip${active ? ' tr-chip--active' : ''}" data-group="${group}" data-value="${opt.value}" aria-pressed="${active}">
      <span class="tr-chip-label">${opt.label}</span>
      <span class="tr-chip-blurb">${opt.blurb}</span>
    </button>`;
}
