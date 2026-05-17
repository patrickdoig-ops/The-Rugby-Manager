import { eventBus } from '../utils/eventBus';
import { MatchPhase } from '../types/engine';
import type { Team } from '../types/team';
import type { Player } from '../types/player';

const PHASE_CLASS: Partial<Record<MatchPhase, string>> = {
  [MatchPhase.TryScored]:  'event-try',
  [MatchPhase.Penalty]:    'event-penalty',
  [MatchPhase.Scrum]:      'event-scrum',
  [MatchPhase.Lineout]:    'event-lineout',
  [MatchPhase.HalfTime]:   'event-halftime',
  [MatchPhase.FullTime]:   'event-fulltime',
};

const MAX_ENTRIES = 30;

function colorizePlayer(text: string, player: Player, color: string): string {
  const label = `${player.name} (#${player.id})`;
  return text.split(label).join(`<span style="color:${color};font-weight:700">${label}</span>`);
}

export function initCommentaryFeed(): void {
  const feed = document.getElementById('commentary-feed')!;

  let homeTeam: Team | null = null;
  let awayTeam: Team | null = null;

  eventBus.on('engine:stateChange', ({ state }) => {
    homeTeam = state.homeTeam;
    awayTeam = state.awayTeam;
  });

  eventBus.on('engine:event', ({ event }) => {
    const entry = document.createElement('div');
    entry.className = `commentary-entry possession-${event.side} ${PHASE_CLASS[event.phase] ?? ''}`;

    const minute = Math.floor(event.gameMinute);
    let html = event.commentary;

    if (homeTeam && awayTeam) {
      for (const player of [event.primaryPlayer, event.secondaryPlayer]) {
        if (!player) continue;
        const color = homeTeam.players.includes(player) ? homeTeam.color : awayTeam.color;
        html = colorizePlayer(html, player, color);
      }
    }

    entry.innerHTML = `<span class="event-minute">${minute}'</span> ${html}`;
    feed.insertBefore(entry, feed.firstChild);

    while (feed.children.length > MAX_ENTRIES) {
      feed.removeChild(feed.lastChild!);
    }
  });
}
