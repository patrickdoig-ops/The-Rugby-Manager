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
// `placement` — 'bottom' anchors an untargeted card at the foot of the screen
//              with no dim (keeps a selection screen visible). Default centre.
// `dismissible` — adds a "Got it" that hides the card without advancing.
// `returnToHub` — on a 'next' step, the button also navigates back to the Hub.

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
  returnToHub?: boolean;
  placement?: 'center' | 'bottom';
  dismissible?: boolean;
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
    placement: 'bottom',
    dismissible: true,
    title: 'Pick your club',
    body: 'Tap any club to take charge — scroll for the full list. Choose one to continue.',
  },
  {
    id: 'team-info',
    screen: 'team-info',
    advance: 'action',
    placement: 'bottom',
    dismissible: true,
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

  // ── Hub: opponent first, then where to find help, then squad ───────────────
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
    id: 'help',
    screen: 'hub',
    target: '#hub .rm-help-btn',
    advance: 'next',
    cta: 'Got it',
    title: 'Help is always here',
    body: 'See the “?” up here? Tap it on any screen for a quick guide to that page — what everything does and tips for new managers. If you ever get stuck, that’s where to look.',
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
    target: '.sq-player--starter .sq-jersey',
    advance: 'action',
    advanceClick: '.sq-player',
    title: 'Tap the number square',
    body: 'To pick a player, tap their number square — the jersey number on the left of the row. It is the easiest spot to hit. Tap one of your starters now; the row lights up.',
  },
  {
    id: 'squad-swap',
    screen: 'squad-management',
    target: '.sq-player--bench .sq-jersey',
    advance: 'action',
    advanceClick: '.sq-player',
    title: 'Swap them over',
    body: 'Now tap a second player’s number square to swap the two over. Scroll down to your bench or wider squad, then tap their number.',
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
    body: 'When your 23 looks right, tap Save to keep your changes — or Back to leave the side as it was. Then we will head straight to kickoff.',
  },

  // ── Straight to the first match — tactics also surface in the build-up ──────
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
    body: 'Set the mood with a team talk — you can also tweak tactics here — then start the match.',
  },

  // ── Live match: into the 2D pitch for kickoff, then the other views ─────────
  {
    id: 'live-pitch',
    screen: 'app',
    target: '#btn-view-pitch',
    advance: 'action',
    advanceClick: '#btn-view-pitch',
    title: 'Watch in 2D',
    body: 'You start on the Dashboard overview. For kickoff, tap the pitch icon to switch to the 2D pitch view — the most engaging way to watch the action.',
  },
  {
    id: 'live-views',
    screen: 'app',
    target: '#view-toggle-bar',
    advance: 'next',
    cta: 'Got it',
    title: 'Switch your view',
    body: 'These icons change how you follow the match — Dashboard, Pitch, Commentary, live Stats, and Players. Flick between them any time to get the detail you want.',
  },
  {
    id: 'live-controls',
    screen: 'app',
    target: '#sim-controls',
    advance: 'next',
    cta: 'Got it',
    title: 'Match controls',
    body: 'Down here you play, pause, change speed, and make tactical tweaks or substitutions on the fly. We will see the result at full time.',
  },
  {
    id: 'result',
    screen: 'match-result',
    advance: 'next',
    cta: 'Continue',
    title: "That's a match!",
    body: 'Results feed your league table and season story. Now let me show you a few things to manage around your matches. Tap Continue to head back to the Hub.',
  },

  // ── Phase 2: advanced tactics → cup delegation → staff → transfers → loans ──
  {
    id: 'hub-tactics',
    screen: 'hub',
    target: '#hub-tile-tactics',
    advance: 'action',
    title: 'Tactics, in depth',
    body: 'You played the defaults — which are perfectly fine. But if you want more control, tap Tactics for the advanced options.',
  },
  {
    id: 'tactics-advanced',
    screen: 'tactics',
    advance: 'next',
    cta: 'Got it',
    title: 'Fine-tune your game plan',
    body: 'Here you can set formation, attacking and defensive styles, set-piece calls and more. Adjust as much or as little as you like, Save, then tap Back. Totally optional — come here whenever you want finer control.',
  },
  {
    id: 'hub-club',
    screen: 'hub',
    target: '#hub-tile-club',
    advance: 'action',
    title: 'Run your club',
    body: 'Your League Cup runs alongside the league. You do not have to play every tie yourself — let’s set that up. Tap Club.',
  },
  {
    id: 'club-assistant',
    screen: 'club-menu',
    target: '#cm-tile-assistant',
    advance: 'action',
    title: 'Assistant Manager',
    body: 'Tap Assistant Manager to choose who takes charge of your League Cup matches.',
  },
  {
    id: 'assistant-delegate',
    screen: 'assistant-manager',
    target: '.cup-toggle',
    advance: 'next',
    cta: 'Got it',
    title: 'Delegate your cup ties',
    body: 'You are set to manage cup ties yourself for now — perfect while you find your feet. When you want to lighten the load, switch to “Assistant manages” and they’ll simulate every League Cup match, and you can tell them to rest your first-choice 15. Tap Back when you are ready.',
  },
  {
    id: 'club-staff',
    screen: 'club-menu',
    target: '#cm-tile-staff',
    advance: 'action',
    title: 'Get the right staff',
    body: 'A good assistant runs your cup ties better, and strong coaches sharpen training and scouting. Tap Staff to check your backroom.',
  },
  {
    id: 'staff-hire',
    screen: 'staff',
    target: '.staff-btn--hire',
    advance: 'next',
    cta: 'Back to Hub',
    returnToHub: true,
    title: 'Hire your backroom',
    body: 'Each role has a hire slot and a wage. Bring in the best you can afford — a top assistant manager especially pays off if you delegate the cup. When you are done, this takes you back to the Hub.',
  },
  {
    id: 'hub-contracts',
    screen: 'hub',
    target: '#hub-tile-contracts-transfers',
    advance: 'action',
    title: 'Shape your squad',
    body: 'Last stop: the transfer market and loans. Tap Contracts & Transfers.',
  },
  {
    id: 'ct-transfers',
    screen: 'contracts-transfers-menu',
    target: '#ctm-tile-transfers',
    advance: 'action',
    title: 'How transfers work',
    body: 'Tap Transfers to open the free-agent market.',
  },
  {
    id: 'transfers',
    screen: 'transfer-market',
    target: '.tm-row',
    advance: 'next',
    cta: 'Got it',
    title: 'Sign a free agent',
    body: 'Available players show here with their rating and wage. Make an offer within your budget to sign one — a smart addition can cover a weak spot. Tap Continue to head back when you are done.',
  },
  {
    id: 'ct-loans',
    screen: 'contracts-transfers-menu',
    target: '#ctm-tile-loans',
    advance: 'action',
    title: 'Develop your youngsters',
    body: 'One more thing — tap Loans.',
  },
  {
    id: 'loans',
    screen: 'loans',
    target: '.loan-btn--out',
    kind: 'final',
    advance: 'next',
    cta: 'Finish tour',
    title: 'Loan out your youth',
    body: 'Send promising young players out on loan with “Send out” — they get regular game time and boosted development, then return better than they left. That’s the essentials. You are ready to manage your season — good luck!',
  },
];
