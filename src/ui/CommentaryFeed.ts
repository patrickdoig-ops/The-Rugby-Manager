import { eventBus } from '../utils/eventBus';
import { MatchPhase } from '../types/engine';

const PHASE_CLASS: Partial<Record<MatchPhase, string>> = {
  [MatchPhase.TryScored]:  'event-try',
  [MatchPhase.Penalty]:    'event-penalty',
  [MatchPhase.Scrum]:      'event-scrum',
  [MatchPhase.Lineout]:    'event-lineout',
  [MatchPhase.HalfTime]:   'event-halftime',
  [MatchPhase.FullTime]:   'event-fulltime',
};

const MAX_ENTRIES = 30;

export function initCommentaryFeed(): void {
  const feed = document.getElementById('commentary-feed')!;

  eventBus.on('engine:event', ({ event }) => {
    const entry = document.createElement('div');
    entry.className = `commentary-entry ${PHASE_CLASS[event.phase] ?? ''}`;

    const minute = Math.floor(event.gameMinute);
    entry.innerHTML = `<span class="event-minute">${minute}'</span> ${event.commentary}`;
    feed.insertBefore(entry, feed.firstChild);

    while (feed.children.length > MAX_ENTRIES) {
      feed.removeChild(feed.lastChild!);
    }
  });
}
