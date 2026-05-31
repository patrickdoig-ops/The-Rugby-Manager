// Self-hosted fonts (replaces the Google Fonts CDN <link> — works offline and
// resolves under the Capacitor origin). Only the weights/styles actually used.
import '@fontsource/anton/400.css';
import '@fontsource/geist-sans/300.css';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-sans/800.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';

import '../style/main.css';
import '../style/homescreen.css';
import '../style/settings.css';
import '../style/teamselector.css';
import '../style/teaminfo.css';
import '../style/fixturelist.css';
import '../style/leaguetable.css';
import '../style/leaguestats.css';
import '../style/hub.css';
import '../style/matchresult.css';
import '../style/roundresults.css';
import '../style/seasonrollover.css';
import '../style/contracts.css';
import '../style/squad.css';
import '../style/renewals.css';
import '../style/transfermarket.css';
import '../style/modepicker.css';
import '../style/squadoverview.css';
import '../style/commentary.css';
import '../style/stats.css';
import '../style/prematch.css';
import '../style/tactics.css';
import '../style/playoffbracket.css';
import '../style/signingresults.css';
import '../style/budgetreveal.css';
import '../style/training.css';
import '../style/training-results.css';
import '../style/player-profile.css';
import '../style/saves.css';
import '../style/achievements.css';

import { buildAppShell }           from './ui/AppShell';
import { preloadAllCues }          from './ui/SoundManager';
import { initAudioDirector }       from './ui/audio/AudioDirector';
import { initUiSounds }            from './ui/audio/uiSounds';
import { initHapticsDirector }     from './ui/haptics/HapticsDirector';
import { initScoreboard }          from './ui/Scoreboard';
import { initPitchStrip }          from './ui/PitchStrip';
import { initCommentaryFeed }      from './ui/CommentaryFeed';
import { initCrashOverlay }        from './ui/CrashOverlay';
import { initStatsPanel }          from './ui/StatsPanel';
import { initSimController }       from './ui/SimController';
import { initModalManager }        from './ui/ModalManager';
import { initPreMatchScreen, showPreMatchAtStep } from './ui/PreMatchScreen';
import { initHomeScreen }          from './ui/HomeScreen';
import { initSettingsScreen }      from './ui/SettingsScreen';
import { initSavesScreen }         from './ui/SavesScreen';
import { initTeamSelectorScreen }  from './ui/TeamSelectorScreen';
import { initTeamInfoScreen }      from './ui/TeamInfoScreen';
import { initFixtureListScreen }   from './ui/FixtureListScreen';
import { initLeagueTableScreen, showLeagueTable, showLeagueTablePostMatch } from './ui/LeagueTableScreen';
import { initLeagueMenuScreen } from './ui/LeagueMenuScreen';
import { initTeamStatsScreen, showTeamStats } from './ui/TeamStatsScreen';
import { initPlayerStatsScreen, showPlayerStats } from './ui/PlayerStatsScreen';
import { initPlayerProfileScreen, showPlayerProfile } from './ui/PlayerProfileScreen';
import { initHubScreen }           from './ui/HubScreen';
import { initMatchResultScreen }   from './ui/MatchResultScreen';
import { initRoundResultsScreen, showRoundResults } from './ui/RoundResultsScreen';
import { initPlayoffBracketScreen, showPlayoffBracket } from './ui/PlayoffBracketScreen';
import { initBudgetRevealScreen, showBudgetReveal } from './ui/BudgetRevealScreen';
import { initTakeoverRevealScreen, showTakeoverReveal, type TakeoverEntry } from './ui/TakeoverRevealScreen';
import { initEndOfSeasonScreen, showEndOfSeason }   from './ui/EndOfSeasonScreen';
import { initRenewalsScreen, showRenewals }         from './ui/RenewalsScreen';
import { initTransferMarketScreen, showTransferMarket, showTransferMarketMidseason, showTransferMarketPreSeason } from './ui/TransferMarketScreen';
import { initSigningResultsScreen, showSigningResults } from './ui/SigningResultsScreen';
import { initRetentionDecisionScreen, showRetentionDecision } from './ui/RetentionDecisionScreen';
import { initModePickerScreen }    from './ui/ModePickerScreen';
import { initSquadOverviewScreen, showSquadOverview } from './ui/SquadOverviewScreen';
import { PRE_SEASON_TRANSFERS_2025_26 } from './data/transfers-2025-26';
import { initRolloverScreen, showRollover }         from './ui/RolloverScreen';
import { initContractsScreen, showContracts, showContractsMarqueeEdit } from './ui/ContractsScreen';
import { initSquadManagementScreen, showSquadManagement } from './ui/SquadManagementScreen';
import { initTrainingScreen, showTrainingPostMatch, showTrainingMidweek } from './ui/TrainingScreen';
import { initPostTrainingResultsScreen, showPostTrainingResults } from './ui/PostTrainingResultsScreen';
import { initInternationalBreakScreen, showInternationalBreak } from './ui/InternationalBreakScreen';
import { initAchievementsScreen, showAchievements }  from './ui/AchievementsScreen';
import { initInboxScreen, markInboxRead } from './ui/InboxScreen';
import { initAchievementEngine }   from './achievements/AchievementEngine';
import { getGameCenter }           from './achievements/GameCenterBridge';
import { screenRouter }            from './ui/ScreenRouter';
import { loadSave, saveGame, clearSave } from './ui/SaveManager';
import { installBackupMirror, reconcileBackups } from './ui/saveBackup';
import { loadTickDelayMs }           from './ui/uiPrefs';
import { initTextScale }             from './ui/textScale';
import { MatchCoordinator }        from './engine/MatchCoordinator';
import type { RawTeamInput }       from './types/teamData';
import type { TeamTactics }        from './types/team';
import type { MatchState }         from './types/match';
import type { PlayoffMatch }       from './types/gameState';
import * as teamProfile            from './team/teamProfile';
import type { TeamJson }           from './team/teamProfile';
import { applyStarBoost }          from './team/applyStarBoost';
import { GameCoordinator }         from './game/GameCoordinator';
import { extractMatchdaySquad }    from './game/playerSquad';
import { buildTeamFromRoster, buildAutoSelectedTeamFromRoster } from './game/rosterTeamBuilder';
import { snapshotMatch }           from './game/seasonStatsCollector';
import { SEASON_VALUES, HOME_ADVANTAGE } from './engine/balance';
import { computeAttendance }        from './game/attendance';
import { generateSeed }            from './utils/rng';
import { eventBus }                from './utils/eventBus';
import { Capacitor }              from '@capacitor/core';
import { SplashScreen }           from '@capacitor/splash-screen';

