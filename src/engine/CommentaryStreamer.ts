// The match presenter: a beat buffer drained at a single steady cadence.
//
// The engine (producer) resolves phases as fast as it can and enqueues each
// resulting GameEvent as a Beat (event + display snapshot). The presenter
// drains the buffer at a steady wall-clock gap, decoupled from how bursty
// production was — a quiet stretch and a 5-event penalty tick both read out
// at the same rhythm.
//
// Cadence: the paced unit is the narration LINE, not the beat. After draining
// a beat the presenter waits `lineGap × (steps in that beat)` before the next,
// where `lineGap = tickDelayMs × COMMENTARY_PACING.lineGapFraction`. The feed's
// multi-step reveal staggers the lines WITHIN a multi-step beat at the same
// lineGap, so the next beat arrives exactly one lineGap after the last line of
// the current one — a quiet single-line beat and a five-line try sequence read
// out at one steady line rhythm rather than trickle-then-burst. The producer
// runs ahead (see MatchCoordinator's run-ahead throttle, which reads
// bufferDepth()/beatGap()) keeping a small cushion of beats so the presenter
// never starves; the cushion is drained to empty at each human-decision
// boundary (penalty / kick-off / forced-sub modal, half-time, full-time) via
// an awaited flush so the user reads the lead-up before the prompt.
//
// Each beat carries a DisplaySnapshot captured at production time (the world
// frame — score, clock, ball, possession, cards). On drain we emit
// `engine:event` followed by `engine:stateChange` carrying that snapshot
// alongside the live state reference, preserving the event-before-state
// contract. Panels that read the snapshot (Scoreboard, PitchStrip, StatsPanel
// summary) track the line being narrated rather than the live (ahead) state;
// StatsPanel's per-player tables still read the live state.
//
// Silent mode (headless AI fixtures, determinism harness, telemetry)
// bypasses the presenter entirely — the engine's existing `if (silent)
// return` guards in each emit site already gate this; the presenter adds
// its own check as a safety net, and the run-ahead throttle is skipped so
// silent fixtures run flat-out.

import { eventBus } from '../utils/eventBus';
import type { GameEvent, MatchState, Beat } from '../types/match';
import { buildDisplaySnapshot } from './displaySnapshot';
import { COMMENTARY_PACING } from './balance';

export class CommentaryStreamer {
  private buffer: Beat[] = [];
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  // Absolute timestamp at which the currently-scheduled drain would fire.
  // Used by pause() to compute how much time remains so resume() can pick up
  // the same beat.
  private drainTimerFiresAt = 0;
  // Live tickDelayMs, refreshed on every flush — the basis for the cadence.
  private tickDelayMs = 0;
  private liveState: MatchState | null = null;
  // A single promise per drain cycle, resolved when the buffer empties. All
  // flush() callers within one cycle share it, so the per-tick (non-awaited)
  // flushes don't accumulate one resolver each while the producer runs ahead.
  private drainPromise: Promise<void> | null = null;
  private drainPromiseResolve: (() => void) | null = null;
  private readonly silent: boolean;
  // Live MatchState reference (stable for the match lifetime — assigned once
  // in MatchCoordinator's constructor, never reassigned). Read at enqueue
  // time to snapshot the world frame for each beat.
  private readonly state: MatchState;
  private paused = false;
  private pauseRemainingMs = 0;
  // Earliest wall-clock time the next line may be emitted — `lineGap × lines`
  // after the previous emit. Enforced even when the buffer empties between
  // beats (the drain loop stops, but the gap owed by the last line carries
  // over to the next beat, which may be produced a tick or two later). Without
  // this, a beat produced just after the buffer drained empty — the lineout
  // that follows a penalty-to-touch, the set-piece award after a knock-on —
  // fires back-to-back with the previous line instead of one lineGap later.
  private nextAllowedAt = 0;

  constructor(silent: boolean, state: MatchState) {
    this.silent = silent;
    this.state = state;
  }

  enqueue(event: GameEvent): void {
    if (this.silent) return;
    // Snapshot the display frame NOW (production time) so the paced drain
    // emits the world-state as it was when this event happened, not the live
    // state — which, with the producer running ahead, is further along than
    // the line being narrated.
    this.buffer.push({ event, display: buildDisplaySnapshot(this.state) });
  }

  // Current number of buffered (not-yet-shown) beats. Read by the producer's
  // run-ahead throttle.
  bufferDepth(): number {
    return this.buffer.length;
  }

