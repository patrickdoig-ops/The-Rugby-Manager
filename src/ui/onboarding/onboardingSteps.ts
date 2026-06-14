// Phase 1 onboarding script — the guided "first match" tour. Pure data: the
// OnboardingDirector reacts to screenRouter screen-shows and renders the step
// whose `screen` matches the one that just appeared. Steps are ordered; the
// director only ever moves forward through this list.
//
// `kind`:
//   'intro' — opening card on Home (Start tour / Not now buttons)
//   'final' — closing card (single Finish button, ends the tour)
//   undefined — a normal step
// `advance`:
//   'action' — no Next button. The step is passed either by the player tapping
//              a real control that NAVIGATES to another screen (screen-change
//              advance), or — when `advanceClick` is set — by clicking a matching
//              element on the SAME screen (e.g. swapping players in the squad).
//   'next'   — the card shows a primary button that advances the tour.
// `advanceClick` — CSS selector. When set, a delegated click on a matching
//              element advances the tour. Use ONLY for same-screen steps; never
//              on a control that also navigates (that would double-advance).
// `target` — CSS selector for the element to spotlight. Omit for a centred card.

import type { ScreenId } from '../ScreenRouter';

export interface OnboardingStep {
  id: string;
  screen: ScreenId;
  title: string;
  body: string;
  target?: string;
  advance: 'action' | 'next';
  advanceClick?: string;
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

  // ── Hub: understand the next match FIRST, then squad, then tactics ──────────
  {
    id: 'hub-next-match',
    screen: 'hub',
    target: '#hub-next-match',
    advance: 'next',
    cta: 'Got it',
    title: 'This is your Hub',
    body: 'Your base between matches. Start here: this card shows your next fixture — who you face, where, and recent form. Always know your opponent before you pick a side.',
  },
  {
    id: 'hub-squad',
    screen: 'hub',
    target: '#hub-tile-squad',
    advance: 'action',
    title: 'Pick your squad',
    body: 'Now choose your matchday 23. Tap Squad to open the selector.',
  },

  // ── Squad management: walk through a real swap + how to read a player ───────
  {
    id: 'squad-intro',
    screen: 'squad-management',
    advance: 'next',
    cta: 'Show me',
    title: 'Your matchday 23',
    body: 'Three tiers: your Starting XV, the Bench, and the Wider Squad. Let me show you how to make a change.',
  },
  {
    id: 'squad-select',
    screen: 'squad-management',
    target: '.sq-player--starter',
    advance: 'action',
    advanceClick: '.sq-player',
    title: 'Select a player',
    body: 'Tap a player to select them — their row lights up. Go ahead, tap one of your starters.',
  },
  {
    id: 'squad-swap',
    screen: 'squad-management',
    target: '.sq-player--bench',
    advance: 'action',
    advanceClick: '.sq-player',
    title: 'Swap them over',
    body: 'Now tap a second player to swap the two over. Scroll down to reach your bench or wider squad, then tap one.',
  },
  {
    id: 'squad-expand',
    screen: 'squad-management',
    target: '.sq-expand-btn',
    advance: 'action',
    advanceClick: '.sq-expand-btn',
    title: 'Quick look at a player',
    body: 'Want a fast read on someone? Tap the ▾ chevron on any row to expand their attributes inline.',
  },
  {
    id: 'squad-profile',
    screen: 'squad-management',
    target: '.player-link',
    advance: 'action',
    title: 'Full player profile',
    body: 'For the complete breakdown — every attribute, form, contract and history — tap a player’s name.',
  },
  {
    id: 'profile-detail',
    screen: 'player-profile',
    advance: 'next',
    cta: 'Got it',
    title: 'The detailed view',
    body: 'This is the full profile: attributes, condition, morale and career history. Use it to judge who deserves a starting shirt. Tap Back when you are done.',
  },
  {
    id: 'squad-save',
    screen: 'squad-management',
    target: '#sq-save',
    advance: 'next',
    cta: 'Got it',
    title: 'Save your side',
    body: 'When your 23 looks right, tap Save to keep your changes — or Back to leave the side as it was. Then we will set your tactics.',
  },

  // ── Tactics, then kick off ────────────────────────────────────────────────
  {
    id: 'hub-tactics',
    screen: 'hub',
    target: '#hub-tile-tactics',
    advance: 'action',
    title: 'Now your game plan',
    body: 'With your squad set, tap Tactics to choose a formation and style of play.',
  },
  {
    id: 'tactics',
    screen: 'tactics',
    advance: 'next',
    cta: 'Got it',
    title: 'Set your tactics',
    body: 'Pick a formation and a style — the defaults are solid to start with. Tap Back when you are happy, and we will kick off.',
  },
  {
    id: 'hub-continue',
    screen: 'hub',
    target: '#hub-play-next',
    advance: 'action',
    title: 'Kick off',
    body: 'You are ready. Tap Continue to head into your first match.',
  },
  {
    id: 'pre-match',
    screen: 'pre-match',
    advance: 'next',
    cta: 'Got it',
    title: 'Matchday build-up',
    body: 'Set the mood with a team talk, then start the match.',
  },
  {
    id: 'live-match',
    screen: 'app',
    target: '#sim-controls',
    advance: 'next',
    cta: 'Got it',
    title: 'The match unfolds',
    body: 'The game plays out automatically. Use these controls to play, pause, change speed, or make tactical tweaks and subs. We will see the result at full time.',
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
