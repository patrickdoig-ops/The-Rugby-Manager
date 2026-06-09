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
import '../style/sack.css';
import '../style/team-talk.css';
import '../style/staff.css';
import '../style/finances.css';
import '../style/loans.css';
import '../style/scouting.css';
import '../style/press-conference.css';

import { buildAppShell }           from './ui/AppShell';
import { preloadAllCues }          from './ui/SoundManager';
import { initAudioDirector }       from './ui/audio/AudioDirector';
import { initUiSounds }            from './ui/audio/uiSounds';
import { initHapticsDirector }     from './ui/haptics/HapticsDirector';
import { initScoreboard }          from './ui/Scoreboard';
import { initPitchStrip }          from './ui/PitchStrip';
import { initPitchView }           from './ui/PitchView';
import { initCommentaryFeed }      from './ui/CommentaryFeed';
import { initCrashOverlay }        from './ui/CrashOverlay';
import { initStatsPanel }          from './ui/StatsPanel';
import { initSimController }       from './ui/SimController';
import { initModalManager }        from './ui/ModalManager';
import { initPreMatchScreen, showPreMatchAtStep } from './ui/PreMatchScreen';
import { initTeamTalkScreen } from './ui/TeamTalkScreen';
import { initHalfTimeTalkPanel } from './ui/HalfTimeTalkPanel';
import { initHomeScreen }          from './ui/HomeScreen';
import { initSettingsScreen }      from './ui/SettingsScreen';
import { initSavesScreen }         from './ui/SavesScreen';
import { initTeamSelectorScreen }  from './ui/TeamSelectorScreen';
import { initTeamInfoScreen }      from './ui/TeamInfoScreen';
import { initFixtureListScreen }   from './ui/FixtureListScreen';
import { initLeagueTableScreen, showLeagueTable, showLeagueTablePostMatch } from './ui/LeagueTableScreen';
import { initLeagueMenuScreen } from './ui/LeagueMenuScreen';
import { initCompetitionsMenuScreen } from './ui/CompetitionsMenuScreen';
import { initEuropeanCupScreen, showEuropeanCupScreen } from './ui/EuropeanCupScreen';
import { initEuropeanShieldScreen, showEuropeanShieldScreen } from './ui/EuropeanShieldScreen';
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
import { initSackScreen, showSack }                 from './ui/SackScreen';
import { initRenewalsScreen, showRenewals }         from './ui/RenewalsScreen';
import { initTransferMarketScreen, showTransferMarket, showTransferMarketMidseason, showTransferMarketPreSeason } from './ui/TransferMarketScreen';
import { initSigningResultsScreen, showSigningResults } from './ui/SigningResultsScreen';
import { initRetentionDecisionScreen, showRetentionDecision } from './ui/RetentionDecisionScreen';
import { initModePickerScreen }    from './ui/ModePickerScreen';
import { initSquadOverviewScreen, showSquadOverview } from './ui/SquadOverviewScreen';
import { PRE_SEASON_TRANSFERS_2025_26 } from './data/transfers-2025-26';
import { initRolloverScreen, showRollover }         from './ui/RolloverScreen';
import { initContractsScreen, showContracts, showContractsMarqueeEdit } from './ui/ContractsScreen';
import { initContractsTransfersMenuScreen, showContractsTransfersMenu } from './ui/ContractsTransfersMenuScreen';
import { initLoanScreen, showLoans } from './ui/LoanScreen';
import { initClubMenuScreen, showClubMenu } from './ui/ClubMenuScreen';
import { initBoardConfidenceScreen, showBoardConfidence } from './ui/BoardConfidenceScreen';
import { initStaffScreen, showStaff } from './ui/StaffScreen';
import { initFinancesScreen, showFinancesScreen } from './ui/FinancesScreen';
import { initScoutingScreen, showScouting } from './ui/ScoutingScreen';
import { showPressConference } from './ui/PressConferenceScreen';
import { shouldFirePresser, buildPresser } from './game/pressConference';
import { PRESS_ANSWER_EFFECTS } from './engine/balance/press';
import { initSquadManagementScreen, showSquadManagement } from './ui/SquadManagementScreen';
import { initTrainingScreen, showTrainingPostMatch, showTrainingMidweek } from './ui/TrainingScreen';
import { initPostTrainingResultsScreen, showPostTrainingResults } from './ui/PostTrainingResultsScreen';
import { initInternationalBreakScreen, showInternationalBreak } from './ui/InternationalBreakScreen';
import { initInternationalCallUpsScreen, showInternationalCallUps } from './ui/InternationalCallUpsScreen';
import { initCupFixturesScreen, showCupFixturesPreBlock, showCupFixturesBrowse } from './ui/CupFixturesScreen';
import { initCupResultsScreen, showCupResults } from './ui/CupResultsScreen';
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
import type { TalkArgs }           from './types/ui';
import * as teamProfile            from './team/teamProfile';
import type { TeamJson }           from './team/teamProfile';
import { GameCoordinator }         from './game/GameCoordinator';
import type { BreakBeginResult, PreSeasonBlockResult, EuropeanFixtureRef } from './game/GameCoordinator';
import { buildEuropeanOpponent } from './game/buildEuropeanOpponent';
import { europeanTeams } from './data/european-teams';
import { extractMatchdaySquad }    from './game/playerSquad';
import { resolveCaptainRosterId }  from './game/captain';
import { buildTeamFromRoster, buildAutoSelectedTeamFromRoster } from './game/rosterTeamBuilder';
import { snapshotMatch }           from './game/seasonStatsCollector';
import { SEASON_VALUES, HOME_ADVANTAGE, MORALE } from './engine/balance';
import { computeAttendance }        from './game/attendance';
import { generateSeed }            from './utils/rng';
import { eventBus }                from './utils/eventBus';
import { showToast }              from './ui/Toast';
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

