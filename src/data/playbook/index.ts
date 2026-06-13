// The initial play library (Upgrade.md § 7.1; WP6) — content, not tuning. Each
// play is a named set move authored in attack-oriented, mark-relative coordinates
// (see ./types.ts) so it mirrors anywhere on the pitch via playPointToPitch.
//
// These seed values are rugby-plausible starting points; the intended workflow is
// to refine them in the Phase Animator's play editor ("Play editor" mode) and
// re-export here. Waypoint `t` is a micro-tick offset (10 Hz) within the play's
// lifetime; pass/receive actions are timed to the ball arriving as the receiver
// runs onto it (the WP5 run-onto-the-ball mechanic).
//
// Role names are descriptive; `slot` binds each to a matchday slot (1–15). The
// play editor lets the author choose which players take part, exactly like the
// shape-editor roster subset.

import type { Play } from './types';

export const PLAYBOOK: Play[] = [
  {
    id: 'switch',
    name: 'Switch (scissors)',
    origin: 'ruck',
    lifetimeTicks: 18,
    trigger: { phases: ['FirstPhase', 'PhasePlay'], channels: ['mid', 'wide'] },
    roles: {
      // First receiver carries across the front, sells the angle, slips it back.
      firstReceiver: {
        slot: 10,
        line: [{ t: 0, fwd: -5, lat: 8 }, { t: 6, fwd: -1, lat: 5 }, { t: 10, fwd: 3, lat: 3 }],
        actions: [{ t: 8, do: 'pass', to: 'strike' }],
      },
      // Strike runner cuts back UNDER him against the grain and hits the gap.
      strike: {
        slot: 12,
        line: [{ t: 0, fwd: -7, lat: 18 }, { t: 6, fwd: -3, lat: 9 }, { t: 8, fwd: 0, lat: 5 }, { t: 16, fwd: 9, lat: 4 }],
        actions: [{ t: 8, do: 'receive' }, { t: 9, do: 'carry' }],
      },
    },
    abort: ['turnover', 'intercept_risk', 'receiver_covered'],
  },
  {
    id: 'miss-2-blocker',
    name: 'Miss-2 + blocker',
    origin: 'ruck',
    lifetimeTicks: 18,
    trigger: { phases: ['FirstPhase', 'PhasePlay'], channels: ['wide'], minSpaceWide: 28 },
    roles: {
      // First receiver throws the long miss pass, skipping the next two runners.
      firstReceiver: {
        slot: 10,
        line: [{ t: 0, fwd: -5, lat: 6 }, { t: 5, fwd: -3, lat: 5 }],
        actions: [{ t: 5, do: 'pass', to: 'strike' }],
      },
      // Blocker runs a hard straight line to fix the inside defender (a decoy).
      blocker: {
        slot: 12,
        line: [{ t: 0, fwd: -6, lat: 14 }, { t: 8, fwd: 2, lat: 14 }],
        actions: [{ t: 4, do: 'dummy' }],
      },
      // Strike receiver hits the miss pass at pace in the wide channel.
      strike: {
        slot: 13,
        line: [{ t: 0, fwd: -8, lat: 30 }, { t: 5, fwd: -4, lat: 26 }, { t: 14, fwd: 6, lat: 24 }],
        actions: [{ t: 5, do: 'receive' }, { t: 6, do: 'carry' }],
      },
    },
    abort: ['turnover', 'intercept_risk', 'receiver_covered'],
  },
  {
    id: 'loop',
    name: 'Loop',
    origin: 'ruck',
    lifetimeTicks: 20,
    trigger: { phases: ['FirstPhase', 'PhasePlay'], channels: ['mid', 'wide'] },
    roles: {
      // First receiver passes, then loops AROUND the link to take it back wide.
      firstReceiver: {
        slot: 10,
        line: [{ t: 0, fwd: -5, lat: 8 }, { t: 4, fwd: -3, lat: 10 }, { t: 12, fwd: -1, lat: 18 }, { t: 18, fwd: 5, lat: 20 }],
        actions: [{ t: 4, do: 'pass', to: 'link' }, { t: 13, do: 'receive' }, { t: 14, do: 'carry' }],
      },
      // Link holds the ball briefly and pops it back to the looping runner.
      link: {
        slot: 12,
        line: [{ t: 0, fwd: -7, lat: 16 }, { t: 4, fwd: -5, lat: 15 }, { t: 12, fwd: -2, lat: 14 }],
        actions: [{ t: 4, do: 'receive' }, { t: 12, do: 'pass', to: 'firstReceiver' }],
      },
    },
    abort: ['turnover', 'intercept_risk', 'receiver_covered'],
  },
  {
    id: 'crash-tip',
    name: 'Crash + tip-on',
    origin: 'ruck',
    lifetimeTicks: 16,
    trigger: { phases: ['FirstPhase', 'PhasePlay'], channels: ['tight', 'mid'] },
    roles: {
      // Crash runner takes a short ball into contact and tips it out the back.
      crash: {
        slot: 12,
        line: [{ t: 0, fwd: -3, lat: 6 }, { t: 3, fwd: 0, lat: 6 }, { t: 9, fwd: 4, lat: 6 }],
        actions: [{ t: 3, do: 'receive' }, { t: 4, do: 'carry' }, { t: 8, do: 'pass', to: 'link' }],
      },
      // Forward runner latches just behind for the tip-on through the gap.
      link: {
        slot: 8,
        line: [{ t: 0, fwd: -5, lat: 11 }, { t: 8, fwd: 2, lat: 8 }, { t: 14, fwd: 7, lat: 7 }],
        actions: [{ t: 9, do: 'receive' }, { t: 10, do: 'carry' }],
      },
    },
    abort: ['turnover', 'receiver_covered'],
  },
  {
    id: 'dummy-switch',
    name: 'Dummy switch',
    origin: 'ruck',
    lifetimeTicks: 18,
    trigger: { phases: ['FirstPhase', 'PhasePlay'], channels: ['mid'] },
    roles: {
      // First receiver shapes the switch, holds it, and bursts through himself.
      firstReceiver: {
        slot: 10,
        line: [{ t: 0, fwd: -5, lat: 8 }, { t: 6, fwd: -1, lat: 6 }, { t: 16, fwd: 9, lat: 7 }],
        actions: [{ t: 6, do: 'dummy', to: 'decoy' }, { t: 7, do: 'carry' }],
      },
      // Decoy runs the full scissors line to drag his marker across.
      decoy: {
        slot: 12,
        line: [{ t: 0, fwd: -7, lat: 18 }, { t: 6, fwd: -2, lat: 9 }, { t: 12, fwd: 2, lat: 4 }],
      },
    },
    abort: ['turnover', 'receiver_covered'],
  },
];

// Lookup by id (selection layer + editor round-trip).
export function playById(id: string): Play | undefined {
  return PLAYBOOK.find(p => p.id === id);
}
