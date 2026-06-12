// Self-contained headless capture of the 2D pitch animation. Spawns the Vite dev
// server, loads the real PitchView (pitch-probe.html → scripts/pitchProbe.ts)
// against a real match in headless Chromium, screenshots set-piece / first-phase
// / kick-off beats mid-animation, and dumps a frame-by-frame trace.
//
//   npm run probe                 # default: capture to harness/, then exit
//   PROBE_PORT=5180 npm run probe  # override the dev-server port
//
// Chromium is @sparticuz/chromium (binary ships in the npm package) driven by
// puppeteer-core — the Playwright CDN is blocked in CI/cloud sandboxes, but the
// npm registry is allowed, so this combination installs anywhere. Output:
//   harness/trace.json            # { beats, frames, shots }
//   harness/shot-<label>-<n>.png  # mid-animation screenshots
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { analyzeTrace, reportTrace } from './checkProbeTrace.mjs';

const PORT = process.env.PROBE_PORT || '5179';
const BASE = `http://127.0.0.1:${PORT}/The-Rugby-Manager/pitch-probe.html`;
const OUT = 'harness';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};

// 1. Reuse an already-running dev server if the probe page answers; otherwise
//    spawn our own Vite and tear it down on exit. (Reusing a running `npm run
//    dev` is handy, and some sandboxes disallow spawning a server subprocess.)
let vite = null;
const shutdown = () => { if (vite) { try { vite.kill('SIGTERM'); } catch { /* gone */ } } };
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(1); });

if (!(await isUp())) {
  vite = spawn('npx', ['vite', '--port', PORT, '--host', '127.0.0.1', '--clearScreen', 'false'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let up = false;
  for (let i = 0; i < 100 && !up; i++) { await sleep(200); up = await isUp(); }
  if (!up) { shutdown(); throw new Error(`Vite did not come up on ${PORT} within 20s`); }
} else {
  console.log(`reusing dev server already on ${PORT}`);
  console.log('  ⚠  reused server may serve a STALE bundle — if you edited src/, kill ALL vite');
  console.log('     (pkill -9 -f vite) before trusting this run. See CLAUDE.md § probe.');
}

// 2. Launch headless Chromium and load the probe.
let browser;
try {
  browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
    executablePath: await chromium.executablePath(),
    headless: true,
  });
} catch (e) {
  shutdown();
  console.error('Failed to launch Chromium. Ensure deps are installed (`npm i`); the probe uses');
  console.error('@sparticuz/chromium + puppeteer-core (registry-hosted).');
  throw e;
}
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 600, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction('window.__probe && window.__probe.beats.length > 0', { timeout: 30000 });

// 3. Poll for beats of interest; screenshot ~350ms in (mid-animation).
const stage = await page.$('#stage');
const wanted = {
  scrum: 1, lineout: 1, 'firstphase-from-scrum': 1, 'firstphase-from-lineout': 2,
  'kickoff-home': 1, 'kickoff-away': 1,
};
const taken = {};
const shots = [];
let seen = 0;
const deadline = Date.now() + 90000;

while (Date.now() < deadline) {
  const interesting = await page.evaluate('window.__probe.interesting');
  const done = await page.evaluate('window.__probe.done');
  for (let i = seen; i < interesting.length; i++) {
    const it = interesting[i];
    const cnt = taken[it.label] || 0;
    if ((wanted[it.label] || 0) > cnt) {
      await sleep(350);
      const file = `${OUT}/shot-${it.label}-${cnt + 1}.png`;
      await stage.screenshot({ path: file });
      taken[it.label] = cnt + 1;
      shots.push({ ...it, file });
      console.log('shot:', file, `(beat ${it.idx})`);
    }
  }
  seen = interesting.length;
  const enough = Object.keys(wanted).every((k) => (taken[k] || 0) >= wanted[k]);
  if (enough || done) break;
  await sleep(120);
}

// 4. Dump the trace and tear down.
const beats = await page.evaluate('window.__probe.beats');
const frames = await page.evaluate('window.__probe.frames');
const exclusivity = await page.evaluate('window.__probe.exclusivity');
writeFileSync(`${OUT}/trace.json`, JSON.stringify({ beats, frames, exclusivity, shots }, null, 2));
console.log(`\nbeats=${beats.length} frames=${frames.length} shots=${shots.length}`);
console.log('phases seen:', [...new Set(beats.map((b) => b.phase))].join(', '));

await browser.close();
shutdown();

// 5. Sync assertions over the captured trace (WP6.2).
console.log('');
const assertionsFailed = reportTrace(analyzeTrace({ beats, frames, exclusivity }));

// Exit non-zero if a sync assertion failed OR we didn't capture every wanted shot, so a
// CI/automation caller can tell a clean run from a regression or a partial (slow) capture.
const missedShots = Object.keys(wanted).filter((k) => (taken[k] || 0) < wanted[k]);
if (missedShots.length) console.error(`incomplete capture — missing shots: ${missedShots.join(', ')}`);
process.exit(assertionsFailed || missedShots.length ? 1 : 0);
