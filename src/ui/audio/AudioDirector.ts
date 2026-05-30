// Audio routing layer — the single subscriber that turns game activity into
// cues. Reads the event bus (match + season) and the screen router, and calls
// the SoundManager engine (playId / playBed / stopBed). Keeping all the
// "which moment plays which sound" logic here means the engine stays a dumb
// mixer and the rest of the UI never touches audio directly.
//
// Match cues key off the same signal CommentaryFeed / keyMoment use: the
// GameEvent's `phase` and its narration step `key`s — the canonical, stable
// description of what just happened (GameEvent doesn't expose raw MatchEvent
// fields, but the narration keys cover every outcome we care about).

import { eventBus } from '../../utils/eventBus';
import { onScreenShow, type ScreenId } from '../ScreenRouter';
import { MatchPhase } from '../../types/engine';
import type { GameEvent } from '../../types/match';
import { playId, playBed, stopBed } from '../SoundManager';

// Screen → looping music bed. 'app' (live match) is deliberately absent: the
// match runs the crowd bed instead, started/stopped by the engine lifecycle
// handlers below. Screens with no entry keep music silent (stopBed).
const SCREEN_MUSIC: Partial<Record<ScreenId, string>> = {
  'home':           'music.home',
  'settings':       'music.home',
  'team-selector':  'music.home',
  'mode-picker':    'music.home',
  'team-info':      'music.hub',
  'hub':            'music.hub',
  'fixture-list':   'music.hub',
  'league-table':   'music.hub',
  'league-menu':    'music.hub',
  'team-stats':     'music.hub',
  'player-stats':   'music.hub',
  'player-profile': 'music.hub',
  'squad-management':'music.hub',
  'squad-overview': 'music.hub',
  'training':       'music.hub',
  'training-results':'music.hub',
  'contracts':      'music.hub',
  'round-results':  'music.hub',
  'playoff-bracket':'music.hub',
  'budget-reveal':  'music.hub',
  'takeover-reveal':'music.hub',
  'end-of-season':  'music.hub',
  'rollover':       'music.hub',
  'pre-match':      'music.prematch',
  'transfer-market':'music.transfer',
  'renewals':       'music.transfer',
  'retention-decision':'music.transfer',
  'signing-results':'music.transfer',
};

function routeScreen(id: ScreenId): void {
  if (id === 'app') { stopBed('music'); return; } // crowd bed drives the match
  const bed = SCREEN_MUSIC[id];
  if (bed) playBed(bed);
  else stopBed('music');
}

// Crowd-bed intensity tier for an event's world frame. Inside either 22 or a
// goal-kick build-up → tension; live open play → engaged; everything else
// (set pieces, restarts, stoppages) → idle.
function crowdBedFor(event: GameEvent, keys: Set<string>): string {
  if (keys.has('kicker_steps_up') ||
      event.phase === MatchPhase.KickAtGoal ||
      event.phase === MatchPhase.ConversionKick) {
    return 'crowd.bed.tension';
  }
  if (event.ballX >= 78 || event.ballX <= 22) return 'crowd.bed.tension';
  switch (event.phase) {
    case MatchPhase.PhasePlay:
    case MatchPhase.FirstPhase:
    case MatchPhase.KickReturn:
    case MatchPhase.Breakdown:
      return 'crowd.bed.engaged';
    default:
      return 'crowd.bed.idle';
  }
}

