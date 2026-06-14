// Phase 1 onboarding script — the guided "first match" tour. Pure data: the
// OnboardingDirector reacts to screenRouter screen-shows and renders the step
// whose `screen` matches. Steps are ordered; the director only ever moves
// forward through this list (see OnboardingDirector for the matching rule).
//
// `kind`:
//   'intro' — opening card on Home (Start tour / Not now buttons)
//   'final' — closing card (single Finish button, ends the tour)
//   undefined — a normal step
// `advance`:
//   'action' — no Next button; the user advances by interacting with the real
//              UI (e.g. tapping the highlighted tile), which navigates and lets
//              the next screen-show drive the next step. Learn-by-doing.
//   'next'   — the card shows a primary button that advances the tour.
// `target` — CSS selector for the element to spotlight. Omit for a centred card.

import type { ScreenId } from '../ScreenRouter';

export interface OnboardingStep {
  id: string;
  screen: ScreenId;
  title: string;
  body: string;
  target?: string;
  advance: 'action' | 'next';
  kind?: 'intro' | 'final';
  cta?: string;
}

export const PHASE1_STEPS: OnboardingStep[] = [
  {
    id: 'intro',
    screen: 'home',
    kind: 'intro',
    advance: 'next',
    title: 'Welcome to The Rugby Manager',
    body: 'New here? Take a short guided tour — pick a club, set your side, and play your first match. You can skip any time.',
    cta: 'Start tour',
  },
  {
    id: 'pick-team',
    screen: 'team-selector',
    advance: 'action',
    title: 'Pick your club',
    body: 'Tap any club to take charge. Choose one to continue.',
  },
  {
    id: 'team-info',
    screen: 'team-info',
    advance: 'action',
    title: 'Your squad',
    body: 'Here is the squad you would inherit — star players, ratings and depth. Tap Select to manage this club.',
  },
  {
    id: 'quick-start',
    screen: 'mode-picker',
    target: '.mp-card[data-mode="quick"]',
    advance: 'action',
    title: 'Quick Start',
    body: 'Quick Start drops you straight into the season with this squad. Tap it to begin.',
  },
  {
    id: 'hub-tactics',
    screen: 'hub',
    target: '#hub-tile-tactics',
    advance: 'action',
    title: 'This is your Hub',
    body: 'Your base between matches. First, tap Tactics to set your game plan.',
  },
  {
    id: 'tactics',
    screen: 'tactics',
    advance: 'next',
    cta: 'Got it',
    title: 'Set your game plan',
    body: 'Pick a formation and style — the defaults are solid to start. Tap Back when you are happy, then we will pick the squad.',
  },
  {
    id: 'hub-squad',
    screen: 'hub',
    target: '#hub-tile-squad',
    advance: 'action',
    title: 'Pick your squad',
    body: 'Now tap Squad to set your matchday 23. Your assistant pre-picks a strong side.',
  },
  {
    id: 'squad',
    screen: 'squad-management',
    advance: 'next',
    cta: 'Got it',
    title: 'Your matchday 23',
    body: 'This is your starting XV and bench. Tweak it if you like, then head Back to the Hub.',
  },
  {
    id: 'hub-continue',
    screen: 'hub',
    target: '#hub-play-next',
    advance: 'action',
    title: 'Kick off',
    body: 'You are ready. Tap Continue to head to your first match.',
  },
  {
    id: 'pre-match',
    screen: 'pre-match',
    advance: 'next',
    cta: 'Got it',
    title: 'Matchday',
    body: 'Set the mood with a team talk, then start the match and watch it play out.',
  },
  {
    id: 'result',
    screen: 'match-result',
    kind: 'final',
    advance: 'next',
    cta: 'Finish tour',
    title: "That's a match!",
    body: 'Results feed your league table and season story. You are all set — explore the Hub to keep building your club.',
  },
];
