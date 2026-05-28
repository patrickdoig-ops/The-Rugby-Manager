import { eventBus } from '../utils/eventBus';
import { MatchPhase } from '../types/engine';
import type { GameEvent } from '../types/match';
import type { Player } from '../types/player';
import { renderNarrationSteps } from '../commentary/CommentaryRenderer';
import { teamTextColor } from '../utils/teamColor';
import { playCue } from './SoundManager';
import { isHeroEvent } from './keyMoment';
import { loadCommentaryFilter, saveCommentaryFilter, type CfFilter } from './uiPrefs';

const PHASE_CLASS: Partial<Record<MatchPhase, string>> = {
  [MatchPhase.TryScored]:     'event-try',
  [MatchPhase.Penalty]:       'event-penalty',
  [MatchPhase.ConversionKick]:'event-conversion',
  [MatchPhase.KickAtGoal]:    'event-kickatgoal',
  [MatchPhase.BoxKick]:       'event-kick',
  [MatchPhase.TacticalKick]:  'event-kick',
  [MatchPhase.Scrum]:         'event-scrum',
  [MatchPhase.Lineout]:       'event-lineout',
  [MatchPhase.Maul]:          'event-maul',
  [MatchPhase.KickOff]:       'event-kickoff',
  [MatchPhase.DropOut22]:     'event-kickoff',
  [MatchPhase.HalfTime]:      'event-halftime',
  [MatchPhase.FullTime]:      'event-fulltime',
  [MatchPhase.Substitution]:  'event-sub',
};

const TAG_MAP: Partial<Record<MatchPhase, string>> = {
  [MatchPhase.TryScored]:     'TRY',
  [MatchPhase.Penalty]:       'PEN',
  [MatchPhase.ConversionKick]:'CON',
  [MatchPhase.Scrum]:         'SCR',
  [MatchPhase.Lineout]:       'LNO',
  [MatchPhase.Maul]:          'MAL',
  [MatchPhase.KickOff]:       'KO',
  [MatchPhase.DropOut22]:     '22',
  [MatchPhase.BoxKick]:       'KICK',
  [MatchPhase.TacticalKick]:  'KICK',
  [MatchPhase.HalfTime]:      'HT',
  [MatchPhase.FullTime]:      'FT',
  [MatchPhase.Substitution]:  'SUB',
};

const MAX_ENTRIES       = 30;
const STEP_STAGGER_MS   = 500;  // gap between staggered narration steps within a key-moment event
const HERO_DWELL_MS     = 600;  // window after a hero entry where the strap holds against routine entries

// Phase-outcome keys that mark the headline beat of a staggered hero event.
// Steps preceding the headline render without the phase tag (buildup pass
// commentary shouldn't read as a TRY before the try is declared).
const HEADLINE_OUTCOME_KEYS: ReadonlySet<string> = new Set([
  'line_break_try', 'dominant_carry_try', 'maul_try',
]);

function colorizePlayer(text: string, player: Player, color: string): string {
  const surname = player.lastName;
  const label = `${surname} (#${player.squadNumber})`;
  return text.split(label).join(`<span style="color:${color};font-weight:700">${label}</span>`);
}

// Prepositions that take an object-case pronoun ("him"), not subject
// case ("he"). Keep the list focused on the prepositions that actually
// show up in the commentary banks — anything outside this set falls
// through to the subject default.
const OBJECT_PREPOSITIONS = new Set([
  'to', 'from', 'with', 'for', 'by', 'at', 'off', 'into',
  'past', 'behind', 'around', 'on', 'in', 'against', 'through',
  'over', 'under',
]);

