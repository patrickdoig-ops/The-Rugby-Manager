// Determinism golden-master harness.
//
// Runs a fixed (seed, home, away) match through MatchCoordinator twice and
// asserts the two snapshots produce identical SHA-256 hashes. The snapshot
// covers both the commentary log (state.events) and per-player matchStats
// from every player who took the field on either side. The wider snapshot
// catches regressions that corrupt a stat counter without changing the
// final score (e.g. a kicker's kicksMade off by one).
//
// Exit 0 = deterministic. Exit 1 = RNG-order regression — investigate before
// committing.
//
// Drives an unmodified MatchCoordinator: subscribes to engine:paused and
// auto-resolves the kickoff-strategy, penalty-choice, and forced-substitution
// modals with fixed defaults, then waits for engine:finished. No engine
// changes required.

import { createHash } from 'node:crypto';
import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import { eventBus } from '../src/utils/eventBus.js';
import { applyStarBoost } from '../src/team/applyStarBoost.js';
import type { TeamJson } from '../src/team/teamProfile.js';
import bathRaw from '../src/data/team-bath.json' with { type: 'json' };
import saracensRaw from '../src/data/team-saracens.json' with { type: 'json' };

const SEED = 0xDEADBEEF;
const HOME = applyStarBoost(bathRaw as unknown as TeamJson) as unknown as RawTeamInput;
const AWAY = applyStarBoost(saracensRaw as unknown as TeamJson) as unknown as RawTeamInput;

function runOnce(seed: number): Promise<string> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(HOME, AWAY, { tickDelayMs: 0, seed });

    const offPaused = eventBus.on('engine:paused', ({ payload }) => {
      if (payload.type === 'kickoff_choice') payload.onChoice('high_ball');
      else if (payload.type === 'penalty_choice') payload.onChoice('kick_for_goal');
      else if (payload.type === 'forced_substitution_choice') {
        // Stable, RNG-free auto-pick: walk a like-for-like position fallback
        // chain, then position-group, else the first bench player. Mirrors
        // the engine's silent / AI-side `pickAutoReplacement` so both sides
        // resolve identically. Covers red_20 expirations AND in-match
        // injury forced subs on the home (human) side without stalling the
        // harness.
        type Pos = typeof payload.sentOff.position;
        const FALLBACK: Record<Pos, Pos[]> = {
          'Prop':         ['Prop', 'Hooker'],
          'Hooker':       ['Hooker', 'Prop'],
          'Lock':         ['Lock', 'Number 8', 'Flanker', 'Back Row'],
          'Flanker':      ['Flanker', 'Number 8', 'Back Row', 'Lock'],
          'Number 8':     ['Number 8', 'Flanker', 'Back Row', 'Lock'],
          'Back Row':     ['Back Row', 'Flanker', 'Number 8', 'Lock'],
          'Scrum-Half':   ['Scrum-Half', 'Fly-Half', 'Utility Back'],
          'Fly-Half':     ['Fly-Half', 'Utility Back', 'Centre', 'Scrum-Half'],
          'Centre':       ['Centre', 'Utility Back', 'Fly-Half', 'Fullback', 'Wing'],
          'Wing':         ['Wing', 'Fullback', 'Utility Back', 'Centre'],
          'Fullback':     ['Fullback', 'Wing', 'Utility Back', 'Centre'],
          'Utility Back': ['Utility Back', 'Centre', 'Fullback', 'Fly-Half', 'Wing'],
        };
        const off = payload.sentOff;
        let pick = null as null | typeof payload.bench[number];
        for (const pos of FALLBACK[off.position]) {
          const m = payload.bench.find(p => p.position === pos);
          if (m) { pick = m; break; }
        }
        if (!pick) {
          const fwd = (pos: Pos): boolean =>
            pos === 'Prop' || pos === 'Hooker' || pos === 'Lock' ||
            pos === 'Flanker' || pos === 'Number 8' || pos === 'Back Row';
          pick = payload.bench.find(p => fwd(p.position) === fwd(off.position)) ?? payload.bench[0] ?? null;
        }
        payload.onChoice(pick?.squadNumber ?? null);
      }
    });

    // Half-time auto-pause is a UI affordance — the harness immediately
    // restarts the engine so we run straight through to full-time.
    const offAutoPaused = eventBus.on('engine:autoPaused', () => {
      engine.start();
    });

    const offFinished = eventBus.on('engine:finished', () => {
      offPaused();
      offAutoPaused();
      offFinished();
      const state = engine.getState();
      const snapshot = {
        events:     state.events,
        homeStats:  state.homeTeam.players.map(p => p.matchStats),
        awayStats:  state.awayTeam.players.map(p => p.matchStats),
        homeSubbed: state.homeTeam.substitutedOff.map(p => p.matchStats),
        awaySubbed: state.awayTeam.substitutedOff.map(p => p.matchStats),
      };
      const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
      engine.destroy();
      resolve(hash);
    });

    engine.initialize();
    engine.start();
  });
}

const h1 = await runOnce(SEED);
const h2 = await runOnce(SEED);
if (h1 !== h2) {
  console.error(`DETERMINISM BROKEN\n  run1: ${h1}\n  run2: ${h2}`);
  process.exit(1);
}
console.log(`OK: deterministic. seed=0x${SEED.toString(16)} hash=${h1.slice(0, 16)}…`);
