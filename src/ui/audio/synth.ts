// Procedural sound synthesis — a zero-asset fallback for the simpler cues.
//
// SoundManager calls synthesize() only when a cue's audio file is absent, so
// these are placeholders: the moment a real recording is dropped at the cue's
// public/audio/ path, the file wins and the synth is never reached. Covers the
// tonal/percussive cues that code can render convincingly (UI feedback,
// referee whistles) plus rough placeholders for a few simple stingers/impacts.
// Recorded-texture cues (crowds, music, orchestral fanfares) have no generator
// and stay silent until sampled.
//
// All graphs are scheduled from ctx.currentTime onto the passed `dest` node
// (the channel GainNode) — gating, channel mix, and master volume are applied
// upstream by SoundManager.

// One reusable white-noise buffer. Math.random() is fine here: this is UI audio
// texture, not engine logic, so the deterministic rng boundary doesn't apply.
let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

// A single enveloped oscillator note, optionally pitch-swept to `endFreq`.
function tone(
  ctx: AudioContext, dest: AudioNode,
  type: OscillatorType, freq: number, start: number, dur: number, peak: number,
  endFreq?: number,
): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(peak, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(dest);
  o.start(start);
  o.stop(start + dur + 0.02);
}

// A band-passed burst of noise — the body of a click / impact transient.
function noiseBurst(
  ctx: AudioContext, dest: AudioNode,
  start: number, dur: number, peak: number, center: number, q = 1.2,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(center, start);
  bp.Q.setValueAtTime(q, start);
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(start);
  src.stop(start + dur + 0.02);
}

// One referee-whistle blast: two detuned triangle tones warbled by an LFO (the
// "pea"), plus a faint band-passed breath layer, under one shared envelope.
function whistleBlast(ctx: AudioContext, dest: AudioNode, start: number, dur: number, peak: number): void {
  const blast = ctx.createGain();
  blast.gain.setValueAtTime(0.0001, start);
  blast.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  blast.gain.setValueAtTime(peak, Math.max(start + 0.013, start + dur - 0.04));
  blast.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  blast.connect(dest);

  const base = 2200;
  const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.setValueAtTime(base, start);
  const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.setValueAtTime(base + 9, start);

  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.setValueAtTime(23, start);
  const lfoGain = ctx.createGain(); lfoGain.gain.setValueAtTime(38, start);
  lfo.connect(lfoGain);
  lfoGain.connect(o1.frequency);
  lfoGain.connect(o2.frequency);

  o1.connect(blast);
  o2.connect(blast);

  const br = ctx.createBufferSource(); br.buffer = noise(ctx); br.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(base, start); bp.Q.setValueAtTime(2, start);
  const brg = ctx.createGain(); brg.gain.setValueAtTime(peak * 0.12, start);
  br.connect(bp); bp.connect(brg); brg.connect(blast);

  const end = start + dur + 0.02;
  o1.start(start); o2.start(start); lfo.start(start); br.start(start);
  o1.stop(end); o2.stop(end); lfo.stop(end); br.stop(end);
}

function whistleSequence(ctx: AudioContext, dest: AudioNode, blasts: { dur: number; peak: number }[], gap: number): void {
  let t = ctx.currentTime;
  for (const b of blasts) {
    whistleBlast(ctx, dest, t, b.dur, b.peak);
    t += b.dur + gap;
  }
}

// A low descending boom — sine sweep + sub layer + a little low noise.
function boom(ctx: AudioContext, dest: AudioNode, startFreq: number, endFreq: number, dur: number, peak: number): void {
  const now = ctx.currentTime;
  tone(ctx, dest, 'sine', startFreq, now, dur, peak, endFreq);
  tone(ctx, dest, 'square', startFreq / 2, now, dur * 0.8, peak * 0.25, endFreq / 2);
  noiseBurst(ctx, dest, now, dur * 0.4, peak * 0.2, 180, 0.7);
}

type Generator = (ctx: AudioContext, dest: AudioNode) => void;

