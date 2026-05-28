// Training-week selector. Post-match flow lands here between LeagueTable
// and Hub: the manager picks intensity + forwards focus + backs focus, and
// Continue applies one week of training league-wide via
// `GameCoordinator.applyTrainingWeek`. The Hub Training tile re-enters the
// same screen in `mid-week` mode (no Continue CTA — Back saves the plan
// for the next post-match round and returns to Hub).
//
// Dual-mode setter pattern mirrors RoundResultsScreen / LeagueTableScreen:
//   - showTrainingPostMatch(onContinue) — forward navigation; Continue
//     applies training right now, saves, and routes to Hub.
//   - showTrainingMidweek(onBack) — back-arrow mode; Back persists the
//     plan (without applying) and routes to Hub.
//
// One-shot init from main.ts. Re-renders on `game:trainingApplied` and
// `game:weekAdvanced` so condition pills reflect live state.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type {
  BacksFocus, ForwardsFocus, TrainingIntensity, TrainingPlan,
} from '../types/training';
import { DEFAULT_TRAINING_PLAN } from '../types/training';
import { isForward } from '../types/player';
import { eventBus } from '../utils/eventBus';

type Mode =
  | { kind: 'post_match'; onContinue: () => void }
  | { kind: 'mid_week';   onBack:     () => void };

let activeMode: Mode | null = null;
let draftPlan: TrainingPlan = { ...DEFAULT_TRAINING_PLAN };
let renderImpl: (() => void) | null = null;

export function showTrainingPostMatch(onContinue: () => void): void {
  activeMode = { kind: 'post_match', onContinue };
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
    if (playerTeam) el!.style.setProperty('--team-color', playerTeam.color);
    const mode = activeMode;
    if (!mode) return;
    // Hydrate the working draft from persisted state at first render
    // after a mode change so the screen renders with the last-saved
    // plan selected. (Don't reset draft on every render — that would
    // wipe an in-progress edit when a game:* event fires.)
    if (!draftHydrated) {
      draftPlan = { ...(state.player.training ?? DEFAULT_TRAINING_PLAN) };
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

    const continueButton = mode.kind === 'post_match'
      ? `<button id="tr-continue" class="cta-pulse">
           <span>Apply Training</span>
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
         </button>`
      : `<button id="tr-back" class="cta-pulse">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 5l-7 7 7 7"/></svg>
           <span>Save &amp; back to Hub</span>
         </button>`;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Training Week</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week}</div>
      </div>

      <div id="tr-condition">
        <div class="tr-cond-row">
          <span class="tr-cond-label">Squad freshness</span>
          <span class="tr-cond-val tr-cond-val--${avgCondition < 60 ? 'low' : avgCondition < 80 ? 'mid' : 'high'}">${avgCondition}%</span>
        </div>
        ${lowCondition.length > 0
          ? `<div class="tr-cond-low">Tired: ${lowCondition.join(' · ')}</div>`
          : `<div class="tr-cond-low">No tired players.</div>`}
      </div>

      <section class="tr-section">
        <h2 class="tr-section-title">Intensity</h2>
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

      <div id="tr-footer">${continueButton}</div>
    `;

    // Chip click → update draft → re-render selection state without
    // a full re-render (cheap toggle).
    el!.querySelectorAll<HTMLButtonElement>('.tr-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.dataset.group;
        const value = btn.dataset.value;
        if (!group || !value) return;
        if (group === 'intensity') draftPlan.intensity = value as TrainingIntensity;
        if (group === 'fwd')       draftPlan.forwardsFocus = value as ForwardsFocus;
        if (group === 'bck')       draftPlan.backsFocus = value as BacksFocus;
        render();
      });
    });

    if (mode.kind === 'post_match') {
      el!.querySelector<HTMLButtonElement>('#tr-continue')!.addEventListener('click', () => {
        // applyTrainingWeek emits game:trainingApplied which will fire
        // re-render here while still on screen, but we navigate away
        // immediately so it's effectively a no-op.
        engine.applyTrainingWeek({ ...draftPlan });
        draftHydrated = false; // next entry re-reads from state
        mode.onContinue();
      });
    } else {
      el!.querySelector<HTMLButtonElement>('#tr-back')!.addEventListener('click', () => {
        // Persist the choice for next week's default without executing.
        // setPlayerTrainingPlan flows through applySeasonEvent (the
        // PLAYER_TRAINING_PLAN_SET branch); no condition / stat mutation.
        engine.setPlayerTrainingPlan({ ...draftPlan });
        draftHydrated = false;
        mode.onBack();
      });
    }
  }

  renderImpl = render;
  eventBus.on('game:trainingApplied', () => render());
  eventBus.on('game:weekAdvanced',    () => render());
}

let draftHydrated = false;

function intensityChip(opt: IntensityCopy, selected: TrainingIntensity): string {
  const active = opt.value === selected;
  return `
    <button type="button" class="tr-chip${active ? ' tr-chip--active' : ''}" data-group="intensity" data-value="${opt.value}" aria-pressed="${active}">
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
