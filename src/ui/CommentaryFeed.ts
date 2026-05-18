import { eventBus } from '../utils/eventBus';
import { MatchPhase } from '../types/engine';
import type { Player } from '../types/player';

const PHASE_CLASS: Partial<Record<MatchPhase, string>> = {
  [MatchPhase.TryScored]:     'event-try',
  [MatchPhase.Penalty]:       'event-penalty',
  [MatchPhase.ConversionKick]:'event-conversion',
  [MatchPhase.Scrum]:         'event-scrum',
  [MatchPhase.Lineout]:       'event-lineout',
  [MatchPhase.KickOff]:       'event-kickoff',
  [MatchPhase.HalfTime]:      'event-halftime',
  [MatchPhase.FullTime]:      'event-fulltime',
};

const TAG_MAP: Partial<Record<MatchPhase, string>> = {
  [MatchPhase.TryScored]:     'TRY',
  [MatchPhase.Penalty]:       'PEN',
  [MatchPhase.ConversionKick]:'CON',
  [MatchPhase.Scrum]:         'SCR',
  [MatchPhase.Lineout]:       'LNO',
  [MatchPhase.KickOff]:       'KO',
  [MatchPhase.BoxKick]:       'KICK',
  [MatchPhase.TacticalKick]:  'KICK',
  [MatchPhase.HalfTime]:      'HT',
  [MatchPhase.FullTime]:      'FT',
};

const MAX_ENTRIES = 30;

function colorizePlayer(text: string, player: Player, color: string): string {
  const label = `${player.name} (#${player.squadNumber})`;
  return text.split(label).join(`<span style="color:${color};font-weight:700">${label}</span>`);
}

export function initCommentaryFeed(): void {
  const feed = document.getElementById('commentary-feed')!;

  let homeColor = '';
  let awayColor = '';
  let homePlayerNames: Set<string> | null = null;

  // One-shot: team colours and rosters are fixed for the match lifetime.
  const unsubTeams = eventBus.on('engine:stateChange', ({ state }) => {
    homeColor = state.homeTeam.color;
    awayColor = state.awayTeam.color;
    homePlayerNames = new Set([
      ...state.homeTeam.players.map(p => p.name),
      ...state.homeTeam.bench.map(p => p.name),
    ]);
    unsubTeams();
  });

  eventBus.on('engine:event', ({ event }) => {
    const entry = document.createElement('div');
    const phaseClass = PHASE_CLASS[event.phase] ?? '';
    entry.className = `commentary-entry possession-${event.side} ${phaseClass}`.trim();

    const minute = Math.floor(event.gameMinute);
    const tag    = TAG_MAP[event.phase] ?? '·';
    let html = event.commentary;

    if (homePlayerNames) {
      for (const player of [event.primaryPlayer, event.secondaryPlayer]) {
        if (!player) continue;
        const color = homePlayerNames.has(player.name) ? homeColor : awayColor;
        html = colorizePlayer(html, player, color);
      }
    }

    entry.innerHTML =
      `<span class="event-minute">${minute}′</span>` +
      `<span class="event-tag">${tag}</span>` +
      `<span class="event-text">${html}</span>`;

    feed.insertBefore(entry, feed.firstChild);

    while (feed.children.length > MAX_ENTRIES && feed.lastChild) {
      feed.removeChild(feed.lastChild);
    }
  });
}
