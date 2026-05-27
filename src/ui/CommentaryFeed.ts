import { eventBus } from '../utils/eventBus';
import { MatchPhase } from '../types/engine';
import type { GameEvent } from '../types/match';
import type { Player } from '../types/player';
import { renderNarrationSteps } from '../commentary/CommentaryRenderer';
import { teamTextColor } from '../utils/teamColor';
import { playCue } from './SoundManager';
import { isHeroEvent } from './keyMoment';

const PHASE_CLASS: Partial<Record<MatchPhase, string>> = {
  [MatchPhase.TryScored]:     'event-try',
  [MatchPhase.Penalty]:       'event-penalty',
  [MatchPhase.ConversionKick]:'event-conversion',
  [MatchPhase.Scrum]:         'event-scrum',
  [MatchPhase.Lineout]:       'event-lineout',
  [MatchPhase.Maul]:          'event-maul',
  [MatchPhase.KickOff]:       'event-kickoff',
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
  [MatchPhase.BoxKick]:       'KICK',
  [MatchPhase.TacticalKick]:  'KICK',
  [MatchPhase.HalfTime]:      'HT',
  [MatchPhase.FullTime]:      'FT',
  [MatchPhase.Substitution]:  'SUB',
};

const MAX_ENTRIES       = 30;
const STEP_STAGGER_MS   = 350;  // gap between staggered narration steps within a key-moment event
const HERO_DWELL_MS     = 600;  // window after a hero entry where the strap holds against routine entries

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

export function initCommentaryFeed(): void {
  const feed   = document.getElementById('commentary-feed')!;
  const latest = document.getElementById('latest-commentary')!;

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

  function buildEntry(event: GameEvent, text: string): HTMLDivElement {
    const entry = document.createElement('div');
    const phaseClass = PHASE_CLASS[event.phase] ?? '';
    entry.className = `commentary-entry possession-${event.side} ${phaseClass}`.trim();

    const minute = Math.floor(event.gameMinute);
    const tag    = TAG_MAP[event.phase] ?? '·';
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

  type QueuedStep = { event: GameEvent; text: string; hero: boolean };
  let stepQueue: QueuedStep[] = [];
  let stepDrainTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHeroAt = 0;

  function pushEntry(event: GameEvent, text: string, hero: boolean): void {
    const entry = buildEntry(event, text);
    if (hero) entry.classList.add('commentary-entry--hero');
    feed.insertBefore(entry, feed.firstChild);
    while (feed.children.length > MAX_ENTRIES && feed.lastChild) {
      feed.removeChild(feed.lastChild);
    }
    const now = Date.now();
    const heroProtected = now - lastHeroAt < HERO_DWELL_MS;
    if (hero || !heroProtected) {
      // Surface the possession-side team colour to CSS so the strap underline
      // and glow render in team colour. The class possession-${side} on the
      // entry itself is the same signal but CSS variables read cleaner here.
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
    pushEntry(next.event, next.text, next.hero);
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
    const shouldStagger = hero && steps.length > 1;

    if (!shouldStagger) {
      const text = steps.join(' ');
      if (!text.trim()) return;
      pushEntry(event, text, hero);
      return;
    }

    for (const text of steps) {
      stepQueue.push({ event, text, hero: true });
    }
    if (stepDrainTimer === null) drainNext();
  });
}
