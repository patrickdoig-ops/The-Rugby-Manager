// In-season control centre. Sits in the navigation flow as
//   Home → Team Selector → Hub → PreMatch → Match → Result → Hub.
//
// This module renders the Hub shell and reacts to game-engine events. It is
// fully wired into main.ts's flow via initInSeasonScreens — the six nav
// tiles, the settings cog, and the primary CTA (`onContinue`) all receive
// live callbacks.

import type { GameCoordinator, EuropeanRoundRef } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { GameState } from '../types/gameState';
import { eventBus } from '../utils/eventBus';
import { onScreenShow } from './ScreenRouter';
import { recentForm } from '../game/teamStats';
import { EXPIRING_CONTRACT_WINDOW_MONTHS } from '../engine/balance/transfers';
import { buildAssistantReport } from '../game/inbox';
import { countUnread } from './inboxRead';
import { loadDismissed } from './inboxDismiss';
import { ROUND_LABELS } from '../engine/balance/season';
import { renderFormPipStrip } from './components/formPip';
import { injectTeamColors } from './teamColors';
import { formatDateMedium } from '../utils/formatDate';
import { helpButtonHtml } from './help/helpButton';

export interface InitHubScreenOpts {
  // Always called fresh — the GameCoordinator reference can swap when the
  // user does New Game → Home → New Game / Continue. Capturing the
  // engine at init time would freeze the screen to the first game.
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  // Single unified "Continue" CTA. Advances the game by one step regardless of
  // competition — main.ts dispatches to the league / League Cup / European /
  // playoff flow based on what's next. The Hub no longer carries
  // per-competition calls-to-action; the button always reads "Continue".
  onContinue: () => void;
  onSquad:     () => void;
  onTactics:   () => void;
  onCompetitions: () => void;
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
  tactics:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"/></svg>`,
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
  handlerKey: 'onSquad' | 'onTactics' | 'onCompetitions' | 'onTraining' | 'onContractsAndTransfers' | 'onClub';
  stub?: boolean;
  sub?: string;
}

const TILES: TileSpec[] = [
  { id: 'hub-tile-squad',                ariaLabel: 'Squad selector',           label: 'Squad',                  iconKey: 'squad',               handlerKey: 'onSquad' },
  { id: 'hub-tile-tactics',              ariaLabel: 'Tactics',                  label: 'Tactics',                iconKey: 'tactics',              handlerKey: 'onTactics' },
  { id: 'hub-tile-competitions',          ariaLabel: 'Competitions',             label: 'Competitions',           iconKey: 'league',               handlerKey: 'onCompetitions' },
  { id: 'hub-tile-training',             ariaLabel: 'Training',                 label: 'Training',               iconKey: 'training',             handlerKey: 'onTraining' },
  { id: 'hub-tile-contracts-transfers',  ariaLabel: 'Contracts and transfers',  label: 'Contracts &amp; Transfers',  iconKey: 'contractsTransfers',   handlerKey: 'onContractsAndTransfers' },
  { id: 'hub-tile-club',                 ariaLabel: 'Club',                     label: 'Club',                   iconKey: 'club',                 handlerKey: 'onClub' },
];

// Normalised descriptor for the Hub's Next Match tile — every competition is
// reduced to this shape so the tile renders identically (league format) each
// week, differing only by the colour-coded competition chip.
interface NextMatchInfo {
  homeId: string;
  awayId: string;
  compKey: 'league' | 'cup' | 'europeanCup' | 'europeanShield' | 'playoff';
  stageLabel: string;
  venue?: string;
  neutralVenue?: boolean;
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
    // League Cup activity (pre-season block or an Autumn / Six Nations break)
    // takes priority over the next league fixture — the cup game-weeks run in
    // the gap before the next league round.
    const cupStep = opts.getGameEngine().getCupBreakStep();
    const cupFixture = cupStep === 'play_fixture' ? opts.getGameEngine().getCurrentCupFixture() : null;
    // European fixture due before the next league match (calendar gate: fixture
    // date ≤ calendar.date). Also check for unshown rounds (when player is
    // eliminated or watching). Takes priority over league CTA when present.
    const europeanFixture = opts.getGameEngine().getCurrentEuropeanFixture();
    const europeanRound = !europeanFixture ? opts.getGameEngine().getCurrentEuropeanRound() : null;
    // The bracket exists from the moment the final regular-round fixture
    // resolves until SEASON_ROLLED_OVER clears it. While it exists, the
    // "Go to next match" CTA is replaced with "Continue to playoffs",
    // which enters the playoff orchestrator (sim AI matches, play the
    // player's next match, or route into the end-of-season chain when
    // the champion has been crowned).
    const playoffs = state.league.playoffs;
    const playoffsActive = playoffs !== null;
    const playerPlayoffMatch = playoffsActive ? opts.getGameEngine().getPlayerPlayoffMatch() : null;

