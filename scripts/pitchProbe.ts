// Browser harness for sense-checking the 2D pitch player animation. Mounts the
// REAL PitchView against a REAL MatchCoordinator, then samples the rendered ball
// + every visible dot frame-by-frame so a headless driver can confirm motion.
// Not shipped — dev-only probe driven by scripts/pitchProbeDriver.mjs.
import '../style/main.css';
import { eventBus } from '../src/utils/eventBus';
import { initPitchView } from '../src/ui/PitchView';
import { MatchCoordinator } from '../src/engine/MatchCoordinator';
import { choreograph } from '../src/ui/pitchChoreography';
import type { GameEvent, MatchState } from '../src/types/match';
import type { RawTeamInput } from '../src/types/teamData';
import bathRaw from '../src/data/team-bath.json';
import saracensRaw from '../src/data/team-saracens.json';

interface DotSample { n: string; k: string; cx: number; cy: number; op: number; }
interface Frame { beat: number; t: number; ball: { cx: number; cy: number } | null; dots: DotSample[]; }
interface Beat {
  idx: number; phase: string; side: string; prevPhase: string | null; lineCount: number;
  ballX: number; ballY: number; nMoves: number; moves: Array<{ x: number; y: number }>; keys: string[];
  primaryKey: string | null;  // carrier candidate (event.primaryPlayer on the acting side) — for the carrier-contact check
}
// A choreograph channel-exclusivity violation: a Placed driven by two animators at once
// (isCarrier + from) or a choreographed dot that also carries a `from` (chase) — both
// invariants of the three-channel model in docs/DESIGN.md § 15.7.
interface ExclViolation { beat: number; key: string; kind: string; }

declare global {
  interface Window {
    __probe: {
      beats: Beat[];
      frames: Frame[];
      interesting: Array<{ idx: number; label: string; atMs: number }>;
      exclusivity: ExclViolation[];
      done: boolean;
    };
  }
}

const field = document.getElementById('pitch-2d-field')!;
const ball = document.getElementById('pitch-2d-ball')!;

// Force a concrete field size. In-app the field is `flex:1` inside a sized flex
// column; standalone it would collapse to ~0 height (main.css overrides our
// stylesheet), pinning every top% to the edge. Inline style beats the sheet.
field.style.position = 'absolute';
field.style.top = '0';
field.style.left = '0';
field.style.width = '360px';
field.style.height = '600px';

const probe: Window['__probe'] = { beats: [], frames: [], interesting: [], exclusivity: [], done: false };
window.__probe = probe;

let beatIdx = -1;
let prevPhase: string | null = null;
let prevBallX = 50;
let prevBallY = 50;

const centerRel = (el: Element): { cx: number; cy: number } => {
  const fr = field.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width / 2 - fr.left, cy: r.top + r.height / 2 - fr.top };
};

// Continuous rAF sampler — records the ball + every visible dot each frame,
// tagged with the current beat index so motion within a beat is reconstructable.
const sampleLoop = () => {
  if (probe.done) return;
  const dots: DotSample[] = [];
  for (const el of Array.from(field.querySelectorAll('.pitch-dot'))) {
    const op = parseFloat(getComputedStyle(el).opacity || '0');
    if (op < 0.01) continue;
    const c = centerRel(el);
    // data-key (`${side}:${id}`, e.g. `h:10`) is a STABLE per-player identity — far better
    // than the jersey number for tracking a dot across frames (both teams share numbers 1–15).
    dots.push({ n: (el.textContent || '').trim(), k: el.getAttribute('data-key') || '', cx: Math.round(c.cx), cy: Math.round(c.cy), op: Math.round(op * 100) / 100 });
  }
  const bc = centerRel(ball);
  probe.frames.push({ beat: beatIdx, t: Math.round(performance.now()), ball: { cx: Math.round(bc.cx), cy: Math.round(bc.cy) }, dots });
  requestAnimationFrame(sampleLoop);
};

initPitchView();

// Auto-answer every human modal prompt with a sensible default so the match
// runs to completion without a UI (kick-off strategy, penalty decisions,
// half-time talk, forced subs). Mirrors what the real modals would resolve.
eventBus.on('engine:paused', ({ payload }) => {
  const p = payload as { type: string; onChoice: (v: unknown) => void };
  if (!p || typeof p.onChoice !== 'function') return;
  switch (p.type) {
    case 'kickoff_choice':              p.onChoice('high_ball'); break;
    case 'penalty_choice':              p.onChoice('kick_to_touch'); break;
    case 'team_talk_choice':            p.onChoice({ attack: 0, defend: 0, decayMinutes: 0 }); break;
    case 'forced_substitution_choice':  p.onChoice(null); break;
    default:                            p.onChoice(null); break;
  }
});