// The team JSONs carry their final, play-ready attributes (authored in
// docs/team-data.md, generated by scripts/generateTeamJsons.mjs). No
// spawn-time stat transform is applied — the data on disk is what the
// engine plays with.
const allTeamsRaw = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as TeamJson[];
const allTeams = allTeamsRaw as unknown as RawTeamInput[];
// European screens need both Premiership and cross-league European teams.
const allTeamsWithEuropean: RawTeamInput[] = [...allTeams, ...europeanTeams];

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
  initHalfTimeTalkPanel(document.getElementById('half-time-panel')!);
  preloadAllCues();
  initAudioDirector();
  initHapticsDirector();
  initUiSounds();
  initScoreboard();
  initPitchStrip();
  initPitchView();
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

  // Autosave wrapper for every in-season save site. saveGame is silent on
  // success (preserving the original contract) and returns false on a caught
  // write failure (storage full / disabled). On failure we emit a single
  // `save:failed` event, debounced so a persistently-full store doesn't spam a
  // toast on every tick — the player gets one warning per minute telling them
  // to export their career.
  let lastSaveFailWarnAt = 0;
  const SAVE_FAIL_WARN_COOLDOWN_MS = 60_000;
  const autosave = (payload: Parameters<typeof saveGame>[0]): void => {
    if (saveGame(payload)) return;
    const now = Date.now();
    if (now - lastSaveFailWarnAt < SAVE_FAIL_WARN_COOLDOWN_MS) return;
    lastSaveFailWarnAt = now;
    eventBus.emit('save:failed', { reason: 'quota' });
  };

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
        if (gameEngine) autosave(gameEngine.toSavePayload());
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
    const isOwnTeam = team.id === state.player.teamId;
    const getRep = isOwnTeam
      ? undefined
      : (rid: number) => Math.round(state.career.roster[rid]?.reputation ?? 50);
    // Row click → player profile, with back returning here.
    initTeamInfoScreen(profile, liveTeam, state.calendar.date, onBack, (rosterId) => {
      goPlayerProfile(rosterId, () => goTeamInfoMidSeason(team, onBack));
    }, getRep);
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
    const hubScreen = initHubScreen({
      getGameEngine,
      allTeams: allTeamsWithEuropean,
      onPlayMatch: onPlayRound,
      onPlayoffs: () => { void runPlayoffWeek(); },
      onPreSeasonCup: () => {
        const eng = gameEngine;
        if (!eng) return;
        const begin = eng.beginPreSeasonBlock();
        runPreSeasonCupChain(begin, eng, () => { autosave(eng.toSavePayload()); goHub(); });
      },
      onPlayEuropean: () => {
        maybePlayEuropeanFixture(() => { if (gameEngine) autosave(gameEngine.toSavePayload()); goHub(); });
      },
      onFixtures:      goFixtures,
      onCompetitions:  goCompetitionsMenu,
      onSquad:         goSquad,
      onTraining: goTrainingMidweek,
      onContractsAndTransfers: goContractsTransfersMenu,
      onClub:      goClubMenu,
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
      onBack:         () => goCompetitionsMenu('back'),
      onTable:        goLeagueTable,
      onTeamStats:    goTeamStats,
      onPlayerStats:  goPlayerStats,
      onAchievements: goAchievements,
    });
    initCompetitionsMenuScreen({
      getGameEngine,
      onBack:           () => goHub('back'),
      onLeague:         goLeagueMenu,
      onCup:            goCupBrowse,
      onEuropeanCup:    goEuropeanCup,
      onEuropeanShield: goEuropeanShield,
    });
    initEuropeanCupScreen({
      getGameEngine,
      allTeams: allTeamsWithEuropean,
      onBack: () => goCompetitionsMenu('back'),
    });
    initEuropeanShieldScreen({
      getGameEngine,
      allTeams: allTeamsWithEuropean,
      onBack: () => goCompetitionsMenu('back'),
    });
    initContractsTransfersMenuScreen({
      getGameEngine,
      allTeams,
      onBack:      () => goHub('back'),
      onContracts: goContracts,
      onTransfers: goTransfersMidseason,
      onLoans:     () => goLoans(),
      onScouting:  goScouting,
    });
    initScoutingScreen(
      getGameEngine,
      allTeams,
      () => goContractsTransfersMenu('back'),
      (rosterId) => goPlayerProfile(rosterId, () => goScouting('back')),
    );
    initClubMenuScreen({
      getGameEngine,
      allTeams,
      onBack: () => goHub('back'),
      onBoardConfidence: () => goBoard(),
      onStaff: () => goStaff(),
      onFinances: () => goFinances(),
    });
    initBoardConfidenceScreen({
      getGameEngine,
      allTeams,
      onBack: () => goClubMenu('back'),
    });
    initStaffScreen({
      getGameEngine,
      allTeams,
      onBack: () => goClubMenu('back'),
    });
    initFinancesScreen({
      getGameEngine,
      allTeams,
      onBack: () => goClubMenu('back'),
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
    initSackScreen(getGameEngine, allTeams);
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
    initContractsScreen(getGameEngine, allTeams, () => goContractsTransfersMenu('back'), (rosterId) => {
      goPlayerProfile(rosterId, () => goContracts('back'));
    }, (rosterId, offeredWage) => {
      // Mid-season early renewal: mutate + persist engine-side so a
      // re-signing survives a tab close. The screen handles the toast +
      // re-render from the returned outcome. The wage is the user's
      // negotiated figure from the offer modal.
      const engine = getGameEngine();
      const result = engine.offerEarlyRenewal(rosterId, offeredWage);
      autosave(engine.toSavePayload());
      return result;
    }, 'Contracts & Transfers');
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
    initInternationalCallUpsScreen(getGameEngine, allTeams, (rosterId) => {
      goPlayerProfile(rosterId, () => screenRouter.show('intl-callups', { direction: 'back' }));
    });
    initCupFixturesScreen(getGameEngine, allTeams);
    initCupResultsScreen(getGameEngine, allTeams);
    initAchievementsScreen(() => goLeagueMenu('back'));
    // Achievements listen to game:* events and read live state through the
    // getter, so the engine swaps cleanly on New Game. Subscriptions are
    // permanent — registered once here like the in-season screens.
    initAchievementEngine(() => getGameEngine().getState());
    initLoanScreen({
      getGameEngine,
      allTeams,
      onBack: () => goContractsTransfersMenu('back'),
    });
    initInboxScreen({
      getGameEngine,
      allTeams,
      onBack:      () => { hubScreen.refresh(); goHub('back'); },
      onSquad:     goSquad,
      onContracts: goContracts,
      onTransfers: goTransfersMidseason,
      onFixtures:  goFixtures,
      onLeague:    goLeagueMenu,
      onLoans:     () => goLoans(),
    });

  }

  // Game over: the manager has been sacked. Clears the active save slot so a
  // sacked career can't be resumed, then shows the terminal screen.
  function runSackScreen(reason: 'midseason' | 'endOfSeason'): void {
    clearSave();
    showSack({
      reason,
      onNewGame: () => goTeamSelector('forward'),
      onMainMenu: () => goHome('back'),
    });
    screenRouter.show('sacked');
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

  function goCompetitionsMenu(direction: 'forward' | 'back' = 'forward'): void {
    screenRouter.show('competitions-menu', { direction });
  }

  function goEuropeanCup(direction: 'forward' | 'back' = 'forward'): void {
    screenRouter.show('european-cup', { direction });
    showEuropeanCupScreen();
  }

  function goEuropeanShield(direction: 'forward' | 'back' = 'forward'): void {
    screenRouter.show('european-shield', { direction });
    showEuropeanShieldScreen();
  }

  function goCupBrowse(direction: 'forward' | 'back' = 'forward'): void {
    showCupFixturesBrowse(() => goCompetitionsMenu('back'));
    screenRouter.show('cup-fixtures', { direction });
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

  function goScouting(direction: 'forward' | 'back' = 'forward'): void {
    showScouting();
    screenRouter.show('scouting', { direction });
  }

  function goContractsTransfersMenu(direction: 'forward' | 'back' = 'forward'): void {
    showContractsTransfersMenu();
    screenRouter.show('contracts-transfers-menu', { direction });
  }

  function goClubMenu(direction: 'forward' | 'back' = 'forward'): void {
    showClubMenu();
    screenRouter.show('club-menu', { direction });
  }

  function goBoard(direction: 'forward' | 'back' = 'forward'): void {
    showBoardConfidence();
    screenRouter.show('board-confidence', { direction });
  }

  function goLoans(direction: 'forward' | 'back' = 'forward'): void {
    showLoans();
    screenRouter.show('loans', { direction });
  }

  function goStaff(direction: 'forward' | 'back' = 'forward'): void {
    showStaff();
    screenRouter.show('staff', { direction });
  }

  function goFinances(direction: 'forward' | 'back' = 'forward'): void {
    showFinancesScreen();
    screenRouter.show('club-finances', { direction });
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
      if (gameEngine) autosave(gameEngine.toSavePayload());
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
      autosave(gameEngine.toSavePayload());
    }
    const onSubmit = (): void => {
      if (!gameEngine) { goHub(); return; }
      const outcomes = gameEngine.runMidseasonSigning();
      gameEngine.closeMidseasonSigningWindow();
      autosave(gameEngine.toSavePayload());
      showSigningResults(outcomes, () => goHub());
      screenRouter.show('signing-results');
    };
    const onFinish = (): void => {
      if (gameEngine) {
        gameEngine.closeMidseasonSigningWindow();
        autosave(gameEngine.toSavePayload());
      }
      goContractsTransfersMenu('back');
    };
    showTransferMarketMidseason(onSubmit, onFinish);
    screenRouter.show('transfer-market');
  }

  function onTeamPicked(team: RawTeamInput): void {
    initModePickerScreen(team, () => onQuickStart(team), () => onSquadBuilder(team), () => goTeamSelector('back'));
    screenRouter.show('mode-picker');
  }

  async function onQuickStart(team: RawTeamInput): Promise<void> {
    // Existing new-game path: seed the save immediately so Continue is enabled
    // even if the user backs out before playing the first match.
    gameEngine = await GameCoordinator.newSeason(team.id, generateSeed(), allTeams);
    autosave(gameEngine.toSavePayload());
    initInSeasonScreens();
    goHub();
  }

  // Squad Builder: BudgetReveal (year-1 seeded budget) → unwind 2025-26
  // inbound transfers → squad overview (read-only depth chart) →
  // pre-season signing window (FA-only) → marquee selection → Hub. Each
  // step marks state.career.preSeasonStep before saving so a closed tab
  // resumes at the right screen via continueGame.
  async function onSquadBuilder(team: RawTeamInput): Promise<void> {
    gameEngine = await GameCoordinator.newSeason(team.id, generateSeed(), allTeams);
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
    autosave(gameEngine.toSavePayload());
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
    autosave(gameEngine.toSavePayload());
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
      autosave(gameEngine.toSavePayload());
      const outcomes = gameEngine.resolveSigningRound();
      autosave(gameEngine.toSavePayload());
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
    autosave(gameEngine.toSavePayload());
    showContractsMarqueeEdit(() => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.setPreSeasonStep(null);
      autosave(gameEngine.toSavePayload());
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
    // Mid-season sack persisted but not yet shown (tab closed between the
    // result and the game-over screen). The latch is the source of truth, so
    // re-route to the SackScreen rather than dropping onto the Hub.
    if (gameEngine.isManagerSacked()) {
      runSackScreen('midseason');
      return;
    }
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
    // Mid-season poach window mid-flow (tab closed on the retention
    // screen) → resume the decision, then back to Hub.
    if (liveMarket && liveMarket.phase === 'poach-midseason') {
      runMidseasonPoachDecision(() => goHub());
      return;
    }
    // Resume mid-off-season: the renewal or signing window is still open.
    // Budgets were applied before the market opened, so re-enter the
    // market chain directly (rollover runs at its end).
    if (liveMarket && (liveMarket.phase === 'renewals' || liveMarket.phase === 'signings')) {
      resumeOffSeasonMarket();
      return;
    }
    // Season finished (champion crowned) but the rollover hasn't run yet —
    // the off-season chain was interrupted before any market opened (e.g. a
    // tab reload on the EndOfSeason / BudgetReveal screens, common on mobile
    // PWAs). Go straight to the end-of-season chain — the crowned bracket is
    // the reliable signal that the off-season chain is unfinished.
    const playoffs = gameEngine.getState().league.playoffs;
    if (playoffs !== null && playoffs.championTeamId !== null) {
      runEndOfSeasonChain();
      return;
    }
    // Pre-season cup not yet started (or tab closed before completing the
    // cup chain). Go to Hub — the cup CTA there will trigger the chain.
    if (gameEngine.isPreSeasonCupPending()) {
      goHub();
      return;
    }
    // Interrupted international break (tab closed on the post-match chain at a
    // Round 6 / 11 break, before the cup + training block ran). Re-enter the
    // break flow instead of dropping to Hub and skipping the break. The break
    // re-runs deterministically from the last (post-pre-break-round) save.
    if (gameEngine.isBreakPending()) {
      const begin = gameEngine.beginInternationalBreak();
      if (begin) {
        const eng = gameEngine;
        runInternationalBreakChain(begin, eng, () => {
          if (eng.isManagerSacked()) { runSackScreen('midseason'); return; }
          maybeRunMidseasonPoach(() => { autosave(eng.toSavePayload()); goHub(); });
        });
        return;
      }
    }
    goHub();
  }

  // Mid-season Reg 7 poach. Opens the window (self-gates on cadence +
  // whether any rival actually approaches one of the user's players). If
  // it opened, runs the retention decision; otherwise continues straight
  // through. Slotted into the post-match chain after the training step.
  function maybeRunMidseasonPoach(onDone: () => void): void {
    if (!gameEngine) { onDone(); return; }
    gameEngine.openMidseasonPoachWindow();
    const market = gameEngine.getState().career.market;
    if (!market || market.phase !== 'poach-midseason') { onDone(); return; }
    autosave(gameEngine.toSavePayload()); // persist the open window (resumable)
    runMidseasonPoachDecision(onDone);
  }

  // Drives the open 'poach-midseason' market to a conclusion: show the
  // RetentionDecision screen (user retains — paying up — or lets players
  // go), then resolve + show the outcome, then continue. Reused by the
  // post-match chain and the closed-tab resume path.
  function runMidseasonPoachDecision(onDone: () => void): void {
    if (!gameEngine) { onDone(); return; }
    const prompts = gameEngine.getUserRetentionPrompts();
    if (prompts.length === 0) {
      gameEngine.closeMidseasonPoachWindow();
      autosave(gameEngine.toSavePayload());
      onDone();
      return;
    }
    showRetentionDecision(() => {
      if (!gameEngine) { onDone(); return; }
      const outcomes = gameEngine.closeMidseasonPoachWindow();
      autosave(gameEngine.toSavePayload());
      showSigningResults(outcomes, onDone);
      screenRouter.show('signing-results');
    });
    screenRouter.show('retention-decision');
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
      autosave(gameEngine.toSavePayload());
      const userPrompts = gameEngine.getUserRetentionPrompts();
      const proceedToResolve = (): void => {
        if (!gameEngine) { onFinishCallback(); return; }
        const outcomes = gameEngine.resolveSigningRound();
        autosave(gameEngine.toSavePayload());
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
      autosave(gameEngine.toSavePayload());
      onFinishCallback();
    };
    const showLoop = (): void => {
      showTransferMarket(runRound, finishWindow);
      screenRouter.show('transfer-market');
    };
    showLoop();
  }

  // Terminal off-season step: roll the season over (aging, retirements,
  // Reg 7 transfer activations, academy intake, fresh fixtures), persist,
  // show the Off-Season recap, then land on the fresh-season Hub. Runs
  // AFTER the renewal + signing windows resolve — matching the documented
  // + determinism-harness order (renewals → signings → rollover). Running
  // it before the markets left the only pre-rollover save (post-budgets)
  // still showing a crowned champion, so a mid-chain reload stranded the
  // user on a stale "Continue to playoffs" Hub that never reset.
  function finishWithRollover(): void {
    if (!gameEngine) { goHub(); return; }
    const eng = gameEngine;
    void eng.rollSeason().then(rolloverEvents => {
      autosave(eng.toSavePayload());
      showRollover(rolloverEvents, () => goHub());
      screenRouter.show('rollover');
    });
  }

  // Renewals → SquadOverview → Signings → rollover. Shared by the normal
  // off-season chain (entry 'renewals') and the closed-tab resume paths.
  // Budgets are assumed already applied + saved. Both open*Window calls
  // are idempotent, so re-entering an already-open market is safe.
  function runOffSeasonMarkets(entry: 'renewals' | 'signings'): void {
    if (!gameEngine) { goHub(); return; }

    const proceedToSignings = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.openSigningWindow();
      if (gameEngine.getState().career.market) {
        autosave(gameEngine.toSavePayload());
        // Depth-chart checkpoint between Renewals (just closed) and the
        // signings window. Lets the manager see where they're thin after
        // releases land, before they decide who to recruit.
        showSquadOverview(() => {
          if (!gameEngine) { goHub(); return; }
          runOffSeasonSigningLoop(() => {
            if (gameEngine) autosave(gameEngine.toSavePayload());
            finishWithRollover();
          });
        });
        screenRouter.show('squad-overview');
      } else {
        finishWithRollover();
      }
    };

    const proceedToRenewals = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.openRenewalWindow();
      if (gameEngine.getState().career.market) {
        autosave(gameEngine.toSavePayload());
        showRenewals((decisions, wages) => {
          if (!gameEngine) { goHub(); return; }
          gameEngine.closeRenewalWindow(decisions, wages);
          autosave(gameEngine.toSavePayload());
          proceedToSignings();
        });
        screenRouter.show('renewals');
      } else {
        proceedToSignings();
      }
    };

    if (entry === 'signings') proceedToSignings();
    else proceedToRenewals();
  }

  // Off-season chain after the playoff final resolves.
  // Chain: EndOfSeason → BudgetReveal → (TakeoverReveal) → Renewals
  //        → SquadOverview → Signings → Rollover → Hub.
  // Each market window is skipped when empty (the open*Window calls
  // leave state.career.market null in that case).
  function runEndOfSeasonChain(): void {
    // Judge the season against the board's objective before rollover. Pure +
    // idempotent — the chain re-runs verbatim if the user reloads from the
    // off-season, so the verdict is recomputed (never double-applied). The
    // EndOfSeasonScreen shows the verdict; the sack lands on Continue.
    const sacked = gameEngine ? gameEngine.judgeSeasonObjective().sacked : false;
    showEndOfSeason(() => {
      if (sacked) { runSackScreen('endOfSeason'); return; }
      if (!gameEngine) { goHub(); return; }
      // Compute next season's budgets (performance + takeovers) BEFORE
      // the rollover zeroes out standings. Events fire CLUB_BUDGET_SET
      // for every club + CLUB_TAKEOVER for any Red Bull-style boost.
      const budgetEvents = gameEngine.prepareBudgetsForNextSeason();
      autosave(gameEngine.toSavePayload());

      const userClubId = gameEngine.getState().player.teamId;
      const userBudgetEv = budgetEvents.find(
        (e): e is Extract<typeof e, { type: 'CLUB_BUDGET_SET' }> =>
          e.type === 'CLUB_BUDGET_SET' && e.clubId === userClubId,
      );
      const takeoverEntries: TakeoverEntry[] = budgetEvents
        .filter((e): e is Extract<typeof e, { type: 'CLUB_TAKEOVER' }> => e.type === 'CLUB_TAKEOVER')
        .map(e => ({ clubId: e.clubId, boostAmount: e.boostAmount, flavor: e.flavor }));

      const afterBudgetReveal = (): void => {
        if (takeoverEntries.length === 0) { runOffSeasonMarkets('renewals'); return; }
        showTakeoverReveal({ takeovers: takeoverEntries, onContinue: () => runOffSeasonMarkets('renewals') });
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

  // Resume handler for saves made mid-off-season after the markets have
  // opened (renewals or signings phase). Budgets were applied + saved
  // before any market opened, so we re-enter the market chain directly;
  // the rollover runs at its end (finishWithRollover), landing on a fresh
  // season — never on a stale "Continue to playoffs" Hub.
  function resumeOffSeasonMarket(): void {
    if (!gameEngine) { goHub(); return; }
    const market = gameEngine.getState().career.market;
    runOffSeasonMarkets(market?.phase === 'signings' ? 'signings' : 'renewals');
  }

  // Drives one playoff "week" as a normal weekly cycle. Called from the Hub's
  // onPlayoffs CTA and from continueGame() when the bracket is live.
  //
  // If the player has a match this stage → play it, then sim remaining AI
  // matches, then show the bracket as round results → training → Hub.
  // If no player match → auto-sim all AI matches silently → bracket → training → Hub.
  // No training after the Final — the season is over, Hub continues to EndOfSeason.
  // Champion already crowned → skip straight to EndOfSeason.
  async function runPlayoffWeek(): Promise<void> {
    if (!gameEngine) { goHub(); return; }
    const state = gameEngine.getState();
    const playoffs = state.league.playoffs;
    if (!playoffs) { goHub(); return; }

    if (playoffs.championTeamId !== null) {
      runEndOfSeasonChain();
      return;
    }

    const stage: 'sf' | 'final' = playoffs.semifinals.every(m => m.result) ? 'final' : 'sf';
    const playerMatch = gameEngine.getPlayerPlayoffMatch();

    const afterStageResolved = (): void => {
      if (stage === 'sf') {
        // SF week: show bracket results → training (prep for Final) → Hub.
        showPlayoffBracket(() => {
          showTrainingPostMatch((results) => {
            showPostTrainingResults(results, () => {
              if (gameEngine) autosave(gameEngine.toSavePayload());
              goHub();
            });
            screenRouter.show('training-results');
          }, { playoffLabel: 'Final' });
          screenRouter.show('training');
        }, 'Continue');
      } else {
        // Final week: show bracket results → Hub (Hub CTA then → EndOfSeason).
        showPlayoffBracket(() => {
          if (gameEngine) autosave(gameEngine.toSavePayload());
          goHub();
        }, 'Continue');
      }
      screenRouter.show('playoff-bracket');
    };

    if (playerMatch && playerMatch.homeId && playerMatch.awayId) {
      onPlayPlayoff(playerMatch, async () => {
        if (gameEngine) {
          await gameEngine.simulatePendingPlayoffMatches(stage);
          autosave(gameEngine.toSavePayload());
        }
        afterStageResolved();
      });
    } else {
      await gameEngine.simulatePendingPlayoffMatches(stage);
      autosave(gameEngine.toSavePayload());
      afterStageResolved();
    }
  }

  function onPlayPlayoff(match: PlayoffMatch, onAfterResult: () => void): void {
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
    const playerRawTeam = playerSide === 'home' ? homeTeam : awayTeam;
    const oppRawTeam    = playerSide === 'home' ? awayTeam : homeTeam;
    initPreMatchScreen(
      rosteredHome,
      rosteredAway,
      playerSide,
      0, // round is unused in playoff mode — context label overrides it
      gameEngine,
      (configuredHome, configuredAway, playerTactics) => {
        const playerConfigured = playerSide === 'home' ? configuredHome : configuredAway;
        if (gameEngine) {
          gameEngine.setPlayerTactics(playerTactics);
          gameEngine.setPlayerMatchdaySquad(extractMatchdaySquad(playerConfigured));
          autosave(gameEngine.toSavePayload());
        }
        // Show team talk screen before the playoff match.
        const avgMorale = computeAverageMorale(playerConfigured);
        initTeamTalkScreen(
          { name: playerRawTeam.name, shortName: playerRawTeam.shortName, color: playerRawTeam.color },
          { name: oppRawTeam.name, shortName: oppRawTeam.shortName, color: oppRawTeam.color },
          contextLabel,
          playerConfigured.players.slice(0, 15),
          avgMorale,
          (talkArgs) => {
            onPlayoffMatchStart(configuredHome, configuredAway, playerSide, match, playerTactics, onAfterResult, talkArgs, avgMorale);
          },
        );
        screenRouter.show('team-talk');
      },
      () => goHub('back'),
      { contextLabel, neutralVenue: isFinal, backLabel: 'Hub' },
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
    onAfterResult: () => void,
    humanPreTalk?: TalkArgs,
    humanSquadMorale?: number,
  ): void {
    const humanConfigured = playerSide === 'home' ? configuredHome : configuredAway;
    const humanCaptainRosterId = resolveCaptainRosterId(humanConfigured.players, gameEngine?.getState().player.captainRosterId);
    const engine = new MatchCoordinator(configuredHome, configuredAway, {
      tickDelayMs: loadTickDelayMs(),
      playerTactics,
      humanSide: playerSide,
      neutralVenue: match.kind === 'final',
      isPlayoffSemi: match.kind !== 'final',
      humanCaptainRosterId,
      humanPreTalk,
      humanSquadMorale,
    });
    initSimController(engine);

    const unsub = eventBus.on('engine:finished', ({ state }) => {
      unsub();
      showPlayoffMatchResult(engine, state, match, onAfterResult);
    });
    // Initialise BEFORE revealing #app — see onMatchStart for the rationale.
    engine.initialize();
    screenRouter.show('app');
  }

  function showPlayoffMatchResult(
    engine: MatchCoordinator,
    state: MatchState,
    match: PlayoffMatch,
    onAfterResult: () => void,
  ): void {
    initMatchResultScreen(state, 0, null, async () => {
      const snapshot = snapshotMatch(state, state.homeTeam.id, state.awayTeam.id);
      engine.destroy();
      if (gameEngine) {
        await gameEngine.recordPlayerPlayoffResult(match.kind, state.score.home, state.score.away, snapshot);
        gameEngine.advancePlayoffWeekScouting();
        autosave(gameEngine.toSavePayload());
      }
      onAfterResult();
    });
    screenRouter.show('match-result');
  }

  // Compute average morale of the player's starting XV from the career roster.
  function computeAverageMorale(playerConfigured: RawTeamInput): number {
    if (!gameEngine) return MORALE.baseline;
    const careerState = gameEngine.getState();
    const starters = playerConfigured.players.slice(0, 15);
    if (starters.length === 0) return MORALE.baseline;
    let sum = 0;
    for (const p of starters) {
      const rosterId = (p as { rosterId?: number }).rosterId ?? 0;
      const rosterPlayer = rosterId ? careerState.career.roster[rosterId] : null;
      sum += rosterPlayer?.morale ?? MORALE.baseline;
    }
    return sum / starters.length;
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
    const playerRawTeam = playerSide === 'home' ? homeTeam : awayTeam;
    const oppRawTeam    = playerSide === 'home' ? awayTeam : homeTeam;
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
        const playerConfigured = playerSide === 'home' ? configuredHome : configuredAway;
        if (gameEngine) {
          gameEngine.setPlayerTactics(playerTactics);
          gameEngine.setPlayerMatchdaySquad(extractMatchdaySquad(playerConfigured));
          autosave(gameEngine.toSavePayload());
        }
        // Show the team talk screen before starting the match.
        const avgMorale = computeAverageMorale(playerConfigured);
        initTeamTalkScreen(
          { name: playerRawTeam.name, shortName: playerRawTeam.shortName, color: playerRawTeam.color },
          { name: oppRawTeam.name, shortName: oppRawTeam.shortName, color: oppRawTeam.color },
          `Round ${round}`,
          playerConfigured.players.slice(0, 15),
          avgMorale,
          (talkArgs) => {
            onMatchStart(configuredHome, configuredAway, playerSide, round, playerTactics, talkArgs, avgMorale);
          },
        );
        screenRouter.show('team-talk');
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
    humanPreTalk?: TalkArgs,
    humanSquadMorale?: number,
  ): void {
    const liveState = gameEngine!.getState();
    const liveFixture = liveState.league.fixtures.find(f =>
      f.round === round && f.homeId === configuredHome.id && f.awayId === configuredAway.id,
    );
    const homeFillRate = liveFixture && configuredHome.stadiumCapacity
      ? computeAttendance(liveFixture, configuredHome.stadiumCapacity, liveState.league.standings, liveState.league.results) / configuredHome.stadiumCapacity
      : HOME_ADVANTAGE.crowdFillNeutral;
    const humanConfigured = playerSide === 'home' ? configuredHome : configuredAway;
    const humanCaptainRosterId = resolveCaptainRosterId(humanConfigured.players, liveState.player.captainRosterId);
    const engine = new MatchCoordinator(configuredHome, configuredAway, { tickDelayMs: loadTickDelayMs(), playerTactics, humanSide: playerSide, homeFillRate, isDerby: liveFixture?.isDerby ?? false, humanCaptainRosterId, humanPreTalk, humanSquadMorale });
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

  // Pre-season cup chain: cup fixtures (+ direction) → training plan →
  // [block runs] → cup results → training impact → afterBlock.
  // No call-ups and no returns screen (not an international window).
  function runPreSeasonCupChain(begin: PreSeasonBlockResult, eng: GameCoordinator, afterBlock: () => void): void {
    showCupFixturesPreBlock(begin, (direction) => {
      eng.setCupDirection(direction);
      showTrainingPostMatch((results) => {
        const toPostTraining = () => {
          showPostTrainingResults(results, afterBlock);
          screenRouter.show('training-results');
        };
        showCupResults(0, toPostTraining);
        screenRouter.show('cup-results');
      }, { runBlock: (weeks) => eng.runPreSeasonBlock(weeks) });
      screenRouter.show('training');
    });
    screenRouter.show('cup-fixtures');
  }

  // International-break screen chain: call-ups → cup fixtures (+ direction)
  // → training plan → [block runs] → cup results → training impact →
  // international returns → afterTraining. The Assistant Manager runs the
  // cup headless inside runInternationalBreakBlock (the training Continue).
  function runInternationalBreakChain(begin: BreakBeginResult, eng: GameCoordinator, afterTraining: () => void): void {
    showInternationalCallUps(begin, () => {
      showCupFixturesPreBlock(begin, (direction) => {
        begin.cupDirection = direction;
        eng.setCupDirection(direction);
        showTrainingPostMatch((results) => {
          // After the block: cup results → training impact → international
          // returns → the chain's next step (Hub via the mid-season poach gate).
          const toReturns = results.international
            ? () => {
                showInternationalBreak(results.international!, afterTraining);
                screenRouter.show('international-break');
              }
            : afterTraining;
          const toPostTraining = () => {
            showPostTrainingResults(results, toReturns);
            screenRouter.show('training-results');
          };
          showCupResults(begin.cupLeg, toPostTraining);
          screenRouter.show('cup-results');
        }, { runBlock: (weeks) => eng.runInternationalBreakBlock(weeks, begin) });
        screenRouter.show('training');
      });
      screenRouter.show('cup-fixtures');
    });
    screenRouter.show('intl-callups');
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
        autosave(gameEngine.toSavePayload());
        if (shouldFirePresser(gameEngine.getState())) {
          const presser = buildPresser(gameEngine.getState(), id => allTeams.find(t => t.id === id)?.name ?? id);
          await new Promise<void>(resolve => {
            showPressConference(presser, choices => {
              const answers = choices.skipped
                ? []
                : choices.answers.map(tone => PRESS_ANSWER_EFFECTS[tone!]);
              gameEngine!.applyPressEffects(choices.skipped, answers);
              autosave(gameEngine!.toSavePayload());
              resolve();
            });
          });
        }
      }
      // Post-match nav chain: RoundResults → LeagueTable → TrainingScreen → Hub.
      // After the last regular round (R18) this is identical — the Hub then shows
      // the playoff fixtures and the normal weekly cycle continues through them.
      const onLeagueContinue = (): void => {
        // Show a playoff-context label on training when the bracket just seeded
        // (qualifiers see "Semi-Final"; non-qualifiers see "Playoffs").
        const s = gameEngine?.getState();
        const poffs = s?.league.playoffs;
        const playoffLabel = poffs && poffs.championTeamId === null && s?.player.teamId
          ? (poffs.semifinals.some(m => m.homeId === s.player.teamId || m.awayId === s.player.teamId)
              ? 'Semi-Final' : 'Playoffs')
          : undefined;
        const afterTraining = (): void => {
          if (gameEngine?.isManagerSacked()) { runSackScreen('midseason'); return; }
          maybeRunMidseasonPoach(() => {
            maybePlayEuropeanFixture(() => { if (gameEngine) autosave(gameEngine.toSavePayload()); goHub(); });
          });
        };
        // International break detection (RNG-free): flags the call-ups and
        // reads this block's Prem Cup fixtures. When present, the break runs
        // its own screen chain (call-ups → cup fixtures + direction → training
        // → cup results → training impact → returns). Otherwise the plain
        // post-match training path. beginInternationalBreak() returns null for
        // all regular-season rounds outside the two break windows, including R18.
        const eng = gameEngine;
        const begin = eng ? eng.beginInternationalBreak() : null;
        if (begin && eng) {
          runInternationalBreakChain(begin, eng, afterTraining);
          return;
        }
        showTrainingPostMatch((results) => {
          showPostTrainingResults(results, afterTraining);
          screenRouter.show('training-results');
        }, { playoffLabel });
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

  // Recursively play all European fixtures that are due before the next
  // league match. Calls onDone when none remain.
  function maybePlayEuropeanFixture(onDone: () => void): void {
    if (!gameEngine) { onDone(); return; }
    const euroFix = gameEngine.getCurrentEuropeanFixture();
    if (!euroFix) { onDone(); return; }
    onPlayEuropeanMatch(euroFix, () => maybePlayEuropeanFixture(onDone));
  }

  function onPlayEuropeanMatch(euroFix: EuropeanFixtureRef, onAfterResult: () => void): void {
    if (!gameEngine) return;
    const state = gameEngine.getState();
    const playerTeamId = state.player.teamId;
    const homeId = euroFix.kind === 'pool' ? euroFix.fixture.homeId : (euroFix.match.homeId ?? '');
    const awayId = euroFix.kind === 'pool' ? euroFix.fixture.awayId : (euroFix.match.awayId ?? '');
    const resolveTeam = (id: string): RawTeamInput => {
      const prem = allTeams.find(t => t.id === id);
      if (prem) return id === playerTeamId ? buildTeamFromRoster(state, prem) : buildAutoSelectedTeamFromRoster(state, prem);
      return buildEuropeanOpponent(id)!;
    };
    const homeTeam = resolveTeam(homeId);
    const awayTeam = resolveTeam(awayId);
    const playerSide: 'home' | 'away' = homeId === playerTeamId ? 'home' : 'away';
    const playerRawTeam = playerSide === 'home' ? homeTeam : awayTeam;
    const oppRawTeam    = playerSide === 'home' ? awayTeam : homeTeam;
    const stageLabel = euroFix.kind === 'pool'
      ? `Pool Round ${euroFix.fixture.round}`
      : (euroFix.stage === 'r16' ? 'Round of 16' : euroFix.stage === 'quarterfinal' ? 'Quarter-Final' : euroFix.stage === 'semifinal' ? 'Semi-Final' : 'Final');
    const compLabel = euroFix.competition === 'europeanCup' ? 'European Cup' : 'European Shield';
    const contextLabel = `${compLabel} · ${stageLabel}`;
    initPreMatchScreen(
      homeTeam, awayTeam, playerSide, 0, gameEngine,
      (configuredHome, configuredAway, playerTactics) => {
        const playerConfigured = playerSide === 'home' ? configuredHome : configuredAway;
        if (gameEngine) {
          gameEngine.setPlayerTactics(playerTactics);
          gameEngine.setPlayerMatchdaySquad(extractMatchdaySquad(playerConfigured));
          autosave(gameEngine.toSavePayload());
        }
        const avgMorale = computeAverageMorale(playerConfigured);
        initTeamTalkScreen(
          { name: playerRawTeam.name, shortName: playerRawTeam.shortName, color: playerRawTeam.color },
          { name: oppRawTeam.name, shortName: oppRawTeam.shortName, color: oppRawTeam.color },
          contextLabel,
          playerConfigured.players.slice(0, 15),
          avgMorale,
          (talkArgs) => {
            onEuropeanMatchStart(configuredHome, configuredAway, playerSide, euroFix, playerTactics, onAfterResult, talkArgs, avgMorale);
          },
        );
        screenRouter.show('team-talk');
      },
      () => goHub('back'),
      { contextLabel, neutralVenue: euroFix.kind === 'knockout' && euroFix.stage === 'final', backLabel: 'Hub' },
      goSquadFromPreMatch,
      (rosterId, returnStep) => goPlayerProfile(rosterId, () => {
        showPreMatchAtStep(returnStep);
        screenRouter.show('pre-match', { direction: 'back' });
      }),
    );
    screenRouter.show('pre-match');
  }

  function onEuropeanMatchStart(
    configuredHome: RawTeamInput,
    configuredAway: RawTeamInput,
    playerSide: 'home' | 'away',
    euroFix: EuropeanFixtureRef,
    playerTactics: TeamTactics,
    onAfterResult: () => void,
    humanPreTalk?: TalkArgs,
    humanSquadMorale?: number,
  ): void {
    const humanConfigured = playerSide === 'home' ? configuredHome : configuredAway;
    const humanCaptainRosterId = resolveCaptainRosterId(humanConfigured.players, gameEngine?.getState().player.captainRosterId);
    const engine = new MatchCoordinator(configuredHome, configuredAway, {
      tickDelayMs: loadTickDelayMs(),
      playerTactics,
      humanSide: playerSide,
      humanCaptainRosterId,
      humanPreTalk,
      humanSquadMorale,
    });
    initSimController(engine);
    const unsub = eventBus.on('engine:finished', ({ state }) => {
      unsub();
      showEuropeanMatchResult(engine, state, euroFix, onAfterResult);
    });
    engine.initialize();
    screenRouter.show('app');
  }

  function showEuropeanMatchResult(
    engine: MatchCoordinator,
    state: MatchState,
    euroFix: EuropeanFixtureRef,
    onAfterResult: () => void,
  ): void {
    initMatchResultScreen(state, 0, null, async () => {
      const snapshot = snapshotMatch(state, state.homeTeam.id, state.awayTeam.id);
      engine.destroy();
      if (gameEngine) {
        if (euroFix.kind === 'pool') {
          await gameEngine.recordPlayerEuropeanPoolResult(
            euroFix.competition,
            euroFix.fixture.poolId,
            euroFix.fixture.round,
            euroFix.fixture.homeId,
            euroFix.fixture.awayId,
            state.score.home,
            state.score.away,
            snapshot,
          );
        } else {
          await gameEngine.recordPlayerEuropeanKnockoutResult(
            euroFix.competition,
            euroFix.stage,
            euroFix.match.matchIndex,
            state.score.home,
            state.score.away,
            snapshot,
          );
        }
        autosave(gameEngine.toSavePayload());
      }
      onAfterResult();
    });
    screenRouter.show('match-result');
  }

  // Surface a debounced, non-blocking warning when autosave can't write
  // (storage full / disabled). Keeps autosave silent on success.
  eventBus.on('save:failed', () =>
    showToast("Couldn't save — storage full. Export your career to be safe.", 'danger'));

  // Persist the live game synchronously. Called when the app is backgrounded
  // (iOS WKWebView can kill a backgrounded app) and from the global error
  // net, so progress between the discrete autosave points is never lost.
  // Ignores the boolean — there's no useful recovery during teardown.
  const flushActiveGame = (): void => {
    if (!inSeasonInited || !gameEngine) return;
    try { saveGame(gameEngine.toSavePayload()); } catch { /* teardown best-effort */ }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushActiveGame();
  });
  window.addEventListener('pagehide', flushActiveGame);

  // Global crash net for anything that escapes the match-tick path (which has
  // its own engine:error → CrashOverlay). Attempt an emergency save, then tell
  // the player their game is safe. Passive (no preventDefault) so existing
  // logging is unaffected.
  const emergencySaveAndWarn = (message: string): void => {
    flushActiveGame();
    console.error('Unhandled error:', message);
    showToast('Something went wrong — your game was saved. Please reopen the app.', 'danger');
  };
  window.addEventListener('error', (e) => {
    // Ignore resource-load failures (img/script/link) — those surface as an
    // error event with no `.error` object and aren't app crashes.
    if (!e.error) return;
    emergencySaveAndWarn(e.message);
  });
  window.addEventListener('unhandledrejection', (e) =>
    emergencySaveAndWarn(String((e as PromiseRejectionEvent).reason)));

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