import bathRaw         from './data/team-bath.json';
import bristolRaw      from './data/team-bristol.json';
import exeterRaw       from './data/team-exeter.json';
import gloucesterRaw   from './data/team-gloucester.json';
import harlequinsRaw   from './data/team-harlequins.json';
import leicesterRaw    from './data/team-leicester.json';
import newcastleRaw    from './data/team-newcastle.json';
import northamptonRaw  from './data/team-northampton.json';
import saleRaw         from './data/team-sale.json';
import saracensRaw     from './data/team-saracens.json';

const allTeamsRaw = ([
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as TeamJson[]).map(applyStarBoost);
const allTeams = allTeamsRaw as unknown as RawTeamInput[];

// Native (Capacitor) shell only: lock pinch / double-tap zoom and tag <html>
// so the wrapped app doesn't behave like a zoomable browser page. No-op on the
// web build, which keeps its accessible zoom.
function configureNativeShell(): void {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add('native-app');
  document.querySelector('meta[name="viewport"]')?.setAttribute(
    'content',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
  );
}

document.addEventListener('DOMContentLoaded', () => {
  configureNativeShell();
  initTextScale();            // accessibility text scale — before any render
  buildAppShell();
  preloadAllCues();
  initAudioDirector();
  initHapticsDirector();
  initUiSounds();
  initScoreboard();
  initPitchStrip();
  initCommentaryFeed();
  initStatsPanel();
  initModalManager();
  initCrashOverlay();

  teamProfile.init(allTeamsRaw);

  let gameEngine: GameCoordinator | null = null;
  // In-season screens (Hub, Fixtures, League) register permanent `game:*`
  // subscriptions at init time without an unsub seam. Running init more than
  // once per session (e.g. New Game → Home → Continue) would compound those
  // subscriptions and double-render on every game-state change. Gate the
  // init so it runs exactly once across the lifetime of the page.
  //
  // Each screen takes a `() => GameCoordinator` getter rather than the
  // engine reference itself, so the live `gameEngine` value reaches every
  // render — even when the user starts a fresh game and the reference
  // swaps without re-init.
  let inSeasonInited = false;
  const getGameEngine = (): GameCoordinator => {
    if (!gameEngine) throw new Error('gameEngine accessed before initialisation');
    return gameEngine;
  };
  let seasonCompletePending = false;
  // Latched on game:bracketSeeded so the post-final-regular-round
  // Continue chain detours through PlayoffBracketScreen rather than
  // straight back to Hub. Cleared once the chain enters runPlayoffStage.
  let bracketSeededPending = false;
  // Set after the player records a playoff result; cleared when the training
  // week shown before the next playoff match begins. Ensures players get a
  // full training week between each playoff match (SF → Final), matching the
  // regular-season rhythm.
  let playoffTrainingPending = false;

  // `direction` defaults to 'forward'. Back-paths (Settings → Home,
  // TeamSelector → Home, end-of-game → Home) pass 'back' to get the
  // FM-style edge slide in from the left.
  function goHome(direction: 'forward' | 'back' = 'back'): void {
    // Re-init so the Continue button state reflects the latest save (e.g. just
    // returned from a season the user is now resuming).
    initHomeScreen(() => goTeamSelector('forward'), continueGame, goSettingsFromHome, allTeams,
      () => goSaves(() => goHome('back')));
    screenRouter.show('home', { direction });
  }

  // Save-slot management. `onBack` returns to wherever the user came from
  // (Home, or Settings reached from Home / Hub). onLoad resumes the active
  // slot; onNewGame begins team selection in the (now-active) slot.
  function goSaves(onBack: () => void): void {
    initSavesScreen({
      allTeams,
      getGameEngine: () => gameEngine,
      onLoad: () => continueGame(),
      onNewGame: () => goTeamSelector('forward'),
      onBack,
    });
    screenRouter.show('saves', { direction: 'forward' });
  }

  function goSettingsFromHome(): void {
    initSettingsScreen(() => goHome('back'), () => goHome('back'),
      () => goSaves(goSettingsFromHome));
    screenRouter.show('settings');
  }

  function goSettingsFromHub(): void {
    initSettingsScreen(() => goHub('back'), () => goHome('back'),
      () => goSaves(goSettingsFromHub),
      () => {
        if (gameEngine) saveGame(gameEngine.toSavePayload());
        goHome('back');
      });
    screenRouter.show('settings');
  }

  function goTeamSelector(direction: 'forward' | 'back' = 'forward'): void {
    initTeamSelectorScreen(
      allTeams,
      onTeamPicked,
      () => goHome('back'),
      (team) => goTeamInfo(team, () => goTeamSelector('back')),
    );
    screenRouter.show('team-selector', { direction });
  }

  function goTeamInfo(team: RawTeamInput, onBack: () => void): void {
    const profile = teamProfile.getProfile(team.id);
    // Pre-game team browsing: use the season start date so ages line up with
    // what the player will see on the opening weekend.
    initTeamInfoScreen(profile, team, SEASON_VALUES.startDate, onBack);
    screenRouter.show('team-info');
  }

  // Mid-season entry into the TeamInfo screen from the League Table.
  // Reads the live calendar date so ages reflect the current point in
  // the season, and rebuilds the team from the career roster so the
  // squad list shows the actual current players (signings, retirements,
  // aging, injuries all reflected). `onBack` lets the caller choose
  // the return target — League Table, Team Stats, or Player Stats —
  // so each entry point hops back to the screen the user came from.
  function goTeamInfoMidSeason(team: RawTeamInput, onBack: () => void = goLeagueTable): void {
    if (!gameEngine) return;
    const profile = teamProfile.getProfile(team.id);
    const state = gameEngine.getState();
    const liveTeam = buildTeamFromRoster(state, team);
    // Row click → player profile, with back returning here.
    initTeamInfoScreen(profile, liveTeam, state.calendar.date, onBack, (rosterId) => {
      goPlayerProfile(rosterId, () => goTeamInfoMidSeason(team, onBack));
    });
    screenRouter.show('team-info');
  }

  // Initialise the three in-season screens (Hub, Fixtures, League) for the
  // current game engine instance. Done once per game so each screen registers
  // its game:* event subscriptions exactly once; later navigations between
  // them go through `screenRouter.show(...)` without re-initialising.
  function initInSeasonScreens(): void {
    if (!gameEngine) return;
    if (inSeasonInited) return;
    inSeasonInited = true;
    initHubScreen({
      getGameEngine,
      allTeams,
      onPlayMatch: onPlayRound,
      onPlayoffs: runPlayoffStage,
      onFixtures: goFixtures,
      onLeague:   goLeagueMenu,
      onSquad:    goSquad,
      onTraining: goTrainingMidweek,
      onContracts: goContracts,
      onTransfers: goTransfersMidseason,
      onSettings: goSettingsFromHub,
      onInbox:    goInbox,
    });
    initFixtureListScreen(getGameEngine, allTeams, () => goHub('back'));
    // The League sub-menu sits between the Hub's League tile and the
    // three leaves (Table / Team Stats / Player Stats). Each leaf's
    // back arrow returns here; this screen's back arrow returns to
    // Hub. Row clicks on any leaf jump to TeamInfo for that club; the
    // teamInfo back arrow returns to whichever leaf opened it.
    initLeagueMenuScreen({
      getGameEngine,
      onBack:         () => goHub('back'),
      onTable:        goLeagueTable,
      onTeamStats:    goTeamStats,
      onPlayerStats:  goPlayerStats,
      onAchievements: goAchievements,
    });
    initLeagueTableScreen(getGameEngine, allTeams, () => goLeagueMenu('back'), (teamId) => {
      const teamJson = allTeams.find(t => t.id === teamId);
      if (!teamJson) return;
      goTeamInfoMidSeason(teamJson, () => goLeagueTable('back'));
    });
    initTeamStatsScreen(getGameEngine, allTeams, () => goLeagueMenu('back'), (teamId) => {
      const teamJson = allTeams.find(t => t.id === teamId);
      if (!teamJson) return;
      goTeamInfoMidSeason(teamJson, () => goTeamStats('back'));
    });
    initPlayerStatsScreen(getGameEngine, allTeams, () => goLeagueMenu('back'),
      (teamId) => {
        const teamJson = allTeams.find(t => t.id === teamId);
        if (!teamJson) return;
        goTeamInfoMidSeason(teamJson, () => goPlayerStats('back'));
      },
      (rosterId) => goPlayerProfile(rosterId, () => goPlayerStats('back')),
    );
    initPlayerProfileScreen(getGameEngine, allTeams);
    initRoundResultsScreen(getGameEngine, allTeams);
    initPlayoffBracketScreen(getGameEngine, allTeams);
    initBudgetRevealScreen(getGameEngine, allTeams);
    initTakeoverRevealScreen(getGameEngine, allTeams);
    initEndOfSeasonScreen(getGameEngine, allTeams);
    // Going to the profile from any off-season screen doesn't mutate
    // career state, so the back path just re-shows the existing DOM —
    // partial selections / toggles survive the round-trip.
    initRenewalsScreen(getGameEngine, allTeams, (rosterId) => {
      goPlayerProfile(rosterId, () => screenRouter.show('renewals', { direction: 'back' }));
    });
    initTransferMarketScreen(getGameEngine, allTeams, (rosterId) => {
      goPlayerProfile(rosterId, () => screenRouter.show('transfer-market', { direction: 'back' }));
    });
    initSigningResultsScreen(getGameEngine, allTeams, (rosterId) => {
      goPlayerProfile(rosterId, () => screenRouter.show('signing-results', { direction: 'back' }));
    });
    initRetentionDecisionScreen(getGameEngine, allTeams, (rosterId) => {
      goPlayerProfile(rosterId, () => screenRouter.show('retention-decision', { direction: 'back' }));
    });
    initRolloverScreen(getGameEngine, allTeams);
    initContractsScreen(getGameEngine, allTeams, () => goHub('back'), (rosterId) => {
      goPlayerProfile(rosterId, () => goContracts('back'));
    }, (rosterId, offeredWage) => {
      // Mid-season early renewal: mutate + persist engine-side so a
      // re-signing survives a tab close. The screen handles the toast +
      // re-render from the returned outcome. The wage is the user's
      // negotiated figure from the offer modal.
      const engine = getGameEngine();
      const result = engine.offerEarlyRenewal(rosterId, offeredWage);
      saveGame(engine.toSavePayload());
      return result;
    });
    initSquadManagementScreen({
      getGameEngine,
      allTeams,
      onBack: () => goHub('back'),
      onPlayerClick: (rosterId) => goPlayerProfile(rosterId, () => goSquad('back')),
    });
    initSquadOverviewScreen(getGameEngine, allTeams);
    initTrainingScreen(getGameEngine, allTeams);
    initPostTrainingResultsScreen(getGameEngine, allTeams, (rosterId) => {
      goPlayerProfile(rosterId, () => screenRouter.show('training-results', { direction: 'back' }));
    });
    initInternationalBreakScreen(getGameEngine, allTeams, (rosterId) => {
      goPlayerProfile(rosterId, () => screenRouter.show('international-break', { direction: 'back' }));
    });
    initAchievementsScreen(() => goLeagueMenu('back'));
    // Achievements listen to game:* events and read live state through the
    // getter, so the engine swaps cleanly on New Game. Subscriptions are
    // permanent — registered once here like the in-season screens.
    initAchievementEngine(() => getGameEngine().getState());
    initInboxScreen({
      getGameEngine,
      allTeams,
      onBack:      () => goHub('back'),
      onSquad:     goSquad,
      onContracts: goContracts,
      onTransfers: goTransfersMidseason,
      onFixtures:  goFixtures,
      onLeague:    goLeagueMenu,
    });

    // The post-match Continue chain (LeagueTable → ...) reads these flags.
    // game:bracketSeeded fires after the last regular-season fixture —
    // routes through PlayoffBracketScreen instead of straight to Hub.
    // game:seasonComplete fires once the season final resolves —
    // routes through EndOfSeason → Renewals → Signings → Rollover.
    eventBus.on('game:bracketSeeded',  () => { bracketSeededPending = true; playoffTrainingPending = false; });
    eventBus.on('game:seasonComplete', () => { seasonCompletePending = true; });
  }

  // The handful of Hub-and-League navigation helpers below are reused both
  // as forward navigations (Hub tile click) and as the back target from
  // deeper screens (Player Profile back, Team Info back, sub-menu back).
  // They take a direction; default to 'forward' for Hub-tile callers, and
  // the deeper-screen registration sites pass 'back' explicitly.
  function goHub(direction: 'forward' | 'back' = 'forward'): void {
    screenRouter.show('hub', { direction });
  }

  function goFixtures(direction: 'forward' | 'back' = 'forward'): void {
    screenRouter.show('fixture-list', { direction });
  }

  function goLeagueTable(direction: 'forward' | 'back' = 'forward'): void {
    showLeagueTable();
    screenRouter.show('league-table', { direction });
  }

  function goLeagueMenu(direction: 'forward' | 'back' = 'forward'): void {
    screenRouter.show('league-menu', { direction });
  }

  function goTeamStats(direction: 'forward' | 'back' = 'forward'): void {
    showTeamStats();
    screenRouter.show('team-stats', { direction });
  }

  function goPlayerStats(direction: 'forward' | 'back' = 'forward'): void {
    showPlayerStats();
    screenRouter.show('player-stats', { direction });
  }

  // Opens the profile for one player. `onBack` is origin-aware (mirrors
  // goTeamInfoMidSeason from v2.180a) — the calling screen passes its
  // own re-entry helper so the back arrow returns to wherever you came
  // from (Contracts, PlayerStats leaderboards, TeamInfo squad rows, etc).
  // Safe to call any time in the in-season window — the screen pulls
  // live state and the profile renders the player's current status.
  function goPlayerProfile(rosterId: number, onBack: () => void): void {
    showPlayerProfile(rosterId, onBack);
    screenRouter.show('player-profile');
  }

  function goContracts(direction: 'forward' | 'back' = 'forward'): void {
    showContracts();
    screenRouter.show('contracts', { direction });
  }

  function goAchievements(direction: 'forward' | 'back' = 'forward'): void {
    showAchievements();
    screenRouter.show('achievements', { direction });
  }

  function goInbox(direction: 'forward' | 'back' = 'forward'): void {
    markInboxRead();
    screenRouter.show('inbox', { direction });
  }

  function goSquad(direction: 'forward' | 'back' = 'forward'): void {
    showSquadManagement();
    screenRouter.show('squad-management', { direction });
  }

  // PreMatch → Edit Squad shortcut. Opens Squad Management with a
  // one-shot back override so the user lands back on the My Line-Up
  // step instead of Hub.
  function goSquadFromPreMatch(): void {
    showSquadManagement(() => {
      showPreMatchAtStep('mine');
      screenRouter.show('pre-match', { direction: 'back' });
    });
    screenRouter.show('squad-management');
  }

  // Hub → Training. Mid-week edit of next round's training plan. The
  // Back button persists the plan without applying training (training
  // itself runs only via the post-match chain) and returns to Hub.
  function goTrainingMidweek(): void {
    showTrainingMidweek(() => {
      if (gameEngine) saveGame(gameEngine.toSavePayload());
      goHub('back');
    });
    screenRouter.show('training');
  }

  // Hub → Transfers. Opens an interactive mid-season FA market: user
  // queues offers, hits Submit, each is rolled against an appeal-based
  // acceptance probability, results flow into SigningResults → Hub.
  // Rejected players go on a one-round cooldown
  // (career.midseasonRejections). The Reg 7 tab is hidden mid-season
  // — Reg 7 pre-agreements stay an off-season concept.
  function goTransfersMidseason(): void {
    if (!gameEngine) return;
    gameEngine.openMidseasonSigningWindow();
    // Empty FA pool (or every FA on cooldown) → openMidseasonSigningWindow
    // leaves state.career.market null. We still navigate to the screen
    // so the user sees the empty state + a Continue button back to the
    // Hub, rather than the tile silently round-tripping.
    if (gameEngine.getState().career.market) {
      saveGame(gameEngine.toSavePayload());
    }
    const onSubmit = (): void => {
      if (!gameEngine) { goHub(); return; }
      const outcomes = gameEngine.runMidseasonSigning();
      gameEngine.closeMidseasonSigningWindow();
      saveGame(gameEngine.toSavePayload());
      showSigningResults(outcomes, () => goHub());
      screenRouter.show('signing-results');
    };
    const onFinish = (): void => {
      if (gameEngine) {
        gameEngine.closeMidseasonSigningWindow();
        saveGame(gameEngine.toSavePayload());
      }
      goHub();
    };
    showTransferMarketMidseason(onSubmit, onFinish);
    screenRouter.show('transfer-market');
  }

  function onTeamPicked(team: RawTeamInput): void {
    initModePickerScreen(team, () => onQuickStart(team), () => onSquadBuilder(team), () => goTeamSelector('back'));
    screenRouter.show('mode-picker');
  }

  function onQuickStart(team: RawTeamInput): void {
    // Existing new-game path: seed the save immediately so Continue is enabled
    // even if the user backs out before playing the first match.
    gameEngine = GameCoordinator.newSeason(team.id, generateSeed(), allTeams);
    saveGame(gameEngine.toSavePayload());
    initInSeasonScreens();
    goHub();
  }

  // Squad Builder: BudgetReveal (year-1 seeded budget) → unwind 2025-26
  // inbound transfers → squad overview (read-only depth chart) →
  // pre-season signing window (FA-only) → marquee selection → Hub. Each
  // step marks state.career.preSeasonStep before saving so a closed tab
  // resumes at the right screen via continueGame.
  function onSquadBuilder(team: RawTeamInput): void {
    gameEngine = GameCoordinator.newSeason(team.id, generateSeed(), allTeams);
    initInSeasonScreens();
    // Unwind the 2025-26 inbound transfers FIRST so the Owner's Budget
    // reveal sees the post-unwind squad. Without this, the budget pill
    // includes wages for players who are about to be released into the
    // FA pool, which renders as "over budget" and contradicts the
    // headroom shown on the very next screen (SquadOverview / Transfer
    // Market). The unwind doesn't touch salaryBudget itself, so the
    // headline number on the reveal is unchanged.
    gameEngine.unwindPreSeasonTransfers(PRE_SEASON_TRANSFERS_2025_26);
    // Reveal the year-1 owner budget — no delta or reasons since
    // this is the seeded value, not a year-on-year adjustment.
    const club = gameEngine.getState().career.clubs.find(c => c.id === team.id);
    showBudgetReveal({
      budget: club?.salaryBudget ?? 0,
      onContinue: () => {
        if (!gameEngine) { goHub(); return; }
        runPreSeasonOverview();
      },
    });
    screenRouter.show('budget-reveal');
  }

  function runPreSeasonOverview(): void {
    if (!gameEngine) return;
    gameEngine.setPreSeasonStep('overview');
    saveGame(gameEngine.toSavePayload());
    showSquadOverview(() => runPreSeasonSignings());
    screenRouter.show('squad-overview');
  }

  function runPreSeasonSignings(): void {
    if (!gameEngine) return;
    gameEngine.openSigningWindow({ skipPoaches: true });
    if (!gameEngine.getState().career.market) {
      // Nothing to sign — skip straight to marquee. Still run the
      // AI-marquee repair: unwind may have stripped marquees off AI
      // clubs even if no FA pool resulted.
      gameEngine.repairAIMarquees();
      runPreSeasonMarquee();
      return;
    }
    gameEngine.setPreSeasonStep('signings');
    saveGame(gameEngine.toSavePayload());
    // Pre-season signing flow uses the same competitive loop as the
    // mid-season chain, but the openSigningWindow was opened with
    // skipPoaches so there are no Reg 7 candidates and therefore no
    // retention decisions. Close call also takes skipPoaches.
    const runPreSeasonRound = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.runAIBidPass();
      // No retentions in pre-season (no poach bids), but call the pass
      // for shape symmetry — it's a no-op when no poaches are in flight.
      gameEngine.runAIRetentionPass();
      saveGame(gameEngine.toSavePayload());
      const outcomes = gameEngine.resolveSigningRound();
      saveGame(gameEngine.toSavePayload());
      showSigningResults(outcomes, () => {
        if (!gameEngine) { goHub(); return; }
        if (gameEngine.hasViableSigningOptions()) {
          showPreSeasonLoop();
        } else {
          finishPreSeasonWindow();
        }
      });
      screenRouter.show('signing-results');
    };
    const finishPreSeasonWindow = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.closeSigningWindow({ skipPoaches: true });
      // Some AI clubs may now have no marquee — their authored marquee
      // was a 2025-26 in-signing that got unwound. Re-designate top
      // earner per marquee-less AI club so cap pressure stays sane.
      gameEngine.repairAIMarquees();
      runPreSeasonMarquee();
    };
    const showPreSeasonLoop = (): void => {
      showTransferMarketPreSeason(runPreSeasonRound, finishPreSeasonWindow);
      screenRouter.show('transfer-market');
    };
    showPreSeasonLoop();
  }

  function runPreSeasonMarquee(): void {
    if (!gameEngine) return;
    gameEngine.setPreSeasonStep('marquee');
    saveGame(gameEngine.toSavePayload());
    showContractsMarqueeEdit(() => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.setPreSeasonStep(null);
      saveGame(gameEngine.toSavePayload());
      goHub();
    });
    screenRouter.show('contracts');
  }

  function continueGame(): void {
    const save = loadSave();
    if (!save) return;
    const playerTeam = allTeams.find(t => t.id === save.playerTeamId);
    if (!playerTeam) {
      // Saved team no longer exists in the league (e.g. data churn). Drop the
      // stale save and bounce the user back home.
      clearSave();
      goHome();
      return;
    }
    try {
      gameEngine = GameCoordinator.fromSave(save, allTeams);
    } catch (err) {
      // A structurally-parsed save can still trip an invariant on load (e.g.
      // corrupt result scores → NaN standings). Surface it and bounce home
      // rather than leaving a dead "Continue" button; the save is preserved
      // so a future build can attempt the load again.
      console.error('Failed to load save:', err);
      goHome();
      return;
    }
    initInSeasonScreens();
    // v12 → v13 shim: a save made after R18 but pre-playoffs era won't
    // have a bracket field. Seed it now if conditions are met (no-op
    // when the bracket is already restored, or when the regular season
    // isn't done yet).
    gameEngine.seedPlayoffBracket();
    // Squad Builder mid-pre-season resumption. The flag is only ever set
    // while the user is between team-selection and Round 1; after marquee
    // Continue the engine clears it via setPreSeasonStep(null).
    const step = gameEngine.getState().career.preSeasonStep;
    if (step === 'overview') {
      runPreSeasonOverview();
      return;
    }
    if (step === 'signings') {
      runPreSeasonSignings();
      return;
    }
    if (step === 'marquee') {
      runPreSeasonMarquee();
      return;
    }
    // Mid-season signing window mid-flow → resume on the same screen.
    // openMidseasonSigningWindow is idempotent so the existing market
    // is preserved; the onSubmit/onFinish closures are re-bound.
    const liveMarket = gameEngine.getState().career.market;
    if (liveMarket && liveMarket.phase === 'signings-midseason') {
      goTransfersMidseason();
      return;
    }
    // Resume mid-off-season: rollSeason() already ran (playoffs cleared)
    // but the renewals or signings window is still open. Skip straight to
    // the open market rather than landing on Hub with an orphaned market.
    if (liveMarket && (liveMarket.phase === 'renewals' || liveMarket.phase === 'signings')) {
      resumeOffSeasonMarket();
      return;
    }
    goHub();
  }

  // Shared competitive signing loop used by both the normal off-season
  // chain and the mid-off-season resume path. Drives:
  //   TransferMarket → (AI bid pass + retention → resolve → results)*
  //   → closeSigningWindow → onFinishCallback
  function runOffSeasonSigningLoop(onFinishCallback: () => void): void {
    const runRound = (): void => {
      if (!gameEngine) { onFinishCallback(); return; }
      // AI bid pass (free agents + poaches) then AI auto-retention.
      gameEngine.runAIBidPass();
      gameEngine.runAIRetentionPass();
      saveGame(gameEngine.toSavePayload());
      const userPrompts = gameEngine.getUserRetentionPrompts();
      const proceedToResolve = (): void => {
        if (!gameEngine) { onFinishCallback(); return; }
        const outcomes = gameEngine.resolveSigningRound();
        saveGame(gameEngine.toSavePayload());
        showSigningResults(outcomes, () => {
          if (!gameEngine) { onFinishCallback(); return; }
          if (gameEngine.hasViableSigningOptions()) {
            showLoop();
          } else {
            finishWindow();
          }
        });
        screenRouter.show('signing-results');
      };
      if (userPrompts.length > 0) {
        showRetentionDecision(proceedToResolve);
        screenRouter.show('retention-decision');
      } else {
        proceedToResolve();
      }
    };
    const finishWindow = (): void => {
      if (!gameEngine) { onFinishCallback(); return; }
      gameEngine.closeSigningWindow();
      saveGame(gameEngine.toSavePayload());
      onFinishCallback();
    };
    const showLoop = (): void => {
      showTransferMarket(runRound, finishWindow);
      screenRouter.show('transfer-market');
    };
    showLoop();
  }

  // Off-season chain after the playoff final resolves.
  // Chain: EndOfSeason → BudgetReveal → (TakeoverReveal) → Rollover
  //        → Renewals → SquadOverview → Signings → Hub.
  // Each market window is skipped when empty (the open*Window calls
  // leave state.career.market null in that case).
  function runEndOfSeasonChain(): void {

    const proceedToSignings = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.openSigningWindow();
      if (gameEngine.getState().career.market) {
        saveGame(gameEngine.toSavePayload());
        // Depth-chart checkpoint between Renewals (just closed) and the
        // signings window. Lets the manager see where they're thin after
        // releases land, before they decide who to recruit.
        showSquadOverview(() => {
          if (!gameEngine) { goHub(); return; }
          runOffSeasonSigningLoop(() => {
            if (gameEngine) saveGame(gameEngine.toSavePayload());
            goHub();
          });
        });
        screenRouter.show('squad-overview');
      } else {
        if (gameEngine) saveGame(gameEngine.toSavePayload());
        goHub();
      }
    };
    // proceedToRenewals: open the renewal window if there are expiring
    // contracts, then route to RenewalsScreen → Signings → Hub.
    const proceedToRenewals = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.openRenewalWindow();
      if (gameEngine.getState().career.market) {
        saveGame(gameEngine.toSavePayload());
        showRenewals((decisions, wages) => {
          if (!gameEngine) { goHub(); return; }
          gameEngine.closeRenewalWindow(decisions, wages);
          saveGame(gameEngine.toSavePayload());
          proceedToSignings();
        });
        screenRouter.show('renewals');
      } else {
        proceedToSignings();
      }
    };
    // proceedToRollover: apply the rollover (aging, retirements, academy
    // graduates) and show the Off-Season recap screen before renewals /
    // signings. Declared after proceedToRenewals so the reference is valid.
    const proceedToRollover = (): void => {
      if (!gameEngine) { goHub(); return; }
      const rolloverEvents = gameEngine.rollSeason();
      saveGame(gameEngine.toSavePayload());
      showRollover(rolloverEvents, proceedToRenewals);
      screenRouter.show('rollover');
    };

    showEndOfSeason(() => {
      if (!gameEngine) { goHub(); return; }
      // Compute next season's budgets (performance + takeovers) BEFORE
      // the rollover zeroes out standings. Events fire CLUB_BUDGET_SET
      // for every club + CLUB_TAKEOVER for any Red Bull-style boost.
      const budgetEvents = gameEngine.prepareBudgetsForNextSeason();
      saveGame(gameEngine.toSavePayload());

      const userClubId = gameEngine.getState().player.teamId;
      const userBudgetEv = budgetEvents.find(
        (e): e is Extract<typeof e, { type: 'CLUB_BUDGET_SET' }> =>
          e.type === 'CLUB_BUDGET_SET' && e.clubId === userClubId,
      );
      const takeoverEntries: TakeoverEntry[] = budgetEvents
        .filter((e): e is Extract<typeof e, { type: 'CLUB_TAKEOVER' }> => e.type === 'CLUB_TAKEOVER')
        .map(e => ({ clubId: e.clubId, boostAmount: e.boostAmount, flavor: e.flavor }));

      const afterBudgetReveal = (): void => {
        if (takeoverEntries.length === 0) { proceedToRollover(); return; }
        showTakeoverReveal({ takeovers: takeoverEntries, onContinue: () => proceedToRollover() });
        screenRouter.show('takeover-reveal');
      };

      const userClub = gameEngine.getState().career.clubs.find(c => c.id === userClubId);
      showBudgetReveal({
        budget: userClub?.salaryBudget ?? 0,
        delta: userBudgetEv?.delta,
        reasons: userBudgetEv?.reasons,
        onContinue: afterBudgetReveal,
      });
      screenRouter.show('budget-reveal');
    });
    screenRouter.show('end-of-season');
  }

  // Resume handler for saves made mid-off-season (renewals or signings
  // market open). Called from continueGame when the loaded save has an
  // active off-season market. Picks up the chain at the right step and
  // completes it: renewals screen (if renewals phase) → signings → Hub.
  // rollSeason() has already run (state.league.playoffs is null), so we
  // must NOT call it again — only the market windows remain.
  function resumeOffSeasonMarket(): void {
    if (!gameEngine) { goHub(); return; }
    const market = gameEngine.getState().career.market;

    const afterSignings = (): void => {
      if (gameEngine) saveGame(gameEngine.toSavePayload());
      goHub();
    };

    const resumeSignings = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.openSigningWindow(); // no-op: market already open
      if (gameEngine.getState().career.market) {
        runOffSeasonSigningLoop(afterSignings);
      } else {
        afterSignings();
      }
    };

    if (market?.phase === 'renewals') {
      showRenewals((decisions, wages) => {
        if (!gameEngine) { goHub(); return; }
        gameEngine.closeRenewalWindow(decisions, wages);
        saveGame(gameEngine.toSavePayload());
        // Open signings as normal — openSigningWindow is idempotent.
        gameEngine.openSigningWindow();
        if (gameEngine.getState().career.market) {
          saveGame(gameEngine.toSavePayload());
          showSquadOverview(() => {
            if (!gameEngine) { goHub(); return; }
            runOffSeasonSigningLoop(afterSignings);
          });
          screenRouter.show('squad-overview');
        } else {
          afterSignings();
        }
      });
      screenRouter.show('renewals');
    } else if (market?.phase === 'signings') {
      resumeSignings();
    } else {
      goHub();
    }
  }

  // Routes the playoff chain. State-driven — picks the next action based
  // on the live bracket: play the player's pending match, sim the AI
  // matches in the current stage, or run the end-of-season chain when
  // the champion has been crowned. Re-enters itself after every state
  // change until the chain bottoms out.
  function runPlayoffStage(): void {
    if (!gameEngine) { goHub(); return; }
    const state = gameEngine.getState();
    const playoffs = state.league.playoffs;
    if (!playoffs) { goHub(); return; }

    // 1. Champion decided → off-season chain.
    if (playoffs.championTeamId !== null) {
      if (seasonCompletePending) seasonCompletePending = false;
      showPlayoffBracket(() => runEndOfSeasonChain(), 'Continue');
      screenRouter.show('playoff-bracket');
      return;
    }

    // 2. Player has a pending playoff match → show bracket, then a training
    //    week (if coming from a playoff result) before PreMatch.
    const playerMatch = gameEngine.getPlayerPlayoffMatch();
    if (playerMatch && playerMatch.homeId && playerMatch.awayId) {
      const goToMatch = () => onPlayPlayoff(playerMatch);
      const onBracketContinue = playoffTrainingPending
        ? () => {
            playoffTrainingPending = false;
            const label = playerMatch.kind === 'final' ? 'Final' : 'Semi-Final';
            showTrainingPostMatch((results) => {
              showPostTrainingResults(results, () => {
                if (gameEngine) saveGame(gameEngine.toSavePayload());
                goToMatch();
              });
              screenRouter.show('training-results');
            }, label);
            screenRouter.show('training');
          }
        : goToMatch;
      showPlayoffBracket(onBracketContinue, 'Continue');
      screenRouter.show('playoff-bracket');
      return;
    }

    // 3. AI-only matches pending in the current stage → sim them.
    const stage: 'sf' | 'final' = playoffs.semifinals.every(m => m.result)
      ? 'final'
      : 'sf';
    const ctaLabel = stage === 'sf' ? 'Watch the Semi-Finals' : 'Watch the Final';
    showPlayoffBracket(async () => {
      if (!gameEngine) { goHub(); return; }
      await gameEngine.simulatePendingPlayoffMatches(stage);
      saveGame(gameEngine.toSavePayload());
      runPlayoffStage();
    }, ctaLabel);
    screenRouter.show('playoff-bracket');
  }

  function onPlayPlayoff(match: PlayoffMatch): void {
    if (!gameEngine) return;
    if (!match.homeId || !match.awayId) return;
    const state = gameEngine.getState();
    const homeTeam = allTeams.find(t => t.id === match.homeId);
    const awayTeam = allTeams.find(t => t.id === match.awayId);
    if (!homeTeam || !awayTeam) return;
    const playerSide: 'home' | 'away' = match.homeId === state.player.teamId ? 'home' : 'away';
    const rosteredHome = playerSide === 'home'
      ? buildTeamFromRoster(state, homeTeam)
      : buildAutoSelectedTeamFromRoster(state, homeTeam);
    const rosteredAway = playerSide === 'away'
      ? buildTeamFromRoster(state, awayTeam)
      : buildAutoSelectedTeamFromRoster(state, awayTeam);
    const isFinal = match.kind === 'final';
    const contextLabel = isFinal
      ? 'Season Final · Twickenham'
      : `Season Semi-Final · ${match.homeSeed} v ${match.awaySeed}`;
    initPreMatchScreen(
      rosteredHome,
      rosteredAway,
      playerSide,
      0, // round is unused in playoff mode — context label overrides it
      gameEngine,
      (configuredHome, configuredAway, playerTactics) => {
        if (gameEngine) {
          const playerConfigured = playerSide === 'home' ? configuredHome : configuredAway;
          gameEngine.setPlayerTactics(playerTactics);
          gameEngine.setPlayerMatchdaySquad(extractMatchdaySquad(playerConfigured));
          saveGame(gameEngine.toSavePayload());
        }
        onPlayoffMatchStart(configuredHome, configuredAway, playerSide, match, playerTactics);
      },
      runPlayoffStage,
      { contextLabel, neutralVenue: isFinal, backLabel: 'Bracket' },
      goSquadFromPreMatch,
      (rosterId, returnStep) => goPlayerProfile(rosterId, () => {
        showPreMatchAtStep(returnStep);
        screenRouter.show('pre-match', { direction: 'back' });
      }),
    );
    screenRouter.show('pre-match');
  }

  function onPlayoffMatchStart(
    configuredHome: RawTeamInput,
    configuredAway: RawTeamInput,
    playerSide: 'home' | 'away',
    match: PlayoffMatch,
    playerTactics: TeamTactics,
  ): void {
    const engine = new MatchCoordinator(configuredHome, configuredAway, {
      tickDelayMs: loadTickDelayMs(),
      playerTactics,
      humanSide: playerSide,
      neutralVenue: match.kind === 'final',
    });
    initSimController(engine);

    const unsub = eventBus.on('engine:finished', ({ state }) => {
      unsub();
      showPlayoffMatchResult(engine, state, match);
    });
    // Initialise BEFORE revealing #app — see onMatchStart for the rationale.
    engine.initialize();
    screenRouter.show('app');
  }

  function showPlayoffMatchResult(engine: MatchCoordinator, state: MatchState, match: PlayoffMatch): void {
    // No "next fixture" tile on the playoff result screen — the bracket
    // is the canonical "what's next" surface. Pass null so MatchResult's
    // peek tile collapses.
    initMatchResultScreen(state, 0, null, async () => {
      const snapshot = snapshotMatch(state, state.homeTeam.id, state.awayTeam.id);
      engine.destroy();
      if (gameEngine) {
        await gameEngine.recordPlayerPlayoffResult(match.kind, state.score.home, state.score.away, snapshot);
        saveGame(gameEngine.toSavePayload());
      }
      // Back into the orchestrator. State now reflects the new result;
      // the next iteration picks the right next step (next match, sim
      // pending stage, or end-of-season chain). Flag a training week
      // so the player recovers before their next playoff match (if any).
      playoffTrainingPending = true;
      runPlayoffStage();
    });
    screenRouter.show('match-result');
  }

  function onPlayRound(homeTeam: RawTeamInput, awayTeam: RawTeamInput, playerSide: 'home' | 'away', round: number): void {
    if (!gameEngine) return;
    // Source player data from the persistent career roster — team identity
    // (color, name, stadium, suggestedTactics) still comes from the JSON
    // passed in by HubScreen.
    const state = gameEngine.getState();
    // Human side comes through buildTeamFromRoster so PreMatchScreen can
    // layer the manager's curated matchdaySquad on top (with surgical
    // injury repair). AI side comes through buildAutoSelectedTeamFromRoster
    // so the opponent always fields its best 23 by OVR-per-position —
    // re-derived every match week from the current roster.
    const rosteredHome = playerSide === 'home'
      ? buildTeamFromRoster(state, homeTeam)
      : buildAutoSelectedTeamFromRoster(state, homeTeam);
    const rosteredAway = playerSide === 'away'
      ? buildTeamFromRoster(state, awayTeam)
      : buildAutoSelectedTeamFromRoster(state, awayTeam);
    initPreMatchScreen(
      rosteredHome,
      rosteredAway,
      playerSide,
      round,
      gameEngine,
      (configuredHome, configuredAway, playerTactics) => {
        // Persist the manager's pre-match commits so the next match opens
        // with these as defaults. Saved here (on Kick Off) rather than after
        // the result so backing out mid-match keeps the chosen line-up.
        if (gameEngine) {
          const playerConfigured = playerSide === 'home' ? configuredHome : configuredAway;
          gameEngine.setPlayerTactics(playerTactics);
          gameEngine.setPlayerMatchdaySquad(extractMatchdaySquad(playerConfigured));
          saveGame(gameEngine.toSavePayload());
        }
        onMatchStart(configuredHome, configuredAway, playerSide, round, playerTactics);
      },
      () => goHub('back'),
      undefined,
      goSquadFromPreMatch,
      (rosterId, returnStep) => goPlayerProfile(rosterId, () => {
        showPreMatchAtStep(returnStep);
        screenRouter.show('pre-match', { direction: 'back' });
      }),
    );
    screenRouter.show('pre-match');
  }

  function onMatchStart(
    configuredHome: RawTeamInput,
    configuredAway: RawTeamInput,
    playerSide: 'home' | 'away',
    round: number,
    playerTactics: TeamTactics,
  ): void {
    const liveState = gameEngine!.getState();
    const liveFixture = liveState.league.fixtures.find(f =>
      f.round === round && f.homeId === configuredHome.id && f.awayId === configuredAway.id,
    );
    const homeFillRate = liveFixture && configuredHome.stadiumCapacity
      ? computeAttendance(liveFixture, configuredHome.stadiumCapacity, liveState.league.standings, liveState.league.results) / configuredHome.stadiumCapacity
      : HOME_ADVANTAGE.crowdFillNeutral;
    const engine = new MatchCoordinator(configuredHome, configuredAway, { tickDelayMs: loadTickDelayMs(), playerTactics, humanSide: playerSide, homeFillRate });
    initSimController(engine);

    const unsub = eventBus.on('engine:finished', ({ state }) => {
      unsub();
      showMatchResult(engine, state, round);
    });
    // Initialise BEFORE revealing #app so the scoreboard / commentary / pitch
    // panels reset on engine:initialized and repaint on the first
    // engine:stateChange while the screen is still hidden. Otherwise the user
    // sees the previous match's score / clock / commentary flash for a beat.
    engine.initialize();
    screenRouter.show('app');
  }

  function showMatchResult(engine: MatchCoordinator, state: MatchState, round: number): void {
    // Compute the player's next fixture preview (the one *after* the round
    // just played). The result hasn't been recorded yet at this point, so
    // walking the schedule for rounds > round is the cleanest source.
    const nextFixture = (() => {
      if (!gameEngine) return null;
      const gs = gameEngine.getState();
      const playerId = gs.player.teamId;
      const upcoming = gs.league.fixtures
        .filter(f => f.round > round && (f.homeId === playerId || f.awayId === playerId))
        .sort((a, b) => a.round - b.round)[0];
      if (!upcoming) return null;
      const isHome   = upcoming.homeId === playerId;
      const oppId    = isHome ? upcoming.awayId : upcoming.homeId;
      const opponent = allTeams.find(t => t.id === oppId);
      if (!opponent) return null;
      return {
        opponentName:    opponent.name,
        opponentInitial: (opponent.shortName[0] ?? '?').toUpperCase(),
        opponentColor:   opponent.color,
        isHome,
        round:           upcoming.round,
        date:            upcoming.date,
      };
    })();

    initMatchResultScreen(state, round, nextFixture, async () => {
      // Snapshot the per-player + per-team stats before destroy() tears
      // down the match state — feeds PLAYER_SEASON_STATS_ACCUMULATED and
      // TEAM_SEASON_STATS_ACCUMULATED inside recordPlayerMatchResult so the
      // league top-scorer / MVP / leaderboards / team-stat tables can
      // surface real season aggregates.
      const snapshot = snapshotMatch(state, state.homeTeam.id, state.awayTeam.id);
      engine.destroy();
      if (gameEngine) {
        await gameEngine.recordPlayerMatchResult(round, state.score.home, state.score.away, snapshot);
        saveGame(gameEngine.toSavePayload());
      }
      // Post-match nav chain: RoundResults → LeagueTable → TrainingScreen →
      // Hub (regular season) or PlayoffBracket (after the final regular round).
      const onLeagueContinue = (): void => {
        const isPlayoffEntry = bracketSeededPending;
        // Determine a playoff-context label for the training screen eyebrow.
        // Qualifiers see "Semi-Final"; non-qualifiers see "Playoffs".
        const playoffLabel = isPlayoffEntry && gameEngine
          ? (() => {
              const s = gameEngine.getState();
              const poffs = s.league.playoffs;
              return poffs?.semifinals.some(
                m => m.homeId === s.player.teamId || m.awayId === s.player.teamId,
              ) ? 'Semi-Final' : 'Playoffs';
            })()
          : undefined;
        const afterTraining = isPlayoffEntry
          ? () => { bracketSeededPending = false; runPlayoffStage(); }
          : () => { if (gameEngine) saveGame(gameEngine.toSavePayload()); goHub(); };
        showTrainingPostMatch((results) => {
          // At an international break the training result carries a summary;
          // slot the International Break screen between training results and
          // the chain's next step (Hub / playoffs).
          const afterResults = results.international
            ? () => {
                showInternationalBreak(results.international!, afterTraining);
                screenRouter.show('international-break');
              }
            : afterTraining;
          showPostTrainingResults(results, afterResults);
          screenRouter.show('training-results');
        }, playoffLabel);
        screenRouter.show('training');
      };
      showRoundResults(round, () => {
        showLeagueTablePostMatch(onLeagueContinue);
        screenRouter.show('league-table');
      });
      screenRouter.show('round-results');
    });
    screenRouter.show('match-result');
  }

  // Wire the native backup mirror so every slot write is copied to the iOS
  // Documents directory (iCloud-backed). No-op on web.
  installBackupMirror();

  const renderHome = (): void => {
    initHomeScreen(goTeamSelector, continueGame, goSettingsFromHome, allTeams,
      () => goSaves(() => goHome('back')));
    screenRouter.show('home');

    // Native splash holds (launchAutoHide:false) until the home screen has
    // painted, then fades out — no white flash, no spinner. No-op on web.
    if (Capacitor.isNativePlatform()) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        void SplashScreen.hide({ fadeOutDuration: 250 });
      }));
      // Sign the player into Game Centre so achievement reports land. No-op
      // until the native GameCenter plugin ships; fails soft otherwise.
      void getGameCenter().authenticate();
    }
  };

  // On native, restore any slot present on disk but missing in localStorage
  // (reinstall / OS-eviction) before the first Home render. Instant no-op on
  // web — reconcileBackups returns immediately off-platform.
  void reconcileBackups().then(renderHome, renderHome);
});
