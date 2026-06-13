// Standalone LIVE spatial-engine viewer (WP5 polishing tool). Runs the real
// MatchCoordinator endlessly in the browser and renders the captured spatial
// `frames` (30 agents + ball) straight to a canvas — NO production PitchView, so
// it can't perturb the live game. Keeps a beat HISTORY so you can pause, rewind,
// and scrub frame-by-frame, with a rich info overlay so every element on screen is
// identifiable for feedback (jersey numbers, roles, carrier, attack direction).

import { eventBus } from '../src/utils/eventBus';
import { MatchCoordinator } from '../src/engine/MatchCoordinator';
import type { RawTeamInput } from '../src/types/teamData';
import type { GameEvent } from '../src/types/match';
import type { Frame } from '../src/engine/spatial/types';

import bathRaw from '../src/data/team-bath.json';
import saracensRaw from '../src/data/team-saracens.json';

const home = bathRaw as unknown as RawTeamInput;
const away = saracensRaw as unknown as RawTeamInput;
const TEAM_NAME = { home: home.name ?? 'Home', away: away.name ?? 'Away' };

// Jersey → positional role (for the overlay so feedback can name the player).
const ROLE: Record<number, string> = {
  1: 'loosehead', 2: 'hooker', 3: 'tighthead', 4: 'lock', 5: 'lock', 6: 'flanker',
  7: 'flanker', 8: 'no.8', 9: 'scrum-half', 10: 'fly-half', 11: 'wing', 12: 'centre',
  13: 'centre', 14: 'wing', 15: 'full-back',
};
const isForward = (slot: number) => slot >= 1 && slot <= 8;

// ── DOM ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('spatial-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const $ = (id: string) => document.getElementById(id)!;
const infoMain = $('info-main'), infoPlay = $('info-play'), infoPos = $('info-pos');
const scrub = $('scrub') as HTMLInputElement;
const btnPause = $('btn-pause') as HTMLButtonElement;
const btnLive = $('btn-live') as HTMLButtonElement;

// ── Projection (x long axis → vertical, x=100 at TOP; y lateral → horizontal) ─
let cw = 0, ch = 0, px0 = 0, py0 = 0, pw = 0, ph = 0;
function layout(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = canvas.clientWidth; ch = canvas.clientHeight;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const aspect = 70 / 100, pad = 14;
  let h = ch - pad * 2, w = h * aspect;
  if (w > cw - pad * 2) { w = cw - pad * 2; h = w / aspect; }
  pw = w; ph = h; px0 = (cw - w) / 2; py0 = (ch - h) / 2;
}
window.addEventListener('resize', layout);
const projX = (x: number) => py0 + ((100 - x) / 100) * ph;
const projY = (y: number) => px0 + (y / 100) * pw;

// ── Beat model ──────────────────────────────────────────────────────────────
interface Beat {
  frames: Frame[]; phase: string; minute: number; atkSide: 'home' | 'away';
  outcome: string; carrierSlot: number | null; wide: boolean; attackUp: boolean;
}
const history: Beat[] = [];
const MAX_HISTORY = 200;
let beatIdx = -1;          // playhead beat
let fi = 0, prog = 0;      // within-beat frame + interpolation
let msPerFrame = 120, paused = false, live = true;

function pushBeat(e: GameEvent & { frames?: Frame[]; gameMinute?: number; outcome?: string }): void {
  const frames = e.frames!;
  const atk: 'home' | 'away' = e.side === 'away' ? 'away' : 'home';
  const f0 = frames[0];
  const defBase = atk === 'home' ? 15 : 0;       // defenders are the other block
  let defX = 0; for (let i = 0; i < 15; i++) defX += f0.dots[defBase + i].x; defX /= 15;
  const carrierSlot = frames[frames.length - 1].ball.carrierSlot ?? null;
  history.push({
    frames, phase: String(e.phase).replace(/_/g, ' ').toLowerCase(),
    minute: e.gameMinute ?? 0, atkSide: atk, outcome: (e.outcome ?? '').replace(/_/g, ' '),
    carrierSlot, wide: carrierSlot != null && !isForward(carrierSlot),
    attackUp: defX > f0.ball.x,                  // defenders sit goal-side of the ball
  });
  if (history.length > MAX_HISTORY) { history.shift(); if (beatIdx > 0) beatIdx--; }
  if (beatIdx < 0) beatIdx = 0;
}

