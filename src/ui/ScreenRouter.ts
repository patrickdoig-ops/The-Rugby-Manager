// Single owner of which top-level screen is visible. Each screen module accepts
// `onForward` / `onBack` callbacks from `main.ts`; main.ts calls `screenRouter.show(...)`
// to switch the visible screen. Screen modules never poke
// `document.getElementById(...).style.display` directly.
//
// Adding a screen: (1) add the id here, (2) add a `<div id="…">` element to index.html,
// (3) wire the navigation handler in main.ts.

export type ScreenId =
  | 'home'
  | 'settings'
  | 'saves'
  | 'team-selector'
  | 'team-info'
  | 'mode-picker'
  | 'hub'
  | 'fixture-list'
  | 'league-table'
  | 'league-menu'
  | 'team-stats'
  | 'player-stats'
  | 'player-profile'
  | 'pre-match'
  | 'app'
  | 'match-result'
  | 'round-results'
  | 'playoff-bracket'
  | 'budget-reveal'
  | 'takeover-reveal'
  | 'end-of-season'
  | 'sacked'
  | 'renewals'
  | 'transfer-market'
  | 'retention-decision'
  | 'signing-results'
  | 'rollover'
  | 'contracts'
  | 'squad-management'
  | 'squad-overview'
  | 'training'
  | 'training-results'
  | 'international-break'
  | 'intl-callups'
  | 'cup-fixtures'
  | 'cup-results'
  | 'achievements'
  | 'inbox'
  | 'contracts-transfers-menu'
  | 'club-menu'
  | 'board-confidence'
  | 'staff'
  | 'team-talk'
  | 'loans';

const SCREENS: Record<ScreenId, { elId: string; shownDisplay: string }> = {
  'home':          { elId: 'home-screen',   shownDisplay: '' },
  'settings':      { elId: 'settings',      shownDisplay: '' },
  'saves':         { elId: 'saves',         shownDisplay: '' },
  'team-selector': { elId: 'team-selector', shownDisplay: '' },
  'team-info':     { elId: 'team-info',     shownDisplay: '' },
  'mode-picker':   { elId: 'mode-picker',   shownDisplay: '' },
  'hub':           { elId: 'hub',           shownDisplay: '' },
  'fixture-list':  { elId: 'fixture-list',  shownDisplay: '' },
  'league-table':  { elId: 'league-table',  shownDisplay: '' },
  'league-menu':   { elId: 'league-menu',   shownDisplay: '' },
  'team-stats':    { elId: 'team-stats',    shownDisplay: '' },
  'player-stats':  { elId: 'player-stats',  shownDisplay: '' },
  'intl-callups':  { elId: 'intl-callups',  shownDisplay: '' },
  'cup-fixtures':  { elId: 'cup-fixtures',  shownDisplay: '' },
  'cup-results':   { elId: 'cup-results',   shownDisplay: '' },
  'player-profile':{ elId: 'player-profile',shownDisplay: '' },
  'pre-match':     { elId: 'pre-match',     shownDisplay: '' },
  'app':           { elId: 'app',           shownDisplay: '' },
  'match-result':  { elId: 'match-result',  shownDisplay: 'flex' },
  'round-results': { elId: 'round-results', shownDisplay: '' },
  'playoff-bracket':  { elId: 'playoff-bracket',  shownDisplay: '' },
  'budget-reveal':    { elId: 'budget-reveal',    shownDisplay: '' },
  'takeover-reveal':  { elId: 'takeover-reveal',  shownDisplay: '' },
  'end-of-season':    { elId: 'end-of-season',    shownDisplay: '' },
  'sacked':           { elId: 'sacked',           shownDisplay: '' },
  'renewals':         { elId: 'renewals',         shownDisplay: '' },
  'transfer-market':  { elId: 'transfer-market',  shownDisplay: '' },
  'retention-decision': { elId: 'retention-decision', shownDisplay: '' },
  'signing-results':  { elId: 'signing-results',  shownDisplay: '' },
  'rollover':         { elId: 'rollover',         shownDisplay: '' },
  'contracts':        { elId: 'contracts',        shownDisplay: '' },
  'squad-management': { elId: 'squad-management', shownDisplay: '' },
  'squad-overview':   { elId: 'squad-overview',   shownDisplay: '' },
  'training':         { elId: 'training',         shownDisplay: '' },
  'training-results': { elId: 'training-results', shownDisplay: '' },
  'international-break': { elId: 'international-break', shownDisplay: '' },
  'achievements':              { elId: 'achievements',              shownDisplay: '' },
  'inbox':                     { elId: 'inbox',                     shownDisplay: '' },
  'contracts-transfers-menu':  { elId: 'contracts-transfers-menu',  shownDisplay: '' },
  'club-menu':                 { elId: 'club-menu',                 shownDisplay: '' },
  'board-confidence':          { elId: 'board-confidence',          shownDisplay: '' },
  'staff':                     { elId: 'staff',                     shownDisplay: '' },
  'team-talk':                 { elId: 'team-talk',                 shownDisplay: '' },
  'loans':                     { elId: 'loans',                     shownDisplay: '' },
};