function deduplicatePlayerRefs(text: string): string {
  const seen = new Set<string>();
  let result = text.replace(
    /[A-Z][A-Za-z'-]* \(#\d{1,2}\)/g,
    (match, offset: number) => {
      if (!seen.has(match)) {
        seen.add(match);
        return match;
      }
      // Second mention → pronoun. Look at the immediately preceding
      // word: "offloading to Smith (#10)" → "offloading to him", but
      // "Smith (#10) carries" → "He carries".
      const lookback = text.slice(Math.max(0, offset - 24), offset).toLowerCase();
      const lastWord = lookback.match(/\b([a-z]+)\s+$/)?.[1];
      return lastWord && OBJECT_PREPOSITIONS.has(lastWord) ? 'him' : 'he';
    },
  );
  // Capitalise either pronoun when it lands at the start of a sentence.
  return result.replace(/([.!?]\s+)(he|him)\b/g, (_, punc, p) => punc + p[0].toUpperCase() + p.slice(1));
}

// Filter chip → phase-class mapping is enforced by CSS rules in
// `style/commentary.css` (`.cf-feed--filter-X .commentary-entry:not(.event-Y)
// { display: none }`). Keep the chip list in sync with that stylesheet.
// Card-bearing entries don't get a dedicated chip — cards announce inside
// Penalty / TmoReview events (no MatchPhase.Card exists). The Pens chip
// covers those moments.
const FILTER_CHIPS: ReadonlyArray<{ id: CfFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'tries',     label: 'Tries' },
  { id: 'penalties', label: 'Pens' },
  { id: 'kicks',     label: 'Kicks' },
];

