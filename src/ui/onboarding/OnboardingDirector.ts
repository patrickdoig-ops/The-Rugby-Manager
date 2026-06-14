// First-run onboarding orchestrator. Reactive, not a rigid rail: it subscribes
// to screenRouter screen-shows and renders the first not-yet-passed step whose
// `screen` matches the one that just appeared. Navigation stays in main.ts —
// the director only triggers the very first jump (Home → team select) via the
// `onStartTour` callback; every later step is reached by the player tapping the
// real, spotlighted UI.
//
// State is global (localStorage), not save-scoped: onboarding is a property of
// the device/player, and the two new-game entry points (Quick Start vs Career)
// produce separate saves — a save-scoped flag would re-trigger the tour on every
// new game. No SAVE_VERSION bump. Replay from Settings clears the flag.

import { onScreenShow, type ScreenId } from '../ScreenRouter';
import { PHASE1_STEPS } from './onboardingSteps';
import { showCoachMark, hideCoachMark } from './CoachMark';

const KEY_DONE = 'rugbyOnboardingDone';
const KEY_STEP = 'rugbyOnboardingStep';

// Settle delay before drawing a step: screenRouter fires its show-observers
// BEFORE the target screen is un-hidden and slid in (entry anim ≈ 220ms), so we
// wait for layout to settle before measuring the spotlight target.
const SETTLE_MS = 300;

let inited = false;
let navStartTour: (() => void) | null = null;
let currentIndex = 0;
let currentScreen: ScreenId | null = null;
let pendingTimer: number | null = null;
// Cleanup for a same-screen click-to-advance listener (e.g. squad swaps).
let actionCleanup: (() => void) | null = null;

function isDone(): boolean {
  return localStorage.getItem(KEY_DONE) === '1';
}
function markDone(): void {
  localStorage.setItem(KEY_DONE, '1');
}
function saveStep(i: number): void {
  localStorage.setItem(KEY_STEP, String(i));
}

function cancelPending(): void {
  if (pendingTimer !== null) {
    window.clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (actionCleanup) {
    actionCleanup();
    actionCleanup = null;
  }
  hideCoachMark();
}

function finish(): void {
  markDone();
  cancelPending();
}

function advance(): void {
  cancelPending();
  currentIndex += 1;
  saveStep(currentIndex);
  // The next step usually lives on a different screen (the player navigates
  // there and the screen-show drives it); render eagerly when it shares the
  // current screen, e.g. the in-place squad-management walkthrough.
  const next = PHASE1_STEPS[currentIndex];
  if (next && next.screen === currentScreen) renderStep(currentIndex);
}

// Same-screen advance: a delegated, capture-phase click on a matching element
// moves the tour on. Capture phase fires before any handler that calls
// stopPropagation (e.g. the player-name link), and the actual advance is
// deferred to the next frame so the triggering click fully resolves first.
function attachClickAdvance(selector: string): void {
  const handler = (e: MouseEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && t.closest(selector)) {
      requestAnimationFrame(() => advance());
    }
  };
  document.addEventListener('click', handler, true);
  actionCleanup = () => document.removeEventListener('click', handler, true);
}

function renderStep(idx: number): void {
  const step = PHASE1_STEPS[idx];
  if (!step) { finish(); return; }

  const eyebrow = step.kind === 'intro' ? 'Guided start' : 'Guided tour';

  if (step.kind === 'intro') {
    showCoachMark({
      eyebrow,
      title: step.title,
      body: step.body,
      buttons: [
        { label: 'Not now', onClick: () => { hideCoachMark(); finish(); } },
        {
          label: step.cta ?? 'Start tour',
          primary: true,
          onClick: () => {
            currentIndex = 1;
            saveStep(currentIndex);
            hideCoachMark();
            navStartTour?.();
          },
        },
      ],
    });
    return;
  }

  if (step.kind === 'final') {
    showCoachMark({
      eyebrow,
      title: step.title,
      body: step.body,
      target: step.target,
      buttons: [{ label: step.cta ?? 'Finish', primary: true, onClick: () => { hideCoachMark(); finish(); } }],
    });
    return;
  }

  // Normal step. 'action' steps carry no advance button — the player taps the
  // spotlighted UI; only the persistent Skip remains.
  const buttons = step.advance === 'next'
    ? [{ label: step.cta ?? 'Next', primary: true, onClick: advance }]
    : [];
  showCoachMark({
    eyebrow,
    title: step.title,
    body: step.body,
    target: step.target,
    buttons,
    onSkip: () => { hideCoachMark(); finish(); },
  });
  if (step.advanceClick) attachClickAdvance(step.advanceClick);
}

function onShow(id: ScreenId): void {
  currentScreen = id;
  cancelPending();
  if (isDone()) return;

  let idx = -1;
  for (let i = currentIndex; i < PHASE1_STEPS.length; i++) {
    if (PHASE1_STEPS[i].screen === id) { idx = i; break; }
  }
  if (idx === -1) return;

  currentIndex = idx;
  saveStep(idx);
  pendingTimer = window.setTimeout(() => { pendingTimer = null; renderStep(idx); }, SETTLE_MS);
}

// Wire the director once at startup, before the first Home render so it catches
// the boot screen-show. `onStartTour` navigates from Home into team selection.
export function initOnboarding(opts: { onStartTour: () => void }): void {
  if (inited) return;
  inited = true;
  navStartTour = opts.onStartTour;
  currentIndex = isDone() ? PHASE1_STEPS.length : Number(localStorage.getItem(KEY_STEP) ?? '0') || 0;
  onScreenShow(onShow);
}

// Replay (Settings → Replay tutorial): clear the done flag, reset to the first
// guided step, and jump straight into team selection.
export function restartOnboarding(): void {
  localStorage.removeItem(KEY_DONE);
  currentIndex = 1;
  saveStep(currentIndex);
  hideCoachMark();
  navStartTour?.();
}

// True while a new player is in (or has not dismissed) the guided tour. Used to
// apply new-user-friendly defaults — e.g. keeping the manager in charge of their
// own League Cup ties so the assistant doesn't quietly take over and confuse the
// board mid-tutorial.
export function isOnboardingActive(): boolean {
  return inited && !isDone();
}
