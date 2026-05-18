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
  [MatchPhase.Substitution]:  'event-sub',
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
  [MatchPhase.Substitution]:  'SUB',
};

const MAX_ENTRIES = 30;

function colorizePlayer(text: string, player: Player, color: string): string {
  const label = `${player.name} (#${player.squadNumber})`;
  return text.split(label).join(`<span style="color:${color};font-weight:700">${label}</span>`);
}

export function initCommentaryFeed(): void {
  const feed = document.getElementById('commentary-feed')!;

  let allPlayersWithColor: Array<{ player: Player; color: string }> = [];
  let homeTeamName = '';
  let awayTeamName = '';
  let homeTeamColor = '';
  let awayTeamColor = '';

  // One-shot: team colours and rosters are fixed for the match lifetime.
  const unsubTeams = eventBus.on('engine:stateChange', ({ state }) => {
    homeTeamColor = state.homeTeam.color;
    awayTeamColor = state.awayTeam.color;
    homeTeamName  = state.homeTeam.name;
    awayTeamName  = state.awayTeam.name;
    allPlayersWithColor = [
      ...[...state.homeTeam.players, ...state.homeTeam.bench].map(p => ({ player: p, color: homeTeamColor })),
      ...[...state.awayTeam.players, ...state.awayTeam.bench].map(p => ({ player: p, color: awayTeamColor })),
    ];
    unsubTeams();
  });

  eventBus.on('engine:event', ({ event }) => {
    if (!event.commentary.trim()) return;

    const entry = document.createElement('div');
    const phaseClass = PHASE_CLASS[event.phase] ?? '';
    entry.className = `commentary-entry possession-${event.side} ${phaseClass}`.trim();

    const minute = Math.floor(event.gameMinute);
    const tag    = TAG_MAP[event.phase] ?? '·';
    let html = event.commentary;

    for (const { player, color } of allPlayersWithColor) {
      html = colorizePlayer(html, player, color);
    }

    if (homeTeamName) html = html.split(homeTeamName).join(`<span style="color:${homeTeamColor};font-weight:600">${homeTeamName}</span>`);
    if (awayTeamName) html = html.split(awayTeamName).join(`<span style="color:${awayTeamColor};font-weight:600">${awayTeamName}</span>`);

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
