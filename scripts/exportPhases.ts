// Phase-sample export for the dev animator (public/tools/phase-animator.html).
//
//   npm run export:phases   →  public/tools/phases.js
//
// Runs MatchCoordinator headlessly across many seeds (varying the penalty choice
// to surface tap-and-go / lineout / kick-at-goal branches), subscribes to the
// engine:event bus, and keeps ONE representative beat per (phase, outcome-key) —
// the one with the richest ball movement, so each phase has a real
// `start (prev-phase ball) → movements[] → resolution` path to animate against.
// The result is written as `window.EMBEDDED_PHASES` so the animator can load it
// via <script src>, no fetch / file upload needed (works on Pages and locally).

import { writeFileSync } from 'node:fs';
import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { PenaltyChoice } from '../src/types/engine.js';
import { eventBus } from '../src/utils/eventBus.js';
import bathRaw from '../src/data/team-bath.json' with { type: 'json' };
import saracensRaw from '../src/data/team-saracens.json' with { type: 'json' };
import { choreograph } from '../src/ui/pitchChoreography.js';

const HOME = bathRaw as unknown as RawTeamInput;
const AWAY = saracensRaw as unknown as RawTeamInput;

interface LayoutDot { id: string; x: number; y: number; c?: number; from?: { x: number; y: number } }
interface Sample {
  phase: string; displayPhase: string | null; key: string; keys: string[]; side: string;
  start: { x: number; y: number }; moves: { x: number; y: number }[];
  resolve: { x: number; y: number }; primary: number | null; secondary: number | null; prevPhase: string | null;
  prevKey: string | null;  // primary outcome key of the preceding beat (pairs with prevPhase for exact lookup)
  layout: LayoutDot[];   // the live choreographed dot positions (game coords), so the tool can pre-place them
  attacksTop: boolean;  // true = possessing team attacks toward x=100 (top of animator screen)
}

const collected = new Map<string, Sample>();

function runOnce(seed: number, pen: PenaltyChoice): Promise<void> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(HOME, AWAY, { tickDelayMs: 0, seed });
    let prevBall = { x: 50, y: 50 };
    let prevPhase: string | null = null;
    let prevKey: string | null = null;

    const offPaused = eventBus.on('engine:paused', ({ payload }) => {
      const p = payload as { type: string; onChoice: (v: unknown) => void; bench?: { squadNumber: number }[] };
      if (p.type === 'kickoff_choice') p.onChoice('high_ball');
      else if (p.type === 'penalty_choice') p.onChoice(pen);
      else if (p.type === 'team_talk_choice') p.onChoice({ attack: 2, defend: 4, decayMinutes: 15 });
      else if (p.type === 'forced_substitution_choice') p.onChoice(p.bench?.[0]?.squadNumber ?? null);
      else p.onChoice(null);
    });

    const offEvent = eventBus.on('engine:event', ({ event }) => {
      const e = event as unknown as {
        phase: string; displayPhase?: string; side: string; ballX: number; ballY: number;
        movements?: ReadonlyArray<{ x: number; y: number }>;
        primaryPlayer?: { squadNumber: number }; secondaryPlayer?: { squadNumber: number };
        narration: { steps: { kind: string; key?: string }[] };
      };
      const keys = e.narration.steps.filter(s => s.kind === 'phase_outcome').map(s => s.key as string);
      const moves = (e.movements ?? []).map(m => ({ x: Math.round(m.x), y: Math.round(m.y) }));
      if (keys.length) {
        // Capture the live choreographed layout (the same dots the game would draw)
        // so the animator can load it as a starting point instead of a blank formation.
        const st = engine.getState();
        const attacksTop = (e.side === 'home') !== st.clock.halfTimeDone;
        const layout: LayoutDot[] = choreograph(event, st, attacksTop, prevPhase, prevBall.x, prevBall.y)
          .map(p => {
            const o: LayoutDot = { id: p.key.replace(':', ''), x: Math.round(p.x), y: Math.round(p.y) };
            if (p.isCarrier) o.c = 1;
            if (p.from) o.from = { x: Math.round(p.from.x), y: Math.round(p.from.y) };
            return o;
          });
        // Index by every phase_outcome key in this event, not just the first.
        // Secondary keys (cover_tackle, high_tackle_penalty, offload_knock_on,
        // interception-after-crash_ball) only ever appear as non-first steps and
        // would be permanently invisible if only keys[0] were captured.
        for (const key of keys) {
          const k = `${e.phase}:${key}`;
          const sample: Sample = {
            phase: e.phase, displayPhase: e.displayPhase ?? null, key, keys, side: e.side,
            start: { ...prevBall }, moves,
            resolve: { x: Math.round(e.ballX), y: Math.round(e.ballY) },
            primary: e.primaryPlayer?.squadNumber ?? null, secondary: e.secondaryPlayer?.squadNumber ?? null,
            prevPhase, prevKey, layout, attacksTop,
          };
          // Prefer the richest beat per (phase, outcome): most movement, then most layout dots.
          const prev = collected.get(k);
          if (!prev || moves.length > prev.moves.length ||
              (moves.length === prev.moves.length && layout.length > prev.layout.length)) {
            collected.set(k, sample);
          }
        }
        prevKey = keys[0];  // becomes prevKey for the next beat
      }
      prevBall = { x: Math.round(e.ballX), y: Math.round(e.ballY) };
      prevPhase = e.phase;
    });

    const offAuto = eventBus.on('engine:autoPaused', () => engine.start());
    const offFin = eventBus.on('engine:finished', () => {
      offPaused(); offEvent(); offAuto(); offFin(); engine.destroy(); resolve();
    });

    engine.initialize();
    engine.start();
  });
}

const pens: PenaltyChoice[] = ['kick_for_goal', 'kick_to_touch', 'tap_and_go'];
const SEEDS = 300;
for (let s = 0; s < SEEDS; s++) {
  await runOnce(0x2200 + s * 0x101, pens[s % pens.length]);
}

const out = [...collected.values()].sort((a, b) =>
  a.phase.localeCompare(b.phase) || a.key.localeCompare(b.key));

writeFileSync('public/tools/phases.js',
  '// AUTO-GENERATED by scripts/exportPhases.ts (npm run export:phases) — do not edit by hand.\n' +
  '// Real engine phase samples for tools/phase-animator.html: each carries the ball\n' +
  '// start (previous-phase position), the in-phase movements, and the resolution.\n' +
  'window.EMBEDDED_PHASES = ' + JSON.stringify(out) + ';\n');

console.log(`collected ${out.length} phase/outcome variants from ${SEEDS} seeds → public/tools/phases.js`);
const byPhase = new Map<string, number>();
for (const e of out) byPhase.set(e.phase, (byPhase.get(e.phase) ?? 0) + 1);
for (const [p, n] of [...byPhase].sort()) console.log(`  ${p.padEnd(16)} ${n} variant(s)`);
