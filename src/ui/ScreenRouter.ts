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
  | 'team-selector'
  | 'team-info'
  | 'mode-picker'
  | 'hub'
  | 'fixture-list'
  | 'league-table'
  | 'pre-match'
  | 'app'
  | 'match-result'
  | 'round-results'
  | 'playoff-bracket'
  | 'budget-reveal'
  | 'takeover-reveal'
  | 'end-of-season'
  | 'renewals'
  | 'transfer-market'
  | 'retention-decision'
  | 'signing-results'
  | 'rollover'
  | 'contracts'
  | 'squad-management'
  | 'squad-overview';

const SCREENS: Record<ScreenId, { elId: string; shownDisplay: string }> = {
  'home':          { elId: 'home-screen',   shownDisplay: '' },
  'settings':      { elId: 'settings',      shownDisplay: '' },
  'team-selector': { elId: 'team-selector', shownDisplay: '' },
  'team-info':     { elId: 'team-info',     shownDisplay: '' },
  'mode-picker':   { elId: 'mode-picker',   shownDisplay: '' },
  'hub':           { elId: 'hub',           shownDisplay: '' },
  'fixture-list':  { elId: 'fixture-list',  shownDisplay: '' },
  'league-table':  { elId: 'league-table',  shownDisplay: '' },
  'pre-match':     { elId: 'pre-match',     shownDisplay: '' },
  'app':           { elId: 'app',           shownDisplay: '' },
  'match-result':  { elId: 'match-result',  shownDisplay: 'flex' },
  'round-results': { elId: 'round-results', shownDisplay: '' },
  'playoff-bracket':  { elId: 'playoff-bracket',  shownDisplay: '' },
  'budget-reveal':    { elId: 'budget-reveal',    shownDisplay: '' },
  'takeover-reveal':  { elId: 'takeover-reveal',  shownDisplay: '' },
  'end-of-season':    { elId: 'end-of-season',    shownDisplay: '' },
  'renewals':         { elId: 'renewals',         shownDisplay: '' },
  'transfer-market':  { elId: 'transfer-market',  shownDisplay: '' },
  'retention-decision': { elId: 'retention-decision', shownDisplay: '' },
  'signing-results':  { elId: 'signing-results',  shownDisplay: '' },
  'rollover':         { elId: 'rollover',         shownDisplay: '' },
  'contracts':        { elId: 'contracts',        shownDisplay: '' },
  'squad-management': { elId: 'squad-management', shownDisplay: '' },
  'squad-overview':   { elId: 'squad-overview',   shownDisplay: '' },
};

export const screenRouter = {
  _current: null as ScreenId | null,
  show(target: ScreenId): void {
    const targetEl = document.getElementById(SCREENS[target].elId);
    // Fails loudly if a screen id is in the SCREENS map but the matching
    // <div id="…"> isn't in the DOM — otherwise screenRouter.show silently
    // hides every screen, resulting in a blank page (e.g. when a stale
    // cached index.html is loaded against a newer JS bundle).
    if (!targetEl) {
      throw new Error(`screenRouter.show("${target}"): no element with id "${SCREENS[target].elId}" in DOM. Likely a stale cached index.html — try a hard reload.`);
    }
    const isNewScreen = target !== this._current;
    this._current = target;
    for (const id of Object.keys(SCREENS) as ScreenId[]) {
      const cfg = SCREENS[id];
      const el = document.getElementById(cfg.elId);
      if (!el) continue;
      el.style.display = id === target ? cfg.shownDisplay : 'none';
    }
    // Fade-up entry animation on screen transitions. Skip 'app' (permanently
    // mounted live-match shell) and skip initial mount (no prior screen).
    if (isNewScreen && target !== 'app') {
      targetEl.classList.remove('screen-entering');
      void targetEl.offsetWidth;
      targetEl.classList.add('screen-entering');
      targetEl.addEventListener('animationend', function onEnd() {
        targetEl.classList.remove('screen-entering');
        targetEl.removeEventListener('animationend', onEnd);
      });
    }
  },
};