export function initCommentaryFeed(): void {
  const feed   = document.getElementById('commentary-feed')!;
  const latest = document.getElementById('latest-commentary')!;
  const panel  = document.getElementById('panel-commentary')!;

  // Filter chip bar — injected once at init, sticky across matches via
  // localStorage. Placed above the feed inside its parent panel so the
  // dashboard view (where commentary occupies the left column) renders
  // the chips at the top of the column.
  let currentFilter: CfFilter = loadCommentaryFilter();
  const filterBar = document.createElement('div');
  filterBar.className = 'cf-filter-bar';
  filterBar.innerHTML = FILTER_CHIPS.map(c =>
    `<button type="button" class="cf-chip${c.id === currentFilter ? ' cf-chip--active' : ''}" data-cf-filter="${c.id}">${c.label}</button>`
  ).join('');
  panel.insertBefore(filterBar, feed);

  function applyFilterClass(): void {
    feed.classList.forEach(c => {
      if (c.startsWith('cf-feed--filter-')) feed.classList.remove(c);
    });
    if (currentFilter !== 'all') {
      feed.classList.add(`cf-feed--filter-${currentFilter}`);
    }
  }
  applyFilterClass();

  filterBar.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-cf-filter]');
    if (!target) return;
    const next = target.dataset.cfFilter as CfFilter | undefined;
    if (!next || next === currentFilter) return;
    currentFilter = next;
    saveCommentaryFilter(next);
    filterBar.querySelectorAll<HTMLButtonElement>('.cf-chip').forEach(btn => {
      btn.classList.toggle('cf-chip--active', btn.dataset.cfFilter === currentFilter);
    });
    applyFilterClass();
  });

  let allPlayersWithColor: Array<{ player: Player; color: string }> = [];
  let homeTeamName = '';
  let awayTeamName = '';
  let homeTeamColor = '';
  let awayTeamColor = '';

  // One-shot per match: team colours and rosters are fixed for the match lifetime.
  // Re-armed on `engine:initialized` so subsequent matches refresh the cache.
  let unsubTeams: (() => void) | null = null;
  function armTeamCache(): void {
    unsubTeams = eventBus.on('engine:stateChange', ({ state }) => {
      homeTeamColor = teamTextColor(state.homeTeam.color);
      awayTeamColor = teamTextColor(state.awayTeam.color);
      homeTeamName  = state.homeTeam.name;
      awayTeamName  = state.awayTeam.name;
      allPlayersWithColor = [
        ...[...state.homeTeam.players, ...state.homeTeam.bench].map(p => ({ player: p, color: homeTeamColor })),
        ...[...state.awayTeam.players, ...state.awayTeam.bench].map(p => ({ player: p, color: awayTeamColor })),
      ];
      unsubTeams?.();
      unsubTeams = null;
    });
  }
  armTeamCache();

  function buildEntry(event: GameEvent, text: string, showTag: boolean): HTMLDivElement {
    const entry = document.createElement('div');
    const phaseClass = showTag ? (PHASE_CLASS[event.phase] ?? '') : '';
    entry.className = `commentary-entry possession-${event.side} ${phaseClass}`.trim();

    // Team-tinted left border picks up the attacking side's text colour.
    // Read by `.commentary-entry { border-left: 3px solid var(--possession-color, …) }`.
    const possessionColor = event.side === 'home' ? homeTeamColor : awayTeamColor;
    if (possessionColor) entry.style.setProperty('--possession-color', possessionColor);

    const minute = Math.floor(event.gameMinute);
    const tag    = showTag ? (TAG_MAP[event.phase] ?? '·') : '·';
    let html = deduplicatePlayerRefs(text);

    for (const { player, color } of allPlayersWithColor) {
      html = colorizePlayer(html, player, color);
    }

    if (homeTeamName) html = html.split(homeTeamName).join(`<span style="color:${homeTeamColor};font-weight:600">${homeTeamName}</span>`);
    if (awayTeamName) html = html.split(awayTeamName).join(`<span style="color:${awayTeamColor};font-weight:600">${awayTeamName}</span>`);

    entry.innerHTML =
      `<span class="event-minute">${minute}′</span>` +
      `<span class="event-tag">${tag}</span>` +
      `<span class="event-text">${html}</span>`;

    return entry;
  }

  type QueuedStep = { event: GameEvent; text: string; hero: boolean; showTag: boolean };
  let stepQueue: QueuedStep[] = [];
  let stepDrainTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHeroAt = 0;

  function pushEntry(event: GameEvent, text: string, hero: boolean, showTag: boolean): void {
    const entry = buildEntry(event, text, showTag);
    if (hero) entry.classList.add('commentary-entry--hero');
    feed.insertBefore(entry, feed.firstChild);
    while (feed.children.length > MAX_ENTRIES && feed.lastChild) {
      feed.removeChild(feed.lastChild);
    }
    const now = Date.now();
    const heroProtected = now - lastHeroAt < HERO_DWELL_MS;
    if (hero || !heroProtected) {
      const color = event.side === 'home' ? homeTeamColor : awayTeamColor;
      if (color) latest.style.setProperty('--possession-color', color);
      latest.replaceChildren(entry.cloneNode(true));
      if (hero) lastHeroAt = now;
    }
  }

  function drainNext(): void {
    stepDrainTimer = null;
    const next = stepQueue.shift();
    if (!next) return;
    pushEntry(next.event, next.text, next.hero, next.showTag);
    if (stepQueue.length > 0) {
      stepDrainTimer = setTimeout(drainNext, STEP_STAGGER_MS);
    }
  }

  eventBus.on('engine:initialized', () => {
    feed.innerHTML = '';
    latest.innerHTML = '';
    latest.style.removeProperty('--possession-color');
    allPlayersWithColor = [];
    homeTeamName = '';
    awayTeamName = '';
    homeTeamColor = '';
    awayTeamColor = '';
    stepQueue = [];
    if (stepDrainTimer !== null) {
      clearTimeout(stepDrainTimer);
      stepDrainTimer = null;
    }
    lastHeroAt = 0;
    unsubTeams?.();
    armTeamCache();
  });

  eventBus.on('engine:event', ({ event }) => {
    if (event.phase === MatchPhase.TryScored) playCue('crowdRoar');

    const steps = renderNarrationSteps(event);
    if (steps.length === 0) return;

    const hero = isHeroEvent(event);
    const shouldStagger = steps.length > 1;

    // Headline index = the first phase_outcome step whose key signals the
    // event's outcome (e.g. line_break_try). Steps before it are buildup
    // play-by-play and render without the phase tag so the TRY badge
    // doesn't appear on the lead-up passes.
    const headlineIdx = steps.findIndex(s =>
      s.step.kind === 'phase_outcome' && HEADLINE_OUTCOME_KEYS.has(s.step.key));
    const buildupCount = headlineIdx > 0 ? headlineIdx : 0;

    if (!shouldStagger) {
      const text = steps.map(s => s.text).join(' ');
      if (!text.trim()) return;
      pushEntry(event, text, hero, true);
      return;
    }

    for (let i = 0; i < steps.length; i++) {
      stepQueue.push({ event, text: steps[i].text, hero, showTag: i >= buildupCount });
    }
    if (stepDrainTimer === null) drainNext();
  });
}