// ── Render ───────────────────────────────────────────────────────────────────
function drawPitch(): void {
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#1d6e34'; ctx.fillRect(px0, py0, pw, ph);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  ctx.strokeRect(px0, py0, pw, ph);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  for (const x of [22, 50, 78]) { const yy = projX(x); ctx.beginPath(); ctx.moveTo(px0, yy); ctx.lineTo(px0 + pw, yy); ctx.stroke(); }
  // try-line labels
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('try line (x=100)', px0 + 4, py0 + 12); ctx.fillText('try line (x=0)', px0 + 4, py0 + ph - 6);
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function frameAt(b: Beat, idx: number, t: number): Frame {
  const a = b.frames[idx], n = b.frames[Math.min(idx + 1, b.frames.length - 1)];
  const dots = new Array(30);
  for (let i = 0; i < 30; i++) dots[i] = { x: lerp(a.dots[i].x, n.dots[i].x, t), y: lerp(a.dots[i].y, n.dots[i].y, t) };
  return { t: 0, ball: { x: lerp(a.ball.x, n.ball.x, t), y: lerp(a.ball.y, n.ball.y, t), h: 0, carrierSlot: n.ball.carrierSlot }, dots };
}

function draw(b: Beat, f: Frame): void {
  drawPitch();
  // attack-direction arrow + attacking team
  ctx.save();
  ctx.fillStyle = b.atkSide === 'home' ? '#1f6feb' : '#f85149';
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  const arrowX = px0 - 2, top = b.attackUp;
  ctx.fillText(top ? '▲' : '▼', arrowX, top ? py0 + 16 : py0 + ph - 10);
  ctx.restore();

  const atkBase = b.atkSide === 'home' ? 0 : 15;
  const r = Math.max(6, pw * 0.024);
  for (let i = 0; i < 30; i++) {
    const d = f.dots[i]; const isHome = i < 15; const slot = isHome ? i + 1 : i - 14;
    const cx = projY(d.y), cy = projX(d.x);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isHome ? '#1f6feb' : '#f85149'; ctx.fill();
    const attacking = (i >= atkBase && i < atkBase + 15);
    ctx.lineWidth = attacking ? 2 : 1; ctx.strokeStyle = attacking ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.35)'; ctx.stroke();
    if (f.ball.carrierSlot === slot && attacking) {
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffd33d';
      ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(r * 1.05)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(slot), cx, cy);
  }
  const bx = projY(f.ball.y), by = projX(f.ball.x);
  ctx.fillStyle = '#ffd33d'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(bx, by, r * 0.6, r * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function syncInfo(b: Beat): void {
  const dir = b.attackUp ? '↑ up' : '↓ down';
  infoMain.textContent = `${b.phase}  ·  ${TEAM_NAME[b.atkSide]} attacking ${dir}  ·  m${b.minute.toFixed(0)}  ·  ${b.outcome || '—'}`;
  const c = b.carrierSlot;
  infoPlay.textContent = c == null
    ? `ball in flight (pass)`
    : `${b.wide ? 'WIDE' : 'hard carry'}  ·  carrier #${c} (${ROLE[c] ?? '?'})`;
  infoPos.textContent = `beat ${beatIdx + 1}/${history.length}   ·   frame ${fi + 1}/${b.frames.length}` + (live ? '   ·   ● LIVE' : '   ·   ⏸ scrub');
  scrub.max = String(Math.max(0, b.frames.length - 1));
  scrub.value = String(fi);
}

// ── Playback loop ────────────────────────────────────────────────────────────
let lastT = performance.now();
function tick(now: number): void {
  const dt = now - lastT; lastT = now;
  if (beatIdx < 0) { drawPitch(); requestAnimationFrame(tick); return; }
  const b = history[beatIdx];
  if (!paused) {
    prog += dt / msPerFrame;
    while (prog >= 1 && fi < b.frames.length - 1) { prog -= 1; fi++; }
    if (fi >= b.frames.length - 1 && prog >= 1) {
      if (beatIdx < history.length - 1) { beatIdx++; fi = 0; prog = 0; }
      else { fi = b.frames.length - 1; prog = 0; }   // at latest — hold until more arrive
    }
  }
  const cur = history[beatIdx];
  draw(cur, frameAt(cur, fi, paused ? 0 : Math.min(1, prog)));
  syncInfo(cur);
  // backpressure: keep the engine ~in step with the playhead so LIVE stays current.
  const buffer = history.length - 1 - beatIdx;
  if (engine) { if (buffer > 8) engine.pause(); else if (buffer < 3) engine.resume(); }
  requestAnimationFrame(tick);
}

// ── Endless engine ───────────────────────────────────────────────────────────
let engine: MatchCoordinator | null = null;
eventBus.on('engine:event', ({ event }) => {
  const e = event as GameEvent & { frames?: Frame[] };
  if (e.frames && e.frames.length > 0) pushBeat(e);
});
eventBus.on('engine:paused', ({ payload }) => {
  const p = payload as { type: string; bench?: { squadNumber: number }[]; onChoice: (v: unknown) => void };
  if (!p || typeof p.onChoice !== 'function') return;
  switch (p.type) {
    case 'kickoff_choice': p.onChoice('high_ball'); break;
    // Dev viewer: auto-resolve the penalty modal with a fixed default (no rng — the
    // viewer just needs play to continue; the choice has no bearing on what we watch).
    case 'penalty_choice': p.onChoice('kick_to_touch'); break;
    case 'team_talk_choice': p.onChoice({ attack: 0, defend: 0, decayMinutes: 0 }); break;
    case 'forced_substitution_choice': p.onChoice(p.bench && p.bench.length ? p.bench[0].squadNumber : null); break;
    default: p.onChoice(null);
  }
});
eventBus.on('engine:autoPaused', () => { if (!isThrottled()) engine?.resume(); });
eventBus.on('engine:finished', () => setTimeout(startMatch, 600));
function isThrottled(): boolean { return history.length - 1 - beatIdx > 8; }
function startMatch(): void {
  if (engine) engine.destroy();
  engine = new MatchCoordinator(home, away, { tickDelayMs: 20, seed: Date.now(), humanSide: 'home' });
  engine.initialize(); engine.start();
}

// ── Controls ─────────────────────────────────────────────────────────────────
function setLive(v: boolean): void { live = v; btnLive.classList.toggle('active', v); }
function goBeat(delta: number): void {
  if (history.length === 0) return;
  paused = true; btnPause.textContent = '▶ Play'; setLive(false);
  beatIdx = Math.max(0, Math.min(history.length - 1, beatIdx + delta)); fi = 0; prog = 0;
}
btnPause.onclick = () => {
  paused = !paused; btnPause.textContent = paused ? '▶ Play' : '⏸ Pause';
  if (!paused && beatIdx >= history.length - 1) setLive(true);
};
$('btn-prevbeat').onclick = () => goBeat(-1);
$('btn-nextbeat').onclick = () => goBeat(1);
$('btn-prevframe').onclick = () => { paused = true; btnPause.textContent = '▶ Play'; setLive(false); fi = Math.max(0, fi - 1); prog = 0; };
$('btn-nextframe').onclick = () => { paused = true; btnPause.textContent = '▶ Play'; setLive(false); const b = history[beatIdx]; if (b) fi = Math.min(b.frames.length - 1, fi + 1); prog = 0; };
btnLive.onclick = () => { beatIdx = history.length - 1; fi = 0; prog = 0; paused = false; btnPause.textContent = '⏸ Pause'; setLive(true); };
scrub.oninput = () => { paused = true; btnPause.textContent = '▶ Play'; setLive(false); fi = Number(scrub.value); prog = 0; };
($('speed') as HTMLInputElement).oninput = (ev) => { msPerFrame = 200 - Number((ev.target as HTMLInputElement).value); };
msPerFrame = 200 - Number(($('speed') as HTMLInputElement).value);

layout();
setLive(true);
requestAnimationFrame(tick);
startMatch();