    const injuredCount = countInjured(state);
    const expiringCount = countExpiringContracts(state);
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
        ${helpButtonHtml('hub')}
      </div>

      <div id="hub-hero">
        <h1 id="hub-team-name">${playerTeam.name}</h1>
      </div>

      <div id="hub-date" style="text-align:center;color:#9aa0a6;font-size:0.85rem;margin:0 0 0.6rem">${formatDateMedium(state.calendar.date)}</div>

      ${(() => {
          const myId = playerTeam.id;
          // Priority: playoffs → League Cup → European → league. Every actual
          // fixture renders through the one shared tile; non-match states
          // (recaps, returns, season complete) get a simple status card.
          if (playoffsActive) {
            if (playoffs!.championTeamId !== null) {
              const champ = teamsById.get(playoffs!.championTeamId);
              return champ ? statusCardHtml('SEASON COMPLETE', `${champ.name} Champions`) : '';
            }
            if (playerPlayoffMatch && playerPlayoffMatch.homeId && playerPlayoffMatch.awayId) {
              const isFinal = playerPlayoffMatch.kind === 'final';
              return nextMatchTileHtml({
                homeId: playerPlayoffMatch.homeId, awayId: playerPlayoffMatch.awayId,
                compKey: 'playoff',
                stageLabel: isFinal ? 'Final' : 'Semi-Final',
                neutralVenue: isFinal,
                venue: isFinal ? 'Twickenham' : undefined,
              }, state, teamsById, myId);
            }
            const stage = playoffs!.semifinals.every(m => m.result) ? 'Final' : 'Semi-Finals';
            return statusCardHtml(`PLAYOFFS · ${stage}`, 'You are not in this stage');
          }
          if (cupStep) {
            if (cupStep === 'play_fixture' && cupFixture) {
              const homeId = cupFixture.kind === 'pool' ? cupFixture.fixture.homeId : (cupFixture.match.homeId ?? '');
              const awayId = cupFixture.kind === 'pool' ? cupFixture.fixture.awayId : (cupFixture.match.awayId ?? '');
              const isFinal = cupFixture.kind === 'knockout' && cupFixture.stage === 'final';
              const stageLabel = cupFixture.kind === 'knockout' ? (isFinal ? 'Final' : 'Semi-Final') : 'Pool Stage';
              return nextMatchTileHtml({ homeId, awayId, compKey: 'cup', stageLabel, neutralVenue: isFinal }, state, teamsById, myId);
            }
            const blockName = state.league.results.length === 0 ? 'Pre-Season' : 'International Break';
            const line = cupStep === 'resolve_returns' ? 'Internationals returning' : 'Cup results';
            return statusCardHtml(`LEAGUE CUP · ${blockName}`, line);
          }
          if (europeanFixture) {
            const ef = europeanFixture;
            const compKey: NextMatchInfo['compKey'] = ef.competition === 'europeanCup' ? 'europeanCup' : 'europeanShield';
            let homeId: string, awayId: string, stageLabel: string, isFinal = false;
            if (ef.kind === 'pool') {
              homeId = ef.fixture.homeId; awayId = ef.fixture.awayId;
              stageLabel = `Pool Round ${ef.fixture.round}`;
            } else {
              homeId = ef.match.homeId ?? ''; awayId = ef.match.awayId ?? '';
              isFinal = ef.stage === 'final';
              stageLabel = ef.stage === 'r16' ? 'Round of 16' : ef.stage === 'quarterfinal' ? 'Quarter-Final' : ef.stage === 'semifinal' ? 'Semi-Final' : 'Final';
            }
            return nextMatchTileHtml({ homeId, awayId, compKey, stageLabel, neutralVenue: isFinal }, state, teamsById, myId);
          }
          if (europeanRound) return europeanRoundCtaHtml(europeanRound);
          if (nextFixture) {
            return nextMatchTileHtml({
              homeId: nextFixture.homeId, awayId: nextFixture.awayId,
              compKey: 'league',
              stageLabel: ROUND_LABELS[nextFixture.round] ?? `Round ${nextFixture.round}`,
              venue: nextFixture.venue,
            }, state, teamsById, myId);
          }
          return `<div id="hub-next-match"><div class="hub-nm-complete">Season complete</div></div>`;
        })()}

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

