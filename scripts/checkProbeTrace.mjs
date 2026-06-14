// Sync assertions over a 2D-pitch probe capture (WP6.2). Pure analysis of the trace the
// headless harness dumps — no Chromium here; pitchProbeDriver.mjs calls analyzeTrace() with
// the in-memory trace, and this file also runs standalone over harness/trace.json:
//
//   node scripts/checkProbeTrace.mjs            # re-analyse the last harness/trace.json
//
// Three checks (see docs/DESIGN.md § 15.7 + docs/animation-feedback-playbook.md):
//  1. Teleport detector — within a beat (animations are active), neither the ball nor any
//     visible dot should jump > TELEPORT_PX between consecutive sampled frames. A
//     non-monotonic WAAPI offset (the fly-half-kick class) or an uncancelled supersession
//     (the WP1.5 class) surfaces here as a one-frame discontinuity. HARD failure.
//  2. Channel exclusivity — captured in-page (probe.exclusivity): no Placed is both
//     `isCarrier` and `from`, and no choreographed key carries a `from`. HARD failure.
//  3. Carrier contact — at the last sampled frame of a multi-leg carry beat, the carrier dot
//     should sit on the ball (within CONTACT_PX). Sampling can catch a beat mid-glide, so
//     this is a SOFT report (warn), not a failure.

import { readFileSync } from 'node:fs';

const TELEPORT_PX = 70;   // a within-beat jump this large is a discontinuity, not a glide (~17× a normal leg)
const CONTACT_PX = 60;    // carrier rests ~CARRIER_BEHIND_BALL (2.5 units ≈ 12px) behind the ball; > this = clearly adrift (keeps real misses, drops sub-glide noise)

const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);

export function analyzeTrace({ beats = [], frames = [], exclusivity = [] }) {
  const teleports = [];
  const carrierMisses = [];

  // 1. Teleport detector — only WITHIN a beat (cross-beat re-placement is allowed: a snap
  //    phase cuts, a glide eases from the live position). A dot must be visible in both
  //    frames (op > 0.5) so a fade-in isn't mistaken for a jump.
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    if (a.beat !== b.beat) continue;
    if (a.ball && b.ball) {
      const d = dist(a.ball, b.ball);
      if (d > TELEPORT_PX) teleports.push({ beat: b.beat, who: 'ball', px: Math.round(d) });
    }
    const prev = new Map(a.dots.filter(d => d.op > 0.5 && d.k).map(d => [d.k, d]));
    for (const db of b.dots) {
      if (db.op <= 0.5 || !db.k) continue;
      const da = prev.get(db.k);
      if (!da) continue;
      const d = dist(da, db);
      if (d > TELEPORT_PX) teleports.push({ beat: b.beat, who: db.k, px: Math.round(d) });
    }
  }

  // 3. Carrier contact — the last sampled frame of each multi-leg CARRY beat. Only the
  //    open-play carry phases run the ball-walk follower; on a kick the primaryPlayer is the
  //    KICKER and the ball deliberately leaves them, so kicks/set-pieces are excluded. The
  //    maul drives as a bound unit (no follower), and a try grounds the ball in-goal away
  //    from the carrier — both excluded too.
  //
  //    The FINAL beat is excluded (issue #103). Every other beat's sampling window is bounded
  //    by the next `engine:event` (which increments beatIdx), so its recorded last frame lands
  //    after the follower glide settles. The match-ending beat has no following event — only
  //    `engine:finished` fires — so the rAF sampler can be torn down mid-glide on a long carry
  //    leg (e.g. a wide-play line break), recording the carrier ~hundreds of px off the ball
  //    while it is still riding the final leg. That is a sampling artifact, not a contact miss:
  //    the follower's authored resting position is `final.x - fwd*CARRIER_BEHIND_BALL` (~12px
  //    behind the ball) and the DOM resting state — the source of truth for animation — is
  //    correct by construction. Skipping the unbounded final beat drops the false positive
  //    without weakening real-miss detection on every other carry.
  const CARRY_PHASES = new Set(['PHASE_PLAY', 'FIRST_PHASE', 'KICK_RETURN', 'BREAKDOWN']);
  const lastBeatIdx = beats.length ? beats[beats.length - 1].idx : -1;
  const lastFrameOf = new Map();
  for (const f of frames) lastFrameOf.set(f.beat, f);
  for (const beat of beats) {
    if (beat.idx === lastBeatIdx) continue;
    if (beat.nMoves < 2 || !beat.primaryKey || !CARRY_PHASES.has(beat.phase)) continue;
    if ((beat.keys || []).some(k => k.includes('try'))) continue;
    const f = lastFrameOf.get(beat.idx);
    if (!f || !f.ball) continue;
    const carrier = f.dots.find(d => d.k === beat.primaryKey && d.op > 0.5);
    if (!carrier) continue;
    const d = dist(carrier, f.ball);
    if (d > CONTACT_PX) carrierMisses.push({ beat: beat.idx, phase: beat.phase, key: beat.primaryKey, px: Math.round(d) });
  }

  return { teleports, carrierMisses, exclusivity };
}

// Pretty-print + return whether any HARD check failed (teleport / exclusivity).
export function reportTrace(result) {
  const { teleports, carrierMisses, exclusivity } = result;
  const show = (rows, n = 8) => rows.slice(0, n).map(r => '    ' + JSON.stringify(r)).join('\n') + (rows.length > n ? `\n    … +${rows.length - n} more` : '');

  if (teleports.length === 0) console.log('OK: teleport detector — no within-beat position discontinuities.');
  else { console.error(`FAIL: ${teleports.length} teleport(s) — a dot/ball jumped > ${TELEPORT_PX}px within a beat:`); console.error(show(teleports)); }

  if (exclusivity.length === 0) console.log('OK: channel exclusivity — no Placed driven by two animators.');
  else { console.error(`FAIL: ${exclusivity.length} exclusivity violation(s):`); console.error(show(exclusivity)); }

  if (carrierMisses.length === 0) console.log('OK: carrier contact — every carry ended on the ball.');
  else { console.warn(`WARN: ${carrierMisses.length} carry beat(s) where the carrier ended > ${CONTACT_PX}px off the ball (may be a mid-glide sample):`); console.warn(show(carrierMisses)); }

  return teleports.length > 0 || exclusivity.length > 0;
}

// Standalone: re-analyse the last capture.
if (import.meta.url === `file://${process.argv[1]}`) {
  let trace;
  try {
    trace = JSON.parse(readFileSync('harness/trace.json', 'utf8'));
  } catch {
    console.error('No harness/trace.json — run `npm run probe` first.');
    process.exit(2);
  }
  const failed = reportTrace(analyzeTrace(trace));
  process.exit(failed ? 1 : 0);
}
