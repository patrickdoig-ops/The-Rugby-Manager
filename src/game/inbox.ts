import type { GameState } from '../types/gameState';
import type { RawTeamInput } from '../types/teamData';
import { EXPIRING_CONTRACT_WINDOW_MONTHS } from '../engine/balance/transfers';
import { playoffRaceStatus } from './playoffRace';

export interface InboxItem {
  id: string;
  category: 'league' | 'medical' | 'transfers' | 'contracts' | 'match';
  priority: number;
  subject: string;
  body: string;
  deepLink?: 'squad' | 'contracts' | 'transfers' | 'fixtures' | 'league';
}

export function buildAssistantReport(state: GameState, allTeams: RawTeamInput[]): InboxItem[] {
  const items: InboxItem[] = [];
  const teamId = state.player.teamId;
  const season = state.calendar.seasonLabel;
  const club = state.career.clubs.find(c => c.id === teamId);
  if (!club) return [];

  // --- Injuries ---
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (!p?.injury) continue;
    const name = `${p.firstName} ${p.lastName}`;
    const weeks = p.injury.weeksRemaining;
    items.push({
      id: `inj:${season}:${rid}:${p.injury.injuredOn}`,
      category: 'medical',
      priority: 80,
      subject: `${name} is injured`,
      body: `${name} is out for approximately ${weeks} week${weeks !== 1 ? 's' : ''}. Check the squad for cover.`,
      deepLink: 'squad',
    });
  }

  // --- Expiring contracts ---
  const leaving = new Set(
    state.career.pendingMoves
      .filter(m => m.toClubId !== teamId)
      .map(m => m.rosterId),
  );
  const today = new Date(state.calendar.date);
  for (const rid of club.squad) {
    if (leaving.has(rid)) continue;
    const p = state.career.roster[rid];
    const expiresOn = p?.contract?.expiresOn;
    if (!expiresOn) continue;
    const exp = new Date(expiresOn);
    const monthsAhead = (exp.getUTCFullYear() - today.getUTCFullYear()) * 12
                      + (exp.getUTCMonth() - today.getUTCMonth());
    if (monthsAhead < 0 || monthsAhead > EXPIRING_CONTRACT_WINDOW_MONTHS) continue;
    const name = `${p.firstName} ${p.lastName}`;
    items.push({
      id: `con:${season}:${rid}`,
      category: 'contracts',
      priority: 40,
      subject: `${name}'s contract is expiring`,
      body: `${name}'s contract expires in ${monthsAhead} month${monthsAhead !== 1 ? 's' : ''}. Consider opening renewal talks.`,
      deepLink: 'contracts',
    });
  }

  // --- Poach threats ---
  for (const rid of (state.career.activePoachedIds ?? [])) {
    if (!club.squad.includes(rid)) continue;
    const p = state.career.roster[rid];
    if (!p) continue;
    const name = `${p.firstName} ${p.lastName}`;
    items.push({
      id: `poach:${season}:${rid}`,
      category: 'transfers',
      priority: 60,
      subject: `${name} is attracting interest`,
      body: `Rival clubs are monitoring ${name}. You may want to review their contract situation.`,
      deepLink: 'transfers',
    });
  }

  // --- Derby / big match preview ---
  const playedRounds = new Set(
    state.league.results
      .filter(r => r.homeId === teamId || r.awayId === teamId)
      .map(r => r.round),
  );
  const nextFixture = state.league.fixtures
    .filter(f => (f.homeId === teamId || f.awayId === teamId) && !playedRounds.has(f.round))
    .sort((a, b) => a.round - b.round)[0] ?? null;

  if (nextFixture?.isDerby) {
    const oppId = nextFixture.homeId === teamId ? nextFixture.awayId : nextFixture.homeId;
    const opp = allTeams.find(t => t.id === oppId);
    const oppName = opp?.name ?? 'your opponent';
    items.push({
      id: `match:${season}:r${nextFixture.round}`,
      category: 'match',
      priority: 20,
      subject: `Derby week — ${oppName}`,
      body: `Round ${nextFixture.round} is a Derby fixture against ${oppName}. These matches always carry extra intensity and pressure. Make sure the squad is ready.`,
      deepLink: 'fixtures',
    });
  }

  // --- Playoff race status ---
  if (state.league.playoffs === null && state.league.standings.length > 0) {
    const { securedTop4, securedTop2, eliminated } = playoffRaceStatus(state, teamId);
    if (eliminated) {
      items.push({
        id: `lg-out:${season}`,
        category: 'league',
        priority: 100,
        subject: 'Mathematically out of the playoffs',
        body: 'We can no longer finish in the top four. Focus on finishing the season strongly.',
        deepLink: 'league',
      });
    } else if (securedTop2) {
      items.push({
        id: `lg-secured2:${season}`,
        category: 'league',
        priority: 100,
        subject: 'Home semi-final secured',
        body: 'We are guaranteed to finish in the top two. A home semi-final awaits in the playoffs.',
        deepLink: 'league',
      });
    } else if (securedTop4) {
      items.push({
        id: `lg-secured4:${season}`,
        category: 'league',
        priority: 100,
        subject: 'Playoff place secured',
        body: 'We have mathematically secured a top-four finish. The playoffs are guaranteed.',
        deepLink: 'league',
      });
    }
  }

  return items.sort((a, b) => b.priority - a.priority);
}