  // Per-line wall-clock gap, given the live tickDelayMs — the steady cadence
  // every narration line is shown at (the gap after a beat scales by its line
  // count; see drainOne).
  private lineGap(): number {
    return this.tickDelayMs * COMMENTARY_PACING.lineGapFraction;
  }

  // Reference "typical beat drain time" given the live tickDelayMs. Used by the
  // producer as its run-ahead poll interval / look-ahead lag unit — NOT the
  // line cadence (that's lineGap, scaled per beat in drainOne).
  beatGap(): number {
    return this.tickDelayMs * COMMENTARY_PACING.beatGapFraction;
  }

  // Starts (or continues) draining the buffer. Returns a promise that resolves
  // when the buffer empties — await before opening a modal so the user reads
  // the commentary that led to it. For the background drain at end-of-tick,
  // don't await; the presenter paces in the background while the producer tops
  // the buffer back up. If a drain is already in flight, this just refreshes
  // tickDelayMs / liveState and lets the running loop pick up the new beats.
  flush(tickDelayMs: number, state: MatchState): Promise<void> {
    if (this.silent || this.buffer.length === 0) return Promise.resolve();
    this.tickDelayMs = tickDelayMs;
    this.liveState = state;
    if (!this.drainPromise) {
      this.drainPromise = new Promise<void>(resolve => { this.drainPromiseResolve = resolve; });
    }
    // Kick the loop only when idle — a running drain already covers the new
    // beats. The kick honours the gap owed by the last emitted line, so the
    // first beat after the buffer drained empty doesn't fire back-to-back with
    // it; a genuinely idle stretch (e.g. modal think-time) leaves nextAllowedAt
    // in the past, so it still appears promptly.
    if (this.drainTimer === null && !this.paused) this.kickDrain();
    return this.drainPromise;
  }

  // Pause: stop the drain timer, remember how long until the next beat would
  // have fired so resume() can pick up the same beat.
  pause(): void {
    if (this.silent || !this.drainTimer) return;
    this.paused = true;
    clearTimeout(this.drainTimer);
    this.drainTimer = null;
    this.pauseRemainingMs = Math.max(0, this.drainTimerFiresAt - Date.now());
  }

  resume(): void {
    if (this.silent || !this.paused) return;
    this.paused = false;
    if (this.buffer.length === 0) return;
    this.scheduleNext(this.pauseRemainingMs);
  }

  // Wipe buffered beats and pending timers. Called on new match init so beats
  // from a prior match don't leak into the next. Resolves any pending drain
  // promise so an awaiting modal flow doesn't hang after teardown.
  clear(): void {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    this.buffer = [];
    this.liveState = null;
    this.paused = false;
    this.nextAllowedAt = 0;
    this.resolveDrain();
  }

  // Resume an idle drain after the owed inter-line gap. Called from flush when
  // no drain timer is running: if the gap from the last emit has already
  // elapsed, drain now; otherwise schedule the remainder so the next line lands
  // a full lineGap after the previous one.
  private kickDrain(): void {
    const wait = this.nextAllowedAt - Date.now();
    if (wait <= 0) this.drainOne();
    else this.scheduleNext(wait);
  }

  private drainOne(): void {
    this.drainTimer = null;
    if (this.buffer.length === 0) {
      this.resolveDrain();
      return;
    }
    const { event, display } = this.buffer.shift()!;
    eventBus.emit('engine:event', { event });
    if (this.liveState) eventBus.emit('engine:stateChange', { state: this.liveState, display });
    // Owe one lineGap per narration line in the beat just shown, so the feed
    // (which staggers a multi-step beat's lines at the same lineGap) finishes
    // revealing them before the next beat lands — keeping the line cadence even
    // across single- and multi-line beats. Set before the empty-buffer return
    // so the gap carries over to a beat produced in a later tick (see
    // kickDrain). `max(1, …)` guards an empty-step beat.
    const gap = this.lineGap() * Math.max(1, event.narration.steps.length);
    this.nextAllowedAt = Date.now() + gap;
    if (this.buffer.length === 0) {
      this.resolveDrain();
      return;
    }
    this.scheduleNext(gap);
  }

  private scheduleNext(delay: number): void {
    if (this.paused) return;
    this.drainTimerFiresAt = Date.now() + delay;
    this.drainTimer = setTimeout(() => this.drainOne(), delay);
  }

  private resolveDrain(): void {
    const resolve = this.drainPromiseResolve;
    this.drainPromise = null;
    this.drainPromiseResolve = null;
    if (resolve) resolve();
  }
}