const SYNTH: Record<string, Generator> = {
  // ── UI ──────────────────────────────────────────────────────────────────
  'ui.click.primary': (c, d) => noiseBurst(c, d, c.currentTime, 0.035, 0.45, 2400, 1.4),
  'ui.click.back':    (c, d) => noiseBurst(c, d, c.currentTime, 0.045, 0.40, 1300, 1.2),
  'ui.toggle':        (c, d) => tone(c, d, 'triangle', 2000, c.currentTime, 0.03, 0.30),
  'ui.slider':        (c, d) => tone(c, d, 'sine', 2600, c.currentTime, 0.015, 0.20),
  'ui.confirm': (c, d) => {
    const now = c.currentTime;
    tone(c, d, 'sine', 660, now, 0.09, 0.30);
    tone(c, d, 'sine', 990, now + 0.08, 0.12, 0.30);
  },
  'ui.error': (c, d) => {
    const now = c.currentTime;
    tone(c, d, 'square', 320, now, 0.12, 0.22);
    tone(c, d, 'square', 240, now + 0.11, 0.16, 0.22);
  },
  'ui.notify': (c, d) => {
    const now = c.currentTime;
    tone(c, d, 'sine', 880, now, 0.5, 0.30);   // fundamental
    tone(c, d, 'sine', 1760, now, 0.4, 0.12);  // overtone — bell shimmer
  },

  // ── Whistles ──────────────────────────────────────────────────────────────
  'whistle.stoppage':  (c, d) => whistleBlast(c, d, c.currentTime, 0.18, 0.5),
  'whistle.penalty':   (c, d) => whistleBlast(c, d, c.currentTime, 0.50, 0.55),
  'whistle.try':       (c, d) => whistleBlast(c, d, c.currentTime, 1.10, 0.55),
  'whistle.half_time': (c, d) => whistleSequence(c, d, [{ dur: 0.22, peak: 0.5 }, { dur: 0.22, peak: 0.5 }], 0.12),
  'whistle.full_time': (c, d) => whistleSequence(c, d, [{ dur: 0.5, peak: 0.55 }, { dur: 0.5, peak: 0.55 }, { dur: 0.9, peak: 0.55 }], 0.15),

  // ── Simple stingers / impacts (rough placeholders) ──────────────────────────
  'stinger.budget.up': (c, d) => {
    const now = c.currentTime;
    tone(c, d, 'sine', 660, now, 0.12, 0.28);
    tone(c, d, 'sine', 880, now + 0.08, 0.12, 0.28);
    tone(c, d, 'sine', 1320, now + 0.16, 0.18, 0.28);
  },
  'stinger.playoff_reveal': (c, d) => boom(c, d, 180, 55, 0.9, 0.5),
  'stinger.tmo.red':        (c, d) => boom(c, d, 140, 42, 1.0, 0.55),
  'impact.post': (c, d) => {
    const now = c.currentTime;
    tone(c, d, 'sine', 1180, now, 0.28, 0.18);
    tone(c, d, 'sine', 1760, now, 0.24, 0.14);
    tone(c, d, 'sine', 2310, now, 0.20, 0.10);
  },
  'impact.tackle.soft': (c, d) => {
    tone(c, d, 'sine', 130, c.currentTime, 0.12, 0.40, 55);
    noiseBurst(c, d, c.currentTime, 0.05, 0.20, 500, 0.8);
  },
  'impact.tackle.hard': (c, d) => {
    tone(c, d, 'sine', 160, c.currentTime, 0.18, 0.55, 48);
    noiseBurst(c, d, c.currentTime, 0.07, 0.30, 700, 0.8);
  },
  'impact.boot.punt': (c, d) => {
    noiseBurst(c, d, c.currentTime, 0.04, 0.45, 450, 1.0);
    tone(c, d, 'sine', 110, c.currentTime, 0.06, 0.30);
  },
  // Front-row crunch on engagement: a heavy low thud (bodies binding) plus a
  // short mid burst (the "set" hit).
  'impact.scrum.engage': (c, d) => {
    const now = c.currentTime;
    tone(c, d, 'sine', 150, now, 0.22, 0.45, 58);
    noiseBurst(c, d, now, 0.09, 0.32, 320, 0.8);
    noiseBurst(c, d, now + 0.04, 0.06, 0.20, 520, 0.9);
  },
  // Grinding forward drive: a sustained low rumble under a slow churn of
  // band-passed noise (boots working the turf).
  'impact.maul.drive': (c, d) => {
    const now = c.currentTime;
    tone(c, d, 'sine', 78, now, 0.55, 0.34, 64);
    noiseBurst(c, d, now,        0.30, 0.16, 240, 0.7);
    noiseBurst(c, d, now + 0.22, 0.28, 0.14, 300, 0.7);
  },
};

/** Synthesize `id` onto `dest`. Returns false if no generator exists for it. */
export function synthesize(ctx: AudioContext, dest: AudioNode, id: string): boolean {
  const gen = SYNTH[id];
  if (!gen) return false;
  gen(ctx, dest);
  return true;
}

/** Whether a cue can be procedurally synthesized (for diagnostics/tooling). */
export function canSynthesize(id: string): boolean {
  return id in SYNTH;
}