eventBus.on('engine:event', ({ event }) => {
  beatIdx++;
  const e = event as {
    phase: string; side: string; ballX: number; ballY: number;
    primaryPlayer?: { id: number };
    choreography?: Array<{ side: string; id: number }>;
    movements?: ReadonlyArray<{ x: number; y: number }>;
    narration: { steps: Array<{ kind: string; key?: string }> };
  };
  const keys = e.narration.steps.filter(s => s.kind === 'phase_outcome').map(s => s.key || '');
  // The carrier follower rides event.primaryPlayer on the acting side; its key matches the
  // dot's data-key, so the carrier-contact check can find the rendered carrier dot.
  const primaryKey = e.primaryPlayer ? `${e.side === 'home' ? 'h' : 'a'}:${e.primaryPlayer.id}` : null;
  probe.beats.push({
    idx: beatIdx, phase: e.phase, side: e.side, prevPhase, lineCount: e.narration.steps.length,
    ballX: Math.round(e.ballX), ballY: Math.round(e.ballY),
    nMoves: e.movements?.length ?? 0,
    moves: (e.movements ?? []).map(m => ({ x: Math.round(m.x), y: Math.round(m.y) })),
    keys, primaryKey,
  });

  // Channel-exclusivity scan (no screenshot needed): re-run the pure choreographer for this
  // beat and assert no Placed is driven by two animators. Independent of what PitchPlayers
  // rendered (lastPositions/run-ahead differ), but the invariant is structural so it holds
  // for any valid input — drift dots never carry isCarrier/from, so omitting lastPositions
  // is fine. Wrapped so a roster-lead edge can't abort the capture.
  try {
    const state = engine.getState() as unknown as MatchState;
    const attacksTop = (e.side === 'home') !== state.clock.halfTimeDone;
    const placed = choreograph(event as GameEvent, state, attacksTop, prevPhase, prevBallX, prevBallY);
    const choreoKeys = new Set((e.choreography ?? []).map(c => `${c.side}:${c.id}`));
    for (const p of placed) {
      if (p.isCarrier && p.from) probe.exclusivity.push({ beat: beatIdx, key: p.key, kind: 'carrier+from' });
      if (choreoKeys.has(p.key) && p.from) probe.exclusivity.push({ beat: beatIdx, key: p.key, kind: 'choreographed+from' });
    }
  } catch (err) {
    probe.exclusivity.push({ beat: beatIdx, key: '', kind: `scan-error: ${(err as Error).message}` });
  }
  // Flag beats worth screenshotting: set pieces, the first phase off them, and
  // the kick-off beat where the ball actually travels (ballX != 50 = the real kick).
  const isSetpieceFirstPhase = e.phase === 'FIRST_PHASE' && (prevPhase === 'SCRUM' || prevPhase === 'LINEOUT');
  if (e.phase === 'SCRUM' || e.phase === 'LINEOUT' || isSetpieceFirstPhase) {
    const from = prevPhase === 'SCRUM' ? 'scrum' : 'lineout';
    probe.interesting.push({ idx: beatIdx, label: isSetpieceFirstPhase ? `firstphase-from-${from}` : e.phase.toLowerCase(), atMs: performance.now() });
  } else if (e.phase === 'KICK_OFF' && Math.round(e.ballX) !== 50) {
    probe.interesting.push({ idx: beatIdx, label: `kickoff-${e.side}`, atMs: performance.now() });
  }
  prevPhase = e.phase;
  prevBallX = e.ballX;
  prevBallY = e.ballY;
});

eventBus.on('engine:finished', () => { probe.done = true; });

requestAnimationFrame(sampleLoop);

// Slow tick so each beat's 400-700ms animation is well separated and clearly
// visible to the frame sampler / screenshots. Fixed seed for reproducibility.
const home = bathRaw as unknown as RawTeamInput;
const away = saracensRaw as unknown as RawTeamInput;
const engine = new MatchCoordinator(home, away, { tickDelayMs: 1500, seed: 0xC0FFEE, humanSide: 'home' });
engine.initialize();
engine.start();