function routeMatchEvent(event: GameEvent): void {
  // Collect the outcome / announcement keys (the tactic_note step variant
  // carries a `cause`, not a `key`, so it's skipped).
  const keys = new Set<string>();
  for (const s of event.narration.steps) {
    if (s.kind === 'phase_outcome' || s.kind === 'announcement') keys.add(s.key);
  }

  // Continuous atmosphere — crossfade the crowd bed toward the current tier.
  // This runs even when paused so the stadium stays alive.
  playBed(crowdBedFor(event, keys));

  // One-shot cues (whistles, impacts, crowd reactions) are suppressed while
  // paused. The presenter drains buffered beats after a pause, so without this
  // guard those cues would fire even though the engine has stopped ticking.
  if (!matchRunning) return;

  // ── Phase-anchored cues (whistles + set-piece impacts) ──────────────────
  switch (event.phase) {
    case MatchPhase.TryScored:
      playId('whistle.try');
      playId(keys.has('try_level') || keys.has('try_trail') ? 'crowd.try.huge' : 'crowd.try.routine');
      break;
    case MatchPhase.HalfTime:
      playId('whistle.half_time');
      break;
    case MatchPhase.FullTime:
      playId('whistle.full_time');
      break;
    case MatchPhase.Scrum:
      playId('impact.scrum.engage');
      break;
    case MatchPhase.Lineout:
      playId('impact.lineout.throw');
      break;
    case MatchPhase.BoxKick:
    case MatchPhase.TacticalKick:
      playId('impact.boot.punt');
      break;
    default:
      break;
  }

  // ── Narration-key cues (the finest-grained outcomes) ────────────────────
  // Penalty awarded — every offence narration key ends in `_penalty`.
  for (const k of keys) {
    if (k.endsWith('_penalty')) { playId('whistle.penalty'); break; }
  }

  if (keys.has('knock_on')) { playId('whistle.stoppage'); playId('crowd.groan'); }
  if (keys.has('scrappy_knock_on') || keys.has('crooked_throw')) playId('crowd.groan');

  if (keys.has('line_break') || keys.has('line_break_try') || keys.has('interception')) {
    playId('crowd.surge.linebreak');
  }
  if (keys.has('dominant_tackle')) { playId('impact.tackle.hard'); playId('crowd.oooh.bighit'); }
  else if (keys.has('dominant_carry') || keys.has('dominant_carry_try')) playId('impact.tackle.hard');
  else if (keys.has('crash_ball') || keys.has('play_on') || keys.has('pick_and_go_play_on')) {
    playId('impact.tackle.soft');
  }
  if (keys.has('turnover')) playId('crowd.cheer.turnover');
  if (keys.has('maul_won') || keys.has('maul_try')) playId('impact.maul.drive');

  // Goal kicks.
  if (keys.has('kicker_steps_up')) playId('crowd.clap_build');
  if (keys.has('success')) playId('crowd.goal.success');
  if (keys.has('miss')) playId('crowd.goal.miss');

  // Cards & TMO. The review drone is a bed on the stinger channel started when
  // the TMO intervenes and stopped (replaced by the verdict one-shot) when the
  // decision lands.
  if (keys.has('tmo_intervenes')) playBed('stinger.tmo.review');
  if (keys.has('tmo_decision_no_card')) { stopBed('stinger'); playId('stinger.tmo.no_card'); }
  if (keys.has('tmo_decision_yellow')) { stopBed('stinger'); playId('stinger.tmo.yellow'); playId('crowd.gasp.card'); }
  if (keys.has('tmo_decision_red_20')) { stopBed('stinger'); playId('stinger.tmo.red'); playId('crowd.gasp.card'); }
  // Direct cards (team-22 / maul-collapse) with no TMO narrative.
  if (keys.has('card_yellow') || keys.has('card_red_20') || keys.has('card_red_full')) {
    playId('crowd.gasp.card');
  }

  if (keys.has('injury_off')) playId('stinger.injury');
}

// True only while the engine is actively ticking. Buffered beats can still
// arrive on engine:event after the user pauses (the presenter drains ahead of
// the producer), so one-shot cues are gated behind this flag. The crowd bed
// is exempt — the atmosphere stays live while paused.
let matchRunning = false;

let inited = false;
export function initAudioDirector(): void {
  if (inited) return;
  inited = true;

  onScreenShow(routeScreen);

  // Match lifecycle: open the crowd bed at kickoff, close it (and any lingering
  // TMO drone) at the final whistle.
  eventBus.on('engine:initialized', () => { matchRunning = false; playBed('crowd.bed.idle'); });
  eventBus.on('engine:resumed',     () => { matchRunning = true; });
  eventBus.on('engine:paused',      () => { matchRunning = false; });
  eventBus.on('engine:autoPaused',  () => { matchRunning = false; });
  eventBus.on('engine:finished',    () => { matchRunning = false; stopBed('crowd-bed'); stopBed('stinger'); });
  eventBus.on('engine:event', ({ event }) => routeMatchEvent(event));

  // Season beats.
  eventBus.on('game:bracketSeeded',  () => playId('stinger.playoff_reveal'));
  eventBus.on('game:seasonComplete', () => playId('stinger.champion'));
}
