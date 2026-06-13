// Frame-stream dump for the Phase Animator's frame debugger (Upgrade.md § 9).
//
// WP2 wired the spatial substrate into LIVE PhasePlay resolution, so the frame
// stream now comes straight off real match beats (GameEvent.frames) rather than
// an authored stand-in. This runs a NON-SILENT match (frame capture on) and
// collects the spatial frame streams from consecutive PhasePlay beats — a
// representative "line holds, folds, gets beaten" sequence for the watchability
// review (WP2 human sign-off gate).
//
// Invoked by `npm run probe -- --frames`. Standalone from the browser probe:
// the engine produces the frames itself; the debugger replays them.

import { mkdirSync, writeFileSync } from 'node:fs';
import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { setCaptureAnnotations } from '../src/engine/spatial/World.js';
import { MatchPhase } from '../src/types/engine.js';
import { eventBus } from '../src/utils/eventBus.js';
import type { GameEvent } from '../src/types/match.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import bathRaw     from '../src/data/team-bath.json'     with { type: 'json' };
import saracensRaw from '../src/data/team-saracens.json' with { type: 'json' };

const BATH     = bathRaw as unknown as RawTeamInput;
const SARACENS = saracensRaw as unknown as RawTeamInput;

// Collect every PhasePlay beat that carried a captured spatial frame stream.
const phasePlayBeats: { gameMinute: number; side: string; outcome?: string; frames: NonNullable<GameEvent['frames']> }[] = [];

const offEvent = eventBus.on('engine:event', ({ event }) => {
  const e = event as GameEvent;
  if (e.phase === MatchPhase.PhasePlay && e.frames && e.frames.length > 0) {
    phasePlayBeats.push({ gameMinute: e.gameMinute, side: e.side, outcome: e.outcome, frames: e.frames });
  }
});

// Dev-only: capture the three-layer control annotations into the dumped frames
// so the frame debugger can show "why is he there?" per dot.
setCaptureAnnotations(true);

await new Promise<void>(resolve => {
  const engine = new MatchCoordinator(BATH, SARACENS, { tickDelayMs: 0, seed: 0xDEADBEEF });
  // Auto-resolve the pause modals with fixed defaults so the match runs straight
  // through to full time (same pattern as checkDeterminism.ts).
  const offPaused = eventBus.on('engine:paused', ({ payload }) => {
    if (payload.type === 'kickoff_choice') payload.onChoice('high_ball');
    else if (payload.type === 'penalty_choice') payload.onChoice('kick_for_goal');
    else if (payload.type === 'team_talk_choice') payload.onChoice({ attack: 2, defend: 4, decayMinutes: 15 });
    else if (payload.type === 'forced_substitution_choice') payload.onChoice(payload.bench[0]?.squadNumber ?? null);
  });
  const offAutoPaused = eventBus.on('engine:autoPaused', () => engine.start());
  const offFinished = eventBus.on('engine:finished', () => {
    offPaused();
    offAutoPaused();
    offFinished();
    offEvent();
    engine.destroy();
    setCaptureAnnotations(false);  // restore the module-global so it can't leak into any later buildWorld
    resolve();
  });
  engine.initialize();
  engine.start();
});

// Take a representative 10-beat window from mid-match (a settled passage of
// open play, not the opening exchanges) for the watchability review.
const start = Math.min(20, Math.max(0, phasePlayBeats.length - 10));
const window = phasePlayBeats.slice(start, start + 10);

mkdirSync('harness', { recursive: true });
const out = {
  generatedBy: 'dumpSpatialFrames (live PhasePlay, WP2)',
  seed: '0xDEADBEEF',
  fixture: `${BATH.id} v ${SARACENS.id}`,
  totalPhasePlayBeats: phasePlayBeats.length,
  frameStreams: window.map((b, i) => ({
    label: `phaseplay-${start + i} m${b.gameMinute} ${b.side} ${b.outcome ?? ''}`.trim(),
    frames: b.frames,
  })),
};
writeFileSync('harness/frames.json', JSON.stringify(out));
console.log(`wrote harness/frames.json — ${window.length} live PhasePlay beats (of ${phasePlayBeats.length} total), ${window.reduce((n, b) => n + b.frames.length, 0)} frames`);
