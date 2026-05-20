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
  | 'hub'
  | 'fixture-list'
  | 'league-table'
  | 'pre-match'
  | 'app'
  | 'match-result'
  | 'round-results';

const SCREENS: Record<ScreenId, { elId: string; shownDisplay: string }> = {
  'home':          { elId: 'home-screen',   shownDisplay: '' },
  'settings':      { elId: 'settings',      shownDisplay: '' },
  'team-selector': { elId: 'team-selector', shownDisplay: '' },
  'team-info':     { elId: 'team-info',     shownDisplay: '' },
  'hub':           { elId: 'hub',           shownDisplay: '' },
  'fixture-list':  { elId: 'fixture-list',  shownDisplay: '' },
  'league-table':  { elId: 'league-table',  shownDisplay: '' },
  'pre-match':     { elId: 'pre-match',     shownDisplay: '' },
  'app':           { elId: 'app',           shownDisplay: '' },
  'match-result':  { elId: 'match-result',  shownDisplay: 'flex' },
  'round-results': { elId: 'round-results', shownDisplay: '' },
};

export const screenRouter = {
  show(target: ScreenId): void {
    for (const id of Object.keys(SCREENS) as ScreenId[]) {
      const cfg = SCREENS[id];
      const el = document.getElementById(cfg.elId);
      if (!el) continue;
      el.style.display = id === target ? cfg.shownDisplay : 'none';
    }
  },
};
