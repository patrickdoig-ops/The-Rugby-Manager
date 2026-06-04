// In-season control centre. Sits in the navigation flow as
//   Home → Team Selector → Hub → PreMatch → Match → Result → Hub.
//
// This module renders the Hub shell and reacts to game-engine events; it is
// NOT wired into main.ts's flow in this change. Callers pass no-op callbacks
// for the six nav tiles and the settings cog; only the primary CTA
// (`onPlayMatch`) is exercisable in this iteration.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { Fixture, FixtureResult, GameState } from '../types/gameState';
import { eventBus } from '../utils/eventBus';
import { sortStandings } from '../game/leagueTable';
import { computeOverallRating } from '../team/teamProfile';
import { formAdjustment, matchSpread, HOME_ADVANTAGE_PTS, recentForm } from '../game/teamStats';
import { EXPIRING_CONTRACT_WINDOW_MONTHS } from '../engine/balance/transfers';
import { buildAssistantReport } from '../game/inbox';
import { countUnread } from './inboxRead';
import { loadDismissed } from './inboxDismiss';
import { ROUND_LABELS } from '../engine/balance/season';
import { renderFormPipStrip } from './components/formPip';
import { injectTeamColors } from './teamColors';

export interface InitHubScreenOpts {
  // Always called fresh — the GameCoordinator reference can swap when the
  // user does New Game → Home → New Game / Continue. Capturing the
  // engine at init time would freeze the screen to the first game.
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onPlayMatch: (homeTeam: RawTeamInput, awayTeam: RawTeamInput, playerSide: 'home' | 'away', round: number) => void;
  // Entry into the playoff stage chain. Called when the regular season
  // is over and state.league.playoffs is active. main.ts decides what to
  // show next (PlayoffBracketScreen with sim CTA, or PreMatch for the
  // player's next playoff match).
  onPlayoffs:  () => void;
  onSquad:     () => void;
  onFixtures:  () => void;
  onLeague:    () => void;
  onTraining:  () => void;
  onContractsAndTransfers: () => void;
  onClub:      () => void;
  onSettings:  () => void;
  onInbox:     () => void;
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// "2025-09-17" → "17 SEP"
function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${dd} ${MONTH_ABBR[d.getUTCMonth()]}`;
}

function crestHtml(team: RawTeamInput, klass: string): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  const glow = `box-shadow: 0 0 18px color-mix(in oklch, ${team.color} 40%, transparent), inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 20px rgba(0,0,0,0.5);`;
  return `<div class="${klass}" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent);${glow}"><span>${initial}</span></div>`;
}

