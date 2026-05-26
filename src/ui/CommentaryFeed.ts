import { eventBus } from '../utils/eventBus';
import { MatchPhase } from '../types/engine';
import type { GameEvent } from '../types/match';
import type { Player } from '../types/player';
import { renderNarration } from '../commentary/CommentaryRenderer';
import { teamTextColor } from '../utils/teamColor';
import { playCue } from './SoundManager';

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

const MAX_ENTRIES = 30;

function colorizePlayer(text: string, player: Player, color: string): string {
  const surname = player.lastName;
  const label = `${surname} (#${player.squadNumber})`;
  return text.split(label).join(`<span style="color:${color};font-weight:700">${label}</span>`);
}

function deduplicatePlayerRefs(text: string): string {
  const seen = new Set<string>();
  let result = text.replace(
    /[A-Z][A-Za-z'-]* \(#\d{1,2}\)/g,
    (match) => {
      if (seen.has(match)) return 'he';
      seen.add(match);
      return match;
    },
  );
  return result.replace(/([.!?]\s+)he\b/g, (_, punc) => punc + 'He');
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

  eventBus.on('engine:initialized', () => {
    feed.innerHTML = '';
    latest.innerHTML = '';
    allPlayersWithColor = [];
    homeTeamName = '';
    awayTeamName = '';
    homeTeamColor = '';
    awayTeamColor = '';
    unsubTeams?.();
    armTeamCache();
  });

  eventBus.on('engine:event', ({ event }) => {
    if (event.phase === MatchPhase.TryScored) playCue('crowdRoar');

    const text = renderNarration(event);
    if (!text.trim()) return;

    const entry = buildEntry(event, text);
    feed.insertBefore(entry, feed.firstChild);

    while (feed.children.length > MAX_ENTRIES && feed.lastChild) {
      feed.removeChild(feed.lastChild);
    }

    latest.replaceChildren(entry.cloneNode(true));
  });
}