export type NavDirection = 'forward' | 'back';
export interface ShowOptions { direction?: NavDirection }

let _currentScreen: ScreenId | null = null;

// Observers notified whenever the visible screen changes (fired once per
// transition, not on a re-show of the same screen). Used by AudioDirector to
// drive per-screen music beds. Kept generic so ScreenRouter has no UI-audio
// dependency.
const showObservers = new Set<(id: ScreenId) => void>();
export function onScreenShow(cb: (id: ScreenId) => void): () => void {
  showObservers.add(cb);
  return () => { showObservers.delete(cb); };
}

// Class-and-attribute cleanup window. Must outlive the longest row-stagger
// animation (last row's `--row-delay` of ~400ms + 240ms row anim ≈ 640ms),
// because the row rule is gated on the parent `.screen-entering` class.
const ENTER_CLEANUP_MS = 700;

// Per-element cleanup-timer map so a rapid re-show of the same screen
// cancels the stale timer rather than letting it strip the freshly-applied
// `.screen-entering` class out from under the in-flight animation.
const cleanupTimers = new WeakMap<HTMLElement, number>();

export const screenRouter = {
  show(target: ScreenId, opts?: ShowOptions): void {
    const targetEl = document.getElementById(SCREENS[target].elId);
    // Fails loudly if a screen id is in the SCREENS map but the matching
    // <div id="…"> isn't in the DOM — otherwise screenRouter.show silently
    // hides every screen, resulting in a blank page (e.g. when a stale
    // cached index.html is loaded against a newer JS bundle).
    if (!targetEl) {
      throw new Error(`screenRouter.show("${target}"): no element with id "${SCREENS[target].elId}" in DOM. Likely a stale cached index.html — try a hard reload.`);
    }
    const isNewScreen = target !== _currentScreen;
    const isFirstMount = _currentScreen === null;
    _currentScreen = target;
    if (isNewScreen) {
      for (const obs of showObservers) {
        try { obs(target); } catch (err) { console.error('onScreenShow observer threw', err); }
      }
    }
    for (const id of Object.keys(SCREENS) as ScreenId[]) {
      const cfg = SCREENS[id];
      const el = document.getElementById(cfg.elId);
      if (!el) continue;
      el.style.display = id === target ? cfg.shownDisplay : 'none';
    }
    // Directional entry animation on screen transitions. Skip 'app'
    // (permanently mounted live-match shell) and skip initial mount
    // (no prior screen — avoids an unwanted slide on first boot).
    if (isNewScreen && !isFirstMount && target !== 'app') {
      const direction: NavDirection = opts?.direction ?? 'forward';
      const pending = cleanupTimers.get(targetEl);
      if (pending !== undefined) {
        window.clearTimeout(pending);
        cleanupTimers.delete(targetEl);
      }
      targetEl.classList.remove('screen-entering');
      delete targetEl.dataset.direction;
      void targetEl.offsetWidth;
      targetEl.dataset.direction = direction;
      targetEl.classList.add('screen-entering');
      // Timer-based cleanup rather than `animationend` — the row-stagger
      // window outlives the screen's own animation.
      const timerId = window.setTimeout(() => {
        targetEl.classList.remove('screen-entering');
        delete targetEl.dataset.direction;
        cleanupTimers.delete(targetEl);
      }, ENTER_CLEANUP_MS);
      cleanupTimers.set(targetEl, timerId);
    }
  },
};