      <div id="hub-footer">${continueFooterHtml()}</div>
    `;

    injectTeamColors(el!, playerTeam);

    el!.querySelector<HTMLButtonElement>('#hub-settings')!.addEventListener('click', () => opts.onSettings());
    el!.querySelector<HTMLButtonElement>('#hub-alert-banner')?.addEventListener('click', () => opts.onInbox());
    for (const t of TILES) {
      if (t.stub) continue;
      el!.querySelector<HTMLButtonElement>(`#${t.id}`)!.addEventListener('click', () => opts[t.handlerKey]());
    }
    el!.querySelector<HTMLButtonElement>('#hub-play-next')?.addEventListener('click', () => opts.onContinue());
  }

  // The Hub's one and only call-to-action. Always reads "Continue" — the
  // competition-specific preview lives in the panel above; the button is
  // uniform across league / League Cup / European / playoff so every game
  // week feels the same. main.ts's onContinue dispatches to the right flow.
  function continueFooterHtml(): string {
    return `
      <button id="hub-play-next" class="cta-pulse" aria-label="Continue">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd"/></svg>
        <span>Continue</span>
      </button>`;
  }

  // Competition chip — colour-coded by competition, shown top-right of the
  // Next Match tile in place of a days-away countdown so the tile reads the
  // same every week regardless of which competition is next.
  const COMP_CHIP: Record<NextMatchInfo['compKey'], { label: string; color: string }> = {
    league:         { label: 'LEAGUE',          color: '#1f9d4d' },
    cup:            { label: 'LEAGUE CUP',      color: '#c8821a' },
    europeanCup:    { label: 'EUROPEAN CUP',    color: '#2f6fd0' },
    europeanShield: { label: 'EUROPEAN SHIELD', color: '#8a5fd0' },
    playoff:        { label: 'PLAYOFFS',        color: '#d23b3b' },
  };

  function compChip(key: NextMatchInfo['compKey']): string {
    const c = COMP_CHIP[key];
    return `<span class="hub-nm-countdown" style="background:${c.color};border-color:${c.color};color:#fff">${c.label}</span>`;
  }

  // Simple non-match status card (cup recap, internationals returning, season
  // complete, playoffs you're not in) — no fixture, so no tile / chip.
  function statusCardHtml(label: string, line: string): string {
    return `
      <div id="hub-next-match">
        <div class="hub-nm-label">${label}</div>
        <div class="hub-nm-body">
          <div class="hub-nm-fixture" style="justify-content:center;gap:0.5rem">
            <span class="hub-nm-name" style="font-size:1.05rem">${line}</span>
          </div>
        </div>
      </div>`;
  }

  // The single Next Match tile — used for every competition so the Hub looks
  // the same each week. League format: crests + recent-form pips + venue, with
  // a colour-coded competition chip (not a countdown) top-right.
  function nextMatchTileHtml(info: NextMatchInfo, state: GameState, byId: Map<string, RawTeamInput>, playerId: string): string {
    const home = byId.get(info.homeId);
    const away = byId.get(info.awayId);
    if (!home || !away) return '';
    const playerHome = info.homeId === playerId;
    const venueLabel = info.neutralVenue ? 'NEUTRAL' : (playerHome ? 'HOME' : 'AWAY');
    const venueName = (info.venue ?? (playerHome ? home : away).stadium.split('(')[0].trim()).toUpperCase();
    const homeFormHtml = renderFormPipStrip(recentForm(home.id, state.league.results), 'sm');
    const awayFormHtml = renderFormPipStrip(recentForm(away.id, state.league.results), 'sm');
    return `
      <div id="hub-next-match">
        <div class="hub-nm-label">
          <span class="hub-nm-title">Next Match</span>
          <span class="hub-nm-sub">${info.stageLabel} · ${formatDateShort(state.calendar.date)}</span>
          ${compChip(info.compKey)}
        </div>
        <div class="hub-nm-body">
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
          <div class="hub-nm-meta">${venueLabel} · ${venueName}</div>
        </div>
      </div>
    `;
  }

  function europeanRoundCtaHtml(rr: EuropeanRoundRef): string {
    return `
      <div class="hub-euro-round">
        <div class="hub-euro-round-label">${rr.compLabel}</div>
        <div class="hub-euro-round-sub">${rr.isFinal ? 'The Final has been played' : `${rr.label} results are in`}</div>
      </div>`;
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

  // Re-render whenever the season state changes — date, week, next-fixture
  // and the disabled-CTA state all derive from GameState. Hidden-screen
  // renders are deferred: mark dirty and replay on the next hub show.
  let needsRender = false;
  const renderOrDefer = (state: GameState): void => {
    if (el.offsetParent !== null) {
      render(state);
    } else {
      lastState = state;
      needsRender = true;
    }
  };
  eventBus.on('game:initialized',     ({ state }) => renderOrDefer(state));
  eventBus.on('game:fixtureRecorded', ({ state }) => renderOrDefer(state));
  eventBus.on('game:weekAdvanced',    ({ state }) => renderOrDefer(state));
  eventBus.on('game:trainingApplied', ({ state }) => renderOrDefer(state));
  eventBus.on('game:bracketSeeded',   ({ state }) => renderOrDefer(state));
  eventBus.on('game:playoffsUpdated', ({ state }) => renderOrDefer(state));
  eventBus.on('game:seasonRolledOver',({ state }) => renderOrDefer(state));
  onScreenShow(id => {
    if (id === 'hub' && needsRender && lastState) {
      needsRender = false;
      render(lastState);
    }
  });

  render(opts.getGameEngine().getState());

  return { refresh: () => { needsRender = false; if (lastState) render(lastState); } };
}