// Heroicons outline 28×28, stroke-width 1.5. Path strings are
// reproduced inline (rather than via an SVG sprite) to match the existing
// convention used elsewhere (HomeScreen, FixtureListScreen, TeamInfoScreen).
const TILE_ICONS: Record<string, string> = {
  squad:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/></svg>`,
  fixtures:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z"/></svg>`,
  league:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"/></svg>`,
  training:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>`,
  contractsTransfers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.193.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z"/></svg>`,
  club: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>`,
};

interface TileSpec {
  id: string;
  ariaLabel: string;
  label: string;
  iconKey: keyof typeof TILE_ICONS;
  handlerKey: 'onSquad' | 'onFixtures' | 'onLeague' | 'onTraining' | 'onContractsAndTransfers' | 'onClub';
  stub?: boolean;
  sub?: string;
}

const TILES: TileSpec[] = [
  { id: 'hub-tile-squad',                ariaLabel: 'Squad selector',           label: 'Squad',                  iconKey: 'squad',               handlerKey: 'onSquad' },
  { id: 'hub-tile-fixtures',             ariaLabel: 'Fixture list',             label: 'Fixtures',               iconKey: 'fixtures',             handlerKey: 'onFixtures' },
  { id: 'hub-tile-league',               ariaLabel: 'League',                   label: 'League',                 iconKey: 'league',               handlerKey: 'onLeague' },
  { id: 'hub-tile-training',             ariaLabel: 'Training',                 label: 'Training',               iconKey: 'training',             handlerKey: 'onTraining' },
  { id: 'hub-tile-contracts-transfers',  ariaLabel: 'Contracts and transfers',  label: 'Contracts &amp; Transfers',  iconKey: 'contractsTransfers',   handlerKey: 'onContractsAndTransfers' },
  { id: 'hub-tile-club',                 ariaLabel: 'Club',                     label: 'Club',                   iconKey: 'club',                 handlerKey: 'onClub' },
];

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

export function initHubScreen(opts: InitHubScreenOpts): { refresh: () => void } {
  const el = document.getElementById('hub');
  if (!el) return { refresh: () => {} };

  const teamsById = new Map(opts.allTeams.map(t => [t.id, t]));

  let lastState: GameState | undefined;

  function render(state: GameState): void {
    lastState = state;
    const playerTeam = teamsById.get(state.player.teamId);
    if (!playerTeam) return;

    const nextFixture = opts.getGameEngine().getCurrentFixture();
    // The bracket exists from the moment the final regular-round fixture
    // resolves until SEASON_ROLLED_OVER clears it. While it exists, the
    // "Go to next match" CTA is replaced with "Continue to playoffs",
    // which enters the playoff orchestrator (sim AI matches, play the
    // player's next match, or route into the end-of-season chain when
    // the champion has been crowned).
    const playoffs = state.league.playoffs;
    const playoffsActive = playoffs !== null;
    const playerPlayoffMatch = playoffsActive ? opts.getGameEngine().getPlayerPlayoffMatch() : null;

    const sorted = sortStandings(state.league.standings);
    const rankIdx = sorted.findIndex(s => s.teamId === playerTeam.id);
    const standing = rankIdx >= 0 ? sorted[rankIdx] : null;
    const rank = rankIdx + 1;

    const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
    const pct = totalRounds > 0 ? (state.calendar.week / totalRounds) * 100 : 0;
    const injuredCount = countInjured(state);
    const expiringCount = countExpiringContracts(state);
    const lastRes = lastPlayerResult(playerTeam.id, state.league.results);
    const poachThreatCount = (state.career.activePoachedIds ?? []).length;
    const tileBadgeCount: Record<string, number> = {
      'hub-tile-squad':               injuredCount,
      'hub-tile-contracts-transfers': expiringCount + poachThreatCount,
    };

    el!.innerHTML = `
      <div id="hub-topbar">
        <button id="hub-settings" aria-label="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.094c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </button>
      </div>

      <div id="hub-hero">
        <h1 id="hub-team-name">${playerTeam.name}</h1>
        <div id="hub-standing">
          <div class="hub-standing-item">
            <span class="hub-standing-val" style="color:${playerTeam.color}">${rank > 0 ? rank + ordinalSuffix(rank) : '—'}</span>
            <span class="hub-standing-label">Position</span>
          </div>
          <div class="hub-standing-item">
            <span class="hub-standing-val hub-standing-val--chalk">${standing?.leaguePoints ?? 0}</span>
            <span class="hub-standing-label">Points</span>
          </div>
          <div class="hub-standing-item">
            <span class="hub-standing-val hub-standing-val--chalk hub-standing-val--record">${standing?.won ?? 0}W–${standing?.lost ?? 0}L</span>
            <span class="hub-standing-label">Record</span>
          </div>
          ${lastRes ? `
          <div class="hub-standing-item">
            <span class="hub-standing-val hub-standing-val--last hub-standing-val--${lastRes.outcome}">${lastRes.outcome === 'win' ? 'W' : lastRes.outcome === 'loss' ? 'L' : 'D'} ${lastRes.score}</span>
            <span class="hub-standing-label">Last</span>
          </div>` : ''}
        </div>
        <div id="hub-meta">
          <div id="hub-eyebrow">${state.calendar.seasonLabel}</div>
          <div id="hub-progress-wrap">
            <span class="hub-progress-wk">WK ${state.calendar.week}</span>
            <div id="hub-progress"><div id="hub-progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
            <span class="hub-progress-total">R${totalRounds}</span>
          </div>
        </div>
      </div>

      ${playoffsActive
        ? playoffsHtml(playoffs!, teamsById, playerTeam.id, playerPlayoffMatch)
        : nextMatchHtml(nextFixture, state, teamsById, playerTeam.id)}

      ${(() => {
          const sk = `${state.player.teamId}:${state.seed}`;
          const allInboxItems = buildAssistantReport(state, opts.allTeams);
          const dismissed = loadDismissed(sk);
          const inboxItems = allInboxItems.filter(i => !dismissed.has(i.id));
          const unread = countUnread(sk, inboxItems);
          const topItem = inboxItems[0];
          if (topItem) {
            const linkLabel: Record<string, string> = { squad: 'View squad', contracts: 'View contracts', transfers: 'View transfers', fixtures: 'View fixtures', league: 'View league' };
            return `
              <button id="hub-alert-banner" type="button">
                <span class="hub-inbox-head">
                  <span class="hub-inbox-title">Inbox</span>
                  <span class="hub-inbox-sub">${unread} need your attention</span>
                  ${unread > 0 ? `<span class="hub-inbox-count">${unread}</span>` : ''}
                </span>
                <span class="hub-inbox-row hub-inbox-row--${topItem.category}">
                  <span class="hub-inbox-dot" aria-hidden="true"></span>
                  <span class="hub-inbox-rowtext">
                    <span class="hub-inbox-subject">${topItem.subject}</span>
                    <span class="hub-inbox-meta">
                      <span class="hub-inbox-tag">${topItem.category}</span>
                      ${topItem.deepLink ? `<span class="hub-inbox-dotsep">·</span><span class="hub-inbox-link">${linkLabel[topItem.deepLink]}</span>` : ''}
                    </span>
                  </span>
                  <svg class="hub-inbox-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
                </span>
              </button>`;
          }
          return '<div id="hub-alert-banner" aria-hidden="true" style="visibility:hidden"></div>';
        })()}

      <div id="hub-grid">
        ${TILES.map(t => {
          const badge = tileBadgeCount[t.id] ?? 0;
          return `
          <button id="${t.id}" class="hub-tile${t.stub ? ' hub-tile--stub' : ''}" aria-label="${t.ariaLabel}"${t.stub ? ' disabled' : ''}>
            ${badge > 0 ? `<span class="notification-badge" aria-label="${badge} requiring attention">${badge}</span>` : ''}
            ${t.stub ? '<span class="hub-tile-soon">Coming</span>' : ''}
            <span class="hub-tile-label">${t.label}</span>
            ${t.sub ? `<span class="hub-tile-sub">${t.sub}</span>` : ''}
          </button>`;
        }).join('')}
      </div>

      <div id="hub-footer">${playoffsActive ? playoffFooterHtml(playoffs!, playerPlayoffMatch) : footerHtml(nextFixture)}</div>
    `;

    injectTeamColors(el!, playerTeam);

    el!.querySelector<HTMLButtonElement>('#hub-settings')!.addEventListener('click', () => opts.onSettings());
    el!.querySelector<HTMLButtonElement>('#hub-alert-banner')?.addEventListener('click', () => opts.onInbox());
    for (const t of TILES) {
      if (t.stub) continue;
      el!.querySelector<HTMLButtonElement>(`#${t.id}`)!.addEventListener('click', () => opts[t.handlerKey]());
    }
    if (playoffsActive) {
      el!.querySelector<HTMLButtonElement>('#hub-play-next')!.addEventListener('click', () => opts.onPlayoffs());
    } else if (nextFixture) {
      el!.querySelector<HTMLButtonElement>('#hub-play-next')!.addEventListener('click', () => {
        const home = teamsById.get(nextFixture.homeId)!;
        const away = teamsById.get(nextFixture.awayId)!;
        const playerSide: 'home' | 'away' = nextFixture.homeId === playerTeam.id ? 'home' : 'away';
        opts.onPlayMatch(home, away, playerSide, nextFixture.round);
      });
    }
  }

  function playoffsHtml(
    playoffs: import('../types/gameState').PlayoffState,
    byId: Map<string, RawTeamInput>,
    playerId: string,
    playerMatch: import('../types/gameState').PlayoffMatch | null,
  ): string {
    // Champion already crowned but the user hasn't been through the
    // end-of-season chain yet — surface that explicitly so the CTA is
    // self-explanatory.
    if (playoffs.championTeamId !== null) {
      const champion = byId.get(playoffs.championTeamId);
      if (champion) {
        return `
          <div id="hub-next-match">
            <div class="hub-nm-label">SEASON COMPLETE</div>
            <div class="hub-nm-fixture" style="justify-content:center">
              ${crestHtml(champion, 'nm-crest')}
              <span class="hub-nm-name">${champion.name} Champions</span>
            </div>
          </div>`;
      }
    }
    const stageLabel = playoffs.semifinals.every(m => m.result) ? 'FINAL' : 'SEMI-FINALS';
    const subline = playerMatch
      ? (playerMatch.kind === 'final'
          ? 'Season Final · Twickenham'
          : `Semi-Final · ${playerMatch.homeSeed} v ${playerMatch.awaySeed}`)
      : 'You are not in this stage';
    // Surface the player's pending match (if any), otherwise a static
    // "Playoffs in progress" card. Crests rendered only when both teams
    // are known.
    if (playerMatch && playerMatch.homeId && playerMatch.awayId) {
      const home = byId.get(playerMatch.homeId);
      const away = byId.get(playerMatch.awayId);
      if (!home || !away) return '';
      const isHome = playerMatch.homeId === playerId;
      const venueLabel = playerMatch.kind === 'final'
        ? 'NEUTRAL'
        : (isHome ? 'HOME' : 'AWAY');
      const venueName = playerMatch.kind === 'final'
        ? 'TWICKENHAM'
        : (isHome ? home : away).stadium.split('(')[0].trim().toUpperCase();
      return `
        <div id="hub-next-match">
          <div class="hub-nm-label">${stageLabel} · ${formatDateShort(playerMatch.date)}</div>
          <div class="hub-nm-fixture">
            <div class="hub-nm-side hub-nm-side--home${isHome ? ' hub-nm-side--me' : ''}">
              ${crestHtml(home, 'nm-crest')}
              <span class="hub-nm-name">${home.shortName}</span>
            </div>
            <span class="hub-nm-vs">vs</span>
            <div class="hub-nm-side hub-nm-side--away${!isHome ? ' hub-nm-side--me' : ''}">
              <span class="hub-nm-name">${away.shortName}</span>
              ${crestHtml(away, 'nm-crest')}
            </div>
          </div>
          <div class="hub-nm-meta">${venueLabel} · ${venueName}</div>
          <div class="hub-nm-subline">${subline}</div>
        </div>`;
    }
    return `
      <div id="hub-next-match">
        <div class="hub-nm-label">LEAGUE PLAYOFFS · ${stageLabel}</div>
        <div class="hub-nm-meta">${subline}</div>
      </div>`;
  }

  function playoffFooterHtml(
    playoffs: import('../types/gameState').PlayoffState,
    playerMatch: import('../types/gameState').PlayoffMatch | null,
  ): string {
    let label: string;
    if (playoffs.championTeamId !== null) {
      label = 'Continue';
    } else if (playerMatch && playerMatch.homeId && playerMatch.awayId) {
      label = playerMatch.kind === 'final' ? 'Play Final' : 'Play Semi-Final';
    } else {
      label = 'Continue';
    }
    return `
      <button id="hub-play-next" class="cta-pulse" aria-label="${label}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd"/></svg>
        <span>${label}</span>
      </button>`;
  }

  function nextMatchHtml(fixture: Fixture | null, state: GameState, byId: Map<string, RawTeamInput>, playerId: string): string {
    if (!fixture) {
      return `<div id="hub-next-match"><div class="hub-nm-complete">Season complete</div></div>`;
    }
    const home = byId.get(fixture.homeId);
    const away = byId.get(fixture.awayId);
    if (!home || !away) return '';
    const playerHome = fixture.homeId === playerId;
    const venueLabel = playerHome ? 'HOME' : 'AWAY';
    const venueName = (fixture.venue ?? home.stadium.split('(')[0].trim()).toUpperCase();

    const homeStanding = state.league.standings.find(s => s.teamId === home.id);
    const awayStanding = state.league.standings.find(s => s.teamId === away.id);
    const homeEffective = computeOverallRating(home.id)
      + HOME_ADVANTAGE_PTS
      + formAdjustment(homeStanding, state.league.standings);
    const awayEffective = computeOverallRating(away.id)
      + formAdjustment(awayStanding, state.league.standings);
    const spread = matchSpread(homeEffective, awayEffective);
    const spreadIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.94"/></svg>`;
    let spreadLabel: string;
    if (spread.home === 0) {
      spreadLabel = 'Even contest';
    } else if (spread.home < 0) {
      spreadLabel = `${spreadIcon}<span>${home.shortName} favoured · ${-spread.home} pts</span>`;
    } else {
      spreadLabel = `${spreadIcon}<span>${away.shortName} favoured · ${spread.home} pts</span>`;
    }

    const homeFormHtml = renderFormPipStrip(recentForm(home.id, state.league.results), 'sm');
    const awayFormHtml = renderFormPipStrip(recentForm(away.id, state.league.results), 'sm');

    // Kick-off countdown — derived from fixture.date vs the user's
    // calendar.date. Hidden when the fixture has no date (legacy gen
    // fixtures fall back to +7d steps with no per-round dates).
    const kickoffChip = countdownChip(state.calendar.date, fixture.date);

    return `
      <div id="hub-next-match">
        <div class="hub-nm-label">
          <span>NEXT MATCH${ROUND_LABELS[fixture.round] ? ` · ${ROUND_LABELS[fixture.round].toUpperCase()}` : ''} · ${formatDateShort(state.calendar.date)}</span>
          ${kickoffChip}
        </div>
        <div class="hub-nm-fixture">
          <div class="hub-nm-side hub-nm-side--home${playerHome ? ' hub-nm-side--me' : ''}">
            ${crestHtml(home, 'nm-crest')}
            <div class="hub-nm-side-info">
              <span class="hub-nm-name">${home.shortName}</span>
              ${homeFormHtml}
            </div>
          </div>
          <span class="hub-nm-vs">vs</span>
          <div class="hub-nm-side hub-nm-side--away${!playerHome ? ' hub-nm-side--me' : ''}">
            <div class="hub-nm-side-info">
              <span class="hub-nm-name">${away.shortName}</span>
              ${awayFormHtml}
            </div>
            ${crestHtml(away, 'nm-crest')}
          </div>
        </div>
        <div class="hub-nm-meta">${venueLabel} · ${venueName}${fixture.venueCapacity ? ` · ${fixture.venueCapacity.toLocaleString()}` : ''}</div>
        <div class="hub-nm-spread">${spreadLabel}</div>
      </div>
    `;
  }

  function countdownChip(todayIso: string, fixtureDate: string | undefined): string {
    if (!fixtureDate) return '';
    const today = new Date(todayIso).getTime();
    const target = new Date(fixtureDate).getTime();
    if (isNaN(today) || isNaN(target)) return '';
    const days = Math.round((target - today) / 86_400_000);
    if (days < 0) return '';
    let label: string;
    if (days === 0) label = 'TODAY';
    else if (days === 1) label = 'TOMORROW';
    else label = `IN ${days} DAYS`;
    return `<span class="hub-nm-countdown">${label}</span>`;
  }

  function footerHtml(fixture: Fixture | null): string {
    if (!fixture) {
      return `<p id="hub-season-done">Season complete</p>`;
    }
    return `
      <button id="hub-play-next" class="cta-pulse" aria-label="Go to next match">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd"/></svg>
        <span>Go to next match</span>
      </button>
    `;
  }

  // Count of currently injured roster players on the player's club. Pure
  // walk over state.career.roster — cheap (≈30 players) and refreshes on
  // every render. Returns 0 when there's no career roster yet.
  function countInjured(state: GameState): number {
    const club = state.career.clubs.find(c => c.id === state.player.teamId);
    if (!club) return 0;
    let n = 0;
    for (const rid of club.squad) {
      if (state.career.roster[rid]?.injury) n++;
    }
    return n;
  }

  // Count of the user's players whose contracts fall within the
  // expiry window (default 6 months) — surfaces on the Contracts tile
  // as a "act now" nudge. Pre-agreed Reg 7 leavers are excluded
  // because the user can't act on them.
  function countExpiringContracts(state: GameState): number {
    const club = state.career.clubs.find(c => c.id === state.player.teamId);
    if (!club) return 0;
    const today = new Date(state.calendar.date);
    const leaving = new Set(
      state.career.pendingMoves
        .filter(m => m.toClubId !== state.player.teamId)
        .map(m => m.rosterId),
    );
    let n = 0;
    for (const rid of club.squad) {
      if (leaving.has(rid)) continue;
      const p = state.career.roster[rid];
      const expiresOn = p?.contract.expiresOn;
      if (!expiresOn) continue;
      const exp = new Date(expiresOn);
      const monthsAhead = (exp.getUTCFullYear() - today.getUTCFullYear()) * 12
                        + (exp.getUTCMonth() - today.getUTCMonth());
      if (monthsAhead >= 0 && monthsAhead <= EXPIRING_CONTRACT_WINDOW_MONTHS) n++;
    }
    return n;
  }

  function lastPlayerResult(teamId: string, results: FixtureResult[]): { outcome: 'win' | 'draw' | 'loss'; score: string } | null {
    for (let i = results.length - 1; i >= 0; i--) {
      const r = results[i];
      if (r.homeId !== teamId && r.awayId !== teamId) continue;
      const isHome = r.homeId === teamId;
      const my = isHome ? r.homeScore : r.awayScore;
      const opp = isHome ? r.awayScore : r.homeScore;
      return { outcome: my > opp ? 'win' : my < opp ? 'loss' : 'draw', score: `${my}–${opp}` };
    }
    return null;
  }

  // Re-render whenever the season state changes — date, week, next-fixture
  // and the disabled-CTA state all derive from GameState.
  eventBus.on('game:initialized',     ({ state }) => render(state));
  eventBus.on('game:fixtureRecorded', ({ state }) => render(state));
  eventBus.on('game:weekAdvanced',    ({ state }) => render(state));
  eventBus.on('game:trainingApplied', ({ state }) => render(state));
  eventBus.on('game:bracketSeeded',   ({ state }) => render(state));
  eventBus.on('game:playoffsUpdated', ({ state }) => render(state));
  eventBus.on('game:seasonRolledOver',({ state }) => render(state));

  render(opts.getGameEngine().getState());

  return { refresh: () => { if (lastState) render(lastState); } };
}
