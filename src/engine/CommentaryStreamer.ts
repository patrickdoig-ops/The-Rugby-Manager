// Paces commentary events so the UI doesn't see two narration lines arrive
// in the same animation frame. The engine emits one event per phase
// resolution but a single tick can produce several (kick-off announce +
// kick resolution, penalty + lineout award, etc) — without pacing, both
// .commentary-entry rows slide in together and the user can't tell which
// happened first.
//
// Cadence is derived from the engine's tickDelayMs: events queued during
// a tick are flushed evenly across that interval (spacing = tickDelayMs /
// eventsThisTick). At 1x with tickDelayMs ≈ 600ms and a 2-event tick the
// lines land 300ms apart; at 4x with tickDelayMs ≈ 150ms they land 75ms
// apart. Speed selection IS the cadence — no separate constant.
//
// Each enqueued event is paired with a DisplaySnapshot captured at
// production time (the "world frame" — score, clock, ball, possession,
// cards). On flush we emit `engine:event` followed by `engine:stateChange`
// carrying that snapshot alongside the live state reference, preserving the
// event-before-state contract. Panels that read the snapshot (Scoreboard,
// PitchStrip) therefore track the line being narrated rather than the live
// state; StatsPanel still reads the live state for its per-player tables.
//
// Silent mode (headless AI fixtures, determinism harness, telemetry)
// bypasses the streamer entirely — the engine's existing `if (silent)
// return` guards in each emit site already gate this; the streamer adds
// its own check as a safety net.

import { eventBus } from '../utils/eventBus';
import type { GameEvent, MatchState, DisplaySnapshot } from '../types/match';
import { buildDisplaySnapshot } from './displaySnapshot';

export class CommentaryStreamer {
  private queue: Array<{ event: GameEvent; display: DisplaySnapshot }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  // Absolute timestamp at which the currently-scheduled flush would fire.
  // Used by pause() to compute how much time remains so resume() can
  // pick up the same beat.
  private flushTimerFiresAt = 0;
  private spacingMs = 0;
  private liveState: MatchState | null = null;
  private drainResolvers: Array<() => void> = [];
  private readonly silent: boolean;
  // Live MatchState reference (stable for the match lifetime — assigned once
  // in MatchCoordinator's constructor, never reassigned). Read at enqueue
  // time to snapshot the world frame for each event.
  private readonly state: MatchState;
  private paused = false;
  private pauseRemainingMs = 0;

  constructor(silent: boolean, state: MatchState) {
    this.silent = silent;
    this.state = state;
  }

  enqueue(event: GameEvent): void {
    if (this.silent) return;
    // Snapshot the display frame NOW (production time) so the paced flush
    // emits the world-state as it was when this event happened, not the
    // live state — which, once the producer runs ahead of the presenter,
    // is further along than the line being narrated.
    this.queue.push({ event, display: buildDisplaySnapshot(this.state) });
  }

  // Schedules the queued events to flush evenly across tickDelayMs. Returns
  // a promise that resolves when the queue empties — await before opening
  // a modal so the user reads the commentary that led to it. For the
  // background drain at end-of-tick, don't await; the streamer paces in
  // the background and the next tick has tickDelayMs to absorb it.
  flush(tickDelayMs: number, state: MatchState): Promise<void> {
    if (this.silent || this.queue.length === 0) return Promise.resolve();
    this.liveState = state;
    // Single-event ticks: fire immediately, no spacing needed.
    if (this.queue.length === 1) {
      this.spacingMs = 0;
      this.flushOne();
      return Promise.resolve();
    }
    this.spacingMs = tickDelayMs / this.queue.length;
    this.flushOne();
    return new Promise(resolve => { this.drainResolvers.push(resolve); });
  }

  // Pause: stop the flush timer, remember how long until the next flush
  // would have fired so resume() can pick up the same beat.
  pause(): void {
    if (this.silent || !this.flushTimer) return;
    this.paused = true;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.pauseRemainingMs = Math.max(0, this.flushTimerFiresAt - Date.now());
  }

  resume(): void {
    if (this.silent || !this.paused) return;
    this.paused = false;
    if (this.queue.length === 0) return;
    this.scheduleNext(this.pauseRemainingMs);
  }

  // Wipe queued events and pending timers. Called on new match init so
  // events from a prior match don't leak into the next.
  clear(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.queue = [];
    this.drainResolvers.splice(0);
    this.liveState = null;
    this.paused = false;
  }

  private flushOne(): void {
    if (this.queue.length === 0) {
      this.resolveDrain();
      return;
    }
    const { event, display } = this.queue.shift()!;
    eventBus.emit('engine:event', { event });
    if (this.liveState) eventBus.emit('engine:stateChange', { state: this.liveState, display });
    if (this.queue.length === 0) {
      this.resolveDrain();
      return;
    }
    this.scheduleNext(this.spacingMs);
  }

  private scheduleNext(delay: number): void {
    if (this.paused) return;
    this.flushTimerFiresAt = Date.now() + delay;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushOne();
    }, delay);
  }

  private resolveDrain(): void {
    const resolvers = this.drainResolvers.splice(0);
    for (const r of resolvers) r();
  }
}
